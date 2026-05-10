export type UserRole = "user" | "arcade_admin" | "super_admin";
export type ArcadeStatus = "active" | "hidden" | "disabled";
export type MachineStatus = "normal" | "maintenance" | "disabled";
export type QueueMode = "single" | "group";
export type QueueStatus = "open" | "paused" | "closed";
export type QueueEntryStatus =
  | "waiting"
  | "called"
  | "playing"
  | "finished"
  | "skipped"
  | "cancelled";
export type CheckInStatus = "unknown" | "arrived" | "away";
export type QuickLinkType = "arcade" | "machine" | "queue";
export type QuickLinkStatus = "active" | "disabled" | "expired";

export const ACTIVE_ENTRY_STATUSES: QueueEntryStatus[] = [
  "waiting",
  "called",
  "playing"
];

export const TERMINAL_ENTRY_STATUSES: QueueEntryStatus[] = [
  "finished",
  "skipped",
  "cancelled"
];

export interface User {
  id: string;
  email: string;
  username: string;
  nickname: string;
  role: UserRole;
  passwordSalt: string;
  passwordHash: string;
  createdAt: string;
  updatedAt: string;
}

export interface PublicUser {
  id: string;
  email: string;
  username: string;
  nickname: string;
  role: UserRole;
  createdAt: string;
  updatedAt: string;
}

export interface Arcade {
  id: string;
  name: string;
  city: string;
  address: string;
  description?: string;
  status: ArcadeStatus;
  ownerUserId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Machine {
  id: string;
  arcadeId: string;
  name: string;
  game: "maimai_dx";
  status: MachineStatus;
  createdAt: string;
  updatedAt: string;
}

export interface QueueRuleConfig {
  callTimeoutSeconds: number;
  allowUserCancel: boolean;
  allowUserFinish: boolean;
  allowUserConfirmPlaying: boolean;
  allowRejoinAfterFinished: boolean;
  allowRejoinAfterSkipped: boolean;
  allowRejoinAfterCancelled: boolean;
  autoSkipWhenTimeout: boolean;
  maxActiveEntryPerUser: number;
  maxGroupSize: number;
}

export interface Queue {
  id: string;
  arcadeId: string;
  machineId?: string | null;
  name: string;
  mode: QueueMode;
  status: QueueStatus;
  maxGroupSize: number;
  ruleConfig: QueueRuleConfig;
  createdAt: string;
  updatedAt: string;
}

export interface QueueEntry {
  id: string;
  queueId: string;
  userId: string;
  displayName: string;
  position: number;
  status: QueueEntryStatus;
  peopleCount: number;
  note?: string;
  checkInStatus: CheckInStatus;
  calledAt?: string;
  confirmDeadline?: string;
  confirmedAt?: string;
  startedAt?: string;
  finishedAt?: string;
  skippedAt?: string;
  cancelledAt?: string;
  rejoinFromEntryId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface QuickLink {
  id: string;
  shortCode: string;
  type: QuickLinkType;
  targetId: string;
  arcadeId?: string | null;
  machineId?: string | null;
  queueId?: string | null;
  name?: string;
  url: string;
  status: QuickLinkStatus;
  createdById?: string | null;
  expireAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DemoData {
  users: User[];
  arcades: Arcade[];
  machines: Machine[];
  queues: Queue[];
  queueEntries: QueueEntry[];
  quickLinks: QuickLink[];
}
