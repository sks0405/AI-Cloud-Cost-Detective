"""
Database module for AI Cloud Cost Detective.

Manages connection to AWS Managed PostgreSQL using asyncpg:
- Connection pool lifecycle management
- Table creation for 'users' and 'analyses'
- Saving cost analysis results
- Retrieving analysis history
- In-memory fallback for offline development/testing
"""

import datetime
import json
import logging
import os
from typing import Any, Dict, List, Optional

import asyncpg
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

logger = logging.getLogger("ai_cloud_cost_detective.db")

DATABASE_URL = os.getenv("DATABASE_URL")

# Global asyncpg connection pool
_pool: Optional[asyncpg.Pool] = None

# In-memory storage fallback for local development or testing when DB is unavailable
_in_memory_analyses: List[Dict[str, Any]] = []
_in_memory_users: List[Dict[str, Any]] = []
_in_memory_id_counter = 1


# ---------------------------------------------------------------------------
# Database Initialization & Lifecycle
# ---------------------------------------------------------------------------

CREATE_USERS_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
"""

CREATE_ANALYSES_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS analyses (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id) ON DELETE SET NULL,
    resource_group TEXT NOT NULL,
    resources_scanned INT NOT NULL DEFAULT 0,
    issues_found INT NOT NULL DEFAULT 0,
    estimated_savings TEXT,
    analysis_result JSONB,
    status TEXT NOT NULL DEFAULT 'completed',
    created_at TIMESTAMPTZ DEFAULT NOW()
);
"""


async def init_db() -> bool:
    """
    Initialize database connection pool and create tables if they do not exist.
    Falls back gracefully if database connection is unreachable or not configured.
    """
    global _pool

    db_url = os.getenv("DATABASE_URL")
    if not db_url or "your-aws-rds-endpoint" in db_url or db_url == "postgresql://...":
        logger.warning(
            "DATABASE_URL is not configured with a live PostgreSQL host. "
            "Using in-memory storage fallback for analysis history."
        )
        return False

    try:
        # Create connection pool
        _pool = await asyncpg.create_pool(
            dsn=db_url,
            min_size=1,
            max_size=10,
            command_timeout=30
        )

        async with _pool.acquire() as conn:
            # Create tables
            await conn.execute(CREATE_USERS_TABLE_SQL)
            await conn.execute(CREATE_ANALYSES_TABLE_SQL)

        logger.info("Successfully connected to AWS Managed PostgreSQL and initialized tables.")
        return True
    except Exception as err:
        logger.warning(
            f"Could not connect to PostgreSQL database ({err}). "
            "Falling back to in-memory store for local testing."
        )
        _pool = None
        return False


async def close_db():
    """Close the database connection pool."""
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None
        logger.info("Closed PostgreSQL connection pool.")


def is_db_connected() -> bool:
    """Check if the PostgreSQL connection pool is active."""
    return _pool is not None


# ---------------------------------------------------------------------------
# Analysis History Operations
# ---------------------------------------------------------------------------

async def save_analysis(
    resource_group: str,
    resources_scanned: int,
    issues_found: int,
    estimated_savings: str,
    analysis_result: Dict[str, Any],
    user_id: Optional[int] = None,
    status: str = "completed"
) -> Dict[str, Any]:
    """
    Save full analysis result into the 'analyses' table.
    """
    global _in_memory_id_counter

    # Ensure JSON serializable
    json_result = json.dumps(analysis_result)

    if _pool is not None:
        try:
            query = """
            INSERT INTO analyses (
                user_id, resource_group, resources_scanned, issues_found,
                estimated_savings, analysis_result, status
            )
            VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)
            RETURNING id, user_id, resource_group, resources_scanned, issues_found,
                      estimated_savings, analysis_result, status, created_at;
            """
            async with _pool.acquire() as conn:
                row = await conn.fetchrow(
                    query,
                    user_id,
                    resource_group,
                    resources_scanned,
                    issues_found,
                    estimated_savings,
                    json_result,
                    status
                )
                if row:
                    res = dict(row)
                    # Convert json string or dict
                    if isinstance(res.get("analysis_result"), str):
                        res["analysis_result"] = json.loads(res["analysis_result"])
                    return res
        except Exception as err:
            logger.error(f"Failed to persist analysis to PostgreSQL: {err}. Storing in memory fallback.")

    # Fallback to in-memory storage
    record = {
        "id": _in_memory_id_counter,
        "user_id": user_id,
        "resource_group": resource_group,
        "resources_scanned": resources_scanned,
        "issues_found": issues_found,
        "estimated_savings": estimated_savings,
        "analysis_result": analysis_result,
        "status": status,
        "created_at": datetime.datetime.now(datetime.timezone.utc).isoformat()
    }
    _in_memory_id_counter += 1
    _in_memory_analyses.insert(0, record)
    return record


async def get_history(
    user_id: Optional[int] = None,
    limit: int = 50
) -> List[Dict[str, Any]]:
    """
    Retrieve past analyses ordered by created_at descending.
    If user_id is provided, filters by that user.
    """
    if _pool is not None:
        try:
            if user_id is not None:
                query = """
                SELECT id, user_id, resource_group, resources_scanned, issues_found,
                       estimated_savings, analysis_result, status, created_at
                FROM analyses
                WHERE user_id = $1
                ORDER BY created_at DESC
                LIMIT $2;
                """
                async with _pool.acquire() as conn:
                    rows = await conn.fetch(query, user_id, limit)
            else:
                query = """
                SELECT id, user_id, resource_group, resources_scanned, issues_found,
                       estimated_savings, analysis_result, status, created_at
                FROM analyses
                ORDER BY created_at DESC
                LIMIT $1;
                """
                async with _pool.acquire() as conn:
                    rows = await conn.fetch(query, limit)

            history = []
            for row in rows:
                item = dict(row)
                if isinstance(item.get("analysis_result"), str):
                    try:
                        item["analysis_result"] = json.loads(item["analysis_result"])
                    except Exception:
                        pass
                if isinstance(item.get("created_at"), datetime.datetime):
                    item["created_at"] = item["created_at"].isoformat()
                history.append(item)
            return history
        except Exception as err:
            logger.error(f"Failed to query PostgreSQL history: {err}. Using in-memory fallback.")

    # In-memory fallback
    if user_id is not None:
        filtered = [a for a in _in_memory_analyses if a.get("user_id") == user_id]
        return filtered[:limit]
    return _in_memory_analyses[:limit]


# ---------------------------------------------------------------------------
# User Operations (Foundation for Auth)
# ---------------------------------------------------------------------------

async def create_user(email: str, password_hash: str) -> Dict[str, Any]:
    """Create a new user."""
    global _in_memory_id_counter
    if _pool is not None:
        query = """
        INSERT INTO users (email, password_hash)
        VALUES ($1, $2)
        RETURNING id, email, password_hash, created_at;
        """
        async with _pool.acquire() as conn:
            row = await conn.fetchrow(query, email, password_hash)
            return dict(row)

    user = {
        "id": _in_memory_id_counter,
        "email": email,
        "password_hash": password_hash,
        "created_at": datetime.datetime.now(datetime.timezone.utc).isoformat()
    }
    _in_memory_id_counter += 1
    _in_memory_users.append(user)
    return user


async def get_user_by_email(email: str) -> Optional[Dict[str, Any]]:
    """Retrieve user by email."""
    if _pool is not None:
        query = "SELECT id, email, password_hash, created_at FROM users WHERE email = $1;"
        async with _pool.acquire() as conn:
            row = await conn.fetchrow(query, email)
            return dict(row) if row else None

    for u in _in_memory_users:
        if u.get("email") == email:
            return u
    return None
