#!/usr/bin/env bash
set -euo pipefail

: "${RESTORE_DATABASE_URL:?Set RESTORE_DATABASE_URL to a new, empty recovery database.}"
: "${RESTORE_CONFIRM:?Set RESTORE_CONFIRM=RESTORE_TO_EMPTY_DATABASE after checking the target.}"
: "${RESTIC_REPOSITORY:?Set RESTIC_REPOSITORY to the CourseHubs backup repository.}"
: "${RESTIC_PASSWORD:?Set RESTIC_PASSWORD to the repository encryption password.}"
: "${AWS_ACCESS_KEY_ID:?Set the backup bucket access key.}"
: "${AWS_SECRET_ACCESS_KEY:?Set the backup bucket secret key.}"
: "${AWS_DEFAULT_REGION:?Set the backup bucket region.}"

if [[ "$RESTORE_CONFIRM" != "RESTORE_TO_EMPTY_DATABASE" ]]; then
    printf '%s\n' 'Restore stopped. The confirmation value did not match.' >&2
    exit 1
fi

RESTIC_HOST="${RESTIC_HOST:-coursehubs-production}"
RESTIC_OPTIONS=(
    -o "s3.region=${AWS_DEFAULT_REGION}"
    -o 's3.bucket-lookup=path'
)

snapshot_json="$(restic "${RESTIC_OPTIONS[@]}" snapshots --json --tag database --host "$RESTIC_HOST")"
snapshot_id="$(python3 - "$snapshot_json" "${RESTORE_SNAPSHOT_ID:-}" "${RESTORE_AS_OF:-}" <<'PY'
import json
import sys
from datetime import datetime, time, timezone

snapshots = json.loads(sys.argv[1])
requested_id = sys.argv[2]
requested_as_of = sys.argv[3]

if requested_id:
    selected = next((item for item in snapshots if item["id"] == requested_id), None)
    print(selected["id"] if selected else "")
elif requested_as_of:
    if len(requested_as_of) == 10:
        target_date = datetime.fromisoformat(requested_as_of).date()
        target = datetime.combine(target_date, time.max, timezone.utc)
    else:
        target = datetime.fromisoformat(requested_as_of.replace("Z", "+00:00")).astimezone(timezone.utc)
    eligible = [
        item for item in snapshots
        if datetime.fromisoformat(item["time"].replace("Z", "+00:00")).astimezone(timezone.utc) <= target
    ]
    selected = max(eligible, key=lambda item: item["time"]) if eligible else None
    print(selected["id"] if selected else "")
else:
    selected = max(snapshots, key=lambda item: item["time"]) if snapshots else None
    print(selected["id"] if selected else "")
PY
)"

if [[ -z "$snapshot_id" ]]; then
    printf '%s\n' 'No database backup snapshot was found.' >&2
    exit 1
fi

restore_root="$(mktemp -d)"
trap 'rm -rf "$restore_root"' EXIT

restic "${RESTIC_OPTIONS[@]}" restore "$snapshot_id" --target "$restore_root"
dump_file="$(find "$restore_root" -type f -name database.dump -print -quit)"

if [[ -z "$dump_file" || ! -s "$dump_file" ]]; then
    printf '%s\n' 'The selected database backup does not contain a valid dump file.' >&2
    exit 1
fi

printf '%s\n' 'Checking that the recovery database has no existing application objects.'
docker run --rm \
    -e RESTORE_DATABASE_URL \
    postgres:18-alpine \
    sh -euc '
        count="$(psql "$RESTORE_DATABASE_URL" -v ON_ERROR_STOP=1 -Atqc "
            SELECT
                (SELECT COUNT(*) FROM pg_class c
                 JOIN pg_namespace n ON n.oid = c.relnamespace
                 WHERE n.nspname = current_schema()
                   AND ASCII(c.relkind) IN (114, 112, 118, 109, 83, 102))
                + (SELECT COUNT(*) FROM pg_proc p
                   JOIN pg_namespace n ON n.oid = p.pronamespace
                   WHERE n.nspname = current_schema())
                + (SELECT COUNT(*) FROM pg_type t
                   JOIN pg_namespace n ON n.oid = t.typnamespace
                   WHERE n.nspname = current_schema()
                     AND ASCII(t.typtype) IN (99, 100, 101, 114))
        ")"
        if [ "$count" != "0" ]; then
            printf "%s\n" "The recovery database is not empty. No data was restored." >&2
            exit 1
        fi
    '

printf '%s\n' 'Validating the encrypted PostgreSQL archive.'
docker run --rm \
    -v "$dump_file:/backup/database.dump:ro" \
    postgres:18-alpine \
    sh -euc 'pg_restore --list /backup/database.dump >/dev/null'

printf '%s\n' "Restoring database snapshot ${snapshot_id} into the confirmed empty target."
docker run --rm \
    -e RESTORE_DATABASE_URL \
    -v "$dump_file:/backup/database.dump:ro" \
    postgres:18-alpine \
    sh -euc 'pg_restore --no-owner --no-acl --exit-on-error --single-transaction --dbname="$RESTORE_DATABASE_URL" /backup/database.dump'

printf '%s\n' 'Database restore completed.'
