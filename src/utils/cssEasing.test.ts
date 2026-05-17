import { describe, expect, it } from "vitest";

import { cssEasing } from "./cssEasing.js";

describe("cssEasing", () => {
  it("exposes the documented easing curves used by the component", () => {
    expect(cssEasing["--ease-out-cubic"]).toBe(
      "cubic-bezier(.215, .61, .355, 1)",
    );
    expect(cssEasing["--ease-in-cubic"]).toBe(
      "cubic-bezier(.550, .055, .675, .19)",
    );
  });

  it("only contains valid CSS easing function strings", () => {
    for (const value of Object.values(cssEasing)) {
      expect(typeof value).toBe("string");
      expect(
        value.startsWith("cubic-bezier(") || value.startsWith("linear("),
      ).toBe(true);
    }
  });
});
