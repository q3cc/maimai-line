# maimai-line demo

舞萌排卡系统 demo：当前版本实现 API 和占位 UI，不接入微信/QQ/GitHub 登录。

## Demo seed

- 机厅：`test机厅` (`arcade_test`)
- 机台：`demo_1`, `demo_2`
- 队列：`queue_demo_1`, `queue_demo_2`
- 快捷入口：`/s/test`, `/s/demo1`, `/s/demo2`

第一个注册用户自动成为 `super_admin`，后续注册用户为 `user`。

## Run

```bash
npm install
npm run dev
```

Open <http://localhost:3000>.

## Useful scripts

```bash
npm test
npm run typecheck
npm run build
npm start
```

## Main API

All API routes are under `/api/v1`.

- `POST /auth/register`
- `POST /auth/login`
- `GET /auth/me`
- `GET /arcades`
- `GET /arcades/:arcadeId`
- `GET /queues/:queueId`
- `GET /queues/:queueId/my-state`
- `POST /queues/:queueId/entries`
- `POST /queues/:queueId/join`
- `DELETE /queue-entries/:entryId`
- `POST /queue-entries/:entryId/cancel`
- `PATCH /queue-entries/:entryId`
- `POST /queue-entries/:entryId/check-in`
- `POST /queues/:queueId/call-next`
- `POST /queue-entries/:entryId/start`
- `POST /queue-entries/:entryId/confirm-playing`
- `POST /queue-entries/:entryId/finish`
- `POST /queue-entries/:entryId/skip`
- `POST /queue-entries/:entryId/give-up`
- `POST /queue-entries/:entryId/restore`
- `POST /queue-entries/:entryId/rejoin`
- `GET /quick-entry/resolve/:shortCode`

Use `Authorization: Bearer <token>` for authenticated endpoints.
