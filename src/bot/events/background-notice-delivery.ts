import { t } from "../../i18n/index.js";
import type { BackgroundSessionNotification } from "../../app/managers/background-session-manager.js";
import { getTopicBindingBySessionId } from "../../topic/manager.js";
import { buildBackgroundSessionOpenKeyboard } from "../menus/session-selection-menu.js";
import type { SessionTargetPolicy, TelegramEventDelivery } from "./telegram-event-delivery.js";
import { DISPLAY_FLAG, isDisplayVisible } from "../../display/manager.js";
import { getThreadSendOptions } from "../scope.js";
import { logger } from "../../utils/logger.js";

function formatShortSessionId(sessionId: string): string {
  return sessionId.length <= 8 ? sessionId : sessionId.slice(0, 8);
}

function getBackgroundSessionLabel(notification: BackgroundSessionNotification): string {
  // Name the destination tab, not the session id: with several sessions
  // active the raw id tells the user nothing about where to look.
  const topicName = getTopicBindingBySessionId(notification.sessionId)?.topicName?.trim();
  if (topicName) {
    return topicName;
  }

  const title = notification.sessionTitle?.trim();
  if (title) {
    return title;
  }

  return t("background.session_fallback", {
    id: formatShortSessionId(notification.sessionId),
  });
}

/**
 * One live pointer per session and kind: every new request re-fires the
 * event, but the button only opens the session, so repeats add noise
 * instead of information. Entries expire so a deleted notice never
 * suppresses future ones forever.
 */
const LIVE_NOTICE_TTL_MS = 5 * 60 * 1000;
const liveNotices = new Map<string, number>();

function liveNoticeKey(sessionId: string, kind: BackgroundSessionNotification["kind"]): string {
  return `${sessionId}:${kind}`;
}

function hasLiveNotice(sessionId: string, kind: BackgroundSessionNotification["kind"]): boolean {
  const sentAt = liveNotices.get(liveNoticeKey(sessionId, kind));
  if (sentAt === undefined) {
    return false;
  }
  if (Date.now() - sentAt >= LIVE_NOTICE_TTL_MS) {
    liveNotices.delete(liveNoticeKey(sessionId, kind));
    return false;
  }
  return true;
}

/** The user engaged with the session: the next event may notify again. */
export function clearBackgroundNoticesForSession(sessionId: string): void {
  for (const key of Array.from(liveNotices.keys())) {
    if (key.startsWith(`${sessionId}:`)) {
      liveNotices.delete(key);
    }
  }
}

export function __resetBackgroundNoticesForTests(): void {
  liveNotices.clear();
}

function formatBackgroundSessionNotification(notification: BackgroundSessionNotification): string {
  const session = getBackgroundSessionLabel(notification);

  switch (notification.kind) {
    case "assistant_response":
      return t("background.assistant_response", { session });
    case "question_asked":
      return t("background.question_asked", { session });
    case "permission_asked":
      return t("background.permission_asked", { session });
  }
}

/** Sends a background-session notice to the destination of its own session. */
export function createBackgroundNoticeDelivery(
  policy: Pick<SessionTargetPolicy, "getDestination">,
  delivery: TelegramEventDelivery,
): (notification: BackgroundSessionNotification) => Promise<void> {
  return async (notification) => {
    if (!isDisplayVisible(DISPLAY_FLAG.BACKGROUND)) {
      return;
    }

    const destination = policy.getDestination(notification.sessionId);
    if (!destination) {
      return;
    }

    if (hasLiveNotice(notification.sessionId, notification.kind)) {
      logger.debug("[BackgroundNotice] Skipping duplicate live notice", {
        sessionId: notification.sessionId,
        kind: notification.kind,
      });
      return;
    }

    await delivery.sendText(destination, formatBackgroundSessionNotification(notification), {
      reply_markup: buildBackgroundSessionOpenKeyboard(notification.sessionId, notification.kind),
      ...getThreadSendOptions(destination.threadId ?? null),
    });
    liveNotices.set(liveNoticeKey(notification.sessionId, notification.kind), Date.now());
  };
}