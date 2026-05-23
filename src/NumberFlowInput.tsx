import {
  type ClipboardEventHandler,
  type ComponentPropsWithoutRef,
  type FormEventHandler,
  forwardRef,
  type KeyboardEventHandler,
  useCallback,
  useEffect,
  useInsertionEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { injectStyles } from "./styles.js";
import {
  cleanupWidthAnimation,
  clearBarrelWheelsAndSpans,
  getAllBarrelWheels,
  getBarrelWheel,
  repositionBarrelWheel,
  setWidthConstraints,
  temporarilyRemoveAncestorsTransform,
} from "./utils/barrelWheel.js";
import { combineRefs } from "./utils/combineRefs.js";
import {
  getChanges,
  getFormattedChanges,
  getPositionChanges,
  getReplacementChanges,
  getReplacementFormattedChanges,
} from "./utils/diff.js";
import {
  formatValue,
  getLocaleSeparators,
  isRawCharacter,
  type Separators,
} from "./utils/formatting.js";
import type { MaybeUndefined } from "./utils/maybe.js";
import { moveElementPreservingAnimation } from "./utils/moveElementPreservingAnimation.js";
import { isNonNullable } from "./utils/nullable.js";
import { cleanText, parseNumberValue } from "./utils/textCleaning.js";
import {
  clearWidthStyles,
  getSelectionRange,
  hasWidthStyles,
  isTransparent,
  measureText,
  removeTransparentColor,
  setCursorAtPosition,
  setCursorPositionInElement,
} from "./utils/utils.js";

export type NumberFlowInputControlledProps = {
  // Value if controlled
  value: MaybeUndefined<number>;
  // Starting value if uncontrolled
  defaultValue?: never;
};

export type NumberFlowInputUncontrolledProps = {
  // Starting value if uncontrolled
  defaultValue?: number;
  // Value if controlled
  value?: never;
};

export type NumberFlowInputCommonProps = {
  /**
   * callback when the value changes
   */
  onChange?: (value: MaybeUndefined<number>) => void;
  /**
   * Callback fired alongside `onChange`, but receiving the raw string
   * representation of the input (e.g. `"12345678901234567890.123"`).
   *
   * `onChange` exposes a JavaScript `number`, which is IEEE 754 double
   * precision and therefore rounds values outside
   * `Number.MAX_SAFE_INTEGER` (~9.007 × 10¹⁵) or with more than ~15–17
   * significant digits. Use `onChangeText` when you need to preserve the
   * user's exact input — e.g. arbitrary-precision math, BigInt parsing,
   * monetary values stored as strings.
   *
   * The argument is the unformatted raw text — digits, an optional
   * leading `-`, and an optional single `.` (always `.`, never the
   * locale decimal). Intermediate states like `""`, `"-"`, `"."`,
   * `"-."` are reported verbatim so consumers can render them if needed.
   */
  onChangeText?: (rawText: string) => void;
  /**
   * should the component add leading zero when the user types a decimal point?
   */
  autoAddLeadingZero?: boolean;
  /**
   * number of allowed decimal places
   */
  decimalScale?: number;
  /**
   * whether to allow negative values
   */
  allowNegative?: boolean;
  /**
   * maxLength of the input
   */
  maxLength?: number;
  /**
   * callback to determine if a value is allowed.
   *   If provided, the input will not allow values that are not allowed.
   *   The callback is called with the value as an argument.
   *   If the callback returns false, the input will be prevented from changing.
   *   If the callback returns true, the input will be allowed to change.
   *   If the callback is not provided, the input will not be restricted in value.
   */
  isAllowed?: (value: number | null) => boolean;
  /**
   * Focus the input on mount
   */
  autoFocus?: boolean;
  /**
   * Locale for number formatting.
   * If provided, decimal and group separators will be inferred from this locale.
   * The input will accept both '.' and the locale-specific decimal separator.
   */
  locale?: Intl.UnicodeBCP47LocaleIdentifier | Intl.Locale;
  /**
   * Whether to format the display.
   *
   * - `false` (default): no grouping; only the locale's decimal
   *   separator is applied (so typing `1.5` with `locale="de-DE"`
   *   renders `"1,5"`).
   * - `true`: use `Intl.NumberFormat` with the supplied `locale` (or
   *   the runtime default if `locale` is not set).
   * - `(displayValue: string) => string`: a custom formatter. Receives
   *   the raw, unformatted input (digits, optional leading `-`, optional
   *   single `.` as decimal). Whatever you return is rendered verbatim.
   *
   * When you provide a function, you take ownership of the formatting,
   * but for correct cursor positioning and animation diffing your output
   * should:
   *   - use the locale's decimal character (or `.` if no locale is set)
   *     so the component's raw↔formatted index mapping stays accurate;
   *   - preserve the digits the user typed in order (so the diff logic
   *     can match old digits to new digits).
   */
  format?: boolean | ((displayValue: string) => string);
  /**
   * Whether to animate the transition when the `value` prop changes
   * externally. When `false`, external value updates snap to the new
   * value instantly — no digit-roll, no separator slide, no flow
   * animation. Animations triggered by user typing or by `format` /
   * `locale` prop changes are unaffected.
   * Default: true
   */
  animateOnValueChange?: boolean;
  "data-testid"?: string;
} & Pick<
  ComponentPropsWithoutRef<"input">,
  | "min"
  | "max"
  | "minLength"
  | "maxLength"
  | "form"
  | "required"
  | "name"
  | "id"
  | "placeholder"
  | "onFocus"
  | "onBlur"
  | "className"
  | "style"
>;

export type NumberFlowInputProps = NumberFlowInputCommonProps &
  (NumberFlowInputControlledProps | NumberFlowInputUncontrolledProps);

export const NumberFlowInput = forwardRef<HTMLElement, NumberFlowInputProps>(
  (
    {
      value,
      defaultValue,
      onChange,
      onChangeText,
      autoAddLeadingZero = false,
      allowNegative,
      decimalScale,
      placeholder,
      locale,
      format = false,
      onFocus,
      onBlur,
      className,
      style,
      isAllowed,
      autoFocus = false,
      animateOnValueChange = true,
      "data-testid": dataTestId,
      ...inputProps
    },
    ref,
  ) => {
    // Inject the component's stylesheet exactly once, before any layout
    // effects run so the styles are in place for the very first paint.
    useInsertionEffect(() => {
      injectStyles();
    }, []);

    const spanRef = useRef<HTMLSpanElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const [uncontrolledValue, setUncontrolledValue] = useState(defaultValue);
    const isControlled = value !== undefined;
    const actualValue = isControlled ? value : uncontrolledValue;
    // Raw display value (unformatted, e.g., "1234.56")
    const [displayValue, setDisplayValue] = useState(
      actualValue?.toString() ?? "",
    );

    const [, setCursorPosition] = useState(0);
    const { maxLength } = inputProps;

    // Compute current separators (decimal/group) from `locale` and
    // `format`. Every call site reads the freshest value at runtime, so a
    // `locale` or `format` change is reflected immediately.
    const computeSeparators = useCallback((): Separators => {
      if (locale || format) {
        return getLocaleSeparators(locale);
      }
      return { decimal: ".", group: "," };
    }, [format, locale]);

    // Locale-only separators (independent of `format`). Used by input
    // handling (paste, decimal-key acceptance, separator-skipping
    // arrow navigation) which always understands the locale decimal
    // even when display formatting is off.
    const computeLocaleSeparators = useCallback(
      (): Separators => getLocaleSeparators(locale),
      [locale],
    );

    // Compute the formatted display value
    const formattedDisplayValue = useMemo(
      () =>
        formatValue(displayValue, {
          locale,
          format,
          autoAddLeadingZero,
          separators: computeSeparators(),
        }),
      [displayValue, locale, format, autoAddLeadingZero, computeSeparators],
    );

    // Track previous formatted value for change detection
    const prevFormattedValueRef = useRef(formattedDisplayValue);

    // Decimal separator that was actually used to format the previous
    // render's value. We seed it with the current render's value and
    // keep it in sync at the end of the format/locale-toggle effect so
    // the next run can read the OLD render's decimal directly without
    // a `.`-vs-`,` heuristic that breaks for short values like "1.5"
    // vs "1,5".
    const prevDecimalRef = useRef(computeSeparators().decimal);

    // Undo/Redo history - stores cursor position before and after each change
    const historyRef = useRef<
      Array<{
        text: string;
        cursorPosBefore: number; // Cursor position before the change (for undo)
        cursorPosAfter: number; // Cursor position after the change (for redo)
        value: MaybeUndefined<number>;
      }>
    >([]);
    const historyIndexRef = useRef(-1);
    const isUndoRedoRef = useRef(false);

    // Track if we should prevent the next input event (for leading 0 bug)
    const shouldPreventInputRef = useRef(false);
    const preventInputCursorPosRef = useRef(0);

    // Track ResizeObservers for digits with barrel wheel animations
    const resizeObserversRef = useRef<Map<number, ResizeObserver>>(new Map());

    // Track the in-flight wrapper width animation so a rapid back-to-back
    // `format` / `locale` toggle can cancel the previous animation before
    // starting a new one (no listener / animation leaks).
    const wrapperWidthAnimRef = useRef<Animation | null>(null);

    // Helper to check if a character is a "raw" character (digit, decimal, or minus)
    const isRawChar = useCallback(
      (char: string | undefined): boolean =>
        isRawCharacter(char, computeSeparators().decimal),
      [computeSeparators],
    );

    // Helper to map a raw index to a formatted index
    // Raw: "1234.56" -> Formatted: "1,234.56"
    // Raw index 0 (1) -> Formatted index 0
    // Raw index 1 (2) -> Formatted index 2 (after comma)
    const mapRawToFormattedIndex = useCallback(
      (rawValue: string, formattedValue: string, rawIndex: number): number => {
        if (rawIndex <= 0) {
          return 0;
        }
        if (rawIndex >= rawValue.length) {
          return formattedValue.length;
        }

        // Count how many raw characters we've seen to find the rawIndex'th one
        let rawCount = 0;

        for (
          let formattedIndex = 0;
          formattedIndex < formattedValue.length;
          formattedIndex++
        ) {
          const formattedChar = formattedValue[formattedIndex];
          // Check if this is a raw character (digit, decimal, minus) vs format character (comma, space, etc.)
          if (isRawChar(formattedChar)) {
            if (rawCount === rawIndex) {
              // Found the rawIndex'th raw character
              return formattedIndex;
            }
            rawCount++;
          }
        }

        return formattedValue.length;
      },
      [isRawChar],
    );

    // Helper to map a formatted index to a raw index
    const mapFormattedToRawIndex = useCallback(
      (
        rawValue: string,
        formattedValue: string,
        formattedIndex: number,
      ): number => {
        if (formattedIndex <= 0) {
          return 0;
        }
        if (formattedIndex >= formattedValue.length) {
          return rawValue.length;
        }

        let rawIndex = 0;
        for (let i = 0; i < formattedIndex && i < formattedValue.length; i++) {
          const char = formattedValue[i];
          if (isRawChar(char)) {
            rawIndex++;
          }
        }
        return Math.min(rawIndex, rawValue.length);
      },
      [isRawChar],
    );

    // Helper to format a raw value string (raw always uses '.' as decimal)
    const formatRawValue = useCallback(
      (rawValue: string): string =>
        formatValue(rawValue, {
          locale,
          format,
          autoAddLeadingZero,
          separators: computeSeparators(),
        }),
      [locale, format, autoAddLeadingZero, computeSeparators],
    );

    const addToHistory = useCallback(
      (
        text: string,
        cursorPosBefore: number,
        cursorPosAfter: number,
        value: MaybeUndefined<number>,
      ) => {
        historyRef.current = historyRef.current.slice(
          0,
          historyIndexRef.current + 1,
        );
        historyRef.current.push({
          text,
          cursorPosBefore,
          cursorPosAfter,
          value,
        });
        historyIndexRef.current = historyRef.current.length - 1;
        if (historyRef.current.length > 50) {
          historyRef.current.shift();
          historyIndexRef.current--;
        }
      },
      [],
    );

    // Helper function to reposition all existing barrel wheels
    const repositionAllBarrelWheels = useCallback(() => {
      if (!spanRef.current?.parentElement) {
        return;
      }

      const parentContainer = spanRef.current.parentElement;
      const existingBarrelWheels = parentContainer.querySelectorAll(
        "[data-char-index][data-barrel-wheel]",
      );

      if (existingBarrelWheels.length === 0) {
        return;
      }

      const cleanup = temporarilyRemoveAncestorsTransform(
        spanRef.current.parentElement,
      );

      // Get all spans in DOM order and calculate their FINAL widths using measureText
      // This is needed because some spans may be animating their width from 0
      const allSpans = Array.from(
        spanRef.current.querySelectorAll("[data-char-index]"),
      ) as HTMLElement[];

      // Sort by data-char-index to ensure correct order
      allSpans.sort((a, b) => {
        const aIndex = parseInt(a.getAttribute("data-char-index") ?? "0", 10);
        const bIndex = parseInt(b.getAttribute("data-char-index") ?? "0", 10);
        return aIndex - bIndex;
      });

      // Calculate final widths for all spans using measureText
      const spanWidths = new Map<number, number>();
      allSpans.forEach((span) => {
        const index = parseInt(
          span.getAttribute("data-char-index") ?? "-1",
          10,
        );
        if (index >= 0 && span.textContent) {
          // Use measureText to get the accurate final width
          const finalWidth = measureText(span.textContent, span);
          spanWidths.set(index, finalWidth);
        }
      });

      // Get the container's position for relative positioning
      const containerRect = spanRef.current.getBoundingClientRect();
      const parentRect = parentContainer.getBoundingClientRect();

      existingBarrelWheels.forEach((wheel) => {
        const wheelEl = wheel as HTMLElement;
        const indexStr = wheelEl.getAttribute("data-char-index");
        if (indexStr !== null) {
          const barrelIndex = parseInt(indexStr, 10);
          if (!isNaN(barrelIndex) && barrelIndex >= 0 && spanRef.current) {
            const charSpan = spanRef.current.querySelector(
              `[data-char-index="${barrelIndex}"]`,
            ) as HTMLElement | null;

            if (charSpan) {
              if (!isTransparent(charSpan)) {
                charSpan.style.color = "transparent";
              }

              // Calculate the left position by summing widths of all preceding spans
              let leftPosition = containerRect.left - parentRect.left;
              for (let i = 0; i < barrelIndex; i++) {
                const width = spanWidths.get(i);
                if (width !== undefined) {
                  leftPosition += width;
                }
              }

              // Get the barrel wheel span's dimensions
              const barrelSpanWidth = spanWidths.get(barrelIndex) ?? 0;
              const barrelSpanHeight = charSpan.getBoundingClientRect().height;

              // Position the barrel wheel
              wheelEl.style.left = `${leftPosition}px`;
              wheelEl.style.top = `${containerRect.top - parentRect.top}px`;
              wheelEl.style.width = `${barrelSpanWidth}px`;
              wheelEl.style.height = `${barrelSpanHeight}px`;
            }
          }
        }
      });
      cleanup();
    }, []);

    // Helper function to remove barrel wheels at specific indices
    const removeBarrelWheelsAtIndices = useCallback((indices: number[]) => {
      if (!spanRef.current) {
        return;
      }
      const parentContainer = spanRef.current.parentElement;
      if (!parentContainer) {
        return;
      }

      indices.forEach((index) => {
        // Clean up ResizeObserver for this index
        const observer = resizeObserversRef.current.get(index);
        if (observer) {
          observer.disconnect();
          resizeObserversRef.current.delete(index);
        }

        const charSpan = spanRef.current?.querySelector(
          `[data-char-index="${index}"]`,
        ) as HTMLElement | null;
        if (charSpan) {
          if (charSpan.hasAttribute("data-width-animate")) {
            cleanupWidthAnimation(charSpan);
          }
          if (isTransparent(charSpan)) {
            charSpan.style.color = "";
          }
        }

        const barrelWheel = parentContainer.querySelector(
          `[data-char-index="${index}"][data-barrel-wheel]`,
        ) as HTMLElement | null;
        if (barrelWheel) {
          barrelWheel.remove();

          // After removing barrel wheel, do a final pass to ensure the span at THIS index is not still transparent
          // IMPORTANT: Only check the span at the specific index, not other spans with the same final digit
          // This prevents conflicts when multiple barrel wheels have the same final digit
          if (spanRef.current) {
            const spanAtIndex = spanRef.current.querySelector(
              `[data-char-index="${index}"]`,
            ) as HTMLElement | null;

            if (spanAtIndex) {
              const hasBarrelWheel = parentContainer.querySelector(
                `[data-char-index="${index}"][data-barrel-wheel]`,
              );
              if (isTransparent(spanAtIndex) && !hasBarrelWheel) {
                spanAtIndex.style.color = "";
              }
            }
          }
        }
      });
    }, []);

    // Run the same cleanup the wheel's transitionend listener runs, but
    // imperatively (called from the listener, and from
    // `sweepSettledBarrelWheels` below). Reading everything we need off
    // the wheel's attributes / refs means the function has no per-wheel
    // closure dependencies, so it can be a stable callback.
    const cleanupBarrelWheel = useCallback((wheel: HTMLElement) => {
      const currentIndexStr = wheel.getAttribute("data-char-index");
      if (currentIndexStr === null) {
        wheel.remove();
        return;
      }
      const currentIndex = parseInt(currentIndexStr, 10);

      const observer = resizeObserversRef.current.get(currentIndex);
      if (observer) {
        observer.disconnect();
        resizeObserversRef.current.delete(currentIndex);
      }

      const targetSpan =
        (spanRef.current?.querySelector(
          `[data-char-index="${currentIndex}"]`,
        ) as HTMLElement | null) ?? null;

      if (targetSpan) {
        cleanupWidthAnimation(targetSpan);
        removeTransparentColor(targetSpan);
        targetSpan.removeAttribute("data-flow");
        targetSpan.style.transition = "none";
      }

      wheel.remove();

      requestAnimationFrame(() => {
        if (!spanRef.current) {
          return;
        }
        const spanAtCurrentIndex = spanRef.current.querySelector(
          `[data-char-index="${currentIndex}"]`,
        ) as HTMLElement | null;

        if (spanAtCurrentIndex && isTransparent(spanAtCurrentIndex)) {
          const parent = spanRef.current.parentElement;
          const hasBarrelWheel = parent && getBarrelWheel(parent, currentIndex);
          if (!hasBarrelWheel) {
            removeTransparentColor(spanAtCurrentIndex);
          }
        }
      });
    }, []);

    // Sweep any barrel wheels whose entrance animation is already
    // finished and run their cleanup synchronously. This is a safety net
    // for the case where a wheel's `transitionend` was never fired by
    // the browser — e.g. when the consumer's CSS happens to animate a
    // property we don't observe, or when an update preempts an in-flight
    // animation and leaves a stale wheel behind.
    //
    // We do NOT rely on the wrapper's `--digit-position` value: that
    // variable is set to its final position the moment the transition
    // *starts*, so it can't distinguish "settled" from "currently
    // animating toward that value".
    //
    // Instead each wheel stamps `data-anim-end-at` with the time
    // (`performance.now()` ms) at which its animation is expected to
    // finish, and we sweep only wheels past that deadline AND with no
    // running animations on themselves or their descendants. The
    // timestamp gate makes the sweep behave deterministically both in
    // real browsers and in jsdom (where `getAnimations` returns an
    // empty array regardless of what's actually running).
    const sweepSettledBarrelWheels = useCallback(() => {
      const parent = spanRef.current?.parentElement;
      if (!parent) {
        return;
      }
      const wheelEls = parent.querySelectorAll(
        "[data-barrel-wheel]",
      ) as NodeListOf<HTMLElement>;
      if (wheelEls.length === 0) {
        return;
      }

      const now = performance.now();
      const supportsGetAnimations =
        typeof (Element.prototype as unknown as { getAnimations?: unknown })
          .getAnimations === "function";

      wheelEls.forEach((wheel) => {
        const endAtAttr = wheel.getAttribute("data-anim-end-at");
        if (endAtAttr === null) {
          // No deadline stamped yet — the wheel was just created on the
          // previous frame and hasn't started animating; leave it alone.
          return;
        }
        const endAt = parseFloat(endAtAttr);
        if (Number.isFinite(endAt) && now < endAt) {
          return;
        }

        if (supportsGetAnimations) {
          const anims = (
            wheel as HTMLElement & {
              getAnimations: (opts?: { subtree?: boolean }) => Animation[];
            }
          ).getAnimations({ subtree: true });
          const stillAnimating = anims.some(
            (a) => a.playState === "running" || a.playState === "paused",
          );
          if (stillAnimating) {
            return;
          }
        }

        cleanupBarrelWheel(wheel);
      });
    }, [cleanupBarrelWheel]);

    const updateValue = useCallback(
      (
        newText: string,
        newCursorPos: number,
        selectionStart: number,
        selectionEnd: number,
        options: {
          skipHistory?: boolean;
          skipOnChange?: boolean;
          skipCursor?: boolean;
          asReplacement?: boolean;
        } = {},
      ) => {
        const {
          skipHistory = false,
          skipOnChange = false,
          skipCursor = false,
          asReplacement = false,
        } = options;

        if (isAllowed && !isAllowed(Number(newText))) {
          return;
        }

        // Clean up any barrel wheels from a previous update that have
        // already reached their final position. Otherwise a wheel whose
        // transitionend never fired (e.g. because the consumer's CSS
        // didn't animate any property we listen for) would ghost the
        // underlying char span across the next update.
        sweepSettledBarrelWheels();

        // Clean up stale width animations from fast typing
        if (spanRef.current) {
          spanRef.current
            .querySelectorAll("[data-char-index][data-show]")
            .forEach((span) => {
              const el = span as HTMLElement;
              if (
                hasWidthStyles(el) &&
                !el.hasAttribute("data-width-animate")
              ) {
                clearWidthStyles(el);
              }
            });
        }

        const oldText = displayValue;
        const rawCleaned = newText.replace(/[^\d.-]/g, "");
        const { cleanedText: baseCleanedText, leadingZerosRemoved } = cleanText(
          rawCleaned,
          autoAddLeadingZero,
        );
        const cleanedText = baseCleanedText;

        if (leadingZerosRemoved > 0 && newCursorPos > 0) {
          newCursorPos = Math.max(0, newCursorPos - leadingZerosRemoved);
        }

        if (autoAddLeadingZero) {
          // Check rawCleaned (before leading zero was added) to detect if we added a leading zero
          if (rawCleaned.startsWith(".")) {
            newCursorPos += 1;
          } else if (rawCleaned.startsWith("-.")) {
            newCursorPos += 1;
          }
        }

        const numberValue = parseNumberValue(cleanedText);

        if (!skipOnChange) {
          onChange?.(numberValue);
          onChangeText?.(cleanedText);
        }
        setUncontrolledValue(numberValue);
        setDisplayValue(cleanedText);
        setCursorPosition(newCursorPos);

        if (!skipHistory && !isUndoRedoRef.current) {
          addToHistory(cleanedText, selectionEnd, newCursorPos, numberValue);
        }

        // Update DOM with animation
        if (spanRef.current) {
          // Special handling for leading zero removal and decimal point deletion
          let adjustedOldText = oldText;
          let adjustedSelectionStart = selectionStart;
          let adjustedSelectionEnd = selectionEnd;
          let adjustedNewCursorPos = newCursorPos;

          // Check if we deleted a decimal point that was after a leading zero (e.g., "0.122" -> "122")
          const deletedDecimalAfterZero =
            oldText.startsWith("0.") &&
            !cleanedText.startsWith("0") &&
            cleanedText.length > 0 &&
            oldText.length > cleanedText.length &&
            oldText.includes(".") &&
            !cleanedText.includes(".");

          // Check if we're replacing a single leading "0" with a non-zero digit (e.g., "0" -> "1")
          const replacedLeadingZero =
            oldText === "0" &&
            cleanedText.length > 0 &&
            cleanedText[0] !== "0" &&
            !cleanedText.startsWith("0.");

          if (deletedDecimalAfterZero) {
            // When deleting "." from "0.122", we get "0122" which becomes "122"
            // We want all digits in "122" to have data-show, so we compare "" with "122"
            adjustedOldText = "";
            adjustedSelectionStart = 0;
            adjustedSelectionEnd = 0;
            adjustedNewCursorPos = cleanedText.length;
          } else if (replacedLeadingZero) {
            // Special case: "0" -> "1" (or any non-zero digit)
            // We want to treat this as if we're starting from scratch
            adjustedOldText = "";
            adjustedSelectionStart = 0;
            adjustedSelectionEnd = 0;
            adjustedNewCursorPos = cleanedText.length;
          } else if (leadingZerosRemoved > 0 && oldText.length > 0) {
            // If we removed leading zeros, adjust the oldText comparison
            if (
              oldText.startsWith("0") &&
              oldText.length > 1 &&
              oldText[1] !== "."
            ) {
              // More general case: if oldText was "0123" and we typed "4" to get "01234" which became "1234",
              // we need to adjust the comparison
              const oldWithoutLeadingZeros = oldText.replace(/^0+/, "");
              if (
                oldWithoutLeadingZeros ===
                cleanedText.slice(0, oldWithoutLeadingZeros.length)
              ) {
                // The old text (without leading zeros) matches the start of new text
                // This means we just added characters at the end
                adjustedOldText = oldWithoutLeadingZeros;
                // Adjust selection and cursor positions to account for removed leading zeros
                adjustedSelectionStart = Math.max(
                  0,
                  selectionStart - leadingZerosRemoved,
                );
                adjustedSelectionEnd = Math.max(
                  0,
                  selectionEnd - leadingZerosRemoved,
                );
                adjustedNewCursorPos = Math.max(
                  0,
                  newCursorPos - leadingZerosRemoved,
                );
              }
            }
          }
          // Compute formatted versions for display
          const oldFormattedText = prevFormattedValueRef.current;
          const newFormattedText = formatRawValue(cleanedText);

          // When invoked as a wholesale replacement (e.g. `value` prop
          // changed externally), align digits column-by-column so changed
          // digits play barrel-wheel animations instead of all being treated
          // as added.
          const changes = asReplacement
            ? getReplacementChanges(adjustedOldText, cleanedText)
            : getChanges(
                adjustedOldText,
                cleanedText,
                adjustedSelectionStart,
                adjustedSelectionEnd,
                adjustedNewCursorPos,
              );

          // Resolve separators fresh from the current render's `locale`
          // and `format` rather than reading a memoized object.
          const currentDecimal = computeSeparators().decimal;

          const formattedChanges = asReplacement
            ? getReplacementFormattedChanges(
                oldFormattedText,
                newFormattedText,
                currentDecimal,
              )
            : getFormattedChanges(
                oldFormattedText,
                newFormattedText,
                adjustedNewCursorPos,
                adjustedSelectionStart,
                adjustedOldText.length,
                currentDecimal,
              );

          // Detect position changes for x-position animation (used later)
          const positionChanges = getPositionChanges(
            oldFormattedText,
            newFormattedText,
            currentDecimal,
          );

          // For FLIP animation: capture old positions BEFORE any DOM changes
          // Store by character + formatted index
          const oldPositions = new Map<string, { x: number; width: number }>();
          if (spanRef.current) {
            const cleanup = temporarilyRemoveAncestorsTransform(
              spanRef.current,
            );
            const containerRect = spanRef.current.getBoundingClientRect();
            for (let i = 0; i < oldFormattedText.length; i++) {
              const char = oldFormattedText[i];
              // Find the span for this index
              const span = spanRef.current.querySelector(
                `[data-char-index="${i}"]`,
              ) as HTMLElement | null;
              // Verify span exists and content matches (DOM might be out of sync)
              if (span && char !== undefined && span.textContent === char) {
                const rect = span.getBoundingClientRect();
                // Key: char + its position in the old formatted string
                const key = `${char}@${i}`;
                oldPositions.set(key, {
                  x: rect.left - containerRect.left,
                  width: rect.width,
                });
              }
            }
            cleanup();
          }

          // Update the previous formatted value ref for next comparison
          // so barrel wheel and span shifting logic will use the correct old value
          prevFormattedValueRef.current = newFormattedText;

          // Update barrel wheel indices if characters were inserted or deleted before them
          // IMPORTANT: Barrel wheel indices are FORMATTED indices (include separators)
          // We need to map raw selection positions to formatted positions for correct comparison
          if (spanRef.current?.parentElement) {
            const parentContainer = spanRef.current.parentElement;
            const existingBarrelWheels = parentContainer.querySelectorAll(
              "[data-char-index][data-barrel-wheel]",
            );
            // Note: oldFormattedText is captured above before updating prevFormattedValueRef

            existingBarrelWheels.forEach((wheel) => {
              const wheelEl = wheel as HTMLElement;
              const oldFormattedIndexStr =
                wheelEl.getAttribute("data-char-index");
              const finalDigitStr = wheelEl.getAttribute("data-final-digit");
              if (oldFormattedIndexStr !== null) {
                const oldFormattedIndex = parseInt(oldFormattedIndexStr, 10);
                if (!isNaN(oldFormattedIndex) && oldFormattedIndex >= 0) {
                  // Convert barrel wheel's formatted index to raw index
                  const barrelWheelRawIndex = mapFormattedToRawIndex(
                    adjustedOldText,
                    oldFormattedText,
                    oldFormattedIndex,
                  );

                  const lengthDiff =
                    cleanedText.length - adjustedOldText.length;
                  // hadSelection is true when user had text selected (replacement creates barrel wheel at new position)
                  // For single-char insertions, adjustedSelectionStart === adjustedSelectionEnd
                  const hadUserSelection =
                    adjustedSelectionStart < adjustedSelectionEnd &&
                    lengthDiff >= 0; // Only for insertions/replacements, not deletions

                  if (
                    !hadUserSelection &&
                    lengthDiff > 0 &&
                    adjustedSelectionStart <= barrelWheelRawIndex
                  ) {
                    // Characters were inserted at or before this index, so shift it forward
                    // Calculate new raw index
                    const numInserted =
                      adjustedNewCursorPos - adjustedSelectionStart;
                    const newRawIndex = barrelWheelRawIndex + numInserted;
                    // Map back to formatted index
                    const newFormattedIndex = mapRawToFormattedIndex(
                      cleanedText,
                      newFormattedText,
                      newRawIndex,
                    );

                    wheelEl.setAttribute(
                      "data-char-index",
                      newFormattedIndex.toString(),
                    );

                    const observer =
                      resizeObserversRef.current.get(oldFormattedIndex);
                    if (observer) {
                      resizeObserversRef.current.delete(oldFormattedIndex);
                      resizeObserversRef.current.set(
                        newFormattedIndex,
                        observer,
                      );
                    }

                    if (finalDigitStr && spanRef.current) {
                      const oldSpan = spanRef.current.querySelector(
                        `[data-char-index="${oldFormattedIndex}"]`,
                      ) as HTMLElement | null;
                      if (oldSpan && oldSpan.textContent === finalDigitStr) {
                        oldSpan.setAttribute(
                          "data-char-index",
                          newFormattedIndex.toString(),
                        );
                      }
                    }
                  } else if (
                    lengthDiff < 0 &&
                    adjustedSelectionStart < barrelWheelRawIndex
                  ) {
                    // Characters were deleted before this index, so shift it backward
                    // Note: No hadUserSelection check for deletions - always shift barrel wheels after deletion point
                    const numDeleted =
                      adjustedSelectionEnd - adjustedSelectionStart;
                    const newRawIndex = Math.max(
                      0,
                      barrelWheelRawIndex - numDeleted,
                    );

                    // Only update if the new index is valid and the barrel wheel should still exist
                    // Also ensure the barrel wheel is not in the deletion range
                    if (
                      newRawIndex < cleanedText.length &&
                      barrelWheelRawIndex >= adjustedSelectionEnd
                    ) {
                      // Map back to formatted index
                      const newFormattedIndex = mapRawToFormattedIndex(
                        cleanedText,
                        newFormattedText,
                        newRawIndex,
                      );

                      wheelEl.setAttribute(
                        "data-char-index",
                        newFormattedIndex.toString(),
                      );

                      const observer =
                        resizeObserversRef.current.get(oldFormattedIndex);
                      if (observer) {
                        resizeObserversRef.current.delete(oldFormattedIndex);
                        resizeObserversRef.current.set(
                          newFormattedIndex,
                          observer,
                        );
                      }

                      if (finalDigitStr && spanRef.current) {
                        // Find the span that matches the final digit - it might still be at oldIndex
                        // or it might have already been shifted
                        const oldSpan = spanRef.current.querySelector(
                          `[data-char-index="${oldFormattedIndex}"]`,
                        ) as HTMLElement | null;
                        if (oldSpan && oldSpan.textContent === finalDigitStr) {
                          oldSpan.setAttribute(
                            "data-char-index",
                            newFormattedIndex.toString(),
                          );
                        } else {
                          // Also check if there's a span at the new index that matches
                          const newSpan = spanRef.current.querySelector(
                            `[data-char-index="${newFormattedIndex}"]`,
                          ) as HTMLElement | null;
                          if (
                            newSpan &&
                            newSpan.textContent === finalDigitStr
                          ) {
                            // Span is already at the correct index, just ensure it's marked correctly
                          } else {
                            // Search for any transparent span with the final digit
                            const allSpans =
                              spanRef.current.querySelectorAll(
                                "[data-char-index]",
                              );
                            Array.from(allSpans).forEach((span) => {
                              const spanEl = span as HTMLElement;
                              if (
                                spanEl.textContent === finalDigitStr &&
                                isTransparent(spanEl)
                              ) {
                                spanEl.setAttribute(
                                  "data-char-index",
                                  newFormattedIndex.toString(),
                                );
                              }
                            });
                          }
                        }
                      }
                    } else {
                      // Barrel wheel is now out of bounds, remove it
                      const observer =
                        resizeObserversRef.current.get(oldFormattedIndex);
                      if (observer) {
                        observer.disconnect();
                        resizeObserversRef.current.delete(oldFormattedIndex);
                      }
                      wheelEl.remove();
                    }
                  }
                }
              }
            });
          }

          // Incrementally update DOM instead of full reconstruction
          if (spanRef.current) {
            // First, update indices of existing spans that need to shift due to insertions or deletions
            // This handles the case where characters are inserted/deleted before existing spans
            // Do this BEFORE collecting spans by index, so the map is correct
            // IMPORTANT: Span indices are FORMATTED (include separators), but selection positions are RAW
            // We need to map between them correctly
            // Note: oldFormattedText is captured at the start of updateValue, before prevFormattedValueRef update
            const lengthDiff = cleanedText.length - adjustedOldText.length;
            // For insertions, hadSelection means user had text selected (replacement scenario)
            // For deletions, we always want to shift spans, so don't check hadSelection
            const hadSelectionForInsert =
              adjustedSelectionStart < adjustedSelectionEnd && lengthDiff > 0;

            if (
              lengthDiff !== 0 &&
              (lengthDiff < 0 || !hadSelectionForInsert)
            ) {
              // Collect all spans first
              const allSpans: HTMLElement[] = [];
              let nodeToUpdate = spanRef.current.firstChild;
              while (nodeToUpdate) {
                if (
                  nodeToUpdate instanceof HTMLElement &&
                  nodeToUpdate.hasAttribute("data-char-index")
                ) {
                  allSpans.push(nodeToUpdate);
                }
                nodeToUpdate = nodeToUpdate.nextSibling;
              }
              // Update indices of spans that need to shift
              allSpans.forEach((span) => {
                const oldFormattedIndexStr =
                  span.getAttribute("data-char-index");
                if (oldFormattedIndexStr !== null) {
                  const oldFormattedIndex = parseInt(oldFormattedIndexStr, 10);
                  if (!isNaN(oldFormattedIndex) && oldFormattedIndex >= 0) {
                    // Convert span's formatted index to raw index
                    const spanRawIndex = mapFormattedToRawIndex(
                      adjustedOldText,
                      oldFormattedText,
                      oldFormattedIndex,
                    );

                    if (lengthDiff > 0) {
                      // Characters were inserted - shift spans at and after the insertion point
                      if (
                        spanRawIndex >= adjustedSelectionStart &&
                        spanRawIndex < adjustedOldText.length
                      ) {
                        const numInserted =
                          adjustedNewCursorPos - adjustedSelectionStart;
                        const newRawIndex = spanRawIndex + numInserted;
                        if (newRawIndex < cleanedText.length) {
                          const newFormattedIndex = mapRawToFormattedIndex(
                            cleanedText,
                            newFormattedText,
                            newRawIndex,
                          );
                          span.setAttribute(
                            "data-char-index",
                            newFormattedIndex.toString(),
                          );
                        }
                      }
                    } else if (lengthDiff < 0) {
                      // Characters were deleted - shift spans after the deletion point backward
                      const numDeleted =
                        adjustedSelectionEnd - adjustedSelectionStart;
                      if (
                        spanRawIndex >= adjustedSelectionStart &&
                        spanRawIndex < adjustedSelectionEnd
                      ) {
                        // Span is in the deletion range - it will be removed by cleanup logic
                      } else if (spanRawIndex >= adjustedSelectionEnd) {
                        // Span is after the deletion point, shift it backward
                        const newRawIndex = Math.max(
                          0,
                          spanRawIndex - numDeleted,
                        );
                        if (newRawIndex < cleanedText.length) {
                          const newFormattedIndex = mapRawToFormattedIndex(
                            cleanedText,
                            newFormattedText,
                            newRawIndex,
                          );
                          span.setAttribute(
                            "data-char-index",
                            newFormattedIndex.toString(),
                          );
                        }
                      }
                    }
                  }
                }
              });
            }

            // Get all existing spans mapped by index (after updating indices)
            // Also track transparent spans separately to handle them specially
            // Track visible spans by content to find them when indices shift
            const existingSpansByIndex = new Map<number, HTMLElement>();
            const allExistingSpans: HTMLElement[] = [];
            const transparentSpans = new Map<number, HTMLElement>();
            const transparentSpansByContent = new Map<string, HTMLElement>();
            const visibleSpansByContent = new Map<string, HTMLElement[]>();
            const textNodesToRemove: Node[] = [];
            let node = spanRef.current.firstChild;
            while (node) {
              if (
                node instanceof HTMLElement &&
                node.hasAttribute("data-char-index")
              ) {
                const index = parseInt(
                  node.getAttribute("data-char-index") ?? "-1",
                  10,
                );
                if (index >= 0) {
                  const isTransparentSpan = isTransparent(node);
                  if (isTransparentSpan) {
                    transparentSpans.set(index, node);
                    const content = node.textContent ?? "";
                    if (!transparentSpansByContent.has(content)) {
                      transparentSpansByContent.set(content, node);
                    }
                  } else {
                    // Track visible spans by content for fallback lookup
                    const content = node.textContent ?? "";
                    if (!visibleSpansByContent.has(content)) {
                      visibleSpansByContent.set(content, []);
                    }
                    visibleSpansByContent.get(content)!.push(node);
                  }
                  if (!existingSpansByIndex.has(index) || !isTransparentSpan) {
                    existingSpansByIndex.set(index, node);
                  }
                  allExistingSpans.push(node);
                }
              } else if (node.nodeType === Node.TEXT_NODE) {
                textNodesToRemove.push(node);
              }
              node = node.nextSibling;
            }

            // Remove any stray text nodes (from undo/redo or other operations)
            textNodesToRemove.forEach((textNode) => {
              if (textNode.parentNode) {
                textNode.parentNode.removeChild(textNode);
              }
            });

            // Track which spans we've used
            const usedSpans = new Set<HTMLElement>();
            const newSpans: HTMLElement[] = [];
            let referenceNode: Node | null = null;

            // Build new structure, reusing existing spans when possible
            // Get parent container once for barrel wheel checks
            const parentContainer = spanRef.current.parentElement;

            // Use formatted text for display (includes thousand separators, etc.)
            for (let i = 0; i < newFormattedText.length; i++) {
              const char = newFormattedText[i];
              const isUnchanged = formattedChanges.unchangedIndices.has(i);
              // For barrel wheel, we need to map from formatted index to raw index
              const rawIndex = mapFormattedToRawIndex(
                cleanedText,
                newFormattedText,
                i,
              );
              // Barrel wheels only apply to digit positions. Without this
              // guard, a separator (e.g. the comma in "1,000") can map to
              // the same raw index as an adjacent digit's barrel wheel and
              // get treated as a wheel position, which strips its
              // `data-flow` and leaves it stuck at width:0.
              const isDigitChar = char !== undefined && /^\d$/.test(char);
              const barrelWheel = isDigitChar
                ? changes.barrelWheelIndices.get(rawIndex)
                : undefined;

              // Check if there's a barrel wheel in DOM for this index (indices may have shifted)
              const hasBarrelWheelInDOM = parentContainer?.querySelector(
                `[data-char-index="${i}"][data-barrel-wheel]`,
              );

              // Also check if there's a transparent span at this index that indicates a barrel wheel
              // (the barrel wheel might have shifted and the span index was updated but barrel wheel query might miss it)
              let hasTransparentSpanWithBarrelWheel = false;
              const spanAtI = existingSpansByIndex.get(i);
              if (spanAtI && isTransparent(spanAtI)) {
                // Check if there's a barrel wheel anywhere that might be associated with this span
                const allBarrelWheels = parentContainer?.querySelectorAll(
                  "[data-char-index][data-barrel-wheel]",
                );
                if (allBarrelWheels) {
                  // Check if any barrel wheel's final digit matches this span's content
                  Array.from(allBarrelWheels).forEach((wheel) => {
                    const wheelEl = wheel as HTMLElement;
                    const finalDigit = wheelEl.getAttribute("data-final-digit");
                    if (finalDigit === char) {
                      hasTransparentSpanWithBarrelWheel = true;
                    }
                  });
                }
              }

              const hasBarrelWheel =
                barrelWheel !== undefined ||
                !!hasBarrelWheelInDOM ||
                hasTransparentSpanWithBarrelWheel;

              // Try to reuse existing span at this index
              let span = existingSpansByIndex.get(i);
              let shouldReuse = false;

              // Only reuse if this index is marked as unchanged (not added)
              // New characters should always get new spans to trigger animations
              const isAdded = formattedChanges.addedIndices.has(i);
              const isUnchangedIndex = formattedChanges.unchangedIndices.has(i);

              // If no exact index match, try to find by content for unchanged characters
              // This handles the case where indices shifted due to separator insertion
              if (
                (!span || span.textContent !== char) &&
                char &&
                !isAdded &&
                isUnchangedIndex
              ) {
                const candidates = visibleSpansByContent.get(char) ?? [];
                for (const candidate of candidates) {
                  if (
                    !usedSpans.has(candidate) &&
                    candidate.textContent === char
                  ) {
                    span = candidate;
                    break;
                  }
                }
              }

              if (
                span &&
                span.textContent === char &&
                !usedSpans.has(span) &&
                !isAdded &&
                isUnchangedIndex
              ) {
                // Check if span is in approximately the right position
                // (within 2 positions is acceptable to avoid unnecessary reordering)
                let currentPos = 0;
                let node: ChildNode | null = spanRef.current.firstChild;
                while (node && node !== span) {
                  if (
                    node instanceof HTMLElement &&
                    node.hasAttribute("data-char-index")
                  ) {
                    currentPos++;
                  }
                  node = node.nextSibling;
                }

                if (Math.abs(currentPos - i) <= 2) {
                  shouldReuse = true;
                }
              }

              if (shouldReuse && span) {
                // Reuse existing span - ensure textContent matches (defensive check)
                if (span.textContent !== char) {
                  span.textContent = char ?? "";
                }

                // Update data-char-index to new position
                span.setAttribute("data-char-index", i.toString());

                // Update attributes if needed
                const shouldHaveFlow = !barrelWheel;
                const shouldHaveShow = isUnchanged;
                const hasFlow = span.hasAttribute("data-flow");
                const hasShow = span.hasAttribute("data-show");

                if (shouldHaveFlow && !hasFlow) {
                  span.setAttribute("data-flow", "");
                } else if (!shouldHaveFlow && hasFlow) {
                  span.removeAttribute("data-flow");
                }

                if (shouldHaveShow && !hasShow) {
                  span.setAttribute("data-show", "");
                } else if (!shouldHaveShow && hasShow) {
                  span.removeAttribute("data-show");
                }

                // Clear any leftover transparency from a previous render's
                // barrel wheel: this span is being reused at a position that
                // does NOT have a new wheel (barrelWheel is falsy in this
                // branch), so it must be visible. Stale transparency can
                // appear when rapid prop changes interrupt wheel cleanup.
                if (!barrelWheel && isTransparent(span)) {
                  removeTransparentColor(span);
                }

                usedSpans.add(span);
                // Move to correct position if needed, preserving any ongoing animations
                if (referenceNode) {
                  const nextSibling = referenceNode.nextSibling;
                  if (span.previousSibling !== referenceNode && nextSibling) {
                    moveElementPreservingAnimation(
                      span,
                      spanRef.current,
                      nextSibling,
                    );
                  } else if (
                    !nextSibling &&
                    span.parentNode !== spanRef.current
                  ) {
                    moveElementPreservingAnimation(span, spanRef.current, null);
                  }
                }
                referenceNode = span;
              } else {
                // Check if there's an existing span that's currently animating (barrel wheel or width)
                // First check if there's a transparent span at this index (might have shifted)
                let existingSpan = existingSpansByIndex.get(i);
                // If no span at this index, check if there's a transparent span that shifted here
                if (!existingSpan && transparentSpans.has(i)) {
                  existingSpan = transparentSpans.get(i)!;
                }
                // Also check all transparent spans to see if any match this character and should be at this index
                // This handles the case where a transparent span shifted but wasn't found in the map
                if (!existingSpan || !isTransparent(existingSpan)) {
                  // First, check if there's a transparent span with matching content
                  const matchingTransparentSpan = char
                    ? transparentSpansByContent.get(char)
                    : undefined;
                  if (
                    matchingTransparentSpan &&
                    !usedSpans.has(matchingTransparentSpan) &&
                    isTransparent(matchingTransparentSpan)
                  ) {
                    // Check if there's a barrel wheel that matches this span
                    const allBarrelWheels = parentContainer?.querySelectorAll(
                      "[data-char-index][data-barrel-wheel]",
                    );
                    if (allBarrelWheels) {
                      for (const wheel of Array.from(allBarrelWheels)) {
                        const wheelEl = wheel as HTMLElement;
                        const wheelIndex = parseInt(
                          wheelEl.getAttribute("data-char-index") ?? "-1",
                          10,
                        );
                        const finalDigit =
                          wheelEl.getAttribute("data-final-digit");
                        if (finalDigit === char) {
                          // This transparent span is associated with a barrel wheel
                          // If the barrel wheel is at index i, or if it should be at i (was shifted)
                          if (wheelIndex === i) {
                            existingSpan = matchingTransparentSpan;
                            matchingTransparentSpan.setAttribute(
                              "data-char-index",
                              i.toString(),
                            );
                            break;
                          } else if (wheelIndex > i && lengthDiff < 0) {
                            // Barrel wheel was shifted but might not be at i yet - update both
                            existingSpan = matchingTransparentSpan;
                            matchingTransparentSpan.setAttribute(
                              "data-char-index",
                              i.toString(),
                            );
                            wheelEl.setAttribute(
                              "data-char-index",
                              i.toString(),
                            );
                            const observer =
                              resizeObserversRef.current.get(wheelIndex);
                            if (observer) {
                              resizeObserversRef.current.delete(wheelIndex);
                              resizeObserversRef.current.set(i, observer);
                            }
                            break;
                          }
                        }
                      }
                    }
                  }
                }
                const hasWidthAnimation =
                  existingSpan?.hasAttribute("data-width-animate");
                // Check if span is hidden (indicates barrel wheel animation in progress)
                const isHidden =
                  existingSpan?.style.color === "transparent" ||
                  existingSpan?.style.color === "rgba(0, 0, 0, 0)" ||
                  (existingSpan &&
                    window.getComputedStyle(existingSpan).color ===
                      "rgba(0, 0, 0, 0)");

                // Don't reuse span if there's a barrel wheel animation for this index
                // The barrel wheel code needs to set up width animation, so let it handle the span
                // Only reuse if it's a width animation without barrel wheel (width animation cleanup)
                const shouldReuseSpan =
                  !hasBarrelWheel &&
                  hasWidthAnimation &&
                  !isHidden &&
                  existingSpan &&
                  !usedSpans.has(existingSpan);

                // IMPORTANT: If there's a transparent span at this index, it's part of an ongoing barrel wheel
                // We MUST reuse it, even if changes.barrelWheelIndices doesn't have this index
                // (because the barrel wheel's index may have shifted)
                // Also check if there's a barrel wheel anywhere that matches this character
                let hasMatchingBarrelWheel =
                  hasBarrelWheel || hasBarrelWheelInDOM;
                if (!hasMatchingBarrelWheel && isHidden && existingSpan) {
                  // Check all barrel wheels to see if any match this character
                  const allBarrelWheels = parentContainer?.querySelectorAll(
                    "[data-char-index][data-barrel-wheel]",
                  );
                  if (allBarrelWheels) {
                    for (const wheel of Array.from(allBarrelWheels)) {
                      const wheelEl = wheel as HTMLElement;
                      const finalDigit =
                        wheelEl.getAttribute("data-final-digit");
                      if (finalDigit === char) {
                        hasMatchingBarrelWheel = true;
                        break;
                      }
                    }
                  }
                }

                const shouldReuseTransparentSpan =
                  isHidden &&
                  existingSpan &&
                  !usedSpans.has(existingSpan) &&
                  (hasBarrelWheel ||
                    hasBarrelWheelInDOM ||
                    hasMatchingBarrelWheel);

                // If there's a transparent span (barrel wheel animation), reuse it
                if (shouldReuseTransparentSpan && existingSpan) {
                  // Reuse the transparent span - it's part of an ongoing barrel wheel animation
                  span = existingSpan;
                  // Update textContent if needed (should match the final digit)
                  if (span.textContent !== char) {
                    span.textContent = char ?? "";
                  }
                  // Ensure data-char-index is correct
                  span.setAttribute("data-char-index", i.toString());
                  // Keep it transparent (barrel wheel is still animating)
                  span.style.color = "transparent";
                  // Don't set data-flow (barrel wheel handles it)
                  span.removeAttribute("data-flow");
                  if (isUnchanged) {
                    span.setAttribute("data-show", "");
                  } else {
                    span.removeAttribute("data-show");
                  }
                  usedSpans.add(span);
                  // Ensure it's in the correct position, preserving any ongoing animations
                  if (referenceNode) {
                    const nextSibling = referenceNode.nextSibling;
                    if (span.previousSibling !== referenceNode && nextSibling) {
                      moveElementPreservingAnimation(
                        span,
                        spanRef.current,
                        nextSibling,
                      );
                    } else if (
                      !nextSibling &&
                      span.parentNode !== spanRef.current
                    ) {
                      moveElementPreservingAnimation(
                        span,
                        spanRef.current,
                        null,
                      );
                    }
                  }
                  referenceNode = span;
                } else if (shouldReuseSpan && existingSpan) {
                  // If there's an existing span that's animating width (not barrel wheel), update it
                  // Update the existing animating span
                  span = existingSpan;
                  // Update textContent if it changed (shouldn't happen during barrel wheel, but defensive)
                  if (span.textContent !== char) {
                    span.textContent = char ?? "";
                  }
                  // Update data-char-index to ensure it's correct
                  span.setAttribute("data-char-index", i.toString());

                  // Update attributes
                  if (!barrelWheel) {
                    span.setAttribute("data-flow", "");
                  } else {
                    span.removeAttribute("data-flow");
                  }
                  if (isUnchanged) {
                    span.setAttribute("data-show", "");
                  } else {
                    span.removeAttribute("data-show");
                  }

                  usedSpans.add(span);
                  // Ensure it's in the correct position, preserving any ongoing animations
                  if (referenceNode) {
                    const nextSibling = referenceNode.nextSibling;
                    if (span.previousSibling !== referenceNode && nextSibling) {
                      moveElementPreservingAnimation(
                        span,
                        spanRef.current,
                        nextSibling,
                      );
                    } else if (
                      !nextSibling &&
                      span.parentNode !== spanRef.current
                    ) {
                      moveElementPreservingAnimation(
                        span,
                        spanRef.current,
                        null,
                      );
                    }
                  }
                  referenceNode = span;
                } else {
                  // If there's a barrel wheel animation, we need to ensure the span exists
                  // but let the barrel wheel code handle width animation setup
                  // So we'll update the existing span if it exists, or create a new one
                  if (
                    hasBarrelWheel &&
                    existingSpan &&
                    !usedSpans.has(existingSpan)
                  ) {
                    // Update existing span for barrel wheel - barrel wheel code will handle width animation
                    span = existingSpan;

                    // Preserve old width BEFORE updating textContent to prevent flash
                    // Get the current width (which is the old digit's width)
                    const cleanup = temporarilyRemoveAncestorsTransform(span);
                    const oldWidth = span.getBoundingClientRect().width;
                    cleanup();

                    // Ensure display is inline-block so width can be applied
                    span.style.display = "inline-block";

                    // Constrain to old width IMMEDIATELY before updating textContent
                    // This prevents flash of natural width when textContent changes
                    if (oldWidth > 0) {
                      span.style.width = `${oldWidth}px`;
                      span.style.minWidth = `${oldWidth}px`;
                      span.style.maxWidth = `${oldWidth}px`;
                      // Force reflow to ensure width constraint is applied
                      void span.offsetWidth;
                    }

                    // NOW update textContent (span is already constrained, so no flash)
                    if (span.textContent !== char) {
                      span.textContent = char ?? "";
                    }

                    // Update data-char-index to ensure it's correct
                    span.setAttribute("data-char-index", i.toString());
                    // Don't set data-flow for barrel wheel (barrel wheel code handles it)
                    span.removeAttribute("data-flow");
                    if (isUnchanged) {
                      span.setAttribute("data-show", "");
                    } else {
                      span.removeAttribute("data-show");
                    }
                    // Reset color in case it was hidden from previous animation
                    span.style.color = "";
                    // Remove data-width-animate if present (barrel wheel code will add it)
                    span.removeAttribute("data-width-animate");
                    usedSpans.add(span);
                    // Ensure it's in the correct position, preserving any ongoing animations
                    if (referenceNode) {
                      const nextSibling = referenceNode.nextSibling;
                      if (
                        span.previousSibling !== referenceNode &&
                        nextSibling
                      ) {
                        moveElementPreservingAnimation(
                          span,
                          spanRef.current,
                          nextSibling,
                        );
                      } else if (
                        !nextSibling &&
                        span.parentNode !== spanRef.current
                      ) {
                        moveElementPreservingAnimation(
                          span,
                          spanRef.current,
                          null,
                        );
                      }
                    }
                    referenceNode = span;
                  } else {
                    // Reach this branch when the existing span at this
                    // position is transparent (isHidden) but neither this
                    // position nor any other wheel in the DOM matches its
                    // content (all of hasBarrelWheel / hasBarrelWheelInDOM /
                    // hasMatchingBarrelWheel were false — otherwise we would
                    // have taken `shouldReuseTransparentSpan` above).
                    //
                    // That means the transparency is *orphaned* — left
                    // behind by a previous render's wheel whose cleanup
                    // never landed on this span (rapid prop changes or
                    // index reshuffles can do this). Reuse the span but
                    // clear its color so the underlying character is
                    // visible; if this position truly has a new wheel, the
                    // wheel-creation code below will re-hide it.
                    if (
                      isHidden &&
                      existingSpan &&
                      !usedSpans.has(existingSpan)
                    ) {
                      span = existingSpan;
                      if (span.textContent !== char) {
                        span.textContent = char ?? "";
                      }
                      span.setAttribute("data-char-index", i.toString());
                      removeTransparentColor(span);
                      cleanupWidthAnimation(span);
                      if (!barrelWheel) {
                        span.setAttribute("data-flow", "");
                      } else {
                        span.removeAttribute("data-flow");
                      }
                      if (isUnchanged) {
                        span.setAttribute("data-show", "");
                      } else {
                        span.removeAttribute("data-show");
                      }
                      usedSpans.add(span);
                      // Ensure it's in the correct position, preserving any ongoing animations
                      if (referenceNode) {
                        const nextSibling = referenceNode.nextSibling;
                        if (
                          span.previousSibling !== referenceNode &&
                          nextSibling
                        ) {
                          moveElementPreservingAnimation(
                            span,
                            spanRef.current,
                            nextSibling,
                          );
                        } else if (
                          !nextSibling &&
                          span.parentNode !== spanRef.current
                        ) {
                          moveElementPreservingAnimation(
                            span,
                            spanRef.current,
                            null,
                          );
                        }
                      }
                      referenceNode = span;
                    } else {
                      // Remove existing span at this index if it exists and doesn't match
                      if (existingSpan && existingSpan.textContent !== char) {
                        // Only remove if not animating (not hidden, not part of barrel wheel, and not in flow animation)
                        // Also don't remove if the span's content appears elsewhere in the new text
                        // (it might be reused at a different index when separators shift things)
                        const hasFlowAnimation =
                          existingSpan.hasAttribute("data-flow");
                        const contentWillBeReused =
                          existingSpan.textContent &&
                          newFormattedText.includes(existingSpan.textContent);
                        const isCurrentlyAnimating =
                          hasFlowAnimation ||
                          (isHidden && !hasBarrelWheel) ||
                          (hasWidthAnimation && !hasBarrelWheel);
                        if (!isCurrentlyAnimating && !contentWillBeReused) {
                          existingSpan.remove();
                          existingSpansByIndex.delete(i);
                          usedSpans.delete(existingSpan);
                        }
                      }

                      // Create new span
                      span = document.createElement("span");
                      span.setAttribute("data-char-index", i.toString());
                      span.textContent = char ?? "";

                      if (!barrelWheel) {
                        span.setAttribute("data-flow", "");
                      }
                      if (isUnchanged) {
                        span.setAttribute("data-show", "");
                      } else if (isAdded) {
                        // Animate width from 0 for newly added digits
                        span.style.width = "0px";
                        span.style.minWidth = "0px";
                        span.style.maxWidth = "0px";
                      }

                      // Insert at correct position
                      if (referenceNode) {
                        spanRef.current.insertBefore(
                          span,
                          referenceNode.nextSibling,
                        );
                      } else {
                        spanRef.current.insertBefore(
                          span,
                          spanRef.current.firstChild,
                        );
                      }
                      referenceNode = span;
                    }
                  }
                }
              }

              newSpans.push(span);
            }

            // Remove unused spans that aren't animating
            // Also check for spans that are hidden (color: transparent) which indicates barrel wheel animation
            // IMPORTANT: Check for barrel wheels in DOM, not just formattedChanges.barrelWheelIndices,
            // because indices may have shifted when characters were inserted before animating digits
            allExistingSpans.forEach((span) => {
              if (!usedSpans.has(span)) {
                const index = parseInt(
                  span.getAttribute("data-char-index") ?? "-1",
                  10,
                );
                // Check if there's actually a barrel wheel for this index in the DOM
                // (indices may have shifted, so formattedChanges.barrelWheelIndices might not be accurate)
                const hasBarrelWheelInDOM = parentContainer?.querySelector(
                  `[data-char-index="${index}"][data-barrel-wheel]`,
                );
                // Map formatted index to raw index for barrel wheel check
                const rawIdx = mapFormattedToRawIndex(
                  cleanedText,
                  newFormattedText,
                  index,
                );
                // Only consider a barrel-wheel match if this span actually
                // holds a digit AND the new formatted character at this
                // position is also a digit. Otherwise a stale digit span
                // sitting at a position that is now a separator (or out of
                // bounds) can collide with an adjacent digit's raw barrel
                // wheel index and incorrectly survive cleanup.
                const spanIsDigit = /^\d$/.test(span.textContent ?? "");
                const newCharAtIndex = newFormattedText[index];
                const newCharIsDigit =
                  newCharAtIndex !== undefined && /^\d$/.test(newCharAtIndex);
                const hasBarrelWheel =
                  (spanIsDigit &&
                    newCharIsDigit &&
                    changes.barrelWheelIndices.has(rawIdx)) ||
                  !!hasBarrelWheelInDOM;
                const hasWidthAnimation =
                  span.hasAttribute("data-width-animate");
                // `isHidden` alone is NOT a reason to keep a span: a span
                // can be left transparent by an interrupted wheel from a
                // previous render whose cleanup landed on a different
                // span. Only true ongoing animations should pin the span
                // in place.
                const isCurrentlyAnimating =
                  hasBarrelWheel || hasWidthAnimation;
                const isOutOfBounds = index >= newFormattedText.length;

                // If text is empty, remove all spans regardless of animation state
                // This handles the case where user selects all and deletes
                if (newFormattedText.length === 0) {
                  span.remove();
                } else if (isOutOfBounds) {
                  // Out-of-bounds unused spans are always ghosts. If a
                  // wheel still references this index, drop it too so the
                  // wheel doesn't try to un-hide a now-removed span (or
                  // worse, a different span that happens to land here
                  // later).
                  if (hasBarrelWheelInDOM) {
                    hasBarrelWheelInDOM.remove();
                    resizeObserversRef.current.get(index)?.disconnect();
                    resizeObserversRef.current.delete(index);
                  }
                  span.remove();
                } else if (!isCurrentlyAnimating) {
                  span.remove();
                }
              }
            });

            // Final verification: ensure all spans have correct textContent
            // This catches any cases where spans weren't properly updated
            for (let i = 0; i < newFormattedText.length; i++) {
              const char = newFormattedText[i];
              const span = newSpans[i];
              if (span && span.textContent !== char) {
                span.textContent = char ?? "";
              }
            }

            // Reposition all barrel wheels after DOM update completes
            // This ensures barrel wheels stay aligned whenever characters are inserted/deleted
            // Use requestAnimationFrame to ensure DOM has fully updated
            requestAnimationFrame(() => {
              repositionAllBarrelWheels();
            });

            // Remove any remaining spans with invalid indices or wrong characters
            // Also check for duplicate indices and transparent spans that are ghosts
            const allSpans = Array.from(
              spanRef.current.querySelectorAll("[data-char-index]"),
            ) as HTMLElement[];

            // Track spans by index to detect duplicates
            const spansByIndex = new Map<number, HTMLElement[]>();
            allSpans.forEach((span) => {
              const index = parseInt(
                span.getAttribute("data-char-index") ?? "-1",
                10,
              );
              if (index >= 0) {
                if (!spansByIndex.has(index)) {
                  spansByIndex.set(index, []);
                }
                spansByIndex.get(index)!.push(span);
              }
            });

            // Handle duplicate indices - keep the one that's animating or matches the character, remove others
            spansByIndex.forEach((spans, index) => {
              if (spans.length > 1) {
                // Find the span that should be kept
                let spanToKeep: HTMLElement | null = null;

                // First, try to find one that matches the expected character.
                // The lookup uses the FORMATTED text (not the raw text) since
                // `index` is a formatted-string index. Mixing them up causes a
                // stale digit span sitting at a separator's position to be
                // preferred over the correctly-placed separator span.
                const expectedChar = newFormattedText[index];
                for (const span of spans) {
                  if (span.textContent === expectedChar) {
                    const isHidden =
                      span.style.color === "transparent" ||
                      span.style.color === "rgba(0, 0, 0, 0)" ||
                      window.getComputedStyle(span).color ===
                        "rgba(0, 0, 0, 0)";
                    // Prefer non-transparent spans that match the character
                    if (!isHidden) {
                      spanToKeep = span;
                      break;
                    } else if (!spanToKeep) {
                      // Keep transparent one as fallback if it matches
                      spanToKeep = span;
                    }
                  }
                }

                // If no matching character found, find the animating one
                if (!spanToKeep) {
                  for (const span of spans) {
                    const isHidden =
                      span.style.color === "transparent" ||
                      span.style.color === "rgba(0, 0, 0, 0)" ||
                      window.getComputedStyle(span).color ===
                        "rgba(0, 0, 0, 0)";
                    const hasBarrelWheelInDOM = parentContainer?.querySelector(
                      `[data-char-index="${index}"][data-barrel-wheel]`,
                    );
                    const hasWidthAnimation =
                      span.hasAttribute("data-width-animate");
                    if (isHidden || hasBarrelWheelInDOM || hasWidthAnimation) {
                      spanToKeep = span;
                      break;
                    }
                  }
                }

                // If still no span found, keep the first one
                if (!spanToKeep && spans.length > 0) {
                  const firstSpan = spans.find(() => true);
                  if (firstSpan) {
                    spanToKeep = firstSpan;
                  }
                }

                // Remove all other spans at this index
                if (spanToKeep) {
                  spans.forEach((span) => {
                    if (span !== spanToKeep) {
                      span.remove();
                    }
                  });
                }
              }
            });

            // Now check remaining spans for out-of-bounds or wrong characters
            const remainingSpans = Array.from(
              spanRef.current.querySelectorAll("[data-char-index]"),
            ) as HTMLElement[];
            remainingSpans.forEach((span) => {
              const index = parseInt(
                span.getAttribute("data-char-index") ?? "-1",
                10,
              );
              const isHidden =
                span.style.color === "transparent" ||
                span.style.color === "rgba(0, 0, 0, 0)" ||
                window.getComputedStyle(span).color === "rgba(0, 0, 0, 0)";
              // Check if there's actually a barrel wheel for this index in the DOM
              const hasBarrelWheelInDOM = parentContainer?.querySelector(
                `[data-char-index="${index}"][data-barrel-wheel]`,
              );
              // Map formatted index to raw index for barrel wheel check
              const rawIdx = mapFormattedToRawIndex(
                cleanedText,
                newFormattedText,
                index,
              );
              // Only consider a barrel-wheel match if this span actually
              // holds a digit; otherwise a separator can collide with an
              // adjacent digit's barrel-wheel raw index.
              const spanIsDigit = /^\d$/.test(span.textContent ?? "");
              const hasBarrelWheel =
                (spanIsDigit && changes.barrelWheelIndices.has(rawIdx)) ||
                !!hasBarrelWheelInDOM;
              const hasWidthAnimation = span.hasAttribute("data-width-animate");
              // `isHidden` is intentionally NOT part of the "animating"
              // determination here. An interrupted wheel from a previous
              // render can leave a span at color:transparent without any
              // active wheel/width animation; that orphan transparency
              // shouldn't pin a stale span in the DOM.
              const isCurrentlyAnimating = hasBarrelWheel || hasWidthAnimation;

              // If text is empty, remove all spans
              if (newFormattedText.length === 0) {
                span.remove();
                return;
              }

              // Remove if index is out of bounds. When the value shrinks
              // (e.g. 8 digits → 6 digits during fast prop swaps), trailing
              // spans get left behind at indices that no longer exist; if
              // they were also transparent the previous heuristic kept
              // them around as "animating" and they reappeared as ghost
              // chars once a wheel cleanup eventually un-hid them. Drop
              // them — and any orphan wheel that still points at this
              // index — unconditionally.
              if (index < 0 || index >= newFormattedText.length) {
                if (hasBarrelWheelInDOM) {
                  hasBarrelWheelInDOM.remove();
                  resizeObserversRef.current.get(index)?.disconnect();
                  resizeObserversRef.current.delete(index);
                }
                span.remove();
              } else if (span.textContent !== newFormattedText[index]) {
                // Character mismatch - update or remove
                // If it's a transparent span with wrong character and no barrel wheel, it's a ghost - remove it
                if (isHidden && !hasBarrelWheelInDOM && !hasBarrelWheel) {
                  span.remove();
                } else if (!isCurrentlyAnimating) {
                  // Update textContent to match
                  span.textContent = newFormattedText[index] ?? "";
                }
              }
            });
          }

          // Animate new characters and create barrel wheels
          // Use requestAnimationFrame to ensure DOM is updated
          requestAnimationFrame(() => {
            const flowElements =
              spanRef.current?.querySelectorAll("[data-flow]");
            if (flowElements) {
              Array.from(flowElements).forEach((element) => {
                const index = parseInt(
                  (element as HTMLElement).getAttribute("data-char-index") ??
                    "-1",
                  10,
                );
                if (
                  element instanceof HTMLElement &&
                  formattedChanges.addedIndices.has(index)
                ) {
                  element.dataset.show = "";
                  const span = spanRef.current;
                  if (span && element.textContent) {
                    const width = measureText(element.textContent, span);
                    element.style.width = `${width}px`;
                    element.style.minWidth = `${width}px`;
                    element.style.maxWidth = `${width}px`;

                    // Remove inline width styles after transition completes.
                    // Filter on `e.target === element` so a transitionend
                    // bubbled up from a descendant (e.g. a child element
                    // styled by consumer CSS with its own transition)
                    // cannot trigger our cleanup prematurely.
                    const handleTransitionEnd = (e: TransitionEvent) => {
                      if (e.target !== element) {
                        return;
                      }
                      if (
                        ["width", "min-width", "max-width"].includes(
                          e.propertyName,
                        )
                      ) {
                        element.style.width = "";
                        element.style.minWidth = "";
                        element.style.maxWidth = "";
                        element.removeEventListener(
                          "transitionend",
                          handleTransitionEnd,
                        );
                      }
                    };
                    element.addEventListener(
                      "transitionend",
                      handleTransitionEnd,
                    );
                  }
                }
              });
            }

            // Create barrel wheels as absolutely positioned elements outside contentEditable
            // Map raw indices to formatted indices for barrel wheel positioning
            const barrelWheelIndices = Array.from(
              changes.barrelWheelIndices.keys(),
            );

            // During rapid prop changes a previous render's wheel can be
            // left running at a formatted index that this update has no
            // transition for. The reuse path below only touches wheels
            // whose index matches one of this update's barrelWheelIndices;
            // everything else keeps spinning to its (now stale) final
            // digit, overlapping the new transition visually (multiple
            // ghosted digits/separators piling up during a spam click).
            // Finalize and remove those orphan wheels here so only the
            // current update's wheel cohort is active.
            // Only snap orphans when this update actually introduces a
            // new wheel cohort. An "uneventful" update (no transitions of
            // its own — e.g. a re-render that doesn't change the value)
            // must leave existing wheels alone or it would kill the
            // animation that the previous update just started.
            const wheelSnapParent = spanRef.current?.parentElement;
            if (barrelWheelIndices.length > 0 && wheelSnapParent) {
              const intendedFormattedIndices = new Set<number>();
              for (const rawIdx of barrelWheelIndices) {
                intendedFormattedIndices.add(
                  mapRawToFormattedIndex(cleanedText, newFormattedText, rawIdx),
                );
              }
              const allExistingWheels = wheelSnapParent.querySelectorAll(
                "[data-barrel-wheel][data-char-index]",
              );
              allExistingWheels.forEach((wheel) => {
                const wheelEl = wheel as HTMLElement;
                const idxStr = wheelEl.getAttribute("data-char-index");
                if (idxStr === null) {
                  return;
                }
                const idx = parseInt(idxStr, 10);
                if (intendedFormattedIndices.has(idx)) {
                  return;
                }
                const charSpan = spanRef.current?.querySelector(
                  `[data-char-index="${idx}"]`,
                ) as HTMLElement | null;
                if (charSpan) {
                  removeTransparentColor(charSpan);
                  cleanupWidthAnimation(charSpan);
                }
                resizeObserversRef.current.get(idx)?.disconnect();
                resizeObserversRef.current.delete(idx);
                wheelEl.remove();
              });
            }

            const cleanup = temporarilyRemoveAncestorsTransform(
              spanRef.current,
            );
            barrelWheelIndices.forEach((rawIndex) => {
              const barrelWheelData = changes.barrelWheelIndices.get(rawIndex);
              // Map raw index to formatted index
              const index = mapRawToFormattedIndex(
                cleanedText,
                newFormattedText,
                rawIndex,
              );
              if (!barrelWheelData) {
                return;
              }

              const direction = barrelWheelData.direction;
              const finalDigitStr =
                barrelWheelData.sequence[barrelWheelData.sequence.length - 1];
              const finalDigit = finalDigitStr
                ? parseInt(finalDigitStr, 10)
                : 0;
              const initialDigitStr = barrelWheelData.sequence[0];

              // Determine old and new digits based on direction
              // When direction is "up": sequence = [old, ..., new] so initialDigitStr = old, finalDigitStr = new
              // When direction is "down": sequence = [new, ..., old] so initialDigitStr = new, finalDigitStr = old
              const oldDigitStr =
                direction === "up" ? initialDigitStr : finalDigitStr;
              const newDigitStr =
                direction === "up" ? finalDigitStr : initialDigitStr;

              // Find the span element at this index
              const charSpan = spanRef.current?.querySelector(
                `[data-char-index="${index}"]`,
              );
              if (!charSpan || !(charSpan instanceof HTMLElement)) {
                return;
              }

              // Get position of the character span relative to the parent container
              const parentContainer = spanRef.current?.parentElement;
              if (!parentContainer) {
                return;
              }

              // Check if a barrel wheel already exists for this index
              const existingWheel = parentContainer.querySelector(
                `[data-char-index="${index}"][data-barrel-wheel]`,
              ) as HTMLElement | null;

              if (existingWheel) {
                // Reuse existing barrel wheel - update direction and position
                const existingWrapper = existingWheel.querySelector(
                  "[data-barrel-wheel-digits-wrapper]",
                ) as HTMLElement | null;

                if (existingWrapper) {
                  // IMPORTANT: Update the character span's textContent to the new digit
                  // This ensures the span has the correct final digit when the animation completes
                  if (charSpan.textContent !== newDigitStr) {
                    charSpan.textContent = newDigitStr ?? "";
                  }

                  existingWheel.setAttribute(
                    "data-final-digit",
                    newDigitStr ?? "",
                  );

                  requestAnimationFrame(() => {
                    existingWrapper.style.setProperty(
                      "--digit-position",
                      newDigitStr ?? "",
                    );
                    // Refresh the sweep deadline so a rapidly-replaced
                    // wheel is given a fresh full duration to settle.
                    existingWheel.setAttribute(
                      "data-anim-end-at",
                      (performance.now() + 400).toString(),
                    );
                  });

                  const oldDigitWidth = oldDigitStr
                    ? measureText(oldDigitStr, charSpan)
                    : 0;
                  const newDigitWidth = newDigitStr
                    ? measureText(newDigitStr, charSpan)
                    : 0;

                  if (oldDigitWidth > 0 && newDigitWidth > 0) {
                    const currentWidth = charSpan.getBoundingClientRect().width;
                    setWidthConstraints(charSpan, currentWidth);
                    charSpan.setAttribute("data-width-animate", "");

                    requestAnimationFrame(() => {
                      setWidthConstraints(charSpan, newDigitWidth);
                    });
                  }

                  repositionBarrelWheel(
                    existingWheel,
                    charSpan,
                    parentContainer,
                  );
                  charSpan.style.color = "transparent";
                  return;
                }
              }

              // `fromZero` wheels are for digits being added by a value-
              // prop replacement (no aligned old digit). They start at
              // width 0 (the slot grows in), the wheel digit rolls from
              // "0" to the new digit, and the wheel's opacity fades from
              // 0 → 1. For every other wheel we keep the existing
              // old-digit → new-digit width animation.
              const isFromZero = barrelWheelData.fromZero === true;
              const oldDigitWidth = isFromZero
                ? 0
                : oldDigitStr
                  ? measureText(oldDigitStr, charSpan)
                  : 0;
              const newDigitWidth = newDigitStr
                ? measureText(newDigitStr, charSpan)
                : 0;
              const shouldAnimateWidth =
                newDigitWidth > 0 && (oldDigitWidth > 0 || isFromZero);

              const wheel = document.createElement("span");
              wheel.dataset.barrelWheel = "";
              wheel.setAttribute("data-direction", direction);
              wheel.setAttribute("data-final-digit", finalDigit.toString());
              wheel.setAttribute("data-char-index", index.toString());
              if (isFromZero) {
                wheel.dataset.fromZero = "";
              }

              const wrapper = document.createElement("div");
              wrapper.dataset.barrelWheelDigitsWrapper = "";
              wrapper.style.position = "relative";

              // Create digits 0-9
              for (let digit = 0; digit <= 9; digit++) {
                const digitStr = digit.toString();
                const digitElement = document.createElement("div");
                digitElement.dataset.barrelDigit = "";
                digitElement.setAttribute("data-digit", digitStr);
                digitElement.textContent = digitStr;
                digitElement.style.position = "relative";
                digitElement.style.height = "1em";
                digitElement.style.lineHeight = "1em";
                wrapper.appendChild(digitElement);
              }

              charSpan.style.color = "transparent";
              wheel.appendChild(wrapper);
              parentContainer.appendChild(wheel);

              // Set initial width synchronously to prevent flash. For
              // `fromZero` this also pins the slot at 0 before the next
              // frame's animation target.
              if (shouldAnimateWidth) {
                setWidthConstraints(charSpan, oldDigitWidth);
                void charSpan.offsetWidth;
                charSpan.setAttribute("data-width-animate", "");
                void charSpan.offsetWidth;
              }

              if (isFromZero) {
                // Fade the wheel in alongside the digit roll + width
                // animation. Use a CSS transition so jsdom (which has no
                // Web Animations API) can still drive it via
                // `fireEvent.transitionEnd`. Duration/easing match the
                // barrel-wheel transition so all three land together.
                wheel.style.opacity = "0";
                wheel.style.transition =
                  "opacity 0.4s cubic-bezier(.215, .61, .355, 1)";
                void wheel.offsetWidth;
                requestAnimationFrame(() => {
                  wheel.style.opacity = "1";
                });
              }

              // Attach the wheel's transitionend cleanup synchronously so
              // tests (and rapid back-to-back replacements) that fire
              // `transitionend` before the deeply-nested rAF chain that
              // starts the digit-roll has run can still drive the cleanup
              // path that un-hides the underlying char span.
              //
              // The listener lives on `wheel` (the outer element), not on
              // `wrapper`. This is important because:
              //
              //  1. For non-`isFromZero` wheels, the digit-roll transition
              //     fires on `wrapper` (or one of its `[data-barrel-digit]`
              //     children depending on the consumer's CSS) and bubbles
              //     up to `wheel`.
              //  2. For `isFromZero` wheels we also set an `opacity 0 → 1`
              //     transition on `wheel` itself, which only fires on
              //     `wheel` (events do not bubble downwards). Listening on
              //     `wheel` catches both flavors.
              //  3. When the new digit happens to be "0" *and* `isFromZero`
              //     is true, the digit-roll is a no-op — `--digit-position`
              //     goes 0 → 0, so no transitionend fires on `wrapper` at
              //     all. The opacity transition on `wheel` is then the
              //     only signal that cleanup is ready to run.
              //
              // `{once: true}` is intentional: the first transitionend
              // observed inside the wheel (opacity, translate, transform,
              // or `--digit-position`) marks the end of the entrance
              // animation. All these transitions share the same 0.4s
              // duration so they land together; firing on the first one is
              // safe.
              wheel.addEventListener(
                "transitionend",
                () => cleanupBarrelWheel(wheel),
                { once: true },
              );

              wheel.style.position = "absolute";
              wheel.style.display = "flex";
              repositionBarrelWheel(wheel, charSpan, parentContainer);

              // Continuously align the wheel with its underlying span for
              // the whole lifetime of the wheel. Surrounding spans may grow
              // (data-flow), shrink, or shift (positionChanges) during the
              // animation — none of which trigger a resize on the wheel's
              // own charSpan, so a ResizeObserver alone is not enough. The
              // loop self-terminates as soon as the wheel is removed from
              // the DOM (transitionend handler calls `wheel.remove()`).
              const trackWheelPosition = () => {
                if (!wheel.isConnected) {
                  return;
                }
                if (!charSpan.isConnected || !spanRef.current?.parentElement) {
                  requestAnimationFrame(trackWheelPosition);
                  return;
                }
                const parent = spanRef.current.parentElement;
                const trCleanup = temporarilyRemoveAncestorsTransform(charSpan);
                const rect = charSpan.getBoundingClientRect();
                const parentRect = parent.getBoundingClientRect();
                wheel.style.left = `${rect.left - parentRect.left}px`;
                wheel.style.top = `${rect.top - parentRect.top}px`;
                wheel.style.width = `${rect.width}px`;
                wheel.style.height = `${rect.height}px`;
                trCleanup();
                requestAnimationFrame(trackWheelPosition);
              };
              requestAnimationFrame(trackWheelPosition);

              requestAnimationFrame(() => {
                // Verify width constraints are still set
                if (shouldAnimateWidth) {
                  if (!charSpan.style.width || charSpan.style.width === "") {
                    setWidthConstraints(charSpan, oldDigitWidth);
                    void charSpan.offsetWidth;
                  }
                  if (!charSpan.hasAttribute("data-width-animate")) {
                    charSpan.setAttribute("data-width-animate", "");
                    void charSpan.offsetWidth;
                  }
                }

                const initialPosition = oldDigitStr
                  ? parseInt(oldDigitStr, 10)
                  : 0;
                const finalPosition = newDigitStr
                  ? parseInt(newDigitStr, 10)
                  : 0;

                wrapper.style.setProperty(
                  "--digit-position",
                  initialPosition.toString(),
                );

                requestAnimationFrame(() => {
                  wrapper.dataset.animating = "";

                  requestAnimationFrame(() => {
                    wrapper.style.setProperty(
                      "--digit-position",
                      finalPosition.toString(),
                    );
                    // Stamp the deadline used by `sweepSettledBarrelWheels`
                    // — matches the nominal 0.4s digit-roll duration.
                    wheel.setAttribute(
                      "data-anim-end-at",
                      (performance.now() + 400).toString(),
                    );

                    if (shouldAnimateWidth) {
                      if (
                        !charSpan.style.width ||
                        charSpan.style.width === ""
                      ) {
                        setWidthConstraints(charSpan, oldDigitWidth);
                        void charSpan.offsetWidth;
                      }

                      if (!charSpan.hasAttribute("data-width-animate")) {
                        charSpan.setAttribute("data-width-animate", "");
                      }
                      if (
                        window.getComputedStyle(charSpan).display !==
                        "inline-block"
                      ) {
                        charSpan.style.display = "inline-block";
                      }
                      void charSpan.offsetWidth;

                      // Set up ResizeObserver to update barrel wheel position during width animation
                      const existingObserver =
                        resizeObserversRef.current.get(index);
                      if (existingObserver) {
                        existingObserver.disconnect();
                        resizeObserversRef.current.delete(index);
                      }

                      const resizeObserver = new ResizeObserver(() => {
                        if (!spanRef.current || !charSpan) {
                          return;
                        }
                        const parent = spanRef.current.parentElement;
                        if (!parent) {
                          return;
                        }

                        const bw = getBarrelWheel(parent, index);
                        if (bw) {
                          const cleanup =
                            temporarilyRemoveAncestorsTransform(charSpan);
                          const rect = charSpan.getBoundingClientRect();
                          const parentRect = parent.getBoundingClientRect();
                          bw.style.left = `${rect.left - parentRect.left}px`;
                          bw.style.width = `${rect.width}px`;
                          cleanup();
                        }
                      });

                      resizeObserver.observe(charSpan);
                      resizeObserversRef.current.set(index, resizeObserver);

                      requestAnimationFrame(() => {
                        void charSpan.offsetWidth;

                        const computedStyle = window.getComputedStyle(charSpan);
                        const transition = computedStyle.transition;

                        if (
                          !transition ||
                          transition === "none" ||
                          transition === "all 0s ease 0s"
                        ) {
                          // Match the data-width-animate CSS rule and the
                          // barrel wheel's digit-roll transition so the
                          // underlying char animates in lockstep with the
                          // wheel (same duration + easing).
                          charSpan.style.transition =
                            "width 0.4s cubic-bezier(.215, .61, .355, 1), min-width 0.4s cubic-bezier(.215, .61, .355, 1), max-width 0.4s cubic-bezier(.215, .61, .355, 1)";
                          void charSpan.offsetWidth;
                        }

                        setWidthConstraints(charSpan, newDigitWidth);

                        const handleWidthAnimationEnd = (
                          e: TransitionEvent,
                        ) => {
                          if (e.target !== charSpan) {
                            return;
                          }
                          if (
                            ["width", "min-width", "max-width"].includes(
                              e.propertyName,
                            )
                          ) {
                            cleanupWidthAnimation(charSpan);
                            charSpan.removeEventListener(
                              "transitionend",
                              handleWidthAnimationEnd,
                            );

                            const observer =
                              resizeObserversRef.current.get(index);
                            if (observer) {
                              observer.disconnect();
                              resizeObserversRef.current.delete(index);
                            }
                          }
                        };
                        charSpan.addEventListener(
                          "transitionend",
                          handleWidthAnimationEnd,
                        );
                      });
                    }
                  });
                });
              });
            });

            // Apply x-position animations for characters that moved
            // (separators and digits that crossed group boundaries)
            if (positionChanges.length > 0 && spanRef.current) {
              const containerRect = spanRef.current.getBoundingClientRect();

              positionChanges.forEach((change) => {
                const span = spanRef.current?.querySelector(
                  `[data-char-index="${change.newIndex}"]`,
                ) as HTMLElement | null;

                if (span && span.textContent === change.char) {
                  // Look up old position using the character and its old index
                  const oldKey = `${change.char}@${change.oldIndex}`;
                  const oldPos = oldPositions.get(oldKey);

                  if (oldPos) {
                    const newRect = span.getBoundingClientRect();
                    const newX = newRect.left - containerRect.left;
                    const offsetX = oldPos.x - newX;

                    // Only animate if there's a significant position change
                    if (Math.abs(offsetX) > 1) {
                      // Use Web Animations API for smooth x-position animation
                      span.animate(
                        [
                          { transform: `translateX(${offsetX}px)` },
                          { transform: "translateX(0)" },
                        ],
                        {
                          duration: 250,
                          easing: "cubic-bezier(0.33, 1, 0.68, 1)", // ease-out-cubic
                          fill: "forwards",
                        },
                      );
                    }
                  }
                }
              });
            }
            cleanup();
          });

          if (!skipCursor) {
            const setCursor = () => {
              if (!spanRef.current) {
                return;
              }
              // Map raw cursor position to formatted position
              const formattedCursorPos = mapRawToFormattedIndex(
                cleanedText,
                newFormattedText,
                Math.min(newCursorPos, cleanedText.length),
              );
              setCursorPositionInElement(spanRef.current, formattedCursorPos);
            };

            setCursor();
            requestAnimationFrame(setCursor);
          }
        }
      },
      [
        isAllowed,
        displayValue,
        onChange,
        onChangeText,
        autoAddLeadingZero,
        repositionAllBarrelWheels,
        addToHistory,
        formatRawValue,
        mapRawToFormattedIndex,
        mapFormattedToRawIndex,
        computeSeparators,
        cleanupBarrelWheel,
        sweepSettledBarrelWheels,
      ],
    );

    // Initialize
    useEffect(() => {
      if (spanRef.current && formattedDisplayValue) {
        spanRef.current.textContent = formattedDisplayValue;
      }
      // Initialize history with initial state
      if (historyRef.current.length === 0) {
        const initialValue = actualValue;
        historyRef.current.push({
          text: displayValue,
          cursorPosBefore: 0,
          cursorPosAfter: 0,
          value: initialValue,
        });
        historyIndexRef.current = 0;
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Animate the diff when the `value` prop changes externally (i.e. the
    // parent updated `value` outside of our own onChange flow).
    //
    // This is naturally a no-op on the initial mount: `displayValue` is
    // seeded from `actualValue` in `useState`, so the two are in sync and
    // the guard below short-circuits until something actually changes.
    useEffect(() => {
      const newRawDisplay = actualValue?.toString() ?? "";
      const currentParsed = ["", "-", ".", "-."].includes(displayValue)
        ? undefined
        : parseFloat(displayValue);

      if (currentParsed === actualValue || !spanRef.current) {
        return;
      }

      if (!animateOnValueChange) {
        // Snap to the new value instantly — no animations whatsoever.
        // We wipe any in-flight barrel wheels / per-char width styles,
        // rebuild the contenteditable's contents from scratch via
        // `textContent`, and sync the diff-tracking refs so the next
        // animatable change (typing, format/locale toggle) computes its
        // diff against this fresh baseline.
        const parent = spanRef.current.parentElement;
        if (parent) {
          parent
            .querySelectorAll("[data-barrel-wheel]")
            .forEach((el) => el.remove());
        }
        resizeObserversRef.current.forEach((observer) => observer.disconnect());
        resizeObserversRef.current.clear();

        const newFormatted = formatRawValue(newRawDisplay);
        spanRef.current.textContent = newFormatted;

        prevFormattedValueRef.current = newFormatted;
        prevDecimalRef.current = computeSeparators().decimal;
        setDisplayValue(newRawDisplay);
        return;
      }

      updateValue(newRawDisplay, newRawDisplay.length, 0, displayValue.length, {
        skipHistory: true,
        skipOnChange: true,
        skipCursor: true,
        asReplacement: true,
      });
    }, [
      actualValue,
      displayValue,
      updateValue,
      animateOnValueChange,
      formatRawValue,
      computeSeparators,
    ]);

    // Handle format or locale prop changes - animate the transition
    useEffect(() => {
      if (!spanRef.current) {
        return;
      }

      const oldFormattedText = prevFormattedValueRef.current;
      const newFormattedText = formattedDisplayValue;
      const currentDecimal = computeSeparators().decimal;

      // Skip if no actual change. We still keep `prevDecimalRef` in sync
      // with the current decimal so a locale switch that happens to
      // leave the text identical (e.g. an integer with no separators)
      // doesn't leave the ref stale for the next toggle.
      if (oldFormattedText === newFormattedText) {
        prevDecimalRef.current = currentDecimal;
        return;
      }

      const parentContainer = spanRef.current.parentElement;
      // FIRST measurement for the wrapper FLIP — snapshot the wrapper's
      // visible width before any DOM mutation. The wrapper styles
      // (`styles.ts`) enforce `box-sizing: border-box`, so `offsetWidth`
      // is exactly the value we can plug into a WAA `width` keyframe.
      const oldWrapperWidth = parentContainer ? parentContainer.offsetWidth : 0;

      // Collect existing barrel wheels and their associated spans BEFORE any DOM changes
      // We'll update their indices and reposition them after the DOM is rebuilt
      const existingBarrelWheels: {
        wheel: HTMLElement;
        oldIndex: number;
        finalDigit: string;
        span: HTMLElement | null;
        oldX: number; // Capture old x position for animation
      }[] = [];

      if (parentContainer) {
        const cleanup = temporarilyRemoveAncestorsTransform(parentContainer);
        const parentRect = parentContainer.getBoundingClientRect();
        const barrelWheels = getAllBarrelWheels(parentContainer);
        barrelWheels.forEach((wheel) => {
          const oldIndexStr = wheel.getAttribute("data-char-index");
          const finalDigit = wheel.getAttribute("data-final-digit") ?? "";
          if (oldIndexStr !== null) {
            const oldIndex = parseInt(oldIndexStr, 10);
            // Find the associated transparent span
            const span = spanRef.current?.querySelector(
              `[data-char-index="${oldIndex}"]`,
            ) as HTMLElement | null;
            // Capture old x position relative to parent
            const wheelRect = wheel.getBoundingClientRect();
            const oldX = wheelRect.left - parentRect.left;
            existingBarrelWheels.push({
              wheel,
              oldIndex,
              finalDigit,
              span,
              oldX,
            });
          }
        });
        cleanup();
      }

      // Don't clear ResizeObservers - they'll be updated with new indices

      // Capture old positions BEFORE updating DOM
      const oldPositions = new Map<string, { x: number; width: number }>();
      const cleanup = temporarilyRemoveAncestorsTransform(spanRef.current);
      const containerRect = spanRef.current.getBoundingClientRect();
      const existingSpans =
        spanRef.current.querySelectorAll("[data-char-index]");
      existingSpans.forEach((span) => {
        const el = span as HTMLElement;
        const index = parseInt(el.getAttribute("data-char-index") ?? "-1", 10);
        const char = el.textContent ?? "";
        if (index >= 0 && char) {
          const rect = el.getBoundingClientRect();
          oldPositions.set(`${char}@${index}`, {
            x: rect.left - containerRect.left,
            width: rect.width,
          });
        }
      });
      cleanup();

      // Build maps of character positions for matching old -> new
      const oldDigitPositions = new Map<string, number[]>();
      const oldSeparatorPositions = new Map<string, number[]>();

      // The decimal separator for each text is determined deterministically:
      // the current render's decimal was just computed above, and the
      // previous render's lives in `prevDecimalRef`. No string-content
      // heuristics needed.
      const newTextDecimal = currentDecimal;
      const oldTextDecimal = prevDecimalRef.current;

      // A char counts as "raw" (digit / decimal / minus) for matching
      // purposes if it's a digit, a minus sign, or the decimal separator
      // for *its* text. Group separators (e.g. "," in en-US, "." in
      // de-DE) deliberately fall through and get bucketed as separators.
      const isRawCharForMatching = (
        char: string,
        textDecimal: string,
      ): boolean => {
        if (!char) {
          return false;
        }
        if (/[\d-]/.test(char)) {
          return true;
        }
        return char === textDecimal;
      };

      // Normalize each text's own decimal separator to a sentinel so a
      // locale switch (e.g. "1.5" → "1,5") still matches the decimal in
      // the old text to the decimal in the new one. Group separators
      // never match this since they're not equal to their text's
      // decimal.
      const normalizeForMatching = (
        char: string,
        textDecimal: string,
      ): string => (char === textDecimal ? "DECIMAL" : char);

      for (let i = 0; i < oldFormattedText.length; i++) {
        const char = oldFormattedText[i] ?? "";
        if (!char) {
          continue;
        }
        const isRaw = isRawCharForMatching(char, oldTextDecimal);
        const map = isRaw ? oldDigitPositions : oldSeparatorPositions;
        const normalizedChar = normalizeForMatching(char, oldTextDecimal);
        if (!map.has(normalizedChar)) {
          map.set(normalizedChar, []);
        }
        map.get(normalizedChar)!.push(i);
      }

      // Track which old positions have been matched
      const usedOldPositions = new Set<number>();

      // First pass: match old characters to new characters
      const oldToNewMapping = new Map<number, number>(); // oldIndex -> newIndex
      const newToOldMapping = new Map<number, number>(); // newIndex -> oldIndex

      for (let newIdx = 0; newIdx < newFormattedText.length; newIdx++) {
        const char = newFormattedText[newIdx] ?? "";
        if (!char) {
          continue;
        }

        const isRaw = isRawCharForMatching(char, newTextDecimal);
        const posMap = isRaw ? oldDigitPositions : oldSeparatorPositions;
        const normalizedChar = normalizeForMatching(char, newTextDecimal);
        const oldIndices = posMap.get(normalizedChar) ?? [];

        for (const oldIdx of oldIndices) {
          if (!usedOldPositions.has(oldIdx)) {
            usedOldPositions.add(oldIdx);
            oldToNewMapping.set(oldIdx, newIdx);
            newToOldMapping.set(newIdx, oldIdx);
            break;
          }
        }
      }

      // Find separators that need to be removed (in old but not matched)
      const separatorsToRemove: { char: string; oldIndex: number }[] = [];
      for (let i = 0; i < oldFormattedText.length; i++) {
        const char = oldFormattedText[i] ?? "";
        if (!char) {
          continue;
        }

        const isRaw = isRawCharForMatching(char, oldTextDecimal);
        if (!isRaw && !usedOldPositions.has(i)) {
          separatorsToRemove.push({ char, oldIndex: i });
        }
      }

      // Build merged sequence: new characters + old separators to remove (in correct positions)
      // The merged sequence maintains visual order during animation
      type MergedItem =
        | {
            type: "new";
            char: string;
            newIndex: number;
            isNewSeparator: boolean;
          }
        | { type: "removing"; char: string; oldIndex: number };

      const mergedItems: MergedItem[] = [];

      // Add new characters
      for (let i = 0; i < newFormattedText.length; i++) {
        const char = newFormattedText[i] ?? "";
        if (!char) {
          continue;
        }

        const isRaw = isRawCharForMatching(char, newTextDecimal);
        const isNewSeparator = !isRaw && !newToOldMapping.has(i);

        mergedItems.push({
          type: "new",
          char,
          newIndex: i,
          isNewSeparator: isNewSeparator && oldFormattedText.length > 0,
        });
      }

      // Insert removing separators at their visual positions
      // We need to figure out where they should go based on surrounding characters
      separatorsToRemove.forEach(({ char, oldIndex }) => {
        // Find the position in the merged array where this separator should go
        // It should be after any new characters that come from old positions before it
        // and before any new characters that come from old positions after it

        let insertPosition = 0;
        for (let i = 0; i < mergedItems.length; i++) {
          const item = mergedItems[i];
          if (item?.type === "new") {
            const oldIdx = newToOldMapping.get(item.newIndex);
            if (oldIdx !== undefined && oldIdx < oldIndex) {
              insertPosition = i + 1;
            }
          }
        }

        mergedItems.splice(insertPosition, 0, {
          type: "removing",
          char,
          oldIndex,
        });
      });

      // Update barrel wheel indices using the mapping BEFORE clearing the container
      const barrelWheelNewIndices = new Map<HTMLElement, number>();
      const barrelWheelSpansToPreserve = new Set<HTMLElement>();

      existingBarrelWheels.forEach(({ wheel, oldIndex, span }) => {
        const newIndex = oldToNewMapping.get(oldIndex);
        if (newIndex !== undefined) {
          // Update the barrel wheel's index
          wheel.setAttribute("data-char-index", newIndex.toString());
          barrelWheelNewIndices.set(wheel, newIndex);

          // Update ResizeObserver mapping
          const observer = resizeObserversRef.current.get(oldIndex);
          if (observer) {
            resizeObserversRef.current.delete(oldIndex);
            resizeObserversRef.current.set(newIndex, observer);
          }

          // Mark span to preserve
          if (span) {
            barrelWheelSpansToPreserve.add(span);
          }
        } else {
          // Barrel wheel's character was removed - clean up
          const observer = resizeObserversRef.current.get(oldIndex);
          if (observer) {
            observer.disconnect();
            resizeObserversRef.current.delete(oldIndex);
          }
          wheel.remove();
        }
      });

      // Clear the container but preserve barrel wheel spans (we'll update them)
      const allChildren = Array.from(spanRef.current.childNodes);
      allChildren.forEach((child) => {
        if (
          child instanceof HTMLElement &&
          barrelWheelSpansToPreserve.has(child)
        ) {
          // Keep this span - it's associated with an active barrel wheel
          // But temporarily remove it so we can reinsert at correct position
          child.remove();
        } else {
          // Remove this span
          if (child.parentNode) {
            child.parentNode.removeChild(child);
          }
        }
      });

      // Create spans based on merged sequence
      const newSpans: HTMLElement[] = [];
      const addedSeparatorSpans: { span: HTMLElement; finalWidth: number }[] =
        [];
      const removingSpans: HTMLElement[] = [];

      const cleanup2 = temporarilyRemoveAncestorsTransform(spanRef.current);
      mergedItems.forEach((item) => {
        if (!item) {
          return;
        }

        if (item.type === "new") {
          // Check if there's a barrel wheel span that should be at this index
          let span: HTMLElement | null = null;
          for (const {
            wheel,
            span: bwSpan,
            finalDigit,
          } of existingBarrelWheels) {
            const newIndex = barrelWheelNewIndices.get(wheel);
            if (newIndex === item.newIndex && bwSpan) {
              // Reuse the barrel wheel span
              span = bwSpan;
              span.setAttribute("data-char-index", item.newIndex.toString());
              // Update text content to match the new character (decimal separator might have changed)
              if (span.textContent !== item.char && item.char !== finalDigit) {
                // Only update if not the final digit (barrel wheel is still animating)
                span.textContent = item.char;
              }
              break;
            }
          }

          if (!span) {
            // Create new span
            span = document.createElement("span");
            span.textContent = item.char;
            span.setAttribute("data-char-index", item.newIndex.toString());
          }

          if (item.isNewSeparator) {
            // New separator - animate in with width from 0 and slide up
            span.setAttribute("data-flow", "");
            spanRef.current!.appendChild(span);
            const finalWidth = span.getBoundingClientRect().width;
            span.style.width = "0px";
            span.style.minWidth = "0px";
            span.style.maxWidth = "0px";
            addedSeparatorSpans.push({ span, finalWidth });
          } else {
            // Existing character or digit - show immediately (unless it's a barrel wheel span)
            if (!barrelWheelSpansToPreserve.has(span)) {
              span.setAttribute("data-flow", "");
              span.setAttribute("data-show", "");
            }
            spanRef.current!.appendChild(span);
          }
          newSpans.push(span);
        } else {
          // Removing separator - keep in flow, will animate out
          const span = document.createElement("span");
          span.textContent = item.char;
          const oldKey = `${item.char}@${item.oldIndex}`;
          const oldPos = oldPositions.get(oldKey);

          span.setAttribute("data-flow", "");
          span.setAttribute("data-show", "");
          span.setAttribute("data-removing", "");
          span.style.overflow = "visible";
          span.style.display = "inline-block"; // Required for width animation on inline elements
          if (oldPos) {
            span.style.width = `${oldPos.width}px`;
            span.style.minWidth = `${oldPos.width}px`;
            span.style.maxWidth = `${oldPos.width}px`;
          }
          spanRef.current!.appendChild(span);
          removingSpans.push(span);
        }
      });
      cleanup2();

      // Force reflow
      void spanRef.current.offsetWidth;

      const cleanup3 = temporarilyRemoveAncestorsTransform(spanRef.current);
      // Get new container rect for position calculations
      const newContainerRect = spanRef.current.getBoundingClientRect();

      // Apply x-position animations for digits that moved
      newSpans.forEach((span) => {
        const char = span.textContent ?? "";
        if (!char) {
          return;
        }

        const isSeparator = !isRawChar(char);
        if (isSeparator) {
          return;
        } // Don't animate x for separators, they use width animation

        // Find the old position for this character using the mapping
        const newIndex = parseInt(
          span.getAttribute("data-char-index") ?? "-1",
          10,
        );
        const oldIndex = newToOldMapping.get(newIndex);

        if (oldIndex !== undefined) {
          const oldKey = `${char}@${oldIndex}`;
          const oldPos = oldPositions.get(oldKey);
          if (oldPos) {
            const newRect = span.getBoundingClientRect();
            const newX = newRect.left - newContainerRect.left;
            const offsetX = oldPos.x - newX;

            if (Math.abs(offsetX) > 1) {
              span.animate(
                [
                  { transform: `translateX(${offsetX}px)` },
                  { transform: "translateX(0)" },
                ],
                {
                  duration: 400,
                  easing: "cubic-bezier(.215, .61, .355, 1)",
                  fill: "forwards",
                },
              );
            }
          }
        }
      });
      cleanup3();

      // LAST measurement for the wrapper FLIP — force the DOM into its
      // final visual state, read `offsetWidth`, then put everything
      // back. The added-separator spans were just pinned to `width: 0`
      // and the removing-separator spans are still in the DOM at their
      // old widths, so the wrapper's *current* natural width is still
      // ~`oldWrapperWidth`. To sample the LAST width we briefly clear
      // those inline widths and detach the removing spans, take one
      // synchronous `offsetWidth` read (which forces layout), then
      // restore everything before the rAF below kicks off the per-
      // separator transitions.
      const addedSeparatorWidthSnapshot = addedSeparatorSpans.map(
        ({ span }) => ({
          span,
          width: span.style.width,
          minWidth: span.style.minWidth,
          maxWidth: span.style.maxWidth,
        }),
      );
      const removingSpanSnapshot = removingSpans.map((span) => ({
        span,
        parent: span.parentNode,
        nextSibling: span.nextSibling,
      }));

      addedSeparatorWidthSnapshot.forEach(({ span }) => {
        span.style.width = "";
        span.style.minWidth = "";
        span.style.maxWidth = "";
      });
      removingSpanSnapshot.forEach(({ span }) => {
        span.remove();
      });

      const newWrapperWidth = parentContainer
        ? parentContainer.offsetWidth
        : oldWrapperWidth;

      removingSpanSnapshot.forEach(({ span, parent, nextSibling }) => {
        if (parent) {
          parent.insertBefore(span, nextSibling);
        }
      });
      addedSeparatorWidthSnapshot.forEach(
        ({ span, width, minWidth, maxWidth }) => {
          span.style.width = width;
          span.style.minWidth = minWidth;
          span.style.maxWidth = maxWidth;
        },
      );
      void spanRef.current.offsetWidth;

      // Trigger animations in next frame
      requestAnimationFrame(() => {
        // FLIP the wrapper between the two widths we just measured.
        // `styles.ts` pins the wrapper to `box-sizing: border-box`, so
        // a WAA `width` keyframe value equals the visible `offsetWidth`
        // we measured above.
        if (
          parentContainer &&
          Math.abs(newWrapperWidth - oldWrapperWidth) > 0.5
        ) {
          if (wrapperWidthAnimRef.current) {
            wrapperWidthAnimRef.current.cancel();
            wrapperWidthAnimRef.current = null;
          }
          const wrapperAnim = parentContainer.animate(
            [
              { width: `${oldWrapperWidth}px` },
              { width: `${newWrapperWidth}px` },
            ],
            {
              duration: 200,
              easing: "cubic-bezier(.215, .61, .355, 1)",
              fill: "forwards",
            },
          );
          wrapperWidthAnimRef.current = wrapperAnim;
          const clearWrapperAnim = () => {
            if (wrapperWidthAnimRef.current === wrapperAnim) {
              wrapperWidthAnimRef.current = null;
            }
            try {
              wrapperAnim.cancel();
            } catch {
              // ignore — animation already removed/cancelled
            }
          };
          wrapperAnim.onfinish = clearWrapperAnim;
          wrapperAnim.oncancel = clearWrapperAnim;
        }

        // Animate in new separators (width from 0 to final + slide up)
        addedSeparatorSpans.forEach(({ span, finalWidth }) => {
          requestAnimationFrame(() => {
            span.setAttribute("data-show", "");
            span.style.width = `${finalWidth}px`;
            span.style.minWidth = `${finalWidth}px`;
            span.style.maxWidth = `${finalWidth}px`;
          });

          // Clean up inline styles after transition. We filter on
          // `e.target === span` so bubbled transitionend events from any
          // descendants (e.g. introduced by consumer CSS) cannot trigger
          // cleanup prematurely.
          const handleTransitionEnd = (e: TransitionEvent) => {
            if (e.target !== span) {
              return;
            }
            if (e.propertyName === "width") {
              span.style.width = "";
              span.style.minWidth = "";
              span.style.maxWidth = "";
              span.style.overflow = "";
              span.style.display = "";
              span.removeEventListener("transitionend", handleTransitionEnd);
            }
          };
          span.addEventListener("transitionend", handleTransitionEnd);
        });

        // Clean up any digits that might have width styles (from previous animations)
        newSpans.forEach((span) => {
          const isSeparator = !isRawChar(span.textContent ?? "");
          if (!isSeparator && span.style.width) {
            const handleTransitionEnd = (e: TransitionEvent) => {
              if (e.target !== span) {
                return;
              }
              if (e.propertyName === "width") {
                span.style.width = "";
                span.style.minWidth = "";
                span.style.maxWidth = "";
                span.style.display = "";
                span.removeEventListener("transitionend", handleTransitionEnd);
              }
            };
            span.addEventListener("transitionend", handleTransitionEnd);
          }
        });

        // Animate out removed separators (width to 0 + slide down)
        removingSpans.forEach((span) => {
          requestAnimationFrame(() => {
            span.removeAttribute("data-show");
            span.setAttribute("data-hide", "");
            span.style.width = "0px";
            span.style.minWidth = "0px";
            span.style.maxWidth = "0px";
          });

          // Remove after animation completes
          const handleTransitionEnd = (e: TransitionEvent) => {
            if (e.target !== span) {
              return;
            }
            if (e.propertyName === "translate" || e.propertyName === "width") {
              span.removeEventListener("transitionend", handleTransitionEnd);
              // Only remove when both animations are done
              if (
                span.style.width === "0px" &&
                span.getAttribute("data-hide") !== null
              ) {
                span.remove();
              }
            }
          };
          span.addEventListener("transitionend", handleTransitionEnd);
        });

        // Reposition existing barrel wheels after DOM changes with x-position animation
        // We need to calculate the FINAL x position (after all width animations complete)
        if (parentContainer && existingBarrelWheels.length > 0) {
          // Create a set of removing span indices for quick lookup
          const removingSpanSet = new Set(removingSpans.map((s) => s));
          // Create a map of new separator spans to their final widths
          const separatorFinalWidths = new Map<HTMLElement, number>();
          addedSeparatorSpans.forEach(({ span, finalWidth }) => {
            separatorFinalWidths.set(span, finalWidth);
          });

          existingBarrelWheels.forEach(({ wheel, oldX }) => {
            const newIndex = barrelWheelNewIndices.get(wheel);
            if (newIndex === undefined) {
              return; // Was removed
            }

            // Find the span at the new index
            const span = spanRef.current?.querySelector(
              `[data-char-index="${newIndex}"]`,
            ) as HTMLElement | null;

            if (span && spanRef.current) {
              const cleanup = temporarilyRemoveAncestorsTransform(
                spanRef.current,
              );
              const parentRect = parentContainer.getBoundingClientRect();
              const containerRect = spanRef.current.getBoundingClientRect();

              // Calculate final x position by summing final widths of all elements before this span
              let finalX = containerRect.left - parentRect.left;
              let foundSpan = false;

              // Iterate through all children in order
              for (const child of Array.from(spanRef.current.children)) {
                if (child === span) {
                  foundSpan = true;
                  break;
                }

                const childEl = child as HTMLElement;

                // Determine the final width of this element
                let elementFinalWidth: number;

                if (removingSpanSet.has(childEl)) {
                  // Removing separator - final width is 0
                  elementFinalWidth = 0;
                } else if (separatorFinalWidths.has(childEl)) {
                  // New separator - use the final width (after animation)
                  elementFinalWidth = separatorFinalWidths.get(childEl)!;
                } else {
                  // Regular span - use measureText to get natural width
                  const text = childEl.textContent ?? "";
                  if (text) {
                    elementFinalWidth = measureText(text, childEl);
                  } else {
                    elementFinalWidth = childEl.getBoundingClientRect().width;
                  }
                }

                finalX += elementFinalWidth;
              }

              if (!foundSpan) {
                // Fallback to current position
                const spanRect = span.getBoundingClientRect();
                finalX = spanRect.left - parentRect.left;
              }

              // Get span dimensions
              const spanRect = span.getBoundingClientRect();
              const spanWidth = measureText(span.textContent ?? "", span);

              // Calculate x offset for animation (from old position to final position)
              const offsetX = oldX - finalX;

              cleanup();

              // Set final position immediately
              wheel.style.left = `${finalX}px`;
              wheel.style.top = `${spanRect.top - parentRect.top}px`;
              wheel.style.width = `${spanWidth}px`;
              wheel.style.height = `${spanRect.height}px`;

              // Animate x position if there's a significant change.
              // Match the digit-roll + data-width-animate timing (0.4s
              // ease-out-cubic) so the wheel reaches its final position at
              // the same moment the underlying span settles, avoiding any
              // visual jump when the wheel is removed.
              if (Math.abs(offsetX) > 1) {
                wheel.animate(
                  [
                    { transform: `translateX(${offsetX}px)` },
                    { transform: "translateX(0)" },
                  ],
                  {
                    duration: 400,
                    easing: "cubic-bezier(.215, .61, .355, 1)",
                    fill: "forwards",
                  },
                );
              }

              // Ensure the span is transparent (barrel wheel is visible)
              span.style.color = "transparent";
            }
          });
        }
      });

      // Update the refs to match current formatted value & decimal so the
      // next run of this effect knows what was used last time.
      prevFormattedValueRef.current = formattedDisplayValue;
      prevDecimalRef.current = currentDecimal;
    }, [format, locale, formattedDisplayValue, isRawChar, computeSeparators]);

    // Cleanup ResizeObservers on unmount
    useEffect(() => {
      const observers = resizeObserversRef.current;
      return () => {
        observers.forEach((observer) => observer.disconnect());
        observers.clear();
      };
    }, []);

    const applyHistoryItemWithCursor = useCallback(
      (
        historyItem: {
          text: string;
          cursorPosBefore: number;
          cursorPosAfter: number;
          value: MaybeUndefined<number>;
        },
        cursorPos: number,
      ) => {
        isUndoRedoRef.current = true;
        setDisplayValue(historyItem.text);
        setUncontrolledValue(historyItem.value);
        onChange?.(historyItem.value);
        onChangeText?.(historyItem.text);
        setCursorPosition(cursorPos);

        if (spanRef.current) {
          clearBarrelWheelsAndSpans(
            spanRef.current,
            spanRef.current.parentElement,
          );
          spanRef.current.textContent = historyItem.text;

          spanRef.current.focus();

          // History stores raw cursor positions (no separators). After the
          // format effect rebuilds the DOM with separators we need to land
          // the cursor at the FORMATTED equivalent — otherwise a raw index
          // like 4 in "1,234" lands between the "3" and the "4".
          const clampedRawPos = Math.min(cursorPos, historyItem.text.length);
          const formattedText = formatRawValue(historyItem.text);
          const formattedCursorPos = mapRawToFormattedIndex(
            historyItem.text,
            formattedText,
            clampedRawPos,
          );

          // Run synchronously while the DOM still contains the plain raw
          // text we just wrote (no [data-char-index] spans yet) — use the
          // raw position so the cursor lands in a sane spot. The rAF call
          // runs after React's commit phase and the format effect have
          // rebuilt the spans, so we use the formatted position there.
          const restoreCursorRaw = () => {
            if (!spanRef.current) {
              return;
            }
            spanRef.current.focus();
            setCursorAtPosition(spanRef.current, clampedRawPos);
          };
          const restoreCursorFormatted = () => {
            if (!spanRef.current) {
              return;
            }
            spanRef.current.focus();
            setCursorPositionInElement(spanRef.current, formattedCursorPos);
            isUndoRedoRef.current = false;
          };

          restoreCursorRaw();
          requestAnimationFrame(restoreCursorFormatted);
        }
      },
      [onChange, onChangeText, formatRawValue, mapRawToFormattedIndex],
    );

    const applyHistoryItem = useCallback(
      (
        historyItem:
          | {
              text: string;
              cursorPosBefore: number;
              cursorPosAfter: number;
              value: MaybeUndefined<number>;
            }
          | undefined,
        isUndo: boolean,
      ) => {
        if (!historyItem) {
          return;
        }

        // For redo: use cursorPosAfter from the item
        const targetCursorPos = isUndo
          ? historyItem.cursorPosBefore
          : historyItem.cursorPosAfter;
        applyHistoryItemWithCursor(historyItem, targetCursorPos);
      },
      [applyHistoryItemWithCursor],
    );

    const handleKeyDown = useCallback<KeyboardEventHandler<HTMLSpanElement>>(
      (event) => {
        const key = event.key;

        // Get current state (raw, unformatted)
        const currentText = displayValue;
        const currentFormattedText = formattedDisplayValue;
        const selection = window.getSelection();
        const range = selection?.getRangeAt(0);

        if (!range || !spanRef.current) {
          return;
        }

        if (!selection) {
          return;
        }
        // Get selection range in formatted positions
        const { start: formattedStart, end: formattedEnd } = getSelectionRange(
          spanRef.current,
          selection,
        );
        // Convert to raw positions for working with displayValue
        const start = mapFormattedToRawIndex(
          currentText,
          currentFormattedText,
          formattedStart,
        );
        const end = mapFormattedToRawIndex(
          currentText,
          currentFormattedText,
          formattedEnd,
        );

        // Handle special keys
        if ((event.metaKey || event.ctrlKey) && key === "Backspace") {
          event.preventDefault();
          // Remove barrel wheels for all indices being deleted (from 0 to end)
          const indicesToRemove: number[] = [];
          for (let i = 0; i < end; i++) {
            indicesToRemove.push(i);
          }
          removeBarrelWheelsAtIndices(indicesToRemove);
          const newText = currentText.slice(end);
          updateValue(newText, 0, 0, end);
          return;
        }

        if (event.metaKey || event.ctrlKey) {
          // prevent rich text formatting shortcuts
          if (["b", "i", "u", "k"].includes(key.toLowerCase())) {
            event.preventDefault();
            return;
          }
          // Handle Undo (Cmd+Z / Ctrl+Z)
          if (key.toLowerCase() === "z" && !event.shiftKey) {
            event.preventDefault();
            if (historyIndexRef.current > 0) {
              // Get cursor position from current item BEFORE decrementing
              const cursorPos =
                historyRef.current[historyIndexRef.current]?.cursorPosBefore ??
                0;
              historyIndexRef.current--;
              // Restore text from previous item, but use cursor position from current item
              const prevItem = historyRef.current[historyIndexRef.current];
              if (prevItem) {
                applyHistoryItemWithCursor(prevItem, cursorPos);
              }
            }
            return;
          }
          // Handle Redo (Cmd+Shift+Z / Ctrl+Y or Ctrl+Shift+Z)
          if (
            (key.toLowerCase() === "z" && event.shiftKey) ||
            key.toLowerCase() === "y"
          ) {
            event.preventDefault();
            if (historyIndexRef.current < historyRef.current.length - 1) {
              historyIndexRef.current++;
              // For redo, use cursorPosAfter from the item we're restoring to
              applyHistoryItem(
                historyRef.current[historyIndexRef.current],
                false,
              );
            }
            return;
          }
          // Handle Cut (Cmd+X / Ctrl+X)
          if (key.toLowerCase() === "x") {
            event.preventDefault();
            // Copy to clipboard (browser handles this automatically, but we need to handle the deletion)
            if (start !== end) {
              const selectedText = currentText.slice(start, end);
              // Try to copy to clipboard, but don't fail if clipboard API is not available (e.g., in tests)
              if (
                typeof navigator !== "undefined" &&
                navigator.clipboard &&
                navigator.clipboard.writeText
              ) {
                navigator.clipboard.writeText(selectedText).catch(() => {
                  // Fallback if clipboard API fails
                });
              }
              // Delete the selected text
              const newText =
                currentText.slice(0, start) + currentText.slice(end);
              updateValue(newText, start, start, end);
            }
            return;
          }
        }

        // Handle Alt/Cmd+ArrowLeft/ArrowRight (move to start/end)
        if (
          (event.metaKey || event.ctrlKey || event.altKey) &&
          (key === "ArrowLeft" || key === "ArrowRight")
        ) {
          event.preventDefault();

          if (!spanRef.current) {
            return;
          }
          const selection = window.getSelection();
          if (!selection) {
            return;
          }

          // Use formatted text length for target position
          const targetPos =
            key === "ArrowLeft" ? 0 : currentFormattedText.length;

          if (event.shiftKey) {
            // Extend selection to start/end
            // Use the selection's anchor point as the anchor (formatted position)
            let anchorPos = formattedStart;
            if (
              selection.anchorNode &&
              spanRef.current.contains(selection.anchorNode)
            ) {
              const anchorRange = document.createRange();
              anchorRange.selectNodeContents(spanRef.current);
              anchorRange.setEnd(selection.anchorNode, selection.anchorOffset);
              anchorPos = anchorRange.toString().length;
            }

            // Find both anchor and target nodes/offsets
            let currentPos = 0;
            const walker = document.createTreeWalker(
              spanRef.current,
              NodeFilter.SHOW_TEXT,
              null,
            );
            let anchorNode: Node | null = null;
            let anchorOffset = 0;
            let targetNode: Node | null = null;
            let targetOffset = 0;

            let node: Node | null;
            while ((node = walker.nextNode())) {
              const nodeLength = node.textContent?.length ?? 0;

              // Find anchor node (selection anchor position)
              if (!anchorNode && currentPos + nodeLength >= anchorPos) {
                anchorNode = node;
                anchorOffset = anchorPos - currentPos;
              }

              // Find target node
              if (!targetNode && currentPos + nodeLength >= targetPos) {
                targetNode = node;
                targetOffset = targetPos - currentPos;
              }

              if (anchorNode && targetNode) {
                break;
              }

              currentPos += nodeLength;
            }

            if (anchorNode && targetNode) {
              const range = document.createRange();

              // Set range from anchor to target (direction matters for selection direction)
              if (key === "ArrowLeft") {
                // Selecting backwards - anchor stays, extend to start
                range.setStart(targetNode, targetOffset);
                range.setEnd(anchorNode, anchorOffset);
              } else {
                // Selecting forwards - anchor stays, extend to end
                range.setStart(anchorNode, anchorOffset);
                range.setEnd(targetNode, targetOffset);
              }

              selection.removeAllRanges();
              selection.addRange(range);
            }
          } else {
            // Move cursor to start/end
            let currentPos = 0;
            const walker = document.createTreeWalker(
              spanRef.current,
              NodeFilter.SHOW_TEXT,
              null,
            );
            let node: Node | null;

            while ((node = walker.nextNode())) {
              const nodeLength = node.textContent?.length ?? 0;
              if (currentPos + nodeLength >= targetPos) {
                const offset = targetPos - currentPos;
                const range = document.createRange();
                range.setStart(node, offset);
                range.collapse(true);
                selection.removeAllRanges();
                selection.addRange(range);
                return;
              }
              currentPos += nodeLength;
            }

            // Fallback
            const range = document.createRange();
            range.selectNodeContents(spanRef.current);
            range.collapse(key === "ArrowLeft");
            selection.removeAllRanges();
            selection.addRange(range);
          }
          return;
        }

        const allowedKeys = [
          "Backspace",
          "Delete",
          "ArrowLeft",
          "ArrowRight",
          "Tab",
          "Home",
          "End",
        ];
        if (allowedKeys.includes(key)) {
          // Handle Backspace and Delete ourselves
          if (key === "Backspace") {
            event.preventDefault();
            if (start === end) {
              // No selection, delete character before cursor
              if (start > 0) {
                // Remove barrel wheel at the position being deleted
                removeBarrelWheelsAtIndices([start - 1]);
                const newText =
                  currentText.slice(0, start - 1) + currentText.slice(start);
                updateValue(newText, start - 1, start - 1, start);
              }
            } else {
              // Has selection, delete selected text
              // Remove barrel wheels for all indices in the selection range
              const indicesToRemove: number[] = [];
              for (let i = start; i < end; i++) {
                indicesToRemove.push(i);
              }
              removeBarrelWheelsAtIndices(indicesToRemove);
              const newText =
                currentText.slice(0, start) + currentText.slice(end);
              updateValue(newText, start, start, end);
            }
            return;
          }

          if (key === "Delete") {
            event.preventDefault();
            if (start === end) {
              // No selection
              if (event.metaKey || event.ctrlKey) {
                // Ctrl/Cmd+Delete: delete all characters after cursor
                if (start < currentText.length) {
                  // Remove barrel wheels for all indices being deleted
                  const indicesToRemove: number[] = [];
                  for (let i = start; i < currentText.length; i++) {
                    indicesToRemove.push(i);
                  }
                  removeBarrelWheelsAtIndices(indicesToRemove);
                  const newText = currentText.slice(0, start);
                  updateValue(newText, start, start, currentText.length);
                }
              } else {
                // Delete: delete one character after cursor
                if (start < currentText.length) {
                  // Remove barrel wheel at the position being deleted
                  removeBarrelWheelsAtIndices([start]);
                  const newText =
                    currentText.slice(0, start) + currentText.slice(start + 1);
                  updateValue(newText, start, start, start + 1);
                }
              }
            } else {
              // Has selection, delete selected text
              // Remove barrel wheels for all indices in the selection range
              const indicesToRemove: number[] = [];
              for (let i = start; i < end; i++) {
                indicesToRemove.push(i);
              }
              removeBarrelWheelsAtIndices(indicesToRemove);
              const newText =
                currentText.slice(0, start) + currentText.slice(end);
              updateValue(newText, start, start, end);
            }
            return;
          }

          // Handle ArrowLeft and ArrowRight to move cursor by one character
          // For formatted numbers, we need to work with formatted positions and skip separators
          if (key === "ArrowLeft" || key === "ArrowRight") {
            event.preventDefault();
            if (!spanRef.current) {
              return;
            }
            const selection = window.getSelection();
            if (!selection) {
              return;
            }

            // Helper to check if a character is a separator (not digit, dot, or minus)
            const navLocaleDecimal = computeLocaleSeparators().decimal;
            const isSeparator = (char: string | undefined): boolean => {
              if (!char) {
                return false;
              }
              return new RegExp(`[^\\d.${navLocaleDecimal}-]`).test(char);
            };

            // Get current cursor position in formatted text
            const { start: formattedCursorStart, end: formattedCursorEnd } =
              getSelectionRange(spanRef.current, selection);

            // Calculate target position in formatted text
            let targetFormattedPos: number;
            if (event.shiftKey) {
              // Extend selection - use formatted positions directly
              const getPositionFromNode = (
                node: Node | null,
                offset: number,
              ): number => {
                if (!node || !spanRef.current?.contains(node)) {
                  return formattedCursorStart;
                }
                const range = document.createRange();
                range.setStart(spanRef.current, 0);
                range.setEnd(node, offset);
                return range.toString().length;
              };

              let anchorPos = getPositionFromNode(
                selection.anchorNode,
                selection.anchorOffset,
              );
              let focusPos = getPositionFromNode(
                selection.focusNode,
                selection.focusOffset,
              );

              if (
                anchorPos === focusPos &&
                formattedCursorStart === formattedCursorEnd
              ) {
                anchorPos = formattedCursorStart;
                focusPos = formattedCursorStart;
              }

              // Move focus, skipping separators
              if (key === "ArrowLeft") {
                targetFormattedPos = Math.max(0, focusPos - 1);
                // Skip over separators when moving left
                while (
                  targetFormattedPos > 0 &&
                  isSeparator(currentFormattedText[targetFormattedPos])
                ) {
                  targetFormattedPos--;
                }
              } else {
                targetFormattedPos = Math.min(
                  currentFormattedText.length,
                  focusPos + 1,
                );
                // Skip over separators when moving right
                while (
                  targetFormattedPos < currentFormattedText.length &&
                  isSeparator(currentFormattedText[targetFormattedPos])
                ) {
                  targetFormattedPos++;
                }
              }

              // Find nodes for selection
              let currentPos = 0;
              const walker = document.createTreeWalker(
                spanRef.current,
                NodeFilter.SHOW_TEXT,
                null,
              );
              let anchorNode: Node | null = null;
              let anchorOffset = 0;
              let targetNode: Node | null = null;
              let targetOffset = 0;

              let node: Node | null;
              while ((node = walker.nextNode())) {
                const nodeLength = node.textContent?.length ?? 0;

                if (!anchorNode && currentPos + nodeLength >= anchorPos) {
                  anchorNode = node;
                  anchorOffset = anchorPos - currentPos;
                }

                if (
                  !targetNode &&
                  currentPos + nodeLength >= targetFormattedPos
                ) {
                  targetNode = node;
                  targetOffset = targetFormattedPos - currentPos;
                }

                if (anchorNode && targetNode) {
                  break;
                }

                currentPos += nodeLength;
              }

              if (targetNode) {
                try {
                  selection.extend(targetNode, targetOffset);
                } catch {
                  if (anchorNode) {
                    const range = document.createRange();
                    range.setStart(anchorNode, anchorOffset);
                    range.setEnd(targetNode, targetOffset);
                    selection.removeAllRanges();
                    selection.addRange(range);
                  }
                }
              }
            } else {
              // Move cursor (no shift key)
              if (formattedCursorStart !== formattedCursorEnd) {
                // There's a selection - move to start or end based on arrow direction
                targetFormattedPos =
                  key === "ArrowLeft"
                    ? formattedCursorStart
                    : formattedCursorEnd;
              } else {
                // No selection - move cursor by one position, skipping separators
                if (key === "ArrowLeft") {
                  targetFormattedPos = Math.max(0, formattedCursorStart - 1);
                  // Skip over separators when moving left
                  while (
                    targetFormattedPos > 0 &&
                    isSeparator(currentFormattedText[targetFormattedPos])
                  ) {
                    targetFormattedPos--;
                  }
                } else {
                  targetFormattedPos = Math.min(
                    currentFormattedText.length,
                    formattedCursorStart + 1,
                  );
                  // Skip over separators when moving right
                  while (
                    targetFormattedPos < currentFormattedText.length &&
                    isSeparator(currentFormattedText[targetFormattedPos])
                  ) {
                    targetFormattedPos++;
                  }
                }
              }

              // Find target node using formatted position
              let currentPos = 0;
              const walker = document.createTreeWalker(
                spanRef.current,
                NodeFilter.SHOW_TEXT,
                null,
              );
              let node: Node | null;

              while ((node = walker.nextNode())) {
                const nodeLength = node.textContent?.length ?? 0;
                if (currentPos + nodeLength >= targetFormattedPos) {
                  const offset = targetFormattedPos - currentPos;
                  const range = document.createRange();
                  range.setStart(node, offset);
                  range.collapse(true);
                  selection.removeAllRanges();
                  selection.addRange(range);
                  return;
                }
                currentPos += nodeLength;
              }

              // Fallback to start/end
              const range = document.createRange();
              range.selectNodeContents(spanRef.current);
              range.collapse(key === "ArrowLeft");
              selection.removeAllRanges();
              selection.addRange(range);
            }
            return;
          }

          // Allow other navigation keys
          return;
        }

        if (event.ctrlKey || event.metaKey) {
          return;
        }

        // Handle character input
        if (/^\d$/.test(key)) {
          // Prevent typing more decimals than allowed
          const decimalPart = currentText.split(".")[1];
          if (
            isNonNullable(decimalScale) &&
            decimalPart &&
            decimalPart.length >= decimalScale &&
            Math.abs(end - start) !== 1
          ) {
            const decimalPosition = currentText.indexOf(".");
            const isCursorInDecimalPart = start > decimalPosition;
            if (isCursorInDecimalPart) {
              event.preventDefault();
              return;
            }
          }

          // Prevent typing digit when cursor is at position 0 and text starts with "-"
          if (currentText.startsWith("-") && start === 0 && end === 0) {
            event.preventDefault();
            return;
          }

          // Prevent adding 0 when there's already a leading 0 and cursor is before/after it
          // Also prevent adding 0 at the beginning of a number (would create leading zero)
          if (key === "0") {
            let shouldPrevent = false;
            let restorePos = start;

            // Check if text starts with "0" (including "0.")
            if (currentText.startsWith("0") && currentText.length > 0) {
              // Cursor is at position 0 (before the 0) - prevent typing another 0
              if (start === 0) {
                shouldPrevent = true;
                restorePos = start;
              }
              // Cursor is at position 1 (right after the 0) - prevent typing another 0
              // This applies even if followed by "." (e.g., "0.1121" should not become "00.1121")
              else if (start === 1 && end === 1) {
                shouldPrevent = true;
                restorePos = start;
              }
            }
            // Check if text starts with "-0" (including "-0.")
            else if (currentText.startsWith("-0") && currentText.length > 1) {
              // Cursor is at position 1 (right after "-") or 2 (right after "-0")
              // Prevent typing 0 at position 1 if we already have "-0" (whether followed by "." or not)
              if (start === 1) {
                shouldPrevent = true;
                restorePos = start;
              } else if (start === 2 && end === 2) {
                // Also prevent at position 2 (even if followed by ".")
                // This applies even if followed by "." (e.g., "-0.1121" should not become "-00.1121")
                shouldPrevent = true;
                restorePos = start;
              }
            }
            // Prevent adding 0 at the beginning of a number (would create leading zero like "012")
            // BUT allow it when text starts with "." (e.g., ".1121" -> "0.1121")
            else if (
              start === 0 &&
              currentText.length > 0 &&
              !currentText.startsWith("0") &&
              !currentText.startsWith("-") &&
              !currentText.startsWith(".")
            ) {
              // Typing 0 at position 0 of a number like "12" would create "012" which gets cleaned to "12"
              // So we should prevent it (unless text starts with ".")
              shouldPrevent = true;
              restorePos = start;
            }
            // Prevent adding 0 after minus in negative number (would create leading zero like "-012")
            // BUT allow it when the next character is "." (e.g., "-.1121" -> "-0.1121")
            else if (
              currentText.startsWith("-") &&
              start === 1 &&
              currentText.length > 1 &&
              currentText[1] !== "0" &&
              currentText[1] !== "."
            ) {
              // Typing 0 at position 1 after "-" in a number like "-12" would create "-012" which gets cleaned to "-12"
              // So we should prevent it (unless the next character is ".")
              shouldPrevent = true;
              restorePos = start;
            }

            if (shouldPrevent) {
              event.preventDefault();
              event.stopPropagation();
              // Mark that we should prevent the next input event
              shouldPreventInputRef.current = true;
              preventInputCursorPosRef.current = restorePos;

              // Restore cursor to original position - use both immediate and deferred restoration
              // to catch any browser default behavior
              if (spanRef.current) {
                const restoreCursor = () => {
                  if (!spanRef.current) {
                    return;
                  }
                  const selection = window.getSelection();
                  if (!selection) {
                    return;
                  }

                  let currentPos = 0;
                  const walker = document.createTreeWalker(
                    spanRef.current,
                    NodeFilter.SHOW_TEXT,
                    null,
                  );
                  let node: Node | null;

                  while ((node = walker.nextNode())) {
                    const nodeLength = node.textContent?.length ?? 0;
                    if (currentPos + nodeLength >= restorePos) {
                      const offset = Math.min(
                        restorePos - currentPos,
                        nodeLength,
                      );
                      const range = document.createRange();
                      range.setStart(node, offset);
                      range.collapse(true);
                      selection.removeAllRanges();
                      selection.addRange(range);
                      return;
                    }
                    currentPos += nodeLength;
                  }

                  // Fallback
                  const range = document.createRange();
                  range.selectNodeContents(spanRef.current);
                  range.collapse(true);
                  selection.removeAllRanges();
                  selection.addRange(range);
                };

                // Try immediately
                restoreCursor();

                // Also try after a microtask to catch any delayed browser behavior
                Promise.resolve().then(restoreCursor);

                // And after a short timeout as a final safeguard
                setTimeout(restoreCursor, 0);
                requestAnimationFrame(restoreCursor);
              }
              return;
            }
          }

          event.preventDefault();
          // Check maxLength before inserting
          const newLength = currentText.length - (end - start) + 1;
          if (maxLength !== undefined && newLength > maxLength) {
            return;
          }
          const newText =
            currentText.slice(0, start) + key + currentText.slice(end);
          updateValue(newText, start + 1, start, end);
          return;
        }

        // Prevent default for other character inputs
        event.preventDefault();

        // Handle decimal point input - accept both '.' and locale decimal separator
        const { decimal } = computeLocaleSeparators();
        if (key === "." || key === decimal) {
          // Only allow one decimal point (internally stored as '.')
          if (!currentText.includes(".")) {
            // Prevent typing decimal when cursor is at position 0 and text starts with "-"
            if (currentText.startsWith("-") && start === 0 && end === 0) {
              return;
            }
            // Check maxLength before inserting
            const newLength = currentText.length - (end - start) + 1;
            if (maxLength !== undefined && newLength > maxLength) {
              return;
            }
            // Prevent if no decimals allowed
            if (decimalScale === 0) {
              return;
            }
            // Always insert '.' internally (will be displayed as locale decimal)
            const newText =
              currentText.slice(0, start) + "." + currentText.slice(end);
            const decimalPart = newText.split(".")[1];
            const shouldCropDecimalPart =
              isNonNullable(decimalScale) &&
              decimalPart &&
              decimalPart.length > decimalScale;
            if (shouldCropDecimalPart) {
              const decimalPosition = newText.indexOf(".");
              updateValue(
                newText.slice(0, decimalPosition + decimalScale + 1),
                start + 1,
                start,
                end,
              );
            } else {
              updateValue(newText, start + 1, start, end);
            }
          }
          return;
        }

        if (key === "-") {
          // Only allow minus at the beginning, and only if there isn't already one
          const hasMinus = currentText.startsWith("-");
          if (start === 0 && !hasMinus && allowNegative) {
            // Check maxLength before inserting
            const newLength = currentText.length - (end - start) + 1;
            if (maxLength !== undefined && newLength > maxLength) {
              return;
            }
            // Insert minus at the beginning (can replace selection)
            const newText = key + currentText.slice(end);
            updateValue(newText, start + 1, start, end);
          }
          // If there's already a minus, ignore the input (don't toggle or insert)
          return;
        }
      },
      [
        decimalScale,
        allowNegative,
        displayValue,
        formattedDisplayValue,
        mapFormattedToRawIndex,
        computeLocaleSeparators,
        removeBarrelWheelsAtIndices,
        updateValue,
        applyHistoryItemWithCursor,
        applyHistoryItem,
        maxLength,
      ],
    );

    const handleCopy = useCallback<ClipboardEventHandler<HTMLSpanElement>>(
      (event) => {
        const selection = window.getSelection();
        const range = selection?.getRangeAt(0);
        if (!range || !spanRef.current) {
          return;
        }

        if (!selection) {
          return;
        }
        const { start: formattedStart, end: formattedEnd } = getSelectionRange(
          spanRef.current,
          selection,
        );
        const start = mapFormattedToRawIndex(
          displayValue,
          formattedDisplayValue,
          formattedStart,
        );
        const end = mapFormattedToRawIndex(
          displayValue,
          formattedDisplayValue,
          formattedEnd,
        );
        if (start === end) {
          return;
        }

        const selectedText = displayValue.slice(start, end);
        event.clipboardData.setData("text/plain", selectedText);
        event.preventDefault();
      },
      [displayValue, formattedDisplayValue, mapFormattedToRawIndex],
    );

    const handleCut = useCallback<ClipboardEventHandler<HTMLSpanElement>>(
      (event) => {
        const selection = window.getSelection();
        const range = selection?.getRangeAt(0);
        if (!range || !spanRef.current) {
          return;
        }

        if (!selection) {
          return;
        }
        const { start: formattedStart, end: formattedEnd } = getSelectionRange(
          spanRef.current,
          selection,
        );
        const start = mapFormattedToRawIndex(
          displayValue,
          formattedDisplayValue,
          formattedStart,
        );
        const end = mapFormattedToRawIndex(
          displayValue,
          formattedDisplayValue,
          formattedEnd,
        );
        if (start === end) {
          return;
        }

        const selectedText = displayValue.slice(start, end);
        event.clipboardData.setData("text/plain", selectedText);

        const newText = displayValue.slice(0, start) + displayValue.slice(end);
        setTimeout(() => {
          updateValue(newText, start, start, end);
        }, 0);
      },
      [
        displayValue,
        formattedDisplayValue,
        mapFormattedToRawIndex,
        updateValue,
      ],
    );

    const handleBeforeInput = useCallback<FormEventHandler<HTMLSpanElement>>(
      (event) => {
        if (shouldPreventInputRef.current) {
          event.preventDefault();
          const restorePos = preventInputCursorPosRef.current;
          shouldPreventInputRef.current = false;

          const restoreCursor = () => {
            if (spanRef.current) {
              setCursorPositionInElement(spanRef.current, restorePos);
            }
          };

          restoreCursor();
          Promise.resolve().then(restoreCursor);
          setTimeout(restoreCursor, 0);
          requestAnimationFrame(restoreCursor);
        }
      },
      [],
    );

    const handleInput = useCallback(() => {
      // Reset the prevent flag after input is processed
      if (shouldPreventInputRef.current) {
        shouldPreventInputRef.current = false;
      }
    }, []);

    const handlePaste = useCallback<ClipboardEventHandler<HTMLSpanElement>>(
      (event) => {
        event.preventDefault();
        let pastedText = event.clipboardData.getData("text");

        // Convert locale decimal separator to '.' for internal storage
        const { decimal } = computeLocaleSeparators();
        if (decimal !== ".") {
          // Replace locale decimal with '.' and also accept '.' as-is
          pastedText = pastedText.replace(new RegExp(`\\${decimal}`, "g"), ".");
        }

        // Validate: only allow digits, optional minus at start, optional single decimal
        if (!/^-?\d*\.?\d*$/.test(pastedText)) {
          return;
        }

        // Should we prevent negative numbers?
        if (!allowNegative && pastedText.startsWith("-")) {
          return;
        }

        // Prevent pasting more than requested decimal scale
        const decimalPart = pastedText.split(".")[1];
        if (
          isNonNullable(decimalScale) &&
          decimalPart &&
          decimalPart.length > decimalScale
        ) {
          if (decimalScale === 0) {
            pastedText = pastedText.slice(0, pastedText.indexOf("."));
          } else {
            pastedText = pastedText.slice(
              0,
              pastedText.indexOf(".") + 1 + decimalScale,
            );
          }
        }

        const selection = window.getSelection();
        const range = selection?.getRangeAt(0);
        if (!range || !spanRef.current) {
          return;
        }

        if (!selection) {
          return;
        }
        const { start: formattedStart, end: formattedEnd } = getSelectionRange(
          spanRef.current,
          selection,
        );
        const start = mapFormattedToRawIndex(
          displayValue,
          formattedDisplayValue,
          formattedStart,
        );
        const end = mapFormattedToRawIndex(
          displayValue,
          formattedDisplayValue,
          formattedEnd,
        );

        // Truncate pasted text if it would exceed maxLength
        if (maxLength !== undefined) {
          const availableLength =
            maxLength - (displayValue.length - (end - start));
          if (availableLength <= 0) {
            return;
          }
          if (pastedText.length > availableLength) {
            pastedText = pastedText.slice(0, availableLength);
          }
        }

        const newText =
          displayValue.slice(0, start) + pastedText + displayValue.slice(end);

        if (/^-?\d*\.?\d*$/.test(newText)) {
          updateValue(newText, start + pastedText.length, start, end);
        }
      },
      [
        decimalScale,
        allowNegative,
        computeLocaleSeparators,
        mapFormattedToRawIndex,
        displayValue,
        formattedDisplayValue,
        maxLength,
        updateValue,
      ],
    );

    useEffect(() => {
      if (autoFocus) {
        spanRef.current?.focus();
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
      <>
        <span
          className={className}
          data-numberflow-input-root={""}
          style={{
            display: "inline-flex",
            ...style,
          }}
        >
          <span
            data-numberflow-input-wrapper={""}
            style={{
              display: "inline-flex",
              overflow: "hidden",
            }}
          >
            <span
              data-testid={dataTestId}
              role="textbox"
              tabIndex={0}
              ref={combineRefs(spanRef, ref)}
              contentEditable={"plaintext-only"}
              inputMode="decimal"
              suppressContentEditableWarning
              onKeyDown={handleKeyDown}
              onBeforeInput={handleBeforeInput}
              onInput={handleInput}
              onCopy={handleCopy}
              onPaste={handlePaste}
              onCut={handleCut}
              onFocus={onFocus}
              onBlur={onBlur}
              data-numberflow-input-contenteditable={""}
              style={{
                display: "inline-block",
              }}
              data-placeholder={placeholder}
            />
            <input
              ref={inputRef}
              {...inputProps}
              type="text"
              inputMode="decimal"
              readOnly
              tabIndex={-1}
              data-numberflow-input-real-input={""}
              value={actualValue?.toString() ?? ""}
              style={{
                height: "1px",
                left: "-9999px",
                opacity: 0,
                pointerEvents: "none",
                position: "absolute",
                width: "1px",
              }}
            />
          </span>
        </span>
      </>
    );
  },
);

NumberFlowInput.displayName = "NumberFlowInput";
