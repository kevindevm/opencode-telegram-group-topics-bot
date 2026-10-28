import { describe, expect, it } from "vitest";
import {
  isOperationAbortedSessionError,
  isInvalidRequestSessionError,
  SessionErrorThrottle,
} from "../../../src/bot/utils/session-error-filter.js";

describe("bot/utils/session-error-filter", () => {
  it("detects operation aborted messages", () => {
    expect(isOperationAbortedSessionError("The operation was aborted.")).toBe(true);
    expect(isOperationAbortedSessionError("AbortError: stream closed")).toBe(true);
    expect(isOperationAbortedSessionError("Network timeout")).toBe(false);
  });

  it("detects invalid request messages", () => {
    expect(
      isInvalidRequestSessionError(
        "The request contains invalid parameters. Check the request body.",
      ),
    ).toBe(true);
    expect(isInvalidRequestSessionError("AI.Error.InvalidRequest: nope")).toBe(true);
    expect(isInvalidRequestSessionError("Rate limit exceeded")).toBe(false);
    expect(isInvalidRequestSessionError("")).toBe(false);
  });

  it("suppresses repeated identical errors within window", () => {
    const throttle = new SessionErrorThrottle(3000);

    expect(throttle.shouldSuppress("session-1", "Transient failure", 1000)).toBe(false);
    expect(throttle.shouldSuppress("session-1", "Transient failure", 2000)).toBe(true);
    expect(throttle.shouldSuppress("session-1", "Different failure", 2200)).toBe(false);
    expect(throttle.shouldSuppress("session-1", "Different failure", 6001)).toBe(false);
  });

  it("evicts the oldest sessions past the cap instead of growing forever", () => {
    const throttle = new SessionErrorThrottle(60_000);

    expect(throttle.shouldSuppress("session-old", "boom", 1000)).toBe(false);
    for (let index = 1; index <= 500; index += 1) {
      expect(throttle.shouldSuppress(`session-${index}`, `failure-${index}`, 1000)).toBe(false);
    }

    // The first entry was evicted: the same message is treated as new again.
    expect(throttle.shouldSuppress("session-old", "boom", 2000)).toBe(false);
    // A still-tracked session keeps suppressing duplicates.
    expect(throttle.shouldSuppress("session-500", "failure-500", 2000)).toBe(true);
  });
});
