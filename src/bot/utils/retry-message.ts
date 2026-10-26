import { t } from "../../i18n/index.js";

export interface SessionRetryDisplayInput {
  message: string;
  /** Epoch timestamp of the next attempt, milliseconds or seconds. */
  next?: number;
  now?: number;
  maxLength?: number;
}

const DEFAULT_MAX_LENGTH = 3500;
const MS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;
/** Below this the timestamp is read as seconds instead of milliseconds. */
const MS_EPOCH_THRESHOLD = 1_000_000_000_000;
const S_EPOCH_THRESHOLD = 1_000_000_000;

function normalizeWaitMs(next: number, now: number): number | null {
  if (!Number.isFinite(next) || next <= 0) {
    return null;
  }

  const atMs = next < MS_EPOCH_THRESHOLD && next > S_EPOCH_THRESHOLD ? next * MS_PER_SECOND : next;
  const waitMs = atMs - now;
  return waitMs > 0 ? waitMs : null;
}

export function formatRetryWait(waitMs: number): string {
  const seconds = Math.max(1, Math.ceil(waitMs / MS_PER_SECOND));
  if (seconds < SECONDS_PER_MINUTE) {
    return `${seconds}s`;
  }

  const minutes = Math.floor(seconds / SECONDS_PER_MINUTE);
  const rest = seconds % SECONDS_PER_MINUTE;
  return rest === 0 ? `${minutes}m` : `${minutes}m ${rest}s`;
}

/**
 * Builds the retry notice for a session. When the server reports when the
 * next attempt runs, the notice shows the countdown; otherwise it falls
 * back to the generic retry text.
 */
export function buildSessionRetryMessage(input: SessionRetryDisplayInput): string {
  const { message, next, now = Date.now(), maxLength = DEFAULT_MAX_LENGTH } = input;
  const normalized = message.trim() || t("common.unknown_error");
  const truncated =
    normalized.length > maxLength ? `${normalized.slice(0, maxLength - 3)}...` : normalized;

  const waitMs = typeof next === "number" ? normalizeWaitMs(next, now) : null;
  if (waitMs === null) {
    return t("bot.session_retry", { message: truncated });
  }

  return t("bot.session_retry_wait", { message: truncated, wait: formatRetryWait(waitMs) });
}
