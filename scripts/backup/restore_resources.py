#!/usr/bin/env python3
"""Reconstruct a resource-bucket snapshot locally, with optional upload to an empty bucket."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import subprocess
import sys
import tempfile
from datetime import date, datetime, time, timedelta, timezone
from pathlib import Path
from typing import Any

import boto3
from boto3.s3.transfer import TransferConfig
from botocore.config import Config


RESTIC_HOST = os.environ.get("RESTIC_HOST", "coursehubs-production")
RESTIC_REGION = os.environ.get("BACKUP_S3_REGION", "us-east-2")


class RestoreError(RuntimeError):
    """Raised when a resource restore cannot be completed safely."""


def restic_command(*arguments: str, capture_output: bool = False) -> subprocess.CompletedProcess[bytes]:
    command = [
        "restic",
        "-o",
        f"s3.region={RESTIC_REGION}",
        "-o",
        "s3.bucket-lookup=path",
        *arguments,
    ]
    result = subprocess.run(
        command,
        check=False,
        stdout=subprocess.PIPE if capture_output else None,
        stderr=subprocess.PIPE if capture_output else None,
    )
    if result.returncode != 0:
        if capture_output and result.stderr:
            sys.stderr.write(result.stderr.decode("utf-8", errors="replace"))
        raise RestoreError(f"Backup repository operation failed: restic {arguments[0]}")
    return result


def parse_time(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(timezone.utc)


def load_snapshots(tag: str) -> list[dict[str, Any]]:
    result = restic_command(
        "snapshots",
        "--json",
        "--tag",
        tag,
        "--host",
        RESTIC_HOST,
        capture_output=True,
    )
    return json.loads(result.stdout.decode("utf-8"))


def find_resources_directory(restore_root: Path) -> Path:
    matches = [
        path.parent
        for path in restore_root.rglob("manifest.json")
        if path.parent.name == "resources"
    ]
    if len(matches) != 1:
        raise RestoreError("Could not identify the resource data in the selected backup snapshot.")
    return matches[0]


def restore_snapshot(snapshot_id: str, destination: Path) -> Path:
    destination.mkdir(parents=True, exist_ok=True)
    restic_command("restore", snapshot_id, "--target", str(destination))
    return find_resources_directory(destination)


def build_resource_snapshot(as_of: datetime, output: Path) -> dict[str, Any]:
    full_snapshots = [
        snapshot
        for snapshot in load_snapshots("resource-full")
        if parse_time(snapshot["time"]) <= as_of
    ]
    if not full_snapshots:
        raise RestoreError("No complete resource snapshot exists before the requested recovery date.")

    baseline = max(full_snapshots, key=lambda snapshot: parse_time(snapshot["time"]))
    baseline_time = parse_time(baseline["time"])
    if as_of < datetime.now(timezone.utc) - timedelta(days=6):
        if as_of.date() != baseline_time.date():
            raise RestoreError(
                "Daily resource changes are retained for seven days. For older recovery dates, "
                "select the date of a weekly full resource snapshot."
            )
    deltas = sorted(
        (
            snapshot
            for snapshot in load_snapshots("resource-delta")
            if baseline_time < parse_time(snapshot["time"]) <= as_of
        ),
        key=lambda snapshot: parse_time(snapshot["time"]),
    )

    output.mkdir(parents=True, exist_ok=True)
    resources_output = output / "resources"
    with tempfile.TemporaryDirectory(prefix="coursehubs-resource-restore-") as temporary:
        temporary_root = Path(temporary)
        baseline_dir = restore_snapshot(baseline["id"], temporary_root / "baseline")
        shutil.copytree(baseline_dir, resources_output, dirs_exist_ok=True)

        for index, snapshot in enumerate(deltas):
            delta_dir = restore_snapshot(snapshot["id"], temporary_root / f"delta-{index}")
            delta_objects = delta_dir / "objects"
            if delta_objects.exists():
                shutil.copytree(delta_objects, resources_output / "objects", dirs_exist_ok=True)
            shutil.copy2(delta_dir / "manifest.json", resources_output / "manifest.json")
            deleted_file = delta_dir / "deleted.json"
            if deleted_file.exists():
                shutil.copy2(deleted_file, resources_output / "deleted.json")

    manifest_path = resources_output / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    objects = manifest.get("objects", {})
    missing = [
        key
        for key, entry in objects.items()
        if not (resources_output / "objects" / entry["blob"]).is_file()
    ]
    if missing:
        raise RestoreError(f"The reconstructed snapshot is missing {len(missing)} resource object(s).")

    return {
        "baseline_snapshot": baseline["id"],
        "baseline_time": baseline["time"],
        "delta_snapshots_applied": len(deltas),
        "object_count": len(objects),
        "resources_directory": str(resources_output),
    }


def upload_to_empty_bucket(resources_dir: Path, bucket: str) -> None:
    if os.environ.get("RESTORE_CONFIRM", "") != "UPLOAD_TO_EMPTY_BUCKET":
        raise RestoreError(
            "Set RESTORE_CONFIRM=UPLOAD_TO_EMPTY_BUCKET to confirm upload to a new, empty bucket."
        )

    endpoint = os.environ.get("RESTORE_S3_ENDPOINT", "").strip()
    access_key = os.environ.get("RESTORE_S3_ACCESS_KEY_ID", "").strip()
    secret_key = os.environ.get("RESTORE_S3_SECRET_ACCESS_KEY", "").strip()
    region = os.environ.get("RESTORE_S3_REGION", "").strip()
    if not all((endpoint, access_key, secret_key, region)):
        raise RestoreError("Restore bucket credentials are incomplete.")

    client = boto3.client(
        "s3",
        endpoint_url=endpoint.rstrip("/"),
        aws_access_key_id=access_key,
        aws_secret_access_key=secret_key,
        region_name=region,
        config=Config(
            signature_version="s3v4",
            s3={"addressing_style": "path"},
            retries={"max_attempts": 8, "mode": "standard"},
            max_pool_connections=8,
        ),
    )

    existing = client.list_objects_v2(Bucket=bucket, MaxKeys=1)
    if existing.get("KeyCount", 0) > 0:
        raise RestoreError("The target bucket is not empty. No files were uploaded.")

    manifest = json.loads((resources_dir / "manifest.json").read_text(encoding="utf-8"))
    objects = manifest.get("objects", {})
    transfer_config = TransferConfig(multipart_threshold=64 * 1024 * 1024, max_concurrency=4)
    expected: dict[str, dict[str, Any]] = {}

    for index, (key, entry) in enumerate(objects.items(), start=1):
        blob_path = resources_dir / "objects" / entry["blob"]
        if not blob_path.is_file():
            raise RestoreError(f"The backup object for {key} is missing.")

        digest = hashlib.sha256()
        with blob_path.open("rb") as source:
            while True:
                chunk = source.read(1024 * 1024)
                if not chunk:
                    break
                digest.update(chunk)

        expected[key] = {
            "size": blob_path.stat().st_size,
            "sha256": digest.hexdigest(),
        }
        if int(entry.get("size", -1)) != expected[key]["size"]:
            raise RestoreError(f"The backup object size does not match its manifest: {key}")
        if entry.get("content_sha256") and entry["content_sha256"] != expected[key]["sha256"]:
            raise RestoreError(f"The backup object checksum does not match its manifest: {key}")

        extra_args: dict[str, Any] = {
            "ContentType": entry.get("content_type") or "application/octet-stream",
        }
        if entry.get("metadata"):
            extra_args["Metadata"] = entry["metadata"]
        for field, s3_field in (
            ("cache_control", "CacheControl"),
            ("content_disposition", "ContentDisposition"),
            ("content_encoding", "ContentEncoding"),
            ("content_language", "ContentLanguage"),
        ):
            if entry.get(field):
                extra_args[s3_field] = entry[field]

        client.upload_file(
            str(blob_path),
            bucket,
            key,
            ExtraArgs=extra_args,
            Config=transfer_config,
        )
        if index % 25 == 0 or index == len(objects):
            print(f"Uploaded {index} of {len(objects)} restored resource(s).")

    paginator = client.get_paginator("list_objects_v2")
    actual: dict[str, int] = {}
    for page in paginator.paginate(Bucket=bucket):
        for item in page.get("Contents", []):
            actual[str(item["Key"])] = int(item.get("Size", 0))

    expected_sizes = {key: value["size"] for key, value in expected.items()}
    if actual != expected_sizes:
        raise RestoreError("The destination object names or sizes do not match the recovery manifest.")

    for index, (key, expected_entry) in enumerate(expected.items(), start=1):
        response = client.get_object(Bucket=bucket, Key=key)
        digest = hashlib.sha256()
        bytes_read = 0
        try:
            body = response["Body"]
            while True:
                chunk = body.read(1024 * 1024)
                if not chunk:
                    break
                digest.update(chunk)
                bytes_read += len(chunk)
        finally:
            response["Body"].close()

        if bytes_read != expected_entry["size"] or digest.hexdigest() != expected_entry["sha256"]:
            raise RestoreError(f"The restored object failed its content verification: {key}")

        if index % 25 == 0 or index == len(expected):
            print(f"Verified contents of {index} of {len(expected)} restored resource(s).")


def main() -> int:
    parser = argparse.ArgumentParser(description="Restore CourseHubs resource backups.")
    parser.add_argument("--as-of", help="Recovery date/time in UTC; YYYY-MM-DD selects the end of that day.")
    parser.add_argument("--output", required=True, help="New or empty local directory for reconstructed resources.")
    parser.add_argument("--upload", action="store_true", help="Upload the reconstructed data to an empty bucket.")
    parser.add_argument("--target-bucket", help="Existing empty destination bucket for an optional upload.")
    arguments = parser.parse_args()

    if arguments.upload and not arguments.target_bucket:
        raise RestoreError("--target-bucket is required when --upload is selected.")

    if arguments.as_of:
        try:
            if len(arguments.as_of) == 10:
                requested_date = date.fromisoformat(arguments.as_of)
                as_of = datetime.combine(requested_date, time.max, timezone.utc)
            else:
                as_of = datetime.fromisoformat(arguments.as_of.replace("Z", "+00:00")).astimezone(timezone.utc)
        except ValueError as error:
            raise RestoreError("The --as-of value must be an ISO date or timestamp.") from error
    else:
        as_of = datetime.now(timezone.utc)

    output = Path(arguments.output).expanduser().resolve()
    if output.exists() and any(output.iterdir()):
        raise RestoreError("The output directory must be new or empty. No existing files were changed.")
    output.mkdir(parents=True, exist_ok=True)

    result = build_resource_snapshot(as_of, output)
    print(json.dumps(result, indent=4))

    if arguments.upload:
        upload_to_empty_bucket(output / "resources", arguments.target_bucket)
        print("Resource restore upload completed and destination object count/size were verified.")

    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        print(f"Resource restore failed: {error}", file=sys.stderr)
        raise SystemExit(1)
