import { describe, expect, it } from "vitest";
import {
  buildCodeBlockMessage,
  languageFromFilename,
  looksLikeBinary,
} from "../../../src/bot/utils/code-block.js";

describe("bot/utils/code-block", () => {
  it("infers the Telegram language from the file extension", () => {
    expect(languageFromFilename("index.ts")).toBe("typescript");
    expect(languageFromFilename("script.py")).toBe("python");
    expect(languageFromFilename("noext")).toBe("");
    expect(languageFromFilename("archive.tar.gz")).toBe("");
  });

  it("detects binary content", () => {
    expect(looksLikeBinary("plain text")).toBe(false);
    expect(looksLikeBinary(`binary${String.fromCharCode(0)}data`)).toBe(true);
  });

  it("builds a code block message with the caption prepended", () => {
    const block = buildCodeBlockMessage("Wrote src/app.ts", "app.ts", "const x = 1;");

    expect(block).not.toBeNull();
    expect(block?.language).toBe("typescript");
    expect(block?.text.startsWith("Wrote src/app.ts\n\n")).toBe(true);
    expect(block?.text.endsWith("const x = 1;")).toBe(true);
    expect(block?.codeOffset).toBe("Wrote src/app.ts\n\n".length);
    expect(block?.codeLength).toBe("const x = 1;".length);
  });

  it("builds a code block message without a caption", () => {
    const block = buildCodeBlockMessage("   ", "app.ts", "const x = 1;");

    expect(block).not.toBeNull();
    expect(block?.text).toBe("const x = 1;");
    expect(block?.codeOffset).toBe(0);
  });

  it("returns null when the content does not fit in a text message", () => {
    const block = buildCodeBlockMessage(
      "caption",
      "app.ts",
      "x".repeat(5000),
      4096,
    );

    expect(block).toBeNull();
  });

  it("returns null for binary content", () => {
    const block = buildCodeBlockMessage(
      "caption",
      "image.png",
      `data${String.fromCharCode(0)}`,
    );

    expect(block).toBeNull();
  });
});
