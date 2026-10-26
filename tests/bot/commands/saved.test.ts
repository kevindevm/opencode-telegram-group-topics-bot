import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Context } from "grammy";

const mocked = vi.hoisted(() => ({
  listMock: vi.fn(() => []),
  saveMock: vi.fn(),
  deleteMock: vi.fn(() => true),
  processPromptMock: vi.fn(),
}));

vi.mock("../../../src/settings/manager.js", () => ({
  listSavedPrompts: mocked.listMock,
  savePromptShortcut: mocked.saveMock,
  deleteSavedPrompt: mocked.deleteMock,
}));

vi.mock("../../../src/bot/handlers/prompt.js", () => ({
  processUserPrompt: mocked.processPromptMock,
}));

vi.mock("../../../src/bot/scope.js", () => ({
  getThreadSendOptions: (threadId: number | null) =>
    threadId === null ? {} : { message_thread_id: threadId },
}));

import { createSavedCommand } from "../../../src/bot/commands/saved.js";

function createCommandContext(match: string): Context {
  return {
    match,
    message: { message_thread_id: 9 },
    reply: vi.fn().mockResolvedValue(undefined),
  } as unknown as Context;
}

describe("bot/commands/saved", () => {
  const deps = { bot: {}, ensureEventSubscription: vi.fn() } as never;

  beforeEach(() => {
    mocked.listMock.mockReset().mockReturnValue([]);
    mocked.saveMock.mockReset();
    mocked.deleteMock.mockReset().mockReturnValue(true);
    mocked.processPromptMock.mockReset();
  });

  it("lists saved prompts", async () => {
    mocked.listMock.mockReturnValue([{ name: "review", text: "do review" }]);
    const ctx = createCommandContext("");

    await createSavedCommand(deps)(ctx as never);

    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining("review"), {
      message_thread_id: 9,
    });
  });

  it("adds a shortcut", async () => {
    const ctx = createCommandContext("add review do strict review");

    await createSavedCommand(deps)(ctx as never);

    expect(mocked.saveMock).toHaveBeenCalledWith("review", "do strict review");
  });

  it("runs a shortcut through the prompt pipeline", async () => {
    mocked.listMock.mockReturnValue([{ name: "review", text: "do strict review" }]);
    const ctx = createCommandContext("run review");

    await createSavedCommand(deps)(ctx as never);

    expect(mocked.processPromptMock).toHaveBeenCalledWith(ctx, "do strict review", deps);
  });

  it("deletes a shortcut", async () => {
    const ctx = createCommandContext("del review");

    await createSavedCommand(deps)(ctx as never);

    expect(mocked.deleteMock).toHaveBeenCalledWith("review");
  });
});
