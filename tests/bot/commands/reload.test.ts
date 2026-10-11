import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Context } from "grammy";
import { reloadCommand } from "../../../src/bot/commands/reload.js";
import { t } from "../../../src/i18n/index.js";

const mocked = vi.hoisted(() => ({
  serverVersion: "v2",
  locationReloadMock: vi.fn(),
  refreshModelCatalogMock: vi.fn(),
  backgroundMock: vi.fn(),
}));

vi.mock("../../../src/opencode/client.js", () => ({
  get opencodeServerVersion() {
    return mocked.serverVersion;
  },
  opencodeV2Client: {
    location: {
      reload: mocked.locationReloadMock,
    },
  },
}));

vi.mock("../../../src/model/manager.js", () => ({
  refreshModelCatalog: mocked.refreshModelCatalogMock,
}));

vi.mock("../../../src/utils/safe-background-task.js", () => ({
  safeBackgroundTask: mocked.backgroundMock,
}));

function createContext(): Context {
  return {
    chat: { id: -100123, type: "supergroup" },
    reply: vi.fn().mockResolvedValue({ message_id: 1 }),
  } as unknown as Context;
}

describe("bot/commands/reload", () => {
  beforeEach(() => {
    mocked.serverVersion = "v2";
    mocked.locationReloadMock.mockReset();
    mocked.locationReloadMock.mockResolvedValue({ data: true, error: undefined });
    mocked.refreshModelCatalogMock.mockReset();
    mocked.refreshModelCatalogMock.mockResolvedValue(undefined);
    mocked.backgroundMock.mockReset();
    mocked.backgroundMock.mockImplementation(
      ({
        task,
        onSuccess,
        onError,
      }: {
        task: () => Promise<unknown>;
        onSuccess?: (value: unknown) => void;
        onError?: (error: unknown) => void;
      }) => {
        task().then(
          (value) => onSuccess?.(value),
          (error) => onError?.(error),
        );
      },
    );
  });

  it("answers that reload needs V2 when configured for V1", async () => {
    mocked.serverVersion = "v1";
    const ctx = createContext();

    await reloadCommand(ctx as never);

    expect(ctx.reply).toHaveBeenCalledWith(
      t("reload.v1_not_supported"),
      expect.anything(),
    );
    expect(mocked.backgroundMock).not.toHaveBeenCalled();
  });

  it("reloads the server config and refreshes the model catalog on V2", async () => {
    const ctx = createContext();

    await reloadCommand(ctx as never);
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(ctx.reply).toHaveBeenCalledWith(t("reload.reloading"), expect.anything());
    expect(mocked.locationReloadMock).toHaveBeenCalledTimes(1);
    expect(mocked.refreshModelCatalogMock).toHaveBeenCalledTimes(1);
    expect(ctx.reply).toHaveBeenCalledWith(t("reload.success"), expect.anything());
  });

  it("reports failure when the server reload fails", async () => {
    mocked.locationReloadMock.mockResolvedValue({ data: undefined, error: new Error("nope") });
    const ctx = createContext();

    await reloadCommand(ctx as never);
    await new Promise<void>((resolve) => setImmediate(resolve));
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(ctx.reply).toHaveBeenCalledWith(t("reload.failed"), expect.anything());
    expect(mocked.refreshModelCatalogMock).not.toHaveBeenCalled();
  });
});
