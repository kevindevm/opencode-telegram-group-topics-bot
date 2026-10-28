import { describe, expect, it } from "vitest";
import { normalizeLogLevel, redactSecrets } from "../../src/utils/logger.js";

describe("utils/logger normalizeLogLevel", () => {
  it("accepts lowercase levels", () => {
    expect(normalizeLogLevel("debug")).toBe("debug");
    expect(normalizeLogLevel("info")).toBe("info");
    expect(normalizeLogLevel("warn")).toBe("warn");
    expect(normalizeLogLevel("error")).toBe("error");
  });

  it("is case-insensitive and trims whitespace", () => {
    expect(normalizeLogLevel("DEBUG")).toBe("debug");
    expect(normalizeLogLevel("Warn")).toBe("warn");
    expect(normalizeLogLevel("  ERROR  ")).toBe("error");
  });

  it("falls back to info on unknown values", () => {
    expect(normalizeLogLevel("verbose")).toBe("info");
    expect(normalizeLogLevel("")).toBe("info");
  });
});

describe("utils/logger redactSecrets", () => {
  it("masks secret-bearing object keys", () => {
    const redacted = redactSecrets({
      token: "123:abc",
      apiKey: "sk-test",
      regular: "visible",
    });

    expect(redacted).toEqual({
      token: "[redacted]",
      apiKey: "[redacted]",
      regular: "visible",
    });
  });

  it("masks nested secrets without mutating the input", () => {
    const input = {
      telegram: { token: "123:abc" },
      opencode: { password: "s3cr3t", apiUrl: "http://localhost:4096" },
    };
    const redacted = redactSecrets(input);

    expect(redacted.telegram.token).toBe("[redacted]");
    expect(redacted.opencode.password).toBe("[redacted]");
    expect(redacted.opencode.apiUrl).toBe("http://localhost:4096");
    expect(input.telegram.token).toBe("123:abc");
  });

  it("redacts secrets inside arrays and leaves primitives untouched", () => {
    expect(redactSecrets([{ telegramBotToken: "x" }])).toEqual([{ telegramBotToken: "[redacted]" }]);
    expect(redactSecrets("plain string")).toBe("plain string");
    expect(redactSecrets(42)).toBe(42);
    expect(redactSecrets(null)).toBe(null);
  });
});
