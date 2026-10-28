import { execFile } from "node:child_process";
import { config } from "../config.js";
import { logger } from "../utils/logger.js";

const DEFAULT_TIMEOUT_MS = 60_000;
const FFMPEG_TIMEOUT_MS = 30_000;
// The reference worker is a single CPU instance: transcribe one at a time so
// concurrent voice notes do not pile up server-side (this only serializes
// within this process; a second bot transcribing at once still waits there).
let transcriptionQueue: Promise<void> = Promise.resolve();

export interface SttResult {
  text: string;
}

/**
 * Returns true if STT is configured. The `openai` protocol needs URL + key;
 * the `plain` protocol (minimal custom workers without auth) needs only URL.
 */
export function isSttConfigured(): boolean {
  if (config.stt.protocol === "plain") {
    return Boolean(config.stt.apiUrl);
  }

  return Boolean(config.stt.apiUrl && config.stt.apiKey);
}

function runFfmpeg(input: Buffer, args: string[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = execFile("ffmpeg", args, { encoding: "buffer", maxBuffer: 64 * 1024 * 1024 }, (error, stdout, _stderr) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(stdout as Buffer);
    });

    child.stdin?.write(input);
    child.stdin?.end();

    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`ffmpeg conversion timed out after ${FFMPEG_TIMEOUT_MS}ms`));
    }, FFMPEG_TIMEOUT_MS);
    timeout.unref?.();

    child.on("close", () => clearTimeout(timeout));
  });
}

/**
 * Converts to 16kHz mono WAV when the input is not already wav: minimal
 * workers like the reference one only accept wav.
 */
export async function ensureWav(audioBuffer: Buffer, filename: string): Promise<{
  buffer: Buffer;
  filename: string;
}> {
  if (/\.wav$/i.test(filename)) {
    return { buffer: audioBuffer, filename };
  }

  logger.debug(`[STT] Converting ${filename} to wav before transcription`);
  try {
    const buffer = await runFfmpeg(audioBuffer, [
      "-hide_banner",
      "-loglevel",
      "error",
      "-i",
      "pipe:0",
      "-ar",
      "16000",
      "-ac",
      "1",
      "-c:a",
      "pcm_s16le",
      "-f",
      "wav",
      "pipe:1",
    ]);
    const base = filename.replace(/\.[^.]*$/, "") || "audio";
    return { buffer, filename: `${base}.wav` };
  } catch (error) {
    throw new Error(
      `STT wav conversion failed (is ffmpeg installed?): ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function audioField(defaultField: string): string {
  const configured = config.stt.audioField?.trim();
  return configured ? configured : defaultField;
}

async function transcribeOpenAi(audioBuffer: Buffer, filename: string): Promise<SttResult> {
  if (!config.stt.apiKey) {
    throw new Error("STT is not configured: STT_API_URL and STT_API_KEY are required");
  }

  const url = `${config.stt.apiUrl}/audio/transcriptions`;

  const formData = new FormData();
  formData.append(audioField("file"), new Blob([new Uint8Array(audioBuffer)]), filename);
  formData.append("model", config.stt.model);
  formData.append("response_format", "json");

  if (config.stt.language) {
    formData.append("language", config.stt.language);
  }

  logger.debug(
    `[STT] Sending transcription request: url=${url}, model=${config.stt.model}, filename=${filename}, size=${audioBuffer.length} bytes`,
  );

  return postTranscription(url, formData, { Authorization: `Bearer ${config.stt.apiKey}` });
}

async function transcribePlain(audioBuffer: Buffer, filename: string): Promise<SttResult> {
  if (!config.stt.apiUrl) {
    throw new Error("STT is not configured: STT_API_URL is required");
  }

  // Minimal workers take wav only and expose the full endpoint in the URL.
  const { buffer, filename: wavName } = await ensureWav(audioBuffer, filename);

  const formData = new FormData();
  formData.append(audioField("audio"), new Blob([new Uint8Array(buffer)]), wavName);

  logger.debug(
    `[STT] Sending plain transcription request: url=${config.stt.apiUrl}, filename=${wavName}, size=${buffer.length} bytes`,
  );

  return postTranscription(config.stt.apiUrl, formData);
}

async function postTranscription(
  url: string,
  formData: FormData,
  headers?: Record<string, string>,
): Promise<SttResult> {
  const timeoutMs = config.stt.timeoutMs || DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: "POST",
      ...(headers ? { headers } : {}),
      body: formData,
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      throw new Error(
        `STT API returned HTTP ${response.status}: ${errorBody || response.statusText}`,
      );
    }

    const text = await extractTranscriptionText(response);
    logger.debug(`[STT] Transcription result: ${text.length} chars`);

    return { text };
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error(`STT request timed out after ${timeoutMs}ms`);
    }

    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

interface SttJsonResponse {
  text?: unknown;
  segments?: unknown;
}

/**
 * Tolerates the response shapes in the wild: `{"text": ...}` (OpenAI and
 * most compatibles), `{"segments": [{text}, ...]}` (whisper.cpp-style
 * verbose servers), or a bare text/plain body.
 */
async function extractTranscriptionText(response: Response): Promise<string> {
  const contentType = response.headers?.get?.("content-type") ?? "";

  // No content type (e.g. minimal mocks) means JSON, like the historical
  // behavior; only an explicit non-JSON type takes the text path.
  if (contentType && !/(\b|\+)json\b/.test(contentType)) {
    const body = (await response.text()).trim();
    if (!body) {
      throw new Error("STT API returned an empty non-JSON response");
    }
    return body;
  }

  const data = (await response.json()) as SttJsonResponse;

  if (typeof data.text === "string" && data.text.trim()) {
    return data.text;
  }

  if (Array.isArray(data.segments)) {
    const joined = data.segments
      .map((segment) =>
        typeof segment === "string"
          ? segment
          : typeof (segment as { text?: unknown })?.text === "string"
            ? ((segment as { text: string }).text as string)
            : "",
      )
      .join(" ")
      .trim();
    if (joined) {
      return joined;
    }
  }

  throw new Error("STT API response does not contain a text field");
}

/**
 * Transcribes an audio buffer. OpenAI-compatible (`openai`) and minimal
 * custom workers (`plain`, e.g. POST /transcribe with an `audio` wav field)
 * are supported via STT_PROTOCOL. Requests are serialized: reference workers
 * are single CPU instances.
 */
export async function transcribeAudio(audioBuffer: Buffer, filename: string): Promise<SttResult> {
  if (!isSttConfigured()) {
    throw new Error("STT is not configured: set STT_API_URL (and STT_API_KEY for openai)");
  }

  const run = transcriptionQueue
    .catch(() => {})
    .then(() =>
      config.stt.protocol === "plain"
        ? transcribePlain(audioBuffer, filename)
        : transcribeOpenAi(audioBuffer, filename),
    );

  // Keep the chain alive for the next caller without swallowing this result.
  transcriptionQueue = run.then(
    () => {},
    () => {},
  );

  return run;
}
