#!/usr/bin/env python3
"""Create encrypted full or incremental snapshots of the CourseHubs resource bucket."""

from __future__ import annotations

import concurrent.futures
import hashlib
import json
import os
import shutil
import subprocess
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import boto3
from botocore.config import Config


RESTIC_HOST = os.environ.get("RESTIC_HOST", "coursehubs-production")
RESTIC_REGION = os.environ.get("BACKUP_S3_REGION", "us-east-2")
STAGING_DIR = Path(os.environ.get("BACKUP_STAGING_DIR", "/tmp/coursehubs-backup")).resolve()
RESOURCES_DIR = STAGING_DIR / "resources"
OBJECTS_DIR = RESOURCES_DIR / "objects"
MANIFEST_PATH = RESOURCES_DIR / "manifest.json"
DELETED_PATH = RESOURCES_DIR / "deleted.json"


class BackupError(RuntimeError):
    """Raised when a resource backup cannot be completed safely."""


def required_env(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise BackupError(f"Required backup setting is missing: {name}")
    return value


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
        cwd=STAGING_DIR,
        check=False,
        stdout=subprocess.PIPE if capture_output else None,
        stderr=subprocess.PIPE if capture_output else None,
    )
    if result.returncode != 0:
        if capture_output and result.stderr:
            sys.stderr.write(result.stderr.decode("utf-8", errors="replace"))
        raise BackupError(f"Backup repository operation failed: restic {arguments[0]}")
    return result


def parse_snapshot_time(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(timezone.utc)


def list_restic_snapshots(tag: str) -> list[dict[str, Any]]:
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


def load_previous_manifest() -> dict[str, Any] | None:
    snapshots = list_restic_snapshots("resource-state")
    if not snapshots:
        return None

    latest = max(snapshots, key=lambda snapshot: parse_snapshot_time(snapshot["time"]))
    manifest_result = restic_command(
        "dump",
        latest["id"],
        str(MANIFEST_PATH),
        capture_output=True,
    )
    manifest = json.loads(manifest_result.stdout.decode("utf-8"))
    if manifest.get("format_version") != 1 or not isinstance(manifest.get("objects"), dict):
        raise BackupError("The previous resource backup manifest is not recognised.")
    return manifest


def latest_full_resource_backup() -> datetime | None:
    snapshots = list_restic_snapshots("resource-full")
    if not snapshots:
        return None
    latest = max(snapshots, key=lambda snapshot: parse_snapshot_time(snapshot["time"]))
    return parse_snapshot_time(latest["time"])


def create_s3_client():
    return boto3.client(
        "s3",
        endpoint_url=required_env("SOURCE_S3_ENDPOINT").rstrip("/"),
        aws_access_key_id=required_env("SOURCE_S3_ACCESS_KEY_ID"),
        aws_secret_access_key=required_env("SOURCE_S3_SECRET_ACCESS_KEY"),
        region_name=required_env("SOURCE_S3_REGION"),
        config=Config(
            signature_version="s3v4",
            s3={"addressing_style": "path"},
            retries={"max_attempts": 8, "mode": "standard"},
            max_pool_connections=8,
        ),
    )


def list_source_objects(client, bucket: str) -> dict[str, dict[str, Any]]:
    objects: dict[str, dict[str, Any]] = {}
    paginator = client.get_paginator("list_objects_v2")

    for page in paginator.paginate(Bucket=bucket):
        for item in page.get("Contents", []):
            key = str(item["Key"])
            objects[key] = {
                "etag": str(item.get("ETag", "")).strip('"'),
                "size": int(item.get("Size", 0)),
                "last_modified": item["LastModified"].astimezone(timezone.utc).isoformat(),
                "blob": hashlib.sha256(key.encode("utf-8")).hexdigest(),
            }

    return objects


def object_changed(previous: dict[str, Any] | None, current: dict[str, Any]) -> bool:
    if previous is None:
        return True
    return any(
        previous.get(field) != current.get(field)
        for field in ("etag", "size", "last_modified")
    )


def calculate_resource_changes(
    previous_objects: dict[str, dict[str, Any]],
    current_listing: dict[str, dict[str, Any]],
    full_backup: bool,
) -> tuple[list[str], list[str], dict[str, dict[str, Any]]]:
    if full_backup:
        changed_keys = sorted(current_listing)
    else:
        changed_keys = sorted(
            key
            for key, current in current_listing.items()
            if object_changed(previous_objects.get(key), current)
        )

    deleted_keys = sorted(set(previous_objects) - set(current_listing))
    next_manifest: dict[str, dict[str, Any]] = {}

    for key, current in current_listing.items():
        previous = previous_objects.get(key)
        if key not in changed_keys and previous is not None:
            preserved = dict(previous)
            preserved.update({
                "etag": current["etag"],
                "size": current["size"],
                "last_modified": current["last_modified"],
                "blob": current["blob"],
            })
            next_manifest[key] = preserved
        else:
            next_manifest[key] = dict(current)

    return changed_keys, deleted_keys, next_manifest


def download_object(client, bucket: str, key: str, destination: Path) -> dict[str, Any]:
    response = client.get_object(Bucket=bucket, Key=key)
    destination.parent.mkdir(parents=True, exist_ok=True)

    try:
        with destination.open("wb") as output:
            body = response["Body"]
            while True:
                chunk = body.read(1024 * 1024)
                if not chunk:
                    break
                output.write(chunk)
    finally:
        response["Body"].close()

    metadata: dict[str, Any] = {
        "content_type": response.get("ContentType", "application/octet-stream"),
        "metadata": response.get("Metadata", {}),
    }
    for source_field, manifest_field in (
        ("CacheControl", "cache_control"),
        ("ContentDisposition", "content_disposition"),
        ("ContentEncoding", "content_encoding"),
        ("ContentLanguage", "content_language"),
    ):
        if response.get(source_field):
            metadata[manifest_field] = response[source_field]

    return metadata


def backup_bucket_usage_bytes() -> int:
    client = boto3.client(
        "s3",
        endpoint_url=required_env("BACKUP_S3_ENDPOINT").rstrip("/"),
        aws_access_key_id=required_env("AWS_ACCESS_KEY_ID"),
        aws_secret_access_key=required_env("AWS_SECRET_ACCESS_KEY"),
        region_name=required_env("BACKUP_S3_REGION"),
        config=Config(
            signature_version="s3v4",
            s3={"addressing_style": "path"},
            retries={"max_attempts": 8, "mode": "standard"},
            max_pool_connections=4,
        ),
    )
    total = 0
    paginator = client.get_paginator("list_objects_v2")
    for page in paginator.paginate(Bucket=required_env("BACKUP_S3_BUCKET")):
        total += sum(int(item.get("Size", 0)) for item in page.get("Contents", []))
    return total


def check_backup_capacity() -> None:
    database_dump = STAGING_DIR / "database" / "database.dump"
    if not database_dump.is_file() or database_dump.stat().st_size == 0:
        raise BackupError("The database dump is missing; no backup data was written.")

    staged_bytes = database_dump.stat().st_size
    if RESOURCES_DIR.exists():
        staged_bytes += sum(path.stat().st_size for path in RESOURCES_DIR.rglob("*") if path.is_file())

    safety_limit = int(os.environ.get("MAX_BACKUP_BUCKET_BYTES", "4500000000"))
    current_usage = backup_bucket_usage_bytes()
    estimated_usage = current_usage + staged_bytes + (32 * 1024 * 1024)
    print(
        f"Backup storage check: current={current_usage} bytes, "
        f"estimated_addition={staged_bytes} bytes, safety_limit={safety_limit} bytes."
    )
    if estimated_usage > safety_limit:
        raise BackupError(
            "The backup bucket is approaching its free storage safety limit. "
            "No new backup snapshot was uploaded; review storage usage and retention."
        )


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(
        json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":")) + "\n",
        encoding="utf-8",
    )
    temporary.replace(path)


def main() -> int:
    STAGING_DIR.mkdir(parents=True, exist_ok=True)
    if RESOURCES_DIR.exists():
        shutil.rmtree(RESOURCES_DIR)
    OBJECTS_DIR.mkdir(parents=True, exist_ok=True)

    bucket = required_env("SOURCE_S3_BUCKET")
    client = create_s3_client()
    previous_manifest = load_previous_manifest()
    latest_full_time = latest_full_resource_backup()
    current_listing = list_source_objects(client, bucket)

    force_full = os.environ.get("FORCE_FULL_RESOURCES", "false").lower() in {"1", "true", "yes"}
    now = datetime.now(timezone.utc)
    is_sunday = now.weekday() == 6
    full_is_overdue = latest_full_time is None or now - latest_full_time >= timedelta(days=7)
    full_backup = force_full or previous_manifest is None or is_sunday or full_is_overdue
    previous_objects = (previous_manifest or {}).get("objects", {})
    changed_keys, deleted_keys, next_manifest = calculate_resource_changes(
        previous_objects,
        current_listing,
        full_backup,
    )

    if not full_backup and not changed_keys and not deleted_keys:
        check_backup_capacity()
        print("Resource backup: no object changes detected; database backup will still run.")
        return 0

    def fetch(key: str) -> tuple[str, dict[str, Any]]:
        entry = next_manifest[key]
        destination = OBJECTS_DIR / entry["blob"]
        metadata = download_object(client, bucket, key, destination)
        return key, metadata

    if changed_keys:
        print(f"Resource backup: downloading {len(changed_keys)} changed object(s).")
        with concurrent.futures.ThreadPoolExecutor(max_workers=4) as executor:
            for key, metadata in executor.map(fetch, changed_keys):
                next_manifest[key].update(metadata)

    manifest = {
        "format_version": 1,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "object_count": len(next_manifest),
        "objects": next_manifest,
    }
    write_json(MANIFEST_PATH, manifest)
    write_json(DELETED_PATH, {"keys": deleted_keys})
    check_backup_capacity()

    snapshot_tag = "resource-full" if full_backup else "resource-delta"
    restic_command(
        "backup",
        "--host",
        RESTIC_HOST,
        "--tag",
        "resource-state",
        "--tag",
        snapshot_tag,
        str(RESOURCES_DIR),
    )

    mode = "full" if full_backup else "incremental"
    print(
        f"Resource backup completed: mode={mode}, objects={len(next_manifest)}, "
        f"downloaded={len(changed_keys)}, deleted={len(deleted_keys)}."
    )
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        print(f"Resource backup failed: {error}", file=sys.stderr)
        raise SystemExit(1)
