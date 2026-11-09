"""
Authentication module for AI Cloud Cost Detective.

Provides:
- Password hashing and verification using bcrypt
- JWT token generation and validation using PyJWT
- FastAPI dependencies for token authentication
"""

from datetime import datetime, timedelta, timezone
import logging
import os
from typing import Any, Dict, Optional

import bcrypt
from dotenv import load_dotenv
from fastapi import Header, HTTPException, status
import jwt

# Load environment variables
load_dotenv()

logger = logging.getLogger("ai_cloud_cost_detective.auth")

JWT_SECRET = os.getenv("JWT_SECRET", "super_secret_jwt_key_change_in_production_12345")
JWT_ALGORITHM = "HS256"
JWT_EXPIRATION_HOURS = 24 * 7  # 7 days


# ---------------------------------------------------------------------------
# Password Utilities (bcrypt)
# ---------------------------------------------------------------------------

def hash_password(password: str) -> str:
    """Hash plain password using bcrypt."""
    pwd_bytes = password.encode("utf-8")
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(pwd_bytes, salt).decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify plain password against hashed password."""
    try:
        return bcrypt.checkpw(
            plain_password.encode("utf-8"),
            hashed_password.encode("utf-8")
        )
    except Exception as err:
        logger.warning(f"Error checking password: {err}")
        return False


# ---------------------------------------------------------------------------
# JWT Utilities (PyJWT)
# ---------------------------------------------------------------------------

def create_access_token(
    data: Dict[str, Any],
    expires_delta: Optional[timedelta] = None
) -> str:
    """Generate a signed JWT access token."""
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (expires_delta or timedelta(hours=JWT_EXPIRATION_HOURS))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, JWT_SECRET, algorithm=JWT_ALGORITHM)


def decode_access_token(token: str) -> Dict[str, Any]:
    """Decode and validate a JWT access token."""
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError as err:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication token has expired. Please log in again."
        ) from err
    except jwt.PyJWTError as err:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication token."
        ) from err


# ---------------------------------------------------------------------------
# FastAPI Auth Dependencies
# ---------------------------------------------------------------------------

def get_current_user_optional(
    authorization: Optional[str] = Header(None)
) -> Optional[Dict[str, Any]]:
    """
    Extract user from Bearer token if provided. Returns None if unauthenticated.
    """
    if not authorization:
        return None

    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token:
        return None

    try:
        payload = decode_access_token(token)
        return {
            "id": payload.get("sub"),
            "email": payload.get("email")
        }
    except HTTPException:
        return None


def get_current_user(
    authorization: Optional[str] = Header(None)
) -> Dict[str, Any]:
    """
    Enforces valid Bearer token authentication.
    """
    if not authorization:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authorization header missing. Please log in."
        )

    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authorization header format. Expected 'Bearer <token>'."
        )

    payload = decode_access_token(token)
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token payload: missing subject."
        )

    return {
        "id": int(user_id) if str(user_id).isdigit() else user_id,
        "email": payload.get("email")
    }
