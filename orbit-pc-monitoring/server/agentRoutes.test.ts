import { describe, expect, it } from "vitest";
import { isValidAgentToken, parseHeartbeatPayload } from "./agentRoutes";

const validPayload = {
  agentId: "TEST-PC-orbit",
  installToken: "orbit-demo-enrollment-2026",
  hostname: "TEST-PC",
  username: "employee",
  platform: "Windows x64",
  osVersion: "Windows 11 24H2",
  hardwareModel: "Orbit Test PC",
  serialNumber: "TEST-SERIAL",
  ipAddress: "192.0.2.10",
  uptimeSeconds: 3600,
  agentVersion: "2.5.0",
  browserInventory: "[{\"name\":\"Microsoft Edge\",\"version\":\"128.0\"}]",
  cpuPercent: 20,
  memoryPercent: 45,
  diskPercent: 61,
};

describe("agent heartbeat contract", () => {
  it("accepts the configured enrollment token and rejects a wrong token", () => {
    expect(isValidAgentToken("orbit-demo-enrollment-2026")).toBe(true);
    expect(isValidAgentToken("wrong-token")).toBe(false);
    expect(isValidAgentToken(undefined)).toBe(false);
  });

  it("accepts a valid heartbeat payload", () => {
    expect(parseHeartbeatPayload(validPayload)).toMatchObject(validPayload);
  });

  it("rejects malformed or out-of-range telemetry", () => {
    expect(parseHeartbeatPayload({ ...validPayload, hostname: "" })).toBeNull();
    expect(parseHeartbeatPayload({ ...validPayload, cpuPercent: 140 })).toBeNull();
    expect(parseHeartbeatPayload({ ...validPayload, memoryPercent: "45" })).toBeNull();
  });
});
