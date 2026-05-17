import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";

import { combineRefs } from "./combineRefs.js";

describe("combineRefs", () => {
  it("assigns the node to a RefObject's current", () => {
    const ref = createRef<HTMLDivElement>();
    const setter = combineRefs(ref);
    const node = document.createElement("div");
    setter(node);
    expect(ref.current).toBe(node);
  });

  it("invokes a function ref with the node", () => {
    const fn = vi.fn();
    const setter = combineRefs(fn);
    const node = document.createElement("div");
    setter(node);
    expect(fn).toHaveBeenCalledWith(node);
  });

  it("fans out to every ref it was given", () => {
    const ref = createRef<HTMLSpanElement>();
    const fn = vi.fn();
    const setter = combineRefs(ref, fn);
    const node = document.createElement("span");
    setter(node);
    expect(ref.current).toBe(node);
    expect(fn).toHaveBeenCalledWith(node);
  });

  it("safely ignores undefined / null refs", () => {
    const ref = createRef<HTMLDivElement>();
    const setter = combineRefs(undefined, ref, null as never);
    const node = document.createElement("div");
    expect(() => setter(node)).not.toThrow();
    expect(ref.current).toBe(node);
  });

  it("passes null through on cleanup", () => {
    const ref = createRef<HTMLDivElement>();
    const setter = combineRefs(ref);
    setter(document.createElement("div"));
    setter(null);
    expect(ref.current).toBeNull();
  });
});
