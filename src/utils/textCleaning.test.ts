import { describe, expect, it } from "vitest";

import {
  cleanText,
  parseNumberValue,
  sanitizeValueProp,
} from "./textCleaning.js";

describe("cleanText", () => {
  it("strips characters that are not digits, '.' or '-'", () => {
    expect(cleanText("1a2b3c", false).cleanedText).toBe("123");
    expect(cleanText("1,234", false).cleanedText).toBe("1234");
    expect(cleanText("1 234.56", false).cleanedText).toBe("1234.56");
  });

  it("keeps only the first minus and only if it is the leading character", () => {
    expect(cleanText("--12", false).cleanedText).toBe("-12");
    expect(cleanText("12-3", false).cleanedText).toBe("123");
    expect(cleanText("-1-2-3", false).cleanedText).toBe("-123");
  });

  it("keeps only the first decimal point", () => {
    expect(cleanText("1.2.3", false).cleanedText).toBe("1.23");
    expect(cleanText("1...2", false).cleanedText).toBe("1.2");
  });

  it("strips a single leading zero in a multi-digit integer", () => {
    // leadingZerosRemoved counts the EXTRA leading zeros that were
    // dropped beyond a single normalized one — "0123" loses exactly 1
    // leading zero, leaving 0 extras.
    const result = cleanText("0123", false);
    expect(result.cleanedText).toBe("123");
    expect(result.leadingZerosRemoved).toBe(0);
  });

  it("strips multiple leading zeros and reports the extras dropped", () => {
    const result = cleanText("00042", false);
    expect(result.cleanedText).toBe("42");
    // 3 leading zeros were present in the input; 1 is the "expected"
    // normalized one and the remaining 2 are reported as extras.
    expect(result.leadingZerosRemoved).toBe(2);
  });

  it("keeps the single leading 0 when the input is 0.xxx", () => {
    const result = cleanText("0.123", false);
    expect(result.cleanedText).toBe("0.123");
    expect(result.leadingZerosRemoved).toBe(0);
  });

  it("keeps the leading 0 for a lone '0'", () => {
    expect(cleanText("0", false).cleanedText).toBe("0");
  });

  it("preserves the leading 0 + decimal even when the integer was '00'", () => {
    const result = cleanText("00.5", false);
    // "00.5" → strip lead "0", result "0.5"
    expect(result.cleanedText).toBe("0.5");
  });

  it("strips leading zeros from negative numbers too", () => {
    expect(cleanText("-007", false).cleanedText).toBe("-7");
    expect(cleanText("-0.5", false).cleanedText).toBe("-0.5");
  });

  it("autoAddLeadingZero turns '.5' into '0.5' and '-.5' into '-0.5'", () => {
    expect(cleanText(".5", true).cleanedText).toBe("0.5");
    expect(cleanText("-.5", true).cleanedText).toBe("-0.5");
  });

  it("does not add a leading zero when autoAddLeadingZero is false", () => {
    expect(cleanText(".5", false).cleanedText).toBe(".5");
    expect(cleanText("-.5", false).cleanedText).toBe("-.5");
  });

  it("returns empty cleanedText for an all-junk input", () => {
    expect(cleanText("abc", false).cleanedText).toBe("");
  });
});

describe("parseNumberValue", () => {
  it("returns undefined for the intermediate states", () => {
    expect(parseNumberValue("")).toBeUndefined();
    expect(parseNumberValue("-")).toBeUndefined();
    expect(parseNumberValue(".")).toBeUndefined();
    expect(parseNumberValue("-.")).toBeUndefined();
  });

  it("parses standard numeric strings", () => {
    expect(parseNumberValue("123")).toBe(123);
    expect(parseNumberValue("-12.5")).toBe(-12.5);
    expect(parseNumberValue("0.5")).toBe(0.5);
  });

  it("returns undefined for non-numeric input", () => {
    expect(parseNumberValue("abc")).toBeUndefined();
  });

  it("parses a trailing dot like parseFloat does", () => {
    expect(parseNumberValue("12.")).toBe(12);
  });
});

describe("sanitizeValueProp", () => {
  it("returns undefined for nullish input", () => {
    expect(sanitizeValueProp(undefined, false)).toBeUndefined();
    expect(sanitizeValueProp(null, false)).toBeUndefined();
  });

  it("returns the stringified number for finite numbers (including 0)", () => {
    expect(sanitizeValueProp(0, false)).toBe("0");
    expect(sanitizeValueProp(1234.5, false)).toBe("1234.5");
    expect(sanitizeValueProp(-1.5, false)).toBe("-1.5");
  });

  it("rejects non-finite numbers", () => {
    expect(sanitizeValueProp(NaN, false)).toBeUndefined();
    expect(sanitizeValueProp(Infinity, false)).toBeUndefined();
    expect(sanitizeValueProp(-Infinity, false)).toBeUndefined();
  });

  it("returns the string unchanged when it already matches /^-?\\d*\\.?\\d*$/", () => {
    expect(sanitizeValueProp("1234.56", false)).toBe("1234.56");
    expect(sanitizeValueProp("-1.5", false)).toBe("-1.5");
    expect(sanitizeValueProp("", false)).toBe("");
    expect(sanitizeValueProp(".", false)).toBe(".");
    expect(sanitizeValueProp("-", false)).toBe("-");
  });

  it("preserves trailing zeros (precision-sensitive consumers)", () => {
    expect(sanitizeValueProp("1.50", false)).toBe("1.50");
    expect(sanitizeValueProp("1.500000", false)).toBe("1.500000");
    expect(sanitizeValueProp("100", false)).toBe("100");
  });

  it("preserves integers beyond Number.MAX_SAFE_INTEGER", () => {
    const huge = "12345678901234567890";
    expect(sanitizeValueProp(huge, false)).toBe(huge);
  });

  it("strips non-numeric junk through cleanText", () => {
    expect(sanitizeValueProp("$1,234.56", false)).toBe("1234.56");
    expect(sanitizeValueProp("abc", false)).toBe("");
    expect(sanitizeValueProp("12.34.56", false)).toBe("12.3456");
    expect(sanitizeValueProp("--5", false)).toBe("-5");
    expect(sanitizeValueProp("5-3", false)).toBe("53");
  });

  it("applies autoAddLeadingZero when requested", () => {
    expect(sanitizeValueProp(".5", true)).toBe("0.5");
    expect(sanitizeValueProp(".5", false)).toBe(".5");
    expect(sanitizeValueProp("-.5", true)).toBe("-0.5");
  });

  it("rejects unsupported value types (booleans, objects, arrays)", () => {
    expect(
      sanitizeValueProp(true as unknown as string, false),
    ).toBeUndefined();
    expect(
      sanitizeValueProp({} as unknown as string, false),
    ).toBeUndefined();
    expect(
      sanitizeValueProp([] as unknown as string, false),
    ).toBeUndefined();
  });
});
