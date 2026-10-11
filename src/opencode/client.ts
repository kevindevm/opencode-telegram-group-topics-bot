import { createOpencodeClient } from "@opencode-ai/sdk/v2";
import { Agent } from "undici";
import { config, type OpencodeServerVersion } from "../config.js";
import { logger } from "../utils/logger.js";
import {
  createV2OpencodeClient,
  type V2ClientExtension,
} from "./v2/client.js";

const PROBE_TIMEOUT_MS = 5000;

const opencodeDispatcher = new Agent({
  headersTimeout: 0,
  bodyTimeout: 0,
});

const getAuth = () => {
  if (!config.opencode.password) {
    return undefined;
  }
  const credentials = `${config.opencode.username}:${config.opencode.password}`;
  return `Basic ${Buffer.from(credentials).toString("base64")}`;
};

const authHeaders = (): Record<string, string> | undefined => {
  const auth = getAuth();
  return auth ? { Authorization: auth } : undefined;
};

/** The API version the bot was configured for; there is no detection or switching. */
export const opencodeServerVersion: OpencodeServerVersion =
  config.opencode.serverVersion === "v2" ? "v2" : "v1";

function createClient() {
  const headers = authHeaders();
  if (opencodeServerVersion === "v2") {
    return createV2OpencodeClient({
      baseUrl: config.opencode.apiUrl,
      ...(headers ? { headers } : {}),
    });
  }
  return createOpencodeClient({
    baseUrl: config.opencode.apiUrl,
    headers: config.opencode.password ? { Authorization: getAuth() } : undefined,
    fetch: (input, init) =>
      fetch(input, {
        ...init,
        dispatcher: opencodeDispatcher as never,
      } as RequestInit),
  });
}

export const opencodeClient = createClient();

/** The V2-only operations of the same client; use only when `opencodeServerVersion` is "v2". */
export const opencodeV2Client = opencodeClient as unknown as V2ClientExtension;

export type OpencodeServerProbe =
  | { kind: "found"; version: OpencodeServerVersion; serverVersion: string }
  | { kind: "unauthorized" }
  | { kind: "none" };

const PROBE_ROUTES: Record<OpencodeServerVersion, string> = {
  v1: "global/health",
  v2: "api/info",
};

function readServerVersion(version: OpencodeServerVersion, body: unknown): string | null {
  if (typeof body !== "object" || body === null) {
    return null;
  }
  const record = body as Record<string, unknown>;
  if (typeof record.version !== "string") {
    return null;
  }
  if (version === "v1") {
    return record.healthy === true ? record.version : null;
  }
  return typeof record.pid === "number" ? record.version : null;
}

/**
 * Asks the configured URL whether it answers the given API version, with the configured
 * credentials. Used to explain a failed health check, never to switch clients.
 */
export async function probeOpencodeServer(
  version: OpencodeServerVersion,
): Promise<OpencodeServerProbe> {
  const baseUrl = config.opencode.apiUrl.endsWith("/")
    ? config.opencode.apiUrl
    : `${config.opencode.apiUrl}/`;
  try {
    const headers = authHeaders();
    const response = await fetch(new URL(PROBE_ROUTES[version], baseUrl), {
      ...(headers ? { headers } : {}),
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    if (response.status === 401) {
      return { kind: "unauthorized" };
    }
    const contentType = response.headers.get("content-type") ?? "";
    if (!response.ok || !contentType.includes("json")) {
      return { kind: "none" };
    }
    const serverVersion = readServerVersion(version, await response.json());
    return serverVersion ? { kind: "found", version, serverVersion } : { kind: "none" };
  } catch {
    return { kind: "none" };
  }
}

/**
 * Logs why the configured URL does not answer as a healthy server of the configured
 * version: wrong credentials vs. a server of the other version.
 */
export async function explainServerVersionMismatch(): Promise<void> {
  const configured = await probeOpencodeServer(opencodeServerVersion);
  if (configured.kind === "unauthorized") {
    logger.warn(
      `[OpenCode] Authentication failed at ${config.opencode.apiUrl}: check OPENCODE_SERVER_USERNAME and OPENCODE_SERVER_PASSWORD`,
    );
    return;
  }
  if (configured.kind === "found") {
    return;
  }

  const otherVersion: OpencodeServerVersion =
    opencodeServerVersion === "v1" ? "v2" : "v1";
  const other = await probeOpencodeServer(otherVersion);
  if (other.kind === "found") {
    logger.error(
      `[OpenCode] Server version mismatch: OPENCODE_SERVER_VERSION=${opencodeServerVersion}, but the server at ${config.opencode.apiUrl} is OpenCode ${other.serverVersion} (API ${other.version}). Set OPENCODE_SERVER_VERSION=${other.version} and restart the bot.`,
    );
  }
}
