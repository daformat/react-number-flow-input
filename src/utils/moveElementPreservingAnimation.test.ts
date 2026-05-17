import { afterEach, describe, expect, it } from "vitest";

import { moveElementPreservingAnimation } from "./moveElementPreservingAnimation.js";

afterEach(() => {
  document.body.innerHTML = "";
});

describe("moveElementPreservingAnimation", () => {
  it("appends the element to the parent when referenceNode is null", () => {
    const parent = document.createElement("div");
    const a = document.createElement("span");
    const b = document.createElement("span");
    parent.appendChild(a);
    document.body.appendChild(parent);

    moveElementPreservingAnimation(b, parent, null);

    expect(parent.children[1]).toBe(b);
  });

  it("inserts the element before the given referenceNode", () => {
    const parent = document.createElement("div");
    const first = document.createElement("span");
    const target = document.createElement("span");
    const moving = document.createElement("span");
    parent.appendChild(first);
    parent.appendChild(target);
    document.body.appendChild(parent);

    moveElementPreservingAnimation(moving, parent, target);

    expect(parent.children[0]).toBe(first);
    expect(parent.children[1]).toBe(moving);
    expect(parent.children[2]).toBe(target);
  });

  it("relocates an existing child to the requested position", () => {
    const parent = document.createElement("div");
    const a = document.createElement("span");
    a.textContent = "a";
    const b = document.createElement("span");
    b.textContent = "b";
    const c = document.createElement("span");
    c.textContent = "c";
    parent.appendChild(a);
    parent.appendChild(b);
    parent.appendChild(c);
    document.body.appendChild(parent);

    moveElementPreservingAnimation(c, parent, a);

    expect(Array.from(parent.children).map((n) => n.textContent)).toEqual([
      "c",
      "a",
      "b",
    ]);
  });

  it("does not crash when the moved element has data-flow without an active translate", () => {
    const parent = document.createElement("div");
    const moving = document.createElement("span");
    moving.setAttribute("data-flow", "");
    moving.setAttribute("data-show", "");
    document.body.appendChild(parent);

    expect(() =>
      moveElementPreservingAnimation(moving, parent, null),
    ).not.toThrow();
    expect(parent.firstChild).toBe(moving);
  });
});
