import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetPcUserMirrorForTests,
  registerPcUserMessage,
  takePcUserText,
} from "../../src/bot/pc-user-mirror.js";
import { __resetForwardedPromptsForTests, markForwardedPrompt } from "../../src/session/forwarded-prompts.js";

const mocked = vi.hoisted(() => ({
  getTopicBindingBySessionIdMock: vi.fn(),
}));

vi.mock("../../src/topic/manager.js", () => ({
  getTopicBindingBySessionId: mocked.getTopicBindingBySessionIdMock,
}));

const ACTIVE_BINDING = {
  scopeKey: "-100:178",
  chatId: -100,
  threadId: 178,
  sessionId: "ses-1",
  projectId: "p1",
  status: "active",
};

describe("bot/pc-user-mirror", () => {
  beforeEach(() => {
    mocked.getTopicBindingBySessionIdMock.mockReset();
    mocked.getTopicBindingBySessionIdMock.mockReturnValue(undefined);
    __resetPcUserMirrorForTests();
    __resetForwardedPromptsForTests();
  });

  it("returns a payload for a pending PC prompt with an active binding", () => {
    mocked.getTopicBindingBySessionIdMock.mockReturnValue(ACTIVE_BINDING);
    registerPcUserMessage("ses-1", "msg-1");

    const payload = takePcUserText("ses-1", "msg-1", "hola desde la pc");

    expect(payload).toEqual({
      sessionId: "ses-1",
      messageId: "msg-1",
      text: "hola desde la pc",
      target: { chatId: -100, threadId: 178 },
    });
  });

  it("ignores parts without a prior user message announcement", () => {
    mocked.getTopicBindingBySessionIdMock.mockReturnValue(ACTIVE_BINDING);

    expect(takePcUserText("ses-1", "msg-9", "hola")).toBeNull();
  });

  it("skips prompts the bot forwarded itself", () => {
    mocked.getTopicBindingBySessionIdMock.mockReturnValue(ACTIVE_BINDING);
    markForwardedPrompt("ses-1", "hola desde telegram");
    registerPcUserMessage("ses-1", "msg-2");

    expect(takePcUserText("ses-1", "msg-2", "hola desde telegram")).toBeNull();
  });

  it("does not mirror twice for the same message", () => {
    mocked.getTopicBindingBySessionIdMock.mockReturnValue(ACTIVE_BINDING);
    registerPcUserMessage("ses-1", "msg-3");

    expect(takePcUserText("ses-1", "msg-3", "hola")).not.toBeNull();
    expect(takePcUserText("ses-1", "msg-3", "hola")).toBeNull();
  });

  it("skips sessions without an active topic binding", () => {
    mocked.getTopicBindingBySessionIdMock.mockReturnValue({
      ...ACTIVE_BINDING,
      status: "closed",
    });
    registerPcUserMessage("ses-1", "msg-4");

    expect(takePcUserText("ses-1", "msg-4", "hola")).toBeNull();
  });

  it("skips empty text", () => {
    mocked.getTopicBindingBySessionIdMock.mockReturnValue(ACTIVE_BINDING);
    registerPcUserMessage("ses-1", "msg-5");

    expect(takePcUserText("ses-1", "msg-5", "   ")).toBeNull();
  });
});
