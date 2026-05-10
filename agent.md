# Demo Implementation Brief

## Source documents

- `D:\Documents\maimai-line\doc\舞萌排卡 Web 系统开发文档 v0.1.md`
- `D:\Documents\maimai-line\doc\微信小程序二维码.md`

## Current demo scope

Build a runnable demo version of the maimai queueing system.

### Explicit requirements

- Do **not** integrate WeChat login, QQ login, GitHub login, or WeChat Mini Program login in this demo.
- Use local account authentication with:
  - email
  - username
  - password
- The first registered user must automatically become the administrator.
- Seed demo venue data:
  - one arcade named `test机厅`
  - two maimai machines named/identified as `demo_1` and `demo_2`
- Claude will handle the final UI.
- This repository should provide:
  - API implementation
  - a simple placeholder UI only

### Demo API priorities

- Auth:
  - register
  - login by email or username
  - current user
- Arcade:
  - list arcades
  - arcade details
- Queue:
  - queue details
  - my queue state
  - join queue
  - cancel/leave queue
  - update note/check-in status
  - admin call next
  - confirm playing/start
  - finish
  - skip/give up
  - rejoin
- Quick entry:
  - resolve short link for seeded arcade/machine/queue entries

### Constraints

- Keep implementation boring and easy to replace when the production stack is selected.
- Prefer small, testable API/service modules.
- Do not expose password hashes or sensitive internals in API responses.
- The placeholder UI is intentionally minimal and should not block Claude's UI work.
