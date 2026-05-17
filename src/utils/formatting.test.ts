import { describe, expect, it } from "vitest";

import {
  formatValue,
  getLocaleSeparators,
  isRawCharacter,
  type Separators,
} from "./formatting.js";

describe("getLocaleSeparators", () => {
  it("returns '.'/',' for en-US", () => {
    expect(getLocaleSeparators("en-US")).toEqual({ decimal: ".", group: "," });
  });

  it("returns ','/'.' (or NBSP-like group) for de-DE", () => {
    const sep = getLocaleSeparators("de-DE");
    expect(sep.decimal).toBe(",");
    // group is "." in jsdom/Node Intl; we only assert it's not a comma.
    expect(sep.group).not.toBe(",");
  });

  it("falls back to '.'/',' when locale parts are missing", () => {
    // Default (undefined) locale should still produce sensible defaults.
    const sep = getLocaleSeparators();
    expect(sep.decimal.length).toBeGreaterThan(0);
    expect(sep.group.length).toBeGreaterThan(0);
  });
});

const enSep: Separators = { decimal: ".", group: "," };
const deSep: Separators = { decimal: ",", group: "." };

describe("formatValue", () => {
  it("returns intermediate states verbatim (or translated to locale decimal)", () => {
    expect(
      formatValue("", {
        format: true,
        autoAddLeadingZero: false,
        separators: enSep,
      }),
    ).toBe("");
    expect(
      formatValue("-", {
        format: true,
        autoAddLeadingZero: false,
        separators: enSep,
      }),
    ).toBe("-");
    expect(
      formatValue(".", {
        format: true,
        autoAddLeadingZero: false,
        separators: enSep,
      }),
    ).toBe(".");
    expect(
      formatValue(".", {
        format: true,
        autoAddLeadingZero: false,
        separators: deSep,
      }),
    ).toBe(",");
    expect(
      formatValue("-.", {
        format: true,
        autoAddLeadingZero: false,
        separators: deSep,
      }),
    ).toBe("-,");
  });

  it("when format=false, only swaps '.' for the locale decimal", () => {
    expect(
      formatValue("1234.56", {
        format: false,
        autoAddLeadingZero: false,
        separators: enSep,
      }),
    ).toBe("1234.56");
    expect(
      formatValue("1234.56", {
        format: false,
        autoAddLeadingZero: false,
        separators: deSep,
      }),
    ).toBe("1234,56");
  });

  it("when format=true, applies Intl.NumberFormat grouping", () => {
    expect(
      formatValue("1234567", {
        format: true,
        autoAddLeadingZero: false,
        separators: enSep,
        locale: "en-US",
      }),
    ).toBe("1,234,567");
  });

  it("preserves user-typed trailing dot", () => {
    expect(
      formatValue("123.", {
        format: true,
        autoAddLeadingZero: false,
        separators: enSep,
        locale: "en-US",
      }),
    ).toBe("123.");
  });

  it("preserves user-typed decimal digits (incl. trailing zeros)", () => {
    expect(
      formatValue("1.10", {
        format: true,
        autoAddLeadingZero: false,
        separators: enSep,
        locale: "en-US",
      }),
    ).toBe("1.10");
  });

  it("preserves a leading decimal when autoAddLeadingZero is off", () => {
    expect(
      formatValue(".5", {
        format: true,
        autoAddLeadingZero: false,
        separators: enSep,
        locale: "en-US",
      }),
    ).toBe(".5");
    expect(
      formatValue("-.5", {
        format: true,
        autoAddLeadingZero: false,
        separators: deSep,
        locale: "de-DE",
      }),
    ).toBe("-,5");
  });

  it("formats with the locale-specific group separator", () => {
    // de-DE: thousand separator is "." and decimal is ","
    expect(
      formatValue("1234567", {
        format: true,
        autoAddLeadingZero: false,
        separators: deSep,
        locale: "de-DE",
      }),
    ).toBe("1.234.567");
  });

  it("returns the input string verbatim (with decimal swap) when not numeric", () => {
    expect(
      formatValue("abc", {
        format: true,
        autoAddLeadingZero: false,
        separators: enSep,
      }),
    ).toBe("abc");
  });
});

describe("isRawCharacter", () => {
  it("returns false for falsy chars", () => {
    expect(isRawCharacter("", ".")).toBe(false);
    expect(isRawCharacter(undefined, ".")).toBe(false);
  });

  it("recognises digits, '.' and '-'", () => {
    expect(isRawCharacter("0", ".")).toBe(true);
    expect(isRawCharacter("9", ".")).toBe(true);
    expect(isRawCharacter(".", ".")).toBe(true);
    expect(isRawCharacter("-", ".")).toBe(true);
  });

  it("recognises the locale-specific decimal as a raw character", () => {
    expect(isRawCharacter(",", ",")).toBe(true);
  });

  it("rejects group separators and arbitrary characters", () => {
    expect(isRawCharacter(",", ".")).toBe(false);
    expect(isRawCharacter(" ", ".")).toBe(false);
    expect(isRawCharacter("a", ".")).toBe(false);
  });

  it("does not treat '.' as raw when the locale decimal is ','", () => {
    // In de-DE format the "." is the group separator and must be
    // rejected; otherwise formatted→raw index mapping miscounts it as
    // a digit and inserts (e.g.) a decimal at the wrong position.
    expect(isRawCharacter(".", ",")).toBe(false);
  });
});
