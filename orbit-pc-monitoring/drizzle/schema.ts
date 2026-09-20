import { int, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export const monitoredDevices = mysqlTable("monitored_devices", {
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
  processList: text("processList"),
  softwareInventory: text("softwareInventory"),
  activeWindowTitle: varchar("activeWindowTitle", { length: 512 }),
  networkAdapters: text("networkAdapters"),
  status: mysqlEnum("status", ["online", "offline"]).default("online").notNull(),
  isRevoked: int("isRevoked").default(0).notNull(), // 0 = active, 1 = revoked
  revokedAt: timestamp("revokedAt"),
  revokedBy: varchar("revokedBy", { length: 255 }),
  cpuPercent: int("cpuPercent").default(0).notNull(),
  memoryPercent: int("memoryPercent").default(0).notNull(),
  diskPercent: int("diskPercent").default(0).notNull(),
  lastHeartbeat: timestamp("lastHeartbeat").defaultNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type MonitoredDevice = typeof monitoredDevices.$inferSelect;
export type InsertMonitoredDevice = typeof monitoredDevices.$inferInsert;

export const enrollmentTokens = mysqlTable("enrollment_tokens", {
  id: int("id").autoincrement().primaryKey(),
  token: varchar("token", { length: 128 }).notNull().unique(),
  agentId: varchar("agentId", { length: 64 }).notNull().unique(),
  label: varchar("label", { length: 255 }),
  createdBy: varchar("createdBy", { length: 255 }).notNull(),
  usedAt: timestamp("usedAt"),
  revokedAt: timestamp("revokedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type EnrollmentToken = typeof enrollmentTokens.$inferSelect;
export type InsertEnrollmentToken = typeof enrollmentTokens.$inferInsert;

export const sessionAudits = mysqlTable("session_audits", {
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
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type SessionAudit = typeof sessionAudits.$inferSelect;
export type InsertSessionAudit = typeof sessionAudits.$inferInsert;
