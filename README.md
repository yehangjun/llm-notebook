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

3. Open docs:

- Swagger: `http://localhost:8000/docs`

## Environment

`.env` is created from `.env.example` on first run.

## API (MVP)

- `POST /auth/dev-login` dev phone login
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

## Notes

- `dev-login` is for MVP verification only. Replace with SMS OTP + risk control before production.
- Keep this as a modular monolith so each module can be split into microservices later.
