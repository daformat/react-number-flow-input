import { describe, expect, it } from "vitest";

import {
  getChanges,
  getFormattedChanges,
  getPositionChanges,
  getReplacementChanges,
  getReplacementFormattedChanges,
} from "./changes.js";

describe("getChanges", () => {
  it("marks every index as added when the old value is empty", () => {
    const changes = getChanges("", "123", 0, 0, 3);
    expect(Array.from(changes.addedIndices).sort()).toEqual([0, 1, 2]);
    expect(changes.unchangedIndices.size).toBe(0);
    expect(changes.barrelWheelIndices.size).toBe(0);
  });

  it("marks pure insertions as added and the rest as unchanged", () => {
    // Type "5" at the end of "1234" → "12345". selectionStart=4, end=4,
    // cursor lands at 5.
    const changes = getChanges("1234", "12345", 4, 4, 5);
    expect(changes.addedIndices.has(4)).toBe(true);
    expect(Array.from(changes.unchangedIndices).sort()).toEqual([0, 1, 2, 3]);
  });

  it("marks deletions and leaves surviving indices as unchanged", () => {
    // Backspace at end of "1234" → "123". selection collapsed at 4.
    const changes = getChanges("1234", "123", 4, 4, 3);
    expect(Array.from(changes.unchangedIndices).sort()).toEqual([0, 1, 2]);
    expect(changes.addedIndices.size).toBe(0);
  });

  it("produces a barrel wheel when a single-digit selection is replaced by a different digit", () => {
    // Selection (3,4) over "1234" → replaced by "9" → "1239".
    const changes = getChanges("1234", "1239", 3, 4, 4);
    const wheel = changes.barrelWheelIndices.get(3);
    expect(wheel).toBeDefined();
    expect(wheel?.direction).toBe("up");
    expect(wheel?.sequence).toEqual(["4", "5", "6", "7", "8", "9"]);
    expect(changes.addedIndices.has(3)).toBe(false);
  });

  it("does not produce a barrel wheel when the replacement digit is identical", () => {
    const changes = getChanges("1234", "1234", 3, 4, 4);
    expect(changes.barrelWheelIndices.size).toBe(0);
  });

  it("marks every position as unchanged when replacing a digit with the exact same digit", () => {
    // Select the "3" in "1234" (selection (2,3)) and type "3" again → "1234".
    // The raw value didn't change, so nothing should animate.
    const changes = getChanges("1234", "1234", 2, 3, 3);
    expect(changes.barrelWheelIndices.size).toBe(0);
    expect(changes.addedIndices.size).toBe(0);
    expect(Array.from(changes.unchangedIndices).sort()).toEqual([0, 1, 2, 3]);
  });

  it("marks every position as unchanged when replacing a multi-digit selection with the exact same digits", () => {
    // Select "23" in "1234" (selection (1,3)) and type "23" again → "1234".
    const changes = getChanges("1234", "1234", 1, 3, 3);
    expect(changes.barrelWheelIndices.size).toBe(0);
    expect(changes.addedIndices.size).toBe(0);
    expect(Array.from(changes.unchangedIndices).sort()).toEqual([0, 1, 2, 3]);
  });

  it("falls back to added (not barrel) when the replaced char is not a digit", () => {
    const changes = getChanges("1.34", "1934", 1, 2, 2);
    expect(changes.barrelWheelIndices.size).toBe(0);
    expect(changes.addedIndices.has(1)).toBe(true);
  });

  it("treats trailing tails identically when both lengths match (no change)", () => {
    const changes = getChanges("1234", "1234", 0, 0, 0);
    expect(Array.from(changes.unchangedIndices).sort()).toEqual([0, 1, 2, 3]);
  });
});

describe("getReplacementChanges", () => {
  it("emits fromZero barrel wheels for every digit when old value is empty", () => {
    const changes = getReplacementChanges("", "42");
    expect(changes.barrelWheelIndices.size).toBe(2);
    for (const [, wheel] of changes.barrelWheelIndices) {
      expect(wheel.fromZero).toBe(true);
      expect(wheel.sequence[0]).toBe("0");
    }
  });

  it("emits removedDigitWheels for every digit when new value is empty", () => {
    const changes = getReplacementChanges("42", "");
    expect(changes.removedDigitWheels?.size).toBe(2);
    expect(changes.removedDigitWheels?.get(0)?.oldChar).toBe("4");
    expect(changes.removedDigitWheels?.get(1)?.oldChar).toBe("2");
  });

  it("right-aligns the integer part: extra new digits on the left animate fromZero", () => {
    // 42 → 12042: positions 0-2 are new ("120"), positions 3-4 match.
    // Position 2 is "0" — its digit-roll from 0 would be a no-op so it
    // falls through to addedIndices instead.
    const changes = getReplacementChanges("42", "12042");
    expect(changes.unchangedIndices.has(3)).toBe(true); // "4"
    expect(changes.unchangedIndices.has(4)).toBe(true); // "2"
    const wheel0 = changes.barrelWheelIndices.get(0);
    const wheel1 = changes.barrelWheelIndices.get(1);
    expect(wheel0?.fromZero).toBe(true); // "1"
    expect(wheel1?.fromZero).toBe(true); // "2"
    expect(changes.barrelWheelIndices.has(2)).toBe(false); // "0" → flow
    expect(changes.addedIndices.has(2)).toBe(true);
  });

  it("does not emit a fromZero wheel for a '0' digit (no-op roll)", () => {
    // "" → "50": "5" gets a fromZero wheel, "0" does not (no roll).
    const changes = getReplacementChanges("", "50");
    expect(changes.barrelWheelIndices.size).toBe(1);
    const wheel0 = changes.barrelWheelIndices.get(0);
    expect(wheel0?.fromZero).toBe(true);
    expect(wheel0?.sequence[0]).toBe("0");
    expect(wheel0?.sequence[wheel0.sequence.length - 1]).toBe("5");
    expect(changes.barrelWheelIndices.has(1)).toBe(false);
    expect(changes.addedIndices.has(1)).toBe(true);
  });

  it("routes a '0' fromZero decimal digit through addedIndices", () => {
    // 1.2 → 1.20: position 3 is a new "0" — no-op roll → flow animation.
    const changes = getReplacementChanges("1.2", "1.20");
    expect(changes.barrelWheelIndices.has(3)).toBe(false);
    expect(changes.addedIndices.has(3)).toBe(true);
  });

  it("right-aligns the integer part: dropped old left digits become removedDigitWheels", () => {
    // 12345 → 45: old positions 0-2 drop off the left.
    const changes = getReplacementChanges("12345", "45");
    expect(changes.removedDigitWheels?.get(0)?.oldChar).toBe("1");
    expect(changes.removedDigitWheels?.get(1)?.oldChar).toBe("2");
    expect(changes.removedDigitWheels?.get(2)?.oldChar).toBe("3");
    expect(changes.unchangedIndices.has(0)).toBe(true); // new "4"
    expect(changes.unchangedIndices.has(1)).toBe(true); // new "5"
  });

  it("aligns same-position digits as barrel wheels (no fromZero)", () => {
    const changes = getReplacementChanges("42", "59");
    const w0 = changes.barrelWheelIndices.get(0);
    const w1 = changes.barrelWheelIndices.get(1);
    expect(w0?.fromZero).toBeFalsy();
    expect(w1?.fromZero).toBeFalsy();
    expect(w0?.sequence).toEqual(["4", "5"]);
    expect(w1?.direction).toBe("up");
  });

  it("treats the decimal point as unchanged when both values have one", () => {
    const changes = getReplacementChanges("1.2", "3.4");
    expect(changes.unchangedIndices.has(1)).toBe(true); // "."
  });

  it("flags extra new decimal digits as fromZero wheels", () => {
    // 1.2 → 1.25: position 3 is new
    const changes = getReplacementChanges("1.2", "1.25");
    const wheel = changes.barrelWheelIndices.get(3);
    expect(wheel?.fromZero).toBe(true);
  });

  it("flags dropped decimal digits as removedDigitWheels", () => {
    // 1.25 → 1.2: old position 3 drops off
    const changes = getReplacementChanges("1.25", "1.2");
    expect(changes.removedDigitWheels?.get(3)?.oldChar).toBe("5");
  });

  it("flags every old decimal digit as removed when new value has no decimal", () => {
    const changes = getReplacementChanges("1.23", "5");
    expect(changes.removedDigitWheels?.get(2)?.oldChar).toBe("2");
    expect(changes.removedDigitWheels?.get(3)?.oldChar).toBe("3");
  });

  it("preserves a leading minus sign as unchanged when both values are negative", () => {
    const changes = getReplacementChanges("-12", "-34");
    expect(changes.unchangedIndices.has(0)).toBe(true);
  });

  it("flags a newly added leading minus as added (not a barrel)", () => {
    const changes = getReplacementChanges("12", "-12");
    expect(changes.addedIndices.has(0)).toBe(true);
    expect(changes.barrelWheelIndices.has(0)).toBe(false);
  });
});

describe("getReplacementFormattedChanges", () => {
  it("marks every index as added when the old formatted value is empty", () => {
    const { addedIndices, unchangedIndices } = getReplacementFormattedChanges(
      "",
      "1,234",
      ".",
    );
    expect(Array.from(addedIndices).sort((a, b) => a - b)).toEqual([
      0, 1, 2, 3, 4,
    ]);
    expect(unchangedIndices.size).toBe(0);
  });

  it("returns empty sets when the new formatted value is empty", () => {
    const { addedIndices, unchangedIndices } = getReplacementFormattedChanges(
      "1,234",
      "",
      ".",
    );
    expect(addedIndices.size).toBe(0);
    expect(unchangedIndices.size).toBe(0);
  });

  it("right-aligns the whole pre-decimal block (separators included)", () => {
    // "1,234" → "12,345". Right-aligned distance-from-end mapping pairs:
    //   newPos 5 ("5") ↔ oldPos 4 ("4")  → added
    //   newPos 4 ("4") ↔ oldPos 3 ("3")  → added
    //   newPos 3 ("3") ↔ oldPos 2 ("2")  → added
    //   newPos 2 (",") ↔ oldPos 1 (",")  → unchanged
    //   newPos 1 ("2") ↔ oldPos 0 ("1")  → added
    //   newPos 0 ("1") ↔ no aligned old → added
    const { addedIndices, unchangedIndices } = getReplacementFormattedChanges(
      "1,234",
      "12,345",
      ".",
    );
    expect(Array.from(addedIndices).sort((a, b) => a - b)).toEqual([
      0, 1, 3, 4, 5,
    ]);
    expect(Array.from(unchangedIndices)).toEqual([2]);
  });

  it("treats the decimal point as unchanged when both formatted values have one", () => {
    const { unchangedIndices } = getReplacementFormattedChanges(
      "1.2",
      "3.4",
      ".",
    );
    expect(unchangedIndices.has(1)).toBe(true);
  });

  it("respects a non-'.' locale decimal separator", () => {
    const { unchangedIndices } = getReplacementFormattedChanges(
      "1,2",
      "3,4",
      ",",
    );
    expect(unchangedIndices.has(1)).toBe(true);
  });

  it("flags added decimal positions to the right of the decimal point", () => {
    const { addedIndices } = getReplacementFormattedChanges("1.2", "1.25", ".");
    expect(addedIndices.has(3)).toBe(true);
  });
});

describe("getFormattedChanges", () => {
  it("should mark new separator as added", () => {
    // Going from "123" to "1,234" - comma is NEW
    // Cursor at end (raw pos 4), started at pos 3, old length 3
    const result = getFormattedChanges("123", "1,234", 4, 3, 3);

    // Index 1 is the comma in "1,234"
    expect(result.addedIndices.has(1)).toBe(true);
    // Index 4 is the "4" in "1,234"
    expect(result.addedIndices.has(4)).toBe(true);
  });

  it("marks every position as unchanged when the formatted strings are identical", () => {
    // Selecting "3" in "1,234" (raw selection (2,3)) and typing "3" again
    // leaves the formatted string identical to itself — nothing should
    // animate, even though the input handler is still invoked.
    const result = getFormattedChanges("1,234", "1,234", 3, 2, 4);
    expect(result.addedIndices.size).toBe(0);
    expect(Array.from(result.unchangedIndices).sort((a, b) => a - b)).toEqual([
      0, 1, 2, 3, 4,
    ]);
  });

  it("should mark shifted separator as unchanged", () => {
    // Going from "1,234" to "12,345" - comma shifted but is NOT new
    // Cursor at end (raw pos 5), started at pos 4, old length 4
    const result = getFormattedChanges("1,234", "12,345", 5, 4, 4);

    // Index 2 is the comma in "12,345"
    expect(result.unchangedIndices.has(2)).toBe(true);
    expect(result.addedIndices.has(2)).toBe(false);
  });

  it("should mark second comma as added when growing from one to two", () => {
    // Going from "1,234" to "12,345,678" - there's now 2 commas, so 1 is new
    // Cursor at end (raw pos 8), started at pos 4, old length 4
    const result = getFormattedChanges("1,234", "12,345,678", 8, 4, 4);

    // Find which comma indices are added vs unchanged
    const commaIndices = [2, 6]; // "12,345,678" has commas at indices 2 and 6
    const addedCommas = commaIndices.filter((i) => result.addedIndices.has(i));
    const unchangedCommas = commaIndices.filter((i) =>
      result.unchangedIndices.has(i),
    );

    // One comma should be unchanged (it existed before), one should be new
    expect(unchangedCommas.length).toBe(1);
    expect(addedCommas.length).toBe(1);
  });

  it("should not animate any separators when shrinking", () => {
    // Going from "12,345" to "1,234" - no new separators
    // Cursor at end (raw pos 4), delete happened, old length 5
    const result = getFormattedChanges("12,345", "1,234", 4, 4, 5);

    // Index 1 is the comma in "1,234"
    expect(result.unchangedIndices.has(1)).toBe(true);
    expect(result.addedIndices.has(1)).toBe(false);
  });

  it("should animate digit at cursor position for repeated characters", () => {
    // Typing "8" at end of "88888" to get "888888"
    // Cursor at end (raw pos 6), started at pos 5, old length 5
    const result = getFormattedChanges("88,888", "888,888", 6, 5, 5);

    // "888,888" - the last "8" (index 6) should be added
    expect(result.addedIndices.has(6)).toBe(true);

    // The first 5 digits (indices 0, 1, 2, 4, 5 - skipping comma at 3) should be unchanged
    expect(result.unchangedIndices.has(0)).toBe(true);
    expect(result.unchangedIndices.has(1)).toBe(true);
    expect(result.unchangedIndices.has(2)).toBe(true);
    expect(result.unchangedIndices.has(4)).toBe(true);
    expect(result.unchangedIndices.has(5)).toBe(true);
  });

  it("should animate digit at middle position when inserting in middle", () => {
    // Typing "9" at position 2 of "12345" to get "129345"
    // Cursor at pos 3, started at pos 2, old length 5
    const result = getFormattedChanges("12,345", "129,345", 3, 2, 5);

    // "129,345" - index 2 is the "9" which should be added
    expect(result.addedIndices.has(2)).toBe(true);

    // Other digits should be unchanged
    expect(result.unchangedIndices.has(0)).toBe(true); // "1"
    expect(result.unchangedIndices.has(1)).toBe(true); // "2"
    expect(result.unchangedIndices.has(4)).toBe(true); // "3"
    expect(result.unchangedIndices.has(5)).toBe(true); // "4"
    expect(result.unchangedIndices.has(6)).toBe(true); // "5"
  });

  it("should animate pasted digits at correct positions", () => {
    // Pasting "99" at end of "12" to get "1299"
    // Cursor at pos 4, started at pos 2, old length 2
    const result = getFormattedChanges("12", "1,299", 4, 2, 2);

    // "1,299" has: 0="1", 1=",", 2="2", 3="9", 4="9"
    // The pasted "9"s are at indices 3 and 4
    expect(result.addedIndices.has(3)).toBe(true);
    expect(result.addedIndices.has(4)).toBe(true);

    // "1" and "2" should be unchanged
    expect(result.unchangedIndices.has(0)).toBe(true);
    expect(result.unchangedIndices.has(2)).toBe(true);
  });

  it("falls back to LCS-based detection when cursor info is omitted", () => {
    const result = getFormattedChanges("1,234", "12,345");
    // The "5" is new; the leading separator alignment is taken care of
    // by the truly-new separator count (one comma in both → none new).
    expect(result.unchangedIndices.size).toBeGreaterThan(0);
    expect(result.addedIndices.size).toBeGreaterThan(0);
  });

  it("respects the locale decimal separator when classifying chars", () => {
    // German locale: "." is a separator (group), "," is a raw decimal.
    const result = getFormattedChanges("1,2", "1.234,5", 4, 3, 3, ",");
    // Index 1 in "1.234,5" is "." — a separator in this locale.
    // The "," at index 5 is the locale decimal: NOT a separator, so it
    // must not be counted as a separator-animation candidate.
    expect(result.unchangedIndices.has(5) || result.addedIndices.has(5)).toBe(
      true,
    );
  });
});

describe("getPositionChanges", () => {
  it("should detect separator position change", () => {
    // "1,234" -> "12,345": comma moves from index 1 to index 2
    const changes = getPositionChanges("1,234", "12,345");

    // Should have one position change for the comma
    const separatorChanges = changes.filter((c) => c.isSeparator);
    expect(separatorChanges.length).toBe(1);
    expect(separatorChanges[0]?.oldIndex).toBe(1);
    expect(separatorChanges[0]?.newIndex).toBe(2);
  });

  it("should detect digit crossing group boundary", () => {
    // "1,234" -> "12,345": the "2" moves from after comma to before comma
    const changes = getPositionChanges("1,234", "12,345");

    // Should have a position change for the "2" crossing group
    const digitChanges = changes.filter(
      (c) => !c.isSeparator && c.crossedGroup,
    );
    expect(digitChanges.length).toBe(1);
    expect(digitChanges[0]?.char).toBe("2");
  });

  it("should detect digits crossing groups when comma is inserted", () => {
    // "123" -> "1,234": comma is inserted, "2" and "3" cross to group 1
    const changes = getPositionChanges("123", "1,234");

    // "2" and "3" should be marked as crossing group (from group 0 to group 1)
    const digitCrossChanges = changes.filter(
      (c) => !c.isSeparator && c.crossedGroup,
    );
    expect(digitCrossChanges.length).toBe(2);
    expect(digitCrossChanges.map((c) => c.char).sort()).toEqual(["2", "3"]);
  });

  it("should detect multiple digits crossing groups", () => {
    // "1,234,567" -> "12,345,678": "2" and "5" cross groups
    const changes = getPositionChanges("1,234,567", "12,345,678");

    const digitCrossChanges = changes.filter(
      (c) => !c.isSeparator && c.crossedGroup,
    );
    // "2" crosses from group 1 to group 0
    // "5" crosses from group 2 to group 1
    expect(digitCrossChanges.length).toBe(2);
  });

  it("does not flag the leading digit as crossed when an identical digit was on the other side of the separator (6,650,431 -> 6,850,431)", () => {
    // The leading "6" sits at the same formatted index 0 in both strings.
    // LCS can be ambiguous because old has two "6"s; we must never animate
    // the leading "6" as if it travelled across a group boundary.
    const changes = getPositionChanges("6,650,431", "6,850,431");

    const digitCrossChanges = changes.filter(
      (c) => !c.isSeparator && c.crossedGroup,
    );

    const leadingChange = digitCrossChanges.find((c) => c.newIndex === 0);
    expect(leadingChange).toBeUndefined();
  });

  it("does not flag the reverse case either (6,850,431 -> 6,650,431)", () => {
    const changes = getPositionChanges("6,850,431", "6,650,431");

    const digitCrossChanges = changes.filter(
      (c) => !c.isSeparator && c.crossedGroup,
    );

    const leadingChange = digitCrossChanges.find((c) => c.newIndex === 0);
    expect(leadingChange).toBeUndefined();
  });

  it("returns an empty array when both strings are equal", () => {
    expect(getPositionChanges("1,234", "1,234")).toEqual([]);
  });

  it("returns an empty array when either input is empty", () => {
    expect(getPositionChanges("", "1,234")).toEqual([]);
    expect(getPositionChanges("1,234", "")).toEqual([]);
  });
});
