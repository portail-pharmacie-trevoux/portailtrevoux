#!/usr/bin/env python3
"""Read-only S3 backup freshness monitor. Never exports database contents."""
import datetime as dt
import json
import os
import sys
import boto3
from botocore.config import Config

def evaluate(objects, now, max_age_hours):
    latest = max((obj["LastModified"] for obj in objects), default=None)
    if latest is None:
        return {"status": "missing", "reason": "No backup object found"}
    age_hours = (now - latest).total_seconds() / 3600
    if age_hours > max_age_hours:
        return {"status": "stale", "age_hours": round(age_hours, 2)}
    return {"status": "ok", "age_hours": round(age_hours, 2)}

def main():
    prefix = os.environ.get("BACKUP_MONITOR_PREFIX", "tests/synthetic/")
    if not prefix.startswith("tests/synthetic/"):
        raise RuntimeError("Monitor is restricted to synthetic objects until compliance approval")
    now = dt.datetime.now(dt.timezone.utc)
    max_age_hours = float(os.environ.get("BACKUP_MAX_AGE_HOURS", "26"))
    if not 0 < max_age_hours <= 168:
        raise ValueError("Invalid freshness threshold")
    client = boto3.client(
        "s3", endpoint_url=os.environ["S3_ENDPOINT_URL"],
        region_name=os.environ["S3_REGION"],
        aws_access_key_id=os.environ["S3_ACCESS_KEY_ID"],
        aws_secret_access_key=os.environ["S3_SECRET_ACCESS_KEY"],
        config=Config(signature_version="s3v4"))
    result = client.list_objects_v2(Bucket=os.environ["S3_BUCKET"], Prefix=prefix)
    if result.get("IsTruncated"):
        raise RuntimeError("Too many objects to check safely; pagination required")
    state = evaluate(result.get("Contents", []), now, max_age_hours)
    print(json.dumps({"monitor": "synthetic", "prefix": prefix, **state}))
    if state["status"] != "ok":
        alert = {
            "severity": "warning",
            "service": "Portail+ synthetic backup monitor",
            "status": state["status"],
            "message": "Synthetic backup missing or older than freshness threshold",
            "action": "Review the Render test service logs and Scaleway synthetic prefix",
        }
        print("BACKUP_ALERT " + json.dumps(alert), file=sys.stderr)
    return 0 if state["status"] == "ok" else 2

if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as exc:
        print("BACKUP_ALERT " + json.dumps({
            "severity": "error", "service": "Portail+ synthetic backup monitor",
            "status": "error", "type": type(exc).__name__,
            "action": "Review test service configuration and logs"
        }), file=sys.stderr)
        sys.exit(3)
