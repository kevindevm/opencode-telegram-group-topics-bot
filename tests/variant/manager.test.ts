import { describe, expect, it } from "vitest";
import {
  formatVariantForButton,
  formatVariantForDisplay,
} from "../../src/variant/manager.js";

describe("variant/manager formatting", () => {
  it("formats known variants", () => {
    expect(formatVariantForButton("high")).toBe("💡 High");
    expect(formatVariantForDisplay("low")).toBe("Low");
  });

  it("falls back to default for empty ids", () => {
    expect(formatVariantForButton("")).toBe("💡 Default");
    expect(formatVariantForButton("   ")).toBe("💡 Default");
    expect(formatVariantForDisplay("")).toBe("Default");
  });
});
