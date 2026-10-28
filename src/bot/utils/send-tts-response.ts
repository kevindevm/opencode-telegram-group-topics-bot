import { InputFile } from "grammy";
import { getThreadSendOptions } from "../scope.js";
import { getPromptResponseMode } from "../handlers/prompt.js";
import { isTtsConfigured, synthesizeSpeech, type TtsResult } from "../../tts/client.js";
import { t } from "../../i18n/index.js";
import { logger } from "../../utils/logger.js";
import { runWithRateLimitRetries } from "../telegram-rate-limiter.js";

const MAX_TTS_INPUT_CHARS = 4_000;

interface TelegramAudioApi {
  sendAudio: (
    chatId: number,
    audio: InputFile,
    other?: Record<string, unknown>,
  ) => Promise<unknown>;
  sendMessage: (chatId: number, text: string, other?: Record<string, unknown>) => Promise<unknown>;
}

interface SendTtsResponseParams {
  api: TelegramAudioApi;
  sessionId: string;
  chatId: number;
  threadId: number | null;
  text: string;
  consumeResponseMode?: (sessionId: string) => "text_only" | "text_and_tts" | null;
  isTtsConfigured?: () => boolean;
  synthesizeSpeech?: (text: string) => Promise<TtsResult>;
}

export async function sendTtsResponseForSession({
  api,
  sessionId,
  chatId,
  threadId,
  text,
  consumeResponseMode: consumeResponseModeImpl = getPromptResponseMode,
  isTtsConfigured: isTtsConfiguredImpl = isTtsConfigured,
  synthesizeSpeech: synthesizeSpeechImpl = synthesizeSpeech,
}: SendTtsResponseParams): Promise<boolean> {
  const responseMode = consumeResponseModeImpl(sessionId);
  if (responseMode !== "text_and_tts") {
    return false;
  }

  const normalizedText = text.trim();
  if (!normalizedText) {
    return false;
  }

  if (!isTtsConfiguredImpl()) {
    logger.info(`[TTS] Skipping audio reply for session ${sessionId}: TTS is not configured`);
    return false;
  }

  if (normalizedText.length > MAX_TTS_INPUT_CHARS) {
    logger.warn(
      `[TTS] Skipping audio reply for session ${sessionId}: text length ${normalizedText.length} exceeds limit ${MAX_TTS_INPUT_CHARS}`,
    );
    return false;
  }

  try {
    const speech = await synthesizeSpeechImpl(normalizedText);

    // Bounded 429 budget shared with the rest of the bot: a persistent
    // storm throws RateLimitExceededError (caught below) instead of wedging
    // the final-delivery session chain here forever.
    await runWithRateLimitRetries(`tts:${sessionId}`, () =>
      api.sendAudio(chatId, new InputFile(speech.buffer, speech.filename), {
        ...getThreadSendOptions(threadId),
      }),
    );

    logger.info(`[TTS] Sent audio reply for session ${sessionId}`);
    return true;
  } catch (error) {
    logger.warn(`[TTS] Failed to send audio reply for session ${sessionId}`, error);

    await api
      .sendMessage(chatId, t("tts.failed"), {
        ...getThreadSendOptions(threadId),
      })
      .catch((sendError) => {
        logger.warn(`[TTS] Failed to send audio error message for session ${sessionId}`, sendError);
      });

    return false;
  }
}
