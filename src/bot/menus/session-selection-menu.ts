import { t } from "../../i18n/index.js";
import { InlineKeyboard } from "grammy";

export const SESSION_CALLBACK_PREFIX = "session:";

const BACKGROUND_SESSION_CALLBACK_PREFIX = "background-session:";
export const SESSION_PAGE_CALLBACK_PREFIX = "session:page:";
export const BACKGROUND_SESSION_FETCH_EXTRA_COUNT = 1;

export type SessionListItem = {
  id: string;
  title: string;
  directory: string;
  time: {
    created: number;
  };
};

export type SessionPage = {
  sessions: SessionListItem[];
  hasNext: boolean;
  page: number;
};

export type BackgroundSessionOpenKind =
  | "assistant_response"
  | "question_asked"
  | "permission_asked";

export interface BackgroundSessionCallbackPayload {
  sessionId: string;
  kind: BackgroundSessionOpenKind | null;
}

export const BACKGROUND_SESSION_KIND_CALLBACK_MARKERS: Record<BackgroundSessionOpenKind, string> = {
  assistant_response: "a",
  question_asked: "q",
  permission_asked: "p",
};

export const BACKGROUND_SESSION_KIND_BY_CALLBACK_MARKER: Record<string, BackgroundSessionOpenKind> = {
  a: "assistant_response",
  q: "question_asked",
  p: "permission_asked",
};

export function buildSessionPageCallback(page: number): string {
  return `${SESSION_PAGE_CALLBACK_PREFIX}${page}`;
}

export function parseSessionPageCallback(data: string): number | null {
  if (!data.startsWith(SESSION_PAGE_CALLBACK_PREFIX)) {
    return null;
  }

  const rawPage = data.slice(SESSION_PAGE_CALLBACK_PREFIX.length);
  const page = Number(rawPage);
  if (!Number.isInteger(page) || page < 0) {
    return null;
  }

  return page;
}

export function parseSessionIdCallback(data: string): string | null {
  if (!data.startsWith(SESSION_CALLBACK_PREFIX)) {
    return null;
  }

  if (data.startsWith(BACKGROUND_SESSION_CALLBACK_PREFIX)) {
    return null;
  }

  const sessionId = data.slice(SESSION_CALLBACK_PREFIX.length);
  return sessionId.length > 0 ? sessionId : null;
}

export function parseBackgroundSessionCallback(
  data: string,
): BackgroundSessionCallbackPayload | null {
  if (!data.startsWith(BACKGROUND_SESSION_CALLBACK_PREFIX)) {
    return null;
  }

  const markerSeparatorIndex = data.indexOf(":");
  if (markerSeparatorIndex < 0) {
    return data.length > 0
      ? { sessionId: data.slice(BACKGROUND_SESSION_CALLBACK_PREFIX.length), kind: null }
      : null;
  }

  const marker = data.slice(0, markerSeparatorIndex);
  const sessionId = data.slice(markerSeparatorIndex + 1);
  const kind = BACKGROUND_SESSION_KIND_BY_CALLBACK_MARKER[marker];

  if (!kind || sessionId.length === 0) {
    return null;
  }

  return { sessionId, kind };
}

export function buildBackgroundSessionOpenKeyboard(
  sessionId: string,
  kind: BackgroundSessionOpenKind,
): import("grammy").InlineKeyboard {
  const marker = BACKGROUND_SESSION_KIND_CALLBACK_MARKERS[kind];
  return new InlineKeyboard().text(
    t("background.open_session_button"),
    `${BACKGROUND_SESSION_CALLBACK_PREFIX}${marker}:${sessionId}`,
  );
}