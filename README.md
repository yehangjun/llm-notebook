# AI Notebook MVP Backend

Single API backend MVP for AI information aggregation + bookmarks + notes + basic social features.

## Stack

- FastAPI (single API service)
- PostgreSQL (core data)
- Redis (cache/queue placeholder)
- Docker Compose (quick local verification)

## Quick Start

1. Initialize and boot services:

```bash
./scripts/init.sh
```

2. Verify API:

```bash
./scripts/smoke_test.sh
```

3. Clean all local containers and volumes:

```bash
./scripts/clean.sh
```

4. Run migrations manually (for existing DB volumes):

```bash
./scripts/migrate.sh
```

5. Open docs:

- Frontend: `http://localhost:8000/`
- Swagger: `http://localhost:8000/docs`

## Environment

`.env` is created from `.env.example` on first run.

## API (MVP)

- `POST /auth/email/send-code` send email OTP (dev env returns debug code)
- `POST /auth/email/verify-code` verify OTP and login
- `GET /auth/sso/providers`
- `POST /auth/sso/mock-login` mock SSO login for development
- `GET /auth/me`
- `GET /feed`
- `POST /bookmarks/{article_id}`
- `GET /bookmarks`
- `POST /notes`
- `GET /notes/me`
- `PATCH /notes/{note_id}`
- `POST /social/follow/{user_id}`
- `GET /social/public-notes/{user_id}`

## Database Initialization

PostgreSQL schema and demo seed data are auto-applied from:

- `deploy/postgres/init/001_schema.sql`
- `deploy/postgres/init/002_seed.sql`

Incremental auth migration for existing volumes:

- `deploy/postgres/migrations/001_auth_email_sso.sql`

## Notes

- Current MVP auth is `email OTP + mock SSO` for development-stage verification.
- `phone` field is retained in user profile schema but is not collected in current flow.
- Keep this as a modular monolith so each module can be split into microservices later.
