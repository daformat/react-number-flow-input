import type { ForwardedRef, RefObject } from "react";

/**
 * Combines the given refs into a single ref
 */
export const combineRefs = <T>(
  ...refs: (ForwardedRef<T> | RefObject<T> | undefined)[]
): ((node: T | null) => void) => {
  return (node) => {
    refs.forEach((ref) => {
      if (typeof ref === "function") {
        ref(node);
      } else if (ref != null) {
        (ref as { current: T | null }).current = node;
      }
    });
  };
};
