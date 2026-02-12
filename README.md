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

5. Fill SSO redirect URLs with your base URL:

```bash
./scripts/setup_sso_env.sh https://your-domain.com
```

6. Check auth setup readiness:

```bash
./scripts/check_auth_setup.sh
```

7. Open docs:

- Frontend: `http://localhost:8000/`
- Swagger: `http://localhost:8000/docs`

## Environment

`.env` is created from `.env.example` on first run.

Key auth configs:

- `EMAIL_DEBUG_CODE_ENABLED=true|false`
- `LOGIN_MAX_FAILURES / LOGIN_LOCK_MINUTES / LOGIN_FAILURE_WINDOW_MINUTES`
- `SMTP_HOST / SMTP_PORT / SMTP_USERNAME / SMTP_PASSWORD`
- `PASSWORD_RESET_EXPIRE_MINUTES / PASSWORD_RESET_URL_BASE`
- `GMAIL_OAUTH_CLIENT_ID / GMAIL_OAUTH_CLIENT_SECRET / GMAIL_OAUTH_REDIRECT_URI`
- `WECHAT_OAUTH_APP_ID / WECHAT_OAUTH_APP_SECRET / WECHAT_OAUTH_REDIRECT_URI`
- `SSO_SUCCESS_REDIRECT_URL / SSO_ALLOWED_REDIRECT_HOSTS`

## API (MVP)

- `POST /auth/email/send-code` send email OTP (`purpose`: `register` or `login`)
- `POST /auth/email/verify-code` verify OTP and complete register/login (`purpose`: `register` or `login`)
- `POST /auth/register` register by `email + public_id + password`
- `POST /auth/login` login by `ID or email + password`
- `PATCH /auth/me/profile` update profile (`display_name/password/ui_language`)
- `POST /auth/password/forgot` send password reset email
- `POST /auth/password/reset` reset password by token
- `GET /auth/sso/providers`
- `GET /auth/sso/{provider}/start`
- `GET /auth/sso/{provider}/callback`
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
- `deploy/postgres/migrations/002_user_password_auth.sql`
- `deploy/postgres/migrations/003_password_reset.sql`
- `deploy/postgres/migrations/004_default_ui_language_zh.sql`

## Notes

- Frontend auth uses password flow:
  - unauthenticated top-right button shows `登录/注册`
  - auth page has two tabs (`登录`/`注册`)
  - profile page allows editing nickname/password/language and logout
  - supports zh/en language switch and auto-applies user profile language after login
  - default language is `zh` for new users and first-time UI
- Login security: failed password attempts are rate-limited and temporary locked.
- Supported SSO providers are `gmail` and `wechat`.
- SSO provider integration is pluggable via `app/services/sso.py` (`SsoProvider` + registry).
- `phone` field is retained in user profile schema but is not collected in current flow.
- Keep this as a modular monolith so each module can be split into microservices later.
