import fs from "node:fs/promises";
import * as path from "node:path";
import { InputFile, type Bot, type Context } from "grammy";
import { fileURLToPath } from "url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TEMP_DIR = path.join(__dirname, "..", "..", ".tmp");
const TELEGRAM_MAX_FILE_BYTES = 50 * 1024 * 1024;
const TELEGRAM_CAPTION_LIMIT = 1024;

type TelegramApi = Bot<Context>["api"];
type SendMessageOptions = Parameters<TelegramApi["sendMessage"]>[2];
type SendDocumentOptions = Parameters<TelegramApi["sendDocument"]>[2];

/** Where a session's messages go. */
export interface TelegramDestination {
  api: TelegramApi;
  chatId: number;
  /** Topic thread for forum groups; omitted for DMs/General. */
  threadId?: number | null;
}

export interface SessionTargetPolicy {
  getDestination(sessionId: string): TelegramDestination | null;
}

export class TelegramEventDelivery {
  private nextDraftId = 1;

  async sendText(
    destination: TelegramDestination,
    text: string,
    options?: SendMessageOptions,
  ): Promise<number> {
    const sentMessage = options
      ? await destination.api.sendMessage(destination.chatId, text, options)
      : await destination.api.sendMessage(destination.chatId, text);
    return sentMessage.message_id;
  }

  async editText(
    destination: TelegramDestination,
    messageId: number,
    text: string,
  ): Promise<void> {
    try {
      await destination.api.editMessageText(destination.chatId, messageId, text);
    } catch (error) {
      // Tolerate no-op edits and edits of already-deleted messages.
      const errorMessage = error instanceof Error ? error.message.toLowerCase() : "";
      if (
        errorMessage.includes("message is not modified") ||
        errorMessage.includes("message to edit not found") ||
        errorMessage.includes("message identifier is not specified")
      ) {
        return;
      }
      throw error;
    }
  }

  async deleteText(
    destination: TelegramDestination,
    messageId: number,
  ): Promise<void> {
    await destination.api.deleteMessage(destination.chatId, messageId).catch((error) => {
      if (
        error instanceof Error &&
        (error.message.includes("message to delete not found") ||
          error.message.includes("message identifier is not specified"))
      ) {
        return;
      }
      throw error;
    });
  }

  async sendDocument(
    destination: TelegramDestination,
    fileData: { filename: string; buffer: Buffer; caption?: string },
    options?: SendDocumentOptions,
  ): Promise<void> {
    // Never trust tool output for a filesystem path: strip directories and
    // make the temp name unique so concurrent sends cannot overwrite or
    // read each other's files.
    const safeBasename =
      path.basename(fileData.filename).replace(/[^\w.\-]+/g, "_") || "file.bin";
    const uniqueName = `${Date.now()}-${Math.floor(Math.random() * 1e9)}-${safeBasename}`;
    const tempFilePath = path.join(TEMP_DIR, uniqueName);
    const caption =
      fileData.caption && fileData.caption.length > TELEGRAM_CAPTION_LIMIT
        ? `${fileData.caption.slice(0, TELEGRAM_CAPTION_LIMIT - 1)}…`
        : fileData.caption;

    if (fileData.buffer.length > TELEGRAM_MAX_FILE_BYTES) {
      throw new Error(
        `Refusing to send ${(fileData.buffer.length / 1024 / 1024).toFixed(1)}MB document to Telegram (bot limit is 50MB)`,
      );
    }

    try {
      await fs.mkdir(TEMP_DIR, { recursive: true });
      await fs.writeFile(tempFilePath, fileData.buffer);

      await destination.api.sendDocument(
        destination.chatId,
        new InputFile(tempFilePath, safeBasename),
        {
          caption,
          ...options,
        },
      );
    } finally {
      await fs.unlink(tempFilePath).catch(() => {});
    }
  }

  sendRenderedPart(
    _destination: TelegramDestination,
    _part: unknown,
    _options?: unknown,
    _allowPlainFallback?: boolean,
  ) {
    return { messageId: 1, deliveredSignature: "" };
  }

  async editRenderedPart(
    _destination: TelegramDestination,
    _messageId: number,
    _part: unknown,
    _options?: unknown,
  ): Promise<{ deliveredSignature: string }> {
    return { deliveredSignature: "" };
  }

  async sendDraftPart(_destination: TelegramDestination, _part: unknown) {
    const draftId = this.nextDraftId;
    this.nextDraftId += 1;
    return { messageId: draftId, deliveredSignature: "" };
  }

  editDraftPart(_destination: TelegramDestination, _draftId: number, _part: unknown) {
    return { deliveredSignature: "" };
  }

  completeDraftPart(
    _destination: TelegramDestination,
    _part: unknown,
    _options?: unknown,
  ) {
    return { deliveredSignature: "" };
  }

  resetDraftIds(): void {
    this.nextDraftId = 1;
  }
}
