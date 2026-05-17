import { afterEach, describe, expect, it } from "vitest";

import {
  clearWidthStyles,
  findNodeAtPosition,
  getSelectionRange,
  hasWidthStyles,
  isTransparent,
  measureText,
  removeTransparentColor,
  setCursorAtPosition,
  setCursorPositionInElement,
} from "./utils.js";

const makeSpansContainer = (chars: string): HTMLElement => {
  const root = document.createElement("span");
  for (let i = 0; i < chars.length; i++) {
    const s = document.createElement("span");
    s.setAttribute("data-char-index", String(i));
    s.textContent = chars[i] ?? "";
    root.appendChild(s);
  }
  document.body.appendChild(root);
  return root;
};

afterEach(() => {
  document.body.innerHTML = "";
});

describe("measureText", () => {
  it("returns a finite number and cleans up the temp element", () => {
    const ref = document.createElement("span");
    document.body.appendChild(ref);
    const initialChildren = document.body.children.length;
    const w = measureText("hello", ref);
    expect(typeof w).toBe("number");
    expect(Number.isFinite(w)).toBe(true);
    expect(document.body.children.length).toBe(initialChildren);
  });
});

describe("getSelectionRange", () => {
  it("reports the formatted-offset start/end of the current selection", () => {
    const root = makeSpansContainer("1234");
    const a = root.children[1]!; // "2"
    const c = root.children[3]!; // "4"
    const range = document.createRange();
    range.setStart(a.firstChild!, 0);
    range.setEnd(c.firstChild!, 1);
    const sel = window.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(range);

    const { start, end } = getSelectionRange(root, sel);
    expect(start).toBe(1); // before "2"
    expect(end).toBe(4); // after "4"
  });
});

describe("setCursorPositionInElement", () => {
  it("places the caret at the start of the targeted span", () => {
    const root = makeSpansContainer("1,234");
    setCursorPositionInElement(root, 2); // "2" in "1,234"
    const sel = window.getSelection()!;
    expect(sel.rangeCount).toBe(1);
    const range = sel.getRangeAt(0);
    expect(range.startContainer.nodeType).toBe(Node.TEXT_NODE);
    expect(
      range.startContainer.parentElement?.getAttribute("data-char-index"),
    ).toBe("2");
    expect(range.startOffset).toBe(0);
  });

  it("uses the last span for an end-of-text position", () => {
    const root = makeSpansContainer("1,234");
    setCursorPositionInElement(root, 5); // end
    const sel = window.getSelection()!;
    const range = sel.getRangeAt(0);
    expect(
      range.startContainer.parentElement?.getAttribute("data-char-index"),
    ).toBe("4");
    expect(range.startOffset).toBe(1);
  });

  it("clamps positions past the end without throwing", () => {
    const root = makeSpansContainer("1,234");
    expect(() => setCursorPositionInElement(root, 999)).not.toThrow();
  });
});

describe("setCursorAtPosition", () => {
  it("places the caret using a TreeWalker for plain text content", () => {
    const root = document.createElement("span");
    root.textContent = "1,234";
    document.body.appendChild(root);
    setCursorAtPosition(root, 3);
    const sel = window.getSelection()!;
    const range = sel.getRangeAt(0);
    expect(range.startContainer.nodeType).toBe(Node.TEXT_NODE);
    expect(range.startOffset).toBe(3);
  });
});

describe("isTransparent / removeTransparentColor", () => {
  it("detects 'transparent' / 'rgba(0,0,0,0)' inline colors", () => {
    const el = document.createElement("span");
    el.style.color = "transparent";
    expect(isTransparent(el)).toBe(true);
    el.style.color = "rgba(0, 0, 0, 0)";
    expect(isTransparent(el)).toBe(true);
    el.style.color = "red";
    expect(isTransparent(el)).toBe(false);
  });

  it("clears the inline color when it was transparent", () => {
    const el = document.createElement("span");
    el.style.color = "transparent";
    removeTransparentColor(el);
    expect(el.style.color).toBe("");
  });

  it("leaves non-transparent colors alone", () => {
    const el = document.createElement("span");
    el.style.color = "red";
    removeTransparentColor(el);
    expect(el.style.color).toBe("red");
  });
});

describe("findNodeAtPosition", () => {
  it("returns the text node + offset that contains the target position", () => {
    // Multi-char single text node so the offset is meaningful.
    const root = document.createElement("span");
    root.textContent = "abcdef";
    document.body.appendChild(root);
    const found = findNodeAtPosition(root, 3);
    expect(found).not.toBeNull();
    expect(found?.node.nodeType).toBe(Node.TEXT_NODE);
    expect(found?.offset).toBe(3);
  });

  it("returns the end of the matching text node when target sits on a span boundary", () => {
    // With one-char text nodes, position N falls at the end of node N-1
    // (offset 1) rather than at the start of node N (offset 0).
    const root = makeSpansContainer("abcdef");
    const found = findNodeAtPosition(root, 3);
    expect(found?.offset).toBe(1);
    expect(found?.node.parentElement?.getAttribute("data-char-index")).toBe(
      "2",
    );
  });

  it("returns null when the position is past the end", () => {
    const root = makeSpansContainer("ab");
    expect(findNodeAtPosition(root, 99)).toBeNull();
  });
});

describe("clearWidthStyles / hasWidthStyles", () => {
  it("hasWidthStyles reflects inline width/min/max styles", () => {
    const el = document.createElement("span");
    expect(hasWidthStyles(el)).toBe(false);
    el.style.width = "10px";
    expect(hasWidthStyles(el)).toBe(true);
    el.style.width = "";
    el.style.minWidth = "5px";
    expect(hasWidthStyles(el)).toBe(true);
  });

  it("clearWidthStyles resets width/min/max/display", () => {
    const el = document.createElement("span");
    el.style.width = "10px";
    el.style.minWidth = "5px";
    el.style.maxWidth = "20px";
    el.style.display = "inline-block";
    clearWidthStyles(el);
    expect(el.style.width).toBe("");
    expect(el.style.minWidth).toBe("");
    expect(el.style.maxWidth).toBe("");
    expect(el.style.display).toBe("");
  });
});
