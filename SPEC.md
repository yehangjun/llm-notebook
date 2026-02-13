# LLM Notebook SPEC V2

## 1. 产品目标与边界

### 1.1 目标
- 面向中文用户的 AI 信息聚合与学习笔记。
- 先做 Web 站点，支持账号体系、信息流、收藏、笔记、轻社交。
- 当前重点是可邀请小范围用户试用的最小闭环。
- V1版本已经验证了MVP，这个V2版本是个精简但是可正式使用的产品。

### 1.2 非目标（当前阶段）
- 不做原创内容平台。
- 不做复杂推荐算法和复杂运营后台。
- 不做生产级多租户/微服务拆分。

## 2. 当前技术架构

- 后端：FastAPI 单体 API
- 数据库：PostgreSQL
- 缓存/风控计数：Redis
- 部署：Docker Compose（`db` + `redis` + `api`）

## 3. 认证与账号设计（当前版本）

## 3.1 登录入口与页面结构
- 首页右上角只有一个账号入口按钮：
  - 未登录：`登录/注册`
  - 已登录：显示`昵称`（若有且不等于ID）否则显示`ID`
- 点击后：
  - 未登录：进入认证页（登录/注册双 Tab）
  - 已登录：进入个人资料页

前端文件：
- `/Users/yehangjun/git/llm-notebook/app/static/index.html`
- `/Users/yehangjun/git/llm-notebook/app/static/app.js`

## 3.2 注册（密码制）
注册字段：
- `email`（必填）
- `public_id`（必填、唯一、3-50，字母数字下划线）
- `password`（必填，>=8）
- `display_name`（可选）
- `ui_language`（可选，默认 `zh`）

后端接口：
- `POST /auth/register`

行为：
- email 和 public_id 均唯一校验
- password 使用 bcrypt 哈希存储
- 注册成功直接返回 JWT

## 3.3 登录（密码制）
登录字段：
- `identifier`（支持 `ID` 或 `email`）
- `password`

后端接口：
- `POST /auth/login`

行为：
- 支持 ID 或 email 登录
- 成功返回 JWT

## 3.4 登录失败限制（轻量风控）
基于 Redis 实现：
- 失败计数窗口：`LOGIN_FAILURE_WINDOW_MINUTES`
- 最大失败次数：`LOGIN_MAX_FAILURES`
- 锁定时长：`LOGIN_LOCK_MINUTES`

锁定后返回：
- HTTP `429`
- 提示剩余锁定秒数

Redis key 逻辑：
- `auth:login_fail_count:{identifier}`
- `auth:login_lock:{identifier}`

## 3.5 忘记密码 / 重置密码
接口：
- `POST /auth/password/forgot`
- `POST /auth/password/reset`

流程：
1. 用户输入邮箱触发 forgot。无论邮箱是否存在，接口均返回 `{"sent": true}`（防枚举）。
2. 若用户存在，生成 reset token，落库其哈希，发送邮件链接：
   - `${PASSWORD_RESET_URL_BASE}/?view=reset&token=<raw_token>`
3. 用户在 reset 页面填 token + 新密码，调用 reset 接口完成修改。

DB 表：`password_reset_tokens`
- `token_hash` 唯一
- `expires_at` 过期时间
- `used_at` 一次性消费

## 3.6 个人资料页
可修改：
- 昵称（`display_name`）
- 密码
- 界面语言（`ui_language`: `zh` / `en`）

接口：
- `GET /auth/me`
- `PATCH /auth/me/profile`

退出登录：
- 前端删除本地 token，回到首页，右上角恢复 `登录/注册`。

## 3.7 邮箱 OTP（历史兼容能力）
当前仍保留接口，但前端主流程已切换到密码制：
- `POST /auth/email/send-code`
- `POST /auth/email/verify-code`

## 3.8 SSO（后端保留、前端隐藏）
后端仍保留可插拔 SSO 路由与 provider（gmail/wechat），但前端不展示入口。

## 4. 默认语言策略

- 系统默认语言：**中文 `zh`**
- 新注册用户默认 `ui_language = zh`
- 前端首次进入默认中文
- 登录后若用户资料中有 `ui_language`，以前端自动应用为准

相关实现：
- `/Users/yehangjun/git/llm-notebook/app/models.py`
- `/Users/yehangjun/git/llm-notebook/app/routers/auth.py`
- `/Users/yehangjun/git/llm-notebook/app/schemas.py`
- `/Users/yehangjun/git/llm-notebook/app/static/app.js`

## 5. 业务功能（除认证外）

- 信息流：`GET /feed`
- 收藏：`POST /bookmarks/{article_id}`、`GET /bookmarks`
- 笔记：`POST /notes`、`GET /notes/me`、`PATCH /notes/{note_id}`
- 社交：`POST /social/follow/{user_id}`、`GET /social/public-notes/{user_id}`

## 6. 数据模型（关键字段）

`users` 关键列：
- `id` UUID PK
- `email` UNIQUE
- `public_id` UNIQUE NOT NULL
- `password_hash` NULL
- `ui_language` NOT NULL DEFAULT `zh`
- `display_name` NOT NULL
- `phone` 预留

新增/关键表：
- `email_otps`
- `auth_identities`
- `password_reset_tokens`

SQL 文件：
- 初始化：`/Users/yehangjun/git/llm-notebook/deploy/postgres/init/001_schema.sql`
- 种子：`/Users/yehangjun/git/llm-notebook/deploy/postgres/init/002_seed.sql`
- 迁移：
  - `/Users/yehangjun/git/llm-notebook/deploy/postgres/migrations/001_auth_email_sso.sql`
  - `/Users/yehangjun/git/llm-notebook/deploy/postgres/migrations/002_user_password_auth.sql`
  - `/Users/yehangjun/git/llm-notebook/deploy/postgres/migrations/003_password_reset.sql`
  - `/Users/yehangjun/git/llm-notebook/deploy/postgres/migrations/004_default_ui_language_zh.sql`

## 7. 环境变量与配置基线

参考模板：
- `/Users/yehangjun/git/llm-notebook/.env.example`

关键配置：
- JWT：`SECRET_KEY`, `ACCESS_TOKEN_EXPIRE_MINUTES`
- SMTP：`SMTP_*`
- 登录风控：`LOGIN_MAX_FAILURES`, `LOGIN_LOCK_MINUTES`, `LOGIN_FAILURE_WINDOW_MINUTES`
- 重置密码：`PASSWORD_RESET_EXPIRE_MINUTES`, `PASSWORD_RESET_URL_BASE`
- DB/Redis：`DATABASE_URL`, `REDIS_URL`

备注：
- `.env` 不入库，仅本地/部署环境注入真实密钥。

## 8. 本地启动与复现步骤

1. 启动服务
```bash
cd /Users/yehangjun/git/llm-notebook
docker compose up -d
```

2. 执行迁移（老数据卷必做）
```bash
./scripts/migrate.sh
```

3. 访问
- Frontend: `http://localhost:8000/`
- Swagger: `http://localhost:8000/docs`

## 9. 验收清单（最小）

1. 未登录首页右上角显示`登录/注册`。
2. 登录/注册页有双 Tab。
3. 注册可填：昵称、ID、密码、界面语言（默认中文）。
4. 登录支持 ID 或 email。
5. 登录成功后右上角显示昵称或ID。
6. 点击右上角可进入个人资料，能改昵称/密码/界面语言。
7. 退出登录后回首页并恢复`登录/注册`。
8. 连续输错密码触发 429 锁定。
9. 忘记密码可发邮件，reset 页面可用 token 重置。
10. 首次默认中文，用户语言可覆盖前端语言。

## 10. 当前已知取舍

- 前端已隐藏 SSO，但后端保留 SSO 代码路径，便于后续恢复。
- 保留 email OTP 接口作为兼容能力，但主流程是密码制认证。
- 当前是 MVP 单体，后续按模块拆分服务。
