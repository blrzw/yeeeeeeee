import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import { revokeDevice, unrevokeDevice, upsertHeartbeat } from "./db";
import { requestScreenSession, decideScreenSession, endScreenSession } from "./screenRoutes";
import type { TrpcContext } from "./_core/context";

function createMockContext(role: "user" | "admin" = "admin"): TrpcContext {
  return {
    user: {
      id: 1,
      openId: "test-admin",
      name: "Maya Singh",
      email: "maya@acme.corp",
      loginMethod: "manus",
      role,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
    } as TrpcContext["res"],
  };
}

describe("devices and screen audit routers", () => {
  const testAgentId = "test-pc-agent-42";

  it("registers heartbeat and lists monitored device", async () => {
    await upsertHeartbeat({
      agentId: testAgentId,
      installToken: "token-123",
      hostname: "DESKTOP-OPS-01",
      username: "alice",
      platform: "Windows 11 Pro",
      cpuPercent: 24,
      memoryPercent: 48,
      diskPercent: 60,
    });

    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);
    const devices = await caller.devices.list();

    const matched = devices.find((d) => d.agentId === testAgentId);
    expect(matched).toBeDefined();
    expect(matched?.hostname).toBe("DESKTOP-OPS-01");
    expect(matched?.isRevoked).toBe(0);
  });

  it("creates screen session with operator identity and records audit trail", async () => {
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);

    const sessionRes = await caller.screen.request({ agentId: testAgentId });
    expect(sessionRes.sessionId).toBeDefined();
    expect(sessionRes.state).toBe("requested");

    // Employee approves
    const approved = await decideScreenSession(sessionRes.sessionId, true);
    expect(approved?.state).toBe("approved");
    expect(approved?.approvedAt).toBeGreaterThan(0);

    // Operator ends
    const ended = await caller.screen.end({ sessionId: sessionRes.sessionId });
    expect(ended.state).toBe("ended");

    // Check history
    const history = await caller.screen.history({ agentId: testAgentId });
    expect(history.length).toBeGreaterThan(0);
    const audit = history.find((h) => h.sessionId === sessionRes.sessionId);
    expect(audit).toBeDefined();
    expect(audit?.operatorName).toBe("Maya Singh");
    expect(audit?.state).toBe("ended");
    expect(audit?.approvedAt).toBeDefined();
    expect(audit?.endedAt).toBeDefined();
  });

  it("revokes and unrevokes device", async () => {
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);

    const revokeRes = await caller.devices.revoke({ agentId: testAgentId });
    expect(revokeRes.success).toBe(true);
    expect(revokeRes.device?.isRevoked).toBe(1);
    expect(revokeRes.device?.revokedBy).toBe("Maya Singh");

    // Requesting screen on revoked device should reject
    await expect(caller.screen.request({ agentId: testAgentId })).rejects.toThrow(
      "Device enrollment has been revoked"
    );

    // Unrevoke
    const unrevokeRes = await caller.devices.unrevoke({ agentId: testAgentId });
    expect(unrevokeRes.success).toBe(true);
    expect(unrevokeRes.device?.isRevoked).toBe(0);
  });
});
