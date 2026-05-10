import { randomBytes, randomUUID } from "node:crypto";
import {
  badRequest,
  conflict,
  forbidden,
  notFound
} from "../domain/errors";
import type {
  Arcade,
  CheckInStatus,
  Machine,
  PublicUser,
  Queue,
  QueueEntry,
  QueueEntryStatus,
  QuickLink,
  QuickLinkType
} from "../domain/types";
import {
  ACTIVE_ENTRY_STATUSES,
  TERMINAL_ENTRY_STATUSES
} from "../domain/types";
import type { JsonDataStore } from "../store/jsonDataStore";

export interface QueueEntryInput {
  displayName?: string;
  peopleCount?: number;
  note?: string;
}

export interface UpdateEntryInput {
  displayName?: string;
  peopleCount?: number;
  note?: string;
}

export interface CheckInInput {
  checkInStatus?: CheckInStatus;
}

export interface QuickLinkInput {
  type?: QuickLinkType;
  targetId?: string;
  name?: string;
  expireAt?: string | null;
}

interface QueueSummary {
  id: string;
  arcadeId: string;
  machineId?: string | null;
  name: string;
  status: string;
  waitingCount: number;
}

export class QueueService {
  constructor(private readonly store: JsonDataStore) {}

  listArcades(query: { city?: string; keyword?: string } = {}) {
    const data = this.store.read();
    const city = query.city?.trim().toLowerCase();
    const keyword = query.keyword?.trim().toLowerCase();

    const items = data.arcades
      .filter((arcade) => arcade.status === "active")
      .filter((arcade) => !city || arcade.city.toLowerCase() === city)
      .filter(
        (arcade) =>
          !keyword ||
          arcade.name.toLowerCase().includes(keyword) ||
          arcade.address.toLowerCase().includes(keyword)
      )
      .map((arcade) => ({
        id: arcade.id,
        name: arcade.name,
        city: arcade.city,
        address: arcade.address,
        description: arcade.description,
        status: arcade.status,
        queueCount: data.queues.filter((queue) => queue.arcadeId === arcade.id)
          .length,
        machineCount: data.machines.filter(
          (machine) => machine.arcadeId === arcade.id
        ).length,
        waitingCount: countWaitingForArcade(arcade.id, data)
      }));

    return { items };
  }

  getArcade(arcadeId: string) {
    const data = this.store.read();
    const arcade = findArcade(data.arcades, arcadeId);
    const machines = data.machines
      .filter((machine) => machine.arcadeId === arcade.id)
      .map((machine) => ({
        id: machine.id,
        arcadeId: machine.arcadeId,
        name: machine.name,
        game: machine.game,
        status: machine.status,
        queues: data.queues
          .filter((queue) => queue.machineId === machine.id)
          .map((queue) => queueSummary(queue, data.queueEntries))
      }));

    const queues = data.queues
      .filter((queue) => queue.arcadeId === arcade.id)
      .map((queue) => queueSummary(queue, data.queueEntries));

    return {
      ...publicArcade(arcade),
      machines,
      queues,
      quickLinks: data.quickLinks
        .filter((link) => link.arcadeId === arcade.id && link.status === "active")
        .map(publicQuickLink)
    };
  }

  getQueue(queueId: string) {
    const data = this.store.read();
    const queue = findQueue(data.queues, queueId);
    return queueDetails(queue, data);
  }

  getMyState(queueId: string, user?: PublicUser) {
    const data = this.store.read();
    const queue = findQueue(data.queues, queueId);
    const summary = queueSummary(queue, data.queueEntries);

    if (!user) {
      return {
        state: "guest",
        entry: null,
        queue: summary,
        actions: ["login", "view_info"]
      };
    }

    const userEntries = data.queueEntries
      .filter((entry) => entry.queueId === queue.id && entry.userId === user.id)
      .sort(compareNewestFirst);
    const activeEntry = userEntries.find((entry) =>
      ACTIVE_ENTRY_STATUSES.includes(entry.status)
    );
    const entry = activeEntry ?? userEntries[0] ?? null;

    if (!entry) {
      return {
        state: "not_in_queue",
        entry: null,
        queue: summary,
        actions: ["join", "view_info"]
      };
    }

    return {
      state: entry.status,
      entry: publicEntry(entry),
      queue: summary,
      actions: actionsForEntry(entry.status)
    };
  }

  joinQueue(user: PublicUser, queueId: string, input: QueueEntryInput) {
    return this.store.update((data) => {
      const queue = findQueue(data.queues, queueId);
      if (queue.status !== "open") {
        throw conflict("Queue is not open", "queue_not_open");
      }

      const activeCount = data.queueEntries.filter(
        (entry) =>
          entry.queueId === queue.id &&
          entry.userId === user.id &&
          ACTIVE_ENTRY_STATUSES.includes(entry.status)
      ).length;

      if (activeCount >= queue.ruleConfig.maxActiveEntryPerUser) {
        throw conflict(
          "User already has an active entry in this queue",
          "active_entry_exists"
        );
      }

      const peopleCount = normalizePeopleCount(
        input.peopleCount,
        queue.ruleConfig.maxGroupSize
      );
      const now = new Date().toISOString();
      const displayName = normalizeDisplayName(input.displayName, user.nickname);
      const note = normalizeNote(input.note);
      const maxPosition = data.queueEntries
        .filter(
          (entry) =>
            entry.queueId === queue.id &&
            ACTIVE_ENTRY_STATUSES.includes(entry.status)
        )
        .reduce((max, entry) => Math.max(max, entry.position), 0);

      const entry: QueueEntry = {
        id: `entry_${randomUUID()}`,
        queueId: queue.id,
        userId: user.id,
        displayName,
        position: maxPosition + 1,
        status: "waiting",
        peopleCount,
        note,
        checkInStatus: "unknown",
        createdAt: now,
        updatedAt: now
      };

      data.queueEntries.push(entry);
      return {
        entryId: entry.id,
        queueId: entry.queueId,
        state: entry.status,
        position: entry.position,
        estimatedWaitMinutes: Math.max(0, entry.position - 1) * 3,
        entry: publicEntry(entry)
      };
    });
  }

  cancelEntry(user: PublicUser, entryId: string) {
    return this.store.update((data) => {
      const entry = findEntry(data.queueEntries, entryId);
      assertOwnerOrAdmin(user, entry);

      if (!["waiting", "called"].includes(entry.status)) {
        throw conflict("Only waiting or called entries can be cancelled");
      }

      const now = new Date().toISOString();
      entry.status = "cancelled";
      entry.cancelledAt = now;
      entry.updatedAt = now;

      return { entryId: entry.id, state: entry.status, entry: publicEntry(entry) };
    });
  }

  updateEntry(user: PublicUser, entryId: string, input: UpdateEntryInput) {
    return this.store.update((data) => {
      const entry = findEntry(data.queueEntries, entryId);
      assertOwnerOrAdmin(user, entry);
      const queue = findQueue(data.queues, entry.queueId);

      if (input.displayName !== undefined) {
        entry.displayName = normalizeDisplayName(input.displayName, entry.displayName);
      }

      if (input.peopleCount !== undefined) {
        if (entry.status !== "waiting") {
          throw conflict("People count can only be changed while waiting");
        }
        entry.peopleCount = normalizePeopleCount(
          input.peopleCount,
          queue.ruleConfig.maxGroupSize
        );
      }

      if (input.note !== undefined) {
        entry.note = normalizeNote(input.note);
      }

      entry.updatedAt = new Date().toISOString();
      return { entry: publicEntry(entry) };
    });
  }

  checkIn(user: PublicUser, entryId: string, input: CheckInInput) {
    return this.store.update((data) => {
      const entry = findEntry(data.queueEntries, entryId);
      assertOwnerOrAdmin(user, entry);

      if (!ACTIVE_ENTRY_STATUSES.includes(entry.status)) {
        throw conflict("Only active entries can update check-in status");
      }

      const nextStatus = input.checkInStatus;
      if (!nextStatus || !["unknown", "arrived", "away"].includes(nextStatus)) {
        throw badRequest("checkInStatus must be unknown, arrived, or away");
      }

      entry.checkInStatus = nextStatus;
      entry.updatedAt = new Date().toISOString();
      return { entry: publicEntry(entry) };
    });
  }

  callNext(user: PublicUser, queueId: string, timeoutSeconds?: number) {
    assertAdmin(user);
    return this.store.update((data) => {
      const queue = findQueue(data.queues, queueId);
      const next = data.queueEntries
        .filter(
          (entry) => entry.queueId === queue.id && entry.status === "waiting"
        )
        .sort(comparePosition)[0];

      if (!next) {
        throw conflict("No waiting entries to call", "empty_queue");
      }

      const now = new Date();
      const timeout = normalizeTimeoutSeconds(
        timeoutSeconds,
        queue.ruleConfig.callTimeoutSeconds
      );
      next.status = "called";
      next.calledAt = now.toISOString();
      next.confirmDeadline = new Date(now.getTime() + timeout * 1000).toISOString();
      next.updatedAt = now.toISOString();

      return {
        entryId: next.id,
        displayName: next.displayName,
        state: next.status,
        calledAt: next.calledAt,
        confirmDeadline: next.confirmDeadline,
        entry: publicEntry(next)
      };
    });
  }

  startEntry(user: PublicUser, entryId: string) {
    return this.store.update((data) => {
      const entry = findEntry(data.queueEntries, entryId);
      assertOwnerOrAdmin(user, entry);

      if (entry.status !== "called") {
        throw conflict("Only called entries can start playing");
      }

      const now = new Date().toISOString();
      entry.status = "playing";
      entry.confirmedAt = now;
      entry.startedAt = now;
      entry.updatedAt = now;

      return {
        entryId: entry.id,
        state: entry.status,
        startedAt: entry.startedAt,
        entry: publicEntry(entry)
      };
    });
  }

  finishEntry(user: PublicUser, entryId: string) {
    return this.store.update((data) => {
      const entry = findEntry(data.queueEntries, entryId);
      assertOwnerOrAdmin(user, entry);

      if (entry.status !== "playing") {
        throw conflict("Only playing entries can be finished");
      }

      const now = new Date().toISOString();
      entry.status = "finished";
      entry.finishedAt = now;
      entry.updatedAt = now;

      return {
        entryId: entry.id,
        state: entry.status,
        finishedAt: entry.finishedAt,
        askRejoin: true,
        entry: publicEntry(entry)
      };
    });
  }

  skipEntry(user: PublicUser, entryId: string, allowOwnerGiveUp = false) {
    return this.store.update((data) => {
      const entry = findEntry(data.queueEntries, entryId);

      if (allowOwnerGiveUp) {
        assertOwnerOrAdmin(user, entry);
      } else {
        assertAdmin(user);
      }

      if (entry.status !== "called") {
        throw conflict("Only called entries can be skipped");
      }

      const now = new Date().toISOString();
      entry.status = "skipped";
      entry.skippedAt = now;
      entry.updatedAt = now;

      return { entryId: entry.id, state: entry.status, entry: publicEntry(entry) };
    });
  }

  restoreEntry(user: PublicUser, entryId: string) {
    assertAdmin(user);
    return this.store.update((data) => {
      const entry = findEntry(data.queueEntries, entryId);

      if (entry.status !== "skipped") {
        throw conflict("Only skipped entries can be restored");
      }

      const maxPosition = data.queueEntries
        .filter(
          (item) =>
            item.queueId === entry.queueId &&
            ACTIVE_ENTRY_STATUSES.includes(item.status)
        )
        .reduce((max, item) => Math.max(max, item.position), 0);
      const now = new Date().toISOString();
      entry.status = "waiting";
      entry.position = maxPosition + 1;
      entry.updatedAt = now;

      return { entryId: entry.id, state: entry.status, entry: publicEntry(entry) };
    });
  }

  rejoinEntry(user: PublicUser, entryId: string, input: QueueEntryInput) {
    return this.store.update((data) => {
      const oldEntry = findEntry(data.queueEntries, entryId);
      assertOwnerOrAdmin(user, oldEntry);

      if (!TERMINAL_ENTRY_STATUSES.includes(oldEntry.status)) {
        throw conflict("Only finished, skipped, or cancelled entries can rejoin");
      }

      const queue = findQueue(data.queues, oldEntry.queueId);
      if (queue.status !== "open") {
        throw conflict("Queue is not open", "queue_not_open");
      }

      const peopleCount = normalizePeopleCount(
        input.peopleCount ?? oldEntry.peopleCount,
        queue.ruleConfig.maxGroupSize
      );
      const now = new Date().toISOString();
      const maxPosition = data.queueEntries
        .filter(
          (entry) =>
            entry.queueId === queue.id &&
            ACTIVE_ENTRY_STATUSES.includes(entry.status)
        )
        .reduce((max, entry) => Math.max(max, entry.position), 0);
      const entry: QueueEntry = {
        id: `entry_${randomUUID()}`,
        queueId: queue.id,
        userId: oldEntry.userId,
        displayName: normalizeDisplayName(input.displayName, oldEntry.displayName),
        position: maxPosition + 1,
        status: "waiting",
        peopleCount,
        note: normalizeNote(input.note ?? oldEntry.note),
        checkInStatus: "unknown",
        rejoinFromEntryId: oldEntry.id,
        createdAt: now,
        updatedAt: now
      };

      data.queueEntries.push(entry);
      return {
        oldEntryId: oldEntry.id,
        newEntryId: entry.id,
        state: entry.status,
        position: entry.position,
        entry: publicEntry(entry)
      };
    });
  }

  resolveQuickEntry(shortCode: string) {
    const data = this.store.read();
    const link = data.quickLinks.find(
      (item) => item.shortCode === shortCode && item.status === "active"
    );

    if (!link) {
      throw notFound("Quick entry not found");
    }

    return publicQuickLink(link);
  }

  createQuickLink(user: PublicUser, input: QuickLinkInput) {
    assertAdmin(user);

    return this.store.update((data) => {
      const type = input.type;
      const targetId = input.targetId?.trim();

      if (!type || !["arcade", "machine", "queue"].includes(type)) {
        throw badRequest("type must be arcade, machine, or queue");
      }

      if (!targetId) {
        throw badRequest("targetId is required");
      }

      const resolved = resolveTarget(type, targetId, data);
      const now = new Date().toISOString();
      const shortCode = generateShortCode(data.quickLinks);
      const link: QuickLink = {
        id: `quick_${randomUUID()}`,
        shortCode,
        type,
        targetId,
        arcadeId: resolved.arcadeId,
        machineId: resolved.machineId,
        queueId: resolved.queueId,
        name: input.name?.trim() || `${type}:${targetId}`,
        url: `/s/${shortCode}`,
        status: "active",
        createdById: user.id,
        expireAt: input.expireAt ?? null,
        createdAt: now,
        updatedAt: now
      };

      data.quickLinks.push(link);
      return publicQuickLink(link);
    });
  }

  qrcodePlaceholder(user: PublicUser, quickLinkId: string) {
    assertAdmin(user);
    const data = this.store.read();
    const link = data.quickLinks.find((item) => item.id === quickLinkId);
    if (!link) {
      throw notFound("Quick link not found");
    }

    return {
      url: link.url,
      qrcodeImageUrl: `/api/v1/admin/quick-links/${link.id}/qrcode-placeholder.svg`,
      note: "Demo placeholder only; final QR image generation is not implemented."
    };
  }
}

function publicArcade(arcade: Arcade) {
  return {
    id: arcade.id,
    name: arcade.name,
    city: arcade.city,
    address: arcade.address,
    description: arcade.description,
    status: arcade.status
  };
}

function publicMachine(machine: Machine) {
  return {
    id: machine.id,
    arcadeId: machine.arcadeId,
    name: machine.name,
    game: machine.game,
    status: machine.status
  };
}

function publicEntry(entry: QueueEntry) {
  const remainingSeconds = entry.confirmDeadline
    ? Math.max(
        0,
        Math.ceil((new Date(entry.confirmDeadline).getTime() - Date.now()) / 1000)
      )
    : undefined;

  return {
    id: entry.id,
    queueId: entry.queueId,
    userId: entry.userId,
    displayName: entry.displayName,
    position: entry.position,
    status: entry.status,
    peopleCount: entry.peopleCount,
    note: entry.note,
    checkInStatus: entry.checkInStatus,
    calledAt: entry.calledAt,
    confirmDeadline: entry.confirmDeadline,
    remainingSeconds,
    confirmedAt: entry.confirmedAt,
    startedAt: entry.startedAt,
    finishedAt: entry.finishedAt,
    skippedAt: entry.skippedAt,
    cancelledAt: entry.cancelledAt,
    rejoinFromEntryId: entry.rejoinFromEntryId,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt
  };
}

function publicQuickLink(link: QuickLink) {
  return {
    id: link.id,
    shortCode: link.shortCode,
    type: link.type,
    targetId: link.targetId,
    arcadeId: link.arcadeId,
    machineId: link.machineId,
    queueId: link.queueId,
    name: link.name,
    url: link.url,
    status: link.status,
    expireAt: link.expireAt
  };
}

function queueSummary(queue: Queue, entries: QueueEntry[]): QueueSummary {
  return {
    id: queue.id,
    arcadeId: queue.arcadeId,
    machineId: queue.machineId,
    name: queue.name,
    status: queue.status,
    waitingCount: entries.filter(
      (entry) => entry.queueId === queue.id && entry.status === "waiting"
    ).length
  };
}

function queueDetails(queue: Queue, data: ReturnType<JsonDataStore["read"]>) {
  const arcade = findArcade(data.arcades, queue.arcadeId);
  const machine = queue.machineId
    ? data.machines.find((item) => item.id === queue.machineId)
    : undefined;
  const entries = data.queueEntries
    .filter((entry) => entry.queueId === queue.id)
    .filter((entry) => entry.status !== "cancelled")
    .sort(comparePosition)
    .map(publicEntry);

  return {
    id: queue.id,
    arcadeId: queue.arcadeId,
    machineId: queue.machineId,
    name: queue.name,
    mode: queue.mode,
    status: queue.status,
    maxGroupSize: queue.maxGroupSize,
    ruleConfig: queue.ruleConfig,
    waitingCount: entries.filter((entry) => entry.status === "waiting").length,
    arcade: publicArcade(arcade),
    machine: machine ? publicMachine(machine) : null,
    entries
  };
}

function actionsForEntry(status: QueueEntryStatus): string[] {
  switch (status) {
    case "waiting":
      return ["cancel", "view_info", "edit_note", "check_in"];
    case "called":
      return ["confirm_playing", "give_up", "view_info"];
    case "playing":
      return ["finish", "view_info"];
    case "finished":
      return ["rejoin", "view_info"];
    case "skipped":
      return ["rejoin", "view_info"];
    case "cancelled":
      return ["rejoin", "view_info"];
    default:
      return ["view_info"];
  }
}

function findArcade(arcades: Arcade[], arcadeId: string): Arcade {
  const arcade = arcades.find((item) => item.id === arcadeId);
  if (!arcade) {
    throw notFound("Arcade not found");
  }
  return arcade;
}

function findQueue(queues: Queue[], queueId: string): Queue {
  const queue = queues.find((item) => item.id === queueId);
  if (!queue) {
    throw notFound("Queue not found");
  }
  return queue;
}

function findEntry(entries: QueueEntry[], entryId: string): QueueEntry {
  const entry = entries.find((item) => item.id === entryId);
  if (!entry) {
    throw notFound("Queue entry not found");
  }
  return entry;
}

function countWaitingForArcade(
  arcadeId: string,
  data: ReturnType<JsonDataStore["read"]>
): number {
  const queueIds = new Set(
    data.queues.filter((queue) => queue.arcadeId === arcadeId).map((queue) => queue.id)
  );
  return data.queueEntries.filter(
    (entry) => queueIds.has(entry.queueId) && entry.status === "waiting"
  ).length;
}

function normalizePeopleCount(value: unknown, maxGroupSize: number): number {
  const peopleCount = Number(value ?? 1);
  if (!Number.isInteger(peopleCount) || peopleCount < 1 || peopleCount > maxGroupSize) {
    throw badRequest(`peopleCount must be an integer from 1 to ${maxGroupSize}`);
  }
  return peopleCount;
}

function normalizeDisplayName(value: unknown, fallback: string): string {
  const displayName = String(value ?? fallback).trim();
  if (!displayName || displayName.length > 32) {
    throw badRequest("displayName must be 1-32 characters");
  }
  return displayName;
}

function normalizeNote(value: unknown): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  const note = String(value).trim();
  if (note.length > 120) {
    throw badRequest("note must be 120 characters or less");
  }
  return note || undefined;
}

function normalizeTimeoutSeconds(
  value: unknown,
  fallbackTimeoutSeconds: number
): number {
  const timeout = Number(value ?? fallbackTimeoutSeconds);
  if (!Number.isInteger(timeout) || timeout < 10 || timeout > 3600) {
    throw badRequest("timeoutSeconds must be an integer from 10 to 3600");
  }
  return timeout;
}

function comparePosition(left: QueueEntry, right: QueueEntry): number {
  return left.position - right.position || left.createdAt.localeCompare(right.createdAt);
}

function compareNewestFirst(left: QueueEntry, right: QueueEntry): number {
  return right.updatedAt.localeCompare(left.updatedAt);
}

function assertAdmin(user: PublicUser): void {
  if (!["super_admin", "arcade_admin"].includes(user.role)) {
    throw forbidden("Admin permission required");
  }
}

function assertOwnerOrAdmin(user: PublicUser, entry: QueueEntry): void {
  if (user.id !== entry.userId && !["super_admin", "arcade_admin"].includes(user.role)) {
    throw forbidden("Only entry owner or admin can perform this action");
  }
}

function resolveTarget(
  type: QuickLinkType,
  targetId: string,
  data: ReturnType<JsonDataStore["read"]>
) {
  if (type === "arcade") {
    const arcade = findArcade(data.arcades, targetId);
    return { arcadeId: arcade.id, machineId: null, queueId: null };
  }

  if (type === "machine") {
    const machine = data.machines.find((item) => item.id === targetId);
    if (!machine) {
      throw notFound("Machine not found");
    }
    const queue = data.queues.find((item) => item.machineId === machine.id);
    return {
      arcadeId: machine.arcadeId,
      machineId: machine.id,
      queueId: queue?.id ?? null
    };
  }

  const queue = findQueue(data.queues, targetId);
  return {
    arcadeId: queue.arcadeId,
    machineId: queue.machineId ?? null,
    queueId: queue.id
  };
}

function generateShortCode(existingLinks: QuickLink[]): string {
  const existing = new Set(existingLinks.map((link) => link.shortCode));

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const code = randomBytes(4).toString("base64url");
    if (!existing.has(code)) {
      return code;
    }
  }

  return `q${Date.now().toString(36)}`;
}
