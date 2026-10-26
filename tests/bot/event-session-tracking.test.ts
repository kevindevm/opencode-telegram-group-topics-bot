import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ensureTopicSessionTracked,
  extractTrackableSessionId,
} from "../../src/bot/event-session-tracking.js";
import { summaryAggregator } from "../../src/summary/aggregator.js";

const mocked = vi.hoisted(() => ({
  getTopicBindingBySessionIdMock: vi.fn(),
}));

vi.mock("../../src/topic/manager.js", () => ({
  getTopicBindingBySessionId: mocked.getTopicBindingBySessionIdMock,
}));

const BINDING = {
  scopeKey: "-100:664",
  chatId: -100,
  threadId: 664,
  sessionId: "ses-1",
  projectId: "p1",
  status: "abandoned",
};

describe("bot/event-session-tracking", () => {
  beforeEach(() => {
    mocked.getTopicBindingBySessionIdMock.mockReset();
    mocked.getTopicBindingBySessionIdMock.mockReturnValue(undefined);
    summaryAggregator.clear();
  });

  describe("extractTrackableSessionId", () => {
    it("reads flat sessionID payloads", () => {
      expect(
        extractTrackableSessionId({ type: "session.idle", properties: { sessionID: "ses-1" } }),
      ).toBe("ses-1");
    });

    it("reads nested info and part shapes", () => {
      expect(
        extractTrackableSessionId({
          type: "message.updated",
          properties: { info: { id: "msg-1", sessionID: "ses-1" } },
        }),
      ).toBe("ses-1");
      expect(
        extractTrackableSessionId({
          type: "message.part.updated",
          properties: { part: { id: "p-1", sessionID: "ses-1" } },
        }),
      ).toBe("ses-1");
    });

    it("reads session identity events by info id", () => {
      expect(
        extractTrackableSessionId({
          type: "session.created",
          properties: { info: { id: "ses-9" } },
        }),
      ).toBe("ses-9");
    });

    it("returns null without a session", () => {
      expect(extractTrackableSessionId({ type: "server.heartbeat", properties: {} })).toBeNull();
      expect(extractTrackableSessionId({ type: "x" })).toBeNull();
    });
  });

  describe("ensureTopicSessionTracked", () => {
    it("returns false when the event has no session", () => {
      expect(ensureTopicSessionTracked({ type: "server.heartbeat", properties: {} })).toBe(false);
      expect(mocked.getTopicBindingBySessionIdMock).not.toHaveBeenCalled();
    });

    it("returns false without a topic binding", () => {
      expect(
        ensureTopicSessionTracked({ type: "session.idle", properties: { sessionID: "ses-x" } }),
      ).toBe(false);
      expect(summaryAggregator.isTracked("ses-x")).toBe(false);
    });

    it("tracks a bound session and reports the transition", () => {
      mocked.getTopicBindingBySessionIdMock.mockReturnValue(BINDING);

      expect(
        ensureTopicSessionTracked({ type: "session.idle", properties: { sessionID: "ses-1" } }),
      ).toBe(true);
      expect(summaryAggregator.isTracked("ses-1")).toBe(true);
    });

    it("is a no-op when already tracked", () => {
      mocked.getTopicBindingBySessionIdMock.mockReturnValue(BINDING);
      summaryAggregator.setSession("ses-1");

      expect(
        ensureTopicSessionTracked({ type: "session.idle", properties: { sessionID: "ses-1" } }),
      ).toBe(false);
      expect(summaryAggregator.isTracked("ses-1")).toBe(true);
    });

    it("never tracks ephemeral subagent transcripts as roots", () => {
      mocked.getTopicBindingBySessionIdMock.mockReturnValue({ ...BINDING, ephemeral: true });

      expect(
        ensureTopicSessionTracked({ type: "session.idle", properties: { sessionID: "ses-1" } }),
      ).toBe(false);
      expect(summaryAggregator.isTracked("ses-1")).toBe(false);
    });
  });
});
