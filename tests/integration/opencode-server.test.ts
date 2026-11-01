import { beforeAll, describe, expect, it, vi } from "vitest";

/**
 * Live-server smoke test, skipped unless the smoke env is set (CI
 * server-smoke workflow). Exercises the repo's own client code against a
 * real OpenCode server for both API generations:
 *   OPENCODE_SMOKE_URL     server base URL (started by the workflow)
 *   OPENCODE_SMOKE_VERSION v1 | v2 (sets OPENCODE_SERVER_VERSION for config)
 *
 * v2 leg: probe, providers, session create/get/messages/delete, server cost.
 * v1 leg: probe health contract only. The bot's v1 session calls still use
 * the v2-wrapper shapes, so v1 session roundtrips are out of scope until a
 * v1 adapter exists.
 */
const SMOKE_URL = process.env.OPENCODE_SMOKE_URL ?? "";
const SMOKE_VERSION =
  process.env.OPENCODE_SMOKE_VERSION === "v1" ? ("v1" as const) : ("v2" as const);
const SMOKE_USER = process.env.OPENCODE_SMOKE_USER ?? "opencode";
const SMOKE_PASS = process.env.OPENCODE_SMOKE_PASS ?? "";

describe.skipIf(!SMOKE_URL)("integration/opencode-server", () => {
  beforeAll(() => {
    vi.stubEnv("OPENCODE_API_URL", SMOKE_URL);
    vi.stubEnv("OPENCODE_SERVER_VERSION", SMOKE_VERSION);
    vi.stubEnv("OPENCODE_SERVER_USERNAME", SMOKE_USER);
    vi.stubEnv("OPENCODE_SERVER_PASSWORD", SMOKE_PASS);
  });

  it("probes a healthy server of the expected generation", async () => {
    const { probeOpencodeServer } = await import("../../src/opencode/client.js");

    const probe = await probeOpencodeServer(SMOKE_VERSION);

    expect(probe).toMatchObject({ kind: "found", version: SMOKE_VERSION });
    if (probe.kind === "found") {
      expect(probe.serverVersion.startsWith(SMOKE_VERSION === "v1" ? "1." : "2.")).toBe(true);
    }
  });

  it("lists providers", async () => {
    if (SMOKE_VERSION === "v1") {
      const { createOpencodeClient } = await import("@opencode-ai/sdk");
      const raw = createOpencodeClient({
        baseUrl: SMOKE_URL,
        headers: SMOKE_PASS
          ? {
              Authorization: `Basic ${Buffer.from(`${SMOKE_USER}:${SMOKE_PASS}`).toString("base64")}`,
            }
          : undefined,
      });
      const { data } = await raw.config.providers();
      expect(Array.isArray((data as { providers?: unknown[] } | null)?.providers)).toBe(true);
      return;
    }

    const { opencodeClient } = await import("../../src/opencode/client.js");
    const { data, error } = await opencodeClient.config.providers();
    expect(error).toBeFalsy();
    expect(Array.isArray((data as { providers?: unknown[] } | null)?.providers)).toBe(true);
  });

  it("roundtrips a session (v2 only)", async () => {
    if (SMOKE_VERSION !== "v2") {
      return;
    }

    const { opencodeClient } = await import("../../src/opencode/client.js");
    const directory = process.cwd();

    const created = await opencodeClient.session.create({
      directory,
      title: "ci-smoke",
    });
    expect(created.error).toBeFalsy();
    const sessionId = created.data as { id?: string; sessionID?: string } | null | undefined;
    const id =
      typeof sessionId === "string" ? sessionId : (sessionId?.id ?? sessionId?.sessionID ?? null);
    expect(typeof id).toBe("string");
    if (!id) {
      return;
    }

    try {
      const fetched = await opencodeClient.session.get({ sessionID: id });
      expect(fetched.error).toBeFalsy();
      expect(typeof (fetched.data as { cost?: unknown } | null)?.cost).toBe("number");

      const messages = await opencodeClient.session.messages({ sessionID: id });
      expect(messages.error).toBeFalsy();
      expect(Array.isArray(messages.data)).toBe(true);
    } finally {
      await opencodeClient.session.delete({ sessionID: id });
    }
  });
});
