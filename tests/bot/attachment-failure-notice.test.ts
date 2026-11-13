import { describe, expect, it } from "vitest";
import { buildAttachmentFailureNotice } from "../../src/bot/index.js";

describe("bot attachment failure notice", () => {
  it("names the undelivered file in the turn warning", () => {
    expect(buildAttachmentFailureNotice("report.txt")).toBe(
      "(attachment report.txt could not be delivered)",
    );
  });

  it("falls back to a generic label for blank filenames", () => {
    expect(buildAttachmentFailureNotice("   ")).toBe("(attachment attachment could not be delivered)");
  });
});
