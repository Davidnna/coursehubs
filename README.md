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
backend/
    bin/                 Local development commands
    database/
        migrations/      Versioned database changes
    public/              Web entry point
    src/
        Controllers/     Application request handlers
        Http/            Routing and responses
        Security/        Authentication and access checks
        Support/         Shared application services

frontend/
    public/               Static assets
    src/
        api/              Application service requests
        auth/             Sign-in state and route protection
        components/       Shared interface components
        pages/            Public and signed-in pages
```

