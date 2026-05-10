# 舞萌排卡 Web 系统开发文档 v0.1

## 1. 项目目标

开发一个面向舞萌 DX 玩家与机厅的在线排卡系统，用于解决线下机台排队时“谁在排、排到谁、几人一组、是否过号、是否还在现场”等问题。

舞萌 DX 是 maimai 系列街机音游，中国大陆通常称为“舞萌 DX”，由华立科技代理发行；玩家常围绕机厅、机台、组队、轮换游玩形成排队需求。([中文百科全书][2])

系统需要支持：

1. Web 端排卡与管理。
2. 手机端适配。
3. 后续支持微信、QQ、GitHub 登录。
4. 后续接入微信小程序。
5. 支持机厅、多机台、多队列。
6. 支持实时刷新排队状态。
7. 支持管理员维护机厅、机台、队列规则。
8. 支持用户昵称、头像、联系方式、到场状态。
9. 可扩展到 bot、公众号、小程序通知。

---

## 2. 推荐技术栈

### 2.1 前端

推荐：

```txt
Next.js + React + TypeScript + Tailwind CSS
```

原因：

* Next.js 适合同时做 Web 页面、SSR、API 网关层。
* React 生态成熟，后续可复用部分逻辑到 Taro/uni-app 小程序端。
* TypeScript 便于维护排队状态、登录状态、权限模型。
* Tailwind CSS 适合快速做移动端友好的 UI。

可选 UI：

```txt
shadcn/ui
Radix UI
Lucide Icons
```

### 2.2 后端

推荐：

```txt
NestJS + TypeScript
```

原因：

* 和前端统一 TypeScript。
* 模块化清晰，适合 Auth、Queue、Arcade、Notification 分模块。
* 方便接入 WebSocket。
* 方便生成 OpenAPI 文档。

也可以选：

```txt
Fastify + TypeScript
```

如果想轻量一点。

### 2.3 数据库

推荐：

```txt
PostgreSQL
```

原因：

* 队列、用户、机厅、机台、登录绑定关系都适合关系型数据库。
* 支持事务，避免多人同时排卡时出现顺序错乱。
* 支持 JSONB，用于保存扩展规则配置。

ORM 推荐：

```txt
Prisma
```

### 2.4 缓存与实时状态

推荐：

```txt
Redis
```

用途：

* WebSocket 在线状态。
* 排队状态缓存。
* 限流。
* 登录 state/code 临时缓存。
* 通知去重。
* 分布式锁。

### 2.5 实时通信

推荐：

```txt
WebSocket / Socket.IO
```

用途：

* 队列变化实时推送。
* 用户加入、离开、过号、上机、完成时同步刷新。
* 管理员叫号时实时通知页面。

### 2.6 部署

推荐：

```txt
Docker Compose
Nginx
PostgreSQL
Redis
Node.js 22 LTS
```

生产环境可选：

```txt
Vercel 前端 + 独立后端
或
一台 VPS 全栈 Docker 部署
```

---

## 3. 系统角色

### 3.1 游客

未登录用户。

权限：

* 查看公开机厅列表。
* 查看公开队列。
* 查看当前排队人数。
* 不能加入队列。
* 不能管理队列。

### 3.2 普通用户

登录后的玩家。

权限：

* 加入队列。
* 退出队列。
* 修改自己的排卡备注。
* 标记“已到场 / 暂离 / 未到场”。
* 查看自己的历史排卡记录。
* 绑定微信、QQ、GitHub 账号。

### 3.3 机厅管理员

权限：

* 管理自己的机厅。
* 添加/编辑机台。
* 创建队列。
* 叫号。
* 过号。
* 移除异常用户。
* 暂停/恢复排队。
* 设置排队规则。

### 3.4 超级管理员

权限：

* 管理所有用户。
* 管理所有机厅。
* 审核机厅。
* 处理举报。
* 查看系统日志。

---

## 4. 核心业务概念

### 4.1 机厅 Arcade

表示一个线下游戏厅。

字段示例：

```ts
Arcade {
  id: string
  name: string
  city: string
  address: string
  description?: string
  status: "active" | "hidden" | "disabled"
  ownerUserId?: string
}
```

### 4.2 机台 Machine

一个机厅内可能有多台舞萌机。

```ts
Machine {
  id: string
  arcadeId: string
  name: string        // 例如：1号机、2号机、左机、右机
  game: "maimai_dx"
  status: "normal" | "maintenance" | "disabled"
}
```

### 4.3 队列 Queue

一个机厅可以有一个总队列，也可以按机台分队列。

```ts
Queue {
  id: string
  arcadeId: string
  machineId?: string
  name: string
  mode: "single" | "group"
  status: "open" | "paused" | "closed"
  maxGroupSize: number
  ruleConfig: Json
}
```

### 4.4 排卡项 QueueEntry

用户在队列中的一次排卡。

```ts
QueueEntry {
  id: string
  queueId: string
  userId: string
  displayName: string
  position: number
  status:
    | "waiting"
    | "called"
    | "playing"
    | "finished"
    | "skipped"
    | "cancelled"
  peopleCount: number
  note?: string
  checkInStatus: "unknown" | "arrived" | "away"
  createdAt: Date
  calledAt?: Date
  startedAt?: Date
  finishedAt?: Date
}
```

---

## 5. 排卡规则设计

### 5.1 推荐默认规则

```txt
1. 用户登录后才能排卡。
2. 同一个用户在同一个队列中只能有一个 waiting/called/playing 状态的排卡。
3. 支持单人排卡和多人组队排卡。
4. 排到后进入 called 状态。
5. 超过 N 分钟未确认，可由管理员过号。
6. 上机后进入 playing 状态。
7. 下机后进入 finished 状态。
8. 用户可主动取消自己的 waiting 排卡。
9. 管理员可手动调整顺序。
10. 队列暂停时，用户不能新排卡，但已有队列保留。
```

### 5.2 组队排卡

舞萌常见两人同机游玩，因此系统需要支持：

```txt
peopleCount = 1 或 2
```

可扩展为：

```txt
groupMembers: QueueEntryMember[]
```

```ts
QueueEntryMember {
  id: string
  queueEntryId: string
  userId?: string
  nickname: string
  role: "owner" | "member"
}
```

### 5.3 过号机制

建议状态流转：

```txt
waiting -> called -> playing -> finished
waiting -> cancelled
called -> skipped
called -> waiting
```

“called -> waiting”用于管理员恢复误过号。

### 5.4 防刷规则

```txt
1. 同一用户 10 秒内不能重复操作排卡。
2. 同一 IP 每分钟最多 30 次排卡相关请求。
3. 同一队列中同一用户只能有一个活跃排卡。
4. 管理员操作写入审计日志。
```

---

## 6. 登录系统设计

系统采用统一账号模型：

```txt
User
 ├── UserIdentity: wechat_web
 ├── UserIdentity: wechat_miniapp
 ├── UserIdentity: qq
 └── UserIdentity: github
```

### 6.1 用户表

```ts
User {
  id: string
  nickname: string
  avatarUrl?: string
  role: "user" | "arcade_admin" | "super_admin"
  createdAt: Date
  updatedAt: Date
}
```

### 6.2 第三方身份表

```ts
UserIdentity {
  id: string
  userId: string
  provider:
    | "wechat_web"
    | "wechat_miniapp"
    | "qq"
    | "github"
  providerUserId: string     // openid / unionid / GitHub id
  unionId?: string
  accessTokenEncrypted?: string
  refreshTokenEncrypted?: string
  profileJson?: Json
  createdAt: Date
  updatedAt: Date
}
```

### 6.3 微信 Web 登录

微信网站应用登录属于微信开放平台 OAuth2.0 登录，第三方网站在用户授权后可获取 access_token，并进一步获取微信用户基础信息。([Wdk Docs][3])

后端接口：

```http
GET /api/auth/wechat/web/redirect
GET /api/auth/wechat/web/callback?code=xxx&state=xxx
```

流程：

```txt
1. 前端点击“微信登录”。
2. 后端生成 state，保存到 Redis。
3. 后端重定向到微信 OAuth 授权页。
4. 用户扫码确认。
5. 微信回调 /callback，携带 code 和 state。
6. 后端校验 state。
7. 后端用 code 换 access_token。
8. 后端获取 openid / unionid / 用户资料。
9. 查找或创建 User。
10. 签发系统 JWT / Session。
```

### 6.4 微信小程序登录

微信小程序登录通常通过 `wx.login()` 获取临时登录凭证 code，再把 code 发送到开发者服务器，由服务器换取 openid、unionid、session_key 等登录态信息。([Wdk Docs][4])

接口：

```http
POST /api/auth/wechat/miniapp/login
```

请求：

```json
{
  "code": "wx.login 获取到的 code",
  "nickname": "用户昵称，可选",
  "avatarUrl": "用户头像，可选"
}
```

响应：

```json
{
  "token": "jwt",
  "user": {
    "id": "user_123",
    "nickname": "玩家A",
    "avatarUrl": "https://..."
  }
}
```

注意：

```txt
AppSecret 必须只放在服务端，不能写进小程序前端。
```

小程序生态中 AppSecret 泄漏会导致严重安全问题，因此密钥必须由后端保存。([arXiv][5])

### 6.5 QQ 登录

QQ 登录通过 QQ 互联 OAuth2.0 接入，网站可使用 SDK 或按 OAuth2.0 协议自行开发；接入前需要申请 appid/client_id 和 appkey/client_secret，并配置域名与回调地址。([QQ互联WIKI][6])

接口：

```http
GET /api/auth/qq/redirect
GET /api/auth/qq/callback?code=xxx&state=xxx
```

流程与微信 Web 登录类似：

```txt
1. 生成 state。
2. 跳转 QQ 授权页。
3. QQ 回调 code。
4. 后端换 access_token。
5. 获取 openid。
6. 获取用户资料。
7. 绑定或创建用户。
8. 签发系统 token。
```

### 6.6 GitHub 登录

GitHub OAuth Apps 支持 Web application flow，适合浏览器中的标准 OAuth 登录。([GitHub Docs][7])

接口：

```http
GET /api/auth/github/redirect
GET /api/auth/github/callback?code=xxx&state=xxx
```

建议 scope：

```txt
read:user user:email
```

流程：

```txt
1. 用户点击 GitHub 登录。
2. 后端生成 state。
3. 跳转 GitHub OAuth 页面。
4. GitHub 回调 code。
5. 后端用 code 换 access_token。
6. 获取 GitHub 用户 id、login、avatar_url、email。
7. 绑定或创建用户。
8. 签发系统 token。
```

---

## 7. 数据库设计 Prisma 示例

```prisma
model User {
  id          String   @id @default(cuid())
  nickname    String
  avatarUrl   String?
  role        UserRole @default(user)
  identities  UserIdentity[]
  queueEntries QueueEntry[]
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}

model UserIdentity {
  id                    String @id @default(cuid())
  userId                String
  provider              AuthProvider
  providerUserId        String
  unionId               String?
  accessTokenEncrypted  String?
  refreshTokenEncrypted String?
  profileJson           Json?

  user User @relation(fields: [userId], references: [id])

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([provider, providerUserId])
}

model Arcade {
  id          String @id @default(cuid())
  name        String
  city        String
  address     String
  description String?
  status      ArcadeStatus @default(active)

  machines Machine[]
  queues   Queue[]

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

model Machine {
  id       String @id @default(cuid())
  arcadeId String
  name     String
  game     String @default("maimai_dx")
  status   MachineStatus @default(normal)

  arcade Arcade @relation(fields: [arcadeId], references: [id])
  queues Queue[]

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

model Queue {
  id           String @id @default(cuid())
  arcadeId     String
  machineId    String?
  name         String
  mode         QueueMode @default(group)
  status       QueueStatus @default(open)
  maxGroupSize Int @default(2)
  ruleConfig   Json?

  arcade  Arcade @relation(fields: [arcadeId], references: [id])
  machine Machine? @relation(fields: [machineId], references: [id])
  entries QueueEntry[]

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

model QueueEntry {
  id            String @id @default(cuid())
  queueId       String
  userId        String
  displayName   String
  position      Int
  status        QueueEntryStatus @default(waiting)
  peopleCount   Int @default(1)
  note          String?
  checkInStatus CheckInStatus @default(unknown)

  queue Queue @relation(fields: [queueId], references: [id])
  user  User  @relation(fields: [userId], references: [id])

  createdAt  DateTime @default(now())
  calledAt   DateTime?
  startedAt  DateTime?
  finishedAt DateTime?
}

enum UserRole {
  user
  arcade_admin
  super_admin
}

enum AuthProvider {
  wechat_web
  wechat_miniapp
  qq
  github
}

enum ArcadeStatus {
  active
  hidden
  disabled
}

enum MachineStatus {
  normal
  maintenance
  disabled
}

enum QueueMode {
  single
  group
}

enum QueueStatus {
  open
  paused
  closed
}

enum QueueEntryStatus {
  waiting
  called
  playing
  finished
  skipped
  cancelled
}

enum CheckInStatus {
  unknown
  arrived
  away
}
```

---

## 8. API 设计

统一前缀：

```txt
/api/v1
```

认证方式：

```http
Authorization: Bearer <token>
```

---

# 8.1 Auth API

## 当前用户

```http
GET /api/v1/auth/me
```

响应：

```json
{
  "id": "user_123",
  "nickname": "玩家A",
  "avatarUrl": "https://...",
  "role": "user",
  "providers": ["github", "wechat_miniapp"]
}
```

## 登出

```http
POST /api/v1/auth/logout
```

## 绑定第三方账号

```http
POST /api/v1/auth/bind/:provider
```

`provider`：

```txt
wechat_web
wechat_miniapp
qq
github
```

## 解绑第三方账号

```http
DELETE /api/v1/auth/bind/:provider
```

---

# 8.2 机厅 API

## 获取机厅列表

```http
GET /api/v1/arcades?city=上海&keyword=xxx
```

响应：

```json
{
  "items": [
    {
      "id": "arcade_1",
      "name": "XX机厅",
      "city": "上海",
      "address": "XX路XX号",
      "queueCount": 2,
      "waitingCount": 12
    }
  ]
}
```

## 获取机厅详情

```http
GET /api/v1/arcades/:arcadeId
```

响应：

```json
{
  "id": "arcade_1",
  "name": "XX机厅",
  "city": "上海",
  "address": "XX路XX号",
  "machines": [
    {
      "id": "machine_1",
      "name": "1号机",
      "status": "normal"
    }
  ],
  "queues": [
    {
      "id": "queue_1",
      "name": "舞萌总队列",
      "status": "open",
      "waitingCount": 8
    }
  ]
}
```

## 创建机厅

```http
POST /api/v1/arcades
```

权限：

```txt
super_admin
```

请求：

```json
{
  "name": "XX机厅",
  "city": "上海",
  "address": "XX路XX号",
  "description": "营业时间 10:00-22:00"
}
```

## 修改机厅

```http
PATCH /api/v1/arcades/:arcadeId
```

权限：

```txt
arcade_admin / super_admin
```

---

# 8.3 机台 API

## 创建机台

```http
POST /api/v1/arcades/:arcadeId/machines
```

请求：

```json
{
  "name": "1号机",
  "game": "maimai_dx"
}
```

## 修改机台状态

```http
PATCH /api/v1/machines/:machineId
```

请求：

```json
{
  "status": "maintenance"
}
```

---

# 8.4 队列 API

## 获取队列详情

```http
GET /api/v1/queues/:queueId
```

响应：

```json
{
  "id": "queue_1",
  "name": "舞萌总队列",
  "status": "open",
  "waitingCount": 6,
  "entries": [
    {
      "id": "entry_1",
      "displayName": "玩家A",
      "position": 1,
      "status": "waiting",
      "peopleCount": 2,
      "checkInStatus": "arrived",
      "note": "等朋友"
    }
  ]
}
```

## 创建队列

```http
POST /api/v1/arcades/:arcadeId/queues
```

请求：

```json
{
  "machineId": "machine_1",
  "name": "1号机队列",
  "mode": "group",
  "maxGroupSize": 2,
  "ruleConfig": {
    "callTimeoutSeconds": 180,
    "allowUserCancel": true,
    "allowRejoinAfterSkipped": true
  }
}
```

## 暂停队列

```http
POST /api/v1/queues/:queueId/pause
```

## 恢复队列

```http
POST /api/v1/queues/:queueId/resume
```

## 关闭队列

```http
POST /api/v1/queues/:queueId/close
```

---

# 8.5 排卡 API

## 加入队列

```http
POST /api/v1/queues/:queueId/entries
```

请求：

```json
{
  "displayName": "玩家A",
  "peopleCount": 2,
  "note": "和朋友双人"
}
```

响应：

```json
{
  "id": "entry_123",
  "queueId": "queue_1",
  "position": 7,
  "status": "waiting",
  "estimatedWaitMinutes": 21
}
```

后端处理重点：

```txt
1. 开启数据库事务。
2. 检查队列是否 open。
3. 检查用户是否已有活跃排卡。
4. 查询当前最大 position。
5. 新建 QueueEntry，position = max + 1。
6. 提交事务。
7. 发布 WebSocket 队列更新事件。
```

## 退出队列

```http
DELETE /api/v1/queue-entries/:entryId
```

只允许：

```txt
本人 / 管理员
```

## 修改备注

```http
PATCH /api/v1/queue-entries/:entryId
```

请求：

```json
{
  "note": "刚到，人在旁边"
}
```

## 标记到场状态

```http
POST /api/v1/queue-entries/:entryId/check-in
```

请求：

```json
{
  "checkInStatus": "arrived"
}
```

## 管理员叫号

```http
POST /api/v1/queues/:queueId/call-next
```

响应：

```json
{
  "entryId": "entry_123",
  "displayName": "玩家A",
  "status": "called"
}
```

## 开始游玩

```http
POST /api/v1/queue-entries/:entryId/start
```

状态变化：

```txt
called -> playing
```

## 完成游玩

```http
POST /api/v1/queue-entries/:entryId/finish
```

状态变化：

```txt
playing -> finished
```

## 过号

```http
POST /api/v1/queue-entries/:entryId/skip
```

状态变化：

```txt
called -> skipped
```

## 恢复过号

```http
POST /api/v1/queue-entries/:entryId/restore
```

状态变化：

```txt
skipped -> waiting
```

---

## 9. WebSocket 事件设计

连接：

```txt
wss://example.com/ws
```

客户端加入房间：

```json
{
  "type": "subscribe_queue",
  "queueId": "queue_1"
}
```

服务端推送：

### 队列刷新

```json
{
  "type": "queue_updated",
  "queueId": "queue_1",
  "waitingCount": 6,
  "entries": []
}
```

### 叫号通知

```json
{
  "type": "entry_called",
  "queueId": "queue_1",
  "entryId": "entry_123",
  "userId": "user_123",
  "message": "轮到你了"
}
```

### 队列暂停

```json
{
  "type": "queue_paused",
  "queueId": "queue_1"
}
```

---

## 10. 前端页面设计

### 10.1 首页

路径：

```txt
/
```

功能：

```txt
1. 展示附近/热门机厅。
2. 搜索机厅。
3. 展示当前排队人数。
4. 登录入口。
```

### 10.2 机厅详情页

路径：

```txt
/arcades/:arcadeId
```

功能：

```txt
1. 机厅信息。
2. 机台列表。
3. 队列列表。
4. 当前等待人数。
5. 一键加入队列。
```

### 10.3 队列详情页

路径：

```txt
/queues/:queueId
```

功能：

```txt
1. 展示当前排卡列表。
2. 展示自己的排卡状态。
3. 加入队列。
4. 退出队列。
5. 修改备注。
6. 标记到场/暂离。
```

### 10.4 管理后台

路径：

```txt
/admin
```

功能：

```txt
1. 机厅管理。
2. 机台管理。
3. 队列管理。
4. 叫号。
5. 过号。
6. 暂停队列。
7. 用户管理。
8. 操作日志。
```

---

## 11. 微信小程序设计

建议小程序不是单独一套后端，而是复用同一套 API。

### 11.1 小程序页面

```txt
/pages/index/index              首页
/pages/arcade/detail            机厅详情
/pages/queue/detail             队列详情
/pages/me/index                 我的
/pages/admin/index              管理后台简版
```

### 11.2 小程序登录流程

```txt
1. 小程序调用 wx.login()。
2. 获取 code。
3. 调用 POST /api/v1/auth/wechat/miniapp/login。
4. 后端换取 openid / unionid。
5. 后端创建或查找用户。
6. 返回系统 token。
7. 小程序保存 token。
```

### 11.3 小程序扫码排卡

可以设计为：

```txt
机厅张贴二维码：
https://example.com/queues/:queueId
```

或小程序码参数：

```txt
scene=queueId_xxx
```

扫码后直接进入对应队列详情页。

---

## 12. 权限控制

建议使用 RBAC：

```ts
enum Permission {
  QUEUE_JOIN
  QUEUE_LEAVE_SELF
  QUEUE_MANAGE
  ARCADE_MANAGE
  USER_MANAGE
  SYSTEM_MANAGE
}
```

权限表：

| 操作     | 游客 | 用户 | 机厅管理员 | 超级管理员 |
| ------ | -: | -: | ----: | ----: |
| 查看队列   |  ✅ |  ✅ |     ✅ |     ✅ |
| 加入队列   |  ❌ |  ✅ |     ✅ |     ✅ |
| 退出自己队列 |  ❌ |  ✅ |     ✅ |     ✅ |
| 叫号     |  ❌ |  ❌ |     ✅ |     ✅ |
| 过号     |  ❌ |  ❌ |     ✅ |     ✅ |
| 创建机厅   |  ❌ |  ❌ |     ❌ |     ✅ |
| 管理用户   |  ❌ |  ❌ |     ❌ |     ✅ |

---

## 13. 安全设计

### 13.1 OAuth 安全

```txt
1. 所有 OAuth 登录必须使用 state 防 CSRF。
2. client_secret / appsecret 只保存在服务端。
3. 回调地址必须白名单校验。
4. access_token 加密存储。
5. 不把第三方 access_token 暴露给前端。
```

### 13.2 排队并发安全

加入队列时必须使用事务：

```sql
BEGIN;
SELECT MAX(position) FROM queue_entries WHERE queue_id = $1 FOR UPDATE;
INSERT INTO queue_entries (...);
COMMIT;
```

或使用 Redis Lock：

```txt
lock:queue:{queueId}
```

### 13.3 风控

```txt
1. IP 限流。
2. 用户限流。
3. 管理员操作日志。
4. 敏感操作二次确认。
5. 防止重复排卡。
```

---

## 14. 通知设计

MVP 阶段：

```txt
WebSocket 页面内通知
```

后续扩展：

```txt
1. 微信小程序订阅消息。
2. QQ Bot 通知。
3. 邮件通知。
4. 浏览器 Push。
```

叫号通知触发点：

```txt
called
skipped
queue_paused
queue_resumed
```

---

## 15. 推荐开发阶段

### Phase 1：Web MVP

目标：

```txt
可用的网页排卡系统
```

包含：

```txt
1. 用户注册/登录，先用 GitHub 或账号密码。
2. 机厅列表。
3. 队列详情。
4. 加入队列。
5. 退出队列。
6. 管理员叫号/过号/完成。
7. WebSocket 实时刷新。
```

### Phase 2：多平台登录

加入：

```txt
1. GitHub OAuth。
2. QQ OAuth。
3. 微信 Web OAuth。
4. 第三方账号绑定/解绑。
```

### Phase 3：微信小程序

加入：

```txt
1. 小程序登录。
2. 小程序扫码进入队列。
3. 小程序排卡。
4. 小程序订阅通知。
```

### Phase 4：机厅生态功能

加入：

```txt
1. 机厅管理员申请。
2. 机厅二维码。
3. 排卡统计。
4. 黑名单。
5. 常驻玩家备注。
6. 多机台智能分配。
```

---

## 16. 项目目录建议

```txt
maimai-queue/
├── apps/
│   ├── web/                 # Next.js Web 前端
│   ├── api/                 # NestJS 后端
│   └── miniapp/             # 微信小程序，后续添加
├── packages/
│   ├── shared/              # 共享类型
│   ├── ui/                  # 共享 UI
│   └── config/              # eslint/tsconfig 等
├── prisma/
│   └── schema.prisma
├── docker-compose.yml
└── README.md
```

---

## 17. 环境变量设计

```env
DATABASE_URL="postgresql://user:pass@localhost:5432/maimai_queue"
REDIS_URL="redis://localhost:6379"

JWT_SECRET="change_me"

GITHUB_CLIENT_ID=""
GITHUB_CLIENT_SECRET=""
GITHUB_CALLBACK_URL="https://example.com/api/auth/github/callback"

QQ_CLIENT_ID=""
QQ_CLIENT_SECRET=""
QQ_CALLBACK_URL="https://example.com/api/auth/qq/callback"

WECHAT_WEB_APP_ID=""
WECHAT_WEB_APP_SECRET=""
WECHAT_WEB_CALLBACK_URL="https://example.com/api/auth/wechat/web/callback"

WECHAT_MINIAPP_APP_ID=""
WECHAT_MINIAPP_APP_SECRET=""
```

---

## 18. MVP API 清单

最小可用版本只需要这些：

```txt
GET    /api/v1/auth/me
GET    /api/v1/arcades
GET    /api/v1/arcades/:arcadeId
GET    /api/v1/queues/:queueId
POST   /api/v1/queues/:queueId/entries
DELETE /api/v1/queue-entries/:entryId
PATCH  /api/v1/queue-entries/:entryId
POST   /api/v1/queue-entries/:entryId/check-in
POST   /api/v1/queues/:queueId/call-next
POST   /api/v1/queue-entries/:entryId/start
POST   /api/v1/queue-entries/:entryId/finish
POST   /api/v1/queue-entries/:entryId/skip
```

---

## 19. 可选：接入舞萌查分/玩家资料

如果后续想做玩家资料展示，可以考虑接入第三方舞萌查分器 API。比如 Lxns maimai DX 查分器提供公共 API，用于获取舞萌 DX 玩家、歌曲、成绩等数据。([maimai.lxns.net][8])

但排卡系统的核心不依赖查分器，建议先不要强绑定查分功能，避免账号授权、数据来源、稳定性和合规问题影响 MVP。

---

## 20. 推荐最终方案

建议最终架构：

```txt
Next.js Web
      ↓
NestJS API
      ↓
PostgreSQL + Redis
      ↓
WebSocket 实时队列
      ↓
微信小程序 / QQ登录 / 微信登录 / GitHub登录
```

优先开发顺序：

```txt
1. 数据库模型
2. 用户系统
3. 机厅/机台/队列模型
4. 加入队列/退出队列
5. 管理员叫号/过号/完成
6. WebSocket 实时刷新
7. GitHub 登录
8. QQ / 微信 Web 登录
9. 微信小程序登录
10. 小程序扫码排卡
```

这个设计可以先快速做出 Web MVP，同时不会堵死后续微信小程序、QQ 登录、GitHub 登录和机厅管理扩展。

[1]: https://karenbot.xszq.xyz/guide/?utm_source=chatgpt.com "使用说明 | 可怜Bot"
[2]: https://www.newton.com.tw/wiki/%E8%88%9E%E8%90%8CDX/65052900?utm_source=chatgpt.com "舞萌DX:遊戲玩法,上線版本,_中文百科全書"
[3]: https://wdk-docs.github.io/wxopen-docs/website/login.html?utm_source=chatgpt.com "网站应用微信登录开发指南 — wxopen-docs 1.0.0 文档"
[4]: https://wdk-docs.github.io/wxadev-docs/framework/open-ability/user/login.html?utm_source=chatgpt.com "小程序登录 — wxadev v2.21.0 文档"
[5]: https://arxiv.org/abs/2306.08151?utm_source=chatgpt.com "Don't Leak Your Keys: Understanding, Measuring, and Exploiting the AppSecret Leaks in Mini-Programs"
[6]: https://wiki.connect.qq.com/OAuth2.0%E5%BC%80%E5%8F%91%E6%96%87%E6%A1%A3?utm_source=chatgpt.com "OAuth2.0开发文档"
[7]: https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps?utm_source=chatgpt.com "Authorizing OAuth apps - GitHub Docs"
[8]: https://maimai.lxns.net/?utm_source=chatgpt.com "maimai DX 查分器"
