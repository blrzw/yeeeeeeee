/**
 * Remote command execution, file browser/pull, and PC control routes.
 * All agent-facing endpoints authenticate via x-orbit-agent-token.
 * All dashboard-facing endpoints go through tRPC (see routers.ts).
 */

import { raw, type Express, type Request, type Response } from "express";
import { nanoid } from "nanoid";
import { ENV } from "./_core/env";
import { getMonitoredDevice } from "./db";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RemoteCommand = {
  id: string;
  agentId: string;
  command: string;
  createdAt: number;
  /** null = pending, true = done, false = timed-out/error */
  done: boolean;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  completedAt: number | null;
};

export type FileListEntry = {
  name: string;
  path: string;
  isDirectory: boolean;
  size: number;
  modifiedAt: string;
};

export type FilePullRequest = {
  id: string;
  agentId: string;
  remotePath: string;
  createdAt: number;
  done: boolean;
  data: Buffer | null;
  fileName: string;
  errorMessage: string | null;
};

export type DirListRequest = {
  id: string;
  agentId: string;
  remotePath: string;
  createdAt: number;
  done: boolean;
  entries: FileListEntry[] | null;
  errorMessage: string | null;
};

export type ControlCommand = {
  id: string;
  agentId: string;
  action: "lock" | "logoff" | "screenshot";
  createdAt: number;
  done: boolean;
  screenshotData: Buffer | null;
  completedAt: number | null;
};

// ---------------------------------------------------------------------------
// In-memory stores (survive only for the server process lifetime)
// ---------------------------------------------------------------------------

// command id → RemoteCommand
const commandQueue = new Map<string, RemoteCommand>();
// file pull request id → FilePullRequest
const filePullQueue = new Map<string, FilePullRequest>();
// dir list request id → DirListRequest
const dirListQueue = new Map<string, DirListRequest>();
// control command id → ControlCommand
const controlQueue = new Map<string, ControlCommand>();

// agentId → list of command ids queued for it (FIFO)
const agentCommandIndex = new Map<string, string[]>();
// agentId → list of file pull ids queued for it (FIFO)
const agentFilePullIndex = new Map<string, string[]>();
// agentId → list of dir list ids queued for it (FIFO)
const agentDirListIndex = new Map<string, string[]>();
// agentId → list of control ids queued for it (FIFO)
const agentControlIndex = new Map<string, string[]>();

// Cleanup entries older than 30 minutes to prevent unbounded growth
function pruneOld<T extends { createdAt: number; done: boolean }>(
  store: Map<string, T>,
  maxAgeMs = 30 * 60 * 1000
) {
  const cutoff = Date.now() - maxAgeMs;
  for (const [key, val] of store.entries()) {
    if (val.createdAt < cutoff) store.delete(key);
  }
}

// ---------------------------------------------------------------------------
// Public API used by tRPC routers
// ---------------------------------------------------------------------------

export function queueRemoteCommand(agentId: string, command: string): RemoteCommand {
  pruneOld(commandQueue);
  const cmd: RemoteCommand = {
    id: nanoid(16),
    agentId,
    command,
    createdAt: Date.now(),
    done: false,
    stdout: "",
    stderr: "",
    exitCode: null,
    completedAt: null,
  };
  commandQueue.set(cmd.id, cmd);
  const list = agentCommandIndex.get(agentId) ?? [];
  list.push(cmd.id);
  agentCommandIndex.set(agentId, list);
  return cmd;
}

export function getRemoteCommand(id: string): RemoteCommand | null {
  return commandQueue.get(id) ?? null;
}

export function listRecentCommands(agentId: string, limit = 20): RemoteCommand[] {
  const ids = agentCommandIndex.get(agentId) ?? [];
  return ids
    .map((id) => commandQueue.get(id))
    .filter((cmd): cmd is RemoteCommand => cmd !== undefined)
    .slice(-limit)
    .reverse();
}

export function queueFilePull(agentId: string, remotePath: string): FilePullRequest {
  pruneOld(filePullQueue);
  const req: FilePullRequest = {
    id: nanoid(16),
    agentId,
    remotePath,
    createdAt: Date.now(),
    done: false,
    data: null,
    fileName: remotePath.split(/[\\/]/).pop() ?? "file",
    errorMessage: null,
  };
  filePullQueue.set(req.id, req);
  const list = agentFilePullIndex.get(agentId) ?? [];
  list.push(req.id);
  agentFilePullIndex.set(agentId, list);
  return req;
}

export function getFilePullRequest(id: string): FilePullRequest | null {
  return filePullQueue.get(id) ?? null;
}

export function queueDirList(agentId: string, remotePath: string): DirListRequest {
  pruneOld(dirListQueue);
  const req: DirListRequest = {
    id: nanoid(16),
    agentId,
    remotePath,
    createdAt: Date.now(),
    done: false,
    entries: null,
    errorMessage: null,
  };
  dirListQueue.set(req.id, req);
  const list = agentDirListIndex.get(agentId) ?? [];
  list.push(req.id);
  agentDirListIndex.set(agentId, list);
  return req;
}

export function getDirListRequest(id: string): DirListRequest | null {
  return dirListQueue.get(id) ?? null;
}

export function queueControlCommand(
  agentId: string,
  action: ControlCommand["action"]
): ControlCommand {
  pruneOld(controlQueue);
  const cmd: ControlCommand = {
    id: nanoid(16),
    agentId,
    action,
    createdAt: Date.now(),
    done: false,
    screenshotData: null,
    completedAt: null,
  };
  controlQueue.set(cmd.id, cmd);
  const list = agentControlIndex.get(agentId) ?? [];
  list.push(cmd.id);
  agentControlIndex.set(agentId, list);
  return cmd;
}

export function getControlCommand(id: string): ControlCommand | null {
  return controlQueue.get(id) ?? null;
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

export function registerCommandRoutes(app: Express) {
  // ── Command polling: agent calls this to pick up the next pending command ──
  app.get("/api/agent/command/pending", async (req: Request, res: Response) => {
    if (!requireAgentToken(req, res)) return;
    const agentId = String(req.query.agentId ?? "");
    const device = await getMonitoredDevice(agentId);
    if (device?.isRevoked) {
      res.json({ ok: true, command: null });
      return;
    }
    const ids = agentCommandIndex.get(agentId) ?? [];
    const pending = ids
      .map((id) => commandQueue.get(id))
      .find((cmd) => cmd && !cmd.done);
    if (!pending) {
      res.json({ ok: true, command: null });
      return;
    }
    res.json({ ok: true, command: { id: pending.id, command: pending.command } });
  });

  // ── Command result: agent posts stdout/stderr/exitCode back ──
  app.post("/api/agent/command/result", (req: Request, res: Response) => {
    if (!requireAgentToken(req, res)) return;
    const cmdId = String(req.header("x-orbit-cmd") ?? "");
    const cmd = commandQueue.get(cmdId);
    if (!cmd) {
      res.status(404).json({ ok: false, error: "Command not found" });
      return;
    }
    cmd.done = true;
    cmd.stdout = String(req.body?.stdout ?? "").slice(0, 64_000);
    cmd.stderr = String(req.body?.stderr ?? "").slice(0, 8_000);
    cmd.exitCode = typeof req.body?.exitCode === "number" ? req.body.exitCode : null;
    cmd.completedAt = Date.now();
    res.json({ ok: true });
  });

  // ── File pull polling: agent picks up a pending pull request ──
  app.get("/api/agent/files/pull/pending", async (req: Request, res: Response) => {
    if (!requireAgentToken(req, res)) return;
    const agentId = String(req.query.agentId ?? "");
    const device = await getMonitoredDevice(agentId);
    if (device?.isRevoked) {
      res.json({ ok: true, request: null });
      return;
    }
    const ids = agentFilePullIndex.get(agentId) ?? [];
    const pending = ids
      .map((id) => filePullQueue.get(id))
      .find((r) => r && !r.done);
    if (!pending) {
      res.json({ ok: true, request: null });
      return;
    }
    res.json({ ok: true, request: { id: pending.id, path: pending.remotePath } });
  });

  // ── File pull upload: agent posts raw file bytes ──
  app.post(
    "/api/agent/files/pull/upload",
    raw({ type: "*/*", limit: "50mb" }),
    (req: Request, res: Response) => {
      if (!requireAgentToken(req, res)) return;
      const pullId = String(req.header("x-orbit-pull") ?? "");
      const pullReq = filePullQueue.get(pullId);
      if (!pullReq) {
        res.status(404).json({ ok: false, error: "Pull request not found" });
        return;
      }
      const errorMsg = req.header("x-orbit-error");
      if (errorMsg) {
        pullReq.done = true;
        pullReq.errorMessage = errorMsg;
        res.json({ ok: true });
        return;
      }
      if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
        pullReq.done = true;
        pullReq.errorMessage = "Empty file received";
        res.json({ ok: true });
        return;
      }
      pullReq.done = true;
      pullReq.data = req.body;
      res.json({ ok: true });
    }
  );

  // ── Dir list polling: agent picks up a pending directory listing request ──
  app.get("/api/agent/files/list/pending", async (req: Request, res: Response) => {
    if (!requireAgentToken(req, res)) return;
    const agentId = String(req.query.agentId ?? "");
    const device = await getMonitoredDevice(agentId);
    if (device?.isRevoked) {
      res.json({ ok: true, request: null });
      return;
    }
    const ids = agentDirListIndex.get(agentId) ?? [];
    const pending = ids
      .map((id) => dirListQueue.get(id))
      .find((r) => r && !r.done);
    if (!pending) {
      res.json({ ok: true, request: null });
      return;
    }
    res.json({ ok: true, request: { id: pending.id, path: pending.remotePath } });
  });

  // ── Dir list result: agent posts the JSON entries array ──
  app.post("/api/agent/files/list/result", (req: Request, res: Response) => {
    if (!requireAgentToken(req, res)) return;
    const listId = String(req.header("x-orbit-list") ?? "");
    const listReq = dirListQueue.get(listId);
    if (!listReq) {
      res.status(404).json({ ok: false, error: "Dir list request not found" });
      return;
    }
    const errorMsg = req.body?.error;
    if (errorMsg) {
      listReq.done = true;
      listReq.errorMessage = String(errorMsg);
      res.json({ ok: true });
      return;
    }
    const entries: FileListEntry[] = Array.isArray(req.body?.entries)
      ? (req.body.entries as unknown[]).slice(0, 500).map((e: unknown) => {
          const entry = e as Record<string, unknown>;
          return {
            name: String(entry.name ?? ""),
            path: String(entry.path ?? ""),
            isDirectory: Boolean(entry.isDirectory),
            size: Number(entry.size ?? 0),
            modifiedAt: String(entry.modifiedAt ?? ""),
          };
        })
      : [];
    listReq.done = true;
    listReq.entries = entries;
    res.json({ ok: true });
  });

  // ── Control command polling: agent picks up a pending control action ──
  app.get("/api/agent/control/pending", async (req: Request, res: Response) => {
    if (!requireAgentToken(req, res)) return;
    const agentId = String(req.query.agentId ?? "");
    const device = await getMonitoredDevice(agentId);
    if (device?.isRevoked) {
      res.json({ ok: true, command: null });
      return;
    }
    const ids = agentControlIndex.get(agentId) ?? [];
    const pending = ids
      .map((id) => controlQueue.get(id))
      .find((cmd) => cmd && !cmd.done);
    if (!pending) {
      res.json({ ok: true, command: null });
      return;
    }
    res.json({ ok: true, command: { id: pending.id, action: pending.action } });
  });

  // ── Control result: agent posts completion (+ optional screenshot) ──
  app.post(
    "/api/agent/control/result",
    raw({ type: "image/bmp", limit: "8mb" }),
    (req: Request, res: Response) => {
      if (!requireAgentToken(req, res)) return;
      const ctrlId = String(req.header("x-orbit-ctrl") ?? "");
      const cmd = controlQueue.get(ctrlId);
      if (!cmd) {
        res.status(404).json({ ok: false, error: "Control command not found" });
        return;
      }
      cmd.done = true;
      cmd.completedAt = Date.now();
      if (Buffer.isBuffer(req.body) && req.body.length > 0) {
        cmd.screenshotData = req.body;
      }
      res.json({ ok: true });
    }
  );

  // ── Silent screenshot serve: dashboard fetches the BMP ──
  app.get("/api/control/:id/screenshot", (req: Request, res: Response) => {
    const cmd = controlQueue.get(req.params.id);
    if (!cmd || !cmd.done || !cmd.screenshotData) {
      res.status(404).end();
      return;
    }
    res.setHeader("Content-Type", "image/bmp");
    res.setHeader("Cache-Control", "no-store");
    res.send(cmd.screenshotData);
  });

  // ── Downloaded file serve: dashboard fetches the pulled file ──
  app.get("/api/files/:id/download", (req: Request, res: Response) => {
    const pullReq = filePullQueue.get(req.params.id);
    if (!pullReq || !pullReq.done || !pullReq.data) {
      res.status(404).end();
      return;
    }
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${pullReq.fileName.replace(/[^\w.-]/g, "_")}"`
    );
    res.setHeader("Content-Type", "application/octet-stream");
    res.setHeader("Cache-Control", "no-store");
    res.send(pullReq.data);
  });
}
