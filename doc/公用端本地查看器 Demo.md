# 公用端本地查看器 Demo 文档

## 1. 目标

为当前 demo 新增“公用端本地查看器”设计文档，用于线下机厅放置 Pad 或大屏查看当前舞萌排卡状态，并让玩家通过二维码或本地页面快速加入队列。

本功能是 demo 阶段能力：

```txt
Pad 公用端展示队列状态
        ↓
Pad 显示二维码
        ↓
玩家扫码打开本地查看器
        ↓
查看队列 / 加入队列
```

二维码不再指向单纯“加入页”，而是指向一个完整的本地队列查看器页面。查看器既能看队列，也能加入队列。

---

## 2. 页面定义

### 2.1 Pad 公用端

路径：

```txt
/pad/queues/:queueId
```

使用场景：

```txt
1. 机厅在柜台、机台旁或公共区域放置一台 Pad。
2. Pad 长期开着该页面。
3. 玩家可以直接看到当前队列状态。
4. 玩家也可以扫描页面上的二维码，用自己的手机打开本地查看器。
```

页面展示内容：

```txt
1. 机厅名称。
2. 机台名称。
3. 队列名称。
4. 队列状态：open / paused / closed。
5. 等待中 waiting 列表。
6. 已叫号 called 列表。
7. 游玩中 playing 列表。
8. 当前等待人数。
9. 加入队列按钮。
10. 指向本地查看器的二维码。
```

Pad 页面上的二维码目标：

```txt
/viewer/queues/:queueId
```

示例：

```txt
/viewer/queues/queue_demo_1
```

---

### 2.2 本地队列查看器

路径：

```txt
/viewer/queues/:queueId
```

使用场景：

```txt
1. 玩家用手机扫描 Pad 上的二维码。
2. 手机打开本地查看器页面。
3. 玩家查看当前队列状态。
4. 玩家选择身份方式并加入队列。
```

页面展示内容：

```txt
1. 机厅名称。
2. 机台名称。
3. 队列名称。
4. 当前队列状态。
5. 当前队伍列表。
6. 加入队列按钮。
7. 游客昵称输入。
8. 微信登录按钮。
9. QQ 登录按钮。
10. 加入方式选择：私人 / 单刷 / 直接加入。
```

说明：

```txt
本地查看器不是后台管理页面。
本地查看器面向普通玩家。
本地查看器可以在局域网环境使用，例如 http://192.168.x.x:3000/viewer/queues/queue_demo_1。
```

---

## 3. 身份方式

本地查看器支持三种身份方式：

```txt
1. 游客昵称加入
2. 微信登录后加入
3. QQ 登录后加入
```

### 3.1 游客昵称加入

Demo 阶段优先实现游客昵称加入。

规则：

```txt
1. 游客不需要邮箱、用户名、密码。
2. 游客不创建正式账号。
3. 每次加入队列只填写 displayName。
4. 服务端创建游客排卡项。
5. 游客排卡可以被管理员叫号、跳过、开始、完成。
6. 游客刷新页面后不保证能恢复“我的状态”。
```

适用场景：

```txt
线下机厅快速排卡，不要求用户先注册。
```

### 3.2 微信登录

微信登录作为 demo UI 和文档预留入口，不要求当前版本接入真实 OAuth。

入口：

```http
GET /api/v1/auth/wechat/web/redirect
```

建议参数：

```txt
returnTo=/viewer/queues/:queueId
```

示例：

```txt
/api/v1/auth/wechat/web/redirect?returnTo=/viewer/queues/queue_demo_1
```

登录完成后：

```txt
1. 后端签发系统 token。
2. 前端回到 /viewer/queues/:queueId。
3. 用户使用登录态调用正式用户加入队列接口。
```

### 3.3 QQ 登录

QQ 登录作为 demo UI 和文档预留入口，不要求当前版本接入真实 OAuth。

入口：

```http
GET /api/v1/auth/qq/redirect
```

建议参数：

```txt
returnTo=/viewer/queues/:queueId
```

示例：

```txt
/api/v1/auth/qq/redirect?returnTo=/viewer/queues/queue_demo_1
```

登录完成后流程与微信一致。

---

## 4. 加入方式

本地查看器加入队列时仍使用既有加入方式：

```txt
private：私人
solo：单刷
match：直接加入
```

### 4.1 私人 private

```txt
1. 舞萌默认两人一组。
2. 创建一个两人私有组。
3. 返回分享链接 / 分享码。
4. 用户自行分享给朋友。
5. 私人组不会被陌生玩家直接匹配。
```

### 4.2 单刷 solo

```txt
1. 单人一组。
2. peopleCount = 1。
3. targetPeopleCount = 1。
4. 不等待队友。
```

### 4.3 直接加入 match

```txt
1. 系统优先匹配已有未满公开两人组。
2. 如果没有可匹配组，则创建一个公开待匹配两人组。
3. 舞萌默认 targetPeopleCount = 2。
```

---

## 5. API 设计

### 5.1 获取队列状态

Pad 和本地查看器都调用同一个队列详情接口：

```http
GET /api/v1/queues/:queueId
```

响应重点字段：

```json
{
  "id": "queue_demo_1",
  "name": "demo_1 队列",
  "status": "open",
  "waitingCount": 2,
  "arcade": {
    "id": "arcade_test",
    "name": "test机厅"
  },
  "machine": {
    "id": "demo_1",
    "name": "demo_1"
  },
  "entries": [
    {
      "id": "entry_123",
      "displayName": "玩家A",
      "position": 1,
      "status": "waiting",
      "joinMode": "match",
      "peopleCount": 1,
      "targetPeopleCount": 2
    }
  ]
}
```

Pad 页面按状态分组展示：

```txt
waiting：等待中
called：已叫号
playing：游玩中
finished / skipped / cancelled：默认不在 Pad 主列表展示，可放入历史区
```

---

### 5.2 游客加入队列

```http
POST /api/v1/queues/:queueId/guest-entries
```

请求：

```json
{
  "displayName": "游客昵称",
  "joinMode": "match",
  "note": "可选备注"
}
```

字段说明：

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `displayName` | 是 | 游客显示昵称 |
| `joinMode` | 是 | `private` / `solo` / `match` |
| `note` | 否 | 排卡备注 |

响应：

```json
{
  "entryId": "entry_123",
  "queueId": "queue_demo_1",
  "state": "waiting",
  "position": 3,
  "displayName": "游客昵称",
  "joinMode": "match",
  "peopleCount": 1,
  "targetPeopleCount": 2,
  "groupShareUrl": null
}
```

私人模式响应示例：

```json
{
  "entryId": "entry_124",
  "queueId": "queue_demo_1",
  "state": "waiting",
  "position": 4,
  "displayName": "游客昵称",
  "joinMode": "private",
  "peopleCount": 1,
  "targetPeopleCount": 2,
  "groupShareUrl": "/viewer/groups/Gp123"
}
```

游客加入限制：

```txt
1. displayName 必须 1-32 个字符。
2. joinMode 必须是 private / solo / match。
3. 队列必须是 open。
4. 游客不绑定 User 账号。
5. Demo 阶段可以用 guest userId 或 nullable userId 表示游客排卡。
6. 不承诺游客刷新页面后恢复个人状态。
```

---

### 5.3 登录用户加入队列

登录用户继续使用现有接口：

```http
POST /api/v1/queues/:queueId/join
```

认证：

```http
Authorization: Bearer <token>
```

请求：

```json
{
  "displayName": "玩家A",
  "joinMode": "match",
  "note": "可选备注"
}
```

说明：

```txt
微信 / QQ 登录完成后，本地查看器通过系统 token 调用该接口。
```

---

## 6. 页面流程

### 6.1 Pad 公用端流程

```txt
打开 /pad/queues/queue_demo_1
        ↓
GET /api/v1/queues/queue_demo_1
        ↓
展示机厅 / 机台 / 队列状态
        ↓
生成二维码，内容为 /viewer/queues/queue_demo_1
        ↓
定时刷新队列状态
```

建议刷新策略：

```txt
Demo 阶段：每 3-5 秒轮询一次。
后续正式版本：可替换为 WebSocket。
```

### 6.2 本地查看器流程

```txt
扫码打开 /viewer/queues/queue_demo_1
        ↓
GET /api/v1/queues/queue_demo_1
        ↓
展示当前队列
        ↓
点击加入队列
        ↓
选择身份方式：游客 / 微信 / QQ
        ↓
选择加入方式：私人 / 单刷 / 直接加入
        ↓
提交加入
        ↓
刷新队列并展示本次排卡结果
```

### 6.3 游客加入流程

```txt
选择“游客”
        ↓
填写昵称 displayName
        ↓
选择 joinMode
        ↓
POST /api/v1/queues/:queueId/guest-entries
        ↓
展示 position / state / joinMode
```

### 6.4 微信 / QQ 登录加入流程

```txt
选择“微信登录”或“QQ登录”
        ↓
跳转 OAuth redirect 接口
        ↓
登录完成后返回 /viewer/queues/:queueId
        ↓
前端获得系统 token
        ↓
POST /api/v1/queues/:queueId/join
```

Demo 阶段：

```txt
微信 / QQ 按钮可以先作为 UI 占位。
点击后提示“Demo 暂未接入真实 OAuth”或跳转到预留 redirect API。
```

---

## 7. UI 占位建议

### 7.1 Pad 页面布局

```txt
┌──────────────────────────────────────────────┐
│ test机厅 / demo_1 / demo_1 队列              │
│ 状态：open    等待：3人                       │
├──────────────────────┬───────────────────────┤
│ 当前队列              │ 二维码                 │
│ 1. 玩家A waiting      │ [ QR: /viewer/... ]    │
│ 2. 玩家B called       │ 扫码查看 / 加入队列     │
│ 3. 玩家C playing      │                       │
├──────────────────────┴───────────────────────┤
│ [加入队列] [刷新]                              │
└──────────────────────────────────────────────┘
```

### 7.2 Viewer 页面布局

```txt
┌──────────────────────────────┐
│ demo_1 队列                   │
│ 当前等待：3人                 │
├──────────────────────────────┤
│ 队列列表                      │
├──────────────────────────────┤
│ 加入队列                      │
│ 身份：游客 / 微信 / QQ        │
│ 昵称：[________]              │
│ 方式：私人 / 单刷 / 直接加入  │
│ [确认加入]                    │
└──────────────────────────────┘
```

---

## 8. Demo 验收标准

文档验收：

```txt
1. 明确二维码指向本地查看器，不是单独加入页。
2. 明确查看器既能看队列，也能加入队列。
3. 明确游客昵称、微信登录、QQ 登录三种入口。
4. 明确游客昵称加入不创建正式账号。
5. 明确与 private / solo / match 加入方式兼容。
```

后续实现验收：

```txt
1. 打开 /pad/queues/queue_demo_1 可以看到队列状态。
2. Pad 页面展示二维码。
3. 二维码内容为 /viewer/queues/queue_demo_1。
4. 打开 /viewer/queues/queue_demo_1 可以看到队列状态。
5. 查看器可用游客昵称加入队列。
6. 查看器有微信 / QQ 登录入口占位。
7. 游客加入后 Pad 和 Viewer 刷新后都能看到新排卡。
```

---

## 9. 与现有 demo 的关系

当前 demo 已有：

```txt
GET  /api/v1/queues/:queueId
POST /api/v1/queues/:queueId/join
```

本功能新增：

```txt
GET  /pad/queues/:queueId
GET  /viewer/queues/:queueId
POST /api/v1/queues/:queueId/guest-entries
```

微信 / QQ 登录入口沿用主文档中的 OAuth 设计，本 demo 文档只要求页面有入口和流程说明，不要求立即接入真实第三方登录。
