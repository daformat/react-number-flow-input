import { afterEach, describe, expect, it } from "vitest";

import {
  cleanupWidthAnimation,
  clearBarrelWheelsAndSpans,
  getAllBarrelWheels,
  getBarrelWheel,
  repositionBarrelWheel,
  setWidthConstraints,
  temporarilyRemoveAncestorsTransform,
} from "./barrelWheel.js";

const makeWheel = (index: number): HTMLElement => {
  const w = document.createElement("span");
  w.setAttribute("data-char-index", String(index));
  w.setAttribute("data-barrel-wheel", "");
  return w;
};

afterEach(() => {
  document.body.innerHTML = "";
});

describe("temporarilyRemoveAncestorsTransform", () => {
  it("zeroes out transform-related styles up the ancestor chain and restores them on cleanup", () => {
    const grand = document.createElement("div");
    const parent = document.createElement("div");
    const child = document.createElement("span");
    grand.style.transform = "scale(1.5)";
    grand.style.scale = "2";
    grand.style.rotate = "45deg";
    grand.style.translate = "10px 10px";
    parent.style.transform = "translateY(50%)";
    grand.appendChild(parent);
    parent.appendChild(child);
    document.body.appendChild(grand);

    const restore = temporarilyRemoveAncestorsTransform(child);

    expect(grand.style.transform).toBe("none");
    expect(grand.style.scale).toBe("1");
    expect(grand.style.rotate).toBe("0deg");
    expect(grand.style.translate).toBe("0 0");
    expect(parent.style.transform).toBe("none");

    restore();

    expect(grand.style.transform).toBe("scale(1.5)");
    expect(grand.style.scale).toBe("2");
    expect(grand.style.rotate).toBe("45deg");
    expect(grand.style.translate).toBe("10px 10px");
    expect(parent.style.transform).toBe("translateY(50%)");
  });

  it("returns a no-op cleanup when given a null element", () => {
    const cleanup = temporarilyRemoveAncestorsTransform(null);
    expect(() => cleanup()).not.toThrow();
  });
});

describe("cleanupWidthAnimation", () => {
  it("removes width/min/max + data-width-animate and inline-block display", () => {
    const el = document.createElement("span");
    el.setAttribute("data-width-animate", "");
    el.style.width = "10px";
    el.style.minWidth = "10px";
    el.style.maxWidth = "10px";
    el.style.display = "inline-block";
    el.style.transition = "width 0.4s ease";

    cleanupWidthAnimation(el);

    expect(el.hasAttribute("data-width-animate")).toBe(false);
    expect(el.style.width).toBe("");
    expect(el.style.minWidth).toBe("");
    expect(el.style.maxWidth).toBe("");
    expect(el.style.display).toBe("");
    expect(el.style.transition).toBe("");
  });

  it("does not touch display unless it was inline-block", () => {
    const el = document.createElement("span");
    el.style.display = "block";
    el.style.width = "5px";
    cleanupWidthAnimation(el);
    expect(el.style.display).toBe("block");
  });

  it("does not clear unrelated transitions", () => {
    const el = document.createElement("span");
    el.style.transition = "color 0.4s ease";
    cleanupWidthAnimation(el);
    expect(el.style.transition).toBe("color 0.4s ease");
  });
});

describe("repositionBarrelWheel", () => {
  it("copies the char span's rect into the wheel's left/top/width/height", () => {
    const parent = document.createElement("div");
    const char = document.createElement("span");
    const wheel = document.createElement("span");
    parent.appendChild(char);
    parent.appendChild(wheel);
    document.body.appendChild(parent);

    // jsdom returns 0-rects, but the function should still write px units.
    repositionBarrelWheel(wheel, char, parent);

    expect(wheel.style.left.endsWith("px")).toBe(true);
    expect(wheel.style.top.endsWith("px")).toBe(true);
    expect(wheel.style.width.endsWith("px")).toBe(true);
    expect(wheel.style.height.endsWith("px")).toBe(true);
  });
});

describe("getBarrelWheel / getAllBarrelWheels", () => {
  it("returns null when no wheel matches the index", () => {
    const parent = document.createElement("div");
    document.body.appendChild(parent);
    expect(getBarrelWheel(parent, 0)).toBeNull();
  });

  it("returns the wheel with the given data-char-index", () => {
    const parent = document.createElement("div");
    parent.appendChild(makeWheel(0));
    const target = makeWheel(2);
    parent.appendChild(target);
    parent.appendChild(makeWheel(5));
    document.body.appendChild(parent);

    expect(getBarrelWheel(parent, 2)).toBe(target);
  });

  it("getAllBarrelWheels returns every wheel in document order", () => {
    const parent = document.createElement("div");
    const w1 = makeWheel(0);
    const w2 = makeWheel(1);
    parent.appendChild(w1);
    parent.appendChild(w2);
    document.body.appendChild(parent);

    expect(getAllBarrelWheels(parent)).toEqual([w1, w2]);
  });
});

describe("setWidthConstraints", () => {
  it("locks display + width/min/max to the given px value", () => {
    const el = document.createElement("span");
    setWidthConstraints(el, 42);
    expect(el.style.display).toBe("inline-block");
    expect(el.style.width).toBe("42px");
    expect(el.style.minWidth).toBe("42px");
    expect(el.style.maxWidth).toBe("42px");
  });
});

describe("clearBarrelWheelsAndSpans", () => {
  it("empties the span element and removes barrel wheels from the parent", () => {
    const parent = document.createElement("div");
    const spanRoot = document.createElement("span");
    spanRoot.appendChild(document.createElement("span"));
    spanRoot.appendChild(document.createElement("span"));
    parent.appendChild(spanRoot);
    parent.appendChild(makeWheel(0));
    parent.appendChild(makeWheel(1));
    document.body.appendChild(parent);

    clearBarrelWheelsAndSpans(spanRoot, parent);

    expect(spanRoot.firstChild).toBeNull();
    expect(getAllBarrelWheels(parent)).toEqual([]);
  });

  it("works with a null parent (just clears the span)", () => {
    const spanRoot = document.createElement("span");
    spanRoot.appendChild(document.createElement("span"));
    document.body.appendChild(spanRoot);
    clearBarrelWheelsAndSpans(spanRoot, null);
    expect(spanRoot.firstChild).toBeNull();
  });
});
