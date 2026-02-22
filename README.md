# Prism V2

一个实验项目，尝试用Codex完成一个有一定复杂度的原型产品。

我的输入几乎都在`ROOT.md`和`SPEC.md`两个文档里，另外还有对话过程中的指令，其它文件都是Codex产生的。

Codex的配置是：GPT-5.3-Codex / Extra High

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

## 生产部署（阿里云轻服务器）

1. 准备生产变量：
```bash
cp .env.example .env
```

2. 至少修改以下环境变量（`.env`）：
- `APP_DOMAIN`（例如 `note.example.com`）
- `SECRET_KEY`
- `ADMIN_PASSWORD`
- `POSTGRES_PASSWORD`
- `NEXT_PUBLIC_API_BASE_URL=/api/v1`

3. 启动生产编排（含 Caddy 反向代理 + HTTPS）：
```bash
docker compose --env-file .env -f infra/docker-compose.prod.yml up -d --build
```

4. 开放安全组端口：
- `80/tcp`
- `443/tcp`
- `22/tcp`

说明：
- 外部流量统一走 Caddy（80/443），`api/db/redis/web` 不直接暴露公网端口。
- 默认前端 API 地址为同域路径 `/api/v1`，无需让浏览器直连 `8000`。

### 运维脚本（生产）

1. 更新部署（拉取最新代码 + 重建 + 重启）：
```bash
./infra/scripts/prod-update.sh
```
- 默认使用当前分支，也可指定分支：`./infra/scripts/prod-update.sh main`
- 脚本会执行 `docker compose ... up -d --build`，并在 API 启动时自动跑 Alembic migration。

2. 清空业务数据并重置（删除 PostgreSQL/Redis 数据卷后重建）：
```bash
./infra/scripts/prod-reset-data.sh --yes
```
- 默认保留 Caddy 证书数据。
- 如需同时删除证书并重新签发：`RESET_CERTS=1 ./infra/scripts/prod-reset-data.sh --yes`

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
- `/api/v1/admin/notes` (GET)
- `/api/v1/admin/notes/{note_id}` (DELETE)
- `/api/v1/admin/notes/{note_id}/restore` (POST)
- `/api/v1/admin/sources` (GET/POST)
- `/api/v1/admin/sources/{source_id}` (PATCH/DELETE)
- `/api/v1/admin/sources/{source_id}/restore` (POST)
- `/api/v1/admin/aggregates/refresh` (POST, 后台任务入队)
- `/api/v1/admin/aggregates/refresh/{job_id}` (GET, 查询任务状态)
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
- 内容分析模型相关环境变量（支持 `OpenAI` / `Gemini` / `Claude` 接口风格）：
  - `LLM_PROVIDER_NAME`（默认 `openai`，可选 `openai` / `gemini` / `claude`）
  - `LLM_BASE_URL`（可选，不填时按 provider 使用官方默认端点）
  - `LLM_API_KEY`
  - `LLM_MODEL_NAME`
  - `LLM_TIMEOUT_SECONDS`
  - `LLM_MAX_RETRIES`
  - `LLM_PROMPT_VERSION`
  - `NETWORK_PROXY_URL`（全局网络代理，影响链接抓取与大模型调用）
  - `CONTENT_FETCH_USE_JINA_READER`（全局抓取策略开关，`true` 使用 Jina Reader，`false` 直连来源链接）
  - `JINA_READER_BASE_URL`（Jina Reader 前缀地址，默认 `https://r.jina.ai/`）
  - `JINA_READER_TOKEN`（可选，配置后以 `Authorization: Bearer <token>` 方式访问 Jina Reader；为空则匿名访问）
- 信息聚合相关环境变量：
  - `AGGREGATION_MAX_ITEMS_PER_SOURCE`（每个信息源每次刷新最多处理的候选链接数）
  - `AGGREGATION_REFRESH_JOB_TTL_SECONDS`（聚合刷新任务状态在 Redis 的保留时长，单位秒）
