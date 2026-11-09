"""
Unit and Integration Tests for FastAPI Backend, AWS Scanner, AI Analyzer, DB, and WebSocket.
"""

import json
import sys
import uuid
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

# Ensure backend directory is in sys.path
backend_dir = Path(__file__).resolve().parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

import ai_analyzer
import auth
import aws_scanner
import db
from main import app, progress_manager

client = TestClient(app)

MOCK_AI_ANALYSIS = {
    "summary": "Detected 2 potential cost optimization issues in the resource group.",
    "estimated_savings": "$65.00/month",
    "issues": [
        {
            "resource_name": "eipalloc-05118639ebc5a69b0",
            "resource_type": "AWS::EC2::EIP",
            "issue_type": "unused",
            "severity": "medium",
            "explanation": "Elastic IP is allocated but unattached to any running instance.",
            "recommendation": "Release the unattached Elastic IP to save hourly idle IP fees.",
            "fix_command": "aws ec2 release-address --allocation-id eipalloc-05118639ebc5a69b0"
        },
        {
            "resource_name": "i-021f2bcea0aaa629e",
            "resource_type": "AWS::EC2::Instance",
            "issue_type": "over-provisioned",
            "severity": "high",
            "explanation": "Instance is running on c7i-flex.large with very low average utilization.",
            "recommendation": "Downsize instance to c7i-flex.medium or t4g.medium.",
            "fix_command": "aws ec2 modify-instance-attribute --instance-id i-021f2bcea0aaa629e --instance-type c7i-flex.medium"
        }
    ],
    "actionable_fix_commands": [
        "aws ec2 release-address --allocation-id eipalloc-05118639ebc5a69b0",
        "aws ec2 modify-instance-attribute --instance-id i-021f2bcea0aaa629e --instance-type c7i-flex.medium"
    ],
    "total_resources_scanned": 13,
    "total_issues_found": 2
}


def get_auth_headers(user_id=1, email="testuser@example.com") -> dict:
    """Helper to generate JWT Bearer headers for authenticated test requests."""
    token = auth.create_access_token({"sub": str(user_id), "email": email})
    return {"Authorization": f"Bearer {token}"}


# ---------------------------------------------------------------------------
# General Endpoint Tests
# ---------------------------------------------------------------------------

def test_health():
    """Verify health endpoint."""
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert "database_connected" in data


def test_cors_headers():
    """Verify CORS headers for frontend origin."""
    response = client.options(
        "/api/resource-groups",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "GET"
        }
    )
    assert response.status_code == 200
    assert response.headers.get("access-control-allow-origin") == "http://localhost:5173"


def test_unauthenticated_requests_fail():
    """Verify protected endpoints reject requests without valid JWT token."""
    # 1. GET /api/resource-groups
    res1 = client.get("/api/resource-groups")
    assert res1.status_code == 401
    assert "authorization header missing" in res1.json()["detail"].lower()

    # 2. POST /api/analyze
    res2 = client.post("/api/analyze", json={"resource_group": "any-group"})
    assert res2.status_code == 401
    assert "authorization header missing" in res2.json()["detail"].lower()

    # 3. GET /api/history
    res3 = client.get("/api/history")
    assert res3.status_code == 401
    assert "authorization header missing" in res3.json()["detail"].lower()

    # 4. Invalid token header format
    res4 = client.get("/api/history", headers={"Authorization": "InvalidFormat123"})
    assert res4.status_code == 401


def test_get_resource_groups_success():
    """Verify GET /api/resource-groups returns a valid list with JWT."""
    response = client.get("/api/resource-groups", headers=get_auth_headers())
    assert response.status_code == 200
    data = response.json()
    assert "resource_groups" in data
    assert isinstance(data["resource_groups"], list)
    assert "my-ec2-dev-resource-group" in data["resource_groups"]


# ---------------------------------------------------------------------------
# POST /api/analyze Tests
# ---------------------------------------------------------------------------

def test_post_analyze_success():
    """Verify POST /api/analyze calls scanner, passes to ai_analyzer, stores in db, and returns final analysis."""
    with patch("ai_analyzer.analyze_resources", return_value=MOCK_AI_ANALYSIS) as mock_ai:
        analysis_id = str(uuid.uuid4())
        payload = {
            "resource_group": "my-ec2-dev-resource-group",
            "analysis_id": analysis_id
        }
        response = client.post("/api/analyze", json=payload, headers=get_auth_headers())
        assert response.status_code == 200
        data = response.json()

        mock_ai.assert_called_once()
        assert data["resource_group"] == "my-ec2-dev-resource-group"
        assert data["analysis_id"] == analysis_id
        assert data["total_resources"] >= 1
        assert isinstance(data["resources"], list)

        # AI analysis fields
        assert "summary" in data
        assert "estimated_savings" in data
        assert "issues" in data
        assert "actionable_fix_commands" in data
        assert len(data["issues"]) == 2
        assert data["estimated_savings"] == "$65.00/month"
        assert len(data["actionable_fix_commands"]) == 2

        # Check each issue structure
        for issue in data["issues"]:
            assert "resource_name" in issue
            assert "resource_type" in issue
            assert "issue_type" in issue
            assert "severity" in issue
            assert "explanation" in issue
            assert "fix_command" in issue


def test_post_analyze_not_found():
    """Verify POST /api/analyze returns 404 for non-existent resource group."""
    payload = {"resource_group": "non-existent-group-9999"}
    response = client.post("/api/analyze", json=payload, headers=get_auth_headers())
    assert response.status_code == 404
    assert "not found" in response.json()["detail"].lower()


def test_post_analyze_empty_group():
    """Verify POST /api/analyze returns 400 for empty resource group string."""
    payload = {"resource_group": "   "}
    response = client.post("/api/analyze", json=payload, headers=get_auth_headers())
    assert response.status_code == 400


def test_aws_cli_not_installed():
    """Verify 500 error when AWS CLI is not installed."""
    with patch("aws_scanner.list_resource_groups") as mock_list:
        mock_list.side_effect = aws_scanner.AWSCLINotInstalledError("AWS CLI not found on PATH")
        response = client.get("/api/resource-groups", headers=get_auth_headers())
        assert response.status_code == 500
        assert "not found" in response.json()["detail"].lower()


def test_aws_cli_auth_error():
    """Verify 401 error when AWS CLI is not authenticated."""
    with patch("aws_scanner.get_resources_in_group") as mock_get:
        mock_get.side_effect = aws_scanner.AWSAuthError("Unable to locate credentials")
        response = client.post("/api/analyze", json={"resource_group": "any-group"}, headers=get_auth_headers())
        assert response.status_code == 401
        assert "credentials" in response.json()["detail"].lower()


def test_post_analyze_openai_key_missing():
    """Verify 500 error when OpenAI key is missing during analysis."""
    with patch("ai_analyzer.analyze_resources") as mock_ai:
        mock_ai.side_effect = ai_analyzer.OpenAIKeyMissingError("OPENAI_API_KEY environment variable is not configured.")
        response = client.post("/api/analyze", json={"resource_group": "my-ec2-dev-resource-group"}, headers=get_auth_headers())
        assert response.status_code == 500
        assert "openai_api_key" in response.json()["detail"].lower()


# ---------------------------------------------------------------------------
# WebSocket Progress Tests
# ---------------------------------------------------------------------------

def test_websocket_progress():
    """Verify WebSocket connects and receives progress messages during analysis flow."""
    test_analysis_id = "test-ws-" + str(uuid.uuid4())[:8]

    # Connect WebSocket client
    with client.websocket_connect(f"/ws/progress/{test_analysis_id}") as websocket:
        # Trigger analyze with this analysis_id
        with patch("ai_analyzer.analyze_resources", return_value=MOCK_AI_ANALYSIS):
            response = client.post(
                "/api/analyze",
                json={
                    "resource_group": "my-ec2-dev-resource-group",
                    "analysis_id": test_analysis_id
                },
                headers=get_auth_headers()
            )
            assert response.status_code == 200

        # Receive progress messages in sequence
        msg1 = websocket.receive_text()
        assert msg1 == "Fetching resource groups..."

        msg2 = websocket.receive_text()
        assert "Scanning resources in" in msg2

        msg3 = websocket.receive_text()
        assert msg3 == "Analyzing costs with AI..."

        msg4 = websocket.receive_text()
        assert msg4 == "Storing results..."

        msg5 = websocket.receive_text()
        assert msg5 == "Analysis complete"


# ---------------------------------------------------------------------------
# Database & History Tests
# ---------------------------------------------------------------------------

@pytest.mark.anyio
async def test_db_save_and_get_history():
    """Verify save_analysis persists and get_history retrieves records."""
    record = await db.save_analysis(
        resource_group="test-rg",
        resources_scanned=5,
        issues_found=1,
        estimated_savings="$25.00/month",
        analysis_result={"summary": "test savings"},
        user_id=1,
        status="completed"
    )
    assert record["resource_group"] == "test-rg"
    assert record["resources_scanned"] == 5
    assert record["issues_found"] == 1
    assert record["estimated_savings"] == "$25.00/month"

    history = await db.get_history(user_id=1)
    assert len(history) >= 1
    assert history[0]["resource_group"] == "test-rg"


def test_get_history_endpoint():
    """Verify GET /api/history endpoint returns past analysis records with auth."""
    headers = get_auth_headers(user_id=99)
    # Trigger an analysis to populate history for this user
    with patch("ai_analyzer.analyze_resources", return_value=MOCK_AI_ANALYSIS):
        client.post(
            "/api/analyze",
            json={"resource_group": "my-ec2-dev-resource-group"},
            headers=headers
        )

    response = client.get("/api/history", headers=headers)
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) >= 1
    assert "resource_group" in data[0]
    assert "estimated_savings" in data[0]


# ---------------------------------------------------------------------------
# AI Analyzer Unit Tests
# ---------------------------------------------------------------------------

def test_ai_analyzer_empty_resources():
    """Verify analyze_resources handles empty resource list without calling OpenAI."""
    result = ai_analyzer.analyze_resources([])
    assert "No resources were found" in result["summary"]
    assert result["estimated_savings"] == "$0.00/month"
    assert result["issues"] == []
    assert result["actionable_fix_commands"] == []


def test_ai_analyzer_missing_key():
    """Verify OpenAIKeyMissingError is raised if api key is missing."""
    with patch.dict("os.environ", {"OPENAI_API_KEY": ""}, clear=False):
        with pytest.raises(ai_analyzer.OpenAIKeyMissingError):
            ai_analyzer.analyze_resources(
                [{"resource_type": "AWS::EC2::Instance", "name": "test"}],
                api_key=""
            )


def test_ai_analyzer_openai_call_success():
    """Verify analyze_resources properly calls chat completions and returns parsed JSON."""
    mock_client = MagicMock()
    mock_choice = MagicMock()
    mock_choice.message.content = json.dumps({
        "summary": "Found 1 unused disk",
        "estimated_savings": "$15.00/month",
        "issues": [
            {
                "resource_name": "vol-123456",
                "resource_type": "AWS::EC2::Volume",
                "issue_type": "unused",
                "severity": "medium",
                "explanation": "Volume is unattached",
                "recommendation": "Delete the unattached volume",
                "fix_command": "aws ec2 delete-volume --volume-id vol-123456"
            }
        ],
        "actionable_fix_commands": ["aws ec2 delete-volume --volume-id vol-123456"]
    })
    mock_response = MagicMock()
    mock_response.choices = [mock_choice]
    mock_client.chat.completions.create.return_value = mock_response

    resources = [
        {
            "resource_type": "AWS::EC2::Volume",
            "type": "AWS::EC2::Volume",
            "name": "vol-123456",
            "location": "us-east-1",
            "sku": "gp3",
            "arn": "arn:aws:ec2:us-east-1:123456789012:volume/vol-123456",
            "tags": {}
        }
    ]

    result = ai_analyzer.analyze_resources(resources, client=mock_client)
    assert result["summary"] == "Found 1 unused disk"
    assert result["estimated_savings"] == "$15.00/month"
    assert len(result["issues"]) == 1
    assert result["issues"][0]["resource_name"] == "vol-123456"
    assert result["issues"][0]["severity"] == "medium"
    assert result["issues"][0]["fix_command"] == "aws ec2 delete-volume --volume-id vol-123456"
    assert "aws ec2 delete-volume --volume-id vol-123456" in result["actionable_fix_commands"]


# ---------------------------------------------------------------------------
# Auth Endpoint Tests
# ---------------------------------------------------------------------------

def test_auth_signup_and_login_flow():
    """Verify signup creates user with hashed password and login validates credentials."""
    unique_email = f"test_{uuid.uuid4().hex[:6]}@example.com"
    password = "secretPassword123"

    # 1. Signup
    signup_res = client.post("/api/auth/signup", json={"email": unique_email, "password": password})
    assert signup_res.status_code == 200
    signup_data = signup_res.json()
    assert "access_token" in signup_data
    assert signup_data["user"]["email"] == unique_email
    token = signup_data["access_token"]

    # 2. Duplicate signup should fail
    dup_res = client.post("/api/auth/signup", json={"email": unique_email, "password": password})
    assert dup_res.status_code == 400

    # 3. Login with correct password
    login_res = client.post("/api/auth/login", json={"email": unique_email, "password": password})
    assert login_res.status_code == 200
    login_data = login_res.json()
    assert "access_token" in login_data
    assert login_data["user"]["email"] == unique_email

    # 4. Login with incorrect password
    bad_login = client.post("/api/auth/login", json={"email": unique_email, "password": "wrongPassword!"})
    assert bad_login.status_code == 401

    # 5. Access history using Bearer token
    hist_res = client.get("/api/history", headers={"Authorization": f"Bearer {token}"})
    assert hist_res.status_code == 200
    assert isinstance(hist_res.json(), list)


# ---------------------------------------------------------------------------
# Full End-to-End Flow Test (Steps 1 through 7)
# ---------------------------------------------------------------------------

def test_full_end_to_end_flow():
    """
    Validates complete end-to-end integration:
    Step 1: User Signup & Login -> JWT generated
    Step 2: Authenticated fetch of resource groups (GET /api/resource-groups)
    Step 3: Trigger Analysis (POST /api/analyze) with JWT
    Step 4: WebSocket progress streaming (ws://localhost:8000/ws/progress/{analysis_id})
    Step 5: AI Cost Analysis execution (OpenAI gpt-4o)
    Step 6: Analysis persistence into database (analyses table)
    Step 7: History retrieval (GET /api/history) and Report verification
    """
    # Step 1: User Signup & Login
    e2e_email = f"finops_{uuid.uuid4().hex[:6]}@enterprise.com"
    password = "strongPassword#2026"

    signup_res = client.post("/api/auth/signup", json={"email": e2e_email, "password": password})
    assert signup_res.status_code == 200, f"Signup failed: {signup_res.text}"
    token = signup_res.json()["access_token"]
    user_id = signup_res.json()["user"]["id"]
    headers = {"Authorization": f"Bearer {token}"}

    # Step 2: Fetch Resource Groups
    rg_res = client.get("/api/resource-groups", headers=headers)
    assert rg_res.status_code == 200
    rgs = rg_res.json()["resource_groups"]
    assert "my-ec2-dev-resource-group" in rgs
    target_rg = "my-ec2-dev-resource-group"

    # Step 3 & 4: Run Analysis with WebSocket tracking
    analysis_id = f"e2e-analysis-{uuid.uuid4().hex[:8]}"

    with client.websocket_connect(f"/ws/progress/{analysis_id}") as ws:
        with patch("ai_analyzer.analyze_resources", return_value=MOCK_AI_ANALYSIS):
            analyze_res = client.post(
                "/api/analyze",
                json={
                    "resource_group": target_rg,
                    "analysis_id": analysis_id
                },
                headers=headers
            )
            assert analyze_res.status_code == 200
            report = analyze_res.json()

        # Verify WebSocket received all 5 stages in order
        stages = [
            ws.receive_text(),
            ws.receive_text(),
            ws.receive_text(),
            ws.receive_text(),
            ws.receive_text(),
        ]
        assert stages[0] == "Fetching resource groups..."
        assert "Scanning resources in" in stages[1]
        assert stages[2] == "Analyzing costs with AI..."
        assert stages[3] == "Storing results..."
        assert stages[4] == "Analysis complete"

    # Step 5 & 6: Validate Report Output Structure
    assert report["resource_group"] == target_rg
    assert report["total_resources"] >= 1
    assert report["estimated_savings"] == "$65.00/month"
    assert len(report["issues"]) == 2

    for issue in report["issues"]:
        assert issue["severity"] in ["high", "medium", "low"]
        assert issue["resource_name"]
        assert issue["fix_command"].startswith("aws ")

    # Step 7: Verify History Record Retrieved with JWT
    history_res = client.get("/api/history", headers=headers)
    assert history_res.status_code == 200
    history_items = history_res.json()
    assert len(history_items) >= 1

    latest_entry = history_items[0]
    assert latest_entry["resource_group"] == target_rg
    assert latest_entry["issues_found"] == 2
    assert latest_entry["estimated_savings"] == "$65.00/month"
    assert "analysis_result" in latest_entry
    assert latest_entry["analysis_result"]["summary"] == MOCK_AI_ANALYSIS["summary"]
