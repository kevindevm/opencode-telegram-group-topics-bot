import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Event } from "@opencode-ai/sdk/v2";
import { summaryAggregator } from "../../src/summary/aggregator.js";

const mocked = vi.hoisted(() => ({
  getCurrentProjectMock: vi.fn(),
}));

vi.mock("../../src/settings/manager.js", async () => {
  const actual = await vi.importActual<typeof import("../../src/settings/manager.js")>(
    "../../src/settings/manager.js",
  );

  return {
    ...actual,
    getCurrentProject: mocked.getCurrentProjectMock,
  };
});

describe("summary/aggregator", () => {
  beforeEach(() => {
    mocked.getCurrentProjectMock.mockReset();
    mocked.getCurrentProjectMock.mockReturnValue({ id: "p1", worktree: "D:/repo", name: "repo" });
    summaryAggregator.clear();
    summaryAggregator.setOnCleared(() => {});
    summaryAggregator.setOnTool(() => {});
    summaryAggregator.setOnToolFile(() => {});
    summaryAggregator.setOnMessageUpdated(() => {});
    summaryAggregator.setOnThinking(() => {});
    summaryAggregator.setOnSessionIdle(() => {});
    summaryAggregator.setOnSessionError(() => {});
    summaryAggregator.setOnSessionRetry(() => {});
  });

  it("invokes onCleared callback when aggregator is cleared", () => {
    const onCleared = vi.fn();
    summaryAggregator.setOnCleared(onCleared);

    summaryAggregator.clear();

    expect(onCleared).toHaveBeenCalledTimes(1);
  });

  it("includes sessionId in tool callback payload", () => {
    const onTool = vi.fn();
    summaryAggregator.setOnTool(onTool);
    summaryAggregator.setSession("session-1");

    summaryAggregator.processEvent({
      type: "message.updated",
      properties: {
        info: {
          id: "message-1",
          sessionID: "session-1",
          role: "assistant",
          time: { created: Date.now() },
        },
      },
    } as unknown as Event);

    summaryAggregator.processEvent({
      type: "message.part.updated",
      properties: {
        part: {
          id: "part-1",
          sessionID: "session-1",
          messageID: "message-1",
          type: "tool",
          callID: "call-1",
          tool: "bash",
          state: {
            status: "completed",
            input: {
              command: "npm test",
            },
            metadata: {},
          },
        },
      },
    } as unknown as Event);

    expect(onTool).toHaveBeenCalledTimes(1);
    expect(onTool.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        sessionId: "session-1",
        callId: "call-1",
        tool: "bash",
        hasFileAttachment: false,
        state: expect.objectContaining({ status: "completed" }),
      }),
    );
  });

  it("streams assistant text snapshots while a message is in progress", () => {
    const onMessageUpdated = vi.fn();
    summaryAggregator.setOnMessageUpdated(onMessageUpdated);
    summaryAggregator.setSession("session-1");

    summaryAggregator.processEvent({
      type: "message.updated",
      properties: {
        info: {
          id: "message-stream",
          sessionID: "session-1",
          role: "assistant",
          time: { created: Date.now() },
        },
      },
    } as unknown as Event);

    summaryAggregator.processEvent({
      type: "message.part.updated",
      properties: {
        part: {
          id: "part-stream-1",
          sessionID: "session-1",
          messageID: "message-stream",
          type: "text",
          text: "Hello",
          time: { start: Date.now() },
        },
      },
    } as unknown as Event);

    summaryAggregator.processEvent({
      type: "message.part.updated",
      properties: {
        part: {
          id: "part-stream-2",
          sessionID: "session-1",
          messageID: "message-stream",
          type: "text",
          text: " world",
          time: { start: Date.now() },
        },
      },
    } as unknown as Event);

    expect(onMessageUpdated.mock.calls).toEqual([
      ["session-1", "message-stream", "Hello"],
      ["session-1", "message-stream", "Hello world"],
    ]);
  });

  it("emits tool updates for running and error states once each", () => {    const onTool = vi.fn();
    summaryAggregator.setOnTool(onTool);
    summaryAggregator.setSession("session-1");

    summaryAggregator.processEvent({
      type: "message.updated",
      properties: {
        info: {
          id: "message-tool-states",
          sessionID: "session-1",
          role: "assistant",
          time: { created: Date.now() },
        },
      },
    } as unknown as Event);

    const runningEvent = {
      type: "message.part.updated",
      properties: {
        part: {
          id: "part-tool-running",
          sessionID: "session-1",
          messageID: "message-tool-states",
          type: "tool",
          callID: "call-tool-states",
          tool: "bash",
          state: {
            status: "running",
            input: { command: "npm test" },
            metadata: {},
          },
        },
      },
    } as unknown as Event;

    summaryAggregator.processEvent(runningEvent);
    summaryAggregator.processEvent(runningEvent);
    summaryAggregator.processEvent({
      type: "message.part.updated",
      properties: {
        part: {
          id: "part-tool-error",
          sessionID: "session-1",
          messageID: "message-tool-states",
          type: "tool",
          callID: "call-tool-states",
          tool: "bash",
          state: {
            status: "error",
            input: { command: "npm test" },
            metadata: {},
          },
        },
      },
    } as unknown as Event);

    expect(onTool).toHaveBeenCalledTimes(2);
    expect(onTool.mock.calls[0][0]).toEqual(
      expect.objectContaining({ state: expect.objectContaining({ status: "running" }) }),
    );
    expect(onTool.mock.calls[1][0]).toEqual(
      expect.objectContaining({ state: expect.objectContaining({ status: "error" }) }),
    );
  });

  it("tracks subagent lifecycle for child sessions", () => {
    const onSubagent = vi.fn();
    summaryAggregator.setOnSubagent(onSubagent);
    summaryAggregator.setSession("root-session");

    summaryAggregator.processEvent({
      type: "message.part.updated",
      properties: {
        part: {
          id: "subtask-1",
          sessionID: "root-session",
          messageID: "message-1",
          type: "subtask",
          agent: "explore",
          description: "Inspect sync conflicts",
          prompt: "Inspect sync conflicts",
          command: "/fork-sync",
        },
      },
    } as unknown as Event);

    summaryAggregator.processEvent({
      type: "session.created",
      properties: {
        info: {
          id: "child-session",
          parentID: "root-session",
          title: "Inspect sync conflicts (@explore subagent)",
        },
      },
    } as unknown as Event);

    summaryAggregator.processEvent({
      type: "message.part.updated",
      properties: {
        part: {
          id: "child-tool-1",
          sessionID: "child-session",
          messageID: "child-message-1",
          type: "tool",
          callID: "child-call-1",
          tool: "read",
          state: {
            status: "running",
            input: { filePath: "src/summary/aggregator.ts" },
            metadata: {},
          },
        },
      },
    } as unknown as Event);

    summaryAggregator.processEvent({
      type: "session.idle",
      properties: {
        sessionID: "child-session",
      },
    } as unknown as Event);

    const lastCall = onSubagent.mock.calls[onSubagent.mock.calls.length - 1]?.[1];
    expect(lastCall).toEqual([
      expect.objectContaining({
        sessionId: "child-session",
        parentSessionId: "root-session",
        agent: "explore",
        description: "Inspect sync conflicts",
        status: "completed",
      }),
    ]);
  });

  it("marks child session subagents as failed on session.error", () => {
    const onSubagent = vi.fn();
    summaryAggregator.setOnSubagent(onSubagent);
    summaryAggregator.setSession("root-session");

    summaryAggregator.processEvent({
      type: "session.created",
      properties: {
        info: {
          id: "child-session",
          parentID: "root-session",
          title: "Investigate (@general subagent)",
        },
      },
    } as unknown as Event);

    summaryAggregator.processEvent({
      type: "session.error",
      properties: {
        sessionID: "child-session",
        error: { message: "subagent crashed" },
      },
    } as unknown as Event);

    const lastCall = onSubagent.mock.calls[onSubagent.mock.calls.length - 1]?.[1];
    expect(lastCall).toEqual([
      expect.objectContaining({
        sessionId: "child-session",
        status: "error",
        terminalMessage: "subagent crashed",
      }),
    ]);
  });

  it("streams child assistant text under the child session id", () => {
    const onMessageUpdated = vi.fn();
    summaryAggregator.setOnMessageUpdated(onMessageUpdated);
    summaryAggregator.setSession("root-session");

    summaryAggregator.processEvent({
      type: "session.created",
      properties: {
        info: { id: "child-session", parentID: "root-session", title: "Explore (@explore subagent)" },
      },
    } as unknown as Event);

    summaryAggregator.processEvent({
      type: "message.updated",
      properties: {
        info: {
          id: "child-message-1",
          sessionID: "child-session",
          role: "assistant",
          time: { created: Date.now() },
        },
      },
    } as unknown as Event);

    summaryAggregator.processEvent({
      type: "message.part.updated",
      properties: {
        part: {
          id: "child-text-1",
          sessionID: "child-session",
          messageID: "child-message-1",
          type: "text",
          text: "hello from child",
          time: { start: Date.now() },
        },
      },
    } as unknown as Event);

    const lastCall = onMessageUpdated.mock.calls[onMessageUpdated.mock.calls.length - 1];
    expect(lastCall).toEqual(["child-session", "child-message-1", "hello from child"]);
  });

  it("dispatches child tool updates for transcript topics", () => {
    const onTool = vi.fn();
    summaryAggregator.setOnTool(onTool);
    summaryAggregator.setSession("root-session");

    summaryAggregator.processEvent({
      type: "session.created",
      properties: {
        info: { id: "child-session", parentID: "root-session", title: "Explore (@explore subagent)" },
      },
    } as unknown as Event);

    summaryAggregator.processEvent({
      type: "message.part.updated",
      properties: {
        part: {
          id: "child-tool-1",
          sessionID: "child-session",
          messageID: "child-message-1",
          type: "tool",
          callID: "child-call-1",
          tool: "read",
          state: {
            status: "running",
            input: { filePath: "src/index.ts" },
            metadata: {},
          },
        },
      },
    } as unknown as Event);

    expect(onTool).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: "child-session", tool: "read" }),
    );
  });

  it("routes child questions and permissions to their own topic flow", () => {
    const onQuestion = vi.fn();
    const onPermission = vi.fn();
    summaryAggregator.setOnQuestion(onQuestion);
    summaryAggregator.setOnPermission(onPermission);
    summaryAggregator.setSession("root-session");

    summaryAggregator.processEvent({
      type: "session.created",
      properties: {
        info: { id: "child-session", parentID: "root-session", title: "Ask (@ask subagent)" },
      },
    } as unknown as Event);

    summaryAggregator.processEvent({
      type: "question.asked",
      properties: {
        id: "q-child-1",
        sessionID: "child-session",
        questions: [{ question: "Proceed?", header: "Confirm", options: [] }],
      },
    } as unknown as Event);

    summaryAggregator.processEvent({
      type: "permission.asked",
      properties: {
        id: "p-child-1",
        sessionID: "child-session",
        permission: "read",
        patterns: ["src/**"],
      },
    } as unknown as Event);

    expect(onQuestion).toHaveBeenCalledWith(
      "child-session",
      expect.anything(),
      "q-child-1",
    );
    expect(onPermission).toHaveBeenCalledWith(
      expect.objectContaining({ sessionID: "child-session" }),
    );
  });

  it("replays child text that arrived before session.created", () => {
    const onMessageUpdated = vi.fn();
    summaryAggregator.setOnMessageUpdated(onMessageUpdated);
    summaryAggregator.setSession("root-session");

    // Text delta wins the race against session.created.
    summaryAggregator.processEvent({
      type: "message.part.delta",
      properties: {
        sessionID: "child-session",
        messageID: "child-message-race",
        partID: "child-text-race",
        field: "text",
        delta: "early hello",
      },
    } as unknown as Event);

    expect(onMessageUpdated).not.toHaveBeenCalled();

    summaryAggregator.processEvent({
      type: "session.created",
      properties: {
        info: { id: "child-session", parentID: "root-session", title: "Race (@explore subagent)" },
      },
    } as unknown as Event);

    const lastCall = onMessageUpdated.mock.calls[onMessageUpdated.mock.calls.length - 1];
    expect(lastCall).toEqual(["child-session", "child-message-race", "early hello"]);
  });

  it("tracks grandchild sessions under their child parent", () => {
    const onMessageUpdated = vi.fn();
    summaryAggregator.setOnMessageUpdated(onMessageUpdated);
    summaryAggregator.setSession("root-session");

    summaryAggregator.processEvent({
      type: "session.created",
      properties: {
        info: { id: "child-session", parentID: "root-session", title: "Mid (@explore subagent)" },
      },
    } as unknown as Event);

    summaryAggregator.processEvent({
      type: "session.created",
      properties: {
        info: { id: "grandchild-session", parentID: "child-session", title: "Leaf (@plan subagent)" },
      },
    } as unknown as Event);

    summaryAggregator.processEvent({
      type: "message.updated",
      properties: {
        info: {
          id: "grandchild-message-1",
          sessionID: "grandchild-session",
          role: "assistant",
          time: { created: Date.now() },
        },
      },
    } as unknown as Event);

    summaryAggregator.processEvent({
      type: "message.part.updated",
      properties: {
        part: {
          id: "grandchild-text-1",
          sessionID: "grandchild-session",
          messageID: "grandchild-message-1",
          type: "text",
          text: "deep hello",
          time: { start: Date.now() },
        },
      },
    } as unknown as Event);

    const lastCall = onMessageUpdated.mock.calls[onMessageUpdated.mock.calls.length - 1];
    expect(lastCall).toEqual(["grandchild-session", "grandchild-message-1", "deep hello"]);
  });

  it("does not guess unknown child-session ownership when multiple pending subagents exist", () => {
    const onSubagent = vi.fn();
    summaryAggregator.setOnSubagent(onSubagent);
    summaryAggregator.setSession("root-a");
    summaryAggregator.setSession("root-b");

    summaryAggregator.processEvent({
      type: "message.part.updated",
      properties: {
        part: {
          id: "subtask-a",
          sessionID: "root-a",
          messageID: "message-a",
          type: "subtask",
          agent: "explore",
          description: "Task A",
          prompt: "Task A",
        },
      },
    } as unknown as Event);

    summaryAggregator.processEvent({
      type: "message.part.updated",
      properties: {
        part: {
          id: "subtask-b",
          sessionID: "root-b",
          messageID: "message-b",
          type: "subtask",
          agent: "general",
          description: "Task B",
          prompt: "Task B",
        },
      },
    } as unknown as Event);

    summaryAggregator.processEvent({
      type: "message.updated",
      properties: {
        info: {
          id: "child-message",
          sessionID: "child-unknown",
          role: "assistant",
          providerID: "openai",
          modelID: "gpt-5",
          time: { created: Date.now() },
        },
      },
    } as unknown as Event);

    const rootACall = onSubagent.mock.calls.find((call) => call[0] === "root-a");
    const rootBCall = onSubagent.mock.calls.find((call) => call[0] === "root-b");

    expect(rootACall?.[1]).toEqual([
      expect.objectContaining({
        sessionId: null,
        parentSessionId: "root-a",
        description: "Task A",
      }),
    ]);
    expect(rootBCall?.[1]).toEqual([
      expect.objectContaining({
        sessionId: null,
        parentSessionId: "root-b",
        description: "Task B",
      }),
    ]);
  });

  it("marks write tool without file attachment when payload is oversized", () => {
    const onTool = vi.fn();
    const onToolFile = vi.fn();
    summaryAggregator.setOnTool(onTool);
    summaryAggregator.setOnToolFile(onToolFile);
    summaryAggregator.setSession("session-1");

    summaryAggregator.processEvent({
      type: "message.updated",
      properties: {
        info: {
          id: "message-oversized",
          sessionID: "session-1",
          role: "assistant",
          time: { created: Date.now() },
        },
      },
    } as unknown as Event);

    summaryAggregator.processEvent({
      type: "message.part.updated",
      properties: {
        part: {
          id: "part-oversized",
          sessionID: "session-1",
          messageID: "message-oversized",
          type: "tool",
          callID: "call-oversized",
          tool: "write",
          state: {
            status: "completed",
            input: {
              filePath: "src/huge.ts",
              content: "x".repeat(101 * 1024),
            },
            metadata: {},
          },
        },
      },
    } as unknown as Event);

    expect(onTool).toHaveBeenCalledTimes(1);
    expect(onTool.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        tool: "write",
        hasFileAttachment: false,
      }),
    );
    expect(onToolFile).not.toHaveBeenCalled();
  });

  it("passes sessionId to thinking callback when reasoning part arrives", async () => {
    const onThinking = vi.fn();
    summaryAggregator.setOnThinking(onThinking);
    summaryAggregator.setSession("session-1");

    summaryAggregator.processEvent({
      type: "message.updated",
      properties: {
        info: {
          id: "message-1",
          sessionID: "session-1",
          role: "assistant",
          time: { created: Date.now() },
        },
      },
    } as unknown as Event);

    summaryAggregator.processEvent({
      type: "message.part.updated",
      properties: {
        part: {
          id: "part-reasoning-1",
          sessionID: "session-1",
          messageID: "message-1",
          type: "reasoning",
          text: "Let me think about this...",
          time: { start: Date.now() },
        },
      },
    } as unknown as Event);

    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(onThinking).toHaveBeenCalledWith("session-1");
  });

  it("does not send thinking callback when no reasoning part arrives", async () => {
    const onThinking = vi.fn();
    summaryAggregator.setOnThinking(onThinking);
    summaryAggregator.setSession("session-1");

    // Only a message.updated event without any reasoning part — should NOT trigger thinking
    summaryAggregator.processEvent({
      type: "message.updated",
      properties: {
        info: {
          id: "message-no-reasoning",
          sessionID: "session-1",
          role: "assistant",
          time: { created: Date.now() },
        },
      },
    } as unknown as Event);

    summaryAggregator.processEvent({
      type: "message.part.updated",
      properties: {
        part: {
          id: "part-text-1",
          sessionID: "session-1",
          messageID: "message-no-reasoning",
          type: "text",
          text: "Here is my answer.",
          time: { start: Date.now() },
        },
      },
    } as unknown as Event);

    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(onThinking).not.toHaveBeenCalled();
  });

  it("fires thinking callback only once per message even with multiple reasoning parts", async () => {
    const onThinking = vi.fn();
    summaryAggregator.setOnThinking(onThinking);
    summaryAggregator.setSession("session-1");

    summaryAggregator.processEvent({
      type: "message.updated",
      properties: {
        info: {
          id: "message-multi-reasoning",
          sessionID: "session-1",
          role: "assistant",
          time: { created: Date.now() },
        },
      },
    } as unknown as Event);

    for (let i = 0; i < 3; i++) {
      summaryAggregator.processEvent({
        type: "message.part.updated",
        properties: {
          part: {
            id: `part-reasoning-${i}`,
            sessionID: "session-1",
            messageID: "message-multi-reasoning",
            type: "reasoning",
            text: `Thinking step ${i}`,
            time: { start: Date.now() },
          },
        },
      } as unknown as Event);
    }

    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(onThinking).toHaveBeenCalledTimes(1);
    expect(onThinking).toHaveBeenCalledWith("session-1");
  });

  it("reports session.error message through callback", async () => {
    const onSessionError = vi.fn();
    summaryAggregator.setOnSessionError(onSessionError);
    summaryAggregator.setSession("session-1");

    summaryAggregator.processEvent({
      type: "session.error",
      properties: {
        sessionID: "session-1",
        error: {
          name: "UnknownError",
          data: {
            message: "Model not found: opencode/foo.",
          },
        },
      },
    } as unknown as Event);

    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(onSessionError).toHaveBeenCalledWith("session-1", "Model not found: opencode/foo.");
  });

  it("reports assistant cost with completed message tokens", () => {
    const onTokens = vi.fn();
    summaryAggregator.setOnTokens(onTokens);
    summaryAggregator.setSession("session-1");

    summaryAggregator.processEvent({
      type: "message.updated",
      properties: {
        info: {
          id: "message-cost",
          sessionID: "session-1",
          role: "assistant",
          cost: 0.01234,
          tokens: {
            input: 123,
            output: 45,
            reasoning: 6,
            cache: { read: 7, write: 8 },
          },
          time: { created: Date.now(), completed: Date.now() },
        },
      },
    } as unknown as Event);

    expect(onTokens).toHaveBeenCalledWith(
      "session-1",
      expect.objectContaining({
        input: 123,
        output: 45,
        reasoning: 6,
        cacheRead: 7,
        cacheWrite: 8,
        cost: 0.01234,
      }),
    );
  });

  it("falls back to step-finish cost when message summary cost is missing", () => {
    const onTokens = vi.fn();
    summaryAggregator.setOnTokens(onTokens);
    summaryAggregator.setSession("session-1");

    summaryAggregator.processEvent({
      type: "message.updated",
      properties: {
        info: {
          id: "message-step-cost",
          sessionID: "session-1",
          role: "assistant",
          time: { created: Date.now() },
        },
      },
    } as unknown as Event);

    summaryAggregator.processEvent({
      type: "message.part.updated",
      properties: {
        part: {
          id: "part-step-finish",
          sessionID: "session-1",
          messageID: "message-step-cost",
          type: "step-finish",
          reason: "done",
          cost: 0.0042,
          tokens: {
            input: 10,
            output: 11,
            reasoning: 12,
            cache: { read: 13, write: 14 },
          },
        },
      },
    } as unknown as Event);

    summaryAggregator.processEvent({
      type: "message.updated",
      properties: {
        info: {
          id: "message-step-cost",
          sessionID: "session-1",
          role: "assistant",
          tokens: {
            input: 123,
            output: 45,
            reasoning: 6,
            cache: { read: 7, write: 8 },
          },
          time: { created: Date.now(), completed: Date.now() },
        },
      },
    } as unknown as Event);

    expect(onTokens).toHaveBeenCalledWith("session-1", expect.objectContaining({ cost: 0.0042 }));
  });

  it("emits the full assistant message across all text parts", async () => {
    vi.useFakeTimers();
    const onComplete = vi.fn();
    summaryAggregator.setOnComplete(onComplete);
    summaryAggregator.setSession("session-1");

    summaryAggregator.processEvent({
      type: "message.updated",
      properties: {
        info: {
          id: "message-1",
          sessionID: "session-1",
          role: "assistant",
          time: { created: Date.now() },
        },
      },
    } as unknown as Event);

    summaryAggregator.processEvent({
      type: "message.part.updated",
      properties: {
        part: {
          id: "part-1",
          sessionID: "session-1",
          messageID: "message-1",
          type: "text",
          text: "Hello ",
          time: { start: Date.now() },
        },
      },
    } as unknown as Event);

    summaryAggregator.processEvent({
      type: "message.part.updated",
      properties: {
        part: {
          id: "part-2",
          sessionID: "session-1",
          messageID: "message-1",
          type: "text",
          text: "world!",
          time: { start: Date.now() },
        },
      },
    } as unknown as Event);

    summaryAggregator.processEvent({
      type: "message.updated",
      properties: {
        info: {
          id: "message-1",
          sessionID: "session-1",
          role: "assistant",
          time: { created: Date.now(), completed: Date.now() },
        },
      },
    } as unknown as Event);

    await vi.advanceTimersByTimeAsync(100);

    expect(onComplete).toHaveBeenCalledWith("session-1", "message-1", "Hello world!");

    vi.useRealTimers();
  });

  it("waits for trailing text parts after message completion before emitting final text", async () => {
    vi.useFakeTimers();
    const onComplete = vi.fn();
    summaryAggregator.setOnComplete(onComplete);
    summaryAggregator.setSession("session-1");

    summaryAggregator.processEvent({
      type: "message.updated",
      properties: {
        info: {
          id: "message-2",
          sessionID: "session-1",
          role: "assistant",
          time: { created: Date.now() },
        },
      },
    } as unknown as Event);

    summaryAggregator.processEvent({
      type: "message.part.updated",
      properties: {
        part: {
          id: "part-a",
          sessionID: "session-1",
          messageID: "message-2",
          type: "text",
          text: "First",
          time: { start: Date.now() },
        },
      },
    } as unknown as Event);

    summaryAggregator.processEvent({
      type: "message.updated",
      properties: {
        info: {
          id: "message-2",
          sessionID: "session-1",
          role: "assistant",
          time: { created: Date.now(), completed: Date.now() },
        },
      },
    } as unknown as Event);

    await vi.advanceTimersByTimeAsync(50);

    summaryAggregator.processEvent({
      type: "message.part.updated",
      properties: {
        part: {
          id: "part-b",
          sessionID: "session-1",
          messageID: "message-2",
          type: "text",
          text: " second",
          time: { start: Date.now() },
        },
      },
    } as unknown as Event);

    await vi.advanceTimersByTimeAsync(100);

    expect(onComplete).toHaveBeenCalledWith("session-1", "message-2", "First second");

    vi.useRealTimers();
  });

  it("reports session.idle through callback", async () => {
    const onSessionIdle = vi.fn();
    summaryAggregator.setOnSessionIdle(onSessionIdle);
    summaryAggregator.setSession("session-1");

    summaryAggregator.processEvent({
      type: "session.idle",
      properties: {
        sessionID: "session-1",
      },
    } as unknown as Event);

    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(onSessionIdle).toHaveBeenCalledWith("session-1");
  });

  it("keeps other typing indicators active when one session becomes idle", async () => {
    vi.useFakeTimers();
    const onTyping = vi.fn();
    summaryAggregator.setOnTypingIndicator(onTyping);
    summaryAggregator.setSession("session-1");
    summaryAggregator.setSession("session-2");

    const now = Date.now();
    summaryAggregator.processEvent({
      type: "message.updated",
      properties: {
        info: {
          id: "message-1",
          sessionID: "session-1",
          role: "assistant",
          time: { created: now },
        },
      },
    } as unknown as Event);

    summaryAggregator.processEvent({
      type: "message.updated",
      properties: {
        info: {
          id: "message-2",
          sessionID: "session-2",
          role: "assistant",
          time: { created: now },
        },
      },
    } as unknown as Event);

    onTyping.mockClear();

    summaryAggregator.processEvent({
      type: "session.idle",
      properties: {
        sessionID: "session-1",
      },
    } as unknown as Event);

    await vi.advanceTimersByTimeAsync(4000);

    expect(onTyping).toHaveBeenCalledWith("session-1");
    expect(onTyping).toHaveBeenCalledWith("session-2");

    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it("reports session.status retry through callback", async () => {
    const onSessionRetry = vi.fn();
    summaryAggregator.setOnSessionRetry(onSessionRetry);
    summaryAggregator.setSession("session-1");

    summaryAggregator.processEvent({
      type: "session.status",
      properties: {
        sessionID: "session-1",
        status: {
          type: "retry",
          attempt: 2,
          message: "Your current subscription plan does not yet include access to GLM-5",
          next: 1772203141283,
        },
      },
    } as unknown as Event);

    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(onSessionRetry).toHaveBeenCalledWith({
      sessionId: "session-1",
      attempt: 2,
      message: "Your current subscription plan does not yet include access to GLM-5",
      next: 1772203141283,
    });
  });

  it("sends apply_patch payload as tool file", () => {
    const onToolFile = vi.fn();
    summaryAggregator.setOnToolFile(onToolFile);
    summaryAggregator.setSession("session-1");

    summaryAggregator.processEvent({
      type: "message.updated",
      properties: {
        info: {
          id: "message-1",
          sessionID: "session-1",
          role: "assistant",
          time: { created: Date.now() },
        },
      },
    } as unknown as Event);

    summaryAggregator.processEvent({
      type: "message.part.updated",
      properties: {
        part: {
          id: "part-1",
          sessionID: "session-1",
          messageID: "message-1",
          type: "tool",
          callID: "call-apply-patch",
          tool: "apply_patch",
          state: {
            status: "completed",
            input: {
              patchText: "irrelevant for formatter in this path",
            },
            metadata: {
              filediff: {
                file: "D:/repo/src/one.ts",
                additions: 2,
                deletions: 1,
              },
              diff: [
                "@@ -1,2 +1,3 @@",
                "--- a/src/one.ts",
                "+++ b/src/one.ts",
                " old",
                "-before",
                "+after",
                "+extra",
              ].join("\n"),
            },
          },
        },
      },
    } as unknown as Event);

    expect(onToolFile).toHaveBeenCalledTimes(1);

    const filePayload = onToolFile.mock.calls[0][0] as {
      sessionId: string;
      tool: string;
      hasFileAttachment: boolean;
      files: Array<{
        fileData: {
          filename: string;
          buffer: Buffer;
        } | null;
        line?: string;
      }>;
    };

    expect(filePayload.sessionId).toBe("session-1");
    expect(filePayload.tool).toBe("apply_patch");
    expect(filePayload.hasFileAttachment).toBe(true);
    expect(filePayload.files).toHaveLength(1);
    expect(filePayload.files[0]?.fileData?.filename).toBe("edit_one.ts.diff");
    expect(filePayload.files[0]?.fileData?.buffer.toString("utf8")).toContain(
      "Edit File/Path: src/one.ts",
    );
  });

  it("sends apply_patch file using title and patchText fallback", () => {
    const onToolFile = vi.fn();
    summaryAggregator.setOnToolFile(onToolFile);
    summaryAggregator.setSession("session-1");

    summaryAggregator.processEvent({
      type: "message.updated",
      properties: {
        info: {
          id: "message-2",
          sessionID: "session-1",
          role: "assistant",
          time: { created: Date.now() },
        },
      },
    } as unknown as Event);

    summaryAggregator.processEvent({
      type: "message.part.updated",
      properties: {
        part: {
          id: "part-2",
          sessionID: "session-1",
          messageID: "message-2",
          type: "tool",
          callID: "call-apply-patch-fallback",
          tool: "apply_patch",
          state: {
            status: "completed",
            title: "Success. Updated the following files:\nM README.md",
            input: {
              patchText: [
                "--- a/README.md",
                "+++ b/README.md",
                "@@ -1,1 +1,2 @@",
                " old",
                "+new",
              ].join("\n"),
            },
            metadata: {},
          },
        },
      },
    } as unknown as Event);

    expect(onToolFile).toHaveBeenCalledTimes(1);

    const filePayload = onToolFile.mock.calls[0][0] as {
      hasFileAttachment: boolean;
      files: Array<{
        fileData: {
          filename: string;
          buffer: Buffer;
        } | null;
      }>;
    };

    expect(filePayload.hasFileAttachment).toBe(true);
    expect(filePayload.files).toHaveLength(1);
    expect(filePayload.files[0]?.fileData?.filename).toBe("edit_README.md.diff");
    expect(filePayload.files[0]?.fileData?.buffer.toString("utf8")).toContain(
      "Edit File/Path: README.md",
    );
  });

  it("limits apply_patch fallback attachment content to the matched file section", () => {
    const onToolFile = vi.fn();
    summaryAggregator.setOnToolFile(onToolFile);
    summaryAggregator.setSession("session-1");

    summaryAggregator.processEvent({
      type: "message.updated",
      properties: {
        info: {
          id: "message-3",
          sessionID: "session-1",
          role: "assistant",
          time: { created: Date.now() },
        },
      },
    } as unknown as Event);

    summaryAggregator.processEvent({
      type: "message.part.updated",
      properties: {
        part: {
          id: "part-3",
          sessionID: "session-1",
          messageID: "message-3",
          type: "tool",
          callID: "call-apply-patch-multifile",
          tool: "apply_patch",
          state: {
            status: "completed",
            title: "Success. Updated the following files:\nM README.md\nM src/one.ts",
            input: {
              patchText: [
                "*** Begin Patch",
                "*** Update File: README.md",
                "@@",
                "-old readme",
                "+new readme",
                "*** Update File: src/one.ts",
                "@@",
                "-old code",
                "+new code",
                "*** End Patch",
              ].join("\n"),
            },
            metadata: {
              filediff: {
                file: "README.md",
                additions: 1,
                deletions: 1,
              },
            },
          },
        },
      },
    } as unknown as Event);

    expect(onToolFile).toHaveBeenCalledTimes(1);

    const filePayload = onToolFile.mock.calls[0][0] as {
      files: Array<{
        fileData: {
          filename: string;
          buffer: Buffer;
        } | null;
      }>;
    };

    const content = filePayload.files[0]?.fileData?.buffer.toString("utf8") ?? "";
    expect(filePayload.files).toHaveLength(1);
    expect(filePayload.files[0]?.fileData?.filename).toBe("edit_README.md.diff");
    expect(content).toContain("Edit File/Path: README.md");
    expect(content).toContain("new readme");
    expect(content).not.toContain("src/one.ts");
    expect(content).not.toContain("new code");
  });

  it("sends one line and one document per file for apply_patch metadata.files", () => {
    const onToolFile = vi.fn();
    summaryAggregator.setOnToolFile(onToolFile);
    summaryAggregator.setSession("session-1");

    summaryAggregator.processEvent({
      type: "message.updated",
      properties: {
        info: {
          id: "message-4",
          sessionID: "session-1",
          role: "assistant",
          time: { created: Date.now() },
        },
      },
    } as unknown as Event);

    summaryAggregator.processEvent({
      type: "message.part.updated",
      properties: {
        part: {
          id: "part-4",
          sessionID: "session-1",
          messageID: "message-4",
          type: "tool",
          callID: "call-apply-patch-files",
          tool: "apply_patch",
          state: {
            status: "completed",
            metadata: {
              files: [
                {
                  filePath: "src/a.ts",
                  diff: ["@@ -1,1 +1,2 @@", " old", "+new"].join("\n"),
                },
                {
                  relativePath: "src/b.ts",
                  patch: ["@@ -1,1 +1,2 @@", " old", "+new"].join("\n"),
                },
              ],
            },
          },
        },
      },
    } as unknown as Event);

    expect(onToolFile).toHaveBeenCalledTimes(1);

    const filePayload = onToolFile.mock.calls[0][0] as {
      hasFileAttachment: boolean;
      files: Array<{
        fileData: { filename: string; buffer: Buffer } | null;
        line?: string;
      }>;
    };

    expect(filePayload.hasFileAttachment).toBe(true);
    expect(filePayload.files).toHaveLength(2);
    expect(filePayload.files[0]?.line).toBe("🩹 apply_patch src/a.ts (+1)");
    expect(filePayload.files[1]?.line).toBe("🩹 apply_patch src/b.ts (+1)");
    expect(filePayload.files[0]?.fileData?.filename).toBe("edit_a.ts.diff");
    expect(filePayload.files[1]?.fileData?.filename).toBe("edit_b.ts.diff");
    expect(filePayload.files[0]?.fileData?.buffer.toString("utf8")).not.toContain("src/b.ts");
    expect(filePayload.files[1]?.fileData?.buffer.toString("utf8")).not.toContain("src/a.ts");
  });

  it("streams message.part.delta chunks as live assistant updates", () => {
    const onMessageUpdated = vi.fn();
    summaryAggregator.setOnMessageUpdated(onMessageUpdated);
    summaryAggregator.setSession("session-1");

    summaryAggregator.processEvent({
      type: "message.updated",
      properties: {
        info: {
          id: "message-delta",
          sessionID: "session-1",
          role: "assistant",
          time: { created: Date.now() },
        },
      },
    } as unknown as Event);

    summaryAggregator.processEvent({
      type: "message.part.delta",
      properties: {
        sessionID: "session-1",
        messageID: "message-delta",
        partID: "part-delta-1",
        field: "text",
        delta: "Hello",
      },
    } as unknown as Event);

    summaryAggregator.processEvent({
      type: "message.part.delta",
      properties: {
        sessionID: "session-1",
        messageID: "message-delta",
        partID: "part-delta-1",
        field: "text",
        delta: " world",
      },
    } as unknown as Event);

    expect(onMessageUpdated).toHaveBeenCalledTimes(2);
    expect(onMessageUpdated.mock.calls[0]).toEqual(["session-1", "message-delta", "Hello"]);
    expect(onMessageUpdated.mock.calls[1]).toEqual(["session-1", "message-delta", "Hello world"]);
  });

  it("does not duplicate text when part.updated arrives after deltas", () => {
    const onMessageUpdated = vi.fn();
    summaryAggregator.setOnMessageUpdated(onMessageUpdated);
    summaryAggregator.setSession("session-1");

    summaryAggregator.processEvent({
      type: "message.updated",
      properties: {
        info: {
          id: "message-dedup",
          sessionID: "session-1",
          role: "assistant",
          time: { created: Date.now() },
        },
      },
    } as unknown as Event);

    summaryAggregator.processEvent({
      type: "message.part.delta",
      properties: {
        sessionID: "session-1",
        messageID: "message-dedup",
        partID: "part-dedup-1",
        field: "text",
        delta: "Hello",
      },
    } as unknown as Event);

    summaryAggregator.processEvent({
      type: "message.part.updated",
      properties: {
        part: {
          id: "part-dedup-1",
          sessionID: "session-1",
          messageID: "message-dedup",
          type: "text",
          text: "Hello",
          time: { start: Date.now() },
        },
      },
    } as unknown as Event);

    expect(onMessageUpdated).toHaveBeenCalledTimes(1);
    expect(onMessageUpdated.mock.calls[0]).toEqual(["session-1", "message-dedup", "Hello"]);
  });

  it("treats cumulative delta resends as replacement instead of appending", () => {
    const onMessageUpdated = vi.fn();
    summaryAggregator.setOnMessageUpdated(onMessageUpdated);
    summaryAggregator.setSession("session-1");

    summaryAggregator.processEvent({
      type: "message.updated",
      properties: {
        info: {
          id: "message-cumulative",
          sessionID: "session-1",
          role: "assistant",
          time: { created: Date.now() },
        },
      },
    } as unknown as Event);

    summaryAggregator.processEvent({
      type: "message.part.delta",
      properties: {
        sessionID: "session-1",
        messageID: "message-cumulative",
        partID: "part-cumulative-1",
        field: "text",
        delta: "Descubierto",
      },
    } as unknown as Event);

    // Server re-emits the cumulative part text instead of an incremental chunk.
    summaryAggregator.processEvent({
      type: "message.part.delta",
      properties: {
        sessionID: "session-1",
        messageID: "message-cumulative",
        partID: "part-cumulative-1",
        field: "text",
        delta: "Descubierto (verificado",
      },
    } as unknown as Event);

    summaryAggregator.processEvent({
      type: "message.part.delta",
      properties: {
        sessionID: "session-1",
        messageID: "message-cumulative",
        partID: "part-cumulative-1",
        field: "text",
        delta: "Descubierto (verificado con evidencia propia)",
      },
    } as unknown as Event);

    expect(onMessageUpdated).toHaveBeenCalledTimes(3);
    expect(onMessageUpdated.mock.calls[2]).toEqual([
      "session-1",
      "message-cumulative",
      "Descubierto (verificado con evidencia propia)",
    ]);
  });

  it("replaces a repeated part snapshot instead of duplicating it", async () => {
    vi.useFakeTimers();
    const onComplete = vi.fn();
    summaryAggregator.setOnMessageUpdated(() => undefined);
    summaryAggregator.setOnComplete(onComplete);
    summaryAggregator.setSession("session-1");

    const messageId = "message-resnapshot";
    summaryAggregator.processEvent({
      type: "message.updated",
      properties: {
        info: {
          id: messageId,
          sessionID: "session-1",
          role: "assistant",
          time: { created: Date.now() },
        },
      },
    } as unknown as Event);

    const partEvent = (text: string) =>
      ({
        type: "message.part.updated",
        properties: {
          part: {
            id: `${messageId}:text:0`,
            sessionID: "session-1",
            messageID: messageId,
            type: "text",
            text,
            time: { start: Date.now() },
          },
        },
      }) as unknown as Event;

    summaryAggregator.processEvent(partEvent("Descubierto"));
    // Replay/regeneration of the same part must not append a second copy.
    summaryAggregator.processEvent(partEvent("Descubierto (verificado con evidencia propia)"));

    summaryAggregator.processEvent({
      type: "message.updated",
      properties: {
        info: {
          id: messageId,
          sessionID: "session-1",
          role: "assistant",
          time: { created: Date.now(), completed: Date.now() },
          cost: 0,
          tokens: {
            input: 0,
            output: 0,
            reasoning: 0,
            cache: { read: 0, write: 0 },
          },
        },
      },
    } as unknown as Event);

    expect(onComplete).toHaveBeenCalledTimes(0);

    await vi.advanceTimersByTimeAsync(100);

    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete.mock.calls[0][2]).toBe("Descubierto (verificado con evidencia propia)");

    vi.useRealTimers();
  });

  it("ignores non-text delta fields and untracked sessions", () => {
    const onMessageUpdated = vi.fn();
    summaryAggregator.setOnMessageUpdated(onMessageUpdated);
    summaryAggregator.setSession("session-1");

    summaryAggregator.processEvent({
      type: "message.updated",
      properties: {
        info: {
          id: "message-ignore",
          sessionID: "session-1",
          role: "assistant",
          time: { created: Date.now() },
        },
      },
    } as unknown as Event);

    summaryAggregator.processEvent({
      type: "message.part.delta",
      properties: {
        sessionID: "session-1",
        messageID: "message-ignore",
        partID: "part-ignore-1",
        field: "thinking",
        delta: "should not appear",
      },
    } as unknown as Event);

    summaryAggregator.processEvent({
      type: "message.part.delta",
      properties: {
        sessionID: "session-other",
        messageID: "message-ignore",
        partID: "part-ignore-2",
        field: "text",
        delta: "should not appear",
      },
    } as unknown as Event);

    expect(onMessageUpdated).not.toHaveBeenCalled();
  });

  it("reports externally settled permissions with session and request ids", () => {
    const onPermissionReplied = vi.fn();
    summaryAggregator.setOnPermissionReplied(onPermissionReplied);
    summaryAggregator.setSession("session-1");

    summaryAggregator.processEvent({
      type: "permission.replied",
      properties: {
        sessionID: "session-1",
        requestID: "per-1",
        reply: "once",
      },
    } as unknown as Event);

    expect(onPermissionReplied).toHaveBeenCalledTimes(1);
    expect(onPermissionReplied).toHaveBeenCalledWith("session-1", "per-1");
  });

  it("ignores permission replied events without identifiers", () => {
    const onPermissionReplied = vi.fn();
    summaryAggregator.setOnPermissionReplied(onPermissionReplied);
    summaryAggregator.setSession("session-1");

    summaryAggregator.processEvent({
      type: "permission.replied",
      properties: {},
    } as unknown as Event);

    expect(onPermissionReplied).not.toHaveBeenCalled();
  });

  it("reports externally answered questions", () => {
    const onQuestionSettled = vi.fn();
    summaryAggregator.setOnQuestionSettled(onQuestionSettled);
    summaryAggregator.setSession("session-1");

    summaryAggregator.processEvent({
      type: "question.replied",
      properties: {
        sessionID: "session-1",
        requestID: "frm-1",
        answers: [],
      },
    } as unknown as Event);

    expect(onQuestionSettled).toHaveBeenCalledTimes(1);
    expect(onQuestionSettled).toHaveBeenCalledWith("session-1", "frm-1", "answered");
  });

  it("reports externally cancelled questions", () => {
    const onQuestionSettled = vi.fn();
    summaryAggregator.setOnQuestionSettled(onQuestionSettled);
    summaryAggregator.setSession("session-1");

    summaryAggregator.processEvent({
      type: "question.rejected",
      properties: {
        sessionID: "session-1",
        requestID: "frm-2",
      },
    } as unknown as Event);

    expect(onQuestionSettled).toHaveBeenCalledTimes(1);
    expect(onQuestionSettled).toHaveBeenCalledWith("session-1", "frm-2", "cancelled");
  });

  it("ignores settled question events without identifiers", () => {
    const onQuestionSettled = vi.fn();
    summaryAggregator.setOnQuestionSettled(onQuestionSettled);
    summaryAggregator.setSession("session-1");

    summaryAggregator.processEvent({
      type: "question.replied",
      properties: {},
    } as unknown as Event);

    expect(onQuestionSettled).not.toHaveBeenCalled();
  });

  it("ignores session.usage.updated without a step baseline", () => {
    const onTokens = vi.fn();
    summaryAggregator.setOnTokens(onTokens);
    summaryAggregator.setSession("session-1");

    // Cumulative server totals must never reach the context display directly.
    summaryAggregator.processEvent({
      type: "session.usage.updated",
      properties: {
        sessionID: "session-1",
        cost: 0.5,
        tokens: { input: 1000, output: 50, reasoning: 10, cache: { read: 200, write: 5 } },
      },
    } as unknown as Event);

    expect(onTokens).not.toHaveBeenCalled();
  });

  it("reports live usage growth over the last completed step", () => {
    const onTokens = vi.fn();
    summaryAggregator.setOnTokens(onTokens);
    summaryAggregator.setSession("session-1");

    const stepStart = (id: string) =>
      ({
        type: "message.updated",
        properties: {
          info: { id, sessionID: "session-1", role: "assistant", time: { created: Date.now() } },
        },
      }) as unknown as Event;

    // Step 1 starts before any cumulative totals are known.
    summaryAggregator.processEvent(stepStart("message-live-1"));
    summaryAggregator.processEvent({
      type: "session.usage.updated",
      properties: {
        sessionID: "session-1",
        tokens: { input: 5000, output: 100, reasoning: 0, cache: { read: 1000, write: 0 } },
      },
    } as unknown as Event);
    expect(onTokens).not.toHaveBeenCalled();

    // Step 1 completes with exact per-step tokens.
    summaryAggregator.processEvent({
      type: "message.updated",
      properties: {
        info: {
          id: "message-live-1",
          sessionID: "session-1",
          role: "assistant",
          time: { created: Date.now(), completed: Date.now() },
          tokens: { input: 100, output: 20, reasoning: 0, cache: { read: 20, write: 0 } },
          cost: 0.01,
        },
      },
    } as unknown as Event);
    expect(onTokens).toHaveBeenLastCalledWith(
      "session-1",
      expect.objectContaining({ input: 100, cacheRead: 20 }),
    );

    // Step 2 starts: live growth is measured from here.
    summaryAggregator.processEvent(stepStart("message-live-2"));
    summaryAggregator.processEvent({
      type: "session.usage.updated",
      properties: {
        sessionID: "session-1",
        tokens: { input: 5300, output: 150, reasoning: 0, cache: { read: 1100, write: 0 } },
      },
    } as unknown as Event);
    expect(onTokens).toHaveBeenLastCalledWith(
      "session-1",
      expect.objectContaining({ input: 400, cacheRead: 120, cost: 0 }),
    );

    // Server counters reset: re-anchor instead of reporting negative growth.
    summaryAggregator.processEvent({
      type: "session.usage.updated",
      properties: {
        sessionID: "session-1",
        tokens: { input: 100, output: 5, reasoning: 0, cache: { read: 10, write: 0 } },
      },
    } as unknown as Event);
    expect(onTokens).toHaveBeenLastCalledWith(
      "session-1",
      expect.objectContaining({ input: 100, cacheRead: 20, cost: 0 }),
    );
  });

  it("ignores empty session.usage.updated totals", () => {
    const onTokens = vi.fn();
    summaryAggregator.setOnTokens(onTokens);
    summaryAggregator.setSession("session-1");

    summaryAggregator.processEvent({
      type: "session.usage.updated",
      properties: {
        sessionID: "session-1",
        tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
      },
    } as unknown as Event);

    expect(onTokens).not.toHaveBeenCalled();
  });

  it("merges overlapping delta suffixes instead of duplicating them", () => {
    const onMessageUpdated = vi.fn();
    summaryAggregator.setOnMessageUpdated(onMessageUpdated);
    summaryAggregator.setSession("session-1");

    summaryAggregator.processEvent({
      type: "message.updated",
      properties: {
        info: {
          id: "message-overlap",
          sessionID: "session-1",
          role: "assistant",
          time: { created: Date.now() },
        },
      },
    } as unknown as Event);

    const deltaEvent = (delta: string) =>
      ({
        type: "message.part.delta",
        properties: {
          sessionID: "session-1",
          messageID: "message-overlap",
          partID: "part-overlap-1",
          field: "text",
          delta,
        },
      }) as unknown as Event;

    summaryAggregator.processEvent(deltaEvent("Result **"));
    // The server restates the buffered tail: merging must not append it again.
    summaryAggregator.processEvent(deltaEvent("**"));
    summaryAggregator.processEvent(deltaEvent("**"));

    expect(onMessageUpdated).toHaveBeenCalledTimes(1);
    expect(onMessageUpdated.mock.calls[0]).toEqual(["session-1", "message-overlap", "Result **"]);

    summaryAggregator.processEvent({
      type: "message.part.updated",
      properties: {
        part: {
          id: "part-overlap-1",
          sessionID: "session-1",
          messageID: "message-overlap",
          type: "text",
          text: "Result **done**",
          time: { start: Date.now() },
        },
      },
    } as unknown as Event);

    expect(onMessageUpdated).toHaveBeenCalledTimes(2);
    expect(onMessageUpdated.mock.calls[1]).toEqual([
      "session-1",
      "message-overlap",
      "Result **done**",
    ]);
  });

  it("keeps identical texts from different text ordinals", async () => {
    vi.useFakeTimers();
    const onComplete = vi.fn();
    summaryAggregator.setOnMessageUpdated(() => undefined);
    summaryAggregator.setOnComplete(onComplete);
    summaryAggregator.setSession("session-1");

    summaryAggregator.processEvent({
      type: "message.updated",
      properties: {
        info: {
          id: "message-same",
          sessionID: "session-1",
          role: "assistant",
          time: { created: Date.now() },
        },
      },
    } as unknown as Event);

    for (const ordinal of [0, 1]) {
      summaryAggregator.processEvent({
        type: "message.part.updated",
        properties: {
          part: {
            id: `message-same:text:${ordinal}`,
            sessionID: "session-1",
            messageID: "message-same",
            type: "text",
            text: "Same",
            time: { start: Date.now() },
          },
        },
      } as unknown as Event);
    }

    summaryAggregator.processEvent({
      type: "message.updated",
      properties: {
        info: {
          id: "message-same",
          sessionID: "session-1",
          role: "assistant",
          time: { created: Date.now(), completed: Date.now() },
        },
      },
    } as unknown as Event);

    await vi.advanceTimersByTimeAsync(100);

    expect(onComplete).toHaveBeenCalledWith("session-1", "message-same", "SameSame");

    vi.useRealTimers();
  });

  it("orders out-of-order text ordinals by their suffix", async () => {
    vi.useFakeTimers();
    const onComplete = vi.fn();
    summaryAggregator.setOnMessageUpdated(() => undefined);
    summaryAggregator.setOnComplete(onComplete);
    summaryAggregator.setSession("session-1");

    summaryAggregator.processEvent({
      type: "message.updated",
      properties: {
        info: {
          id: "message-order",
          sessionID: "session-1",
          role: "assistant",
          time: { created: Date.now() },
        },
      },
    } as unknown as Event);

    for (const [ordinal, text] of [
      [1, "second"],
      [0, "first"],
    ] as const) {
      summaryAggregator.processEvent({
        type: "message.part.updated",
        properties: {
          part: {
            id: `message-order:text:${ordinal}`,
            sessionID: "session-1",
            messageID: "message-order",
            type: "text",
            text,
            time: { start: Date.now() },
          },
        },
      } as unknown as Event);
    }

    summaryAggregator.processEvent({
      type: "message.updated",
      properties: {
        info: {
          id: "message-order",
          sessionID: "session-1",
          role: "assistant",
          time: { created: Date.now(), completed: Date.now() },
        },
      },
    } as unknown as Event);

    await vi.advanceTimersByTimeAsync(100);

    expect(onComplete).toHaveBeenCalledWith("session-1", "message-order", "firstsecond");

    vi.useRealTimers();
  });

  it("replaces the exact part snapshot when other parts share its text", async () => {
    vi.useFakeTimers();
    const onComplete = vi.fn();
    summaryAggregator.setOnMessageUpdated(() => undefined);
    summaryAggregator.setOnComplete(onComplete);
    summaryAggregator.setSession("session-1");

    summaryAggregator.processEvent({
      type: "message.updated",
      properties: {
        info: {
          id: "message-duptext",
          sessionID: "session-1",
          role: "assistant",
          time: { created: Date.now() },
        },
      },
    } as unknown as Event);

    const snapshot = (id: string, text: string) =>
      ({
        type: "message.part.updated",
        properties: {
          part: {
            id,
            sessionID: "session-1",
            messageID: "message-duptext",
            type: "text",
            text,
            time: { start: Date.now() },
          },
        },
      }) as unknown as Event;

    summaryAggregator.processEvent(snapshot("part-a", "dup"));
    summaryAggregator.processEvent(snapshot("part-b", "dup"));
    summaryAggregator.processEvent(snapshot("part-a", "dup extended"));

    summaryAggregator.processEvent({
      type: "message.updated",
      properties: {
        info: {
          id: "message-duptext",
          sessionID: "session-1",
          role: "assistant",
          time: { created: Date.now(), completed: Date.now() },
        },
      },
    } as unknown as Event);

    await vi.advanceTimersByTimeAsync(100);

    expect(onComplete).toHaveBeenCalledWith("session-1", "message-duptext", "dup extendeddup");

    vi.useRealTimers();
  });

  it("dedups identical pending snapshots arriving before the message announcement", () => {
    const onMessageUpdated = vi.fn();
    summaryAggregator.setOnMessageUpdated(onMessageUpdated);
    summaryAggregator.setSession("session-1");

    const snapshot = (text: string) =>
      ({
        type: "message.part.updated",
        properties: {
          part: {
            id: "part-pending-1",
            sessionID: "session-1",
            messageID: "message-pending",
            type: "text",
            text,
            time: { start: Date.now() },
          },
        },
      }) as unknown as Event;

    summaryAggregator.processEvent(snapshot("Hello"));
    summaryAggregator.processEvent(snapshot("Hello"));

    summaryAggregator.processEvent({
      type: "message.updated",
      properties: {
        info: {
          id: "message-pending",
          sessionID: "session-1",
          role: "assistant",
          time: { created: Date.now() },
        },
      },
    } as unknown as Event);

    expect(onMessageUpdated).toHaveBeenCalledTimes(1);
    expect(onMessageUpdated.mock.calls[0]).toEqual(["session-1", "message-pending", "Hello"]);
  });

  it("orders delta overlays from multiple ordinals by their suffix", () => {
    const onMessageUpdated = vi.fn();
    summaryAggregator.setOnMessageUpdated(onMessageUpdated);
    summaryAggregator.setSession("session-1");

    summaryAggregator.processEvent({
      type: "message.updated",
      properties: {
        info: {
          id: "message-multi-delta",
          sessionID: "session-1",
          role: "assistant",
          time: { created: Date.now() },
        },
      },
    } as unknown as Event);

    for (const [ordinal, delta] of [
      [1, "B"],
      [0, "A"],
    ] as const) {
      summaryAggregator.processEvent({
        type: "message.part.delta",
        properties: {
          sessionID: "session-1",
          messageID: "message-multi-delta",
          partID: `message-multi-delta:text:${ordinal}`,
          field: "text",
          delta,
        },
      } as unknown as Event);
    }

    expect(onMessageUpdated.mock.calls.at(-1)).toEqual([
      "session-1",
      "message-multi-delta",
      "AB",
    ]);
  });

  it("re-emits a tool update after clearSession purges dedup state", () => {
    const onTool = vi.fn();
    summaryAggregator.setOnTool(onTool);
    summaryAggregator.setSession("session-1");

    const runningEvent = {
      type: "message.part.updated",
      properties: {
        part: {
          id: "part-tool-rerun",
          sessionID: "session-1",
          messageID: "message-tool-rerun",
          type: "tool",
          callID: "call-tool-rerun",
          tool: "bash",
          state: {
            status: "running",
            input: { command: "npm test" },
            metadata: {},
          },
        },
      },
    } as unknown as Event;

    summaryAggregator.processEvent({
      type: "message.updated",
      properties: {
        info: {
          id: "message-tool-rerun",
          sessionID: "session-1",
          role: "assistant",
          time: { created: Date.now() },
        },
      },
    } as unknown as Event);

    summaryAggregator.processEvent(runningEvent);
    expect(onTool).toHaveBeenCalledTimes(1);

    // Duplicate while tracked is suppressed...
    summaryAggregator.processEvent(runningEvent);
    expect(onTool).toHaveBeenCalledTimes(1);

    // ...but after the session is cleared the same event flows again.
    summaryAggregator.clearSession("session-1");
    summaryAggregator.setSession("session-1");
    summaryAggregator.processEvent({
      type: "message.updated",
      properties: {
        info: {
          id: "message-tool-rerun",
          sessionID: "session-1",
          role: "assistant",
          time: { created: Date.now() },
        },
      },
    } as unknown as Event);
    summaryAggregator.processEvent(runningEvent);
    expect(onTool).toHaveBeenCalledTimes(2);
  });
});
