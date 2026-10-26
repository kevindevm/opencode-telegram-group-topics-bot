import { summaryAggregator } from "../summary/aggregator.js";
import { getTopicBindingBySessionId } from "../topic/manager.js";
import { logger } from "../utils/logger.js";

interface TrackableEvent {
  type: string;
  properties?: unknown;
}

function asOptionalString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * Reads the session id from a translated (V1-shape) event. Covers the flat
 * `sessionID` payloads (status, idle, deltas, diff, error, permission and
 * question events) plus the nested `info`/`part`/`request` shapes.
 */
export function extractTrackableSessionId(event: TrackableEvent): string | null {
  const properties = readRecord(event.properties);
  if (!properties) {
    return null;
  }

  const flat =
    asOptionalString(properties.sessionID) ?? asOptionalString(properties.sessionId);
  if (flat) {
    return flat;
  }

  for (const key of ["info", "part", "request", "session"] as const) {
    const nested = readRecord(properties[key]);
    if (!nested) {
      continue;
    }

    const nestedId =
      asOptionalString(nested.sessionID) ??
      asOptionalString(nested.sessionId) ??
      asOptionalString(nested.id);
    if (nestedId) {
      return nestedId;
    }
  }

  return null;
}

/**
 * Self-healing for topic-bound sessions: global clears (project switch,
 * abort, startup races) drop aggregator tracking silently, and from then on
 * every event of that session is ignored with no error. When an event
 * belongs to a session with a topic binding, re-track it so PC activity
 * always reaches Telegram without waiting for the next Telegram action.
 * Returns true when tracking was (re-)established by this call.
 */
export function ensureTopicSessionTracked(event: TrackableEvent): boolean {
  const sessionId = extractTrackableSessionId(event);
  if (!sessionId) {
    return false;
  }

  const binding = getTopicBindingBySessionId(sessionId);
  if (!binding) {
    return false;
  }

  // Ephemeral subagent transcripts are tracked as children, never roots.
  if (binding.ephemeral) {
    return false;
  }

  if (summaryAggregator.isTracked(sessionId)) {
    return false;
  }

  summaryAggregator.setSession(sessionId);
  logger.debug(
    `[Bot] Re-tracked topic-bound session from live event: session=${sessionId}, topic=${binding.threadId}`,
  );
  return true;
}
