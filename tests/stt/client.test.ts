import { beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({
  stt: {
    apiUrl: "",
    apiKey: "",
    protocol: "openai",
    audioField: "",
    model: "whisper-large-v3-turbo",
    language: "",
    notePrompt: "",
  },
  execFileMock: vi.fn(),
  fetchMock: vi.fn(),
}));

vi.mock("../../src/config.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/config.js")>();
  return { ...actual, config: { ...actual.config, stt: mocked.stt } };
});

vi.mock("../../src/utils/logger.js", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  return { ...actual, execFile: mocked.execFileMock };
});

async function loadClient() {
  vi.resetModules();
  return import("../../src/stt/client.js");
}

function fakeChild() {
  return {
    stdin: { write: vi.fn(), end: vi.fn() },
    on: vi.fn(),
    kill: vi.fn(),
  };
}

describe("stt/client", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    mocked.stt.apiUrl = "";
    mocked.stt.apiKey = "";
    mocked.stt.protocol = "openai";
    mocked.stt.audioField = "";
    mocked.stt.model = "whisper-large-v3-turbo";
    mocked.stt.language = "";
    vi.stubGlobal("fetch", mocked.fetchMock);
    mocked.fetchMock.mockReset().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ text: "hola mundo" }),
    });
  });

  it("requires url and key for openai, url only for plain", async () => {
    const { isSttConfigured } = await loadClient();

    expect(isSttConfigured()).toBe(false);
    mocked.stt.apiUrl = "https://api.example.com/v1";
    expect(isSttConfigured()).toBe(false);
    mocked.stt.apiKey = "k";
    expect(isSttConfigured()).toBe(true);

    mocked.stt.protocol = "plain";
    mocked.stt.apiKey = "";
    expect(isSttConfigured()).toBe(true);
    mocked.stt.apiUrl = "";
    expect(isSttConfigured()).toBe(false);
  });

  it("posts openai fields with bearer auth", async () => {
    mocked.stt.apiUrl = "https://api.example.com/v1";
    mocked.stt.apiKey = "secret";
    const { transcribeAudio } = await loadClient();

    const result = await transcribeAudio(Buffer.from("audio"), "note.ogg");

    expect(result).toEqual({ text: "hola mundo" });
    expect(mocked.fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = mocked.fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.example.com/v1/audio/transcriptions");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer secret");
    const form = init.body as FormData;
    expect(form.get("model")).toBe("whisper-large-v3-turbo");
    expect((form.get("file") as File).name).toBe("note.ogg");
  });

  it("posts plain requests to the url as-is with an audio field and no auth", async () => {
    mocked.stt.protocol = "plain";
    mocked.stt.apiUrl = "http://127.0.0.1:8000/transcribe";
    const { transcribeAudio } = await loadClient();

    const result = await transcribeAudio(Buffer.from("RIFFwav"), "note.wav");

    expect(result).toEqual({ text: "hola mundo" });
    const [url, init] = mocked.fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://127.0.0.1:8000/transcribe");
    expect(init.headers).toBeUndefined();
    const form = init.body as FormData;
    expect(form.get("model")).toBeNull();
    expect((form.get("audio") as File).name).toBe("note.wav");
    expect(mocked.execFileMock).not.toHaveBeenCalled();
  });

  it("converts non-wav input to wav for plain workers", async () => {
    mocked.stt.protocol = "plain";
    mocked.stt.apiUrl = "http://127.0.0.1:8000/transcribe";
    const child = fakeChild();
    mocked.execFileMock.mockImplementation(
      (_bin: string, _args: string[], _opts: unknown, callback: (...args: unknown[]) => void) => {
        callback(null, Buffer.from("RIFFconverted"));
        return child;
      },
    );
    const { transcribeAudio } = await loadClient();

    await transcribeAudio(Buffer.from("oggdata"), "note.oga");

    expect(mocked.execFileMock).toHaveBeenCalledTimes(1);
    const [bin, args] = mocked.execFileMock.mock.calls[0] as [string, string[]];
    expect(bin).toBe("ffmpeg");
    expect(args).toContain("pcm_s16le");
    const form = (mocked.fetchMock.mock.calls[0] as [string, RequestInit])[1].body as FormData;
    expect((form.get("audio") as File).name).toBe("note.wav");
  });

  it("serializes concurrent transcriptions", async () => {
    mocked.stt.protocol = "plain";
    mocked.stt.apiUrl = "http://127.0.0.1:8000/transcribe";
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    mocked.fetchMock.mockImplementationOnce(() => gate.then(() => ({ ok: true, json: () => Promise.resolve({ text: "one" }) })));
    mocked.fetchMock.mockImplementationOnce(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve({ text: "two" }) }),
    );
    const { transcribeAudio } = await loadClient();

    const first = transcribeAudio(Buffer.from("RIFFa"), "a.wav");
    const second = transcribeAudio(Buffer.from("RIFFb"), "b.wav");
    await new Promise((resolve) => setTimeout(resolve, 20));
    // The second request waits for the first one.
    expect(mocked.fetchMock).toHaveBeenCalledTimes(1);
    release();
    await expect(first).resolves.toEqual({ text: "one" });
    await expect(second).resolves.toEqual({ text: "two" });
    expect(mocked.fetchMock).toHaveBeenCalledTimes(2);
  });

  it("honors a custom audio field name", async () => {
    mocked.stt.protocol = "plain";
    mocked.stt.apiUrl = "http://127.0.0.1:8000/transcribe";
    mocked.stt.audioField = "file";
    const { transcribeAudio } = await loadClient();

    await transcribeAudio(Buffer.from("RIFFwav"), "note.wav");

    const form = (mocked.fetchMock.mock.calls[0] as [string, RequestInit])[1].body as FormData;
    expect((form.get("file") as File).name).toBe("note.wav");
    expect(form.get("audio")).toBeNull();
  });

  it("joins segments when the response has no text field", async () => {
    mocked.stt.apiUrl = "https://api.example.com/v1";
    mocked.stt.apiKey = "secret";
    mocked.fetchMock.mockResolvedValueOnce({
      ok: true,
      headers: { get: () => "application/json" },
      json: () =>
        Promise.resolve({ segments: [{ text: "hola" }, { text: "mundo" }] }),
    });
    const { transcribeAudio } = await loadClient();

    await expect(transcribeAudio(Buffer.from("audio"), "note.ogg")).resolves.toEqual({
      text: "hola mundo",
    });
  });

  it("accepts a bare text/plain transcription body", async () => {
    mocked.stt.protocol = "plain";
    mocked.stt.apiUrl = "http://127.0.0.1:8000/transcribe";
    mocked.fetchMock.mockResolvedValueOnce({
      ok: true,
      headers: { get: () => "text/plain" },
      text: () => Promise.resolve("  hola mundo\n"),
    });
    const { transcribeAudio } = await loadClient();

    await expect(transcribeAudio(Buffer.from("RIFFwav"), "note.wav")).resolves.toEqual({
      text: "hola mundo",
    });
  });
});
