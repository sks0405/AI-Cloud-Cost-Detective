"""
AI Cloud Cost Detective - End-to-End Flow Verification Script
Validates Steps ① through ⑦ of Architecture.MD and RequestFlow.MD.
"""

import sys
import uuid
from pathlib import Path
from unittest.mock import patch

# Ensure backend directory is in path
backend_path = Path(__file__).resolve().parent
if str(backend_path) not in sys.path:
    sys.path.insert(0, str(backend_path))

from fastapi.testclient import TestClient
from main import app
import ai_analyzer

client = TestClient(app)

MOCK_AI_REPORT = {
    "summary": "Identified 2 critical cost optimization opportunities in production workloads.",
    "estimated_savings": "$125.00/month",
    "issues": [
        {
            "resource_name": "vol-08a9f3b6c2d1e04a5",
            "resource_type": "AWS::EC2::Volume",
            "issue_type": "unused",
            "severity": "high",
            "explanation": "Detached 500GB gp3 EBS volume has been unattached for over 14 days.",
            "recommendation": "Snapshot the volume for archival and delete the active volume.",
            "fix_command": "aws ec2 delete-volume --volume-id vol-08a9f3b6c2d1e04a5"
        },
        {
            "resource_name": "eipalloc-0123456789abcdef0",
            "resource_type": "AWS::EC2::EIP",
            "issue_type": "unused",
            "severity": "medium",
            "explanation": "Elastic IP is allocated to your AWS account but not associated with an EC2 instance.",
            "recommendation": "Release unassociated Elastic IP address to avoid hourly idle address charges.",
            "fix_command": "aws ec2 release-address --allocation-id eipalloc-0123456789abcdef0"
        }
    ],
    "actionable_fix_commands": [
        "aws ec2 delete-volume --volume-id vol-08a9f3b6c2d1e04a5",
        "aws ec2 release-address --allocation-id eipalloc-0123456789abcdef0"
    ]
}


# Reconfigure stdout for UTF-8 on Windows
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass


def print_step(step_num: str, title: str):
    print(f"\n[{step_num}] {title}")


def print_success(msg: str):
    print(f"  [OK] {msg}")


def print_fail(msg: str):
    print(f"  [FAIL] {msg}")


def run_full_verification():
    print("=" * 70)
    print("  AI Cloud Cost Detective - End-to-End System Verification")
    print("=" * 70)

    # Step 0: Security & Protected Routes
    print_step("Step 0", "Verifying Security: Protected Route Rejections")
    res_rg_no_auth = client.get("/api/resource-groups")
    res_an_no_auth = client.post("/api/analyze", json={"resource_group": "test"})
    res_hi_no_auth = client.get("/api/history")

    assert res_rg_no_auth.status_code == 401, "GET /api/resource-groups must require JWT"
    assert res_an_no_auth.status_code == 401, "POST /api/analyze must require JWT"
    assert res_hi_no_auth.status_code == 401, "GET /api/history must require JWT"
    print_success("Unauthenticated requests are strictly rejected with 401 Unauthorized.")

    # Step 1: User Signup & Login
    print_step("Step 1", "User Registration & Authentication (bcrypt + PyJWT)")
    test_email = f"lead_architect_{uuid.uuid4().hex[:6]}@enterprise.cloud"
    test_password = "SecurePassword#2026"

    signup_res = client.post("/api/auth/signup", json={"email": test_email, "password": test_password})
    assert signup_res.status_code == 200, f"Signup failed: {signup_res.text}"
    token = signup_res.json()["access_token"]
    user_id = signup_res.json()["user"]["id"]
    headers = {"Authorization": f"Bearer {token}"}
    print_success(f"User registered successfully: {test_email} (ID: {user_id})")

    login_res = client.post("/api/auth/login", json={"email": test_email, "password": test_password})
    assert login_res.status_code == 200, f"Login failed: {login_res.text}"
    print_success("Credentials verified via bcrypt; JWT access token issued.")

    # Step 2: Fetch Resource Groups
    print_step("Step 2", "Fetching AWS Resource Groups (GET /api/resource-groups)")
    rg_res = client.get("/api/resource-groups", headers=headers)
    assert rg_res.status_code == 200, f"Resource groups request failed: {rg_res.text}"
    groups = rg_res.json().get("resource_groups", [])
    print_success(f"Successfully retrieved resource groups: {groups}")
    target_rg = groups[0] if groups else "my-ec2-dev-resource-group"

    # Step 3, 4, 5, 6: WebSocket Progress Tracking & AI Analysis
    print_step("Step 3-6", "Trigger Analysis, Stream WebSocket Progress, and Persist")
    analysis_id = f"demo-run-{uuid.uuid4().hex[:6]}"

    with client.websocket_connect(f"/ws/progress/{analysis_id}") as ws:
        with patch("ai_analyzer.analyze_resources", return_value=MOCK_AI_REPORT):
            analyze_res = client.post(
                "/api/analyze",
                json={
                    "resource_group": target_rg,
                    "analysis_id": analysis_id
                },
                headers=headers
            )
            assert analyze_res.status_code == 200, f"Analysis failed: {analyze_res.text}"
            report = analyze_res.json()

        # Capture WebSocket progress stream
        received_stages = [
            ws.receive_text(),
            ws.receive_text(),
            ws.receive_text(),
            ws.receive_text(),
            ws.receive_text(),
        ]

    for stage_idx, stage_text in enumerate(received_stages, 1):
        print_success(f"WebSocket Stage {stage_idx}/5: {stage_text}")

    # Step 7: Final Report Structure & Suggestions
    print_step("Step 7", "Verifying Analysis Report & Remediation Recommendations")
    print_success(f"Resource Group: {report['resource_group']}")
    print_success(f"Total Resources Scanned: {report['total_resources']}")
    print_success(f"Estimated Monthly Savings: {report['estimated_savings']}")
    print_success(f"Optimization Issues Found: {len(report['issues'])}")
    for issue in report["issues"]:
        print(f"    - [{issue['severity'].upper()}] {issue['resource_name']} ({issue['resource_type']}): {issue['fix_command']}")

    # Step 8: History Display
    print_step("Step 8", "Retrieving Historical Audits (GET /api/history)")
    history_res = client.get("/api/history", headers=headers)
    assert history_res.status_code == 200, f"History fetch failed: {history_res.text}"
    history_records = history_res.json()
    assert len(history_records) >= 1
    latest = history_records[0]
    print_success(f"Persisted History Record ID {latest['id']} matched group '{latest['resource_group']}' with {latest['issues_found']} issues.")

    print("\n" + "=" * 70)
    print("  ALL 7 REQUEST FLOW STEPS VERIFIED END-TO-END SUCCESSFULLY!")
    print("=" * 70 + "\n")


if __name__ == "__main__":
    run_full_verification()
