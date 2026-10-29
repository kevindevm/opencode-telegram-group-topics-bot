import { beforeEach, describe, expect, it, vi } from "vitest";

const { execMock } = vi.hoisted(() => ({
  execMock: vi.fn(),
}));

const { getServerProcessMock, setServerProcessMock, clearServerProcessMock } = vi.hoisted(() => ({
  getServerProcessMock: vi.fn(),
  setServerProcessMock: vi.fn(),
  clearServerProcessMock: vi.fn(),
}));

const { healthMock } = vi.hoisted(() => ({
  healthMock: vi.fn(),
}));

vi.mock("child_process", () => ({
  spawn: vi.fn(),
  exec: execMock,
}));

vi.mock("../../src/settings/manager.js", () => ({
  getServerProcess: getServerProcessMock,
  setServerProcess: setServerProcessMock,
  clearServerProcess: clearServerProcessMock,
}));

vi.mock("../../src/config.js", () => ({
  config: {
    opencode: { serverVersion: "v2", apiUrl: "http://127.0.0.1:49374" },
    server: { logLevel: "info" },
  },
}));

vi.mock("../../src/opencode/client.js", () => ({
  opencodeClient: { global: { health: healthMock } },
}));

import { processManager } from "../../src/process/manager.js";

function mockExecSuccess(): void {
  execMock.mockImplementation((...args: unknown[]) => {
    const callback = args[args.length - 1];
    if (typeof callback === "function") {
      callback(null, "", "");
    }
    return {};
  });
}

describe("process/manager v2 background service", () => {
  beforeEach(() => {
    execMock.mockReset();
    getServerProcessMock.mockReset().mockReturnValue(undefined);
    setServerProcessMock.mockReset();
    clearServerProcessMock.mockReset();
    healthMock.mockReset().mockResolvedValue({ data: { healthy: true }, error: null });
    mockExecSuccess();
  });

  it("starts the background service instead of spawning serve", async () => {
    const result = await processManager.start();

    expect(result).toEqual({ success: true });
    expect(execMock).toHaveBeenCalledWith(
      "opencode service start",
      expect.anything(),
      expect.anything(),
    );
    expect(setServerProcessMock).toHaveBeenCalledWith(
      expect.objectContaining({ pid: null, viaService: true }),
    );
    expect(processManager.isRunning()).toBe(true);
    expect(processManager.getPID()).toBeNull();
    expect(processManager.getUptime()).toBeTypeOf("number");

    const stopResult = await processManager.stop();
    expect(stopResult).toEqual({ success: true });
    expect(execMock).toHaveBeenCalledWith(
      "opencode service stop",
      expect.anything(),
      expect.anything(),
    );
    expect(processManager.isRunning()).toBe(false);
  });

  it("fails start when the service never becomes healthy", async () => {
    healthMock.mockResolvedValue({ data: null, error: new Error("down") });

    const result = await processManager.start();

    expect(result.success).toBe(false);
    expect(processManager.isRunning()).toBe(false);
    expect(clearServerProcessMock).toHaveBeenCalled();
  }, 25_000);

  it("restores a saved background service when it answers health", async () => {
    getServerProcessMock.mockReturnValue({
      pid: null,
      startTime: new Date().toISOString(),
      viaService: true,
    });

    await processManager.initialize();

    expect(processManager.isRunning()).toBe(true);
    expect(clearServerProcessMock).not.toHaveBeenCalled();

    await processManager.stop();
  });

  it("drops a saved background service that no longer answers", async () => {
    getServerProcessMock.mockReturnValue({
      pid: null,
      startTime: new Date().toISOString(),
      viaService: true,
    });
    healthMock.mockResolvedValue({ data: null, error: new Error("down") });

    await processManager.initialize();

    expect(processManager.isRunning()).toBe(false);
    expect(clearServerProcessMock).toHaveBeenCalledTimes(1);
  });
});
