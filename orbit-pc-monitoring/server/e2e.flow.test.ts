import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import { upsertHeartbeat, getMonitoredDevice, listSessionAudits } from "./db";
import { decideScreenSession, setScreenFrame, getScreenSession, endScreenSession } from "./screenRoutes";
import type { TrpcContext } from "./_core/context";

function createMockContext(name = "Maya Singh", role: "user" | "admin" = "admin"): TrpcContext {
  return {
    user: {
      id: 101,
      openId: "operator-maya",
      name,
      email: "maya@orbit-admin.local",
      loginMethod: "manus",
      role,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as TrpcContext["res"],
  };
}

describe("End-to-end Orbit remote support & audit flow", () => {
  const agentId = "WINDOWS-CORP-PC-01";

  it("completes full lifecycle: heartbeat -> request -> approve -> frame -> end -> audit -> revoke", async () => {
    // 1. Device sends heartbeat
    const device = await upsertHeartbeat({
      agentId,
      installToken: "orbit-demo-enrollment-2026",
      hostname: "FINANCE-LAPTOP-04",
      username: "alice.finance",
      platform: "Windows 11 Enterprise x64",
      cpuPercent: 18,
      memoryPercent: 42,
      diskPercent: 50,
    });
    expect(device).not.toBeNull();
    expect(device?.hostname).toBe("FINANCE-LAPTOP-04");

    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);

    // 2. PC appears in Client overview
    const devices = await caller.devices.list();
    const enrolled = devices.find((d) => d.agentId === agentId);
    expect(enrolled).toBeDefined();
    expect(enrolled?.status).toBe("online");

    // 3. Admin clicks Monitor -> initiates request
    const requestRes = await caller.screen.request({ agentId });
    expect(requestRes.sessionId).toBeDefined();
    expect(requestRes.state).toBe("requested");

    // 4. Employee prompt approved on Windows PC
    const decisionRes = decideScreenSession(requestRes.sessionId, true);
    expect(decisionRes?.state).toBe("approved");

    // 5. Streaming frame delivered
    const frameBuffer = Buffer.from("BM_BMP_MOCK_PIXELS");
    const frameAccepted = setScreenFrame(requestRes.sessionId, frameBuffer);
    expect(frameAccepted).toBe(true);

    const storedSession = getScreenSession(requestRes.sessionId);
    expect(storedSession?.frame?.toString()).toBe("BM_BMP_MOCK_PIXELS");

    // 6. Admin inspects session status
    const statusRes = await caller.screen.status({ sessionId: requestRes.sessionId });
    expect(statusRes.state).toBe("approved");
    expect(statusRes.operatorName).toBe("Maya Singh");

    // 7. Session ended
    const endRes = await caller.screen.end({ sessionId: requestRes.sessionId });
    expect(endRes.state).toBe("ended");

    // 8. Session history reflects operator, approval timestamp, and end timestamp
    const history = await caller.screen.history({ agentId });
    const auditRecord = history.find((h) => h.sessionId === requestRes.sessionId);
    expect(auditRecord).toBeDefined();
    expect(auditRecord?.operatorName).toBe("Maya Singh");
    expect(auditRecord?.approvedAt).toBeDefined();
    expect(auditRecord?.endedAt).toBeDefined();

    // 9. Admin revokes endpoint
    const revokeRes = await caller.devices.revoke({ agentId });
    expect(revokeRes.success).toBe(true);
    expect(revokeRes.device?.isRevoked).toBe(1);

    // 10. Subsequent screen request on revoked PC is blocked
    await expect(caller.screen.request({ agentId })).rejects.toThrow("Device enrollment has been revoked");

    // 11. Restore device enrollment
    const restoreRes = await caller.devices.unrevoke({ agentId });
    expect(restoreRes.success).toBe(true);
    expect(restoreRes.device?.isRevoked).toBe(0);
  });
});
