import { describe, expect, it } from "vitest";
import {
  buildCodeBlockMessages,
  languageFromFilename,
  looksLikeBinary,
} from "../../../src/bot/utils/code-block.js";

describe("bot/utils/code-block", () => {
  it("infers the Telegram language from the file extension", () => {
    expect(languageFromFilename("index.ts")).toBe("typescript");
    expect(languageFromFilename("script.py")).toBe("python");
    expect(languageFromFilename("noext")).toBe("");
    expect(languageFromFilename("archive.tar.gz")).toBe("");
    expect(languageFromFilename("edit_app.ts.diff")).toBe("diff");
  });

  it("detects binary content", () => {
    expect(looksLikeBinary("plain text")).toBe(false);
    expect(looksLikeBinary(`binary${String.fromCharCode(0)}data`)).toBe(true);
  });

  it("builds a single code block message with the caption prepended", () => {
    const blocks = buildCodeBlockMessages("Wrote src/app.ts", "app.ts", "const x = 1;");

    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.language).toBe("typescript");
    expect(blocks[0]?.text.startsWith("Wrote src/app.ts\n\n")).toBe(true);
    expect(blocks[0]?.text.endsWith("const x = 1;")).toBe(true);
    expect(blocks[0]?.codeOffset).toBe("Wrote src/app.ts\n\n".length);
    expect(blocks[0]?.codeLength).toBe("const x = 1;".length);
  });

  it("builds a code block message without a caption", () => {
    const blocks = buildCodeBlockMessages("   ", "app.ts", "const x = 1;");

    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.text).toBe("const x = 1;");
    expect(blocks[0]?.codeOffset).toBe(0);
  });

  it("splits long content into several blocks instead of dropping it", () => {
    const lines = Array.from({ length: 600 }, (_, index) => `line ${index} content`);
    const blocks = buildCodeBlockMessages("caption", "app.ts", lines.join("\n"), 4096);

    expect(blocks.length).toBeGreaterThan(1);
    for (const block of blocks) {
      expect(block.text.length).toBeLessThanOrEqual(4096);
      expect(block.language).toBe("typescript");
    }
    expect(blocks[0]?.text.startsWith("caption\n\n")).toBe(true);
    expect(blocks.slice(1).every((block) => !block.text.startsWith("caption"))).toBe(true);

    const rejoined = blocks
      .map((block, index) => (index === 0 ? block.text.slice("caption\n\n".length) : block.text))
      .join("\n");
    expect(rejoined).toBe(lines.join("\n"));
  });

  it("hard-splits a single huge line so nothing is lost", () => {
    const blocks = buildCodeBlockMessages("caption", "app.ts", "x".repeat(5000), 4096);

    expect(blocks.length).toBeGreaterThan(1);
    for (const block of blocks) {
      expect(block.text.length).toBeLessThanOrEqual(4096);
    }
    expect(blocks.map((block) => block.text).join("")).toContain("x".repeat(5000));
  });

  it("returns no blocks for binary content", () => {
    const blocks = buildCodeBlockMessages(
      "caption",
      "image.png",
      `data${String.fromCharCode(0)}`,
    );

    expect(blocks).toHaveLength(0);
  });
});
