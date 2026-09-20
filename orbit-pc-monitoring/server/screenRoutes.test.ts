import { describe, expect, it } from "vitest";
import { decideScreenSession, endScreenSession, getPendingScreenSession, getScreenSession, requestScreenSession, setScreenFrame } from "./screenRoutes";

describe("screen support sessions", () => {
  it("requires an approval transition before frames are accepted", () => {
    const agentId = `test-agent-${Date.now()}`;
    const session = requestScreenSession(agentId);
    expect(session.state).toBe("requested");
    expect(getPendingScreenSession(agentId)?.id).toBe(session.id);
    expect(setScreenFrame(session.id, Buffer.from("frame"))).toBe(false);

    expect(decideScreenSession(session.id, true)?.state).toBe("approved");
    expect(getPendingScreenSession(agentId)).toBeNull();
    expect(setScreenFrame(session.id, Buffer.from("frame"))).toBe(true);
    expect(getScreenSession(session.id)?.frame?.toString()).toBe("frame");

    expect(endScreenSession(session.id)?.state).toBe("ended");
    expect(setScreenFrame(session.id, Buffer.from("after-end"))).toBe(false);
  });

  it("keeps one active request per agent", () => {
    const agentId = `single-session-${Date.now()}`;
    const first = requestScreenSession(agentId);
    const second = requestScreenSession(agentId);
    expect(second.id).toBe(first.id);
    decideScreenSession(first.id, false);
  });

  it("stores administrator-selected quality and safety limits", () => {
    const session = requestScreenSession(`controlled-${Date.now()}`, { id: "operator", name: "Operator" }, {
      quality: "low",
      maxDurationSeconds: 120,
      maxBandwidthKbps: 256,
    });
    expect(session.quality).toBe("low");
    expect(session.maxDurationSeconds).toBe(120);
    expect(session.maxBandwidthKbps).toBe(256);
    endScreenSession(session.id);
  });
});
