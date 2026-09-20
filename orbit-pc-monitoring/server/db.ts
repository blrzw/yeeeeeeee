import { desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  InsertSessionAudit,
  InsertUser,
  monitoredDevices,
  MonitoredDevice,
  sessionAudits,
  SessionAudit,
  users,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = "admin";
      updateSet.role = "admin";
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

// In-memory fallback stores when DATABASE_URL is not set or during testing
const inMemoryDevices = new Map<string, MonitoredDevice>();
const inMemoryAudits = new Map<string, SessionAudit>();

export async function listMonitoredDevices(): Promise<MonitoredDevice[]> {
  const db = await getDb();
  let rows: MonitoredDevice[];
  if (db) {
    rows = await db.select().from(monitoredDevices).orderBy(desc(monitoredDevices.lastHeartbeat));
  } else {
    rows = Array.from(inMemoryDevices.values()).sort(
      (a, b) => new Date(b.lastHeartbeat).getTime() - new Date(a.lastHeartbeat).getTime()
    );
  }

  const cutoff = Date.now() - 5 * 60 * 1000;
  return rows.map((device) => {
    const isStale = new Date(device.lastHeartbeat).getTime() < cutoff;
    return {
      ...device,
      status: device.isRevoked ? "offline" : isStale ? "offline" : device.status,
    };
  });
}

export async function getMonitoredDevice(agentId: string): Promise<MonitoredDevice | null> {
  const db = await getDb();
  if (db) {
    const rows = await db.select().from(monitoredDevices).where(eq(monitoredDevices.agentId, agentId)).limit(1);
    return rows[0] ?? null;
  }
  return inMemoryDevices.get(agentId) ?? null;
}

export async function revokeDevice(agentId: string, operatorName: string): Promise<MonitoredDevice | null> {
  const now = new Date();
  const db = await getDb();
  if (db) {
    await db
      .update(monitoredDevices)
      .set({
        isRevoked: 1,
        revokedAt: now,
        revokedBy: operatorName,
        status: "offline",
        updatedAt: now,
      })
      .where(eq(monitoredDevices.agentId, agentId));
    const result = await db.select().from(monitoredDevices).where(eq(monitoredDevices.agentId, agentId)).limit(1);
    return result[0] ?? null;
  }

  const current = inMemoryDevices.get(agentId);
  if (!current) return null;
  const updated: MonitoredDevice = {
    ...current,
    isRevoked: 1,
    revokedAt: now,
    revokedBy: operatorName,
    status: "offline",
    updatedAt: now,
  };
  inMemoryDevices.set(agentId, updated);
  return updated;
}

export async function unrevokeDevice(agentId: string): Promise<MonitoredDevice | null> {
  const now = new Date();
  const db = await getDb();
  if (db) {
    await db
      .update(monitoredDevices)
      .set({
        isRevoked: 0,
        revokedAt: null,
        revokedBy: null,
        updatedAt: now,
      })
      .where(eq(monitoredDevices.agentId, agentId));
    const result = await db.select().from(monitoredDevices).where(eq(monitoredDevices.agentId, agentId)).limit(1);
    return result[0] ?? null;
  }

  const current = inMemoryDevices.get(agentId);
  if (!current) return null;
  const updated: MonitoredDevice = {
    ...current,
    isRevoked: 0,
    revokedAt: null,
    revokedBy: null,
    updatedAt: now,
  };
  inMemoryDevices.set(agentId, updated);
  return updated;
}

export type HeartbeatInput = {
  agentId: string;
  installToken: string;
  hostname: string;
  username?: string;
  platform: string;
  osVersion?: string;
  hardwareModel?: string;
  serialNumber?: string;
  ipAddress?: string;
  uptimeSeconds?: number;
  agentVersion?: string;
  browserInventory?: string;
  processList?: string;
  softwareInventory?: string;
  activeWindowTitle?: string;
  networkAdapters?: string;
  cpuPercent?: number;
  memoryPercent?: number;
  diskPercent?: number;
};

export async function upsertHeartbeat(input: HeartbeatInput): Promise<MonitoredDevice | null> {
  const db = await getDb();
  const now = new Date();

  if (db) {
    const existing = await db.select().from(monitoredDevices).where(eq(monitoredDevices.agentId, input.agentId)).limit(1);
    const existingDevice = existing[0];
    const isRevoked = existingDevice?.isRevoked ?? 0;

    const values = {
      agentId: input.agentId,
      installToken: input.installToken,
      hostname: input.hostname,
      username: input.username ?? null,
      platform: input.platform,
      osVersion: input.osVersion ?? null,
      hardwareModel: input.hardwareModel ?? null,
      serialNumber: input.serialNumber ?? null,
      ipAddress: input.ipAddress ?? null,
      uptimeSeconds: Math.max(0, Math.floor(input.uptimeSeconds ?? 0)),
      agentVersion: input.agentVersion ?? null,
      browserInventory: input.browserInventory ?? null,
      processList: input.processList ?? null,
      softwareInventory: input.softwareInventory ?? null,
      activeWindowTitle: input.activeWindowTitle ?? null,
      networkAdapters: input.networkAdapters ?? null,
      status: (isRevoked ? "offline" : "online") as "online" | "offline",
      isRevoked,
      cpuPercent: clampPercent(input.cpuPercent),
      memoryPercent: clampPercent(input.memoryPercent),
      diskPercent: clampPercent(input.diskPercent),
      lastHeartbeat: now,
      updatedAt: now,
    };

    if (!existingDevice) {
      await db.insert(monitoredDevices).values(values);
    } else {
      await db.update(monitoredDevices).set(values).where(eq(monitoredDevices.agentId, input.agentId));
    }

    const result = await db.select().from(monitoredDevices).where(eq(monitoredDevices.agentId, input.agentId)).limit(1);
    return result[0] ?? null;
  }

  // In-memory fallback
  const existing = inMemoryDevices.get(input.agentId);
  const isRevoked = existing?.isRevoked ?? 0;
  const device: MonitoredDevice = {
    id: existing?.id ?? inMemoryDevices.size + 1,
    agentId: input.agentId,
    installToken: input.installToken,
    hostname: input.hostname,
    username: input.username ?? null,
    platform: input.platform,
    osVersion: input.osVersion ?? null,
    hardwareModel: input.hardwareModel ?? null,
    serialNumber: input.serialNumber ?? null,
    ipAddress: input.ipAddress ?? null,
    uptimeSeconds: Math.max(0, Math.floor(input.uptimeSeconds ?? 0)),
    agentVersion: input.agentVersion ?? null,
    browserInventory: input.browserInventory ?? null,
    processList: input.processList ?? null,
    softwareInventory: input.softwareInventory ?? null,
    activeWindowTitle: input.activeWindowTitle ?? null,
    networkAdapters: input.networkAdapters ?? null,
    status: isRevoked ? "offline" : "online",
    isRevoked,
    revokedAt: existing?.revokedAt ?? null,
    revokedBy: existing?.revokedBy ?? null,
    cpuPercent: clampPercent(input.cpuPercent),
    memoryPercent: clampPercent(input.memoryPercent),
    diskPercent: clampPercent(input.diskPercent),
    lastHeartbeat: now,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  inMemoryDevices.set(input.agentId, device);
  return device;
}

export async function recordSessionAudit(audit: InsertSessionAudit): Promise<SessionAudit | null> {
  const db = await getDb();
  if (db) {
    await db.insert(sessionAudits).values(audit);
    const rows = await db.select().from(sessionAudits).where(eq(sessionAudits.sessionId, audit.sessionId)).limit(1);
    return rows[0] ?? null;
  }

  const record: SessionAudit = {
    id: inMemoryAudits.size + 1,
    sessionId: audit.sessionId,
    agentId: audit.agentId,
    hostname: audit.hostname,
    operatorId: audit.operatorId,
    operatorName: audit.operatorName,
    state: audit.state ?? "requested",
    requestedAt: audit.requestedAt ?? new Date(),
    approvedAt: audit.approvedAt ?? null,
    endedAt: audit.endedAt ?? null,
    durationSeconds: audit.durationSeconds ?? 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  inMemoryAudits.set(audit.sessionId, record);
  return record;
}

export async function updateSessionAudit(
  sessionId: string,
  update: {
    state?: "requested" | "approved" | "denied" | "ended";
    approvedAt?: Date;
    endedAt?: Date;
    durationSeconds?: number;
  }
): Promise<SessionAudit | null> {
  const db = await getDb();
  const now = new Date();
  if (db) {
    await db
      .update(sessionAudits)
      .set({ ...update, updatedAt: now })
      .where(eq(sessionAudits.sessionId, sessionId));
    const rows = await db.select().from(sessionAudits).where(eq(sessionAudits.sessionId, sessionId)).limit(1);
    return rows[0] ?? null;
  }

  const current = inMemoryAudits.get(sessionId);
  if (!current) return null;
  const updated: SessionAudit = {
    ...current,
    ...update,
    approvedAt: update.approvedAt !== undefined ? update.approvedAt : current.approvedAt,
    endedAt: update.endedAt !== undefined ? update.endedAt : current.endedAt,
    durationSeconds: update.durationSeconds !== undefined ? update.durationSeconds : current.durationSeconds,
    state: update.state ?? current.state,
    updatedAt: now,
  };
  inMemoryAudits.set(sessionId, updated);
  return updated;
}

export async function listSessionAudits(agentId?: string): Promise<SessionAudit[]> {
  const db = await getDb();
  if (db) {
    if (agentId) {
      return db
        .select()
        .from(sessionAudits)
        .where(eq(sessionAudits.agentId, agentId))
        .orderBy(desc(sessionAudits.requestedAt));
    }
    return db.select().from(sessionAudits).orderBy(desc(sessionAudits.requestedAt));
  }

  const all = Array.from(inMemoryAudits.values());
  const filtered = agentId ? all.filter((a) => a.agentId === agentId) : all;
  return filtered.sort((a, b) => new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime());
}

function clampPercent(value: number | undefined) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value as number)));
}
