"""
Main FastAPI application for AI Cloud Cost Detective.

Provides:
- GET  /api/resource-groups: Returns the list of AWS resource groups.
- POST /api/analyze: Fetches resources, performs AI cost analysis, pushes live WebSocket progress, and stores result in PostgreSQL.
- GET  /api/history: Returns past analyses from database.
- WS   /ws/progress/{analysis_id}: Live progress tracking for active analysis.
- CORS enabled for http://localhost:5173.
"""

from collections import defaultdict
from contextlib import asynccontextmanager
import logging
from typing import Any, Dict, List, Optional
import uuid

from fastapi import Depends, FastAPI, HTTPException, WebSocket, WebSocketDisconnect, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

import ai_analyzer
from ai_analyzer import (
    AIAnalyzerError,
    OpenAIKeyMissingError,
    OpenAIServiceError,
)
import auth
import aws_scanner
from aws_scanner import (
    AWSAuthError,
    AWSCLINotInstalledError,
    AWSScannerError,
    ResourceGroupNotFoundError,
)
import db

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("ai_cloud_cost_detective")


# ---------------------------------------------------------------------------
# WebSocket Progress Connection Manager
# ---------------------------------------------------------------------------

class ProgressConnectionManager:
    """Manages active WebSocket connections for live analysis progress updates."""

    def __init__(self):
        self.active_connections: Dict[str, List[WebSocket]] = defaultdict(list)
        self.history: Dict[str, List[str]] = defaultdict(list)

    async def connect(self, analysis_id: str, websocket: WebSocket):
        await websocket.accept()
        self.active_connections[analysis_id].append(websocket)
        logger.info(f"WebSocket client connected to progress channel: {analysis_id}")

        # Replay any previous progress messages for late-connecting clients
        for msg in self.history.get(analysis_id, []):
            try:
                await websocket.send_text(msg)
            except Exception:
                pass

    def disconnect(self, analysis_id: str, websocket: WebSocket):
        if analysis_id in self.active_connections:
            if websocket in self.active_connections[analysis_id]:
                self.active_connections[analysis_id].remove(websocket)
            if not self.active_connections[analysis_id]:
                del self.active_connections[analysis_id]
        logger.info(f"WebSocket client disconnected from channel: {analysis_id}")

    async def broadcast(self, analysis_id: str, message: str):
        self.history[analysis_id].append(message)
        connections = list(self.active_connections.get(analysis_id, []))
        for conn in connections:
            try:
                await conn.send_text(message)
            except Exception:
                self.disconnect(analysis_id, conn)


progress_manager = ProgressConnectionManager()


# ---------------------------------------------------------------------------
# Application Lifespan
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifecycle manager: initializes database on startup and closes connections on shutdown."""
    logger.info("Initializing database connection and tables...")
    await db.init_db()
    yield
    logger.info("Closing database connections...")
    await db.close_db()


app = FastAPI(
    title="AI Cloud Cost Detective API",
    description="Backend API for scanning AWS resources, live WebSocket tracking, and cost investigations.",
    version="1.0.0",
    lifespan=lifespan,
)

# Enable CORS for frontend development server
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Request and Response Models
# ---------------------------------------------------------------------------

class AuthRequest(BaseModel):
    email: str = Field(..., description="User email address", examples=["user@example.com"])
    password: str = Field(..., description="User password", min_length=6, examples=["secret123"])


class AuthResponse(BaseModel):
    access_token: str = Field(..., description="JWT Bearer access token")
    token_type: str = Field("bearer", description="Token type")
    user: Dict[str, Any] = Field(..., description="User profile details")


class AnalyzeRequest(BaseModel):
    resource_group: str = Field(
        ...,
        description="Name of the AWS resource group to analyze",
        examples=["my-ec2-dev-resource-group"]
    )
    analysis_id: Optional[str] = Field(
        None,
        description="Optional tracking ID for WebSocket progress (defaults to a generated UUID)"
    )
    user_id: Optional[int] = Field(
        None,
        description="Optional user ID for storing analysis history"
    )


class ResourceItem(BaseModel):
    resource_type: str = Field(..., description="AWS resource type, e.g. AWS::EC2::Instance")
    type: str = Field(..., description="Alias for resource_type")
    name: str = Field(..., description="Resource name or ID")
    location: str = Field(..., description="AWS Region or global")
    sku: str = Field(..., description="Resource SKU, instance type, or tier")
    tags: Dict[str, str] = Field(default_factory=dict, description="Resource tags")
    arn: str = Field(..., description="Full Amazon Resource Name (ARN)")


class IssueItem(BaseModel):
    resource_name: str = Field(..., description="Name or ID of the affected resource")
    resource_type: str = Field(..., description="AWS resource type")
    issue_type: str = Field(..., description="Category of issue: over-provisioned, unused, misconfigured, etc.")
    severity: str = Field(..., description="Severity level: high, medium, or low")
    explanation: str = Field(..., description="Explanation of why this costs extra money")
    recommendation: str = Field(..., description="Recommended remediation action")
    fix_command: str = Field(..., description="Actionable AWS CLI fix command")


class AnalyzeResponse(BaseModel):
    id: Optional[int] = Field(None, description="Database record ID from analyses table")
    analysis_id: str = Field(..., description="Tracking ID used for WebSocket progress")
    resource_group: str
    total_resources: int
    resources: List[Dict[str, Any]]
    summary: str = Field(..., description="Executive summary of AI analysis")
    estimated_savings: str = Field(..., description="Estimated cost savings (e.g. $120.00/month)")
    issues: List[Dict[str, Any]] = Field(default_factory=list, description="List of cost issues found")
    actionable_fix_commands: List[str] = Field(default_factory=list, description="List of AWS CLI fix commands")
    analysis: Dict[str, Any] = Field(default_factory=dict, description="Complete AI analysis object")


class ResourceGroupsResponse(BaseModel):
    resource_groups: List[str]


# ---------------------------------------------------------------------------
# API Endpoints
# ---------------------------------------------------------------------------

@app.get("/", tags=["Health"])
def root():
    """Root status endpoint."""
    return {
        "service": "AI Cloud Cost Detective API",
        "status": "online",
        "version": "1.0.0"
    }


@app.get("/health", tags=["Health"])
def health_check():
    """Health check endpoint."""
    return {
        "status": "healthy",
        "database_connected": db.is_db_connected()
    }


# ---------------------------------------------------------------------------
# Auth Endpoints
# ---------------------------------------------------------------------------

@app.post(
    "/api/auth/signup",
    response_model=AuthResponse,
    summary="User Registration",
    tags=["Auth"]
)
async def signup(payload: AuthRequest):
    """
    Registers a new user:
    - Validates email and password
    - Hashes password with bcrypt
    - Stores credentials in users table
    - Returns JWT access token
    """
    email = payload.email.strip().lower()
    if not email or "@" not in email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A valid email address is required."
        )

    existing = await db.get_user_by_email(email)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="An account with this email address already exists."
        )

    hashed_pw = auth.hash_password(payload.password)
    user = await db.create_user(email=email, password_hash=hashed_pw)

    token = auth.create_access_token({
        "sub": str(user["id"]),
        "email": user["email"]
    })

    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {
            "id": user["id"],
            "email": user["email"]
        }
    }


@app.post(
    "/api/auth/login",
    response_model=AuthResponse,
    summary="User Login",
    tags=["Auth"]
)
async def login(payload: AuthRequest):
    """
    Validates user credentials and returns JWT access token.
    """
    email = payload.email.strip().lower()
    user = await db.get_user_by_email(email)
    if not user or not auth.verify_password(payload.password, user.get("password_hash", "")):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password."
        )

    token = auth.create_access_token({
        "sub": str(user["id"]),
        "email": user["email"]
    })

    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {
            "id": user["id"],
            "email": user["email"]
        }
    }


@app.websocket("/ws/progress/{analysis_id}")
async def websocket_progress(websocket: WebSocket, analysis_id: str):
    """
    WebSocket endpoint for live analysis progress streaming.
    Clients connect to ws://localhost:8000/ws/progress/{analysis_id}.
    """
    await progress_manager.connect(analysis_id, websocket)
    try:
        while True:
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        progress_manager.disconnect(analysis_id, websocket)
    except Exception as e:
        logger.warning(f"WebSocket error on channel {analysis_id}: {e}")
        progress_manager.disconnect(analysis_id, websocket)


@app.get(
    "/api/resource-groups",
    response_model=ResourceGroupsResponse,
    summary="List AWS Resource Groups",
    tags=["Resource Groups"]
)
def get_resource_groups(
    current_user: Dict[str, Any] = Depends(auth.get_current_user)
):
    """
    Returns the list of AWS resource groups.
    Runs: aws resource-groups list-groups --output json
    """
    try:
        groups = aws_scanner.list_resource_groups()
        return {"resource_groups": groups}
    except AWSCLINotInstalledError as err:
        logger.error(f"AWS CLI not installed: {err}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(err)
        ) from err
    except AWSAuthError as err:
        logger.error(f"AWS authentication failure: {err}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(err)
        ) from err
    except AWSScannerError as err:
        logger.error(f"AWS scanner error: {err}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(err)
        ) from err
    except Exception as err:
        logger.exception("Unexpected error listing resource groups")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"An unexpected error occurred while listing resource groups: {str(err)}"
        ) from err


@app.post(
    "/api/analyze",
    response_model=AnalyzeResponse,
    summary="Analyze AWS Resource Group with AI and Live Progress",
    tags=["Analysis"]
)
async def analyze(
    payload: AnalyzeRequest,
    current_user: Dict[str, Any] = Depends(auth.get_current_user)
):
    """
    Performs cost analysis on an AWS Resource Group:
    1. Emits progress: "Fetching resource groups..."
    2. Emits progress: "Scanning resources in <rg>..." and fetches resources via aws_scanner
    3. Emits progress: "Analyzing costs with AI..." and analyzes with OpenAI (gpt-4o)
    4. Emits progress: "Storing results..." and records in AWS Managed PostgreSQL
    5. Emits progress: "Analysis complete" and returns full structured response
    """
    rg_name = payload.resource_group.strip()
    if not rg_name:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The 'resource_group' field cannot be empty."
        )

    analysis_id = payload.analysis_id or str(uuid.uuid4())
    effective_user_id = payload.user_id or current_user["id"]

    async def push_progress(msg: str):
        await progress_manager.broadcast(analysis_id, msg)
        if analysis_id != rg_name:
            await progress_manager.broadcast(rg_name, msg)

    # Stage 1: Fetching resource groups
    await push_progress("Fetching resource groups...")

    # Stage 2: Scanning resources in <rg>...
    await push_progress(f"Scanning resources in {rg_name}...")
    try:
        resources = aws_scanner.get_resources_in_group(rg_name)
    except ResourceGroupNotFoundError as err:
        logger.warning(f"Resource group not found: {err}")
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Resource group '{rg_name}' was not found. Please verify the group name."
        ) from err
    except AWSCLINotInstalledError as err:
        logger.error(f"AWS CLI not installed: {err}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(err)
        ) from err
    except AWSAuthError as err:
        logger.error(f"AWS authentication failure: {err}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(err)
        ) from err
    except AWSScannerError as err:
        logger.error(f"AWS scanner error: {err}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(err)
        ) from err
    except Exception as err:
        logger.exception("Unexpected error scanning resource group")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"An unexpected error occurred while scanning the resource group: {str(err)}"
        ) from err

    # Stage 3: Analyzing costs with AI...
    await push_progress("Analyzing costs with AI...")
    try:
        ai_result = ai_analyzer.analyze_resources(resources)
    except OpenAIKeyMissingError as err:
        logger.error(f"OpenAI key missing: {err}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(err)
        ) from err
    except OpenAIServiceError as err:
        logger.error(f"OpenAI service error: {err}")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(err)
        ) from err
    except Exception as err:
        logger.exception("Unexpected error during AI cost analysis")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"An unexpected error occurred during AI analysis: {str(err)}"
        ) from err

    # Stage 4: Storing results in database...
    await push_progress("Storing results...")
    saved_record_id: Optional[int] = None
    try:
        analysis_data_to_save = {
            "summary": ai_result.get("summary", ""),
            "estimated_savings": ai_result.get("estimated_savings", "$0.00/month"),
            "issues": ai_result.get("issues", []),
            "actionable_fix_commands": ai_result.get("actionable_fix_commands", []),
            "resources": resources
        }
        saved_record = await db.save_analysis(
            resource_group=rg_name,
            resources_scanned=len(resources),
            issues_found=len(ai_result.get("issues", [])),
            estimated_savings=ai_result.get("estimated_savings", "$0.00/month"),
            analysis_result=analysis_data_to_save,
            user_id=effective_user_id,
            status="completed"
        )
        if saved_record and "id" in saved_record:
            saved_record_id = saved_record["id"]
    except Exception as db_err:
        logger.warning(f"Could not persist analysis record to database: {db_err}")

    # Stage 5: Analysis complete
    await push_progress("Analysis complete")

    return {
        "id": saved_record_id,
        "analysis_id": analysis_id,
        "resource_group": rg_name,
        "total_resources": len(resources),
        "resources": resources,
        "summary": ai_result.get("summary", ""),
        "estimated_savings": ai_result.get("estimated_savings", "$0.00/month"),
        "issues": ai_result.get("issues", []),
        "actionable_fix_commands": ai_result.get("actionable_fix_commands", []),
        "analysis": ai_result,
    }


@app.get(
    "/api/history",
    summary="Get Analysis History",
    tags=["History"]
)
async def get_history(
    user_id: Optional[int] = None,
    current_user: Dict[str, Any] = Depends(auth.get_current_user)
):
    """
    Returns past analyses for the authenticated user from the database.
    """
    try:
        target_user_id = user_id or current_user["id"]
        records = await db.get_history(user_id=target_user_id)
        return records
    except Exception as err:
        logger.exception("Failed to fetch analysis history")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"An error occurred while fetching analysis history: {str(err)}"
        ) from err


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
