import type { Maybe } from "./maybe.js";

export interface BarrelWheelData {
  sequence: string[];
  direction: "up" | "down";
}

// removes all transforms on ancestors, returns a cleanup function that restores them
export const temporarilyRemoveAncestorsTransform = (
  element: Maybe<Element>,
) => {
  if (!element) {
    return () => {};
  }
  const cache = new Map<
    HTMLElement,
    { transform: string; scale: string; rotate: string; translate: string }
  >();
  let parent = element.parentElement;
  while (parent) {
    const computedStyle = window.getComputedStyle(parent);
    const transform = computedStyle.transform;
    const scale = computedStyle.scale;
    const rotate = computedStyle.rotate;
    const translate = computedStyle.translate;
    const hasAny = [transform, scale, rotate, translate].some(
      (v) => v !== "none",
    );
    if (hasAny) {
      cache.set(parent, { transform, scale, rotate, translate });
      parent.style.transform = "none";
      parent.style.scale = "1";
      parent.style.rotate = "0deg";
      parent.style.translate = "0 0";
    }
    parent = parent.parentElement;
  }
  return () => {
    if (cache.size > 0) {
      cache.forEach(({ transform, scale, rotate, translate }, parent) => {
        parent.style.transform = transform;
        parent.style.scale = scale;
        parent.style.rotate = rotate;
        parent.style.translate = translate;
      });
    }
  };
};

export const cleanupWidthAnimation = (charSpan: HTMLElement): void => {
  charSpan.removeAttribute("data-width-animate");
  charSpan.style.width = "";
  charSpan.style.minWidth = "";
  charSpan.style.maxWidth = "";
  const inlineDisplay = charSpan.style.display;
  if (inlineDisplay === "inline-block") {
    charSpan.style.display = "";
  }
  const transition = charSpan.style.transition;
  if (
    transition &&
    (transition.includes("width") ||
      transition.includes("min-width") ||
      transition.includes("max-width"))
  ) {
    charSpan.style.transition = "";
  }
};

export const repositionBarrelWheel = (
  wheel: HTMLElement,
  charSpan: HTMLElement,
  parentContainer: HTMLElement,
): void => {
  const cleanup = temporarilyRemoveAncestorsTransform(parentContainer);

  const rect = charSpan.getBoundingClientRect();
  const parentRect = parentContainer.getBoundingClientRect();
  wheel.style.left = `${rect.left - parentRect.left}px`;
  wheel.style.top = `${rect.top - parentRect.top}px`;
  wheel.style.width = `${rect.width}px`;
  wheel.style.height = `${rect.height}px`;

  cleanup();
};

export const getBarrelWheel = (
  container: HTMLElement,
  index: number,
): HTMLElement | null => {
  const selector = `[data-char-index="${index}"][data-barrel-wheel]`;
  return container.querySelector(selector) as HTMLElement | null;
};

export const getAllBarrelWheels = (container: HTMLElement): HTMLElement[] => {
  const selector = "[data-char-index][data-barrel-wheel]";
  return Array.from(container.querySelectorAll(selector)) as HTMLElement[];
};

export const setWidthConstraints = (span: HTMLElement, width: number): void => {
  span.style.display = "inline-block";
  span.style.width = `${width}px`;
  span.style.minWidth = `${width}px`;
  span.style.maxWidth = `${width}px`;
};

export const clearBarrelWheelsAndSpans = (
  spanElement: HTMLElement,
  parentContainer: HTMLElement | null,
): void => {
  while (spanElement.firstChild) {
    spanElement.removeChild(spanElement.firstChild);
  }
  if (parentContainer) {
    const selector = "[data-char-index][data-barrel-wheel]";
    parentContainer
      .querySelectorAll(selector)
      .forEach((wheel) => wheel.remove());
  }
};
