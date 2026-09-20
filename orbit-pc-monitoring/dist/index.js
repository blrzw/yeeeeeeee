// server/_core/index.ts
import "dotenv/config";
import express2 from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";

// server/agentRoutes.ts
import { z } from "zod";

// server/_core/env.ts
var ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
  agentEnrollmentToken: process.env.ORBIT_AGENT_ENROLLMENT_TOKEN ?? "orbit-demo-enrollment-2026"
};

// server/_core/sdk.ts
import axios from "axios";
import { parse as parseCookieHeader } from "cookie";
import { jwtVerify, SignJWT } from "jose";

// shared/const.ts
var COOKIE_NAME = "app_session_id";
var ONE_YEAR_MS = 1e3 * 60 * 60 * 24 * 365;
var AXIOS_TIMEOUT_MS = 3e4;
var UNAUTHED_ERR_MSG = "Please login (10001)";
var NOT_ADMIN_ERR_MSG = "You do not have required permission (10002)";
var OAUTH_STATE_COOKIE = "__Host-oauth_state";
var decodeOAuthState = (state) => {
  let decoded;
  try {
    decoded = atob(state);
  } catch {
    return { redirectUri: "" };
  }
  try {
    const parsed = JSON.parse(decoded);
    if (parsed && typeof parsed.redirectUri === "string") return parsed;
  } catch {
  }
  return { redirectUri: decoded };
};

// shared/_core/errors.ts
var HttpError = class extends Error {
  statusCode;
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
    this.name = "HttpError";
  }
};
var ForbiddenError = (msg) => new HttpError(403, msg);

// server/db.ts
import { desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";

// drizzle/schema.ts
import { int, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";
var users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull()
});
var monitoredDevices = mysqlTable("monitored_devices", {
  id: int("id").autoincrement().primaryKey(),
  agentId: varchar("agentId", { length: 64 }).notNull().unique(),
  installToken: varchar("installToken", { length: 128 }).notNull(),
  hostname: varchar("hostname", { length: 255 }).notNull(),
  username: varchar("username", { length: 255 }),
  platform: varchar("platform", { length: 64 }).notNull(),
  osVersion: varchar("osVersion", { length: 255 }),
  hardwareModel: varchar("hardwareModel", { length: 255 }),
  serialNumber: varchar("serialNumber", { length: 255 }),
  ipAddress: varchar("ipAddress", { length: 64 }),
  uptimeSeconds: int("uptimeSeconds").default(0).notNull(),
  agentVersion: varchar("agentVersion", { length: 64 }),
  browserInventory: text("browserInventory"),
  status: mysqlEnum("status", ["online", "offline"]).default("online").notNull(),
  isRevoked: int("isRevoked").default(0).notNull(),
  // 0 = active, 1 = revoked
  revokedAt: timestamp("revokedAt"),
  revokedBy: varchar("revokedBy", { length: 255 }),
  cpuPercent: int("cpuPercent").default(0).notNull(),
  memoryPercent: int("memoryPercent").default(0).notNull(),
  diskPercent: int("diskPercent").default(0).notNull(),
  lastHeartbeat: timestamp("lastHeartbeat").defaultNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
});
var enrollmentTokens = mysqlTable("enrollment_tokens", {
  id: int("id").autoincrement().primaryKey(),
  token: varchar("token", { length: 128 }).notNull().unique(),
  agentId: varchar("agentId", { length: 64 }).notNull().unique(),
  label: varchar("label", { length: 255 }),
  createdBy: varchar("createdBy", { length: 255 }).notNull(),
  usedAt: timestamp("usedAt"),
  revokedAt: timestamp("revokedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull()
});
var sessionAudits = mysqlTable("session_audits", {
  id: int("id").autoincrement().primaryKey(),
  sessionId: varchar("sessionId", { length: 64 }).notNull().unique(),
  agentId: varchar("agentId", { length: 64 }).notNull(),
  hostname: varchar("hostname", { length: 255 }).notNull(),
  operatorId: varchar("operatorId", { length: 64 }).notNull(),
  operatorName: varchar("operatorName", { length: 255 }).notNull(),
  state: mysqlEnum("state", ["requested", "approved", "denied", "ended"]).notNull().default("requested"),
  requestedAt: timestamp("requestedAt").defaultNow().notNull(),
  approvedAt: timestamp("approvedAt"),
  endedAt: timestamp("endedAt"),
  durationSeconds: int("durationSeconds").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
});

// server/db.ts
var _db = null;
async function getDb() {
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
async function upsertUser(user) {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }
  try {
    const values = {
      openId: user.openId
    };
    const updateSet = {};
    const textFields = ["name", "email", "loginMethod"];
    const assignNullable = (field) => {
      const value = user[field];
      if (value === void 0) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };
    textFields.forEach(assignNullable);
    if (user.lastSignedIn !== void 0) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== void 0) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = "admin";
      updateSet.role = "admin";
    }
    if (!values.lastSignedIn) {
      values.lastSignedIn = /* @__PURE__ */ new Date();
    }
    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = /* @__PURE__ */ new Date();
    }
    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}
async function getUserByOpenId(openId) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return void 0;
  }
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : void 0;
}
var inMemoryDevices = /* @__PURE__ */ new Map();
var inMemoryAudits = /* @__PURE__ */ new Map();
async function listMonitoredDevices() {
  const db = await getDb();
  let rows;
  if (db) {
    rows = await db.select().from(monitoredDevices).orderBy(desc(monitoredDevices.lastHeartbeat));
  } else {
    rows = Array.from(inMemoryDevices.values()).sort(
      (a, b) => new Date(b.lastHeartbeat).getTime() - new Date(a.lastHeartbeat).getTime()
    );
  }
  const cutoff = Date.now() - 5 * 60 * 1e3;
  return rows.map((device) => {
    const isStale = new Date(device.lastHeartbeat).getTime() < cutoff;
    return {
      ...device,
      status: device.isRevoked ? "offline" : isStale ? "offline" : device.status
    };
  });
}
async function getMonitoredDevice(agentId) {
  const db = await getDb();
  if (db) {
    const rows = await db.select().from(monitoredDevices).where(eq(monitoredDevices.agentId, agentId)).limit(1);
    return rows[0] ?? null;
  }
  return inMemoryDevices.get(agentId) ?? null;
}
async function revokeDevice(agentId, operatorName) {
  const now = /* @__PURE__ */ new Date();
  const db = await getDb();
  if (db) {
    await db.update(monitoredDevices).set({
      isRevoked: 1,
      revokedAt: now,
      revokedBy: operatorName,
      status: "offline",
      updatedAt: now
    }).where(eq(monitoredDevices.agentId, agentId));
    const result = await db.select().from(monitoredDevices).where(eq(monitoredDevices.agentId, agentId)).limit(1);
    return result[0] ?? null;
  }
  const current = inMemoryDevices.get(agentId);
  if (!current) return null;
  const updated = {
    ...current,
    isRevoked: 1,
    revokedAt: now,
    revokedBy: operatorName,
    status: "offline",
    updatedAt: now
  };
  inMemoryDevices.set(agentId, updated);
  return updated;
}
async function unrevokeDevice(agentId) {
  const now = /* @__PURE__ */ new Date();
  const db = await getDb();
  if (db) {
    await db.update(monitoredDevices).set({
      isRevoked: 0,
      revokedAt: null,
      revokedBy: null,
      updatedAt: now
    }).where(eq(monitoredDevices.agentId, agentId));
    const result = await db.select().from(monitoredDevices).where(eq(monitoredDevices.agentId, agentId)).limit(1);
    return result[0] ?? null;
  }
  const current = inMemoryDevices.get(agentId);
  if (!current) return null;
  const updated = {
    ...current,
    isRevoked: 0,
    revokedAt: null,
    revokedBy: null,
    updatedAt: now
  };
  inMemoryDevices.set(agentId, updated);
  return updated;
}
async function upsertHeartbeat(input) {
  const db = await getDb();
  const now = /* @__PURE__ */ new Date();
  if (db) {
    const existing2 = await db.select().from(monitoredDevices).where(eq(monitoredDevices.agentId, input.agentId)).limit(1);
    const existingDevice = existing2[0];
    const isRevoked2 = existingDevice?.isRevoked ?? 0;
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
      status: isRevoked2 ? "offline" : "online",
      isRevoked: isRevoked2,
      cpuPercent: clampPercent(input.cpuPercent),
      memoryPercent: clampPercent(input.memoryPercent),
      diskPercent: clampPercent(input.diskPercent),
      lastHeartbeat: now,
      updatedAt: now
    };
    if (!existingDevice) {
      await db.insert(monitoredDevices).values(values);
    } else {
      await db.update(monitoredDevices).set(values).where(eq(monitoredDevices.agentId, input.agentId));
    }
    const result = await db.select().from(monitoredDevices).where(eq(monitoredDevices.agentId, input.agentId)).limit(1);
    return result[0] ?? null;
  }
  const existing = inMemoryDevices.get(input.agentId);
  const isRevoked = existing?.isRevoked ?? 0;
  const device = {
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
    status: isRevoked ? "offline" : "online",
    isRevoked,
    revokedAt: existing?.revokedAt ?? null,
    revokedBy: existing?.revokedBy ?? null,
    cpuPercent: clampPercent(input.cpuPercent),
    memoryPercent: clampPercent(input.memoryPercent),
    diskPercent: clampPercent(input.diskPercent),
    lastHeartbeat: now,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now
  };
  inMemoryDevices.set(input.agentId, device);
  return device;
}
async function recordSessionAudit(audit) {
  const db = await getDb();
  if (db) {
    await db.insert(sessionAudits).values(audit);
    const rows = await db.select().from(sessionAudits).where(eq(sessionAudits.sessionId, audit.sessionId)).limit(1);
    return rows[0] ?? null;
  }
  const record = {
    id: inMemoryAudits.size + 1,
    sessionId: audit.sessionId,
    agentId: audit.agentId,
    hostname: audit.hostname,
    operatorId: audit.operatorId,
    operatorName: audit.operatorName,
    state: audit.state ?? "requested",
    requestedAt: audit.requestedAt ?? /* @__PURE__ */ new Date(),
    approvedAt: audit.approvedAt ?? null,
    endedAt: audit.endedAt ?? null,
    durationSeconds: audit.durationSeconds ?? 0,
    createdAt: /* @__PURE__ */ new Date(),
    updatedAt: /* @__PURE__ */ new Date()
  };
  inMemoryAudits.set(audit.sessionId, record);
  return record;
}
async function updateSessionAudit(sessionId, update) {
  const db = await getDb();
  const now = /* @__PURE__ */ new Date();
  if (db) {
    await db.update(sessionAudits).set({ ...update, updatedAt: now }).where(eq(sessionAudits.sessionId, sessionId));
    const rows = await db.select().from(sessionAudits).where(eq(sessionAudits.sessionId, sessionId)).limit(1);
    return rows[0] ?? null;
  }
  const current = inMemoryAudits.get(sessionId);
  if (!current) return null;
  const updated = {
    ...current,
    ...update,
    approvedAt: update.approvedAt !== void 0 ? update.approvedAt : current.approvedAt,
    endedAt: update.endedAt !== void 0 ? update.endedAt : current.endedAt,
    durationSeconds: update.durationSeconds !== void 0 ? update.durationSeconds : current.durationSeconds,
    state: update.state ?? current.state,
    updatedAt: now
  };
  inMemoryAudits.set(sessionId, updated);
  return updated;
}
async function listSessionAudits(agentId) {
  const db = await getDb();
  if (db) {
    if (agentId) {
      return db.select().from(sessionAudits).where(eq(sessionAudits.agentId, agentId)).orderBy(desc(sessionAudits.requestedAt));
    }
    return db.select().from(sessionAudits).orderBy(desc(sessionAudits.requestedAt));
  }
  const all = Array.from(inMemoryAudits.values());
  const filtered = agentId ? all.filter((a) => a.agentId === agentId) : all;
  return filtered.sort((a, b) => new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime());
}
function clampPercent(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

// server/_core/sdk.ts
var isNonEmptyString = (value) => typeof value === "string" && value.length > 0;
var EXCHANGE_TOKEN_PATH = `/webdev.v1.WebDevAuthPublicService/ExchangeToken`;
var GET_USER_INFO_PATH = `/webdev.v1.WebDevAuthPublicService/GetUserInfo`;
var GET_USER_INFO_WITH_JWT_PATH = `/webdev.v1.WebDevAuthPublicService/GetUserInfoWithJwt`;
var OAuthService = class {
  constructor(client) {
    this.client = client;
  }
  decodeState(state) {
    return decodeOAuthState(state).redirectUri;
  }
  async getTokenByCode(code, state) {
    const payload = {
      clientId: ENV.appId,
      grantType: "authorization_code",
      code,
      redirectUri: this.decodeState(state)
    };
    const { data } = await this.client.post(EXCHANGE_TOKEN_PATH, payload);
    return data;
  }
  async getUserInfoByToken(token) {
    const { data } = await this.client.post(GET_USER_INFO_PATH, {
      accessToken: token.accessToken
    });
    return data;
  }
};
var createOAuthHttpClient = () => axios.create({
  baseURL: ENV.oAuthServerUrl,
  timeout: AXIOS_TIMEOUT_MS
});
var SDKServer = class {
  client;
  oauthService;
  constructor(client = createOAuthHttpClient()) {
    this.client = client;
    this.oauthService = new OAuthService(this.client);
  }
  deriveLoginMethod(platforms, fallback) {
    if (fallback && fallback.length > 0) return fallback;
    if (!Array.isArray(platforms) || platforms.length === 0) return null;
    const set = new Set(platforms.filter((p) => typeof p === "string"));
    if (set.has("REGISTERED_PLATFORM_EMAIL")) return "email";
    if (set.has("REGISTERED_PLATFORM_GOOGLE")) return "google";
    if (set.has("REGISTERED_PLATFORM_APPLE")) return "apple";
    if (set.has("REGISTERED_PLATFORM_MICROSOFT") || set.has("REGISTERED_PLATFORM_AZURE")) return "microsoft";
    if (set.has("REGISTERED_PLATFORM_GITHUB")) return "github";
    const first = Array.from(set)[0];
    return first ? first.toLowerCase() : null;
  }
  async exchangeCodeForToken(code, state) {
    return this.oauthService.getTokenByCode(code, state);
  }
  async getUserInfo(accessToken) {
    const data = await this.oauthService.getUserInfoByToken({ accessToken });
    const loginMethod = this.deriveLoginMethod(data?.platforms, data?.platform ?? null);
    return {
      ...data,
      platform: loginMethod,
      loginMethod
    };
  }
  parseCookies(cookieHeader) {
    if (!cookieHeader) return /* @__PURE__ */ new Map();
    const parsed = parseCookieHeader(cookieHeader);
    return new Map(Object.entries(parsed));
  }
  getSessionSecret() {
    return new TextEncoder().encode(ENV.cookieSecret);
  }
  async createSessionToken(openId, options = {}) {
    return this.signSession({ openId, appId: ENV.appId, name: options.name || "" }, options);
  }
  async signSession(payload, options = {}) {
    const issuedAt = Date.now();
    const expiresInMs = options.expiresInMs ?? ONE_YEAR_MS;
    const expirationSeconds = Math.floor((issuedAt + expiresInMs) / 1e3);
    const secretKey = this.getSessionSecret();
    return new SignJWT({
      openId: payload.openId,
      appId: payload.appId,
      name: payload.name
    }).setProtectedHeader({ alg: "HS256", typ: "JWT" }).setExpirationTime(expirationSeconds).sign(secretKey);
  }
  async verifySession(cookieValue) {
    if (!cookieValue) return null;
    try {
      const secretKey = this.getSessionSecret();
      const { payload } = await jwtVerify(cookieValue, secretKey, {
        algorithms: ["HS256"]
      });
      const { openId, appId, name } = payload;
      if (!isNonEmptyString(openId) || !isNonEmptyString(appId) || !isNonEmptyString(name)) {
        return null;
      }
      return { openId, appId, name };
    } catch {
      return null;
    }
  }
  async getUserInfoWithJwt(jwtToken) {
    const payload = { jwtToken, projectId: ENV.appId };
    const { data } = await this.client.post(GET_USER_INFO_WITH_JWT_PATH, payload);
    const loginMethod = this.deriveLoginMethod(data?.platforms, data?.platform ?? null);
    return {
      ...data,
      platform: loginMethod,
      loginMethod
    };
  }
  async authenticateRequest(req) {
    const cookies = this.parseCookies(req.headers.cookie);
    let sessionToken = cookies.get(COOKIE_NAME);
    if (!sessionToken) {
      const authHeader = req.headers.authorization;
      if (typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
        sessionToken = authHeader.slice(7);
      }
    }
    const session = await this.verifySession(sessionToken);
    if (!session) {
      throw ForbiddenError("Invalid session cookie");
    }
    const sessionUserId = session.openId;
    const signedInAt = /* @__PURE__ */ new Date();
    let user = await getUserByOpenId(sessionUserId);
    if (!user) {
      try {
        const userInfo = await this.getUserInfoWithJwt(sessionToken ?? "");
        await upsertUser({
          openId: userInfo.openId,
          name: userInfo.name || null,
          email: userInfo.email ?? null,
          loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
          lastSignedIn: signedInAt
        });
        user = await getUserByOpenId(userInfo.openId);
      } catch (error) {
        console.error("[Auth] Failed to sync user from OAuth:", error);
        throw ForbiddenError("Failed to sync user info");
      }
    }
    if (!user) {
      throw ForbiddenError("User not found");
    }
    await upsertUser({
      openId: user.openId,
      lastSignedIn: signedInAt
    });
    return user;
  }
};
var sdk = new SDKServer();

// server/agentRoutes.ts
var statusSubscribers = /* @__PURE__ */ new Set();
function publishDeviceStatus(device) {
  const payload = JSON.stringify({ agentId: device.agentId, status: device.status, hostname: device.hostname, lastHeartbeat: device.lastHeartbeat });
  statusSubscribers.forEach((subscriber) => subscriber(payload));
}
var heartbeatSchema = z.object({
  agentId: z.string().min(1).max(64),
  installToken: z.string().min(1).max(128),
  hostname: z.string().min(1).max(255),
  username: z.string().max(255).optional(),
  platform: z.string().min(1).max(64),
  osVersion: z.string().max(255).optional().catch(void 0),
  hardwareModel: z.string().max(255).optional().catch(void 0),
  serialNumber: z.string().max(255).optional().catch(void 0),
  ipAddress: z.string().max(64).optional().catch(void 0),
  uptimeSeconds: z.number().int().min(0).max(31536e3).optional().catch(void 0),
  agentVersion: z.string().max(64).optional().catch(void 0),
  browserInventory: z.string().max(8e3).optional().catch(void 0),
  cpuPercent: z.number().min(0).max(100).optional(),
  memoryPercent: z.number().min(0).max(100).optional(),
  diskPercent: z.number().min(0).max(100).optional()
});
function isValidAgentToken(token) {
  return Boolean(token && token === ENV.agentEnrollmentToken);
}
function parseHeartbeatPayload(input) {
  const parsed = heartbeatSchema.safeParse(input);
  return parsed.success ? parsed.data : null;
}
function registerAgentRoutes(app) {
  app.post("/api/agent/heartbeat", async (req, res) => {
    const headerToken = req.header("x-orbit-agent-token");
    if (!isValidAgentToken(headerToken)) {
      res.status(401).json({ ok: false, error: "Invalid agent token" });
      return;
    }
    const payload = parseHeartbeatPayload(req.body);
    if (!payload) {
      res.status(400).json({ ok: false, error: "Invalid heartbeat payload" });
      return;
    }
    try {
      const existing = await getMonitoredDevice(payload.agentId);
      if (existing?.isRevoked) {
        res.status(403).json({
          ok: false,
          error: "Device enrollment has been revoked by the administrator",
          revoked: true
        });
        return;
      }
      const device = await upsertHeartbeat(payload);
      if (!device) {
        res.status(503).json({ ok: false, error: "Monitoring database is unavailable" });
        return;
      }
      publishDeviceStatus(device);
      res.json({ ok: true, deviceId: device.agentId, lastHeartbeat: device.lastHeartbeat, isRevoked: Boolean(device.isRevoked) });
    } catch (error) {
      console.error("[Agent] Heartbeat failed:", error);
      res.status(500).json({ ok: false, error: "Heartbeat could not be recorded" });
    }
  });
  app.get("/api/devices/stream", async (req, res) => {
    try {
      await sdk.authenticateRequest(req);
    } catch {
      res.status(401).json({ ok: false, error: "Authentication required" });
      return;
    }
    res.status(200).set({ "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" });
    res.flushHeaders();
    res.write(`event: ready
data: ${JSON.stringify({ ok: true })}

`);
    const subscriber = (payload) => res.write(`event: device
data: ${String(payload)}

`);
    statusSubscribers.add(subscriber);
    const heartbeat = setInterval(() => res.write(": keep-alive\n\n"), 25e3);
    req.on("close", () => {
      clearInterval(heartbeat);
      statusSubscribers.delete(subscriber);
    });
  });
}

// server/screenRoutes.ts
import { raw } from "express";
import { nanoid } from "nanoid";
var sessions = /* @__PURE__ */ new Map();
var auditWrites = /* @__PURE__ */ new Map();
function queueAuditWrite(sessionId, work) {
  const previous = auditWrites.get(sessionId) ?? Promise.resolve();
  const next = previous.catch(() => void 0).then(work).catch((err) => console.error("[Screen] Failed to persist session audit:", err));
  auditWrites.set(sessionId, next);
  return next;
}
async function flushScreenAuditWrites(agentId) {
  const pending = Array.from(auditWrites.entries()).filter(([sessionId]) => {
    if (!agentId) return true;
    return sessions.get(sessionId)?.agentId === agentId;
  });
  await Promise.all(pending.map(([, write]) => write));
}
function requestScreenSession(agentId, operator = { id: "admin-1", name: "Administrator" }, controls = {}) {
  const active = Array.from(sessions.values()).find(
    (session2) => session2.agentId === agentId && ["requested", "approved"].includes(session2.state)
  );
  if (active) return active;
  const session = {
    id: nanoid(24),
    agentId,
    hostname: "Windows PC",
    operatorId: operator?.id ?? "admin-1",
    operatorName: operator?.name ?? "Administrator",
    state: "requested",
    requestedAt: Date.now(),
    quality: controls.quality ?? "medium",
    maxDurationSeconds: Math.min(3600, Math.max(60, controls.maxDurationSeconds ?? 600)),
    maxBandwidthKbps: Math.min(4096, Math.max(64, controls.maxBandwidthKbps ?? 1024)),
    bandwidthWindowStartedAt: Date.now(),
    bandwidthWindowBytes: 0
  };
  sessions.set(session.id, session);
  queueAuditWrite(session.id, async () => {
    const device = await getMonitoredDevice(agentId);
    if (device) session.hostname = device.hostname;
    await recordSessionAudit({
      sessionId: session.id,
      agentId: session.agentId,
      hostname: session.hostname,
      operatorId: session.operatorId,
      operatorName: session.operatorName,
      state: "requested",
      requestedAt: new Date(session.requestedAt)
    });
  });
  return session;
}
function getScreenSession(id) {
  const session = sessions.get(id) ?? null;
  if (session?.state === "approved" && Date.now() - (session.approvedAt ?? Date.now()) >= session.maxDurationSeconds * 1e3) {
    endScreenSession(id);
  }
  return session;
}
function decideScreenSession(id, approved) {
  const session = sessions.get(id);
  if (!session || session.state !== "requested") return null;
  session.state = approved ? "approved" : "denied";
  session.approvedAt = Date.now();
  queueAuditWrite(session.id, async () => {
    await updateSessionAudit(session.id, {
      state: session.state,
      approvedAt: approved ? new Date(session.approvedAt) : void 0
    });
  });
  return session;
}
function endScreenSession(id) {
  const session = sessions.get(id);
  if (!session) return null;
  session.state = "ended";
  session.endedAt = Date.now();
  const durationSeconds = session.approvedAt ? Math.max(0, Math.round((session.endedAt - session.approvedAt) / 1e3)) : 0;
  queueAuditWrite(session.id, async () => {
    await updateSessionAudit(session.id, {
      state: "ended",
      endedAt: new Date(session.endedAt),
      durationSeconds
    });
  });
  return session;
}
function endAllSessionsForAgent(agentId) {
  for (const session of Array.from(sessions.values())) {
    if (session.agentId === agentId && session.state !== "ended") {
      endScreenSession(session.id);
    }
  }
}
function getPendingScreenSession(agentId) {
  return Array.from(sessions.values()).find(
    (session) => session.agentId === agentId && session.state === "requested"
  ) ?? null;
}
function setScreenFrame(id, frame) {
  const session = sessions.get(id);
  if (!session || session.state !== "approved") return false;
  if (Date.now() - (session.approvedAt ?? Date.now()) >= session.maxDurationSeconds * 1e3) {
    endScreenSession(id);
    return false;
  }
  if (Date.now() - session.bandwidthWindowStartedAt >= 6e4) {
    session.bandwidthWindowStartedAt = Date.now();
    session.bandwidthWindowBytes = 0;
  }
  const maxWindowBytes = session.maxBandwidthKbps * 1024 * 60;
  if (session.bandwidthWindowBytes + frame.length > maxWindowBytes) return false;
  session.bandwidthWindowBytes += frame.length;
  session.frame = frame;
  session.frameAt = Date.now();
  return true;
}
function registerScreenRoutes(app) {
  app.get("/api/agent/screen/pending", async (req, res) => {
    if (req.header("x-orbit-agent-token") !== ENV.agentEnrollmentToken) {
      res.status(401).json({ ok: false, error: "Invalid agent token" });
      return;
    }
    const agentId = String(req.query.agentId ?? "");
    const device = await getMonitoredDevice(agentId);
    if (device?.isRevoked) {
      res.json({ ok: true, state: "none", revoked: true });
      return;
    }
    const session = getPendingScreenSession(agentId);
    res.json(session ? { ok: true, sessionId: session.id, state: session.state } : { ok: true, state: "none" });
  });
  app.post("/api/agent/screen/decision", (req, res) => {
    if (req.header("x-orbit-agent-token") !== ENV.agentEnrollmentToken) {
      res.status(401).json({ ok: false, error: "Invalid agent token" });
      return;
    }
    const sessionId = String(req.header("x-orbit-session") ?? "");
    const approved = req.body?.approved === true;
    const session = decideScreenSession(sessionId, approved);
    if (!session) {
      res.status(404).json({ ok: false, error: "Screen session is no longer pending" });
      return;
    }
    res.json({ ok: true, state: session.state });
  });
  app.get("/api/agent/screen/state", (req, res) => {
    if (req.header("x-orbit-agent-token") !== ENV.agentEnrollmentToken) {
      res.status(401).json({ ok: false, error: "Invalid agent token" });
      return;
    }
    const session = getScreenSession(String(req.query.sessionId ?? ""));
    res.json({ ok: true, state: session?.state ?? "ended", quality: session?.quality ?? "medium", maxDurationSeconds: session?.maxDurationSeconds ?? 0, maxBandwidthKbps: session?.maxBandwidthKbps ?? 0 });
  });
  app.post("/api/agent/screen/frame", raw({ type: "image/bmp", limit: "8mb" }), (req, res) => {
    if (req.header("x-orbit-agent-token") !== ENV.agentEnrollmentToken) {
      res.status(401).json({ ok: false, error: "Invalid agent token" });
      return;
    }
    const sessionId = String(req.header("x-orbit-session") ?? "");
    const frame = Buffer.isBuffer(req.body) ? req.body : Buffer.from([]);
    if (frame.length === 0 || frame.length > 8 * 1024 * 1024 || !setScreenFrame(sessionId, frame)) {
      res.status(400).json({ ok: false, error: "Invalid or inactive screen session" });
      return;
    }
    res.json({ ok: true, frameAt: Date.now() });
  });
  app.get("/api/screen/session/:id/frame", (req, res) => {
    const session = getScreenSession(req.params.id);
    if (!session || session.state !== "approved" || !session.frame) {
      res.status(404).end();
      return;
    }
    res.setHeader("Content-Type", "image/bmp");
    res.setHeader("Cache-Control", "no-store");
    res.send(session.frame);
  });
}

// server/_core/oauth.ts
import { parse as parseCookieHeader2 } from "cookie";

// server/_core/cookies.ts
function isSecureRequest(req) {
  if (req.protocol === "https") return true;
  const forwardedProto = req.headers["x-forwarded-proto"];
  if (!forwardedProto) return false;
  const protoList = Array.isArray(forwardedProto) ? forwardedProto : forwardedProto.split(",");
  return protoList.some((proto) => proto.trim().toLowerCase() === "https");
}
function getSessionCookieOptions(req) {
  return {
    httpOnly: true,
    path: "/",
    sameSite: "none",
    secure: isSecureRequest(req)
  };
}

// server/_core/oauth.ts
function getQueryParam(req, key) {
  const value = req.query[key];
  return typeof value === "string" ? value : void 0;
}
function registerOAuthRoutes(app) {
  app.get("/api/oauth/callback", async (req, res) => {
    const code = getQueryParam(req, "code");
    const state = getQueryParam(req, "state");
    if (!code || !state) {
      res.status(400).json({ error: "code and state are required" });
      return;
    }
    const { nonce } = decodeOAuthState(state);
    const expectedNonce = parseCookieHeader2(req.headers.cookie ?? "")[OAUTH_STATE_COOKIE];
    if (!nonce || nonce !== expectedNonce) {
      res.status(403).json({ error: "invalid oauth state" });
      return;
    }
    res.clearCookie(OAUTH_STATE_COOKIE, { path: "/", secure: true, sameSite: "none" });
    try {
      const tokenResponse = await sdk.exchangeCodeForToken(code, state);
      const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);
      if (!userInfo.openId) {
        res.status(400).json({ error: "openId missing from user info" });
        return;
      }
      await upsertUser({
        openId: userInfo.openId,
        name: userInfo.name || null,
        email: userInfo.email ?? null,
        loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
        lastSignedIn: /* @__PURE__ */ new Date()
      });
      const sessionToken = await sdk.createSessionToken(userInfo.openId, {
        name: userInfo.name || "",
        expiresInMs: ONE_YEAR_MS
      });
      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });
      res.redirect(302, "/");
    } catch (error) {
      console.error("[OAuth] Callback failed", error);
      res.status(500).json({ error: "OAuth callback failed" });
    }
  });
}

// server/_core/storageProxy.ts
import fs from "fs";
import path from "path";
function registerStorageProxy(app) {
  app.get("/manus-storage/*", async (req, res) => {
    const key = req.params[0];
    if (!key) {
      res.status(400).send("Missing storage key");
      return;
    }
    const localCandidates = [
      path.resolve(process.cwd(), "dist", "public", "manus-storage", key),
      path.resolve(process.cwd(), "client", "public", "manus-storage", key),
      path.resolve(process.cwd(), "dist", "public", "orbit-monitor-screen.exe"),
      path.resolve(process.cwd(), "client", "public", "orbit-monitor-screen.exe")
    ];
    for (const candidate of localCandidates) {
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
        res.setHeader("Content-Disposition", `attachment; filename="${path.basename(candidate)}"`);
        res.sendFile(candidate);
        return;
      }
    }
    if (!ENV.forgeApiUrl || !ENV.forgeApiKey) {
      res.status(404).send("File not found in local storage and forge storage not configured");
      return;
    }
    try {
      const forgeUrl = new URL(
        "v1/storage/presign/get",
        ENV.forgeApiUrl.replace(/\/+$/, "") + "/"
      );
      forgeUrl.searchParams.set("path", key);
      const forgeResp = await fetch(forgeUrl, {
        headers: { Authorization: `Bearer ${ENV.forgeApiKey}` }
      });
      if (!forgeResp.ok) {
        const body = await forgeResp.text().catch(() => "");
        console.error(`[StorageProxy] forge error: ${forgeResp.status} ${body}`);
        res.status(502).send("Storage backend error");
        return;
      }
      const { url } = await forgeResp.json();
      if (!url) {
        res.status(502).send("Empty signed URL from backend");
        return;
      }
      res.set("Cache-Control", "no-store");
      res.redirect(307, url);
    } catch (err) {
      console.error("[StorageProxy] failed:", err);
      res.status(502).send("Storage proxy error");
    }
  });
}

// server/routers.ts
import { TRPCError as TRPCError2 } from "@trpc/server";
import { z as z3 } from "zod";

// server/_core/systemRouter.ts
import { z as z2 } from "zod";

// server/_core/trpc.ts
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
var t = initTRPC.context().create({
  transformer: superjson
});
var router = t.router;
var publicProcedure = t.procedure;
var requireUser = t.middleware(async (opts) => {
  const { ctx, next } = opts;
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }
  return next({
    ctx: {
      ...ctx,
      user: ctx.user
    }
  });
});
var protectedProcedure = t.procedure.use(requireUser);
var adminProcedure = t.procedure.use(
  t.middleware(async (opts) => {
    const { ctx, next } = opts;
    if (!ctx.user || ctx.user.role !== "admin") {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }
    return next({
      ctx: {
        ...ctx,
        user: ctx.user
      }
    });
  })
);

// server/_core/systemRouter.ts
var systemRouter = router({
  health: publicProcedure.input(
    z2.object({
      timestamp: z2.number().min(0, "timestamp cannot be negative")
    })
  ).query(() => ({
    ok: true
  })),
  notifyOwner: adminProcedure.input(
    z2.object({
      title: z2.string().min(1, "title is required"),
      content: z2.string().min(1, "content is required")
    })
  ).mutation(async () => {
    return {
      success: true
    };
  })
});

// server/routers.ts
var appRouter = router({
  system: systemRouter,
  auth: router({
    me: protectedProcedure.query(({ ctx }) => ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true
      };
    })
  }),
  devices: router({
    list: protectedProcedure.query(() => listMonitoredDevices()),
    revoke: protectedProcedure.input(z3.object({ agentId: z3.string().min(1) })).mutation(async ({ input, ctx }) => {
      const operatorName = ctx.user?.name || ctx.user?.email || "Administrator";
      const device = await revokeDevice(input.agentId, operatorName);
      endAllSessionsForAgent(input.agentId);
      return { success: Boolean(device), device };
    }),
    unrevoke: protectedProcedure.input(z3.object({ agentId: z3.string().min(1) })).mutation(async ({ input }) => {
      const device = await unrevokeDevice(input.agentId);
      return { success: Boolean(device), device };
    })
  }),
  screen: router({
    request: protectedProcedure.input(z3.object({
      agentId: z3.string().min(1),
      quality: z3.enum(["low", "medium", "high"]).default("medium"),
      maxDurationSeconds: z3.number().int().min(60).max(3600).default(600),
      maxBandwidthKbps: z3.number().int().min(64).max(4096).default(1024)
    })).mutation(async ({ input, ctx }) => {
      const device = await getMonitoredDevice(input.agentId);
      if (device?.isRevoked) {
        throw new TRPCError2({
          code: "FORBIDDEN",
          message: "Device enrollment has been revoked"
        });
      }
      const operator = {
        id: String(ctx.user?.id ?? "admin-1"),
        name: ctx.user?.name || ctx.user?.email || "Administrator"
      };
      const session = requestScreenSession(input.agentId, operator, input);
      return { sessionId: session.id, state: session.state };
    }),
    status: protectedProcedure.input(z3.object({ sessionId: z3.string().min(1) })).query(({ input }) => {
      const session = getScreenSession(input.sessionId);
      return {
        state: session?.state ?? "ended",
        frameAt: session?.frameAt ?? null,
        operatorName: session?.operatorName ?? "Administrator",
        requestedAt: session?.requestedAt ?? null,
        approvedAt: session?.approvedAt ?? null,
        endedAt: session?.endedAt ?? null,
        quality: session?.quality ?? "medium",
        maxDurationSeconds: session?.maxDurationSeconds ?? 0,
        maxBandwidthKbps: session?.maxBandwidthKbps ?? 0
      };
    }),
    end: protectedProcedure.input(z3.object({ sessionId: z3.string().min(1) })).mutation(({ input }) => {
      const session = endScreenSession(input.sessionId);
      return { state: session?.state ?? "ended" };
    }),
    history: protectedProcedure.input(z3.object({ agentId: z3.string().optional() }).optional()).query(async ({ input }) => {
      await flushScreenAuditWrites(input?.agentId);
      const audits = await listSessionAudits(input?.agentId);
      return audits.map((audit) => ({
        id: audit.id,
        sessionId: audit.sessionId,
        agentId: audit.agentId,
        hostname: audit.hostname,
        operatorId: audit.operatorId,
        operatorName: audit.operatorName,
        state: audit.state,
        requestedAt: audit.requestedAt,
        approvedAt: audit.approvedAt,
        endedAt: audit.endedAt,
        durationSeconds: audit.durationSeconds
      }));
    })
  })
});

// server/_core/context.ts
async function createContext(opts) {
  let user = null;
  try {
    user = await sdk.authenticateRequest(opts.req);
  } catch {
  }
  return {
    req: opts.req,
    res: opts.res,
    user
  };
}

// server/_core/vite.ts
import express from "express";
import fs2 from "fs";
import path2 from "path";
import { createServer as createViteServer } from "vite";
async function setupVite(app, server) {
  const vite = await createViteServer({
    server: { middlewareMode: true, hmr: { server } },
    appType: "custom"
  });
  app.use(vite.middlewares);
  app.use("*", async (req, res, next) => {
    try {
      const url = req.originalUrl;
      const clientTemplate = path2.resolve(process.cwd(), "client", "index.html");
      const template = await fs2.promises.readFile(clientTemplate, "utf-8");
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      next(e);
    }
  });
}
function serveStatic(app) {
  const possiblePaths = [
    path2.resolve(process.cwd(), "dist", "public"),
    path2.resolve(import.meta.dirname, "public"),
    path2.resolve(import.meta.dirname, "../..", "dist", "public")
  ];
  const distPath = possiblePaths.find((p) => fs2.existsSync(p)) ?? path2.resolve(process.cwd(), "dist", "public");
  app.use(express.static(distPath));
  app.use("*", (_req, res) => {
    res.sendFile(path2.resolve(distPath, "index.html"));
  });
}

// server/_core/index.ts
function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}
async function findAvailablePort(startPort = 3e3) {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}
async function startServer() {
  const app = express2();
  const server = createServer(app);
  app.use(express2.json({ limit: "50mb" }));
  app.use(express2.urlencoded({ limit: "50mb", extended: true }));
  registerAgentRoutes(app);
  registerScreenRoutes(app);
  registerStorageProxy(app);
  registerOAuthRoutes(app);
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext
    })
  );
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }
  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);
  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }
  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}
startServer().catch(console.error);
