import { InlineKeyboard, type Context } from "grammy";
import { config } from "../config.js";
import { t } from "../i18n/index.js";
import { logger } from "../utils/logger.js";
import { getThreadSendOptions } from "../bot/scope.js";
import { opencodeClient } from "../opencode/client.js";
import type { Result } from "../opencode/v2/client.js";

/** The V2 adapter exposes session.background at runtime; the declared client type does not. */
const backgroundCapableClient = opencodeClient as unknown as {
  session: {
    background: (params: { sessionID: string }) => Promise<Result<true>>;
  };
};

/**
 * Offers to move a long-running shell command to the background (⏪ button,
 * `session.background` on V2) instead of leaving the user staring at the
 * stream. The offer only pops up when a bash/execute tool is still running
 * after BACKGROUND_OFFER_AFTER_SEC (default 30s), so quick commands never
 * spam.
 */

export const BACKGROUND_OFFER_PREFIX = "bg:";

/** Shell tools worth backgrounding; everything else never triggers an offer. */
const BACKGROUNDABLE_TOOLS = new Set(["bash", "execute"]);

const MAX_COMMAND_PREVIEW_LENGTH = 120;

interface OfferApi {
  sendMessage: (
    chatId: number,
    text: string,
    options?: Record<string, unknown>,
  ) => Promise<{ message_id: number }>;
  editMessageText: (
    chatId: number,
    messageId: number,
    text: string,
    options?: Record<string, unknown>,
  ) => Promise<unknown>;
  deleteMessage: (chatId: number, messageId: number) => Promise<unknown>;
}

interface NoteToolBackgroundStateInput {
  api: OfferApi | null;
  sessionId: string;
  callId: string;
  tool: string;
  status: string | undefined;
  commandPreview: string;
  chatId: number;
  threadId: number | null;
  /** Test-only override for the running-time threshold. */
  delayMs?: number;
}

interface PendingOffer {
  chatId: number;
  messageId: number;
  callId: string;
  pressed: boolean;
  api: OfferApi;
  expiresTimer?: ReturnType<typeof setTimeout>;
}

const pendingTimers = new Map<string, ReturnType<typeof setTimeout>>();
const runningCallIds = new Map<string, Set<string>>();
const sentOffers = new Map<string, PendingOffer>();

/**
 * Unpressed offers must not linger forever: an abandoned session (restart
 * mid-run, deleted topic) would otherwise keep the message and the entry.
 */
const OFFER_TTL_MS = 10 * 60 * 1000;

/**
 * Best-effort removal of an offer message: cleanup paths (session settle,
 * shutdown, tests with reset mocks) must never throw, and some api doubles
 * do not return real promises.
 */
function bestEffortDeleteOfferMessage(offer: PendingOffer): void {
  try {
    const result = offer.api.deleteMessage(offer.chatId, offer.messageId) as unknown;
    if (result && typeof (result as Promise<unknown>).catch === "function") {
      (result as Promise<unknown>).catch(() => {});
    }
  } catch {
    // Intentionally ignored: cleanup must not throw.
  }
}

function retireOffer(sessionId: string, deleteMessage: boolean): void {
  const offer = sentOffers.get(sessionId);
  if (!offer) {
    return;
  }
  sentOffers.delete(sessionId);
  if (offer.expiresTimer) {
    clearTimeout(offer.expiresTimer);
  }
  if (deleteMessage && !offer.pressed) {
    bestEffortDeleteOfferMessage(offer);
  }
}

function pendingKey(sessionId: string, callId: string): string {
  return `${sessionId}:${callId}`;
}

function clearPendingTimer(sessionId: string, callId: string): void {
  const timer = pendingTimers.get(pendingKey(sessionId, callId));
  if (timer) {
    clearTimeout(timer);
    pendingTimers.delete(pendingKey(sessionId, callId));
  }
}

function trackRunningCall(sessionId: string, callId: string): void {
  let running = runningCallIds.get(sessionId);
  if (!running) {
    running = new Set();
    runningCallIds.set(sessionId, running);
  }
  running.add(callId);
}

function untrackRunningCall(sessionId: string, callId: string): boolean {
  const running = runningCallIds.get(sessionId);
  if (!running) {
    return true;
  }
  running.delete(callId);
  if (running.size === 0) {
    runningCallIds.delete(sessionId);
    return true;
  }
  return false;
}

function truncateCommandPreview(commandPreview: string): string {
  const singleLine = commandPreview.replace(/\s+/g, " ").trim();
  if (singleLine.length <= MAX_COMMAND_PREVIEW_LENGTH) {
    return singleLine;
  }
  return `${singleLine.slice(0, MAX_COMMAND_PREVIEW_LENGTH - 3).trimEnd()}...`;
}

async function sendOfferMessage(input: {
  api: OfferApi;
  sessionId: string;
  callId: string;
  commandPreview: string;
  chatId: number;
  threadId: number | null;
}): Promise<void> {
  const { api, sessionId, callId, chatId } = input;
  const keyboard = new InlineKeyboard().text(
    t("tool.background_button"),
    `${BACKGROUND_OFFER_PREFIX}${sessionId}`,
  );

  try {
    const sent = await api.sendMessage(chatId, t("tool.background_offer", {
      command: truncateCommandPreview(input.commandPreview) || t("tool.background_no_command"),
    }), {
      reply_markup: keyboard,
      ...getThreadSendOptions(input.threadId),
    });
    sentOffers.set(sessionId, {
      chatId,
      messageId: sent.message_id,
      callId,
      pressed: false,
      api,
    });
    const offer = sentOffers.get(sessionId);
    if (offer) {
      offer.expiresTimer = setTimeout(() => {
        retireOffer(sessionId, true);
      }, OFFER_TTL_MS);
    }
    logger.info("[BackgroundOffer] Offered background move", {
      sessionId,
      callId,
      messageId: sent.message_id,
    });
  } catch (error) {
    logger.warn("[BackgroundOffer] Failed to send background offer", {
      sessionId,
      callId,
      error,
    });
  }
}

/**
 * Feeds tool state changes into the offer tracker. Call for every tool event;
 * only bash/execute in "running" status arm the timer, terminal statuses
 * disarm it and retire a live offer for the same call.
 */
export function noteToolBackgroundState(input: NoteToolBackgroundStateInput): void {
  const { api, sessionId, callId, tool, status } = input;
  if (!BACKGROUNDABLE_TOOLS.has(tool)) {
    return;
  }

  if (status === "running") {
    trackRunningCall(sessionId, callId);
    if (!api || pendingTimers.has(pendingKey(sessionId, callId)) || sentOffers.has(sessionId)) {
      return;
    }
    const delayMs = input.delayMs ?? config.bot.backgroundOfferAfterSec * 1000;
    const captured = { ...input, api };
    pendingTimers.set(
      pendingKey(sessionId, callId),
      setTimeout(() => {
        pendingTimers.delete(pendingKey(sessionId, callId));
        if (sentOffers.has(sessionId)) {
          return;
        }
        void sendOfferMessage(captured);
      }, delayMs),
    );
    return;
  }

  if (status === "completed" || status === "error") {
    clearPendingTimer(sessionId, callId);
    const noRunningLeft = untrackRunningCall(sessionId, callId);
    // Drop the offer as soon as nothing is still running in the session,
    // regardless of which call raised it: with overlapping long tools the
    // finishing call is often not the one that triggered the offer.
    if (noRunningLeft) {
      retireOffer(sessionId, true);
    }
  }
}

/** Drops pending timers (and an unpressed offer message) when a session settles. */
export function clearSessionBackgroundOffers(sessionId: string): void {
  for (const key of Array.from(pendingTimers.keys())) {
    if (key.startsWith(`${sessionId}:`)) {
      clearTimeout(pendingTimers.get(key));
      pendingTimers.delete(key);
    }
  }
  runningCallIds.delete(sessionId);
  retireOffer(sessionId, true);
}

/** Drops every pending timer and unpressed offer (shutdown path). */
export function clearAllBackgroundOffers(): void {
  for (const timer of pendingTimers.values()) {
    clearTimeout(timer);
  }
  pendingTimers.clear();
  runningCallIds.clear();
  for (const sessionId of Array.from(sentOffers.keys())) {
    retireOffer(sessionId, true);
  }
}

/** Drops pending timers (and an unpressed offer message) when a session settles. */
export function resetBackgroundOfferStateForTests(): void {
  clearAllBackgroundOffers();
}

function parseOfferSessionId(data: string | undefined): string | null {
  if (!data || !data.startsWith(BACKGROUND_OFFER_PREFIX)) {
    return null;
  }
  const sessionId = data.slice(BACKGROUND_OFFER_PREFIX.length);
  return sessionId.length > 0 ? sessionId : null;
}

/** Handles the ⏪ "send to background" button. Returns true when consumed. */
export async function handleToolBackgroundCallback(ctx: Context): Promise<boolean> {
  const sessionId = parseOfferSessionId(ctx.callbackQuery?.data);
  if (!sessionId) {
    return false;
  }

  const message = ctx.callbackQuery?.message;
  const messageId =
    message && "message_id" in message && typeof message.message_id === "number"
      ? message.message_id
      : null;

  try {
    const { data, error } = await backgroundCapableClient.session.background({
      sessionID: sessionId,
    });
    if (error || data !== true) {
      throw error ?? new Error("background() returned no confirmation");
    }
  } catch (err) {
    logger.warn("[BackgroundOffer] session.background failed", { sessionId, error: err });
    await ctx.answerCallbackQuery({ text: t("tool.background_error") }).catch(() => {});
    return true;
  }

  const offer = sentOffers.get(sessionId);
  if (offer) {
    offer.pressed = true;
    // Consumed: no need for the TTL cleanup anymore; the entry is retired
    // when the running tool settles.
    if (offer.expiresTimer) {
      clearTimeout(offer.expiresTimer);
      offer.expiresTimer = undefined;
    }
  }

  await ctx.answerCallbackQuery({ text: t("tool.background_started_callback") }).catch(() => {});
  if (ctx.chat && messageId !== null) {
    await ctx.api
      .editMessageText(ctx.chat.id, messageId, t("tool.background_started"))
      .catch(() => {});
  }
  return true;
}
