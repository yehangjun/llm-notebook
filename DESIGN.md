# Prism V2 设计文档（对齐 `SPEC.md`）

- 产品名：`Prism`
- 口号：`Everything about AI`

## 1. 设计目标

### 1.1 产品目标
- 面向中文用户，提供 AI 信息聚合与学习笔记产品。
- 聚合优质 AI 内容来源（视频、博客、媒体网站）。
- 用户可围绕外部内容链接进行学习笔记，并支持公开分享。
- V2 在 V1 MVP 基础上，交付可邀请小规模用户试用的正式可用版本。
- 首期以 Web 为主，覆盖账号体系、信息流、收藏、笔记、轻社交能力的基础框架。

### 1.2 本阶段核心闭环
- 账号注册与登录（密码制）
- 首页账号入口与认证/个人资料跳转
- 个人资料维护（昵称、语言）
- 退出登录
- 忘记密码与重置密码
- 登录失败限制（轻量风控）
- 后端保留可插拔 SSO 接口（gmail/wechat），前端不展示入口
- 系统初始化自动创建管理员账号（与普通用户同表）
- 管理员登录后显示管理入口，支持用户账号管理
- 学习笔记闭环：外部链接导入 -> 按需解析 -> AI 摘要 -> 用户心得编辑 -> 公开分享
- 信息聚合/信息流/收藏/轻社交采用规则型实现，优先交付可用闭环

### 1.3 非目标
- 不做原创内容平台
- 不做复杂推荐算法和复杂运营后台
- 不做生产级多租户和微服务拆分

## 2. 产品设计思路

### 2.1 学习笔记
- 借鉴 NotebookLM 的组织方式，但更轻量。
- 每条笔记绑定一个外部内容链接，不支持上传文件等重量输入。
- 提供 AI 自动分析与总结能力，聚焦文字学习笔记记录。
- 鼓励用户公开分享学习笔记。

### 2.2 自动聚合内容
- V2 支持一组预设来源的网站级自动聚合，不做复杂爬虫平台和运营后台。
- 用户手动导入笔记链接与系统自动聚合条目共用“内容分析链路”。
- 链接进入分析前执行“按需解析”：
  1. URL 校验（仅 `http/https`，拒绝内网地址）
  2. 页面抓取与正文提取
  3. 提取来源元数据（标题、作者/来源、发布时间、封面图）
  4. 入队 AI 摘要任务
- 解析失败场景（付费墙、需登录、无正文、反爬）统一落到失败状态，并返回可重试信息。

## 3. 总体架构

### 3.1 技术选型
- 前端：React + Next.js（App Router）+ TypeScript
- 后端：FastAPI（Python）单体服务
- 数据库：PostgreSQL
- 缓存/风控：Redis
- 邮件：SMTP（163 邮箱发信）
- 部署：Docker Compose（`web` + `api` + `db` + `redis`）

### 3.2 架构分层
- `presentation`：页面、接口路由、参数校验
- `application`：用例编排（注册、登录、忘记密码、笔记创建与 AI 分析）
- `domain`：用户、会话、密码令牌、笔记、摘要任务等业务规则
- `infrastructure`：DB、Redis、SMTP、SSO provider、网页解析器、LLM provider 实现

### 3.3 单体模块拆分
```text
apps/
  web/                  # Next.js
  api/                  # FastAPI
packages/
  shared-types/         # 前后端共享类型（可选）
infra/
  docker-compose.yml
```

## 4. 账号与认证设计

### 4.1 用户模型
- `id`: UUID，主键
- `user_id`: VARCHAR(32)，唯一，注册输入，不可修改
- `email`: VARCHAR(255)，唯一，注册输入，不可修改
- `password_hash`: VARCHAR(255)
- `nickname`: VARCHAR(64)，可空，可修改
- `ui_language`: VARCHAR(8)，默认 `zh-CN`，可选 `zh-CN`/`en-US`
- `is_admin`: BOOLEAN，默认 `false`
- `created_at`/`updated_at`: TIMESTAMPTZ

约束：
- `user_id` 规则：`^[a-zA-Z0-9_]{4,32}$`
- `email` 标准格式校验且全局唯一

### 4.2 会话模型
- `user_sessions.id`: UUID
- `user_sessions.user_id`: FK -> users.id
- `refresh_token_hash`: VARCHAR(255)
- `expires_at`: TIMESTAMPTZ
- `revoked_at`: TIMESTAMPTZ，可空
- `ip`/`user_agent`: 可空
- `created_at`: TIMESTAMPTZ

用途：
- 支持退出登录（吊销当前 refresh token）
- 预留多设备会话管理

### 4.3 密码重置模型
- `password_reset_tokens.id`: UUID
- `user_id`: FK -> users.id
- `token_hash`: VARCHAR(255)，唯一
- `expires_at`: TIMESTAMPTZ
- `used_at`: TIMESTAMPTZ，可空
- `created_at`: TIMESTAMPTZ

规则：
- 令牌一次性使用
- 超时或已用直接失效

### 4.4 SSO 预留模型
- `user_identities.id`: UUID
- `user_id`: FK -> users.id
- `provider`: `gmail` / `wechat`
- `provider_sub`: provider 侧唯一标识
- `created_at`: TIMESTAMPTZ

约束：
- `(provider, provider_sub)` 唯一

### 4.5 管理员初始化规则
- 系统启动时执行管理员引导逻辑：
  - 若 `ADMIN_USER_ID` 或 `ADMIN_EMAIL` 对应用户已存在，则确保其 `is_admin=true`
  - 若均不存在，自动创建管理员账号
- 管理员账号与普通用户共用 `users` 表和登录流程

### 4.6 学习笔记模型
- `notes.id`: UUID
- `notes.user_id`: FK -> users.id
- `notes.source_url`: TEXT，原始链接
- `notes.source_url_normalized`: TEXT，标准化链接（用于去重）
- `notes.source_domain`: VARCHAR(255)
- `notes.source_type`: VARCHAR(32)，`article` / `video` / `other`
- `notes.source_title`: VARCHAR(512)，可空
- `notes.source_author`: VARCHAR(255)，可空
- `notes.source_published_at`: TIMESTAMPTZ，可空
- `notes.source_excerpt`: TEXT，可空
- `notes.note_body_md`: TEXT，默认空字符串
- `notes.visibility`: VARCHAR(16)，`private` / `public`，默认 `private`
- `notes.analysis_status`: VARCHAR(16)，`pending` / `running` / `succeeded` / `failed`
- `notes.created_at` / `notes.updated_at`: TIMESTAMPTZ

约束：
- `(user_id, source_url_normalized)` 唯一，防止同用户重复导入同链接
- `source_url` 仅允许 `http/https`

### 4.7 内容分析结果记录模型（学习笔记）
- `note_ai_summaries.id`: UUID
- `note_ai_summaries.note_id`: FK -> notes.id
- `note_ai_summaries.status`: VARCHAR(16)，`succeeded` / `failed`
- `note_ai_summaries.output_title`: VARCHAR(512)，可空
- `note_ai_summaries.output_summary`: TEXT，可空（失败时为空）
- `note_ai_summaries.output_tags_json`: JSONB，可空（成功时标签数量 1~5）
- `note_ai_summaries.model_provider`: VARCHAR(64)
- `note_ai_summaries.model_name`: VARCHAR(128)
- `note_ai_summaries.model_version`: VARCHAR(128)，可空
- `note_ai_summaries.prompt_version`: VARCHAR(32)
- `note_ai_summaries.input_tokens`: INT，可空
- `note_ai_summaries.output_tokens`: INT，可空
- `note_ai_summaries.estimated_cost_usd`: NUMERIC(10,6)，可空
- `note_ai_summaries.raw_response_json`: JSONB，可空（便于问题排查）
- `note_ai_summaries.analyzed_at`: TIMESTAMPTZ
- `note_ai_summaries.error_code`: VARCHAR(64)，可空
- `note_ai_summaries.error_message`: TEXT，可空
- `note_ai_summaries.created_at`: TIMESTAMPTZ

说明：
- `note_ai_summaries` 保留历史分析记录，笔记详情默认展示最近一次成功结果。
- 内容分析输出（标题/摘要/标签）均为只读，用户侧不提供编辑入口。

## 5. 鉴权与风控策略

### 5.1 Token 策略
- Access Token：JWT，短时（建议 15 分钟）
- Refresh Token：随机串，长时（建议 30 天），服务端仅存哈希
- 刷新/退出时校验 `user_sessions` 状态，支持吊销

### 5.2 登录失败限制
Redis Key：
- `auth:login:fail:{principal}:{ip}`：失败次数，TTL 15 分钟
- `auth:login:lock:{principal}:{ip}`：锁定标记，TTL 15 分钟

规则：
- 15 分钟内失败达到 5 次触发锁定
- 锁定期间拒绝登录
- 登录成功后清理失败计数

### 5.3 频率限制
- 忘记密码：`auth:pwd_reset:cooldown:{email}`，TTL 60 秒
- 注册限流：`auth:register:ip:{ip}`，TTL 1 小时，阈值建议 20 次/小时
- 注册邮箱验证码发送：`auth:register:email_code:cooldown:{email}`，TTL 60 秒

### 5.4 学习笔记限流
Redis Key：
- `note:create:user:{user_id}`：创建频率，TTL 1 小时，阈值建议 30 次/小时
- `note:reanalyze:user:{user_id}`：重试频率，TTL 10 分钟，阈值建议 10 次/10 分钟

规则：
- 超出阈值返回限流错误并提示稍后重试
- 单次正文提取长度上限建议 20,000 字符，超出时截断并记录日志

## 6. API 设计（`/api/v1`）

### 6.1 认证接口
1. `POST /auth/register`
- 入参：`user_id`, `email`, `email_code`, `password`, `password_confirm`, `nickname?`, `ui_language?`
- 逻辑：校验唯一性、密码一致性、邮箱验证码，创建用户并签发会话
- 出参：用户信息 + token

2. `POST /auth/send-register-email-code`
- 入参：`email`
- 逻辑：发送注册验证码邮件（Redis 缓存验证码与有效期）
- 出参：统一消息

3. `POST /auth/login`
- 入参：`principal`（user_id 或 email）, `password`
- 逻辑：风控检查、账号校验、签发 token
- 出参：用户信息 + token

4. `POST /auth/logout`
- 入参：当前 refresh token（Cookie 或 Header）
- 逻辑：吊销会话
- 出参：成功状态

5. `POST /auth/forgot-password`
- 入参：`email`
- 逻辑：生成重置 token 并发送邮件（发信账号 `llm_notebook@163.com`）
- 出参：统一成功响应（防用户枚举）

6. `POST /auth/reset-password`
- 入参：`token`, `new_password`, `new_password_confirm`
- 逻辑：校验 token 有效性，更新密码，标记 token 为已使用
- 出参：成功状态

### 6.2 个人资料接口
1. `GET /me`
- 返回：`user_id`, `email`, `nickname`, `ui_language`, `created_at`

2. `PATCH /me`
- 可改：`nickname`, `ui_language`
- 禁改：`user_id`, `email`

### 6.3 SSO 预留接口
- `GET /auth/sso/{provider}/start`
- `GET /auth/sso/{provider}/callback`

约束：
- `provider` 仅支持 `gmail` / `wechat`
- V2 前端不展示入口按钮

### 6.4 管理系统接口
1. `GET /admin/users`
- 权限：管理员
- 参数：`keyword?`, `offset?`, `limit?`
- 返回：用户列表（含 `user_id`, `email`, `nickname`, `ui_language`, `is_admin`, `created_at`）

2. `PATCH /admin/users/{user_id}`
- 权限：管理员
- 可改字段：`nickname`, `ui_language`, `is_admin`
- 约束：不允许当前登录管理员移除自己的管理员权限

### 6.5 学习笔记接口
1. `POST /notes`
- 权限：登录用户
- 入参：`source_url`, `visibility?`, `note_body_md?`
- 逻辑：校验 URL、去重、创建笔记、触发 AI 分析任务
- 出参：`note_id`, `analysis_status`

2. `GET /notes`
- 权限：登录用户
- 参数：`status?`, `visibility?`, `keyword?`, `offset?`, `limit?`
- 逻辑：返回当前用户笔记列表

3. `GET /notes/{note_id}`
- 权限：登录用户（仅本人笔记）
- 返回：来源信息 + 最新 AI 摘要 + 学习心得 + 可见性 + 状态

4. `PATCH /notes/{note_id}`
- 权限：登录用户（仅本人笔记）
- 可改字段：`note_body_md`, `visibility`
- 禁改字段：`source_url`、AI 摘要字段

5. `POST /notes/{note_id}/reanalyze`
- 权限：登录用户（仅本人笔记）
- 逻辑：触发新一轮 AI 分析，写入 `note_ai_summaries` 新记录
- 出参：`analysis_status=running`

6. `GET /notes/public/{note_id}`
- 权限：匿名可访问
- 约束：仅当笔记 `visibility=public` 时返回内容，否则返回 404
- 返回：来源信息 + AI 摘要 + 学习心得（只读）

## 7. 前端页面与交互

### 7.1 路由规划
- `/`：首页（右上角账号入口）
- `/auth`：认证页（登录/注册双 Tab）
- `/profile`：个人资料页
- `/admin/users`：管理系统用户管理页（管理员可见）
- `/forgot-password`：忘记密码
- `/reset-password?token=...`：重置密码
- `/notes`：我的笔记列表
- `/notes/new`：新建笔记
- `/notes/{note_id}`：笔记详情与编辑
- `/notes/public/{note_id}`：公开笔记详情

### 7.2 首页账号入口规则
- 未登录：按钮文案 `登录/注册`
- 已登录：
  - 若 `nickname` 有值且不等于 `user_id`，显示 `nickname`
  - 否则显示 `user_id`

点击行为：
- 未登录 -> `/auth`
- 已登录 -> `/profile`

### 7.3 认证页交互
- 登录 Tab：`principal + password`
- 注册 Tab：`user_id + email + 发送邮箱验证码 + email_code + password + password_confirm + nickname + ui_language`
- 公共能力：前端表单校验、服务端错误提示、忘记密码入口

### 7.4 个人资料页交互
- 只读字段：`user_id`, `email`
- 可编辑字段：`nickname`, `ui_language`
- 操作按钮：保存、退出登录
- 当 `is_admin=true` 时，额外显示“管理系统”入口按钮

### 7.5 管理系统页交互
- 仅管理员可访问；非管理员访问返回无权限提示
- 支持用户搜索（ID/邮箱/昵称）
- 支持编辑用户：昵称、界面语言、管理员标记
- 保存单行后即时刷新列表

### 7.6 学习笔记页交互
- 列表页（`/notes`）：
  - 展示来源标题、发布时间、收藏/点赞计数、标签、极简摘要
  - 笔记 tab 额外展示 AI 状态、可见性
  - 收藏 tab 额外展示创作者
  - 支持状态筛选（`running/succeeded/failed`）与关键词搜索
- 新建页（`/notes/new`）：
  - 仅一个核心输入：外部链接
  - 创建成功后跳转 `/notes/{note_id}`，并显示分析进度
- 详情页（`/notes/{note_id}`）：
  - 来源信息卡片（URL、标题、作者、发布时间）
  - AI 摘要卡片（只读）
  - 若分析失败，展示失败原因并提供“重试分析”按钮
  - 学习心得编辑器（Markdown），支持手动保存
  - 可见性切换（私有/公开）
- 公开页（`/notes/public/{note_id}`）：
  - 只读展示来源信息、AI 摘要、学习心得
  - 不显示编辑与重试按钮

### 7.7 视觉与导航风格
- 前端 UI 基线：`Tailwind CSS + shadcn/ui`。
- 风格基调：极简 SaaS 风。
- 全站页面顶部保留全局导航条，统一品牌入口与关键导航。
- 导航三段布局固定：
  - 左：品牌入口 + 全局搜索
  - 中：笔记 / 广场（全局居中）
  - 右：写笔记图标 / 通知图标 / 账号入口

### 7.8 组件映射与设计 Token 约束

组件映射（首批）：
- `GlobalNav`：`Input`（搜索）、`Button`（写笔记/通知/账号）、`Tabs`（中区导航）
- 列表卡片（笔记/广场）：`Card` + `Badge` + `Button`
- 认证页：`Tabs`（登录/注册）+ `Input` + `Button`
- 管理页：`Tabs`（模块切换）+ `Table`（用户/笔记/聚合源）

设计 Token（语义层）：
- 颜色：
  - `--background`：页面背景
  - `--foreground`：主文本
  - `--muted` / `--muted-foreground`：次级文本与弱背景
  - `--border`：分割线/输入框边线
  - `--primary` / `--primary-foreground`：主操作按钮
  - `--destructive` / `--destructive-foreground`：危险操作
- 圆角：
  - `--radius-sm` = 8px
  - `--radius-md` = 12px
  - `--radius-lg` = 16px
- 阴影：
  - `--shadow-sm`：轻悬浮（列表项 hover）
  - `--shadow-md`：主卡片
- 间距：
  - 采用 `4px` 基础栅格（`4/8/12/16/24/32`）

交互约束：
- 所有状态型信息使用统一 `Badge`（`pending/running/succeeded/failed`）。
- 主次按钮层级固定：`primary > secondary > ghost`，禁止同区块出现多个 primary。
- 列表摘要限制为单段短文，建议最大 220 字符，超出截断。

## 8. 邮件与通知

- 发信账号固定为：`llm_notebook@163.com`
- 忘记密码邮件包含一次性重置链接：
  - `https://{web_host}/reset-password?token={raw_token}`
- 为避免信息泄露，忘记密码接口永远返回统一文案

## 9. 安全设计

- 密码哈希算法：`Argon2id`（优先）或 `bcrypt`
- 重置 token 和 refresh token 入库前哈希
- 登录失败与账号不存在返回统一错误
- 关键接口开启 IP + 用户维度限流
- 生产环境强制 HTTPS、开启安全响应头
- 笔记 URL 仅允许 `http/https`，并阻断内网地址、防 SSRF 访问
- Markdown 渲染做 XSS 过滤（白名单标签）
- 公开笔记接口不返回用户邮箱等隐私字段

## 10. 可观测性与运维

- 健康检查：`GET /healthz`
- 日志字段：`request_id`, `user_id`, `ip`, `path`, `latency_ms`, `status_code`
- 最低指标：
  - 登录成功率/失败率
  - 登录锁定触发次数
  - 重置密码成功率
  - 邮件发送失败率
  - 笔记解析成功率/失败率
  - AI 摘要成功率/失败率
  - AI 平均分析耗时（P50/P95）
  - AI 调用 token 与成本统计

## 11. Docker Compose 方案

服务：
- `web`: Next.js
- `api`: FastAPI + Uvicorn
- `db`: PostgreSQL 16
- `redis`: Redis 7

启动顺序：
- `api` 依赖 `db`、`redis` 健康状态
- 启动后自动执行数据库迁移
- API 应用启动时执行管理员账号引导逻辑

## 12. 验收映射（SPEC 对齐）

- 首页右上角仅有一个账号入口，文案与跳转符合规则
- 注册支持 `user_id` 与 `email` 双唯一
- 注册支持邮箱验证码校验
- 登录支持 `user_id` 或 `email`
- 个人资料页仅允许修改昵称与界面语言
- 支持退出登录
- 存在登录失败限制与锁定策略
- 支持忘记密码与重置密码全流程
- 后端保留 SSO 路由与 provider 扩展，前端不展示入口
- 忘记密码发件账号为 `llm_notebook@163.com`
- 系统初始化会自动创建/提升管理员账号
- 管理员登录后前端显示“管理系统”入口
- 管理系统支持用户账号管理
- 支持外部链接创建学习笔记并自动触发 AI 分析
- 内容分析输出包含标题/摘要/标签（标签不超过 5 个），且用户不可直接编辑
- 学习心得支持持续编辑保存
- 支持笔记私有/公开切换，公开页只读访问
- 支持解析失败或 AI 失败后重试分析
- 预设信息源可自动生成聚合条目，且可复用同一内容分析链路
- 内容分析服务接入 OpenAI / Gemini / Claude 风格大模型 API
- 首页与核心页面使用 `Tailwind CSS + shadcn/ui` 实现极简 SaaS 风，并具备全局导航

## 13. 内容分析详细设计（本轮新增）

### 13.1 设计目标
- 对齐 `SPEC.md`：给定链接后输出 `标题`、`摘要`、`标签`（不超过 5 个）。
- 同时覆盖两类对象：学习笔记（`notes`）和信息聚合条目（`aggregate_items`）。
- 分析流程采用统一状态机：`pending -> running -> succeeded/failed`。
- 使用 OpenAI / Gemini / Claude 风格大模型 API 作为模型服务。

### 13.2 输入输出契约
输入（内部）：
- `target_type`: `note` / `aggregate_item`
- `target_id`: UUID
- `source_url_normalized`: 标准化链接
- `source_domain`: 来源域名
- `fetch_text`: 抓取并清洗后的正文（上限 20,000 字符）
- `fetch_title`: 抓取到的原始标题（可空）
- `trigger_type`: `create` / `manual_retry` / `scheduled_refresh`

输出（模型）：
- `title`: 字符串，建议上限 120 字符
- `summary`: 字符串，建议上限 400 字符
- `tags`: 字符串数组，1~5 个，去重后入库

输出校验规则：
- `tags` 超过 5 个时按模型返回顺序截断前 5 个。
- `tags` 做 trim + 小写归一（中文保持原样），空值剔除。
- 输出字段缺失或类型错误判定为 `invalid_output`，可触发一次结构化修复重试。

### 13.3 处理流程
1. 触发阶段：
- 新建笔记、手动重试、聚合刷新时创建分析任务，目标对象状态置为 `pending`。

2. 抓取阶段：
- 执行 URL 安全校验（协议、内网/本地地址拦截、超时、响应体大小限制）。
- 抓取 HTML 并做正文提取，失败则写入 `failed` 与错误码。

3. 模型阶段：
- 按 `prompt_version` 组装系统提示词和用户输入。
- 根据 `LLM_PROVIDER_NAME` 选择 OpenAI / Gemini / Claude 对应接口调用。
- 要求结构化输出 `title/summary/tags`，并执行返回结果校验。

4. 持久化阶段：
- 成功：写入分析记录，更新对象状态 `succeeded`，清空错误信息。
- 失败：写入失败记录，对象状态置 `failed` 并保留错误码/错误消息。

### 13.4 状态机与重试
- 初始：`pending`
- Worker 领取任务：`pending -> running`
- 任务完成：`running -> succeeded` 或 `running -> failed`
- 手动重试：`failed -> pending`（新建一次任务与分析记录）

自动重试策略（仅瞬时错误）：
- 错误类型：网络超时、DNS 异常、模型服务 `429/5xx`
- 最大自动重试次数：3 次（指数退避：30s/120s/300s）
- 非瞬时错误（如 URL 非法、正文为空、内容不可访问）不自动重试

幂等规则：
- 同一对象在 `pending/running` 期间不重复入队。
- 重试必须生成新 attempt，历史记录只追加不覆盖。

### 13.5 数据模型增补
新增任务表（建议）：`content_analysis_tasks`
- 核心字段：`id`, `target_type`, `target_id`, `status`, `trigger_type`, `attempt`, `available_at`, `started_at`, `finished_at`, `error_code`, `error_message`, `created_at`
- 关键索引：`(status, available_at)`、`(target_type, target_id, created_at desc)`

新增统一结果表（建议）：`content_analysis_results`
- 核心字段：`id`, `task_id`, `target_type`, `target_id`, `status`, `output_title`, `output_summary`, `output_tags_json`, `model_provider`, `model_name`, `model_version`, `prompt_version`, `input_tokens`, `output_tokens`, `estimated_cost_usd`, `raw_response_json`, `error_code`, `error_message`, `analyzed_at`, `created_at`
- 说明：`notes` 与 `aggregate_items` 共用该表，避免双套历史表结构。

现有模型兼容策略：
- `notes.analysis_status/analysis_error` 保留，作为“当前状态”快照字段。
- `aggregate_items.analysis_status/analysis_error/summary_text/tags_json` 保留，短期由结果表回写最新值。
- `note_ai_summaries` 在迁移窗口内可并行保留；最终收敛到统一结果表。

### 13.6 多风格模型服务接入设计
配置项（环境变量）：
- `LLM_PROVIDER_NAME`（可选，默认 `openai`，可选值：`openai` / `gemini` / `claude`）
- `LLM_BASE_URL`（可选，默认使用官方端点；也可由部署环境配置为代理网关地址）
- `LLM_API_KEY`（必填）
- `LLM_MODEL_NAME`（必填）
- `LLM_TIMEOUT_SECONDS`（默认 30）
- `LLM_MAX_RETRIES`（默认 3）
- `LLM_PROMPT_VERSION`（默认 `v1`）

调用约定：
- OpenAI 风格：`POST /v1/chat/completions`，`Authorization: Bearer <LLM_API_KEY>`
- Gemini 风格：`POST /v1beta/models/{model}:generateContent`，`x-goog-api-key: <LLM_API_KEY>`
- Claude 风格：`POST /v1/messages`，`x-api-key: <LLM_API_KEY>` + `anthropic-version`
- 输出：强制 JSON 结构，便于服务端做 Schema 校验

### 13.7 API 与页面约定
接口层：
- `POST /notes`：创建后立即返回 `analysis_status=pending|running`，前端轮询详情状态。
- `POST /notes/{note_id}/reanalyze`：仅本人可触发，幂等返回当前状态。
- 聚合刷新接口（管理员/任务触发）复用同一分析编排器。

页面层：
- 列表展示 `analysis_status`。
- 详情展示只读的 `title/summary/tags`（来自最近一次成功分析）。
- `failed` 状态时显示可重试按钮与最近错误提示。

### 13.8 可观测性与告警
新增指标：
- `content_analysis_task_total{target_type,status}`
- `content_analysis_duration_ms{target_type}`（P50/P95/P99）
- `content_analysis_retry_total{reason}`
- `content_analysis_invalid_output_total`
- `content_analysis_token_usage_total{model}`

日志字段补充：
- `analysis_task_id`, `target_type`, `target_id`, `trigger_type`, `attempt`, `model_name`, `prompt_version`, `error_code`

告警建议：
- 10 分钟窗口失败率 > 20%
- `running` 超时任务数持续增长
- 模型服务 `429` 比例异常升高

### 13.9 分阶段落地建议
Phase 1（最小可用）：
- 接入至少一种模型接口风格（默认 OpenAI）+ 输出结构化校验
- 覆盖学习笔记分析（创建/重试）
- 打通 `pending/running/succeeded/failed` 全链路

Phase 2（一致性增强）：
- 统一任务表与结果表
- 聚合条目接入同一编排器
- 增加自动重试与超时回收任务

Phase 3（质量优化）：
- Prompt A/B 与标签质量评估
- 分域名策略（公众号/YouTube/博客）定制抽取与提示词

## 14. 失败可观测详细设计（最小改动版）

### 14.1 目标与范围
- 本节承接 `SPEC.md` 中“管理后台失败可观测”要求，覆盖学习笔记分析与聚合刷新。
- 目标是降低 `content fetch` 与 `llm analysis` 失败定位成本，优先支持管理员快速筛查与重试。

### 14.2 学习笔记分析失败诊断
- 依托现有 `note_ai_summaries` 历史表扩展失败诊断字段（不引入新任务表）：
  - `error_code`, `error_message`
  - `error_stage`: `content_fetch` / `llm_request` / `llm_parse` / `unknown`
  - `error_class`: 异常类型
  - `retryable`: 是否建议重试
  - `elapsed_ms`: 本次分析耗时
  - `analyzed_at`: 失败发生时间
- 阶段分类规则（最小版）：
  - `source_unreachable` / `empty_content` -> `content_fetch`
  - `invalid_output` / `llm_invalid_response` -> `llm_parse`
  - 其他 `llm_*` -> `llm_request`
  - 其余情况 -> `unknown`
- 管理后台笔记列表返回“最近一次失败诊断”快照，并支持：
  - 按失败阶段筛选
  - 按重试建议筛选（建议重试 / 建议先修复配置）

### 14.3 聚合刷新失败诊断
- 聚合刷新任务状态对象新增 `failures[]`，与汇总计数一起返回。
- 单条失败明细包含：
  - `source_id`, `source_slug`, `item_id`, `source_url`
  - `stage`, `error_class`, `error_message`
  - `elapsed_ms`, `retryable`, `created_at`
- 失败阶段统一枚举：
  - `feed_fetch` / `feed_parse` / `content_fetch` / `llm_request` / `llm_parse` / `db_write` / `unknown`
- 管理后台聚合源页面支持：
  - 按阶段、来源、关键词筛选失败明细
  - 条目级失败重试（触发单条聚合条目重分析）
  - 来源级失败重试（触发单源刷新）

### 14.4 存储与生命周期
- 聚合失败明细随刷新任务状态存储在 Redis 任务 payload，不单独建表。
- 生命周期沿用任务 TTL，定位窗口以短期排障为主。
- 超出 TTL 后，仅保留业务实体当前状态快照（如 `analysis_status` / `analysis_error`）。
