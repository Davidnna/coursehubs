# CourseHubs

CourseHubs is an independently operated academic platform developed for the Ebonyi State University (EBSU) community. It is not affiliated with, endorsed by or operated by EBSU. Its public website introduces the platform, while its authenticated workspace provides account-based access to academic tools and resources.

## What the application includes

- Public home, about, features, how-it-works, contact, FAQ, Privacy Policy and Terms of Service pages.
- Student and staff registration with email verification.
- Email/password login, Google sign-in for existing accounts, logout, password recovery and protected application routes.
- Account settings for profile details, profile photo, verified email changes, password changes and account deletion.
- Private dashboard, live course catalogue and course details backed by PostgreSQL.
- Administrator-only academic management for faculties, departments, programmes, academic sessions, courses, course offerings and lecturer assignments, with a temporary CSV importer for initial academic data setup.

- Course offerings support cross-department service/ancillary courses and credit loads up to 30 units, including SIWES and industrial training.
- Student registration can be associated with a faculty, department and programme once the academic directory is configured.
- Purpose-specific transactional email through Nylas, with replies directed to the CourseHubs support mailbox.
- PostgreSQL persistence with versioned, automatically applied database migrations.
- Responsive layouts, accessible navigation, reduced-motion support and animated interface elements.

The course resource library supports eligible contributors submitting course materials, past examination questions and model answers; administrator moderation; approved-only publication; and controlled previews and downloads. Broader learning workflows will be developed incrementally. Course records and course offerings in the catalogue are database-driven.

## Technology

- Frontend: React, Vite and React Router.
- Backend: PHP 8.3, Apache and PDO PostgreSQL.
- Database: PostgreSQL (Neon supported).
- Email: Nylas Transactional Send and Nylas Agent Accounts for inbound support mail.
- Hosting: Render.

## Requirements

- Git.
- Node.js 22.12 or newer (Node.js 24 LTS is also suitable) and npm.
- PHP 8.3 or newer with `pdo_pgsql` and `curl` extensions enabled.
- An accessible PostgreSQL database. A new empty Neon database can be used.
- A Nylas application, registered sending domain and Nylas Agent Account for transactional email delivery and inbound support email.
- A Google Cloud OAuth 2.0 Web application client for Google sign-in.

## Clone the repository

```bash
git clone <YOUR_GITHUB_REPOSITORY_URL>
cd CourseHubs
```

Replace `<YOUR_GITHUB_REPOSITORY_URL>` with the HTTPS or SSH URL of your GitHub repository.

## Configure the backend

Copy the backend environment template:

```bash
# macOS / Linux
cp backend/.env.example backend/.env

# Windows PowerShell
Copy-Item backend/.env.example backend/.env
```

Edit `backend/.env` and set the following values:

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection URL; use the direct Neon connection string with SSL required. |
| `FRONTEND_ORIGIN` | Local frontend origin, normally `http://localhost:5173`. |
| `JWT_SECRET` | A long, random secret used to sign authentication tokens. |
| `INITIAL_SUPER_ADMIN_EMAIL` | Optional one-time bootstrap. Set this to the exact email of an existing, verified account to grant the first super-administrator role. Remove it after the successful bootstrap log. |
| `NYLAS_API_KEY` | Nylas application API key. |
| `NYLAS_API_URI` | Nylas API base URL, normally `https://api.us.nylas.com`. |
| `NYLAS_DOMAIN` | Registered Nylas sending domain. |
| `NYLAS_VERIFY_FROM_EMAIL` | Verification sender address on the registered domain. |
| `NYLAS_VERIFY_FROM_NAME` | Verification sender display name. |
| `NYLAS_PASSWORD_RESET_FROM_EMAIL` | Password-reset sender address on the registered domain. |
| `NYLAS_PASSWORD_RESET_FROM_NAME` | Password-reset sender display name. |
| `NYLAS_SUPPORT_EMAIL` | Receiving support mailbox on the registered Nylas domain, normally `support@your-domain.nylas.email`. Provision this as a Nylas Agent Account. |
| `GOOGLE_CLIENT_ID` | Google OAuth 2.0 Web application client ID. |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret; backend only. |
| `GOOGLE_REDIRECT_URI` | Exact backend callback URL, for example `https://coursehubs-api.onrender.com/auth/google/callback`. |

Never commit `backend/.env` or expose its credentials in the frontend.

## Configure the frontend

Copy the frontend environment template:

```bash
# macOS / Linux
cp frontend/.env.example frontend/.env

# Windows PowerShell
Copy-Item frontend/.env.example frontend/.env
```

The default local API address is:

```env
VITE_API_URL=http://127.0.0.1:8000
```

## Configure Google sign-in

1. Open the Google Cloud Console and create or select a project.
2. Configure the OAuth consent screen / Google Auth Platform branding and audience. Add authorised test users while the app is in testing mode.
3. Create an OAuth client with application type **Web application**.
4. Add the frontend origin (for production, `https://coursehubs.onrender.com`) under **Authorised JavaScript origins**.
5. Add the exact backend callback URL (for production, `https://coursehubs-api.onrender.com/auth/google/callback`) under **Authorised redirect URIs**.
6. Copy the client ID and client secret into the backend environment as `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`. Set `GOOGLE_REDIRECT_URI` to the exact callback URL registered in Google.

Google sign-in uses a server-side OAuth authorization-code flow, state validation and a short-lived, single-use code exchange with the frontend. It signs in existing CourseHubs accounts whose email address matches the verified Google email, and links that Google identity to the account. Users must first complete the normal CourseHubs registration because student and staff accounts require additional academic details. The Google client secret must never be placed in a `VITE_` variable or committed to Git.

## Public legal pages and support email

The public website includes `/privacy` and `/terms`. The registration page links to both policies. CourseHubs uses `NYLAS_SUPPORT_EMAIL` as the reply-to and public privacy/support contact address. Create that address as a Nylas Agent Account on the registered Nylas domain so it can receive messages; transactional sending alone does not create an inbox.


## First administrator setup

Academic management is restricted to CourseHubs administrators. On a fresh deployment, create a normal CourseHubs account and verify its email address first. First deploy the application version that contains migration `0005_academic_management.sql` while `INITIAL_SUPER_ADMIN_EMAIL` is unset, so the bootstrap-state table is created. After that deployment is live, set `INITIAL_SUPER_ADMIN_EMAIL` in the backend environment to that exact verified email and redeploy the backend. The migration runner performs a one-time promotion to super administrator and records completion in PostgreSQL. Remove the environment variable after the successful bootstrap message appears in the Render logs. The bootstrap marker prevents the operation from running again. If the account was not yet registered and verified when the variable was first deployed, register and verify it, then redeploy once more.

After signing in again, the administrator will see **Academic management** in the workspace navigation. During initial setup, the temporary CSV importer is available at `/admin/academics/import`; it supports faculties, departments, programmes, sessions, courses and course offerings. Uploads are previewed and validated before import, existing records are skipped rather than overwritten, and a file containing validation errors is not imported. CSV files are limited to 2 MB and 1,000 data rows. This temporary tool should be removed after initial academic data setup is complete. Its sections have individual React Router URLs: `/admin/academics/overview`, `/admin/academics/structure/faculties`, `/admin/academics/structure/departments`, `/admin/academics/structure/programmes`, `/admin/academics/sessions`, `/admin/academics/courses` and `/admin/academics/offerings`. Create and edit screens have dedicated `/new` and `/:recordId/edit` routes. Browser Back and Forward navigate through the administrator’s actual page history. The administrator can create faculties, departments and programmes; add academic sessions and activate one current session; create department-owned or university-wide courses; and assign courses to programmes, levels, semesters and sessions with linked or manually entered lecturer names. University-wide courses can be offered across departments. Levels (100–600) and semesters (First and Second) are standardised lookup options.

## Account management

The private `/account` page lets signed-in users update their name and phone number, upload or remove a profile photo, request an email change (confirmed through a link sent to the new address), change their password, connect Google sign-in, and delete their account. Profile photos are resized in the browser and stored in PostgreSQL. Account deletion is a soft deletion with personal profile details anonymised so academic records can retain referential integrity.

## Run locally

### 1. Start the backend

From the repository root:

```bash
php backend/bin/dev-server.php
```

The command applies any pending database migrations before starting the local PHP server at `http://127.0.0.1:8000`. On first startup, the initial migration creates the application schema and inserts the initial academic-session and application-setting records. Later application updates add new numbered migration files; pending migrations are applied automatically at backend startup.

### 2. Start the frontend

Open a second terminal from the repository root:

```bash
cd frontend
npm ci
npm run dev
```

Vite prints the local frontend address, normally `http://localhost:5173`.

## Database migration behaviour

Database structure is managed by versioned SQL files in `backend/database/migrations/`. The backend migration runner records each applied migration and its SHA-256 checksum. It applies pending migrations in order, serialises concurrent startup attempts with a PostgreSQL advisory lock, and stops deployment if a migration fails. Applied migration files must not be edited; add a new numbered migration for every subsequent database change.

Render's Docker startup runs migrations before Apache starts. Local development uses the same migration runner through `backend/bin/dev-server.php`. A fresh database is initialised automatically; do not manually execute schema SQL in the database console.


## Course resources (Phase 2)

The resource library supports course materials, past examination questions and model answers. Signed-in students can view approved resources from each course page. Resource contributions are restricted to administrators and accounts with an approved academic role or an active lecturer/representative/adviser assignment. Non-administrator submissions enter moderation; administrators can approve or reject them with a review note.

Uploaded documents are stored in a **private Neon Object Storage bucket**, not on Render's ephemeral filesystem or in PostgreSQL. PostgreSQL stores resource metadata and the object key. PDF files can be previewed through short-lived signed URLs; PDF, DOCX and PPTX files can be downloaded. The initial upload limit is 25 MB.

### Neon Object Storage configuration

Create a private bucket named `coursehubs-resources` on the same Neon branch used by the CourseHubs backend. Create a Neon storage credential with both `storage:read` and `storage:write` permissions. Neon Object Storage uses the S3-compatible API with AWS Signature Version 4 and path-style addressing.

Add the following variables to the Render `coursehubs-api` environment:

| Variable | Value |
|---|---|
| `AWS_ENDPOINT_URL_S3` | The branch-specific S3 endpoint shown by Neon. |
| `AWS_ACCESS_KEY_ID` | The credential's `token_id` (starts with `nak_live_`). |
| `AWS_SECRET_ACCESS_KEY` | The credential's `s3_secret_access_key` (starts with `nsk_live_`). |
| `AWS_REGION` | The region shown by Neon, for example `us-east-2`. |
| `AWS_BUCKET_NAME` | `coursehubs-resources`. |

For the current CourseHubs Neon branch, the non-secret values are:

```env
AWS_ENDPOINT_URL_S3=https://br-cold-tree-bdpxjwnt.storage.c-8.us-east-2.aws.neon.tech
AWS_REGION=us-east-2
AWS_BUCKET_NAME=coursehubs-resources
```

Enter the access key ID and secret access key directly in Render. Do not send them in chat, commit them to Git, or expose them in a `VITE_` frontend variable. Do not use a Neon API token (`nt_live_...`) as an S3 access key. Keep the bucket private; the backend generates short-lived signed URLs after checking the user's access to each resource.

The storage adapter uses the PHP cURL extension and native PHP HMAC functions; no additional Composer package is required. This provider switch does not change the PostgreSQL schema or require a new database migration. The existing `0006_resource_library.sql` migration creates the resource metadata tables and is applied automatically on a fresh deployment if it has not already been applied.

### Resource routes

- `/upload` — eligible contributor upload form and personal submission history.
- `/admin/resources` — administrator moderation queue.
- Course detail pages — approved materials, past questions and model answers.

The resource API enforces authentication, contributor eligibility, file type and size checks, private storage, approved-only visibility and administrator moderation. Technical failures are written to server logs; user-facing responses remain generic.
