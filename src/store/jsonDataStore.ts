import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync
} from "node:fs";
import path from "node:path";
import type { DemoData, QueueRuleConfig } from "../domain/types";

export interface JsonDataStoreOptions {
  filePath?: string;
  reset?: boolean;
}

export const defaultQueueRuleConfig: QueueRuleConfig = {
  callTimeoutSeconds: 180,
  allowUserCancel: true,
  allowUserFinish: true,
  allowUserConfirmPlaying: true,
  allowRejoinAfterFinished: true,
  allowRejoinAfterSkipped: true,
  allowRejoinAfterCancelled: true,
  autoSkipWhenTimeout: true,
  maxActiveEntryPerUser: 1,
  maxGroupSize: 2
};

export function createSeedData(now = new Date().toISOString()): DemoData {
  return {
    users: [],
    arcades: [
      {
        id: "arcade_test",
        name: "test机厅",
        city: "Demo",
        address: "Demo 地址",
        description: "本地 demo 自动生成机厅",
        status: "active",
        ownerUserId: null,
        createdAt: now,
        updatedAt: now
      }
    ],
    machines: [
      {
        id: "demo_1",
        arcadeId: "arcade_test",
        name: "demo_1",
        game: "maimai_dx",
        status: "normal",
        createdAt: now,
        updatedAt: now
      },
      {
        id: "demo_2",
        arcadeId: "arcade_test",
        name: "demo_2",
        game: "maimai_dx",
        status: "normal",
        createdAt: now,
        updatedAt: now
      }
    ],
    queues: [
      {
        id: "queue_demo_1",
        arcadeId: "arcade_test",
        machineId: "demo_1",
        name: "demo_1 队列",
        mode: "group",
        status: "open",
        maxGroupSize: 2,
        ruleConfig: { ...defaultQueueRuleConfig },
        createdAt: now,
        updatedAt: now
      },
      {
        id: "queue_demo_2",
        arcadeId: "arcade_test",
        machineId: "demo_2",
        name: "demo_2 队列",
        mode: "group",
        status: "open",
        maxGroupSize: 2,
        ruleConfig: { ...defaultQueueRuleConfig },
        createdAt: now,
        updatedAt: now
      }
    ],
    queueEntries: [],
    quickLinks: [
      {
        id: "quick_test",
        shortCode: "test",
        type: "arcade",
        targetId: "arcade_test",
        arcadeId: "arcade_test",
        machineId: null,
        queueId: null,
        name: "test机厅 快捷入口",
        url: "/s/test",
        status: "active",
        createdById: null,
        expireAt: null,
        createdAt: now,
        updatedAt: now
      },
      {
        id: "quick_demo_1",
        shortCode: "demo1",
        type: "queue",
        targetId: "queue_demo_1",
        arcadeId: "arcade_test",
        machineId: "demo_1",
        queueId: "queue_demo_1",
        name: "demo_1 队列快捷入口",
        url: "/s/demo1",
        status: "active",
        createdById: null,
        expireAt: null,
        createdAt: now,
        updatedAt: now
      },
      {
        id: "quick_demo_2",
        shortCode: "demo2",
        type: "queue",
        targetId: "queue_demo_2",
        arcadeId: "arcade_test",
        machineId: "demo_2",
        queueId: "queue_demo_2",
        name: "demo_2 队列快捷入口",
        url: "/s/demo2",
        status: "active",
        createdById: null,
        expireAt: null,
        createdAt: now,
        updatedAt: now
      }
    ]
  };
}

export class JsonDataStore {
  private readonly filePath: string;

  constructor(options: JsonDataStoreOptions = {}) {
    this.filePath = path.resolve(
      options.filePath ?? process.env.DATA_FILE ?? "data/demo-db.json"
    );

    if (options.reset || !existsSync(this.filePath)) {
      this.write(createSeedData());
    }
  }

  read(): DemoData {
    if (!existsSync(this.filePath)) {
      const seed = createSeedData();
      this.write(seed);
      return seed;
    }

    const raw = readFileSync(this.filePath, "utf8");
    return JSON.parse(raw) as DemoData;
  }

  write(data: DemoData): void {
    mkdirSync(path.dirname(this.filePath), { recursive: true });
    const tmpPath = `${this.filePath}.tmp`;
    writeFileSync(tmpPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
    renameSync(tmpPath, this.filePath);
  }

  update<T>(mutator: (data: DemoData) => T): T {
    const data = this.read();
    const result = mutator(data);
    this.write(data);
    return result;
  }

  reset(): DemoData {
    const seed = createSeedData();
    this.write(seed);
    return seed;
  }
}
