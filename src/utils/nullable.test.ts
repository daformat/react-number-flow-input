import { describe, expect, it } from "vitest";

import { isDefined, isNonNullable, isNotNull } from "./nullable.js";

describe("isDefined", () => {
  it("returns true for any value that is not undefined", () => {
    expect(isDefined(null)).toBe(true);
    expect(isDefined(0)).toBe(true);
    expect(isDefined("")).toBe(true);
    expect(isDefined(false)).toBe(true);
    expect(isDefined({})).toBe(true);
  });

  it("returns false for undefined", () => {
    expect(isDefined(undefined)).toBe(false);
  });
});

describe("isNotNull", () => {
  it("returns true for any value that is not null", () => {
    expect(isNotNull(0)).toBe(true);
    expect(isNotNull("")).toBe(true);
    expect(isNotNull(undefined as unknown as string)).toBe(true);
  });

  it("returns false for null", () => {
    expect(isNotNull(null)).toBe(false);
  });
});

describe("isNonNullable", () => {
  it("returns true only when the value is neither null nor undefined", () => {
    expect(isNonNullable(0)).toBe(true);
    expect(isNonNullable("x")).toBe(true);
    expect(isNonNullable(false)).toBe(true);
    expect(isNonNullable(null)).toBe(false);
    expect(isNonNullable(undefined)).toBe(false);
  });
});
