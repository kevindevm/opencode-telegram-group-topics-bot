import { beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({
  autoStart: true,
  isRunningMock: vi.fn(),
  startMock: vi.fn(),
  getPidMock: vi.fn(() => 1234),
  probeMock: vi.fn(),
  healthMock: vi.fn(),
}));

vi.mock("../../src/config.js", () => ({
  config: {
    opencode: {
      get autoStart() {
        return mocked.autoStart;
      },
      serverVersion: "v2",
    },
  },
}));

vi.mock("../../src/process/manager.js", () => ({
  processManager: {
    isRunning: mocked.isRunningMock,
    start: mocked.startMock,
    getPID: mocked.getPidMock,
  },
}));

vi.mock("../../src/opencode/client.js", () => ({
  opencodeClient: {
    global: { health: mocked.healthMock },
  },
  probeOpencodeServer: mocked.probeMock,
}));

vi.mock("../../src/utils/logger.js", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { ensureOpencodeServerRunning } from "../../src/process/auto-start.js";

describe("process/auto-start", () => {
  beforeEach(() => {
    mocked.autoStart = true;
    mocked.isRunningMock.mockReset().mockReturnValue(false);
    mocked.startMock.mockReset().mockResolvedValue({ success: true });
    mocked.probeMock.mockReset().mockResolvedValue({ kind: "none" });
    mocked.healthMock.mockReset().mockResolvedValue({ data: { healthy: true }, error: null });
  });

  it("does nothing when auto-start is disabled", async () => {
    mocked.autoStart = false;

    await ensureOpencodeServerRunning();

    expect(mocked.probeMock).not.toHaveBeenCalled();
    expect(mocked.startMock).not.toHaveBeenCalled();
  });

  it("does nothing when the managed server is already running", async () => {
    mocked.isRunningMock.mockReturnValue(true);

    await ensureOpencodeServerRunning();

    expect(mocked.probeMock).not.toHaveBeenCalled();
    expect(mocked.startMock).not.toHaveBeenCalled();
  });

  it("keeps an already reachable external server", async () => {
    mocked.probeMock.mockResolvedValue({ kind: "found", version: "v2", serverVersion: "2.0.24" });

    await ensureOpencodeServerRunning();

    expect(mocked.startMock).not.toHaveBeenCalled();
  });

  it("does not start over an unauthorized server", async () => {
    mocked.probeMock.mockResolvedValue({ kind: "unauthorized" });

    await ensureOpencodeServerRunning();

    expect(mocked.startMock).not.toHaveBeenCalled();
  });

  it("starts the managed server when nothing answers", async () => {
    await ensureOpencodeServerRunning();

    expect(mocked.startMock).toHaveBeenCalledTimes(1);
    expect(mocked.healthMock).toHaveBeenCalled();
  });

  it("logs the failure when the managed start fails", async () => {
    mocked.startMock.mockResolvedValue({ success: false, error: "nope" });

    await ensureOpencodeServerRunning();

    expect(mocked.healthMock).not.toHaveBeenCalled();
  });
});
