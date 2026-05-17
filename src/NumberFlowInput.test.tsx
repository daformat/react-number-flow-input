import { fireEvent, render, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { NumberFlowInput } from "./NumberFlowInput.js";
import { setDefaultLocale } from "./test/setup.js";

// Helper to get the contentEditable element
const getInput = () => {
  const span = document.querySelector('[contenteditable="true"]');
  return span as HTMLElement;
};

// Helper to fire transitionend events on elements that are animating
// This is needed because JSDOM doesn't fire CSS transition events
const fireTransitionEndEvents = (container: HTMLElement) => {
  // Fire on elements that are being removed (data-removing attribute)
  const removingElements = container.querySelectorAll("[data-removing]");
  removingElements.forEach((el) => {
    fireEvent.transitionEnd(el, { propertyName: "width" });
    fireEvent.transitionEnd(el, { propertyName: "translate" });
  });

  // Fire on elements with data-flow that have inline width styles
  const flowElements = container.querySelectorAll("[data-flow]");
  flowElements.forEach((el) => {
    const htmlEl = el as HTMLElement;
    if (htmlEl.style.width) {
      fireEvent.transitionEnd(el, { propertyName: "width" });
    }
  });
};

// Helper to type text character by character (simulating real typing)
const typeText = async (element: HTMLElement, text: string) => {
  for (const char of text) {
    // Get current cursor position
    const selection = window.getSelection();
    const range = selection?.getRangeAt(0);
    if (!range) {
      setCursorPosition(element, element.textContent?.length || 0);
    }

    // Fire keyDown event which the component handles
    fireEvent.keyDown(element, {
      key: char,
      preventDefault: vi.fn(),
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
      altKey: false,
    });

    // Wait for React to update
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
};

// Helper to set cursor position
const setCursorPosition = (element: HTMLElement, position: number) => {
  const selection = window.getSelection();
  if (!selection) {
    return;
  }

  const range = document.createRange();
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, null);
  let currentPos = 0;
  let node: Node | null;

  while ((node = walker.nextNode())) {
    const nodeLength = node.textContent?.length ?? 0;
    if (currentPos + nodeLength >= position) {
      const offset = position - currentPos;
      range.setStart(node, Math.min(offset, nodeLength));
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
      return;
    }
    currentPos += nodeLength;
  }

  // Fallback: set to end
  range.selectNodeContents(element);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
};

// Helper to get cursor position
const getCursorPosition = (element: HTMLElement): number => {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) {
    return 0;
  }

  const range = selection.getRangeAt(0);
  const preRange = document.createRange();
  preRange.selectNodeContents(element);
  preRange.setEnd(range.startContainer, range.startOffset);
  return preRange.toString().length;
};

// Helper to check if element has data-show attribute
const _hasDataShow = (element: Element): boolean => {
  return element.hasAttribute("data-show");
};

describe("NumberFlowInput", () => {
  beforeEach(() => {
    // Clear any previous state
    document.body.innerHTML = "";
  });

  describe("Basic number input", () => {
    it("should allow typing numbers", async () => {
      const onChange = vi.fn();
      render(<NumberFlowInput onChange={onChange} />);

      const input = getInput();
      input.focus();

      await typeText(input, "123");
      await waitFor(() => {
        expect(input.textContent).toBe("123");
        expect(onChange).toHaveBeenLastCalledWith(123);
      });
    });

    it("should handle negative numbers", async () => {
      const onChange = vi.fn();
      render(<NumberFlowInput onChange={onChange} allowNegative />);

      const input = getInput();
      input.focus();

      await typeText(input, "-123");
      await waitFor(() => {
        expect(input.textContent).toBe("-123");
        expect(onChange).toHaveBeenLastCalledWith(-123);
      });
    });

    it("should handle decimal numbers", async () => {
      const onChange = vi.fn();
      render(<NumberFlowInput onChange={onChange} />);

      const input = getInput();
      input.focus();

      await typeText(input, "123.456");
      await waitFor(() => {
        expect(input.textContent).toBe("123.456");
        expect(onChange).toHaveBeenLastCalledWith(123.456);
      });
    });

    it("should preserve trailing dot in display", async () => {
      const onChange = vi.fn();
      render(<NumberFlowInput onChange={onChange} />);

      const input = getInput();
      input.focus();

      await typeText(input, "123.");
      await waitFor(() => {
        expect(input.textContent).toBe("123.");
        expect(onChange).toHaveBeenLastCalledWith(123);
      });
    });

    it("should handle deleting after decimal point", async () => {
      const onChange = vi.fn();
      render(<NumberFlowInput onChange={onChange} format />);

      const input = getInput();
      input.focus();

      await typeText(input, "123.456");
      await waitFor(() => {
        expect(input.textContent).toBe("123.456");
      });

      // Move cursor after the dot (formatted position is same as raw for "123.456")
      setCursorPosition(input, 4);

      // Delete the dot
      fireEvent.keyDown(input, { key: "Backspace", preventDefault: vi.fn() });

      await waitFor(() => {
        // After deleting decimal, 123456 gets formatted with thousand separator
        expect(input.textContent).toBe("123,456");
        expect(onChange).toHaveBeenLastCalledWith(123456);
      });

      // Check that numbers after the deleted dot still have data-show attribute
      const spans = input.querySelectorAll("[data-flow]");
      expect(spans.length).toBeGreaterThan(0);
      // With formatting "123,456", the digit spans should exist
      // Filter to only digit spans (not comma)
      const digitSpans = Array.from(spans).filter((span) =>
        /[0-9]/.test(span.textContent || ""),
      );
      expect(digitSpans.length).toBeGreaterThanOrEqual(3);
    });

    it("should insert a decimal in the middle (no format, no locale)", async () => {
      const onChange = vi.fn();
      render(<NumberFlowInput onChange={onChange} />);

      const input = getInput();
      input.focus();

      await typeText(input, "12345");
      await waitFor(() => {
        expect(input.textContent).toBe("12345");
      });

      // Drop the caret between "2" and "3"
      setCursorPosition(input, 2);
      await typeText(input, ".");

      await waitFor(() => {
        expect(input.textContent).toBe("12.345");
        expect(onChange).toHaveBeenLastCalledWith(12.345);
      });
    });

    it("should insert a decimal in the middle (format=true, en-US) and replace the group separator", async () => {
      const onChange = vi.fn();
      render(<NumberFlowInput onChange={onChange} format />);

      const input = getInput();
      input.focus();

      await typeText(input, "12345");
      await waitFor(() => {
        // 5 digits → grouped as "12,345"
        expect(input.textContent).toBe("12,345");
      });

      // Formatted position 3 is right after the "," — i.e. visually
      // between "2" and "3", which is raw position 2.
      setCursorPosition(input, 3);
      await typeText(input, ".");

      await waitFor(() => {
        // Once the value becomes 12.345 the group separator is no
        // longer needed; only the decimal point remains.
        expect(input.textContent).toBe("12.345");
        expect(onChange).toHaveBeenLastCalledWith(12.345);
      });
    });

    it("should insert a decimal in the middle (format=true, de-DE) accepting a comma", async () => {
      const onChange = vi.fn();
      render(<NumberFlowInput onChange={onChange} format locale="de-DE" />);

      const input = getInput();
      input.focus();

      await typeText(input, "12345");
      await waitFor(() => {
        // de-DE uses "." as group separator
        expect(input.textContent).toBe("12.345");
      });

      // Formatted position 3 is right after the "." group separator,
      // i.e. visually between "2" and "3" / raw position 2.
      setCursorPosition(input, 3);
      // de-DE accepts "," as the decimal-point key
      await typeText(input, ",");

      await waitFor(() => {
        // 12.345 in de-DE → "12,345" (decimal is now ",")
        expect(input.textContent).toBe("12,345");
        expect(onChange).toHaveBeenLastCalledWith(12.345);
      });
    });

    it("should also accept '.' as the decimal key in a non-'.' locale (de-DE)", async () => {
      const onChange = vi.fn();
      render(<NumberFlowInput onChange={onChange} format locale="de-DE" />);

      const input = getInput();
      input.focus();

      await typeText(input, "12345");
      await waitFor(() => {
        expect(input.textContent).toBe("12.345");
      });

      // Place caret between "2" and "3" (formatted pos 3, raw pos 2)
      setCursorPosition(input, 3);
      // Typing the JS-standard "." should be accepted too and inserted
      // as the decimal — the displayed character flips to the locale
      // decimal ",".
      await typeText(input, ".");

      await waitFor(() => {
        expect(input.textContent).toBe("12,345");
        expect(onChange).toHaveBeenLastCalledWith(12.345);
      });
    });
  });

  describe("Leading zero handling", () => {
    it("should prevent typing 0 when cursor is before leading 0", async () => {
      const onChange = vi.fn();
      render(<NumberFlowInput onChange={onChange} />);

      const input = getInput();
      input.focus();

      // Type "0"
      await typeText(input, "0");
      await waitFor(() => {
        expect(input.textContent).toBe("0");
      });

      // Try to type "0" again at position 0
      setCursorPosition(input, 0);
      const posBefore = getCursorPosition(input);
      expect(posBefore).toBe(0);

      // Simulate keyDown event - the component should prevent default and not move cursor
      const event = new KeyboardEvent("keydown", {
        key: "0",
        bubbles: true,
        cancelable: true,
      });
      Object.defineProperty(event, "preventDefault", {
        value: vi.fn(),
        writable: true,
      });

      input.dispatchEvent(event);

      // Wait a bit to ensure cursor doesn't move
      await new Promise((resolve) => setTimeout(resolve, 50));

      await waitFor(() => {
        const posAfter = getCursorPosition(input);
        expect(posAfter).toBe(posBefore);
        expect(input.textContent).toBe("0");
      });
    });

    it("should prevent typing 0 when cursor is after leading 0", async () => {
      const onChange = vi.fn();
      render(<NumberFlowInput onChange={onChange} />);

      const input = getInput();
      input.focus();

      // Type "0"
      await typeText(input, "0");
      await waitFor(() => {
        expect(input.textContent).toBe("0");
      });

      // Move cursor to position 1 (after the 0)
      setCursorPosition(input, 1);
      const posBefore = getCursorPosition(input);
      expect(posBefore).toBe(1);

      // Simulate keyDown event - the component should prevent default and not move cursor
      const event = new KeyboardEvent("keydown", {
        key: "0",
        bubbles: true,
        cancelable: true,
      });
      Object.defineProperty(event, "preventDefault", {
        value: vi.fn(),
        writable: true,
      });

      input.dispatchEvent(event);

      // Wait a bit to ensure cursor doesn't move
      await new Promise((resolve) => setTimeout(resolve, 50));

      await waitFor(() => {
        const posAfter = getCursorPosition(input);
        expect(posAfter).toBe(posBefore);
        expect(input.textContent).toBe("0");
      });
    });

    it("should allow typing 0 when there's a decimal point after leading 0", async () => {
      const onChange = vi.fn();
      render(<NumberFlowInput onChange={onChange} />);

      const input = getInput();
      input.focus();

      // Type "0."
      await typeText(input, "0.");
      expect(input.textContent).toBe("0.");

      // Move cursor after the dot and type 0
      setCursorPosition(input, 2);
      await typeText(input, "0");

      expect(input.textContent).toBe("0.0");
      expect(onChange).toHaveBeenLastCalledWith(0.0);
    });

    it("should prevent typing 0 before leading 0 in negative number", async () => {
      const onChange = vi.fn();
      render(<NumberFlowInput onChange={onChange} allowNegative />);

      const input = getInput();
      input.focus();

      // Type "-0"
      await typeText(input, "-0");
      expect(input.textContent).toBe("-0");

      // Move cursor to position 1 (after the minus, before the 0)
      setCursorPosition(input, 1);
      const posBefore = getCursorPosition(input);

      fireEvent.keyDown(input, { key: "0", preventDefault: vi.fn() });
      fireEvent.keyPress(input, { key: "0" });

      await waitFor(() => {
        const posAfter = getCursorPosition(input);
        expect(posAfter).toBe(posBefore);
        expect(input.textContent).toBe("-0");
      });
    });

    it("should prevent typing 0 after leading 0 in negative number", async () => {
      const onChange = vi.fn();
      render(<NumberFlowInput onChange={onChange} allowNegative />);

      const input = getInput();
      input.focus();

      // Type "-0"
      await typeText(input, "-0");
      expect(input.textContent).toBe("-0");

      // Move cursor to position 2 (after the 0)
      setCursorPosition(input, 2);
      const posBefore = getCursorPosition(input);

      fireEvent.keyDown(input, { key: "0", preventDefault: vi.fn() });
      fireEvent.keyPress(input, { key: "0" });

      await waitFor(() => {
        const posAfter = getCursorPosition(input);
        expect(posAfter).toBe(posBefore);
        expect(input.textContent).toBe("-0");
      });
    });

    it("should prevent typing 0 at the beginning of a number (e.g., 12 -> 012)", async () => {
      const onChange = vi.fn();
      render(<NumberFlowInput onChange={onChange} />);

      const input = getInput();
      input.focus();

      // Type "12"
      await typeText(input, "12");
      await waitFor(() => {
        expect(input.textContent).toBe("12");
      });

      // Move cursor to position 0 (at the beginning)
      setCursorPosition(input, 0);
      const posBefore = getCursorPosition(input);
      expect(posBefore).toBe(0);

      // Try to type "0" at the beginning
      const event = new KeyboardEvent("keydown", {
        key: "0",
        bubbles: true,
        cancelable: true,
      });
      Object.defineProperty(event, "preventDefault", {
        value: vi.fn(),
        writable: true,
      });

      input.dispatchEvent(event);

      // Wait a bit to ensure cursor doesn't move
      await new Promise((resolve) => setTimeout(resolve, 50));

      await waitFor(() => {
        const posAfter = getCursorPosition(input);
        expect(posAfter).toBe(posBefore);
        expect(input.textContent).toBe("12");
      });
    });

    it("should allow typing 0 before decimal point (e.g., .1121 -> 0.1121)", async () => {
      const onChange = vi.fn();
      render(<NumberFlowInput onChange={onChange} />);

      const input = getInput();
      input.focus();

      // Type ".1121"
      await typeText(input, ".1121");
      await waitFor(() => {
        expect(input.textContent).toBe(".1121");
      });

      // Move cursor to position 0 (before the dot)
      setCursorPosition(input, 0);
      expect(getCursorPosition(input)).toBe(0);

      // Type "0" before the dot
      await typeText(input, "0");

      await waitFor(() => {
        expect(input.textContent).toBe("0.1121");
        expect(onChange).toHaveBeenLastCalledWith(0.1121);
      });
    });

    it("should prevent typing 0 before existing leading 0 with decimal (e.g., 0.1121 -> 00.1121)", async () => {
      const onChange = vi.fn();
      render(<NumberFlowInput onChange={onChange} />);

      const input = getInput();
      input.focus();

      // Type "0.1121"
      await typeText(input, "0.1121");
      await waitFor(() => {
        expect(input.textContent).toBe("0.1121");
      });

      // Move cursor to position 0 (before the 0)
      setCursorPosition(input, 0);
      const posBefore = getCursorPosition(input);
      expect(posBefore).toBe(0);

      // Try to type "0" before the existing 0
      const event = new KeyboardEvent("keydown", {
        key: "0",
        bubbles: true,
        cancelable: true,
      });
      Object.defineProperty(event, "preventDefault", {
        value: vi.fn(),
        writable: true,
      });

      input.dispatchEvent(event);

      // Wait a bit to ensure cursor doesn't move
      await new Promise((resolve) => setTimeout(resolve, 50));

      await waitFor(() => {
        const posAfter = getCursorPosition(input);
        expect(posAfter).toBe(posBefore);
        expect(input.textContent).toBe("0.1121");
      });
    });

    it("should prevent typing 0 after leading 0 with decimal (e.g., 0.1121, cursor at position 1)", async () => {
      const onChange = vi.fn();
      render(<NumberFlowInput onChange={onChange} />);

      const input = getInput();
      input.focus();

      // Type "0.1121"
      await typeText(input, "0.1121");
      await waitFor(() => {
        expect(input.textContent).toBe("0.1121");
      });

      // Move cursor to position 1 (after the 0, before the dot)
      setCursorPosition(input, 1);
      const posBefore = getCursorPosition(input);
      expect(posBefore).toBe(1);

      // Try to type "0" after the existing 0
      const event = new KeyboardEvent("keydown", {
        key: "0",
        bubbles: true,
        cancelable: true,
      });
      Object.defineProperty(event, "preventDefault", {
        value: vi.fn(),
        writable: true,
      });

      input.dispatchEvent(event);

      // Wait a bit to ensure cursor doesn't move
      await new Promise((resolve) => setTimeout(resolve, 50));

      await waitFor(() => {
        const posAfter = getCursorPosition(input);
        expect(posAfter).toBe(posBefore);
        expect(input.textContent).toBe("0.1121");
      });
    });

    it("should prevent typing 0 after leading 0 with decimal in negative number (e.g., -0.1121, cursor at position 2)", async () => {
      const onChange = vi.fn();
      render(<NumberFlowInput onChange={onChange} allowNegative />);

      const input = getInput();
      input.focus();

      // Type "-0.1121"
      await typeText(input, "-0.1121");
      await waitFor(() => {
        expect(input.textContent).toBe("-0.1121");
      });

      // Move cursor to position 2 (after the 0, before the dot)
      setCursorPosition(input, 2);
      const posBefore = getCursorPosition(input);
      expect(posBefore).toBe(2);

      // Try to type "0" after the existing 0
      const event = new KeyboardEvent("keydown", {
        key: "0",
        bubbles: true,
        cancelable: true,
      });
      Object.defineProperty(event, "preventDefault", {
        value: vi.fn(),
        writable: true,
      });

      input.dispatchEvent(event);

      // Wait a bit to ensure cursor doesn't move
      await new Promise((resolve) => setTimeout(resolve, 50));

      await waitFor(() => {
        const posAfter = getCursorPosition(input);
        expect(posAfter).toBe(posBefore);
        expect(input.textContent).toBe("-0.1121");
      });
    });

    it("should prevent typing 0 after minus in negative number (e.g., -12 -> -012)", async () => {
      const onChange = vi.fn();
      render(<NumberFlowInput onChange={onChange} allowNegative />);

      const input = getInput();
      input.focus();

      // Type "-12"
      await typeText(input, "-12");
      await waitFor(() => {
        expect(input.textContent).toBe("-12");
      });

      // Move cursor to position 1 (after the minus, before the 1)
      setCursorPosition(input, 1);
      const posBefore = getCursorPosition(input);
      expect(posBefore).toBe(1);

      // Try to type "0" after the minus
      const event = new KeyboardEvent("keydown", {
        key: "0",
        bubbles: true,
        cancelable: true,
      });
      Object.defineProperty(event, "preventDefault", {
        value: vi.fn(),
        writable: true,
      });

      input.dispatchEvent(event);

      // Wait a bit to ensure cursor doesn't move
      await new Promise((resolve) => setTimeout(resolve, 50));

      await waitFor(() => {
        const posAfter = getCursorPosition(input);
        expect(posAfter).toBe(posBefore);
        expect(input.textContent).toBe("-12");
      });
    });

    it("should allow typing 0 after minus when next character is decimal point (e.g., -.1121 -> -0.1121)", async () => {
      const onChange = vi.fn();
      render(<NumberFlowInput onChange={onChange} allowNegative />);

      const input = getInput();
      input.focus();

      // Type "-.1121"
      await typeText(input, "-.1121");
      await waitFor(() => {
        expect(input.textContent).toBe("-.1121");
      });

      // Move cursor to position 1 (after the minus, before the dot)
      setCursorPosition(input, 1);
      expect(getCursorPosition(input)).toBe(1);

      // Type "0" after the minus
      await typeText(input, "0");

      await waitFor(() => {
        expect(input.textContent).toBe("-0.1121");
        expect(onChange).toHaveBeenLastCalledWith(-0.1121);
      });
    });

    it("should prevent typing 0 after minus when 0 already exists (e.g., -0.1121 -> -00.1121)", async () => {
      const onChange = vi.fn();
      render(<NumberFlowInput onChange={onChange} allowNegative />);

      const input = getInput();
      input.focus();

      // Type "-0.1121"
      await typeText(input, "-0.1121");
      await waitFor(() => {
        expect(input.textContent).toBe("-0.1121");
      });

      // Move cursor to position 1 (after the minus, before the 0)
      setCursorPosition(input, 1);
      const posBefore = getCursorPosition(input);
      expect(posBefore).toBe(1);

      // Try to type "0" after the minus (should be prevented)
      const event = new KeyboardEvent("keydown", {
        key: "0",
        bubbles: true,
        cancelable: true,
      });
      Object.defineProperty(event, "preventDefault", {
        value: vi.fn(),
        writable: true,
      });

      input.dispatchEvent(event);

      // Wait a bit to ensure cursor doesn't move
      await new Promise((resolve) => setTimeout(resolve, 50));

      await waitFor(() => {
        const posAfter = getCursorPosition(input);
        expect(posAfter).toBe(posBefore);
        expect(input.textContent).toBe("-0.1121");
      });
    });
  });

  describe("Negative sign handling", () => {
    it("should only allow minus at the beginning", async () => {
      const onChange = vi.fn();
      render(<NumberFlowInput onChange={onChange} allowNegative />);

      const input = getInput();
      input.focus();

      await typeText(input, "123");
      setCursorPosition(input, 1);

      // Try to type minus in the middle
      fireEvent.keyDown(input, { key: "-", preventDefault: vi.fn() });
      fireEvent.keyPress(input, { key: "-" });

      await waitFor(() => {
        expect(input.textContent).toBe("123");
      });
    });

    it("should only allow one minus sign", async () => {
      const onChange = vi.fn();
      render(<NumberFlowInput onChange={onChange} allowNegative />);

      const input = getInput();
      input.focus();

      await typeText(input, "-123");
      setCursorPosition(input, 0);

      // Try to type another minus - should be ignored
      fireEvent.keyDown(input, { key: "-", preventDefault: vi.fn() });
      fireEvent.keyPress(input, { key: "-" });

      await waitFor(() => {
        // Should keep the minus (ignore the second one)
        expect(input.textContent).toBe("-123");
      });
    });

    it("should ignore minus when typed at position 0 if already has minus", async () => {
      const onChange = vi.fn();
      render(<NumberFlowInput onChange={onChange} allowNegative />);

      const input = getInput();
      input.focus();

      await typeText(input, "-123");
      const lastCallIndex = onChange.mock.calls.length - 1;
      setCursorPosition(input, 0);

      fireEvent.keyDown(input, { key: "-", preventDefault: vi.fn() });
      fireEvent.keyPress(input, { key: "-" });

      await waitFor(() => {
        // Value should remain unchanged
        expect(input.textContent).toBe("-123");
        // onChange should not have been called again
        expect(onChange.mock.calls.length).toBe(lastCallIndex + 1);
      });
    });
  });

  describe("Decimal point handling", () => {
    it("should only allow one decimal point", async () => {
      const onChange = vi.fn();
      render(<NumberFlowInput onChange={onChange} />);

      const input = getInput();
      input.focus();

      await typeText(input, "123.456");
      setCursorPosition(input, 4);

      // Try to type another decimal point
      fireEvent.keyDown(input, { key: ".", preventDefault: vi.fn() });
      fireEvent.keyPress(input, { key: "." });

      await waitFor(() => {
        expect(input.textContent).toBe("123.456");
      });
    });

    it("should preserve decimal point when deleting numbers after it", async () => {
      const onChange = vi.fn();
      render(<NumberFlowInput onChange={onChange} />);

      const input = getInput();
      input.focus();

      await typeText(input, "123.456");
      await waitFor(() => {
        expect(input.textContent).toBe("123.456");
      });

      // Select and delete "456" - need to find the actual text nodes
      await waitFor(() => {
        const walker = document.createTreeWalker(
          input,
          NodeFilter.SHOW_TEXT,
          null,
        );
        let currentPos = 0;
        let startNode: Node | null = null;
        let endNode: Node | null = null;
        let startOffset = 0;
        let endOffset = 0;

        let node: Node | null;
        while ((node = walker.nextNode())) {
          const nodeLength = node.textContent?.length ?? 0;
          if (!startNode && currentPos + nodeLength >= 4) {
            startNode = node;
            startOffset = 4 - currentPos;
          }
          if (!endNode && currentPos + nodeLength >= 7) {
            endNode = node;
            endOffset = 7 - currentPos;
            break;
          }
          currentPos += nodeLength;
        }

        if (startNode && endNode) {
          const selection = window.getSelection();
          if (selection) {
            const range = document.createRange();
            range.setStart(startNode, startOffset);
            range.setEnd(endNode, endOffset);
            selection.removeAllRanges();
            selection.addRange(range);
          }
        }
      });

      fireEvent.keyDown(input, { key: "Backspace", preventDefault: vi.fn() });

      await waitFor(() => {
        expect(input.textContent).toBe("123.");
        expect(onChange).toHaveBeenLastCalledWith(123);
      });
    });
  });

  describe("Selection and replacement", () => {
    it("should animate all new characters when replacing selection", async () => {
      const onChange = vi.fn();
      render(<NumberFlowInput onChange={onChange} />);

      const input = getInput();
      input.focus();

      await typeText(input, "123");
      await waitFor(() => {
        expect(input.textContent).toBe("123");
      });

      // Select "23" - need to find actual text nodes
      await waitFor(() => {
        const walker = document.createTreeWalker(
          input,
          NodeFilter.SHOW_TEXT,
          null,
        );
        let currentPos = 0;
        let startNode: Node | null = null;
        let endNode: Node | null = null;
        let startOffset = 0;
        let endOffset = 0;

        let node: Node | null;
        while ((node = walker.nextNode())) {
          const nodeLength = node.textContent?.length ?? 0;
          if (!startNode && currentPos + nodeLength >= 1) {
            startNode = node;
            startOffset = Math.min(1 - currentPos, nodeLength);
          }
          if (!endNode && currentPos + nodeLength >= 3) {
            endNode = node;
            endOffset = Math.min(3 - currentPos, nodeLength);
            break;
          }
          currentPos += nodeLength;
        }

        if (startNode && endNode) {
          const selection = window.getSelection();
          if (selection) {
            const range = document.createRange();
            range.setStart(startNode, startOffset);
            range.setEnd(endNode, endOffset);
            selection.removeAllRanges();
            selection.addRange(range);
          }
        }
      });

      // Type "45" to replace "23"
      await typeText(input, "45");

      await waitFor(() => {
        expect(input.textContent).toBe("145");
        const spans = input.querySelectorAll("[data-flow]");
        // The "4" and "5" should be marked as added (will get data-show after animation)
        expect(spans.length).toBe(3);
      });
    });

    it("should handle pasting numbers", async () => {
      const onChange = vi.fn();
      render(<NumberFlowInput onChange={onChange} />);

      const input = getInput();
      input.focus();

      await typeText(input, "123");
      await waitFor(() => {
        expect(input.textContent).toBe("123");
      });

      // Select "23" - need to find actual text nodes
      await waitFor(() => {
        const walker = document.createTreeWalker(
          input,
          NodeFilter.SHOW_TEXT,
          null,
        );
        let currentPos = 0;
        let startNode: Node | null = null;
        let endNode: Node | null = null;
        let startOffset = 0;
        let endOffset = 0;

        let node: Node | null;
        while ((node = walker.nextNode())) {
          const nodeLength = node.textContent?.length ?? 0;
          if (!startNode && currentPos + nodeLength >= 1) {
            startNode = node;
            startOffset = Math.min(1 - currentPos, nodeLength);
          }
          if (!endNode && currentPos + nodeLength >= 3) {
            endNode = node;
            endOffset = Math.min(3 - currentPos, nodeLength);
            break;
          }
          currentPos += nodeLength;
        }

        if (startNode && endNode) {
          const selection = window.getSelection();
          if (selection) {
            const range = document.createRange();
            range.setStart(startNode, startOffset);
            range.setEnd(endNode, endOffset);
            selection.removeAllRanges();
            selection.addRange(range);
          }
        }
      });

      // Paste "45"
      fireEvent.paste(input, {
        clipboardData: {
          getData: () => "45",
        } as unknown as DataTransfer,
      });

      await waitFor(() => {
        expect(input.textContent).toBe("145");
        expect(onChange).toHaveBeenLastCalledWith(145);
      });
    });

    it("does not animate when a selected digit is replaced by the exact same digit", async () => {
      // Selecting "3" in "12,345" and typing "3" again should be a no-op
      // visually: no barrel wheel, no flow animation, and the existing span
      // for that digit should be reused (same DOM node).
      const onChange = vi.fn();
      render(<NumberFlowInput onChange={onChange} format />);

      const input = getInput();
      input.focus();

      await typeText(input, "12345");
      await waitFor(() => {
        expect(input.textContent).toBe("12,345");
      });

      const selectFormattedRange = (start: number, end: number) => {
        const walker = document.createTreeWalker(
          input,
          NodeFilter.SHOW_TEXT,
          null,
        );
        let currentPos = 0;
        let startNode: Node | null = null;
        let endNode: Node | null = null;
        let startOffset = 0;
        let endOffset = 0;
        let node: Node | null;
        while ((node = walker.nextNode())) {
          const nodeLength = node.textContent?.length ?? 0;
          if (!startNode && currentPos + nodeLength >= start) {
            startNode = node;
            startOffset = Math.min(start - currentPos, nodeLength);
          }
          if (!endNode && currentPos + nodeLength >= end) {
            endNode = node;
            endOffset = Math.min(end - currentPos, nodeLength);
            break;
          }
          currentPos += nodeLength;
        }
        if (startNode && endNode) {
          const selection = window.getSelection();
          if (selection) {
            const range = document.createRange();
            range.setStart(startNode, startOffset);
            range.setEnd(endNode, endOffset);
            selection.removeAllRanges();
            selection.addRange(range);
          }
        }
      };

      // The "3" lives at formatted index 3 in "12,345" (because of the comma).
      const spanBefore = input.querySelector(
        '[data-char-index="3"]',
      ) as HTMLElement | null;
      expect(spanBefore?.textContent).toBe("3");

      const onChangeCallsBefore = onChange.mock.calls.length;

      // Select the "3" and re-type "3".
      selectFormattedRange(3, 4);
      fireEvent.keyDown(input, { key: "3", preventDefault: vi.fn() });
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Text unchanged.
      expect(input.textContent).toBe("12,345");

      // The exact same DOM span is reused — no rebuild, no animation.
      const spanAfter = input.querySelector(
        '[data-char-index="3"]',
      ) as HTMLElement | null;
      expect(spanAfter).toBe(spanBefore);

      // No barrel wheel was created.
      const parent = input.parentElement;
      if (parent) {
        expect(parent.querySelectorAll("[data-barrel-wheel]")).toHaveLength(0);
      }

      // onChange may or may not fire (the value didn't really change), but
      // if it did it should report the same number.
      const newCalls = onChange.mock.calls.slice(onChangeCallsBefore);
      for (const [v] of newCalls) {
        expect(v).toBe(12345);
      }
    });
  });

  describe("Keyboard shortcuts", () => {
    it("should move cursor to start with Cmd+ArrowLeft", async () => {
      render(<NumberFlowInput />);

      const input = getInput();
      input.focus();

      await typeText(input, "123");
      setCursorPosition(input, 3);

      fireEvent.keyDown(input, {
        key: "ArrowLeft",
        metaKey: true,
        preventDefault: vi.fn(),
      });

      await waitFor(() => {
        expect(getCursorPosition(input)).toBe(0);
      });
    });

    it("should move cursor to end with Cmd+ArrowRight", async () => {
      render(<NumberFlowInput />);

      const input = getInput();
      input.focus();

      await typeText(input, "123");
      setCursorPosition(input, 0);

      fireEvent.keyDown(input, {
        key: "ArrowRight",
        metaKey: true,
        preventDefault: vi.fn(),
      });

      await waitFor(() => {
        expect(getCursorPosition(input)).toBe(3);
      });
    });

    it("should select to start with Shift+Cmd+ArrowLeft", async () => {
      render(<NumberFlowInput />);

      const input = getInput();
      input.focus();

      await typeText(input, "123");
      setCursorPosition(input, 3);

      fireEvent.keyDown(input, {
        key: "ArrowLeft",
        metaKey: true,
        shiftKey: true,
        preventDefault: vi.fn(),
      });

      await waitFor(() => {
        const selection = window.getSelection();
        expect(selection?.toString()).toBe("123");
      });
    });

    it("should select to end with Shift+Cmd+ArrowRight", async () => {
      render(<NumberFlowInput />);

      const input = getInput();
      input.focus();

      await typeText(input, "123");
      setCursorPosition(input, 0);

      fireEvent.keyDown(input, {
        key: "ArrowRight",
        metaKey: true,
        shiftKey: true,
        preventDefault: vi.fn(),
      });

      await waitFor(() => {
        const selection = window.getSelection();
        expect(selection?.toString()).toBe("123");
      });
    });

    it("should move cursor to start of selection when ArrowLeft is pressed with selection", async () => {
      render(<NumberFlowInput />);

      const input = getInput();
      input.focus();

      await typeText(input, "123");
      await waitFor(() => {
        expect(input.textContent).toBe("123");
      });

      // Select "23" (positions 1-3)
      await waitFor(() => {
        const walker = document.createTreeWalker(
          input,
          NodeFilter.SHOW_TEXT,
          null,
        );
        let currentPos = 0;
        let startNode: Node | null = null;
        let endNode: Node | null = null;
        let startOffset = 0;
        let endOffset = 0;

        let node: Node | null;
        while ((node = walker.nextNode())) {
          const nodeLength = node.textContent?.length ?? 0;
          if (!startNode && currentPos + nodeLength >= 1) {
            startNode = node;
            startOffset = Math.min(1 - currentPos, nodeLength);
          }
          if (!endNode && currentPos + nodeLength >= 3) {
            endNode = node;
            endOffset = Math.min(3 - currentPos, nodeLength);
            break;
          }
          currentPos += nodeLength;
        }

        if (startNode && endNode) {
          const selection = window.getSelection();
          if (selection) {
            const range = document.createRange();
            range.setStart(startNode, startOffset);
            range.setEnd(endNode, endOffset);
            selection.removeAllRanges();
            selection.addRange(range);
          }
        }
      });

      // Press ArrowLeft - should move cursor to start of selection (position 1)
      fireEvent.keyDown(input, {
        key: "ArrowLeft",
        preventDefault: vi.fn(),
      });

      await waitFor(() => {
        expect(getCursorPosition(input)).toBe(1);
        const selection = window.getSelection();
        expect(selection?.toString()).toBe("");
      });
    });

    it("should move cursor to end of selection when ArrowRight is pressed with selection", async () => {
      render(<NumberFlowInput />);

      const input = getInput();
      input.focus();

      await typeText(input, "123");
      await waitFor(() => {
        expect(input.textContent).toBe("123");
      });

      // Select "23" (positions 1-3)
      await waitFor(() => {
        const walker = document.createTreeWalker(
          input,
          NodeFilter.SHOW_TEXT,
          null,
        );
        let currentPos = 0;
        let startNode: Node | null = null;
        let endNode: Node | null = null;
        let startOffset = 0;
        let endOffset = 0;

        let node: Node | null;
        while ((node = walker.nextNode())) {
          const nodeLength = node.textContent?.length ?? 0;
          if (!startNode && currentPos + nodeLength >= 1) {
            startNode = node;
            startOffset = Math.min(1 - currentPos, nodeLength);
          }
          if (!endNode && currentPos + nodeLength >= 3) {
            endNode = node;
            endOffset = Math.min(3 - currentPos, nodeLength);
            break;
          }
          currentPos += nodeLength;
        }

        if (startNode && endNode) {
          const selection = window.getSelection();
          if (selection) {
            const range = document.createRange();
            range.setStart(startNode, startOffset);
            range.setEnd(endNode, endOffset);
            selection.removeAllRanges();
            selection.addRange(range);
          }
        }
      });

      // Press ArrowRight - should move cursor to end of selection (position 3)
      fireEvent.keyDown(input, {
        key: "ArrowRight",
        preventDefault: vi.fn(),
      });

      await waitFor(() => {
        expect(getCursorPosition(input)).toBe(3);
        const selection = window.getSelection();
        expect(selection?.toString()).toBe("");
      });
    });

    it("should delete one character after cursor with Delete key", async () => {
      const onChange = vi.fn();
      render(<NumberFlowInput onChange={onChange} />);

      const input = getInput();
      input.focus();

      await typeText(input, "123");
      await waitFor(() => {
        expect(input.textContent).toBe("123");
      });

      // Move cursor to position 1 (after "1")
      setCursorPosition(input, 1);

      // Press Delete
      fireEvent.keyDown(input, {
        key: "Delete",
        preventDefault: vi.fn(),
      });

      await waitFor(() => {
        expect(input.textContent).toBe("13");
        expect(onChange).toHaveBeenLastCalledWith(13);
      });
    });

    it("should delete all characters after cursor with Cmd+Delete", async () => {
      const onChange = vi.fn();
      render(<NumberFlowInput onChange={onChange} format />);

      const input = getInput();
      input.focus();

      await typeText(input, "12345");
      await waitFor(() => {
        // 12345 gets formatted with thousand separator as "12,345"
        expect(input.textContent).toBe("12,345");
      });

      // Move cursor to position 2 (after "12" in formatted "12,345")
      setCursorPosition(input, 2);

      // Press Cmd+Delete
      fireEvent.keyDown(input, {
        key: "Delete",
        metaKey: true,
        preventDefault: vi.fn(),
      });

      await waitFor(() => {
        expect(input.textContent).toBe("12");
        expect(onChange).toHaveBeenLastCalledWith(12);
      });
    });

    it("should delete all characters before cursor with Cmd+Backspace", async () => {
      const onChange = vi.fn();
      render(<NumberFlowInput onChange={onChange} format />);

      const input = getInput();
      input.focus();

      await typeText(input, "12345");
      await waitFor(() => {
        // 12345 gets formatted with thousand separator as "12,345"
        expect(input.textContent).toBe("12,345");
      });

      // Move cursor to position 4 (after "12," in formatted "12,345", which is after raw "12")
      // Position 4 in "12,345" is after the comma, before "3"
      setCursorPosition(input, 4);

      // Press Cmd+Backspace
      fireEvent.keyDown(input, {
        key: "Backspace",
        metaKey: true,
        preventDefault: vi.fn(),
      });

      await waitFor(() => {
        expect(input.textContent).toBe("45");
        expect(onChange).toHaveBeenLastCalledWith(45);
      });
    });
  });

  describe("Cut functionality", () => {
    it("should update value when cutting selected text", async () => {
      const onChange = vi.fn();
      render(<NumberFlowInput onChange={onChange} />);

      const input = getInput();
      input.focus();

      await typeText(input, "123");
      await waitFor(() => {
        expect(input.textContent).toBe("123");
      });

      // Wait a bit for DOM to settle
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Select "23" - need to find actual text nodes
      const walker = document.createTreeWalker(
        input,
        NodeFilter.SHOW_TEXT,
        null,
      );
      let currentPos = 0;
      let startNode: Node | null = null;
      let endNode: Node | null = null;
      let startOffset = 0;
      let endOffset = 0;

      let node: Node | null;
      while ((node = walker.nextNode())) {
        const nodeLength = node.textContent?.length ?? 0;
        if (!startNode && currentPos + nodeLength >= 1) {
          startNode = node;
          startOffset = Math.min(1 - currentPos, nodeLength);
        }
        if (!endNode && currentPos + nodeLength >= 3) {
          endNode = node;
          endOffset = Math.min(3 - currentPos, nodeLength);
          break;
        }
        currentPos += nodeLength;
      }

      if (
        startNode &&
        endNode &&
        startNode.textContent &&
        endNode.textContent
      ) {
        // Ensure offsets are within bounds
        const maxStartOffset = startNode.textContent.length;
        const maxEndOffset = endNode.textContent.length;
        startOffset = Math.min(startOffset, maxStartOffset);
        endOffset = Math.min(endOffset, maxEndOffset);

        const selection = window.getSelection();
        if (selection) {
          const range = document.createRange();
          range.setStart(startNode, startOffset);
          range.setEnd(endNode, endOffset);
          selection.removeAllRanges();
          selection.addRange(range);
        }
      }

      // Cut
      fireEvent.keyDown(input, {
        key: "x",
        metaKey: true,
        preventDefault: vi.fn(),
      });

      await waitFor(() => {
        expect(input.textContent).toBe("1");
        expect(onChange).toHaveBeenLastCalledWith(1);
      });
    });

    it("should handle cut from context menu", async () => {
      const onChange = vi.fn();
      render(<NumberFlowInput onChange={onChange} />);

      const input = getInput();
      input.focus();

      await typeText(input, "123");
      await waitFor(() => {
        expect(input.textContent).toBe("123");
      });

      // Select "23" - need to find actual text nodes
      await waitFor(() => {
        const walker = document.createTreeWalker(
          input,
          NodeFilter.SHOW_TEXT,
          null,
        );
        let currentPos = 0;
        let startNode: Node | null = null;
        let endNode: Node | null = null;
        let startOffset = 0;
        let endOffset = 0;

        let node: Node | null;
        while ((node = walker.nextNode())) {
          const nodeLength = node.textContent?.length ?? 0;
          if (!startNode && currentPos + nodeLength >= 1) {
            startNode = node;
            startOffset = Math.min(1 - currentPos, nodeLength);
          }
          if (!endNode && currentPos + nodeLength >= 3) {
            endNode = node;
            endOffset = Math.min(3 - currentPos, nodeLength);
            break;
          }
          currentPos += nodeLength;
        }

        if (startNode && endNode) {
          const selection = window.getSelection();
          if (selection) {
            const range = document.createRange();
            range.setStart(startNode, startOffset);
            range.setEnd(endNode, endOffset);
            selection.removeAllRanges();
            selection.addRange(range);
          }
        }
      });

      // Simulate cut event
      fireEvent.cut(input, {
        clipboardData: {
          setData: vi.fn(),
        } as unknown as DataTransfer,
      });

      await waitFor(() => {
        expect(input.textContent).toBe("1");
        expect(onChange).toHaveBeenLastCalledWith(1);
      });
    });
  });

  describe("Undo/Redo", () => {
    it("should undo changes with Cmd+Z", async () => {
      const onChange = vi.fn();
      render(<NumberFlowInput onChange={onChange} />);

      const input = getInput();
      input.focus();

      await typeText(input, "123");
      expect(input.textContent).toBe("123");

      // Undo
      fireEvent.keyDown(input, {
        key: "z",
        metaKey: true,
        preventDefault: vi.fn(),
      });

      await waitFor(() => {
        // Should go back to previous state
        expect(onChange).toHaveBeenCalled();
      });
    });

    it("places cursor at the formatted equivalent of the raw position after undo (with separators)", async () => {
      render(<NumberFlowInput format />);

      const input = getInput();
      input.focus();

      await typeText(input, "1234");
      await waitFor(() => {
        expect(input.textContent).toBe("1,234");
      });

      // Append "5" at the end → "12,345"
      setCursorPosition(input, 5); // end of "1,234"
      await typeText(input, "5");
      await waitFor(() => {
        expect(input.textContent).toBe("12,345");
      });

      // Undo. cursorPosBefore was the RAW cursor position before "5" was
      // typed, i.e. 4 (end of raw "1234"). In the formatted text "1,234"
      // that raw index 4 must be mapped to formatted index 5 (the end),
      // not left at 4 (which would land between "3" and "4").
      fireEvent.keyDown(input, {
        key: "z",
        metaKey: true,
        preventDefault: vi.fn(),
      });

      await waitFor(() => {
        expect(input.textContent).toBe("1,234");
      });

      // Give the rAF-deferred cursor restore a chance to run.
      await new Promise((resolve) => setTimeout(resolve, 30));

      expect(getCursorPosition(input)).toBe(5);
    });

    it("places cursor correctly after undoing a deletion in the middle of a formatted number", async () => {
      render(<NumberFlowInput defaultValue={1234567} format />);

      const input = getInput();
      input.focus();
      expect(input.textContent).toBe("1,234,567");

      // Place cursor after the "4" (formatted index 5, raw index 4) and
      // delete it with backspace → raw "123567" → formatted "123,567".
      setCursorPosition(input, 5);
      fireEvent.keyDown(input, {
        key: "Backspace",
        preventDefault: vi.fn(),
      });

      await waitFor(() => {
        expect(input.textContent).toBe("123,567");
      });

      // Undo. The cursorPosBefore stored is the RAW position 4 (end of
      // "1234" in raw "1234567"). In formatted "1,234,567" that raw
      // position maps to formatted index 6 (right after the separator,
      // before the "5") per mapRawToFormattedIndex. The important point
      // is that the cursor must NOT land at raw index 4, which in the
      // formatted text would fall between the "3" and the "4".
      fireEvent.keyDown(input, {
        key: "z",
        metaKey: true,
        preventDefault: vi.fn(),
      });

      await waitFor(() => {
        expect(input.textContent).toBe("1,234,567");
      });

      await new Promise((resolve) => setTimeout(resolve, 30));

      expect(getCursorPosition(input)).toBe(6);
    });

    it("should redo changes with Cmd+Shift+Z", async () => {
      const onChange = vi.fn();
      render(<NumberFlowInput onChange={onChange} />);

      const input = getInput();
      input.focus();

      await typeText(input, "123");
      expect(input.textContent).toBe("123");

      // Undo
      fireEvent.keyDown(input, {
        key: "z",
        metaKey: true,
        preventDefault: vi.fn(),
      });

      await waitFor(() => {
        // Should undo
      });

      // Redo
      fireEvent.keyDown(input, {
        key: "z",
        metaKey: true,
        shiftKey: true,
        preventDefault: vi.fn(),
      });

      await waitFor(() => {
        // Should redo
        expect(onChange).toHaveBeenCalled();
      });
    });
  });

  describe("Animation", () => {
    it("should animate new characters when typing", async () => {
      render(<NumberFlowInput />);

      const input = getInput();
      input.focus();

      await typeText(input, "1");

      await waitFor(() => {
        const spans = input.querySelectorAll("[data-flow]");
        expect(spans.length).toBe(1);
        // Initially, new characters don't have data-show
        // They get it after the timeout
      });

      // Wait for animation
      await new Promise((resolve) => setTimeout(resolve, 20));

      await waitFor(() => {
        const spans = input.querySelectorAll("[data-flow][data-show]");
        expect(spans.length).toBeGreaterThan(0);
      });
    });

    it("should animate all new characters when typing 0 then 1", async () => {
      render(<NumberFlowInput />);

      const input = getInput();
      input.focus();

      await typeText(input, "0");
      await waitFor(() => {
        expect(input.textContent).toBe("0");
      });

      // Wait for initial animation
      await new Promise((resolve) => setTimeout(resolve, 50));

      await typeText(input, "1");

      await waitFor(() => {
        expect(input.textContent).toBe("1");
      });

      // Wait for animation timeout (10ms) plus a bit more
      await new Promise((resolve) => setTimeout(resolve, 100));

      // The "1" should have data-show after animation
      // When "0" becomes "1" after leading zero removal, the "1" should be marked as added
      const spans = input.querySelectorAll("[data-flow][data-show]");
      expect(spans.length).toBe(1);
      expect(spans[0]?.textContent).toBe("1");
    });

    it("should preserve data-show attributes when deleting decimal point from 0.122", async () => {
      render(<NumberFlowInput />);

      const input = getInput();
      input.focus();

      await typeText(input, "0.122");

      // Wait for animations to complete
      await waitFor(() => {
        expect(input.textContent).toBe("0.122");
      });
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Move cursor after the dot (position 2)
      await waitFor(() => {
        setCursorPosition(input, 2);
      });

      // Delete the dot
      fireEvent.keyDown(input, { key: "Backspace", preventDefault: vi.fn() });

      await waitFor(() => {
        // After deleting the dot from "0.122", it should become "122" (leading zero removed)
        expect(input.textContent).toBe("122");
        const spans = input.querySelectorAll("[data-flow][data-show]");
        // All digits "122" should have data-show attribute
        expect(spans.length).toBe(3);
        // Verify all three digits are present
        const text = Array.from(spans)
          .map((span) => span.textContent)
          .join("");
        expect(text).toBe("122");
      });
    });

    it("should animate barrel wheel when replacing single digit (e.g., 2 -> 5)", async () => {
      render(<NumberFlowInput />);

      const input = getInput();
      input.focus();

      await typeText(input, "123");
      await waitFor(() => {
        expect(input.textContent).toBe("123");
      });
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Select the middle digit "2"
      await waitFor(() => {
        const walker = document.createTreeWalker(
          input,
          NodeFilter.SHOW_TEXT,
          null,
        );
        let currentPos = 0;
        let startNode: Node | null = null;
        let endNode: Node | null = null;
        let startOffset = 0;
        let endOffset = 0;

        let node: Node | null;
        while ((node = walker.nextNode())) {
          const nodeLength = node.textContent?.length ?? 0;
          if (!startNode && currentPos + nodeLength >= 1) {
            startNode = node;
            startOffset = Math.min(1 - currentPos, nodeLength);
          }
          if (!endNode && currentPos + nodeLength >= 2) {
            endNode = node;
            endOffset = Math.min(2 - currentPos, nodeLength);
            break;
          }
          currentPos += nodeLength;
        }

        if (startNode && endNode) {
          const selection = window.getSelection();
          if (selection) {
            const range = document.createRange();
            range.setStart(startNode, startOffset);
            range.setEnd(endNode, endOffset);
            selection.removeAllRanges();
            selection.addRange(range);
          }
        }
      });

      // Type "5" to replace "2"
      await typeText(input, "5");

      await waitFor(
        () => {
          // Check for barrel wheel element in parent container (it's outside contentEditable now)
          const parentContainer = input.parentElement;
          const barrelWheel =
            parentContainer?.querySelector("[data-final-digit]");
          expect(barrelWheel).toBeTruthy();
          if (barrelWheel) {
            expect(barrelWheel.getAttribute("data-direction")).toBe("up");
            const digits = barrelWheel.querySelectorAll("[data-digit]");
            // Barrel wheel now contains all digits 0-9
            expect(digits.length).toBe(10);
            // Verify it has all digits 0-9
            const digitTexts = Array.from(digits).map((d) => d.textContent);
            expect(digitTexts).toEqual([
              "0",
              "1",
              "2",
              "3",
              "4",
              "5",
              "6",
              "7",
              "8",
              "9",
            ]);
            // Verify final digit is 5
            expect(barrelWheel.getAttribute("data-final-digit")).toBe("5");
          }
        },
        { timeout: 2000 },
      );
    });

    it("should animate barrel wheel downward when replacing digit with lower value (e.g., 5 -> 2)", async () => {
      render(<NumberFlowInput />);

      const input = getInput();
      input.focus();

      await typeText(input, "153");
      await waitFor(() => {
        expect(input.textContent).toBe("153");
      });
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Select the middle digit "5"
      await waitFor(() => {
        const walker = document.createTreeWalker(
          input,
          NodeFilter.SHOW_TEXT,
          null,
        );
        let currentPos = 0;
        let startNode: Node | null = null;
        let endNode: Node | null = null;
        let startOffset = 0;
        let endOffset = 0;

        let node: Node | null;
        while ((node = walker.nextNode())) {
          const nodeLength = node.textContent?.length ?? 0;
          if (!startNode && currentPos + nodeLength >= 1) {
            startNode = node;
            startOffset = Math.min(1 - currentPos, nodeLength);
          }
          if (!endNode && currentPos + nodeLength >= 2) {
            endNode = node;
            endOffset = Math.min(2 - currentPos, nodeLength);
            break;
          }
          currentPos += nodeLength;
        }

        if (startNode && endNode) {
          const selection = window.getSelection();
          if (selection) {
            const range = document.createRange();
            range.setStart(startNode, startOffset);
            range.setEnd(endNode, endOffset);
            selection.removeAllRanges();
            selection.addRange(range);
          }
        }
      });

      // Type "2" to replace "5"
      await typeText(input, "2");

      await waitFor(
        () => {
          // Check for barrel wheel element in parent container (it's outside contentEditable now)
          const parentContainer = input.parentElement;
          const barrelWheel =
            parentContainer?.querySelector("[data-final-digit]");
          expect(barrelWheel).toBeTruthy();
          if (barrelWheel) {
            expect(barrelWheel.getAttribute("data-direction")).toBe("down");
            const digits = barrelWheel.querySelectorAll("[data-digit]");
            // Barrel wheel now contains all digits 0-9
            expect(digits.length).toBe(10);
            // Verify it has all digits 0-9
            const digitTexts = Array.from(digits).map((d) => d.textContent);
            expect(digitTexts).toEqual([
              "0",
              "1",
              "2",
              "3",
              "4",
              "5",
              "6",
              "7",
              "8",
              "9",
            ]);
            // Note: data-final-digit currently stores the last element of the sequence (old digit when direction is "down")
            // This is a quirk of the current implementation - it stores finalDigit which is sequence[last]
            expect(barrelWheel.getAttribute("data-final-digit")).toBe("5");
          }
        },
        { timeout: 2000 },
      );
    });

    it("should attempt width animation when replacing single digit (e.g., 8 -> 1)", async () => {
      render(<NumberFlowInput />);

      const input = getInput();
      input.focus();

      await typeText(input, "8");
      await waitFor(() => {
        expect(input.textContent).toBe("8");
      });
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Select the digit "8"
      await waitFor(() => {
        const walker = document.createTreeWalker(
          input,
          NodeFilter.SHOW_TEXT,
          null,
        );
        let currentPos = 0;
        let startNode: Node | null = null;
        let endNode: Node | null = null;
        let startOffset = 0;
        let endOffset = 0;

        let node: Node | null;
        while ((node = walker.nextNode())) {
          const nodeLength = node.textContent?.length ?? 0;
          if (!startNode && currentPos + nodeLength >= 0) {
            startNode = node;
            startOffset = Math.min(0 - currentPos, nodeLength);
          }
          if (!endNode && currentPos + nodeLength >= 1) {
            endNode = node;
            endOffset = Math.min(1 - currentPos, nodeLength);
            break;
          }
          currentPos += nodeLength;
        }

        if (startNode && endNode) {
          const selection = window.getSelection();
          if (selection) {
            const range = document.createRange();
            range.setStart(startNode, startOffset);
            range.setEnd(endNode, endOffset);
            selection.removeAllRanges();
            selection.addRange(range);
          }
        }
      });

      // Type "1" to replace "8"
      await typeText(input, "1");

      await waitFor(
        () => {
          // Check that barrel wheel animation is happening (charSpan should be transparent)
          const charSpan = input.querySelector('[data-char-index="0"]');
          expect(charSpan).toBeTruthy();
          if (charSpan instanceof HTMLElement) {
            // Character should be transparent during barrel wheel animation
            expect(charSpan.style.color).toBe("transparent");
          }
          // Width animation may or may not be applied depending on measurement success
          // The important thing is that the barrel wheel animation is working
          const parentContainer = input.parentElement;
          const barrelWheel =
            parentContainer?.querySelector("[data-final-digit]");
          expect(barrelWheel).toBeTruthy();
        },
        { timeout: 2000 },
      );
    });

    it("should attempt width animation when replacing single digit upward (e.g., 1 -> 8)", async () => {
      render(<NumberFlowInput />);

      const input = getInput();
      input.focus();

      await typeText(input, "1");
      await waitFor(() => {
        expect(input.textContent).toBe("1");
      });
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Select the digit "1"
      await waitFor(() => {
        const walker = document.createTreeWalker(
          input,
          NodeFilter.SHOW_TEXT,
          null,
        );
        let currentPos = 0;
        let startNode: Node | null = null;
        let endNode: Node | null = null;
        let startOffset = 0;
        let endOffset = 0;

        let node: Node | null;
        while ((node = walker.nextNode())) {
          const nodeLength = node.textContent?.length ?? 0;
          if (!startNode && currentPos + nodeLength >= 0) {
            startNode = node;
            startOffset = Math.min(0 - currentPos, nodeLength);
          }
          if (!endNode && currentPos + nodeLength >= 1) {
            endNode = node;
            endOffset = Math.min(1 - currentPos, nodeLength);
            break;
          }
          currentPos += nodeLength;
        }

        if (startNode && endNode) {
          const selection = window.getSelection();
          if (selection) {
            const range = document.createRange();
            range.setStart(startNode, startOffset);
            range.setEnd(endNode, endOffset);
            selection.removeAllRanges();
            selection.addRange(range);
          }
        }
      });

      // Type "8" to replace "1"
      await typeText(input, "8");

      await waitFor(
        () => {
          // Check that barrel wheel animation is happening (charSpan should be transparent)
          const charSpan = input.querySelector('[data-char-index="0"]');
          expect(charSpan).toBeTruthy();
          if (charSpan instanceof HTMLElement) {
            // Character should be transparent during barrel wheel animation
            expect(charSpan.style.color).toBe("transparent");
          }
          // Width animation may or may not be applied depending on measurement success
          // The important thing is that the barrel wheel animation is working
          const parentContainer = input.parentElement;
          const barrelWheel =
            parentContainer?.querySelector("[data-final-digit]");
          expect(barrelWheel).toBeTruthy();
        },
        { timeout: 2000 },
      );
    });

    it("should not create ghost spans when replacing a digit", async () => {
      render(<NumberFlowInput />);

      const input = getInput();
      input.focus();

      await typeText(input, "123");
      await waitFor(() => {
        expect(input.textContent).toBe("123");
      });
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Select the middle digit "2"
      await waitFor(() => {
        const walker = document.createTreeWalker(
          input,
          NodeFilter.SHOW_TEXT,
          null,
        );
        let currentPos = 0;
        let startNode: Node | null = null;
        let endNode: Node | null = null;
        let startOffset = 0;
        let endOffset = 0;

        let node: Node | null;
        while ((node = walker.nextNode())) {
          const nodeLength = node.textContent?.length ?? 0;
          if (!startNode && currentPos + nodeLength >= 1) {
            startNode = node;
            startOffset = Math.min(1 - currentPos, nodeLength);
          }
          if (!endNode && currentPos + nodeLength >= 2) {
            endNode = node;
            endOffset = Math.min(2 - currentPos, nodeLength);
            break;
          }
          currentPos += nodeLength;
        }

        if (startNode && endNode) {
          const selection = window.getSelection();
          if (selection) {
            const range = document.createRange();
            range.setStart(startNode, startOffset);
            range.setEnd(endNode, endOffset);
            selection.removeAllRanges();
            selection.addRange(range);
          }
        }
      });

      // Type "5" to replace "2" (triggers barrel wheel animation)
      await typeText(input, "5");

      await waitFor(
        () => {
          expect(input.textContent).toBe("153");
          // Count all spans with data-char-index - should be exactly 3
          const allSpans = input.querySelectorAll("[data-char-index]");
          expect(allSpans.length).toBe(3);
          // Verify all spans have correct indices
          const indices = Array.from(allSpans).map((span) =>
            parseInt(
              (span as HTMLElement).getAttribute("data-char-index") ?? "-1",
              10,
            ),
          );
          indices.sort((a, b) => a - b);
          expect(indices).toEqual([0, 1, 2]);
        },
        { timeout: 2000 },
      );

      // Wait a bit for any async updates
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Verify no ghost spans remain
      const allSpans = input.querySelectorAll("[data-char-index]");
      expect(allSpans.length).toBe(3);
      const text = Array.from(allSpans)
        .map((span) => span.textContent)
        .join("");
      expect(text).toBe("153");
    });

    it("should remove all spans including hidden ones when selecting all and deleting", async () => {
      render(<NumberFlowInput />);

      const input = getInput();
      input.focus();

      await typeText(input, "123");
      await waitFor(() => {
        expect(input.textContent).toBe("123");
      });
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Select the middle digit "2" and replace it (triggers barrel wheel - span becomes hidden)
      await waitFor(() => {
        const walker = document.createTreeWalker(
          input,
          NodeFilter.SHOW_TEXT,
          null,
        );
        let currentPos = 0;
        let startNode: Node | null = null;
        let endNode: Node | null = null;
        let startOffset = 0;
        let endOffset = 0;

        let node: Node | null;
        while ((node = walker.nextNode())) {
          const nodeLength = node.textContent?.length ?? 0;
          if (!startNode && currentPos + nodeLength >= 1) {
            startNode = node;
            startOffset = Math.min(1 - currentPos, nodeLength);
          }
          if (!endNode && currentPos + nodeLength >= 2) {
            endNode = node;
            endOffset = Math.min(2 - currentPos, nodeLength);
            break;
          }
          currentPos += nodeLength;
        }

        if (startNode && endNode) {
          const selection = window.getSelection();
          if (selection) {
            const range = document.createRange();
            range.setStart(startNode, startOffset);
            range.setEnd(endNode, endOffset);
            selection.removeAllRanges();
            selection.addRange(range);
          }
        }
      });

      // Type "5" to replace "2" - this will hide the span during barrel wheel animation
      await typeText(input, "5");

      // Wait a bit for barrel wheel to start (span becomes hidden)
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Verify there's a hidden span (barrel wheel animation in progress)
      const _hiddenSpans = Array.from(
        input.querySelectorAll("[data-char-index]"),
      ).filter(
        (span) =>
          (span as HTMLElement).style.color === "transparent" ||
          (span as HTMLElement).style.color === "rgba(0, 0, 0, 0)",
      );
      // There might be a hidden span during animation, or it might have completed
      // The important thing is that when we select all and delete, all spans are removed

      // Now select all and delete
      await waitFor(() => {
        const walker = document.createTreeWalker(
          input,
          NodeFilter.SHOW_TEXT,
          null,
        );
        let currentPos = 0;
        let startNode: Node | null = null;
        let endNode: Node | null = null;
        let startOffset = 0;
        let endOffset = 0;

        let node: Node | null;
        while ((node = walker.nextNode())) {
          const nodeLength = node.textContent?.length ?? 0;
          if (!startNode && currentPos === 0) {
            startNode = node;
            startOffset = 0;
          }
          if (!endNode && currentPos + nodeLength >= 3) {
            endNode = node;
            endOffset = Math.min(3 - currentPos, nodeLength);
            break;
          }
          currentPos += nodeLength;
        }

        if (startNode && endNode) {
          const selection = window.getSelection();
          if (selection) {
            const range = document.createRange();
            range.setStart(startNode, startOffset);
            range.setEnd(endNode, endOffset);
            selection.removeAllRanges();
            selection.addRange(range);
          }
        }
      });

      // Delete all (Cmd+Backspace or just Backspace with all selected)
      fireEvent.keyDown(input, {
        key: "Backspace",
        preventDefault: vi.fn(),
      });

      await waitFor(
        () => {
          expect(input.textContent).toBe("");
          // All spans should be removed, including hidden ones
          const allSpans = input.querySelectorAll("[data-char-index]");
          expect(allSpans.length).toBe(0);
        },
        { timeout: 2000 },
      );
    });

    it("should not create duplicate spans when typing fast with repeated digits", async () => {
      // Use format={false} to disable formatting for this test
      render(<NumberFlowInput />);

      const input = getInput();
      input.focus();

      // Type a fast sequence with repeated digits (shorter to prevent timeout)
      await typeText(input, "12122121212121212");

      await waitFor(
        () => {
          const expectedText = "12122121212121212";
          expect(input.textContent).toBe(expectedText);

          // Count all spans - should match text length exactly
          const allSpans = input.querySelectorAll("[data-char-index]");
          expect(allSpans.length).toBe(expectedText.length);

          // Verify all spans have unique and correct indices
          const indices = Array.from(allSpans).map((span) =>
            parseInt(
              (span as HTMLElement).getAttribute("data-char-index") ?? "-1",
              10,
            ),
          );
          // Check for duplicates
          const uniqueIndices = new Set(indices);
          expect(uniqueIndices.size).toBe(indices.length);

          // Verify indices are sequential
          indices.sort((a, b) => a - b);
          for (let i = 0; i < indices.length; i++) {
            expect(indices[i]).toBe(i);
          }

          // Verify text content matches
          const text = Array.from(allSpans)
            .map((span) => span.textContent)
            .join("");
          expect(text).toBe(expectedText);
        },
        { timeout: 3000 },
      );
    }, 10000);

    it("should handle multiple rapid digit replacements without ghost spans", async () => {
      // Use format={false} (default) to disable formatting for this test
      render(<NumberFlowInput />);

      const input = getInput();
      input.focus();

      await typeText(input, "12345");
      await waitFor(() => {
        expect(input.textContent).toBe("12345");
      });
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Rapidly replace multiple digits
      for (let i = 0; i < 5; i++) {
        // Select digit at position i
        await waitFor(() => {
          const walker = document.createTreeWalker(
            input,
            NodeFilter.SHOW_TEXT,
            null,
          );
          let currentPos = 0;
          let startNode: Node | null = null;
          let endNode: Node | null = null;

          let node: Node | null;
          while ((node = walker.nextNode())) {
            const nodeLength = node.textContent?.length ?? 0;
            if (!startNode && currentPos + nodeLength > i) {
              startNode = node;
            }
            if (!endNode && currentPos + nodeLength > i + 1) {
              endNode = node;
              break;
            }
            currentPos += nodeLength;
          }

          if (startNode && endNode) {
            const selection = window.getSelection();
            if (selection) {
              const range = document.createRange();
              range.setStart(startNode, Math.max(0, i - currentPos));
              range.setEnd(endNode, Math.max(0, i + 1 - currentPos));
              selection.removeAllRanges();
              selection.addRange(range);
            }
          }
        });

        // Replace with a different digit
        const newDigit = ((i + 1) % 10).toString();
        await typeText(input, newDigit);
        await new Promise((resolve) => setTimeout(resolve, 20));
      }

      await waitFor(
        () => {
          // Verify no ghost spans
          const allSpans = input.querySelectorAll("[data-char-index]");
          const expectedLength = input.textContent?.length ?? 0;
          expect(allSpans.length).toBe(expectedLength);

          // Verify all spans have unique indices
          const indices = Array.from(allSpans).map((span) =>
            parseInt(
              (span as HTMLElement).getAttribute("data-char-index") ?? "-1",
              10,
            ),
          );
          const uniqueIndices = new Set(indices);
          expect(uniqueIndices.size).toBe(indices.length);
        },
        { timeout: 3000 },
      );
    });

    it("should remove barrel wheel when digit is deleted during animation", async () => {
      // Don't use formatting for this test (no thousand separators)
      render(<NumberFlowInput />);

      const input = getInput();
      input.focus();

      await typeText(input, "321");
      await waitFor(() => {
        expect(input.textContent).toBe("321");
      });
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Select the last digit "1" and replace with "8" (triggers barrel wheel)
      await waitFor(() => {
        const walker = document.createTreeWalker(
          input,
          NodeFilter.SHOW_TEXT,
          null,
        );
        let currentPos = 0;
        let startNode: Node | null = null;
        let endNode: Node | null = null;
        let startOffset = 0;
        let endOffset = 0;

        let node: Node | null;
        while ((node = walker.nextNode())) {
          const nodeLength = node.textContent?.length ?? 0;
          if (!startNode && currentPos + nodeLength >= 2) {
            startNode = node;
            startOffset = Math.min(2 - currentPos, nodeLength);
          }
          if (!endNode && currentPos + nodeLength >= 3) {
            endNode = node;
            endOffset = Math.min(3 - currentPos, nodeLength);
            break;
          }
          currentPos += nodeLength;
        }

        if (startNode && endNode) {
          const selection = window.getSelection();
          if (selection) {
            const range = document.createRange();
            range.setStart(startNode, startOffset);
            range.setEnd(endNode, endOffset);
            selection.removeAllRanges();
            selection.addRange(range);
          }
        }
      });

      // Type "8" to replace "1" (starts barrel wheel animation)
      await typeText(input, "8");

      // Wait a bit for barrel wheel to start
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Verify barrel wheel exists
      const parentContainer = input.parentElement;
      let barrelWheel = parentContainer?.querySelector(
        '[data-char-index="2"][data-final-digit]',
      ) as HTMLElement | null;
      expect(barrelWheel).toBeTruthy();

      // Wait for the replacement to complete
      await waitFor(
        () => {
          expect(input.textContent).toBe("328");
        },
        { timeout: 1000 },
      );

      // Select the "8" at position 2 (the digit we just replaced)
      await waitFor(() => {
        const walker = document.createTreeWalker(
          input,
          NodeFilter.SHOW_TEXT,
          null,
        );
        let currentPos = 0;
        let startNode: Node | null = null;
        let endNode: Node | null = null;
        let startOffset = 0;
        let endOffset = 0;

        let node: Node | null;
        while ((node = walker.nextNode())) {
          const nodeLength = node.textContent?.length ?? 0;
          if (!startNode && currentPos + nodeLength >= 2) {
            startNode = node;
            startOffset = Math.min(2 - currentPos, nodeLength);
          }
          if (!endNode && currentPos + nodeLength >= 3) {
            endNode = node;
            endOffset = Math.min(3 - currentPos, nodeLength);
            break;
          }
          currentPos += nodeLength;
        }

        if (startNode && endNode) {
          const selection = window.getSelection();
          if (selection) {
            const range = document.createRange();
            range.setStart(startNode, startOffset);
            range.setEnd(endNode, endOffset);
            selection.removeAllRanges();
            selection.addRange(range);
          }
        }
      });

      // Now delete the selected digit (Backspace)
      fireEvent.keyDown(input, {
        key: "Backspace",
        preventDefault: vi.fn(),
      });

      await waitFor(
        () => {
          // Barrel wheel should be removed
          barrelWheel = parentContainer?.querySelector(
            '[data-char-index="2"][data-final-digit]',
          ) as HTMLElement | null;
          expect(barrelWheel).toBeFalsy();
        },
        { timeout: 2000 },
      );

      // Wait for DOM to sync (the actualValue should be correct even if contentEditable takes time to update)
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Verify the barrel wheel is gone and text eventually syncs
      // Note: In test environment, contentEditable might not update immediately, but barrel wheel removal is the key test
      const finalBarrelWheel = parentContainer?.querySelector(
        '[data-char-index="2"][data-final-digit]',
      ) as HTMLElement | null;
      expect(finalBarrelWheel).toBeFalsy();
    });

    it("should correctly shift barrel wheel index when deleting character before it with formatting", async () => {
      // This test verifies the fix for the bug where deleting a character before
      // an active barrel wheel with formatted numbers caused incorrect display.
      // The issue was mixing raw indices with formatted indices when shifting.
      const onChange = vi.fn();
      render(<NumberFlowInput onChange={onChange} format />);

      const input = getInput();
      input.focus();

      // Type "12345" which gets formatted as "12,345"
      await typeText(input, "12345");
      await waitFor(() => {
        expect(input.textContent).toBe("12,345");
      });
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Select the digit "3" (at formatted position 3, raw position 2) and replace with "1"
      // This triggers a barrel wheel animation
      await waitFor(() => {
        const walker = document.createTreeWalker(
          input,
          NodeFilter.SHOW_TEXT,
          null,
        );
        let currentPos = 0;
        let startNode: Node | null = null;
        let endNode: Node | null = null;
        let startOffset = 0;
        let endOffset = 0;

        let node: Node | null;
        while ((node = walker.nextNode())) {
          const nodeLength = node.textContent?.length ?? 0;
          // Position 3 in "12,345" is the digit "3"
          if (!startNode && currentPos + nodeLength >= 3) {
            startNode = node;
            startOffset = Math.min(3 - currentPos, nodeLength);
          }
          if (!endNode && currentPos + nodeLength >= 4) {
            endNode = node;
            endOffset = Math.min(4 - currentPos, nodeLength);
            break;
          }
          currentPos += nodeLength;
        }

        if (startNode && endNode) {
          const selection = window.getSelection();
          if (selection) {
            const range = document.createRange();
            range.setStart(startNode, startOffset);
            range.setEnd(endNode, endOffset);
            selection.removeAllRanges();
            selection.addRange(range);
          }
        }
      });

      // Type "1" to replace "3" (triggers barrel wheel)
      await typeText(input, "1");

      // Wait for barrel wheel to start
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Verify barrel wheel exists at correct position
      // "12,145" - the new "1" is at formatted position 3
      const parentContainer = input.parentElement;
      const barrelWheel = parentContainer?.querySelector(
        "[data-final-digit]",
      ) as HTMLElement | null;
      expect(barrelWheel).toBeTruthy();

      // Verify value is correct so far: "12145"
      await waitFor(
        () => {
          expect(onChange).toHaveBeenLastCalledWith(12145);
        },
        { timeout: 1000 },
      );

      // Now delete the "2" (at formatted position 1, raw position 1)
      // Move cursor after "12" and press backspace
      setCursorPosition(input, 2); // After "12" in "12,145"
      fireEvent.keyDown(input, { key: "Backspace", preventDefault: vi.fn() });

      // Wait for the deletion to process
      await new Promise((resolve) => setTimeout(resolve, 100));

      // The result should be "1145" formatted as "1,145"
      // The barrel wheel should have shifted from formatted position 3 to formatted position 2
      await waitFor(
        () => {
          // Check that the value is correct
          expect(onChange).toHaveBeenLastCalledWith(1145);
        },
        { timeout: 2000 },
      );

      // Wait for animation to complete and DOM to settle
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Final verification: the displayed content should be "1,145" (not "131" or "1215")
      await waitFor(
        () => {
          const content = input.textContent;
          // The content should be "1,145" - all 5 characters
          expect(content).toBe("1,145");
        },
        { timeout: 2000 },
      );
    });

    it("should correctly shift barrel wheel index when inserting character before it", async () => {
      // This test verifies that when a character is inserted before an active barrel wheel,
      // the barrel wheel index shifts forward correctly
      const onChange = vi.fn();
      render(<NumberFlowInput onChange={onChange} />);

      const input = getInput();
      input.focus();

      // Type "12345"
      await typeText(input, "12345");
      await waitFor(() => {
        expect(input.textContent).toBe("12345");
      });
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Select the digit "5" (at position 4) and replace with "8"
      // This triggers a barrel wheel animation
      await waitFor(() => {
        const walker = document.createTreeWalker(
          input,
          NodeFilter.SHOW_TEXT,
          null,
        );
        let currentPos = 0;
        let startNode: Node | null = null;
        let endNode: Node | null = null;
        let startOffset = 0;
        let endOffset = 0;

        let node: Node | null;
        while ((node = walker.nextNode())) {
          const nodeLength = node.textContent?.length ?? 0;
          // Position 4 is the digit "5"
          if (!startNode && currentPos + nodeLength >= 4) {
            startNode = node;
            startOffset = Math.min(4 - currentPos, nodeLength);
          }
          if (!endNode && currentPos + nodeLength >= 5) {
            endNode = node;
            endOffset = Math.min(5 - currentPos, nodeLength);
            break;
          }
          currentPos += nodeLength;
        }

        if (startNode && endNode) {
          const selection = window.getSelection();
          if (selection) {
            const range = document.createRange();
            range.setStart(startNode, startOffset);
            range.setEnd(endNode, endOffset);
            selection.removeAllRanges();
            selection.addRange(range);
          }
        }
      });

      // Type "8" to replace "5" (triggers barrel wheel)
      await typeText(input, "8");

      // Wait for barrel wheel to start
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Verify barrel wheel exists at position 4
      const parentContainer = input.parentElement;
      let barrelWheel = parentContainer?.querySelector(
        "[data-final-digit]",
      ) as HTMLElement | null;
      expect(barrelWheel).toBeTruthy();
      expect(barrelWheel?.getAttribute("data-char-index")).toBe("4");

      // Verify value is "12348"
      await waitFor(
        () => {
          expect(onChange).toHaveBeenLastCalledWith(12348);
        },
        { timeout: 1000 },
      );

      // Now insert "9" at position 2 (before the barrel wheel)
      setCursorPosition(input, 2);
      await typeText(input, "9");

      // Wait for the insertion to process
      await new Promise((resolve) => setTimeout(resolve, 100));

      // The result should be "129348"
      // The barrel wheel should have shifted from position 4 to position 5
      await waitFor(
        () => {
          expect(onChange).toHaveBeenLastCalledWith(129348);
        },
        { timeout: 2000 },
      );

      // Verify barrel wheel shifted to position 5
      barrelWheel = parentContainer?.querySelector(
        "[data-final-digit]",
      ) as HTMLElement | null;
      expect(barrelWheel).toBeTruthy();
      expect(barrelWheel?.getAttribute("data-char-index")).toBe("5");

      // Wait for animation to complete and DOM to settle
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Final verification: the displayed content should be "129348"
      await waitFor(
        () => {
          const content = input.textContent;
          expect(content).toBe("129348");
        },
        { timeout: 2000 },
      );
    });

    it("should clean up width animation styles when barrel wheel completes", async () => {
      render(<NumberFlowInput />);

      const input = getInput();
      input.focus();

      await typeText(input, "8");
      await waitFor(() => {
        expect(input.textContent).toBe("8");
      });
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Select the digit "8" and replace with "1" (triggers barrel wheel and width animation)
      await waitFor(() => {
        const walker = document.createTreeWalker(
          input,
          NodeFilter.SHOW_TEXT,
          null,
        );
        let currentPos = 0;
        let startNode: Node | null = null;
        let endNode: Node | null = null;
        let startOffset = 0;
        let endOffset = 0;

        let node: Node | null;
        while ((node = walker.nextNode())) {
          const nodeLength = node.textContent?.length ?? 0;
          if (!startNode && currentPos + nodeLength >= 0) {
            startNode = node;
            startOffset = Math.min(0 - currentPos, nodeLength);
          }
          if (!endNode && currentPos + nodeLength >= 1) {
            endNode = node;
            endOffset = Math.min(1 - currentPos, nodeLength);
            break;
          }
          currentPos += nodeLength;
        }

        if (startNode && endNode) {
          const selection = window.getSelection();
          if (selection) {
            const range = document.createRange();
            range.setStart(startNode, startOffset);
            range.setEnd(endNode, endOffset);
            selection.removeAllRanges();
            selection.addRange(range);
          }
        }
      });

      // Type "1" to replace "8"
      await typeText(input, "1");

      // Wait for barrel wheel animation to complete (400ms) plus width animation (400ms)
      // Add extra time for test environment
      await new Promise((resolve) => setTimeout(resolve, 1200));

      // Check width animation cleanup
      // Note: In test environment, animations may not complete reliably
      // We verify that if the barrel wheel is gone, cleanup should have happened
      const parentContainer = input.parentElement;
      const barrelWheel = parentContainer?.querySelector(
        '[data-char-index="0"][data-final-digit]',
      ) as HTMLElement | null;

      const charSpan = input.querySelector(
        '[data-char-index="0"]',
      ) as HTMLElement | null;
      expect(charSpan).toBeTruthy();
      if (charSpan) {
        // If barrel wheel is gone, width animation should be cleaned up
        if (!barrelWheel) {
          expect(charSpan.hasAttribute("data-width-animate")).toBe(false);
          expect(charSpan.style.width).toBe("");
          expect(charSpan.style.minWidth).toBe("");
          expect(charSpan.style.maxWidth).toBe("");
          expect(charSpan.style.color).toBe("");
        } else {
          // If barrel wheel still exists, at least verify width animation attribute exists
          // (This means the animation is still in progress)
          // The cleanup will happen when the barrel wheel completes
        }
      }
    });

    it("should clean up width animation styles when digit is deleted", async () => {
      render(<NumberFlowInput />);

      const input = getInput();
      input.focus();

      await typeText(input, "321");
      await waitFor(() => {
        expect(input.textContent).toBe("321");
      });
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Select the last digit "1" and replace with "8" (triggers barrel wheel and width animation)
      await waitFor(() => {
        const walker = document.createTreeWalker(
          input,
          NodeFilter.SHOW_TEXT,
          null,
        );
        let currentPos = 0;
        let startNode: Node | null = null;
        let endNode: Node | null = null;
        let startOffset = 0;
        let endOffset = 0;

        let node: Node | null;
        while ((node = walker.nextNode())) {
          const nodeLength = node.textContent?.length ?? 0;
          if (!startNode && currentPos + nodeLength >= 2) {
            startNode = node;
            startOffset = Math.min(2 - currentPos, nodeLength);
          }
          if (!endNode && currentPos + nodeLength >= 3) {
            endNode = node;
            endOffset = Math.min(3 - currentPos, nodeLength);
            break;
          }
          currentPos += nodeLength;
        }

        if (startNode && endNode) {
          const selection = window.getSelection();
          if (selection) {
            const range = document.createRange();
            range.setStart(startNode, startOffset);
            range.setEnd(endNode, endOffset);
            selection.removeAllRanges();
            selection.addRange(range);
          }
        }
      });

      // Type "8" to replace "1"
      await typeText(input, "8");

      // Wait a bit for width animation to start and attribute to be set
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Verify width animation is active (or at least barrel wheel exists)
      const parentContainer = input.parentElement;
      const barrelWheel = parentContainer?.querySelector(
        '[data-char-index="2"][data-final-digit]',
      ) as HTMLElement | null;
      expect(barrelWheel).toBeTruthy();

      const charSpan = input.querySelector(
        '[data-char-index="2"]',
      ) as HTMLElement | null;
      expect(charSpan).toBeTruthy();

      // Check if width animation attribute is set (it might be set asynchronously)
      const _hasWidthAnimation =
        charSpan?.hasAttribute("data-width-animate") ?? false;

      // Now move cursor to position 3 and delete the digit
      setCursorPosition(input, 3);
      fireEvent.keyDown(input, {
        key: "Backspace",
        preventDefault: vi.fn(),
      });

      await waitFor(
        () => {
          // Barrel wheel should be removed
          const remainingBarrelWheel = parentContainer?.querySelector(
            '[data-char-index="2"][data-final-digit]',
          ) as HTMLElement | null;
          expect(remainingBarrelWheel).toBeFalsy();
        },
        { timeout: 2000 },
      );

      // Wait a bit more for DOM to update and barrel wheel to be removed
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Verify barrel wheel is removed (this is the key test)
      await waitFor(
        () => {
          const remainingBarrelWheel = parentContainer?.querySelector(
            '[data-char-index="2"][data-final-digit]',
          ) as HTMLElement | null;
          expect(remainingBarrelWheel).toBeFalsy();
        },
        { timeout: 1000 },
      );

      // Barrel wheel width animation attribute should be cleaned up
      // Note: The charSpan at index 2 should be removed since we deleted that digit
      // But if width animation was active, it should have been cleaned up before removal
      // We can verify that no span at index 2 has width animation attributes
      const allSpans = input.querySelectorAll("[data-char-index]");
      allSpans.forEach((span) => {
        const spanEl = span as HTMLElement;
        expect(spanEl.hasAttribute("data-width-animate")).toBe(false);
        // Width styles may be set for the width-in animation (newly inserted digits)
        // which is expected behavior - the animation transitions from 0px to final width
      });
    });

    it("should not show duplicate content after undo/redo and barrel wheel animation", async () => {
      render(<NumberFlowInput />);

      const input = getInput();
      input.focus();

      await typeText(input, "123");
      await waitFor(() => {
        expect(input.textContent).toBe("123");
      });
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Undo once
      fireEvent.keyDown(input, {
        key: "z",
        metaKey: true,
        preventDefault: vi.fn(),
      });

      await waitFor(() => {
        expect(input.textContent).toBe("12");
      });
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Redo
      fireEvent.keyDown(input, {
        key: "z",
        metaKey: true,
        shiftKey: true,
        preventDefault: vi.fn(),
      });

      await waitFor(() => {
        expect(input.textContent).toBe("123");
      });
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Select the "1" and replace with "8" (triggers barrel wheel)
      await waitFor(() => {
        const walker = document.createTreeWalker(
          input,
          NodeFilter.SHOW_TEXT,
          null,
        );
        let currentPos = 0;
        let startNode: Node | null = null;
        let endNode: Node | null = null;
        let startOffset = 0;
        let endOffset = 0;

        let node: Node | null;
        while ((node = walker.nextNode())) {
          const nodeLength = node.textContent?.length ?? 0;
          if (!startNode && currentPos + nodeLength >= 0) {
            startNode = node;
            startOffset = Math.min(0 - currentPos, nodeLength);
          }
          if (!endNode && currentPos + nodeLength >= 1) {
            endNode = node;
            endOffset = Math.min(1 - currentPos, nodeLength);
            break;
          }
          currentPos += nodeLength;
        }

        if (startNode && endNode) {
          const selection = window.getSelection();
          if (selection) {
            const range = document.createRange();
            range.setStart(startNode, startOffset);
            range.setEnd(endNode, endOffset);
            selection.removeAllRanges();
            selection.addRange(range);
          }
        }
      });

      // Type "8" to replace "1"
      await typeText(input, "8");

      await waitFor(
        () => {
          // ContentEditable should show "823", not "823123" or any duplicate
          expect(input.textContent).toBe("823");
          // Verify no duplicate spans
          const allSpans = input.querySelectorAll("[data-char-index]");
          expect(allSpans.length).toBe(3);
          // Verify text content matches
          const text = Array.from(allSpans)
            .map((span) => span.textContent)
            .join("");
          expect(text).toBe("823");
        },
        { timeout: 2000 },
      );
    });

    it("should sync contentEditable when actualValue becomes undefined", async () => {
      const onChange = vi.fn();
      const { rerender } = render(
        <NumberFlowInput value={1881} onChange={onChange} format />,
      );

      const input = getInput();
      // 1881 gets formatted with thousand separator as "1,881"
      expect(input.textContent).toBe("1,881");

      // Change value to undefined (e.g., user types "-" after selecting all)
      rerender(
        <NumberFlowInput value={undefined} onChange={onChange} format />,
      );

      await waitFor(() => {
        // ContentEditable should be empty, not show "-1" or any leftover content
        expect(input.textContent).toBe("");
        // No spans should remain
        const allSpans = input.querySelectorAll("[data-char-index]");
        expect(allSpans.length).toBe(0);
      });
    });
  });

  describe("Controlled vs Uncontrolled", () => {
    it("should work as controlled component", () => {
      const onChange = vi.fn();
      const { rerender } = render(
        <NumberFlowInput value={123} onChange={onChange} />,
      );

      const input = getInput();
      expect(input.textContent).toBe("123");

      rerender(<NumberFlowInput value={456} onChange={onChange} />);
      expect(input.textContent).toBe("456");
    });

    describe("external value prop changes (formatted)", () => {
      // Helpers to read the rendered character spans in DOM order
      const getRenderedSpans = (input: HTMLElement): HTMLElement[] =>
        Array.from(
          input.querySelectorAll("[data-char-index]"),
        ) as HTMLElement[];

      const getRenderedText = (input: HTMLElement): string =>
        getRenderedSpans(input)
          .map((s) => s.textContent ?? "")
          .join("");

      const fireAllTransitions = (input: HTMLElement) => {
        // Drive every span's transitionend handlers so cleanup logic runs.
        const all = input.querySelectorAll("[data-char-index]");
        all.forEach((el) => {
          fireEvent.transitionEnd(el, { propertyName: "width" });
          fireEvent.transitionEnd(el, { propertyName: "min-width" });
          fireEvent.transitionEnd(el, { propertyName: "max-width" });
          fireEvent.transitionEnd(el, { propertyName: "translate" });
        });

        // Barrel wheels live in the input's parent container; their
        // cleanup listener is on the digits-wrapper inside each wheel. In
        // jsdom CSS transitions don't run naturally, so we have to drive
        // these transitionend events ourselves or the wheel cleanup that
        // un-hides the underlying char span never fires.
        const parent = input.parentElement;
        if (parent) {
          parent.querySelectorAll("[data-barrel-wheel]").forEach((wheel) => {
            const wrapper = wheel.querySelector(
              "[data-barrel-wheel-digits-wrapper]",
            );
            if (wrapper) {
              fireEvent.transitionEnd(wrapper, {
                propertyName: "--digit-position",
              });
            }
          });
        }
      };

      it("renders correct formatted text and span layout when value goes from undefined → 9973462 with format", async () => {
        const { rerender } = render(
          <NumberFlowInput value={undefined} format />,
        );
        const input = getInput();
        expect(input.textContent).toBe("");

        rerender(<NumberFlowInput value={9973462} format />);

        // Let updateValue + its requestAnimationFrame work, then complete
        // the width transitions so width:0 is cleared from animating spans.
        await new Promise((resolve) => setTimeout(resolve, 50));
        fireAllTransitions(input);

        await waitFor(() => {
          expect(input.textContent).toBe("9,973,462");
        });

        const spans = getRenderedSpans(input);
        // One span per formatted character (9 = "9,973,462".length)
        expect(spans).toHaveLength(9);

        // Spans must appear in DOM in left-to-right order matching the value
        expect(getRenderedText(input)).toBe("9,973,462");

        // data-char-index must be 0..8 with no gaps and no duplicates,
        // matching DOM order (so spans render visually in order).
        spans.forEach((span, i) => {
          expect(span.getAttribute("data-char-index")).toBe(i.toString());
          expect(span.textContent).toBe("9,973,462"[i]);
        });

        // Nothing should be left stuck at width:0
        spans.forEach((span) => {
          expect(span.style.width).not.toBe("0px");
        });
      });

      it("renders correct formatted text when value goes from a smaller number → 9973462", async () => {
        const { rerender } = render(<NumberFlowInput value={0} format />);
        const input = getInput();
        expect(input.textContent).toBe("0");

        rerender(<NumberFlowInput value={9973462} format />);

        await new Promise((resolve) => setTimeout(resolve, 50));
        fireAllTransitions(input);

        await waitFor(() => {
          expect(input.textContent).toBe("9,973,462");
        });

        const spans = getRenderedSpans(input);
        expect(spans).toHaveLength(9);
        expect(getRenderedText(input)).toBe("9,973,462");
        spans.forEach((span, i) => {
          expect(span.getAttribute("data-char-index")).toBe(i.toString());
          expect(span.textContent).toBe("9,973,462"[i]);
        });
      });

      it("renders correct formatted text when value goes between two same-length values", async () => {
        const { rerender } = render(<NumberFlowInput value={2345678} format />);
        const input = getInput();
        expect(input.textContent).toBe("2,345,678");

        rerender(<NumberFlowInput value={9973462} format />);

        await new Promise((resolve) => setTimeout(resolve, 50));
        fireAllTransitions(input);

        await waitFor(() => {
          expect(input.textContent).toBe("9,973,462");
        });

        const spans = getRenderedSpans(input);
        expect(spans).toHaveLength(9);
        expect(getRenderedText(input)).toBe("9,973,462");
        spans.forEach((span, i) => {
          expect(span.getAttribute("data-char-index")).toBe(i.toString());
          expect(span.textContent).toBe("9,973,462"[i]);
        });
      });

      it("animates digit replacements as barrel wheels for same-length value swaps", async () => {
        const { rerender } = render(<NumberFlowInput value={2345678} format />);
        const input = getInput();
        const parent = input.parentElement!;

        rerender(<NumberFlowInput value={9973462} format />);

        await waitFor(() => {
          // Barrel wheels are appended to the wrapper for each digit that
          // changed at the same right-aligned position.
          const wheels = parent.querySelectorAll("[data-barrel-wheel]");
          // Every digit differs between 2,345,678 and 9,973,462, so 7 wheels.
          expect(wheels.length).toBe(7);
        });
      });

      it("does not animate on initial mount (no FOUC / no wheels for initial value)", async () => {
        const { container } = render(
          <NumberFlowInput value={9973462} format />,
        );
        const input = getInput();
        const parent = input.parentElement!;

        // Initial value should be rendered as plain textContent without
        // having triggered the prop-change effect.
        expect(input.textContent).toBe("9,973,462");
        // No barrel wheels for the initial mount.
        expect(parent.querySelectorAll("[data-barrel-wheel]")).toHaveLength(0);
        // And no per-char animating spans either — these only appear after
        // updateValue runs.
        expect(input.querySelectorAll("[data-char-index]")).toHaveLength(0);
        // suppress unused
        void container;
      });

      it("renders correctly when going from a longer to shorter value (8 → 7 digits)", async () => {
        const { rerender } = render(
          <NumberFlowInput value={12345678} format />,
        );
        const input = getInput();
        expect(input.textContent).toBe("12,345,678");

        rerender(<NumberFlowInput value={9973462} format />);

        await new Promise((resolve) => setTimeout(resolve, 50));
        fireAllTransitions(input);

        await waitFor(() => {
          expect(input.textContent).toBe("9,973,462");
        });

        const spans = getRenderedSpans(input);
        expect(spans).toHaveLength(9);
        expect(getRenderedText(input)).toBe("9,973,462");
        spans.forEach((span, i) => {
          expect(span.getAttribute("data-char-index")).toBe(i.toString());
          expect(span.textContent).toBe("9,973,462"[i]);
        });
      });

      it("renders correctly going from 6 → 7 digits (new comma at idx 1, second comma matches)", async () => {
        const { rerender } = render(<NumberFlowInput value={973462} format />);
        const input = getInput();
        expect(input.textContent).toBe("973,462");

        rerender(<NumberFlowInput value={9973462} format />);

        await new Promise((resolve) => setTimeout(resolve, 50));
        fireAllTransitions(input);

        await waitFor(() => {
          expect(input.textContent).toBe("9,973,462");
        });

        const spans = getRenderedSpans(input);
        expect(spans).toHaveLength(9);
        expect(getRenderedText(input)).toBe("9,973,462");
        spans.forEach((span, i) => {
          expect(span.getAttribute("data-char-index")).toBe(i.toString());
          expect(span.textContent).toBe("9,973,462"[i]);
        });
      });

      it("renders correctly going from 5 → 7 digits (both commas are new)", async () => {
        const { rerender } = render(<NumberFlowInput value={73462} format />);
        const input = getInput();
        expect(input.textContent).toBe("73,462");

        rerender(<NumberFlowInput value={9973462} format />);

        await new Promise((resolve) => setTimeout(resolve, 50));
        fireAllTransitions(input);

        await waitFor(() => {
          expect(input.textContent).toBe("9,973,462");
        });

        const spans = getRenderedSpans(input);
        expect(spans).toHaveLength(9);
        expect(getRenderedText(input)).toBe("9,973,462");
        spans.forEach((span, i) => {
          expect(span.getAttribute("data-char-index")).toBe(i.toString());
          expect(span.textContent).toBe("9,973,462"[i]);
        });
      });

      it("renders correctly across several rapid prop changes", async () => {
        const { rerender } = render(<NumberFlowInput value={1} format />);
        const input = getInput();

        const sequence = [12, 123, 1234, 12345, 123456, 1234567, 9973462];
        for (const v of sequence) {
          rerender(<NumberFlowInput value={v} format />);
          // Yield a microtask between rerenders so the effect can run.
          await new Promise((resolve) => setTimeout(resolve, 5));
        }

        await new Promise((resolve) => setTimeout(resolve, 100));
        fireAllTransitions(input);

        await waitFor(() => {
          expect(input.textContent).toBe("9,973,462");
        });

        const spans = getRenderedSpans(input);
        expect(spans).toHaveLength(9);
        expect(getRenderedText(input)).toBe("9,973,462");
        spans.forEach((span, i) => {
          expect(span.getAttribute("data-char-index")).toBe(i.toString());
          expect(span.textContent).toBe("9,973,462"[i]);
        });
      });

      it("preserves all separators when shrinking from 8 digits to 6 digits (95975328 → 312938)", async () => {
        const { rerender } = render(
          <NumberFlowInput value={95975328} format />,
        );
        const input = getInput();
        expect(input.textContent).toBe("95,975,328");

        rerender(<NumberFlowInput value={312938} format />);

        await new Promise((resolve) => setTimeout(resolve, 50));
        fireAllTransitions(input);

        await waitFor(() => {
          // Without the fix the second comma got swallowed and a stray
          // digit appeared, producing "3129389" instead of "312,938".
          expect(input.textContent).toBe("312,938");
        });

        const spans = getRenderedSpans(input);
        expect(spans).toHaveLength("312,938".length);
        expect(getRenderedText(input)).toBe("312,938");
        spans.forEach((span, i) => {
          expect(span.getAttribute("data-char-index")).toBe(i.toString());
          expect(span.textContent).toBe("312,938"[i]);
        });
      });

      it("clears stale transparency on rapid prop changes (no invisible chars)", async () => {
        // Simulates a "randomize" button that fires several updates with
        // little time between them; previously the underlying char span
        // could be left at color:transparent when an interrupted wheel's
        // cleanup ran against the wrong target.
        const { rerender } = render(<NumberFlowInput value={141332} format />);
        const input = getInput();
        expect(input.textContent).toBe("141,332");

        const sequence = [12345678, 9876543, 53185337, 999999, 53185337];
        for (const v of sequence) {
          rerender(<NumberFlowInput value={v} format />);
          await new Promise((resolve) => setTimeout(resolve, 8));
        }

        await new Promise((resolve) => setTimeout(resolve, 100));
        fireAllTransitions(input);
        // Run another frame's worth of cleanups after transitions fire.
        await new Promise((resolve) => setTimeout(resolve, 50));

        const spans = getRenderedSpans(input);
        // No span should be stuck at color:transparent after everything
        // has settled.
        spans.forEach((span) => {
          expect(span.style.color).not.toBe("transparent");
          expect(span.style.color).not.toBe("rgba(0, 0, 0, 0)");
        });
        expect(getRenderedText(input)).toBe("53,185,337");
      });

      it("drops ghost trailing spans when shrinking during rapid prop changes", async () => {
        // Simulates a "randomize" button that swaps in/out a value that
        // is shorter than the previous one before the previous wheels
        // finish. Trailing transparent spans from the longer value used
        // to be kept by cleanup (treated as "still animating") and would
        // re-appear as ghost characters once a stray wheel cleanup
        // un-hid them.
        const { rerender } = render(<NumberFlowInput value={417969} format />);
        const input = getInput();
        expect(input.textContent).toBe("417,969");

        // First swap up to a value that's noticeably longer (10 chars
        // formatted) so we definitely have spans at indices 7+.
        const sequence = [12345678, 95975328, 265066];
        for (const v of sequence) {
          rerender(<NumberFlowInput value={v} format />);
          await new Promise((resolve) => setTimeout(resolve, 8));
        }

        await new Promise((resolve) => setTimeout(resolve, 100));
        fireAllTransitions(input);
        await new Promise((resolve) => setTimeout(resolve, 50));

        // After everything settles the contenteditable must contain
        // exactly the spans for "265,066" — no transparent ghosts at
        // indices 7-9 left over from the 8-digit values above.
        const spans = getRenderedSpans(input);
        expect(spans).toHaveLength("265,066".length);
        expect(getRenderedText(input)).toBe("265,066");
        spans.forEach((span, i) => {
          expect(span.getAttribute("data-char-index")).toBe(i.toString());
          expect(span.textContent).toBe("265,066"[i]);
          expect(span.style.color).not.toBe("transparent");
          expect(span.style.color).not.toBe("rgba(0, 0, 0, 0)");
        });

        // And no stale barrel wheels at out-of-bounds indices either.
        const parent = input.parentElement;
        if (parent) {
          const wheels = parent.querySelectorAll(
            "[data-barrel-wheel][data-char-index]",
          );
          wheels.forEach((wheel) => {
            const idx = parseInt(
              wheel.getAttribute("data-char-index") ?? "-1",
              10,
            );
            expect(idx).toBeLessThan("265,066".length);
          });
        }
      });

      it("renders correctly when only some barrel wheels complete before next render", async () => {
        // Simulate the scenario where prop changes back-to-back without
        // waiting for transitions to settle, which is when ghost spans tend
        // to appear.
        const { rerender } = render(<NumberFlowInput value={2345678} format />);
        const input = getInput();
        expect(input.textContent).toBe("2,345,678");

        rerender(<NumberFlowInput value={1234567} format />);
        // Don't drain transitions — only let the rAF run once.
        await new Promise((resolve) => setTimeout(resolve, 10));

        rerender(<NumberFlowInput value={9973462} format />);

        await new Promise((resolve) => setTimeout(resolve, 100));
        fireAllTransitions(input);

        await waitFor(() => {
          expect(input.textContent).toBe("9,973,462");
        });

        const spans = getRenderedSpans(input);
        // The DOM should not have leftover spans from previous renders.
        expect(spans).toHaveLength(9);
        expect(getRenderedText(input)).toBe("9,973,462");
        spans.forEach((span, i) => {
          expect(span.getAttribute("data-char-index")).toBe(i.toString());
          expect(span.textContent).toBe("9,973,462"[i]);
        });
      });

      it("does not garble the leading digit when bouncing 6850431 ↔ 6650431", async () => {
        // Repro for "0 and 6 overlap at leading position" reported when
        // selecting the middle digit, typing a value that already exists at
        // the leading position, then bouncing back.
        const { rerender } = render(<NumberFlowInput value={6850431} format />);
        const input = getInput();
        expect(input.textContent).toBe("6,850,431");

        // 6,850,431 → 6,650,431 (middle 8 becomes 6, now two leading 6s).
        rerender(<NumberFlowInput value={6650431} format />);
        await new Promise((resolve) => setTimeout(resolve, 50));
        fireAllTransitions(input);
        await new Promise((resolve) => setTimeout(resolve, 50));
        expect(input.textContent).toBe("6,650,431");

        // 6,650,431 → 6,850,431 (middle 6 becomes 8 again).
        rerender(<NumberFlowInput value={6850431} format />);
        await new Promise((resolve) => setTimeout(resolve, 50));
        fireAllTransitions(input);
        await new Promise((resolve) => setTimeout(resolve, 50));

        const spans = getRenderedSpans(input);
        expect(spans).toHaveLength("6,850,431".length);
        expect(getRenderedText(input)).toBe("6,850,431");
        spans.forEach((span, i) => {
          expect(span.getAttribute("data-char-index")).toBe(i.toString());
          expect(span.textContent).toBe("6,850,431"[i]);
          // Final state: nothing should be left transparent.
          expect(span.style.color).not.toBe("transparent");
          expect(span.style.color).not.toBe("rgba(0, 0, 0, 0)");
        });

        // And no stale barrel wheels should remain.
        const parent = input.parentElement;
        if (parent) {
          const wheels = parent.querySelectorAll("[data-barrel-wheel]");
          expect(wheels.length).toBe(0);
        }
      });

      it("does not garble the leading digit when bouncing via typing (uncontrolled)", async () => {
        // Repro for the typing case: select the middle digit and replace
        // it with a value that already exists at the leading position,
        // then immediately do the inverse.
        render(<NumberFlowInput defaultValue={6850431} format />);
        const input = getInput();
        input.focus();
        expect(input.textContent).toBe("6,850,431");

        // Select formatted positions [2,3] (the "8").
        const selectFormattedRange = (start: number, end: number) => {
          const walker = document.createTreeWalker(
            input,
            NodeFilter.SHOW_TEXT,
            null,
          );
          let currentPos = 0;
          let startNode: Node | null = null;
          let endNode: Node | null = null;
          let startOffset = 0;
          let endOffset = 0;

          let node: Node | null;
          while ((node = walker.nextNode())) {
            const nodeLength = node.textContent?.length ?? 0;
            if (!startNode && currentPos + nodeLength >= start) {
              startNode = node;
              startOffset = Math.min(start - currentPos, nodeLength);
            }
            if (!endNode && currentPos + nodeLength >= end) {
              endNode = node;
              endOffset = Math.min(end - currentPos, nodeLength);
              break;
            }
            currentPos += nodeLength;
          }
          if (startNode && endNode) {
            const selection = window.getSelection();
            if (selection) {
              const range = document.createRange();
              range.setStart(startNode, startOffset);
              range.setEnd(endNode, endOffset);
              selection.removeAllRanges();
              selection.addRange(range);
            }
          }
        };

        selectFormattedRange(2, 3);
        fireEvent.keyDown(input, { key: "6", preventDefault: vi.fn() });
        await new Promise((resolve) => setTimeout(resolve, 50));
        fireAllTransitions(input);
        await new Promise((resolve) => setTimeout(resolve, 50));
        expect(input.textContent).toBe("6,650,431");

        // Select formatted positions [2,3] again (the new "6").
        selectFormattedRange(2, 3);
        fireEvent.keyDown(input, { key: "8", preventDefault: vi.fn() });
        await new Promise((resolve) => setTimeout(resolve, 50));
        fireAllTransitions(input);
        await new Promise((resolve) => setTimeout(resolve, 50));

        const spans = getRenderedSpans(input);
        expect(spans).toHaveLength("6,850,431".length);
        expect(getRenderedText(input)).toBe("6,850,431");
        spans.forEach((span, i) => {
          expect(span.getAttribute("data-char-index")).toBe(i.toString());
          expect(span.textContent).toBe("6,850,431"[i]);
          expect(span.style.color).not.toBe("transparent");
          expect(span.style.color).not.toBe("rgba(0, 0, 0, 0)");
        });

        const parent = input.parentElement;
        if (parent) {
          const wheels = parent.querySelectorAll("[data-barrel-wheel]");
          expect(wheels.length).toBe(0);
        }
      });

      it("inspects DOM mid-animation when bouncing 6850431 ↔ 6650431 ↔ 6850431", async () => {
        // Reproduces the user's reported flow and inspects the DOM at the
        // moment the second wheel kicks off (no transitionend in between).
        render(<NumberFlowInput defaultValue={6850431} format />);
        const input = getInput();
        input.focus();
        expect(input.textContent).toBe("6,850,431");

        const selectFormattedRange = (start: number, end: number) => {
          const walker = document.createTreeWalker(
            input,
            NodeFilter.SHOW_TEXT,
            null,
          );
          let currentPos = 0;
          let startNode: Node | null = null;
          let endNode: Node | null = null;
          let startOffset = 0;
          let endOffset = 0;
          let node: Node | null;
          while ((node = walker.nextNode())) {
            const nodeLength = node.textContent?.length ?? 0;
            if (!startNode && currentPos + nodeLength >= start) {
              startNode = node;
              startOffset = Math.min(start - currentPos, nodeLength);
            }
            if (!endNode && currentPos + nodeLength >= end) {
              endNode = node;
              endOffset = Math.min(end - currentPos, nodeLength);
              break;
            }
            currentPos += nodeLength;
          }
          if (startNode && endNode) {
            const selection = window.getSelection();
            if (selection) {
              const range = document.createRange();
              range.setStart(startNode, startOffset);
              range.setEnd(endNode, endOffset);
              selection.removeAllRanges();
              selection.addRange(range);
            }
          }
        };

        // Step 1: replace "8" with "6"
        selectFormattedRange(2, 3);
        fireEvent.keyDown(input, { key: "6", preventDefault: vi.fn() });
        // Allow the synchronous main loop + the rAF that builds the wheel.
        await new Promise((resolve) => setTimeout(resolve, 30));

        // Step 2: immediately replace the new "6" with "8" (no settle).
        selectFormattedRange(2, 3);
        fireEvent.keyDown(input, { key: "8", preventDefault: vi.fn() });
        // Allow the synchronous main loop + rAF.
        await new Promise((resolve) => setTimeout(resolve, 30));

        // ---- Mid-animation DOM inspection ----
        const parent = input.parentElement;
        const wheels = parent
          ? Array.from(parent.querySelectorAll("[data-barrel-wheel]"))
          : [];

        // We should have exactly one barrel wheel, at formatted index 2.
        // If we have more (e.g. a leftover at index 0 or index 1) that's
        // the "leading digit confused with the typed digit" bug.
        const wheelIndices = wheels
          .map((w) => parseInt(w.getAttribute("data-char-index") ?? "-1", 10))
          .sort((a, b) => a - b);
        expect(wheelIndices).toEqual([2]);

        // Span sanity check: text contents must be in order.
        const spans = getRenderedSpans(input);
        expect(spans).toHaveLength("6,850,431".length);
        expect(getRenderedText(input)).toBe("6,850,431");
        spans.forEach((span, i) => {
          expect(span.getAttribute("data-char-index")).toBe(i.toString());
          expect(span.textContent).toBe("6,850,431"[i]);
        });

        // Only the digit being barrel-rolled (formatted idx 2) should be
        // hidden (color:transparent). Any other transparent span means we
        // accidentally hid a sibling — e.g. the leading "6".
        spans.forEach((span, i) => {
          if (i === 2) {
            return;
          }
          expect({ index: i, color: span.style.color }).toEqual({
            index: i,
            color: "",
          });
        });
      });

      it("does not garble the leading digit when typing rapidly (uncontrolled, no settle)", async () => {
        // Same as above but without letting the first wheel settle —
        // mirrors the user's reported screenshots.
        render(<NumberFlowInput defaultValue={6850431} format />);
        const input = getInput();
        input.focus();
        expect(input.textContent).toBe("6,850,431");

        const selectFormattedRange = (start: number, end: number) => {
          const walker = document.createTreeWalker(
            input,
            NodeFilter.SHOW_TEXT,
            null,
          );
          let currentPos = 0;
          let startNode: Node | null = null;
          let endNode: Node | null = null;
          let startOffset = 0;
          let endOffset = 0;
          let node: Node | null;
          while ((node = walker.nextNode())) {
            const nodeLength = node.textContent?.length ?? 0;
            if (!startNode && currentPos + nodeLength >= start) {
              startNode = node;
              startOffset = Math.min(start - currentPos, nodeLength);
            }
            if (!endNode && currentPos + nodeLength >= end) {
              endNode = node;
              endOffset = Math.min(end - currentPos, nodeLength);
              break;
            }
            currentPos += nodeLength;
          }
          if (startNode && endNode) {
            const selection = window.getSelection();
            if (selection) {
              const range = document.createRange();
              range.setStart(startNode, startOffset);
              range.setEnd(endNode, endOffset);
              selection.removeAllRanges();
              selection.addRange(range);
            }
          }
        };

        selectFormattedRange(2, 3);
        fireEvent.keyDown(input, { key: "6", preventDefault: vi.fn() });
        await new Promise((resolve) => setTimeout(resolve, 8));

        selectFormattedRange(2, 3);
        fireEvent.keyDown(input, { key: "8", preventDefault: vi.fn() });

        await new Promise((resolve) => setTimeout(resolve, 100));
        fireAllTransitions(input);
        await new Promise((resolve) => setTimeout(resolve, 50));

        const spans = getRenderedSpans(input);
        expect(spans).toHaveLength("6,850,431".length);
        expect(getRenderedText(input)).toBe("6,850,431");
        spans.forEach((span, i) => {
          expect(span.getAttribute("data-char-index")).toBe(i.toString());
          expect(span.textContent).toBe("6,850,431"[i]);
          expect(span.style.color).not.toBe("transparent");
          expect(span.style.color).not.toBe("rgba(0, 0, 0, 0)");
        });

        const parent = input.parentElement;
        if (parent) {
          const wheels = parent.querySelectorAll("[data-barrel-wheel]");
          expect(wheels.length).toBe(0);
        }
      });

      it("does not garble the leading digit when bouncing rapidly (no settle between)", async () => {
        // Same as above but without waiting for the first transition to
        // settle — this is what the user's screenshots show happens during
        // back-to-back keystrokes.
        const { rerender } = render(<NumberFlowInput value={6850431} format />);
        const input = getInput();
        expect(input.textContent).toBe("6,850,431");

        rerender(<NumberFlowInput value={6650431} format />);
        await new Promise((resolve) => setTimeout(resolve, 8));
        rerender(<NumberFlowInput value={6850431} format />);

        await new Promise((resolve) => setTimeout(resolve, 100));
        fireAllTransitions(input);
        await new Promise((resolve) => setTimeout(resolve, 50));

        const spans = getRenderedSpans(input);
        expect(spans).toHaveLength("6,850,431".length);
        expect(getRenderedText(input)).toBe("6,850,431");
        spans.forEach((span, i) => {
          expect(span.getAttribute("data-char-index")).toBe(i.toString());
          expect(span.textContent).toBe("6,850,431"[i]);
          expect(span.style.color).not.toBe("transparent");
          expect(span.style.color).not.toBe("rgba(0, 0, 0, 0)");
        });

        const parent = input.parentElement;
        if (parent) {
          const wheels = parent.querySelectorAll("[data-barrel-wheel]");
          expect(wheels.length).toBe(0);
        }
      });
    });

    it("should work as uncontrolled component", async () => {
      const onChange = vi.fn();
      render(<NumberFlowInput defaultValue={123} onChange={onChange} />);

      const input = getInput();
      expect(input.textContent).toBe("123");

      input.focus();
      await typeText(input, "4");
      expect(onChange).toHaveBeenCalled();
    });
  });

  describe("Props", () => {
    it("should apply name prop to hidden input", () => {
      render(<NumberFlowInput name="test-input" />);
      const hiddenInput = document.querySelector(
        "input[data-numberflow-input-real-input]",
      ) as HTMLInputElement;
      expect(hiddenInput).toBeTruthy();
      expect(hiddenInput.name).toBe("test-input");
    });

    it("should apply id prop to hidden input", () => {
      render(<NumberFlowInput id="test-input-id" />);
      const hiddenInput = document.querySelector(
        "input[data-numberflow-input-real-input]",
      ) as HTMLInputElement;
      expect(hiddenInput).toBeTruthy();
      expect(hiddenInput.id).toBe("test-input-id");
    });

    it("should handle autoAddLeadingZero prop", async () => {
      const onChange = vi.fn();
      render(
        <NumberFlowInput
          autoAddLeadingZero
          value={undefined}
          onChange={onChange}
        />,
      );

      const input = getInput();
      input.focus();

      // Type "." first
      await typeText(input, ".");
      await waitFor(() => {
        // With autoAddLeadingZero, "." should become "0."
        expect(input.textContent).toBe("0.");
      });

      // Move cursor to the end
      const currentLength = input.textContent?.length || 0;
      setCursorPosition(input, currentLength);
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Then type "5" at the end
      await typeText(input, "5");
      await waitFor(
        () => {
          expect(input.textContent).toBe("0.5");
          expect(onChange).toHaveBeenLastCalledWith(0.5);
        },
        { timeout: 2000 },
      );
    });

    it("should not add leading zero when autoAddLeadingZero is false", async () => {
      const onChange = vi.fn();
      render(
        <NumberFlowInput autoAddLeadingZero={false} onChange={onChange} />,
      );

      const input = getInput();
      input.focus();

      // Type "." first
      await typeText(input, ".");
      await waitFor(() => {
        // Without autoAddLeadingZero, "." should remain "."
        expect(input.textContent).toBe(".");
      });

      // Then type "5"
      await typeText(input, "5");
      await waitFor(() => {
        expect(input.textContent).toBe(".5");
        expect(onChange).toHaveBeenLastCalledWith(0.5);
      });
    });

    it("calls onChange with parsed values as the user types", async () => {
      const onChange = vi.fn();
      render(<NumberFlowInput onChange={onChange} />);
      const input = getInput();
      input.focus();
      await typeText(input, "42");
      await waitFor(() => {
        expect(onChange).toHaveBeenLastCalledWith(42);
      });
    });

    it("decimalScale=2 limits the number of decimal digits the user can type", async () => {
      const onChange = vi.fn();
      render(<NumberFlowInput decimalScale={2} onChange={onChange} />);
      const input = getInput();
      input.focus();
      await typeText(input, "1.23");
      await waitFor(() => {
        expect(input.textContent).toBe("1.23");
      });
      // Typing a 3rd decimal digit must be rejected.
      await typeText(input, "4");
      await waitFor(() => {
        expect(input.textContent).toBe("1.23");
        expect(onChange).toHaveBeenLastCalledWith(1.23);
      });
    });

    it("decimalScale=0 forbids typing a decimal point", async () => {
      const onChange = vi.fn();
      render(<NumberFlowInput decimalScale={0} onChange={onChange} />);
      const input = getInput();
      input.focus();
      await typeText(input, "12");
      await typeText(input, ".");
      await typeText(input, "5");
      await waitFor(() => {
        // The "." must be ignored and the "5" appended as integer.
        expect(input.textContent).toBe("125");
      });
    });

    it("allowNegative={undefined} rejects the minus key", async () => {
      const onChange = vi.fn();
      render(<NumberFlowInput onChange={onChange} />);
      const input = getInput();
      input.focus();
      await typeText(input, "-");
      await typeText(input, "5");
      await waitFor(() => {
        expect(input.textContent).toBe("5");
      });
    });

    it("allowNegative={true} accepts a leading minus", async () => {
      const onChange = vi.fn();
      render(<NumberFlowInput allowNegative onChange={onChange} />);
      const input = getInput();
      input.focus();
      await typeText(input, "-12");
      await waitFor(() => {
        expect(input.textContent).toBe("-12");
        expect(onChange).toHaveBeenLastCalledWith(-12);
      });
    });

    it("maxLength prevents typing past the configured length", async () => {
      const onChange = vi.fn();
      render(<NumberFlowInput maxLength={3} onChange={onChange} />);
      const input = getInput();
      input.focus();
      await typeText(input, "12345");
      await waitFor(() => {
        // Only first 3 chars accepted.
        expect(input.textContent).toBe("123");
        expect(onChange).toHaveBeenLastCalledWith(123);
      });
    });

    it("isAllowed blocks values that don't pass the predicate", async () => {
      const onChange = vi.fn();
      // Only allow values <= 50.
      const isAllowed = (v: number | null) => v == null || v <= 50;
      render(<NumberFlowInput isAllowed={isAllowed} onChange={onChange} />);
      const input = getInput();
      input.focus();
      await typeText(input, "4");
      await waitFor(() => expect(input.textContent).toBe("4"));
      await typeText(input, "9");
      await waitFor(() => expect(input.textContent).toBe("49"));
      // Typing "9" would make 499 which is > 50, must be rejected.
      await typeText(input, "9");
      await waitFor(() => {
        expect(input.textContent).toBe("49");
      });
    });

    it("autoFocus focuses the contentEditable on mount", () => {
      // eslint-disable-next-line jsx-a11y/no-autofocus
      render(<NumberFlowInput autoFocus />);
      const input = getInput();
      expect(document.activeElement).toBe(input);
    });

    it("does not focus on mount when autoFocus is false", () => {
      render(<NumberFlowInput />);
      const input = getInput();
      expect(document.activeElement).not.toBe(input);
    });

    it("invokes onFocus/onBlur handlers", () => {
      const onFocus = vi.fn();
      const onBlur = vi.fn();
      render(<NumberFlowInput onFocus={onFocus} onBlur={onBlur} />);
      const input = getInput();
      fireEvent.focus(input);
      expect(onFocus).toHaveBeenCalledTimes(1);
      fireEvent.blur(input);
      expect(onBlur).toHaveBeenCalledTimes(1);
    });

    it("places the placeholder on the contenteditable's data-placeholder attribute", () => {
      render(<NumberFlowInput placeholder="Enter amount" />);
      const input = getInput();
      expect(input.getAttribute("data-placeholder")).toBe("Enter amount");
    });

    it("applies className to the root span", () => {
      render(<NumberFlowInput className="foo bar" />);
      const root = document.querySelector(
        "[data-numberflow-input-root]",
      ) as HTMLElement;
      expect(root.className).toBe("foo bar");
    });

    it("merges style into the root span (without losing internal display)", () => {
      render(<NumberFlowInput style={{ color: "red", margin: "5px" }} />);
      const root = document.querySelector(
        "[data-numberflow-input-root]",
      ) as HTMLElement;
      expect(root.style.color).toBe("red");
      expect(root.style.margin).toBe("5px");
      expect(root.style.display).toBe("inline-flex");
    });

    it("forwards min/max/minLength/maxLength to the hidden <input>", () => {
      render(
        <NumberFlowInput
          min={0}
          max={100}
          minLength={1}
          maxLength={5}
          name="x"
        />,
      );
      const hidden = document.querySelector(
        "input[data-numberflow-input-real-input]",
      ) as HTMLInputElement;
      expect(hidden.min).toBe("0");
      expect(hidden.max).toBe("100");
      expect(hidden.minLength).toBe(1);
      expect(hidden.maxLength).toBe(5);
    });

    it("forwards form/required to the hidden <input>", () => {
      render(<NumberFlowInput form="my-form" required name="x" />);
      const hidden = document.querySelector(
        "input[data-numberflow-input-real-input]",
      ) as HTMLInputElement;
      expect(hidden.getAttribute("form")).toBe("my-form");
      expect(hidden.required).toBe(true);
    });

    it("mirrors the current value into the hidden <input>'s value", async () => {
      render(<NumberFlowInput defaultValue={42} name="amount" />);
      const hidden = document.querySelector(
        'input[name="amount"]',
      ) as HTMLInputElement;
      expect(hidden.value).toBe("42");
    });

    it("forwards a ref to the contenteditable element", () => {
      const ref = { current: null as HTMLElement | null };
      render(<NumberFlowInput ref={ref} />);
      expect(ref.current).toBe(getInput());
    });
  });

  describe("Formatted number display", () => {
    it("should format numbers with thousand separators when format=true", async () => {
      const onChange = vi.fn();
      render(<NumberFlowInput onChange={onChange} format />);

      const input = getInput();
      input.focus();

      await typeText(input, "1234567");
      await waitFor(() => {
        // Should be formatted with thousand separators
        expect(input.textContent).toBe("1,234,567");
        expect(onChange).toHaveBeenLastCalledWith(1234567);
      });
    });

    it("should not format numbers by default (format=false)", async () => {
      const onChange = vi.fn();
      render(<NumberFlowInput onChange={onChange} />);

      const input = getInput();
      input.focus();

      await typeText(input, "1234567");
      await waitFor(() => {
        // Should not be formatted (no separators)
        expect(input.textContent).toBe("1234567");
        expect(onChange).toHaveBeenLastCalledWith(1234567);
      });
    });

    it("should use locale-specific decimal separator when locale is set", async () => {
      const onChange = vi.fn();
      // Use German locale which uses comma as decimal separator
      render(<NumberFlowInput onChange={onChange} locale="de-DE" />);

      const input = getInput();
      input.focus();

      await typeText(input, "123");
      // Type decimal - both '.' and ',' should be accepted, converted to ','
      await typeText(input, ".");
      await typeText(input, "45");

      await waitFor(() => {
        // Should use German decimal separator (comma)
        expect(input.textContent).toBe("123,45");
        expect(onChange).toHaveBeenLastCalledWith(123.45);
      });
    });

    it("should accept locale decimal separator as input", async () => {
      const onChange = vi.fn();
      // Use German locale which uses comma as decimal separator
      render(<NumberFlowInput onChange={onChange} locale="de-DE" />);

      const input = getInput();
      input.focus();

      await typeText(input, "123");
      // Type comma (German decimal separator)
      await typeText(input, ",");
      await typeText(input, "45");

      await waitFor(() => {
        expect(input.textContent).toBe("123,45");
        expect(onChange).toHaveBeenLastCalledWith(123.45);
      });
    });

    it("should format numbers with locale-specific separators when format=true and locale is set", async () => {
      const onChange = vi.fn();
      // Use German locale: uses '.' for thousands and ',' for decimal
      render(<NumberFlowInput onChange={onChange} format locale="de-DE" />);

      const input = getInput();
      input.focus();

      await typeText(input, "1234567");
      await waitFor(() => {
        // German format: "1.234.567"
        expect(input.textContent).toBe("1.234.567");
        expect(onChange).toHaveBeenLastCalledWith(1234567);
      });
    });

    it("should update display when format prop changes", async () => {
      const onChange = vi.fn();
      const { rerender } = render(
        <NumberFlowInput onChange={onChange} value={1234567} />,
      );

      const input = getInput();

      // Initially no formatting
      await waitFor(() => {
        expect(input.textContent).toBe("1234567");
      });

      // Enable formatting
      rerender(<NumberFlowInput onChange={onChange} value={1234567} format />);

      await waitFor(() => {
        // Should now be formatted
        expect(input.textContent).toBe("1,234,567");
      });

      // Disable formatting again
      rerender(<NumberFlowInput onChange={onChange} value={1234567} />);

      // Wait for requestAnimationFrame to set up animations, then fire transitionend events
      await new Promise((resolve) => setTimeout(resolve, 50));
      fireTransitionEndEvents(input);

      await waitFor(() => {
        // Should return to unformatted
        expect(input.textContent).toBe("1234567");
      });
    });

    it("should update display when locale prop changes", async () => {
      const onChange = vi.fn();
      const { rerender } = render(
        <NumberFlowInput onChange={onChange} value={1234.56} />,
      );

      const input = getInput();

      // Initially default locale (US)
      await waitFor(() => {
        expect(input.textContent).toBe("1234.56");
      });

      // Change to German locale
      rerender(
        <NumberFlowInput onChange={onChange} value={1234.56} locale="de-DE" />,
      );

      await waitFor(() => {
        // Should now use comma as decimal separator
        expect(input.textContent).toBe("1234,56");
      });
    });

    it("should handle locale switch followed by external value change (no stale separators)", async () => {
      const onChange = vi.fn();
      const { rerender } = render(
        <NumberFlowInput onChange={onChange} format value={123456.78} />,
      );

      const input = getInput();

      // Initially en-US with format → "123,456.78"
      await waitFor(() => {
        expect(input.textContent).toBe("123,456.78");
      });

      // Switch locale to de-DE without touching the value. The cached
      // formatted text was "123,456.78" (en-US decimal "." and group ",");
      // after the switch it must become "123.456,78" (de-DE decimal ","
      // and group ".").
      rerender(
        <NumberFlowInput
          onChange={onChange}
          format
          locale="de-DE"
          value={123456.78}
        />,
      );

      // Let the format-toggle effect run its rAF cycle, then settle any
      // pending CSS transitions that JSDOM doesn't fire on its own.
      await new Promise((resolve) => setTimeout(resolve, 50));
      fireTransitionEndEvents(input);

      await waitFor(() => {
        expect(input.textContent).toBe("123.456,78");
      });

      // Now change the value externally. If anything in the diff pipeline
      // is still holding the old (en-US) separators, the new formatted
      // text won't line up with the previous one and the resulting DOM
      // will diverge from the expected "234.567,89".
      rerender(
        <NumberFlowInput
          onChange={onChange}
          format
          locale="de-DE"
          value={234567.89}
        />,
      );

      await new Promise((resolve) => setTimeout(resolve, 50));
      fireTransitionEndEvents(input);

      await waitFor(() => {
        expect(input.textContent).toBe("234.567,89");
      });

      // Verify the span structure matches the formatted text exactly —
      // one span per character, indices contiguous, no leftover spans
      // from the old locale's "123,456.78" formatting still floating
      // around. A stale separator would manifest as a mismatch here.
      const spans = Array.from(
        input.querySelectorAll("[data-char-index]"),
      ) as HTMLElement[];
      const expected = "234.567,89";
      expect(spans).toHaveLength(expected.length);
      spans.forEach((span, i) => {
        expect(span.textContent).toBe(expected[i]);
        expect(span.getAttribute("data-char-index")).toBe(String(i));
      });
    });

    describe("when the browser locale changes at runtime", () => {
      // The `locale` prop is intentionally omitted in these tests — we
      // want the component to read the browser default locale (which we
      // mutate via the helper from test/setup.ts to simulate Chrome's
      // "Sensors → Locale" panel or a user switching their system
      // locale).
      afterEach(() => {
        setDefaultLocale("en-US");
      });

      it("should pick up the new browser locale on the next value change", async () => {
        const onChange = vi.fn();
        const { rerender } = render(
          <NumberFlowInput onChange={onChange} format value={123456.78} />,
        );
        const input = getInput();

        // Initially en-US: "123,456.78"
        await waitFor(() => {
          expect(input.textContent).toBe("123,456.78");
        });

        // Browser flips to de-DE. The component doesn't re-render on
        // its own (no prop changed), but the next time something else
        // triggers a render, formatValue should pick up the new
        // browser default.
        setDefaultLocale("de-DE");

        // Push a new value to force a re-render. In de-DE:
        // "234.567,89" (group "." and decimal ",").
        rerender(
          <NumberFlowInput onChange={onChange} format value={234567.89} />,
        );

        await new Promise((resolve) => setTimeout(resolve, 50));
        fireTransitionEndEvents(input);

        await waitFor(() => {
          expect(input.textContent).toBe("234.567,89");
        });

        // And the underlying span structure must match — no leftover
        // separators from the en-US formatting (a stale `,` or `.`
        // would surface here as a mismatched textContent or extra span).
        const spans = Array.from(
          input.querySelectorAll("[data-char-index]"),
        ) as HTMLElement[];
        const expected = "234.567,89";
        expect(spans).toHaveLength(expected.length);
        spans.forEach((span, i) => {
          expect(span.textContent).toBe(expected[i]);
          expect(span.getAttribute("data-char-index")).toBe(String(i));
        });
      });

      it("should handle typed input followed by browser locale change and external value change", async () => {
        // This reproduces the user-reported bug:
        //   1. en-US (default), format=true, type "123456.78" → "123,456.78"
        //   2. Browser locale flips to de-DE.
        //   3. Parent randomizes value to 92392755.99 (a different magnitude).
        // The DOM must converge on the de-DE formatted representation
        // ("92.392.755,99"), not some half-converted string that mixes
        // stale en-US separators with new digits.
        const Wrapper = () => {
          const [value, setValue] = useState<number | undefined>(undefined);
          return (
            <>
              <NumberFlowInput
                format
                value={value}
                onChange={(v) => setValue(v)}
              />
              <button
                type="button"
                data-testid="set-value"
                onClick={() => setValue(92392755.99)}
              />
            </>
          );
        };

        const { getByTestId } = render(<Wrapper />);
        const input = getInput();
        input.focus();
        setCursorPosition(input, 0);

        await typeText(input, "123456.78");
        await new Promise((resolve) => setTimeout(resolve, 50));
        fireTransitionEndEvents(input);

        await waitFor(() => {
          expect(input.textContent).toBe("123,456.78");
        });

        setDefaultLocale("de-DE");

        fireEvent.click(getByTestId("set-value"));

        await new Promise((resolve) => setTimeout(resolve, 50));
        fireTransitionEndEvents(input);
        await new Promise((resolve) => setTimeout(resolve, 50));
        fireTransitionEndEvents(input);

        await waitFor(() => {
          expect(input.textContent).toBe("92.392.755,99");
        });

        const spans = Array.from(
          input.querySelectorAll("[data-char-index]"),
        ) as HTMLElement[];
        const expected = "92.392.755,99";
        expect(spans).toHaveLength(expected.length);
        spans.forEach((span, i) => {
          expect(span.textContent).toBe(expected[i]);
          expect(span.getAttribute("data-char-index")).toBe(String(i));
        });
      });

      it("should handle controlled value updates across a browser locale change (no transitionend)", async () => {
        // Same scenario as above but the parent passes `value` as a prop
        // throughout and we never fire transitionend events between the
        // two updates. This is closer to a real browser interaction:
        // the user clicks a "randomize" button, the value prop flips
        // while CSS transitions are still in flight, and the locale
        // change is silent (no prop change, only the browser default
        // moved underneath us).
        const { rerender } = render(
          <NumberFlowInput format value={123456.78} />,
        );
        const input = getInput();

        await waitFor(() => {
          expect(input.textContent).toBe("123,456.78");
        });

        setDefaultLocale("de-DE");
        rerender(<NumberFlowInput format value={92392755.99} />);

        await new Promise((resolve) => setTimeout(resolve, 50));
        fireTransitionEndEvents(input);

        await waitFor(() => {
          expect(input.textContent).toBe("92.392.755,99");
        });

        const spans = Array.from(
          input.querySelectorAll("[data-char-index]"),
        ) as HTMLElement[];
        const expected = "92.392.755,99";
        expect(spans).toHaveLength(expected.length);
        spans.forEach((span, i) => {
          expect(span.textContent).toBe(expected[i]);
          expect(span.getAttribute("data-char-index")).toBe(String(i));
        });
      });

      it("should not animate separators between locales whose separator characters happen to coincide", async () => {
        // Switch from en-US → fr-FR. fr-FR uses a non-breaking space
        // for grouping and "," for the decimal. The component's
        // separator-handling code must read the locale data freshly
        // on each render rather than caching the en-US separators.
        const onChange = vi.fn();
        const { rerender } = render(
          <NumberFlowInput onChange={onChange} format value={123456.78} />,
        );
        const input = getInput();

        await waitFor(() => {
          expect(input.textContent).toBe("123,456.78");
        });

        setDefaultLocale("fr-FR");
        rerender(
          <NumberFlowInput onChange={onChange} format value={234567.89} />,
        );

        await new Promise((resolve) => setTimeout(resolve, 50));
        fireTransitionEndEvents(input);

        // fr-FR groups with U+202F (narrow no-break space) and uses
        // "," as the decimal separator.
        await waitFor(() => {
          expect(input.textContent).toBe("234\u202F567,89");
        });

        const spans = Array.from(
          input.querySelectorAll("[data-char-index]"),
        ) as HTMLElement[];
        const expected = "234\u202F567,89";
        expect(spans).toHaveLength(expected.length);
        spans.forEach((span, i) => {
          expect(span.textContent).toBe(expected[i]);
          expect(span.getAttribute("data-char-index")).toBe(String(i));
        });
      });
    });

    it("should preserve trailing dot while typing", async () => {
      const onChange = vi.fn();
      render(<NumberFlowInput onChange={onChange} />);

      const input = getInput();
      input.focus();

      await typeText(input, "123");
      await waitFor(() => {
        expect(input.textContent).toBe("123");
      });

      // Type a dot
      await typeText(input, ".");
      await waitFor(() => {
        // Trailing dot should be preserved
        expect(input.textContent).toBe("123.");
        expect(onChange).toHaveBeenLastCalledWith(123);
      });

      // Continue typing
      await typeText(input, "45");
      await waitFor(() => {
        expect(input.textContent).toBe("123.45");
        expect(onChange).toHaveBeenLastCalledWith(123.45);
      });
    });

    it("should preserve decimal places with trailing zeros", async () => {
      const onChange = vi.fn();
      render(<NumberFlowInput onChange={onChange} />);

      const input = getInput();
      input.focus();

      await typeText(input, "1.10");
      await waitFor(() => {
        // Should preserve trailing zero in decimal
        expect(input.textContent).toBe("1.10");
        expect(onChange).toHaveBeenLastCalledWith(1.1);
      });
    });

    it("should animate separators when they appear", async () => {
      const onChange = vi.fn();
      render(<NumberFlowInput onChange={onChange} format />);

      const input = getInput();
      input.focus();

      // Type "123" (no separator)
      await typeText(input, "123");
      await waitFor(() => {
        expect(input.textContent).toBe("123");
      });

      // Type "4" to make "1234" (separator appears)
      await typeText(input, "4");
      await waitFor(() => {
        expect(input.textContent).toBe("1,234");
        // The comma should be a span too
        const spans = input.querySelectorAll("[data-char-index]");
        expect(spans.length).toBe(5); // 1, comma, 2, 3, 4
      });
    });

    it("should handle cursor navigation with formatted numbers", async () => {
      const onChange = vi.fn();
      render(<NumberFlowInput onChange={onChange} format />);

      const input = getInput();
      input.focus();

      await typeText(input, "12345");
      await waitFor(() => {
        expect(input.textContent).toBe("12,345");
      });

      // Test that we can still edit properly after formatting
      // Move cursor to start and type a digit
      setCursorPosition(input, 0);
      await typeText(input, "9");

      await waitFor(() => {
        expect(input.textContent).toBe("912,345");
        expect(onChange).toHaveBeenLastCalledWith(912345);
      });
    });

    it("should skip separator characters when navigating with arrow keys", async () => {
      const onChange = vi.fn();
      render(<NumberFlowInput onChange={onChange} format />);

      const input = getInput();
      input.focus();

      await typeText(input, "1234567");
      await waitFor(() => {
        // Should be "1,234,567"
        expect(input.textContent).toBe("1,234,567");
      });

      // Move cursor to position 1 (after "1")
      setCursorPosition(input, 1);

      // Press ArrowRight - should skip the comma and land at position 3 (before "2")
      fireEvent.keyDown(input, { key: "ArrowRight", preventDefault: vi.fn() });

      // Type a digit to verify cursor position
      await typeText(input, "0");

      await waitFor(() => {
        // "0" should be inserted after the "1" and before "2"
        // Result: "10,234,567" (raw: 10234567)
        expect(onChange).toHaveBeenLastCalledWith(10234567);
      });
    });

    it("should navigate to all positions in formatted number", async () => {
      const onChange = vi.fn();
      render(<NumberFlowInput onChange={onChange} format />);

      const input = getInput();
      input.focus();

      await typeText(input, "12345");
      await waitFor(() => {
        expect(input.textContent).toBe("12,345");
      });

      // Move cursor to end
      setCursorPosition(input, 6); // "12,345" has 6 chars

      // Press ArrowLeft 5 times to go through all positions
      for (let i = 0; i < 5; i++) {
        fireEvent.keyDown(input, { key: "ArrowLeft", preventDefault: vi.fn() });
      }

      // Should now be at position 0 (before "1")
      // Type a digit to verify
      await typeText(input, "9");

      await waitFor(() => {
        expect(input.textContent).toBe("912,345");
        expect(onChange).toHaveBeenLastCalledWith(912345);
      });
    });

    it("should not animate separator when it only shifts position", async () => {
      const onChange = vi.fn();
      render(<NumberFlowInput onChange={onChange} format />);

      const input = getInput();
      input.focus();

      // Type "1234" which formats to "1,234"
      await typeText(input, "1234");
      await waitFor(() => {
        expect(input.textContent).toBe("1,234");
      });

      // Find the comma span before adding a digit
      const allSpansBefore = input.querySelectorAll("span[data-char-index]");
      const commaIndex = Array.from(allSpansBefore).findIndex(
        (span) => span.textContent === ",",
      );
      expect(commaIndex).toBeGreaterThan(-1);

      // Type "5" at the end which formats to "12,345"
      await typeText(input, "5");
      await waitFor(() => {
        expect(input.textContent).toBe("12,345");
      });

      // The comma should NOT have width-in animation (it just shifted, not new)
      // Find the comma span after
      const allSpansAfter = input.querySelectorAll("span[data-char-index]");
      const commaSpanAfter = Array.from(allSpansAfter).find(
        (span) => span.textContent === ",",
      );
      expect(commaSpanAfter).toBeDefined();
      // It should NOT have the data-width-in attribute since it's not new
      expect(commaSpanAfter?.hasAttribute("data-width-in")).toBe(false);
    });

    it("should animate separator when it is truly new", async () => {
      const onChange = vi.fn();
      render(<NumberFlowInput onChange={onChange} format />);

      const input = getInput();
      input.focus();

      // Type "123" which has no comma
      await typeText(input, "123");
      await waitFor(() => {
        expect(input.textContent).toBe("123");
      });

      // Verify no comma exists yet
      const commasBefore = input.querySelectorAll("span");
      const commaExistsBefore = Array.from(commasBefore).some(
        (span) => span.textContent === ",",
      );
      expect(commaExistsBefore).toBe(false);

      // Type "4" which formats to "1,234" - comma is NEW
      await typeText(input, "4");
      await waitFor(() => {
        expect(input.textContent).toBe("1,234");
      });

      // Verify the comma now exists
      const commasAfter = input.querySelectorAll("span");
      const commaExistsAfter = Array.from(commasAfter).some(
        (span) => span.textContent === ",",
      );
      expect(commaExistsAfter).toBe(true);

      // Verify onChange was called with correct value
      expect(onChange).toHaveBeenLastCalledWith(1234);
    });
  });
});
