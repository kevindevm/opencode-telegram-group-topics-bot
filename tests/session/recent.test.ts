import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadRecentSessions } from "../../src/session/recent.js";

const mocked = vi.hoisted(() => ({
  getProjectsMock: vi.fn(),
  filterProjectsMock: vi.fn(),
  sessionListMock: vi.fn(),
  sessionStatusMock: vi.fn(),
}));

vi.mock("../../src/project/manager.js", () => ({
  getProjects: mocked.getProjectsMock,
}));

vi.mock("../../src/project/directory.js", () => ({
  filterProjectsWithExistingDirectories: mocked.filterProjectsMock,
}));

vi.mock("../../src/opencode/client.js", () => ({
  opencodeClient: {
    session: {
      list: mocked.sessionListMock,
      status: mocked.sessionStatusMock,
    },
  },
}));

const projectA = { id: "a", worktree: "/repo/a", name: "a" };
const projectB = { id: "b", worktree: "/repo/b", name: "b" };

function session(id: string, updated: number, title = `title-${id}`) {
  return { id, title, directory: "/repo/a", time: { created: updated - 10, updated } };
}

describe("session/recent", () => {
  beforeEach(() => {
    mocked.getProjectsMock.mockReset();
    mocked.filterProjectsMock.mockReset();
    mocked.sessionListMock.mockReset();
    mocked.sessionStatusMock.mockReset();

    mocked.getProjectsMock.mockResolvedValue([projectA, projectB]);
    mocked.filterProjectsMock.mockImplementation(async (projects: unknown) => projects);
    mocked.sessionStatusMock.mockResolvedValue({ data: {}, error: undefined });
  });

  it("merges sessions across projects newest first within the limit", async () => {
    mocked.sessionListMock
      .mockResolvedValueOnce({
        data: [session("a1", 100), session("a2", 300)],
        error: undefined,
      })
      .mockResolvedValueOnce({
        data: [session("b1", 200)],
        error: undefined,
      });

    const entries = await loadRecentSessions(2);

    expect(entries.map((entry) => entry.id)).toEqual(["a2", "b1"]);
    expect(entries[0]?.project).toEqual(projectA);
    expect(mocked.sessionListMock).toHaveBeenCalledWith({
      directory: "/repo/a",
      limit: 2,
      roots: true,
    });
  });

  it("marks busy sessions as running", async () => {
    mocked.sessionListMock.mockResolvedValue({
      data: [session("a1", 100)],
      error: undefined,
    });
    mocked.sessionStatusMock.mockResolvedValue({
      data: { a1: { type: "busy" } },
      error: undefined,
    });

    const entries = await loadRecentSessions(10);

    expect(entries[0]?.status).toBe("running");
  });

  it("skips a failing project without failing the list", async () => {
    mocked.sessionListMock
      .mockRejectedValueOnce(new Error("gone"))
      .mockResolvedValueOnce({ data: [session("b1", 50)], error: undefined });

    const entries = await loadRecentSessions(10);

    expect(entries.map((entry) => entry.id)).toEqual(["b1"]);
  });

  it("propagates project loading failures", async () => {
    mocked.getProjectsMock.mockRejectedValue(new Error("no server"));

    await expect(loadRecentSessions(10)).rejects.toThrow("no server");
  });
});
