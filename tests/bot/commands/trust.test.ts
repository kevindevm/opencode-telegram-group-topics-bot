import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Context } from "grammy";

const mocked = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
}));

vi.mock("../../../src/session/manager.js", () => ({
  getCurrentSession: mocked.getSessionMock,
}));

vi.mock("../../../src/bot/scope.js", () => ({
  getScopeFromContext: () => ({ key: "scope-1", threadId: 9 }),
  getThreadSendOptions: (threadId: number | null) =>
    threadId === null ? {} : { message_thread_id: threadId },
}));

import { TRUST_CALLBACK_PREFIX, handleTrustCallback, trustCommand } from "../../../src/bot/commands/trust.js";
import { getTrustLevel } from "../../../src/permission/trust.js";
import { t } from "../../../src/i18n/index.js";

function createCommandContext(match: string): Context {
  return {
    match,
    reply: vi.fn().mockResolvedValue(undefined),
  } as unknown as Context;
}

function createCallbackContext(data: string): Context {
  return {
    callbackQuery: { data },
    answerCallbackQuery: vi.fn().mockResolvedValue(undefined),
    editMessageText: vi.fn().mockResolvedValue(undefined),
  } as unknown as Context;
}

describe("bot/commands/trust", () => {
  beforeEach(() => {
    mocked.getSessionMock.mockReset().mockReturnValue({
      id: "session-1",
      title: "Session",
      directory: "/repo/app",
    });
  });

  it("reports no session without one", async () => {
    mocked.getSessionMock.mockReturnValue(undefined);
    const ctx = createCommandContext("");

    await trustCommand(ctx as never);

    expect(ctx.reply).toHaveBeenCalledWith(t("trust.no_session"), { message_thread_id: 9 });
  });

  it("sets the level from an argument", async () => {
    const ctx = createCommandContext("all");

    await trustCommand(ctx as never);

    expect(getTrustLevel("session-1")).toBe("all");
    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining("Trust"), {
      message_thread_id: 9,
    });
  });

  it("rejects invalid levels", async () => {
    const ctx = createCommandContext("everything");

    await trustCommand(ctx as never);

    expect(ctx.reply).toHaveBeenCalledWith(t("trust.invalid"), { message_thread_id: 9 });
  });

  it("shows the picker without an argument", async () => {
    const ctx = createCommandContext("");

    await trustCommand(ctx as never);

    expect(ctx.reply).toHaveBeenCalledWith(
      expect.stringContaining("Trust"),
      expect.objectContaining({ reply_markup: expect.anything() }),
    );
  });

  it("sets the level from a button", async () => {
    const ctx = createCallbackContext(`${TRUST_CALLBACK_PREFIX}edits`);

    expect(await handleTrustCallback(ctx)).toBe(true);

    expect(getTrustLevel("session-1")).toBe("edits");
    expect(ctx.editMessageText).toHaveBeenCalled();
  });

  it("ignores unrelated callbacks", async () => {
    const ctx = createCallbackContext("model:result:0");

    expect(await handleTrustCallback(ctx)).toBe(false);
  });
});
