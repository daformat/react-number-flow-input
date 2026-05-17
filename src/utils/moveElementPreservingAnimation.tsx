/**
 * Move an element in the DOM while preserving any ongoing CSS translate animation.
 * CSS transitions are canceled when elements are moved in DOM, so we use
 * Web Animations API to continue the animation from where it left off.
 */
export const moveElementPreservingAnimation = (
  element: HTMLElement,
  parent: HTMLElement,
  referenceNode: Node | null,
): void => {
  // Check if element has ongoing translate animation (data-flow attribute)
  const hasFlowAnimation = element.hasAttribute("data-flow");
  const hasShowAttribute = element.hasAttribute("data-show");

  // Only need to preserve animation if it's a flow element that's still animating
  // (has data-flow but hasn't reached final state with data-show, or just got data-show)
  let translateState: { from: string; progress: number } | null = null;

  if (hasFlowAnimation) {
    // Get the current computed translate value
    const computedStyle = window.getComputedStyle(element);
    const currentTranslate = computedStyle.translate;

    // Parse the translate value to determine animation progress
    // data-flow starts at "0 100%" and ends at "0 0" when data-show is added
    if (currentTranslate && currentTranslate !== "none") {
      // Parse "0px Ypx" or "0 Y%" format
      const match = currentTranslate.match(/^0(?:px)?\s+(-?[\d.]+)(px|%)$/);
      if (match && match[1] && match[2]) {
        const value = parseFloat(match[1]);
        const unit = match[2];
        // If not at final position (0), animation is in progress
        if (Math.abs(value) > 0.1) {
          translateState = {
            from: currentTranslate,
            progress: unit === "%" ? (100 - Math.abs(value)) / 100 : 0,
          };
        }
      }
    }
  }

  // Perform the move
  if (referenceNode) {
    parent.insertBefore(element, referenceNode);
  } else {
    parent.appendChild(element);
  }

  // If element was mid-animation, continue it using Web Animations API
  if (translateState && hasShowAttribute) {
    // Cancel any existing CSS transition by setting inline style
    element.style.translate = translateState.from;

    // Force reflow to apply the inline style
    void element.offsetWidth;

    // Calculate remaining duration based on progress (original duration is 200ms)
    const remainingDuration = Math.max(50, 200 * (1 - translateState.progress));

    // Use Web Animations API to animate from current position to final
    element.animate(
      [{ translate: translateState.from }, { translate: "0 0" }],
      {
        duration: remainingDuration,
        easing: "cubic-bezier(0.33, 1, 0.68, 1)", // --ease-out-cubic
        fill: "forwards",
      },
    ).onfinish = () => {
      // Clean up inline style after animation completes
      element.style.translate = "";
    };
  }
};
