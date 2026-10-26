import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Context } from "grammy";

const mocked = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  diffMock: vi.fn(),
  execFileMock: vi.fn(),
}));

vi.mock("../../../src/session/manager.js", () => ({
  getCurrentSession: mocked.getSessionMock,
}));

vi.mock("../../../src/opencode/client.js", () => ({
  opencodeClient: {
    session: {
      diff: mocked.diffMock,
    },
  },
}));

vi.mock("node:child_process", () => ({
  execFile: mocked.execFileMock,
  exec: vi.fn(),
  spawn: vi.fn(),
}));

vi.mock("../../../src/bot/scope.js", () => ({
  getScopeFromContext: () => ({ key: "scope-1", threadId: 9 }),
  getThreadSendOptions: (threadId: number | null) =>
    threadId === null ? {} : { message_thread_id: threadId },
}));

import { commitCommand, diffCommand } from "../../../src/bot/commands/diff.js";
import { t } from "../../../src/i18n/index.js";

function createCommandContext(match = ""): Context {
  return {
    match,
    reply: vi.fn().mockResolvedValue(undefined),
  } as unknown as Context;
}

describe("bot/commands/diff", () => {
  beforeEach(() => {
    mocked.getSessionMock.mockReset().mockReturnValue({
      id: "session-1",
      title: "Session",
      directory: "/repo/app",
    });
    mocked.diffMock.mockReset().mockResolvedValue({ data: [], error: null });
    mocked.execFileMock.mockReset();
  });

  it("reports no session without one", async () => {
    mocked.getSessionMock.mockReturnValue(undefined);
    const ctx = createCommandContext();

    await diffCommand(ctx as never);

    expect(ctx.reply).toHaveBeenCalledWith(t("diff.no_session"), { message_thread_id: 9 });
  });

  it("reports an empty diff", async () => {
    const ctx = createCommandContext();

    await diffCommand(ctx as never);

    expect(ctx.reply).toHaveBeenCalledWith(t("diff.empty"), { message_thread_id: 9 });
  });

  it("lists changed files with counts", async () => {
    mocked.diffMock.mockResolvedValue({
      data: [{ file: "src/a.ts", additions: 3, deletions: 1 }],
      error: null,
    });
    const ctx = createCommandContext();

    await diffCommand(ctx as never);

    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining("src/a.ts (+3 -1)"), {
      message_thread_id: 9,
    });
  });

  it("requires a commit message", async () => {
    const ctx = createCommandContext("");

    await commitCommand(ctx as never);

    expect(ctx.reply).toHaveBeenCalledWith(t("commit.need_message"), { message_thread_id: 9 });
    expect(mocked.execFileMock).not.toHaveBeenCalled();
  });

  it("commits and reports the short hash", async () => {
    mocked.execFileMock.mockImplementation(
      (
        cmd: string,
        args: string[],
        opts: unknown,
        callback: (error: unknown, result: { stdout: string; stderr: string }) => void,
      ) => {
        if (args.includes("status")) {
          callback(null, { stdout: " M src/a.ts\n", stderr: "" });
        } else if (args.includes("rev-parse")) {
          callback(null, { stdout: "abc1234\n", stderr: "" });
        } else {
          callback(null, { stdout: "", stderr: "" });
        }
      },
    );
    const ctx = createCommandContext("fix login");

    await commitCommand(ctx as never);

    expect(ctx.reply).toHaveBeenCalledWith(t("commit.success", { hash: "abc1234" }), {
      message_thread_id: 9,
    });
  });

  it("reports a clean tree without committing", async () => {
    mocked.execFileMock.mockImplementation(
      (
        cmd: string,
        args: string[],
        opts: unknown,
        callback: (error: unknown, result: { stdout: string; stderr: string }) => void,
      ) => {
        callback(null, { stdout: args.includes("status") ? "" : "", stderr: "" });
      },
    );
    const ctx = createCommandContext("fix login");

    await commitCommand(ctx as never);

    expect(ctx.reply).toHaveBeenCalledWith(t("commit.nothing"), { message_thread_id: 9 });
  });
});
