import { raw, type Express, type Request, type Response } from "express";
import { nanoid } from "nanoid";
import { ENV } from "./_core/env";
import { getMonitoredDevice, recordSessionAudit, updateSessionAudit } from "./db";

export type ScreenSession = {
  id: string;
  agentId: string;
  hostname: string;
  operatorId: string;
  operatorName: string;
  state: "requested" | "approved" | "denied" | "ended";
  requestedAt: number;
  approvedAt?: number;
  endedAt?: number;
  quality: "low" | "medium" | "high";
  maxDurationSeconds: number;
  maxBandwidthKbps: number;
  bandwidthWindowStartedAt: number;
  bandwidthWindowBytes: number;
  frame?: Buffer;
  frameAt?: number;
};

const sessions = new Map<string, ScreenSession>();
const auditWrites = new Map<string, Promise<void>>();

function queueAuditWrite(sessionId: string, work: () => Promise<void>) {
  const previous = auditWrites.get(sessionId) ?? Promise.resolve();
  const next = previous
    .catch(() => undefined)
    .then(work)
    .catch((err) => console.error("[Screen] Failed to persist session audit:", err));
  auditWrites.set(sessionId, next);
  return next;
}

export async function flushScreenAuditWrites(agentId?: string) {
  const pending = Array.from(auditWrites.entries()).filter(([sessionId]) => {
    if (!agentId) return true;
    return sessions.get(sessionId)?.agentId === agentId;
  });
  await Promise.all(pending.map(([, write]) => write));
}

export function requestScreenSession(
  agentId: string,
  operator: { id: string; name: string } = { id: "admin-1", name: "Administrator" },
  controls: { quality?: "low" | "medium" | "high"; maxDurationSeconds?: number; maxBandwidthKbps?: number } = {},
): ScreenSession {
  const active = Array.from(sessions.values()).find(
    (session) => session.agentId === agentId && ["requested", "approved"].includes(session.state)
  );
  if (active) return active;

  const session: ScreenSession = {
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
    bandwidthWindowBytes: 0,
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
      requestedAt: new Date(session.requestedAt),
    });
  });

  return session;
}

export function getScreenSession(id: string) {
  const session = sessions.get(id) ?? null;
  if (session?.state === "approved" && Date.now() - (session.approvedAt ?? Date.now()) >= session.maxDurationSeconds * 1000) {
    endScreenSession(id);
  }
  return session;
}

export function decideScreenSession(id: string, approved: boolean) {
  const session = sessions.get(id);
  if (!session || session.state !== "requested") return null;
  session.state = approved ? "approved" : "denied";
  session.approvedAt = Date.now();

  queueAuditWrite(session.id, async () => {
    await updateSessionAudit(session.id, {
      state: session.state,
      approvedAt: approved ? new Date(session.approvedAt!) : undefined,
    });
  });

  return session;
}

export function endScreenSession(id: string) {
  const session = sessions.get(id);
  if (!session) return null;
  session.state = "ended";
  session.endedAt = Date.now();
  const durationSeconds = session.approvedAt
    ? Math.max(0, Math.round((session.endedAt - session.approvedAt) / 1000))
    : 0;

  queueAuditWrite(session.id, async () => {
    await updateSessionAudit(session.id, {
      state: "ended",
      endedAt: new Date(session.endedAt!),
      durationSeconds,
    });
  });

  return session;
}

export function endAllSessionsForAgent(agentId: string) {
  for (const session of Array.from(sessions.values())) {
    if (session.agentId === agentId && session.state !== "ended") {
      endScreenSession(session.id);
    }
  }
}

export function getPendingScreenSession(agentId: string) {
  return (
    Array.from(sessions.values()).find(
      (session) => session.agentId === agentId && session.state === "requested"
    ) ?? null
  );
}

export function setScreenFrame(id: string, frame: Buffer) {
  const session = sessions.get(id);
  if (!session || session.state !== "approved") return false;
  if (Date.now() - (session.approvedAt ?? Date.now()) >= session.maxDurationSeconds * 1000) {
    endScreenSession(id);
    return false;
  }
  if (Date.now() - session.bandwidthWindowStartedAt >= 60_000) {
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

export function registerScreenRoutes(app: Express) {
  app.get("/api/agent/screen/pending", async (req: Request, res: Response) => {
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

  app.post("/api/agent/screen/decision", (req: Request, res: Response) => {
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

  app.get("/api/agent/screen/state", (req: Request, res: Response) => {
    if (req.header("x-orbit-agent-token") !== ENV.agentEnrollmentToken) {
      res.status(401).json({ ok: false, error: "Invalid agent token" });
      return;
    }
    const session = getScreenSession(String(req.query.sessionId ?? ""));
    res.json({ ok: true, state: session?.state ?? "ended", quality: session?.quality ?? "medium", maxDurationSeconds: session?.maxDurationSeconds ?? 0, maxBandwidthKbps: session?.maxBandwidthKbps ?? 0 });
  });

  app.post("/api/agent/screen/frame", raw({ type: "image/bmp", limit: "8mb" }), (req: Request, res: Response) => {
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

  app.get("/api/screen/session/:id/frame", (req: Request, res: Response) => {
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
