"""
AWS Scanner Module for AI Cloud Cost Detective.

Interacts with AWS CLI via Python's subprocess module to:
- List AWS resource groups
- Fetch all resources belonging to a selected resource group
- Parse and enrich resources with type, name, location, SKU, and tags
- Handle errors (CLI not installed, not logged in/unauthorized, group not found)
"""

import json
import logging
import os
import shutil
import subprocess
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Custom Exceptions
# ---------------------------------------------------------------------------

class AWSScannerError(Exception):
    """Base exception for all AWS scanner errors."""
    pass


class AWSCLINotInstalledError(AWSScannerError):
    """Raised when the AWS CLI executable is not installed or not found on PATH."""
    pass


class AWSAuthError(AWSScannerError):
    """Raised when AWS CLI is not authenticated or credentials are missing/expired."""
    pass


class ResourceGroupNotFoundError(AWSScannerError):
    """Raised when the specified AWS resource group does not exist."""
    pass


# ---------------------------------------------------------------------------
# Helper / Execution Functions
# ---------------------------------------------------------------------------

def _run_aws_command(
    args: List[str],
    timeout: int = 30,
    env: Optional[Dict[str, str]] = None
) -> str:
    """
    Run an AWS CLI command using subprocess.run and return stdout as string.
    Catches common execution errors and raises specialized exceptions.
    """
    cmd = ["aws"] + args
    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=timeout,
            env=env or os.environ.copy()
        )
    except FileNotFoundError as err:
        raise AWSCLINotInstalledError(
            "AWS CLI is not installed or not found on system PATH. "
            "Please install AWS CLI v2 and verify with 'aws --version'."
        ) from err
    except subprocess.TimeoutExpired as err:
        raise AWSScannerError(f"AWS CLI command timed out after {timeout} seconds: {' '.join(cmd)}") from err
    except Exception as err:
        raise AWSScannerError(f"Failed to execute AWS CLI command: {str(err)}") from err

    stderr_clean = result.stderr.strip()
    if result.returncode != 0:
        # Check for authentication / credentials errors
        auth_error_markers = [
            "Unable to locate credentials",
            "The security token included in the request is invalid",
            "The security token included in the request is expired",
            "ExpiredToken",
            "InvalidClientTokenId",
            "UnrecognizedClientException",
            "AccessDenied",
            "AccessDeniedException",
            "NoCredentialsError",
            "PartialCredentialsError",
            "AuthFailure",
            "SignatureDoesNotMatch",
        ]
        if any(marker.lower() in stderr_clean.lower() for marker in auth_error_markers):
            raise AWSAuthError(
                f"AWS CLI authentication failed or credentials not configured/expired: {stderr_clean}"
            )

        # Check for resource group not found
        not_found_markers = [
            "NotFoundException",
            "The specified group does not exist",
            "ResourceGroupNotFoundException",
            "GroupNotFoundException",
            "NoSuchResource",
            "BadRequestException: The parameter group",
        ]
        if any(marker.lower() in stderr_clean.lower() for marker in not_found_markers):
            raise ResourceGroupNotFoundError(
                f"Resource group not found: {stderr_clean}"
            )

        raise AWSScannerError(f"AWS CLI command failed (exit code {result.returncode}): {stderr_clean}")

    return result.stdout


# ---------------------------------------------------------------------------
# Core Scanner Functions
# ---------------------------------------------------------------------------

def list_resource_groups(detailed: bool = False) -> List[Any]:
    """
    List all AWS resource groups using AWS CLI.

    Executes:
        aws resource-groups list-groups --output json

    Args:
        detailed: If True, returns a list of dicts with 'name' and 'arn'.
                  If False (default), returns a list of group name strings.

    Returns:
        List of resource group names (or dicts if detailed=True).
    """
    stdout = _run_aws_command(["resource-groups", "list-groups", "--output", "json"])
    try:
        data = json.loads(stdout)
    except json.JSONDecodeError as err:
        raise AWSScannerError(f"Failed to decode AWS CLI JSON output: {str(err)}") from err

    # Extract groups from either 'Groups' or 'GroupIdentifiers'
    groups_list: List[Dict[str, str]] = []
    
    for item in data.get("Groups", []):
        name = item.get("Name")
        arn = item.get("GroupArn", "")
        if name:
            groups_list.append({"name": name, "arn": arn})

    if not groups_list:
        for item in data.get("GroupIdentifiers", []):
            name = item.get("GroupName")
            arn = item.get("GroupArn", "")
            if name:
                groups_list.append({"name": name, "arn": arn})

    if detailed:
        return groups_list
    return [g["name"] for g in groups_list]


def parse_aws_resources(raw_data: Any) -> List[Dict[str, Any]]:
    """
    Parse AWS CLI JSON output and return a structured list of resources.
    Extracts resource type, name, location, SKU, and tags from resource records.
    """
    if isinstance(raw_data, str):
        try:
            raw_data = json.loads(raw_data)
        except json.JSONDecodeError as err:
            raise AWSScannerError(f"Failed to decode AWS CLI JSON: {str(err)}") from err

    identifiers: List[Dict[str, Any]] = []

    if isinstance(raw_data, dict):
        if "ResourceIdentifiers" in raw_data and isinstance(raw_data["ResourceIdentifiers"], list):
            identifiers = raw_data["ResourceIdentifiers"]
        elif "Resources" in raw_data and isinstance(raw_data["Resources"], list):
            for r in raw_data["Resources"]:
                if isinstance(r, dict) and "Identifier" in r and isinstance(r["Identifier"], dict):
                    identifiers.append(r["Identifier"])
                elif isinstance(r, dict):
                    identifiers.append(r)
        elif "resources" in raw_data and isinstance(raw_data["resources"], list):
            identifiers = raw_data["resources"]
    elif isinstance(raw_data, list):
        identifiers = raw_data

    structured_resources: List[Dict[str, Any]] = []

    for item in identifiers:
        if not isinstance(item, dict):
            continue

        arn = item.get("ResourceArn") or item.get("arn") or item.get("id") or ""
        res_type = item.get("ResourceType") or item.get("resource_type") or item.get("type") or ""

        # Parse ARN components: arn:partition:service:region:account-id:resource-type/resource-id
        service = ""
        location = "global"
        res_id = ""

        if arn.startswith("arn:"):
            parts = arn.split(":", 5)
            if len(parts) > 2:
                service = parts[2]
            if len(parts) > 3 and parts[3]:
                location = parts[3]
            if len(parts) > 5:
                res_info = parts[5]
                if "/" in res_info:
                    _, res_id = res_info.split("/", 1)
                elif ":" in res_info:
                    _, res_id = res_info.split(":", 1)
                else:
                    res_id = res_info

        # Fallback resource type if not directly provided
        if not res_type and service:
            res_type = f"AWS::{service.upper()}::{res_id.capitalize() if res_id else 'Resource'}"

        # Parse tags
        tags: Dict[str, str] = {}
        raw_tags = item.get("Tags") or item.get("tags") or {}
        if isinstance(raw_tags, list):
            for t in raw_tags:
                if isinstance(t, dict) and "Key" in t and "Value" in t:
                    tags[t["Key"]] = t["Value"]
        elif isinstance(raw_tags, dict):
            tags = {str(k): str(v) for k, v in raw_tags.items()}

        # Determine friendly resource name
        name = tags.get("Name") or tags.get("name") or item.get("name") or res_id or arn

        sku = item.get("sku") or item.get("SKU") or "N/A"

        structured_resources.append({
            "resource_type": res_type or "AWS::Resource",
            "type": res_type or "AWS::Resource",
            "name": name,
            "location": location,
            "sku": sku,
            "tags": tags,
            "arn": arn,
            "id": res_id or arn,
        })

    return structured_resources


def _enrich_tags(arns: List[str]) -> Dict[str, Dict[str, str]]:
    """
    Fetch resource tags in batch using AWS Resource Groups Tagging API.
    Gracefully returns empty tags if the command fails.
    """
    tags_by_arn: Dict[str, Dict[str, str]] = {}
    valid_arns = [a for a in arns if a.startswith("arn:")]
    
    # AWS Resource Groups Tagging API accepts up to 100 ARNs per call
    batch_size = 50
    for i in range(0, len(valid_arns), batch_size):
        chunk = valid_arns[i:i + batch_size]
        try:
            cmd = ["resourcegroupstaggingapi", "get-resources", "--resource-arn-list"] + chunk + ["--output", "json"]
            stdout = _run_aws_command(cmd, timeout=15)
            data = json.loads(stdout)
            for mapping in data.get("ResourceTagMappingList", []):
                r_arn = mapping.get("ResourceARN")
                raw_tag_list = mapping.get("Tags", [])
                if r_arn and raw_tag_list:
                    tags_by_arn[r_arn] = {
                        t["Key"]: t["Value"]
                        for t in raw_tag_list
                        if isinstance(t, dict) and "Key" in t and "Value" in t
                    }
        except Exception as e:
            logger.warning(f"Could not fetch tags via tagging API: {e}")
            break

    return tags_by_arn


def _enrich_skus(resources: List[Dict[str, Any]]) -> Dict[str, str]:
    """
    Enrich SKUs (such as EC2 instance types or RDS instance classes).
    Gracefully returns 'N/A' if enrichment fails or is not applicable.
    """
    sku_by_arn: Dict[str, str] = {}

    # 1. EC2 Instances
    ec2_instance_map: Dict[str, str] = {}
    for r in resources:
        arn = r.get("arn", "")
        res_type = r.get("resource_type", "")
        if res_type == "AWS::EC2::Instance" or ":instance/" in arn:
            inst_id = arn.split(":instance/")[-1] if ":instance/" in arn else r.get("id", "")
            if inst_id:
                ec2_instance_map[inst_id] = arn

    if ec2_instance_map:
        try:
            inst_ids = list(ec2_instance_map.keys())
            cmd = [
                "ec2", "describe-instances",
                "--instance-ids"
            ] + inst_ids + [
                "--query", "Reservations[].Instances[][InstanceId, InstanceType]",
                "--output", "json"
            ]
            stdout = _run_aws_command(cmd, timeout=15)
            pairs = json.loads(stdout)
            for pair in pairs:
                if isinstance(pair, list) and len(pair) == 2:
                    instance_id, instance_type = pair[0], pair[1]
                    target_arn = ec2_instance_map.get(instance_id)
                    if target_arn:
                        sku_by_arn[target_arn] = instance_type
        except Exception as e:
            logger.warning(f"Could not enrich EC2 instance types: {e}")

    # 2. RDS Instances
    for r in resources:
        arn = r.get("arn", "")
        res_type = r.get("resource_type", "")
        if (res_type == "AWS::RDS::DBInstance" or ":db:" in arn) and arn not in sku_by_arn:
            sku_by_arn[arn] = "Standard"

    return sku_by_arn


def get_resources_in_group(resource_group: str) -> List[Dict[str, Any]]:
    """
    Fetch and return all resources in the selected AWS resource group.

    Executes:
        aws resource-groups list-group-resources --group <resource_group> --output json

    Parses the output and enriches each resource with:
        - resource_type
        - name
        - location
        - sku
        - tags

    Args:
        resource_group: Name or ARN of the AWS resource group.

    Returns:
        List of structured resource dictionaries.
    """
    group_name = resource_group.strip()
    if not group_name:
        raise ResourceGroupNotFoundError("Resource group name cannot be empty.")

    # Fetch resources in group using AWS CLI
    cmd = ["resource-groups", "list-group-resources", "--group", group_name, "--output", "json"]
    stdout = _run_aws_command(cmd)

    try:
        raw_data = json.loads(stdout)
    except json.JSONDecodeError as err:
        raise AWSScannerError(f"Failed to decode AWS CLI JSON output: {str(err)}") from err

    # Parse initial structured resources
    structured = parse_aws_resources(raw_data)

    if not structured:
        return []

    # Enrich with real tags via AWS Resource Groups Tagging API
    arns = [r["arn"] for r in structured if r.get("arn")]
    tag_map = _enrich_tags(arns)

    # Enrich with SKU/instance types
    sku_map = _enrich_skus(structured)

    # Apply enriched tags and SKUs
    for r in structured:
        arn = r.get("arn", "")
        if arn in tag_map:
            r["tags"].update(tag_map[arn])
            if "Name" in tag_map[arn]:
                r["name"] = tag_map[arn]["Name"]
            elif "name" in tag_map[arn]:
                r["name"] = tag_map[arn]["name"]

        if arn in sku_map:
            r["sku"] = sku_map[arn]

    return structured


# Alias for compatibility with various naming conventions
scan_resource_group = get_resources_in_group
