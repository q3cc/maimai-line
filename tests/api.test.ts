import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/server/app";

let tempDir = "";
let app: ReturnType<typeof createApp>;

beforeEach(() => {
  tempDir = mkdtempSync(path.join(os.tmpdir(), "maimai-line-"));
  app = createApp({
    filePath: path.join(tempDir, "demo-db.json"),
    reset: true
  });
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

async function register(email: string, username: string, password = "password123") {
  const response = await request(app)
    .post("/api/v1/auth/register")
    .send({ email, username, password })
    .expect(201);
  return response.body as {
    token: string;
    user: { id: string; role: string; username: string; email: string };
  };
}

describe("seed data", () => {
  it("creates test机厅 with demo_1 and demo_2 machines", async () => {
    const list = await request(app).get("/api/v1/arcades").expect(200);
    expect(list.body.items).toHaveLength(1);
    expect(list.body.items[0]).toMatchObject({
      id: "arcade_test",
      name: "test机厅",
      machineCount: 2,
      queueCount: 2
    });

    const detail = await request(app).get("/api/v1/arcades/arcade_test").expect(200);
    expect(detail.body.machines.map((machine: { id: string }) => machine.id)).toEqual([
      "demo_1",
      "demo_2"
    ]);
  });
});

describe("auth", () => {
  it("makes the first registered user admin and supports username login", async () => {
    const admin = await register("admin@example.com", "admin_demo");
    expect(admin.user.role).toBe("super_admin");

    const user = await register("player@example.com", "player_demo");
    expect(user.user.role).toBe("user");

    const login = await request(app)
      .post("/api/v1/auth/login")
      .send({ username: "player_demo", password: "password123" })
      .expect(200);
    expect(login.body.user.username).toBe("player_demo");

    const me = await request(app)
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${login.body.token}`)
      .expect(200);
    expect(me.body.user.email).toBe("player@example.com");
  });
});

describe("queue flow", () => {
  it("lets a user join, prevents duplicate active entries, and supports admin call/start/finish/rejoin", async () => {
    const admin = await register("admin@example.com", "admin_demo");
    const player = await register("player@example.com", "player_demo");

    const join = await request(app)
      .post("/api/v1/queues/queue_demo_1/join")
      .set("Authorization", `Bearer ${player.token}`)
      .send({ displayName: "玩家A", peopleCount: 2, note: "测试双人" })
      .expect(201);

    expect(join.body).toMatchObject({
      queueId: "queue_demo_1",
      state: "waiting",
      position: 1
    });

    await request(app)
      .post("/api/v1/queues/queue_demo_1/join")
      .set("Authorization", `Bearer ${player.token}`)
      .send({ displayName: "玩家A", peopleCount: 1 })
      .expect(409);

    const called = await request(app)
      .post("/api/v1/queues/queue_demo_1/call-next")
      .set("Authorization", `Bearer ${admin.token}`)
      .send({ timeoutSeconds: 180 })
      .expect(200);

    expect(called.body).toMatchObject({
      entryId: join.body.entryId,
      state: "called"
    });

    await request(app)
      .post(`/api/v1/queue-entries/${join.body.entryId}/confirm-playing`)
      .set("Authorization", `Bearer ${player.token}`)
      .expect(200);

    const finished = await request(app)
      .post(`/api/v1/queue-entries/${join.body.entryId}/finish`)
      .set("Authorization", `Bearer ${player.token}`)
      .expect(200);

    expect(finished.body).toMatchObject({
      entryId: join.body.entryId,
      state: "finished",
      askRejoin: true
    });

    const rejoin = await request(app)
      .post(`/api/v1/queue-entries/${join.body.entryId}/rejoin`)
      .set("Authorization", `Bearer ${player.token}`)
      .send({ peopleCount: 1, note: "继续打一轮" })
      .expect(201);

    expect(rejoin.body).toMatchObject({
      oldEntryId: join.body.entryId,
      state: "waiting",
      position: 1
    });
    expect(rejoin.body.newEntryId).not.toBe(join.body.entryId);
  });
});
