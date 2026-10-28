import { describe, expect, it } from "vitest";
import { isRecord } from "../../src/utils/type-guards.js";

describe("utils/type-guards isRecord", () => {
  it("accepts plain objects", () => {
    expect(isRecord({})).toBe(true);
    expect(isRecord({ name: "NotFoundError" })).toBe(true);
    expect(isRecord(Object.create(null))).toBe(true);
  });

  it("rejects arrays so error helpers do not read record fields off them", () => {
    expect(isRecord([])).toBe(false);
    expect(isRecord([{ message: "x" }])).toBe(false);
  });

  it("rejects primitives and nullish values", () => {
    expect(isRecord(null)).toBe(false);
    expect(isRecord(undefined)).toBe(false);
    expect(isRecord("error")).toBe(false);
    expect(isRecord(42)).toBe(false);
    expect(isRecord(true)).toBe(false);
    expect(isRecord(Symbol("x"))).toBe(false);
  });
});
