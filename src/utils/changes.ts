export interface Changes {
  addedIndices: Set<number>;
  unchangedIndices: Set<number>;
  barrelWheelIndices: Map<
    number,
    { sequence: string[]; direction: "up" | "down" }
  >;
}

export interface PositionChange {
  /** Index in the new formatted string */
  newIndex: number;
  /** Index in the old formatted string (-1 if new) */
  oldIndex: number;
  /** The character */
  char: string;
  /** Whether this is a separator character */
  isSeparator: boolean;
  /** Whether the character crossed a group boundary */
  crossedGroup: boolean;
}

/**
 * Check if a character is a separator (not a digit, decimal point, or minus)
 * @param char - The character to check
 * @param localeDecimal - Optional locale-specific decimal separator (e.g., "," for fr-FR)
 */
const isSeparator = (
  char: string | undefined,
  localeDecimal?: string,
): boolean => {
  if (!char) {
    return false;
  }
  // Check against standard raw characters
  if (/[\d.\-]/.test(char)) {
    return false;
  }
  // Also check against locale decimal separator
  if (localeDecimal && char === localeDecimal) {
    return false;
  }
  return true;
};

/**
 * Count separators in a string, returning a map of char -> count
 * @param str - The string to count separators in
 * @param localeDecimal - Optional locale-specific decimal separator
 */
const countSeparators = (
  str: string,
  localeDecimal?: string,
): Map<string, number> => {
  const counts = new Map<string, number>();
  for (const char of str) {
    if (isSeparator(char, localeDecimal)) {
      counts.set(char, (counts.get(char) ?? 0) + 1);
    }
  }
  return counts;
};

/**
 * Maps a raw (unformatted) cursor position to a formatted cursor position.
 * Counts non-separator characters up to the raw position.
 * @param rawPos - Position in raw (unformatted) string
 * @param formattedStr - The formatted string
 * @param localeDecimal - Optional locale-specific decimal separator
 */
const mapRawPosToFormattedPos = (
  rawPos: number,
  formattedStr: string,
  localeDecimal?: string,
): number => {
  let rawCount = 0;
  for (let i = 0; i < formattedStr.length; i++) {
    if (rawCount === rawPos) {
      return i;
    }
    if (!isSeparator(formattedStr[i], localeDecimal)) {
      rawCount++;
    }
  }
  return formattedStr.length;
};

/**
 * Detects which characters in the formatted string are new vs unchanged.
 * Uses cursor position to correctly identify which specific characters are new,
 * especially important when there are repeated identical characters.
 * Special handling for separators: they only animate if they're truly new,
 * not just shifted in position.
 *
 * @param oldFormatted - The old formatted string
 * @param newFormatted - The new formatted string
 * @param rawCursorPos - Cursor position in raw (unformatted) text after the change
 * @param rawSelectionStart - Selection start in raw text before the change
 * @param rawOldLength - Length of old raw text
 * @param localeDecimal - Optional locale-specific decimal separator (e.g., "," for fr-FR)
 */
export const getFormattedChanges = (
  oldFormatted: string,
  newFormatted: string,
  rawCursorPos?: number,
  rawSelectionStart?: number,
  rawOldLength?: number,
  localeDecimal?: string,
): { addedIndices: Set<number>; unchangedIndices: Set<number> } => {
  const addedIndices = new Set<number>();
  const unchangedIndices = new Set<number>();

  if (!oldFormatted) {
    for (let i = 0; i < newFormatted.length; i++) {
      addedIndices.add(i);
    }
    return { addedIndices, unchangedIndices };
  }

  // Count separators to determine which are truly new
  const oldSeparatorCounts = countSeparators(oldFormatted, localeDecimal);
  const newSeparatorCounts = countSeparators(newFormatted, localeDecimal);

  const newSeparatorAmounts = new Map<string, number>();
  for (const [char, newCount] of newSeparatorCounts) {
    const oldCount = oldSeparatorCounts.get(char) ?? 0;
    const trulyNew = Math.max(0, newCount - oldCount);
    newSeparatorAmounts.set(char, trulyNew);
  }

  // Extract non-separator characters (keeping locale decimal as a raw char)
  const extractNonSep = (str: string): string => {
    let result = "";
    for (const char of str) {
      if (!isSeparator(char, localeDecimal)) {
        result += char;
      }
    }
    return result;
  };
  const oldNonSep = extractNonSep(oldFormatted);
  const newNonSep = extractNonSep(newFormatted);

  // If cursor info is provided, use position-based diff
  // This correctly handles repeated identical characters
  if (
    rawCursorPos !== undefined &&
    rawSelectionStart !== undefined &&
    rawOldLength !== undefined
  ) {
    const numInserted = newNonSep.length - oldNonSep.length;

    // Characters inserted at rawSelectionStart, cursor moved to rawCursorPos
    // So inserted characters are from rawSelectionStart to rawCursorPos (exclusive)
    const insertStartRaw = rawSelectionStart;
    const insertEndRaw = rawCursorPos;

    // Map raw positions to formatted positions
    const insertStartFormatted = mapRawPosToFormattedPos(
      insertStartRaw,
      newFormatted,
      localeDecimal,
    );
    const insertEndFormatted = mapRawPosToFormattedPos(
      insertEndRaw,
      newFormatted,
      localeDecimal,
    );

    // Track separators that should animate (truly new ones)
    // We want to animate new separators that appear in the inserted region
    const remainingNewSeparators = new Map(newSeparatorAmounts);

    for (let idx = 0; idx < newFormatted.length; idx++) {
      const char = newFormatted[idx];

      if (isSeparator(char, localeDecimal)) {
        // For separators: animate if truly new AND in/near the insertion region
        const remaining = remainingNewSeparators.get(char ?? "") ?? 0;
        if (
          remaining > 0 &&
          idx >= insertStartFormatted &&
          idx < insertEndFormatted
        ) {
          addedIndices.add(idx);
          remainingNewSeparators.set(char ?? "", remaining - 1);
        } else if (remaining > 0 && numInserted > 0) {
          // New separator but outside insertion region - still mark as new
          // This handles cases where separator appears due to digit insertion
          addedIndices.add(idx);
          remainingNewSeparators.set(char ?? "", remaining - 1);
        } else {
          unchangedIndices.add(idx);
        }
      } else {
        // For non-separator characters: use position-based logic
        if (idx >= insertStartFormatted && idx < insertEndFormatted) {
          // This character is in the inserted region
          addedIndices.add(idx);
        } else {
          unchangedIndices.add(idx);
        }
      }
    }

    return { addedIndices, unchangedIndices };
  }

  // Fallback: use LCS-based detection when cursor info not available
  // (This is the old behavior, kept for backwards compatibility)
  const m = oldNonSep.length;
  const n = newNonSep.length;

  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    Array(n + 1).fill(0),
  );

  for (let i = 1; i <= m; i++) {
    const prevRow = dp[i - 1];
    const currentRow = dp[i];
    if (!prevRow || !currentRow) {
      continue;
    }
    for (let j = 1; j <= n; j++) {
      if (oldNonSep[i - 1] === newNonSep[j - 1]) {
        currentRow[j] = (prevRow[j - 1] ?? 0) + 1;
      } else {
        currentRow[j] = Math.max(prevRow[j] ?? 0, currentRow[j - 1] ?? 0);
      }
    }
  }

  let i = m;
  let j = n;
  const lcsNewNonSepIndices = new Set<number>();

  while (i > 0 && j > 0) {
    const prevRow = dp[i - 1];
    const currentRow = dp[i];
    if (!prevRow || !currentRow) {
      break;
    }
    if (oldNonSep[i - 1] === newNonSep[j - 1]) {
      lcsNewNonSepIndices.add(j - 1);
      i--;
      j--;
    } else if ((prevRow[j] ?? 0) > (currentRow[j - 1] ?? 0)) {
      i--;
    } else {
      j--;
    }
  }

  const nonSepIndexToFormattedIndex = new Map<number, number>();
  let nonSepIdx = 0;
  for (let idx = 0; idx < newFormatted.length; idx++) {
    if (!isSeparator(newFormatted[idx], localeDecimal)) {
      nonSepIndexToFormattedIndex.set(nonSepIdx, idx);
      nonSepIdx++;
    }
  }

  const remainingNewSeparators = new Map(newSeparatorAmounts);

  for (let idx = 0; idx < newFormatted.length; idx++) {
    const char = newFormatted[idx];
    if (isSeparator(char, localeDecimal)) {
      const remaining = remainingNewSeparators.get(char ?? "") ?? 0;
      if (remaining > 0) {
        addedIndices.add(idx);
        remainingNewSeparators.set(char ?? "", remaining - 1);
      } else {
        unchangedIndices.add(idx);
      }
    } else {
      let nonSepIdxForThis = -1;
      for (const [nsi, fi] of nonSepIndexToFormattedIndex) {
        if (fi === idx) {
          nonSepIdxForThis = nsi;
          break;
        }
      }

      if (nonSepIdxForThis >= 0 && lcsNewNonSepIndices.has(nonSepIdxForThis)) {
        unchangedIndices.add(idx);
      } else {
        addedIndices.add(idx);
      }
    }
  }

  return { addedIndices, unchangedIndices };
};

/**
 * Build a barrel-wheel sequence + direction for a digit-to-digit transition.
 * @internal
 */
const buildBarrelWheel = (
  oldChar: string,
  newChar: string,
): { sequence: string[]; direction: "up" | "down" } => {
  const oldDigit = parseInt(oldChar, 10);
  const newDigit = parseInt(newChar, 10);
  const direction: "up" | "down" = newDigit > oldDigit ? "up" : "down";
  const sequence: string[] = [];
  if (direction === "up") {
    for (let i = oldDigit; i <= newDigit; i++) {
      sequence.push(i.toString());
    }
  } else {
    for (let i = newDigit; i <= oldDigit; i++) {
      sequence.push(i.toString());
    }
  }
  return { sequence, direction };
};

/**
 * Split a raw value into [sign?][integer][.decimal?] with their start positions.
 * @internal
 */
const splitRawParts = (
  value: string,
): {
  sign: string;
  int: string;
  dec: string | null;
  intStart: number;
  dotIdx: number;
  decStart: number;
} => {
  let start = 0;
  let sign = "";
  if (value[0] === "-") {
    sign = "-";
    start = 1;
  }
  const dotIdx = value.indexOf(".", start);
  const int = dotIdx === -1 ? value.slice(start) : value.slice(start, dotIdx);
  const dec = dotIdx === -1 ? null : value.slice(dotIdx + 1);
  return {
    sign,
    int,
    dec,
    intStart: start,
    dotIdx,
    decStart: dotIdx === -1 ? -1 : dotIdx + 1,
  };
};

/**
 * Diff two values as a wholesale replacement (used when the `value` prop
 * changes externally rather than via the user typing). Aligns integer digits
 * from the right and decimal digits from the left, so digits in the same
 * "column" produce barrel-wheel animations and any extra digits are added/
 * removed at the edges.
 */
export const getReplacementChanges = (
  oldValue: string,
  newValue: string,
): Changes => {
  const changes: Changes = {
    addedIndices: new Set(),
    unchangedIndices: new Set(),
    barrelWheelIndices: new Map(),
  };

  if (!oldValue) {
    for (let i = 0; i < newValue.length; i++) {
      changes.addedIndices.add(i);
    }
    return changes;
  }
  if (!newValue) {
    return changes;
  }

  const oldParts = splitRawParts(oldValue);
  const newParts = splitRawParts(newValue);

  // Sign (always at index 0 in raw)
  if (newParts.sign) {
    if (oldParts.sign) {
      changes.unchangedIndices.add(0);
    } else {
      changes.addedIndices.add(0);
    }
  }

  // Integer part: right-align
  const oldIntLen = oldParts.int.length;
  const newIntLen = newParts.int.length;
  for (let pos = 0; pos < newIntLen; pos++) {
    const newIdx = newParts.intStart + pos;
    const newChar = newParts.int[pos];
    if (!newChar) {
      continue;
    }
    const distFromEnd = newIntLen - 1 - pos;
    const oldPos = oldIntLen - 1 - distFromEnd;
    const oldChar = oldPos >= 0 ? oldParts.int[oldPos] : undefined;

    if (oldChar === undefined) {
      changes.addedIndices.add(newIdx);
    } else if (oldChar === newChar) {
      changes.unchangedIndices.add(newIdx);
    } else if (/^\d$/.test(oldChar) && /^\d$/.test(newChar)) {
      changes.barrelWheelIndices.set(newIdx, buildBarrelWheel(oldChar, newChar));
    } else {
      changes.addedIndices.add(newIdx);
    }
  }

  // Decimal point
  if (newParts.dotIdx !== -1) {
    if (oldParts.dotIdx !== -1) {
      changes.unchangedIndices.add(newParts.dotIdx);
    } else {
      changes.addedIndices.add(newParts.dotIdx);
    }
  }

  // Decimal part: left-align
  if (newParts.dec !== null && newParts.decStart !== -1) {
    const oldDec = oldParts.dec ?? "";
    for (let pos = 0; pos < newParts.dec.length; pos++) {
      const newIdx = newParts.decStart + pos;
      const newChar = newParts.dec[pos];
      if (!newChar) {
        continue;
      }
      const oldChar = pos < oldDec.length ? oldDec[pos] : undefined;

      if (oldChar === undefined) {
        changes.addedIndices.add(newIdx);
      } else if (oldChar === newChar) {
        changes.unchangedIndices.add(newIdx);
      } else if (/^\d$/.test(oldChar) && /^\d$/.test(newChar)) {
        changes.barrelWheelIndices.set(
          newIdx,
          buildBarrelWheel(oldChar, newChar),
        );
      } else {
        changes.addedIndices.add(newIdx);
      }
    }
  }

  return changes;
};

/**
 * Formatted-space variant of {@link getReplacementChanges}. Returns
 * added/unchanged indices in the *formatted* string, aligned the same way
 * (integers right-aligned, decimals left-aligned).
 */
export const getReplacementFormattedChanges = (
  oldFormatted: string,
  newFormatted: string,
  localeDecimal: string,
): { addedIndices: Set<number>; unchangedIndices: Set<number> } => {
  const addedIndices = new Set<number>();
  const unchangedIndices = new Set<number>();

  if (!oldFormatted) {
    for (let i = 0; i < newFormatted.length; i++) {
      addedIndices.add(i);
    }
    return { addedIndices, unchangedIndices };
  }
  if (!newFormatted) {
    return { addedIndices, unchangedIndices };
  }

  const oldDecIdx = oldFormatted.indexOf(localeDecimal);
  const newDecIdx = newFormatted.indexOf(localeDecimal);

  const oldIntStr =
    oldDecIdx === -1 ? oldFormatted : oldFormatted.slice(0, oldDecIdx);
  const newIntStr =
    newDecIdx === -1 ? newFormatted : newFormatted.slice(0, newDecIdx);

  const oldIntLen = oldIntStr.length;
  const newIntLen = newIntStr.length;
  for (let pos = 0; pos < newIntLen; pos++) {
    const distFromEnd = newIntLen - 1 - pos;
    const oldPos = oldIntLen - 1 - distFromEnd;
    const newChar = newIntStr[pos];
    const oldChar = oldPos >= 0 ? oldIntStr[oldPos] : undefined;
    if (oldChar !== undefined && oldChar === newChar) {
      unchangedIndices.add(pos);
    } else {
      addedIndices.add(pos);
    }
  }

  if (newDecIdx !== -1) {
    if (oldDecIdx !== -1) {
      unchangedIndices.add(newDecIdx);
    } else {
      addedIndices.add(newDecIdx);
    }
    const oldDecStr = oldDecIdx === -1 ? "" : oldFormatted.slice(oldDecIdx + 1);
    const newDecStr = newFormatted.slice(newDecIdx + 1);
    for (let pos = 0; pos < newDecStr.length; pos++) {
      const fullIdx = newDecIdx + 1 + pos;
      const newChar = newDecStr[pos];
      const oldChar = pos < oldDecStr.length ? oldDecStr[pos] : undefined;
      if (oldChar !== undefined && oldChar === newChar) {
        unchangedIndices.add(fullIdx);
      } else {
        addedIndices.add(fullIdx);
      }
    }
  }

  return { addedIndices, unchangedIndices };
};

export const getChanges = (
  oldValue: string,
  newValue: string,
  selectionStart: number,
  selectionEnd: number,
  newCursorPos: number,
): Changes => {
  const changes: Changes = {
    addedIndices: new Set(),
    unchangedIndices: new Set(),
    barrelWheelIndices: new Map(),
  };

  if (!oldValue) {
    for (let i = 0; i < newValue.length; i++) {
      changes.addedIndices.add(i);
    }
    return changes;
  }

  const hadSelection = selectionStart !== selectionEnd;
  const lengthDiff = newValue.length - oldValue.length;

  if (hadSelection) {
    const numReplaced = selectionEnd - selectionStart;
    const numInserted = newCursorPos - selectionStart;
    const insertStart = selectionStart;

    if (
      numReplaced === 1 &&
      numInserted === 1 &&
      insertStart < oldValue.length &&
      insertStart < newValue.length
    ) {
      const oldChar = oldValue[insertStart];
      const newChar = newValue[insertStart];

      if (oldChar && newChar && /^\d$/.test(oldChar) && /^\d$/.test(newChar)) {
        if (oldChar !== newChar) {
          changes.barrelWheelIndices.set(
            insertStart,
            buildBarrelWheel(oldChar, newChar),
          );
        }
      }
    }

    for (let i = 0; i < insertStart; i++) {
      if (
        i < oldValue.length &&
        i < newValue.length &&
        oldValue[i] === newValue[i]
      ) {
        changes.unchangedIndices.add(i);
      }
    }

    for (let i = insertStart; i < newCursorPos; i++) {
      if (!changes.barrelWheelIndices.has(i)) {
        changes.addedIndices.add(i);
      }
    }

    const oldAfterEnd = selectionEnd;
    const newAfterEnd = newCursorPos;
    const minLength = Math.min(
      oldValue.length - oldAfterEnd,
      newValue.length - newAfterEnd,
    );

    for (let i = 0; i < minLength; i++) {
      const oldIdx = oldAfterEnd + i;
      const newIdx = newAfterEnd + i;
      if (
        oldIdx < oldValue.length &&
        newIdx < newValue.length &&
        oldValue[oldIdx] === newValue[newIdx]
      ) {
        changes.unchangedIndices.add(newIdx);
      }
    }
  } else if (lengthDiff > 0) {
    const insertPos = newCursorPos - lengthDiff;

    for (let i = 0; i < insertPos; i++) {
      if (
        i < oldValue.length &&
        i < newValue.length &&
        oldValue[i] === newValue[i]
      ) {
        changes.unchangedIndices.add(i);
      }
    }

    for (let i = insertPos; i < newCursorPos; i++) {
      changes.addedIndices.add(i);
    }

    for (let i = newCursorPos; i < newValue.length; i++) {
      const oldIdx = i - lengthDiff;
      if (
        oldIdx >= 0 &&
        oldIdx < oldValue.length &&
        oldValue[oldIdx] === newValue[i]
      ) {
        changes.unchangedIndices.add(i);
      }
    }
  } else if (lengthDiff < 0) {
    const deletePos = selectionStart;
    const numDeleted = -lengthDiff;

    for (let i = 0; i < deletePos; i++) {
      if (
        i < oldValue.length &&
        i < newValue.length &&
        oldValue[i] === newValue[i]
      ) {
        changes.unchangedIndices.add(i);
      }
    }

    for (let i = deletePos; i < newValue.length; i++) {
      const oldIdx = i + numDeleted;
      if (oldIdx < oldValue.length && oldValue[oldIdx] === newValue[i]) {
        changes.unchangedIndices.add(i);
      }
    }
  } else {
    for (let i = 0; i < newValue.length; i++) {
      if (i < oldValue.length && oldValue[i] === newValue[i]) {
        changes.unchangedIndices.add(i);
      }
    }
  }

  return changes;
};

/**
 * Get the group number for a character at a given index.
 * Groups are separated by separator characters (commas, spaces, etc.).
 * Group 0 is before the first separator, group 1 is after, etc.
 * @param localeDecimal - Optional locale-specific decimal separator
 */
const getGroupNumber = (
  str: string,
  index: number,
  localeDecimal?: string,
): number => {
  let group = 0;
  for (let i = 0; i < index && i < str.length; i++) {
    if (isSeparator(str[i], localeDecimal)) {
      group++;
    }
  }
  return group;
};

/**
 * Detects which characters should animate their x-position when the formatted
 * string changes. This includes:
 * - Separators that moved positions
 * - Digits that crossed group boundaries (moved past a separator)
 *
 * @param localeDecimal - Optional locale-specific decimal separator
 * @returns Array of indices in the new formatted string that should animate
 */
export const getPositionChanges = (
  oldFormatted: string,
  newFormatted: string,
  localeDecimal?: string,
): PositionChange[] => {
  const changes: PositionChange[] = [];

  if (!oldFormatted || !newFormatted) {
    return changes;
  }

  // Helper to extract non-separator characters
  const extractNonSep = (str: string): string => {
    let result = "";
    for (const char of str) {
      if (!isSeparator(char, localeDecimal)) {
        result += char;
      }
    }
    return result;
  };

  // Extract non-separator characters from both strings
  const oldNonSep = extractNonSep(oldFormatted);
  const newNonSep = extractNonSep(newFormatted);

  // Map each non-separator character in the new string to its position in old string
  // We use a simple matching algorithm: match from left to right for unchanged chars
  // This handles insertions and deletions correctly

  // First, find the LCS (longest common subsequence) to match characters
  const m = oldNonSep.length;
  const n = newNonSep.length;

  if (m === 0 || n === 0) {
    return changes;
  }

  // Build LCS table
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    Array(n + 1).fill(0),
  );

  for (let i = 1; i <= m; i++) {
    const prevRow = dp[i - 1];
    const currentRow = dp[i];
    if (!prevRow || !currentRow) {
      continue;
    }
    for (let j = 1; j <= n; j++) {
      if (oldNonSep[i - 1] === newNonSep[j - 1]) {
        currentRow[j] = (prevRow[j - 1] ?? 0) + 1;
      } else {
        currentRow[j] = Math.max(prevRow[j] ?? 0, currentRow[j - 1] ?? 0);
      }
    }
  }

  // Backtrack to find matching pairs
  // Maps new non-sep index to old non-sep index
  const newToOldNonSepIndex = new Map<number, number>();
  let i = m;
  let j = n;

  while (i > 0 && j > 0) {
    if (oldNonSep[i - 1] === newNonSep[j - 1]) {
      newToOldNonSepIndex.set(j - 1, i - 1);
      i--;
      j--;
    } else if ((dp[i - 1]?.[j] ?? 0) > (dp[i]?.[j - 1] ?? 0)) {
      i--;
    } else {
      j--;
    }
  }

  // Build maps from non-sep index to formatted index
  const oldNonSepToFormatted = new Map<number, number>();
  let nonSepIdx = 0;
  for (let idx = 0; idx < oldFormatted.length; idx++) {
    if (!isSeparator(oldFormatted[idx], localeDecimal)) {
      oldNonSepToFormatted.set(nonSepIdx, idx);
      nonSepIdx++;
    }
  }

  const newNonSepToFormatted = new Map<number, number>();
  nonSepIdx = 0;
  for (let idx = 0; idx < newFormatted.length; idx++) {
    if (!isSeparator(newFormatted[idx], localeDecimal)) {
      newNonSepToFormatted.set(nonSepIdx, idx);
      nonSepIdx++;
    }
  }

  // Check each character in the new formatted string
  for (let newIdx = 0; newIdx < newFormatted.length; newIdx++) {
    const char = newFormatted[newIdx];

    if (isSeparator(char, localeDecimal)) {
      // For separators, check if there was a separator at a different position
      // We need to find if this separator "moved" from somewhere

      // Count separators of this type before this position in both strings
      let newSepCountBefore = 0;
      for (let k = 0; k < newIdx; k++) {
        if (newFormatted[k] === char) {
          newSepCountBefore++;
        }
      }

      // Find the matching separator in old string (same type, same occurrence number)
      let oldSepCount = 0;
      let oldIdx = -1;
      for (let k = 0; k < oldFormatted.length; k++) {
        if (oldFormatted[k] === char) {
          if (oldSepCount === newSepCountBefore) {
            oldIdx = k;
            break;
          }
          oldSepCount++;
        }
      }

      // If found and positions differ, this separator moved
      if (oldIdx >= 0 && oldIdx !== newIdx && char !== undefined) {
        changes.push({
          newIndex: newIdx,
          oldIndex: oldIdx,
          char,
          isSeparator: true,
          crossedGroup: false,
        });
      }
    } else {
      // For non-separator characters, check if they crossed a group boundary
      // Find the non-sep index for this formatted index
      let newNonSepIdx = -1;
      for (const [nsi, fi] of newNonSepToFormatted) {
        if (fi === newIdx) {
          newNonSepIdx = nsi;
          break;
        }
      }

      if (newNonSepIdx >= 0) {
        const oldNonSepIdx = newToOldNonSepIndex.get(newNonSepIdx);
        if (oldNonSepIdx !== undefined) {
          const oldFormattedIdx = oldNonSepToFormatted.get(oldNonSepIdx);
          if (oldFormattedIdx !== undefined && char !== undefined) {
            // Character existed before - check if it crossed a group boundary
            const oldGroup = getGroupNumber(
              oldFormatted,
              oldFormattedIdx,
              localeDecimal,
            );
            const newGroup = getGroupNumber(
              newFormatted,
              newIdx,
              localeDecimal,
            );

            if (oldGroup !== newGroup) {
              changes.push({
                newIndex: newIdx,
                oldIndex: oldFormattedIdx,
                char,
                isSeparator: false,
                crossedGroup: true,
              });
            }
          }
        }
      }
    }
  }

  return changes;
};
