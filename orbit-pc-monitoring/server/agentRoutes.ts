import type { Express, Request, Response } from "express";
import { z } from "zod";
import { ENV } from "./_core/env";
import { sdk } from "./_core/sdk";
import { getMonitoredDevice, upsertHeartbeat } from "./db";

const statusSubscribers = new Set<(payload: unknown) => void>();

function publishDeviceStatus(device: { agentId: string; status: string; hostname: string; lastHeartbeat: Date }) {
  const payload = JSON.stringify({ agentId: device.agentId, status: device.status, hostname: device.hostname, lastHeartbeat: device.lastHeartbeat });
  statusSubscribers.forEach((subscriber) => subscriber(payload));
}

const heartbeatSchema = z.object({
  agentId: z.string().min(1).max(64),
  installToken: z.string().min(1).max(128),
  hostname: z.string().min(1).max(255),
  username: z.string().max(255).optional(),
  platform: z.string().min(1).max(64),
  osVersion: z.string().max(255).optional().catch(undefined),
  hardwareModel: z.string().max(255).optional().catch(undefined),
  serialNumber: z.string().max(255).optional().catch(undefined),
  ipAddress: z.string().max(64).optional().catch(undefined),
  uptimeSeconds: z.number().int().min(0).max(31_536_000).optional().catch(undefined),
  agentVersion: z.string().max(64).optional().catch(undefined),
  browserInventory: z.string().max(8_000).optional().catch(undefined),
  cpuPercent: z.number().min(0).max(100).optional(),
  memoryPercent: z.number().min(0).max(100).optional(),
  diskPercent: z.number().min(0).max(100).optional(),
  // New telemetry fields
  processList: z.string().max(32_000).optional().catch(undefined),
  softwareInventory: z.string().max(64_000).optional().catch(undefined),
  activeWindowTitle: z.string().max(512).optional().catch(undefined),
  networkAdapters: z.string().max(8_000).optional().catch(undefined),
});

export function isValidAgentToken(token: string | undefined) {
  return Boolean(token && token === ENV.agentEnrollmentToken);
}

export function parseHeartbeatPayload(input: unknown) {
  const parsed = heartbeatSchema.safeParse(input);
  return parsed.success ? parsed.data : null;
}

export function registerAgentRoutes(app: Express) {
  app.post("/api/agent/heartbeat", async (req: Request, res: Response) => {
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
          revoked: true,
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

  app.get("/api/devices/stream", async (req: Request, res: Response) => {
    try {
      await sdk.authenticateRequest(req);
    } catch {
      res.status(401).json({ ok: false, error: "Authentication required" });
      return;
    }
    res.status(200).set({ "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" });
    res.flushHeaders();
    res.write(`event: ready\ndata: ${JSON.stringify({ ok: true })}\n\n`);
    const subscriber = (payload: unknown) => res.write(`event: device\ndata: ${String(payload)}\n\n`);
    statusSubscribers.add(subscriber);
    const heartbeat = setInterval(() => res.write(": keep-alive\n\n"), 25_000);
    req.on("close", () => {
      clearInterval(heartbeat);
      statusSubscribers.delete(subscriber);
    });
  });
}
