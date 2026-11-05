# CourseHubs

CourseHubs is an academic resource platform for the Computer Science community. Its public website introduces the platform, while its authenticated workspace provides account-based access to academic tools and resources.

## What the application includes

- Public home, about, features, how-it-works, contact and FAQ pages.
- Student and staff registration with email verification.
- Login, logout, password recovery and protected application routes.
- Private dashboard, course catalogue, course details and resource contribution entry point.
- Purpose-specific transactional email through Nylas.
- PostgreSQL persistence with versioned, automatically applied database migrations.
- Responsive layouts, accessible navigation, reduced-motion support and animated interface elements.

Some academic workspace capabilities are being developed incrementally. The course catalogue may contain preview content until live course-management services are completed.

## Technology

- Frontend: React, Vite and React Router.
- Backend: PHP 8.3, Apache and PDO PostgreSQL.
- Database: PostgreSQL (Neon supported).
- Email: Nylas Transactional Send.
- Hosting: Render.

## Requirements

- Git.
- Node.js 22.12 or newer (Node.js 24 LTS is also suitable) and npm.
- PHP 8.3 or newer with `pdo_pgsql` and `curl` extensions enabled.
- An accessible PostgreSQL database. A new empty Neon database can be used.
- A Nylas application and registered sending domain for real verification and password-reset email delivery.

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
| `NYLAS_API_KEY` | Nylas application API key. |
| `NYLAS_API_URI` | Nylas API base URL, normally `https://api.us.nylas.com`. |
| `NYLAS_DOMAIN` | Registered Nylas sending domain. |
| `NYLAS_VERIFY_FROM_EMAIL` | Verification sender address on the registered domain. |
| `NYLAS_VERIFY_FROM_NAME` | Verification sender display name. |
| `NYLAS_PASSWORD_RESET_FROM_EMAIL` | Password-reset sender address on the registered domain. |
| `NYLAS_PASSWORD_RESET_FROM_NAME` | Password-reset sender display name. |

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

Database structure is managed by versioned SQL files in `backend/database/migrations/`. Use four-digit filenames such as `0004_add_course_reviews.sql`. The backend migration runner records each applied migration and its SHA-256 checksum. It validates the full migration list before applying changes, applies pending migrations in order, serialises concurrent startup attempts with a PostgreSQL advisory lock, and stops deployment if a migration fails. It also recognises the two legacy migration filenames from earlier CourseHubs releases and maps them to their canonical four-digit migrations during this transition. Applied migration files must not be edited; add a new numbered migration for every subsequent database change.

Render's Docker startup runs migrations before Apache starts. Local development uses the same migration runner through `backend/bin/dev-server.php`. A fresh database is initialised automatically; do not manually execute schema SQL in the database console.
