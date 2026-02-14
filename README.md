# Prism V2

> Everything about AI

根据 `SPEC.md` 实现的最小可用骨架，包含：
- FastAPI 后端（注册/登录/退出、忘记密码/重置密码、个人资料、SSO 预留）
- Next.js 前端（全局导航、首页品牌化设计、认证页、资料页、忘记/重置密码页）
- 管理系统（管理员初始化、管理入口、用户账号管理）
- PostgreSQL + Redis + Docker Compose
- Alembic 数据库迁移

## 目录

- `apps/api`: FastAPI 服务
- `apps/web`: Next.js Web 前端
- `infra/docker-compose.yml`: 本地一键启动

## 启动方式

1. 准备环境变量：
```bash
cp .env.example .env
```

2. 启动：
```bash
docker compose -f infra/docker-compose.yml up --build
```

3. 访问：
- Web: [http://localhost:3000](http://localhost:3000)
- API health: [http://localhost:8000/healthz](http://localhost:8000/healthz)

## API 前缀

- `/api/v1/auth/register`
- `/api/v1/auth/send-register-email-code`
- `/api/v1/auth/login`
- `/api/v1/auth/logout`
- `/api/v1/auth/forgot-password`
- `/api/v1/auth/reset-password`
- `/api/v1/me` (GET/PATCH)
- `/api/v1/admin/users` (GET)
- `/api/v1/admin/users/{user_id}` (PATCH)
- `/api/v1/notes` (POST/GET)
- `/api/v1/notes/{note_id}` (GET/PATCH)
- `/api/v1/notes/{note_id}/reanalyze` (POST)
- `/api/v1/notes/public/{note_id}` (GET)
- `/api/v1/auth/sso/{provider}/start`（预留）
- `/api/v1/auth/sso/{provider}/callback`（预留）

## Alembic

- 启动 API 容器时会自动执行：`alembic upgrade head`
- 手动执行迁移（在 `apps/api` 目录）：
```bash
alembic upgrade head
```
- 生成新迁移（在 `apps/api` 目录）：
```bash
alembic revision -m "your migration name"
```

## 注意事项

- 忘记密码发信账号默认配置为 `llm_notebook@163.com`。
- 若未配置 SMTP，后端会跳过真实发信并写日志。
- 数据库结构由 Alembic 版本管理，不再使用 `create_all` 自动建表。
- 系统启动会自动确保管理员账号存在，默认读取以下环境变量：
  - `ADMIN_USER_ID`
  - `ADMIN_EMAIL`
  - `ADMIN_PASSWORD`
  - `ADMIN_NICKNAME`
- 若未覆盖，默认管理员为：
  - `ADMIN_USER_ID=admin`
  - `ADMIN_PASSWORD=ChangeMe123!`（建议首登后立刻修改）
- 注册邮箱验证码相关环境变量：
  - `REGISTER_EMAIL_CODE_TTL_SECONDS`
  - `REGISTER_EMAIL_CODE_COOLDOWN_SECONDS`
  - `REGISTER_EMAIL_CODE_MAX_ATTEMPTS`
