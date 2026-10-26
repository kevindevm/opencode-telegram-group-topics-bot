import { describe, expect, it } from "vitest";
import { formatTopicTitle, stripMarkdownForTopicTitle } from "../../src/topic/title-format.js";

describe("topic/title-format", () => {
  it("strips bold and italic markers", () => {
    expect(stripMarkdownForTopicTitle("**Clonación forense** del repo")).toBe(
      "Clonación forense del repo",
    );
    expect(stripMarkdownForTopicTitle("__bold__ and *italic* and _also italic_")).toBe(
      "bold and italic and also italic",
    );
  });

  it("keeps underscores inside words intact", () => {
    expect(stripMarkdownForTopicTitle("fix snake_case_title here")).toBe(
      "fix snake_case_title here",
    );
  });

  it("strips code, strikethrough, headings, quotes and links", () => {
    expect(stripMarkdownForTopicTitle("`run.ts` review")).toBe("run.ts review");
    expect(stripMarkdownForTopicTitle("~~old~~ new")).toBe("old new");
    expect(stripMarkdownForTopicTitle("## Sincronizar fork")).toBe("Sincronizar fork");
    expect(stripMarkdownForTopicTitle("> quoted title")).toBe("quoted title");
    expect(stripMarkdownForTopicTitle("[ver informe](https://example.com/x) ya")).toBe(
      "ver informe ya",
    );
  });

  it("collapses multiline titles into one line", () => {
    expect(stripMarkdownForTopicTitle("Primera línea\nSegunda línea")).toBe(
      "Primera línea Segunda línea",
    );
  });

  it("falls back when only markers remain", () => {
    expect(formatTopicTitle("****", "Respaldo")).toBe("Respaldo");
    expect(formatTopicTitle("**Listo**")).toBe("Listo");
  });

  it("never splits surrogate pairs when truncating", () => {
    const longTitle = `🧩 ${"🚀".repeat(200)} fin`;
    const result = formatTopicTitle(longTitle);
    expect(result.length).toBeLessThanOrEqual(128);
    expect(Array.from(result).length).toBeLessThanOrEqual(128);
    expect(result.endsWith("...")).toBe(true);
    // No lone surrogates: re-encoding must round-trip.
    expect(Array.from(result).join("")).toBe(result);
    expect(result).not.toMatch(/�/);
  });
});
