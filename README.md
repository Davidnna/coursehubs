# CourseHubs

CourseHubs is an independently operated academic platform developed for the Ebonyi State University (EBSU) community. It is not affiliated with, endorsed by, or operated by Ebonyi State University.

## About the application

CourseHubs helps students find academic materials organised around their courses and helps approved academic contributors share useful learning resources.

The application includes:

- Public home, about, features, help, contact, privacy and terms pages.
- Student and staff accounts, email verification, sign-in and account management, including password setup for Google-only accounts and protection against self-deletion while administrator appointments remain active.
- Google sign-in for registered accounts.
- Authentication abuse protection, including sign-in throttling, temporary account lockouts and rate-limited password recovery and verification emails.
- An academic directory covering faculties, departments, degree programmes, courses and academic sessions.
- Course information organised by degree programme, level, semester and session.
- A searchable library of approved lecture materials, past questions and model answers.
- Resource bookmarks, recently viewed resources and resource reporting.
- Moderation of submitted academic resources.
- Academic profile correction requests and administrator review.
- Management of lecturers, course representatives and course advisers.
- Administrative tools for maintaining academic information and platform content.
- Administrator management for authorised institution, faculty and department leaders, including controlled appointments across academic units.
- Scoped administration that limits academic records, staff assignments, resource uploads and moderation, and academic information reviews to authorised faculties and departments.
- Scope-specific workspace names, navigation and page descriptions that reflect each administrator's assigned academic unit.

Access to features depends on a member's account and assigned academic responsibilities.

## Technology

- Frontend: React, Vite and React Router.
- Backend: PHP 8.3 and Apache.
- Database: PostgreSQL.

## Requirements

Install the following before running CourseHubs locally:

- Git.
- Node.js 22.12 or newer and npm.
- PHP 8.3 or newer with the `pdo_pgsql` and `curl` extensions.
- Access to a PostgreSQL database.

Email delivery, Google sign-in and private resource uploads require their corresponding service credentials. The example environment files list the supported settings.

## Clone the repository

Replace the repository URL with the HTTPS or SSH URL for the CourseHubs GitHub repository.

```bash
git clone <YOUR_GITHUB_REPOSITORY_URL> coursehubs
cd coursehubs
```

## Configure the backend

Create the local backend environment file.

macOS or Linux:

```bash
cp backend/.env.example backend/.env
```

Windows PowerShell:

```powershell
Copy-Item backend/.env.example backend/.env
```

Set the database connection, frontend address and authentication secret in `backend/.env`. Add the relevant credentials if you want to use email delivery, Google sign-in and resource uploads locally.

Do not commit `.env` files or share their contents. Keep real credentials private.

## Configure the frontend

macOS or Linux:

```bash
cp frontend/.env.example frontend/.env
```

Windows PowerShell:

```powershell
Copy-Item frontend/.env.example frontend/.env
```

The default local API address is `http://127.0.0.1:8000`. Change `VITE_API_URL` only if the backend is running at a different address.

## Run CourseHubs locally

Open two terminal windows from the repository root.

In the first terminal, start the backend:

```bash
php backend/bin/dev-server.php
```

In the second terminal, install frontend dependencies and start the development server:

```bash
cd frontend
npm ci
npm run dev
```

Open the local address printed by Vite, normally `http://localhost:5173`.

The backend applies pending database setup changes when it starts. Use a development database, not the production database, when testing local changes.

To test administrator features against a fresh local database, first register and verify a local account, then use the one-time initial administrator setup setting documented in `backend/.env.example`. Remove that setting after the local administrator has been provisioned. Never use this process with production accounts or credentials.

## Production response security

The API applies a one-year HTTP Strict Transport Security policy at the Apache response layer, scoped to the API hostname without `includeSubDomains`. It also disables PHP version disclosure and configures Apache to suppress its version and signature details. Private API responses, including fatal-error responses, use `Cache-Control: no-store, private`.

The public hosting layer may add diagnostic response headers that are not controlled by the application container. Verify public response headers after deployment; do not assume an origin-level configuration can remove headers injected by the hosting or proxy layer.

## Automated backups (maintainers)

### Test database recovery safely

The manually triggered `CourseHubs database recovery test` workflow restores the latest database snapshot into a separate Neon database named `coursehubs_recovery`. It requires the `COURSEHUBS_RECOVERY_DATABASE_URL` repository secret and an explicit confirmation checkbox. The workflow verifies that the destination is in a different Neon project from production, uses a direct connection, and is empty before restoring. It never targets the production database.

After a successful recovery test, inspect the GitHub Actions summary and verify expected CourseHubs tables. Keep the recovery database until the test has been reviewed; delete it only when it is no longer needed. Do not share connection strings or workflow logs containing credentials.


CourseHubs supports scheduled, encrypted backups using GitHub Actions and a separate private Neon Object Storage bucket. The backup workflow does not run inside the production application and does not change production data.

### Backup schedule and retention

- PostgreSQL: a complete custom-format dump every day, retaining seven daily and four weekly recovery points.
- Academic resources: changed or new objects are captured incrementally each day; a complete resource snapshot is created every Sunday. Seven daily incremental snapshots and four weekly full snapshots are retained.
- Restic encrypts the backup repository before data is written to the private backup bucket. The repository password is required for recovery and must be stored separately from the backup files.
- The workflow stops before uploading a new snapshot if estimated visible backup-bucket use would exceed a 4.5 GB safety ceiling, leaving headroom below the current 5 GB Neon Free Object Storage allowance. This is a conservative guard, not a billing guarantee: provider-side version retention and plan changes must still be monitored.
- The scheduled workflow runs at 02:17 UTC (03:17 in Nigeria). GitHub may start scheduled workflows later during periods of high load.

Resource backups use object metadata to identify changes and download only new or changed files on ordinary days. A weekly full snapshot provides a complete resource recovery point. Database exports are full dumps, so the entire compressed database is transferred on each scheduled run. Monitor Neon outbound-transfer usage, both projects’ storage, and GitHub Actions minutes; if any free allowance approaches its limit, reduce backup frequency or pause the workflow rather than allow usage-based charges.

### One-time production backup role

Run `scripts/backup/create_backup_role.sql` in the production database using an owner-level account. Replace the password placeholder with a strong, unique password before running it. This role has read-only access for database dumps; do not use the application's production owner credentials for scheduled backups.

Use the direct, unpooled PostgreSQL connection string for this role. Do not use a pooled connection string for `pg_dump`.

### GitHub Actions secrets

Add the following repository secrets under **Settings → Secrets and variables → Actions**. Never commit these values or place them in application source files.

| Secret | Purpose |
| --- | --- |
| `COURSEHUBS_BACKUP_DATABASE_URL` | Direct PostgreSQL connection string for the read-only production backup role |
| `COURSEHUBS_SOURCE_S3_ENDPOINT` | Production Neon Object Storage endpoint |
| `COURSEHUBS_SOURCE_S3_ACCESS_KEY_ID` | Production storage credential with read-only access |
| `COURSEHUBS_SOURCE_S3_SECRET_ACCESS_KEY` | Secret for the production read-only storage credential |
| `COURSEHUBS_SOURCE_S3_REGION` | Production storage region, normally `us-east-2` |
| `COURSEHUBS_SOURCE_S3_BUCKET` | Production resource bucket, currently `coursehubs-resources` |
| `COURSEHUBS_BACKUP_S3_ENDPOINT` | Backup project's Neon Object Storage endpoint |
| `COURSEHUBS_BACKUP_S3_ACCESS_KEY_ID` | Backup storage credential with read and write access, including object deletion for retention pruning |
| `COURSEHUBS_BACKUP_S3_SECRET_ACCESS_KEY` | Secret for the backup storage credential |
| `COURSEHUBS_BACKUP_S3_REGION` | Backup storage region, normally `us-east-2` |
| `COURSEHUBS_BACKUP_S3_BUCKET` | Private backup bucket, currently `coursehubs-backups` |
| `COURSEHUBS_RESTIC_PASSWORD` | Strong, unique encryption password for the backup repository |
| `COURSEHUBS_RECOVERY_DATABASE_URL` | Direct connection string for the separate, empty `coursehubs_recovery` database used only for non-production recovery tests |
| `COURSEHUBS_RESOURCE_RECOVERY_S3_ENDPOINT` | Backup project's Neon Object Storage endpoint for the separate resource recovery bucket |
| `COURSEHUBS_RESOURCE_RECOVERY_S3_ACCESS_KEY_ID` | Read/write storage credential for the resource recovery bucket |
| `COURSEHUBS_RESOURCE_RECOVERY_S3_SECRET_ACCESS_KEY` | Secret for the resource recovery bucket credential |
| `COURSEHUBS_RESOURCE_RECOVERY_S3_REGION` | Region for the resource recovery bucket |

Create separate storage credentials for the production source and backup destination. The source credential should only read/list the production resource bucket. The destination credential must be able to list, read, write and delete objects in the private backup bucket so retention pruning can operate. Use the endpoint and region shown for the relevant branch in Neon's Storage connection settings.

Generate the Restic password locally with a password manager or a cryptographically secure generator, for example `openssl rand -base64 48`. Save it in a password manager as well as the GitHub Actions secret. Losing this password makes encrypted backups unrecoverable.

### Initialise and run the workflow

1. Commit `.github/workflows/coursehubs-backup.yml` and `scripts/backup/` to the repository's default branch.
2. Add all required GitHub Actions secrets.
3. Open **GitHub → Actions → CourseHubs backups → Run workflow**.
4. On the first run only, select `Initialize the encrypted backup repository` and start the workflow. This creates the Restic repository under the `coursehubs-restic` prefix in the private backup bucket and performs the first backup.
5. Leave the initialization option off for every later run. The workflow then runs automatically each day. Use the manual full-resource option only when an additional complete resource snapshot is required.

Do not initialise the same repository a second time. If the repository password or endpoint is changed, stop and review the existing repository before creating another one.

### Resource recovery test

The manually triggered `CourseHubs resource recovery test` workflow reconstructs the latest available resource snapshot from the encrypted Restic repository and uploads it to the separate, empty `coursehubs-resources-recovery` bucket. It requires the four `COURSEHUBS_RESOURCE_RECOVERY_S3_*` repository secrets and an explicit confirmation checkbox. The workflow checks that the destination endpoint differs from the production resource endpoint, and the restore script refuses to upload if the destination bucket contains any objects. It verifies the restored object count and total size against the recovery manifest. It never writes to the production resource bucket or the encrypted backup bucket.

To run it, open **GitHub → Actions → CourseHubs resource recovery test → Run workflow**, select the default branch, confirm that `coursehubs-resources-recovery` is empty, and start the workflow. Review the workflow summary and verify the recovered objects in the Neon Storage browser. Keep the recovery bucket until the test has been reviewed; delete it only when it is no longer needed.

### Recovery

Database recovery must target a new, empty recovery database. It is not an in-place production rollback. Install Docker and Restic, export the backup repository settings (`RESTIC_REPOSITORY`, `RESTIC_PASSWORD`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, and `AWS_DEFAULT_REGION`), set `RESTORE_DATABASE_URL` to the empty target database, and set `RESTORE_CONFIRM=RESTORE_TO_EMPTY_DATABASE`. Then run:

```bash
bash scripts/backup/restore_database.sh
```

The script checks that the target has no application tables and refuses to proceed without the exact confirmation value. To restore an older retained database snapshot, set `RESTORE_AS_OF=YYYY-MM-DD` or provide a validated `RESTORE_SNAPSHOT_ID`. Review the recovered database before planning any production cutover.

To reconstruct the resource library locally for a selected recovery date:

```bash
python3 -m pip install -r scripts/backup/requirements.txt
python3 scripts/backup/restore_resources.py --as-of 2026-11-10 --output ./coursehubs-resource-recovery
```

The output contains `resources/manifest.json` and the corresponding object files. The seven most recent daily resource delta snapshots are retained; older recovery dates must match one of the retained weekly full snapshots. For an optional upload, create a separate, empty destination bucket first, set `RESTORE_S3_ENDPOINT`, `RESTORE_S3_ACCESS_KEY_ID`, `RESTORE_S3_SECRET_ACCESS_KEY`, `RESTORE_S3_REGION`, and `RESTORE_CONFIRM=UPLOAD_TO_EMPTY_BUCKET`, then run the same command with `--upload --target-bucket <empty-bucket-name>`. The script refuses to upload to a non-empty bucket and does not delete existing objects. Do not use the bucket containing the Restic repository as the resource restore destination.

A backup is considered verified only after the scheduled workflow succeeds and a recovery test has successfully reconstructed the database and resource files in a non-production destination.

## Useful frontend commands

Run the production build:

```bash
cd frontend
npm run build
```

Run the code checks:

```bash
npm run lint
```

## Project structure

```text
.github/
    workflows/            Scheduled maintenance workflows
scripts/
    backup/               Backup, recovery and backup-role setup
backend/
    bin/                  Local development commands
    database/
        migrations/       Versioned database changes
    public/               Web entry point
    src/
        Controllers/      Application request handlers
        Http/             Routing and responses
        Security/         Authentication and access checks
        Support/          Shared application services

frontend/
    public/               Static assets
    src/
        api/               Application service requests
        auth/              Sign-in state and route protection
        components/        Shared interface components
        pages/             Public and signed-in pages
```

