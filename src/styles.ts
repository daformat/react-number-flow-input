import { cssEasing } from "./utils/cssEasing.js";

const STYLE_ID = "daformat-react-number-flow-input-styles";

const easeOutCubic = cssEasing["--ease-out-cubic"];

const css = `
[data-numberflow-input-root] [data-numberflow-input-wrapper] {
  margin: -10px;
  mask-image: linear-gradient(
    to bottom,
    transparent,
    #000 10px,
    #000 calc(100% - 10px),
    transparent
  );
  padding: 10px;
  position: relative;
}

[data-numberflow-input-root] [data-numberflow-input-contenteditable] {
  display: inline-block;
  outline: none;
}

[data-numberflow-input-root] [data-numberflow-input-contenteditable] span {
  display: inline-block;
}

[data-numberflow-input-root] [data-numberflow-input-contenteditable]:empty::before {
  content: attr(data-placeholder);
}

[data-numberflow-input-root] [data-numberflow-input-contenteditable] [data-flow] {
  transition:
    translate 0.2s ${easeOutCubic},
    width 0.2s ${easeOutCubic},
    min-width 0.2s ${easeOutCubic},
    max-width 0.2s ${easeOutCubic};
  translate: 0 100%;
}

[data-numberflow-input-root] [data-numberflow-input-contenteditable] [data-flow][data-show] {
  translate: 0 0;
}

[data-numberflow-input-root] [data-numberflow-input-contenteditable] [data-flow][data-hide] {
  translate: 0 100%;
}

[data-numberflow-input-root] [data-numberflow-input-contenteditable] [data-width-animate] {
  transition:
    width 0.4s ${easeOutCubic},
    min-width 0.4s ${easeOutCubic},
    max-width 0.4s ${easeOutCubic};
}

[data-numberflow-input-root] [data-barrel-wheel] {
  display: block;
  height: 1em;
  overflow: visible;
  pointer-events: none;
  position: absolute;
  user-select: none;
  -webkit-user-select: none;
  -moz-user-select: none;
  -ms-user-select: none;
  -webkit-touch-callout: none;
  width: 1ch;
}

[data-numberflow-input-root] [data-barrel-wheel]::selection,
[data-numberflow-input-root] [data-barrel-wheel] *::selection {
  background: transparent;
}

[data-numberflow-input-root] [data-barrel-wheel] [data-barrel-wheel-digits-wrapper] {
  --digit-gap: 5px;
  --digit-position: 0;
  display: flex;
  flex-direction: column;
  gap: var(--digit-gap);
  position: relative;
  transform: translateY(calc(var(--digit-position) * (-1em - var(--digit-gap))));
  transition: none;
  user-select: none;
  -webkit-user-select: none;
  -moz-user-select: none;
  -ms-user-select: none;
  -webkit-touch-callout: none;
  width: 100%;
  will-change: transform;
}

[data-numberflow-input-root] [data-barrel-wheel] [data-barrel-wheel-digits-wrapper][data-animating] {
  transition: transform 0.4s ${easeOutCubic};
}

[data-numberflow-input-root] [data-barrel-wheel][data-direction="up"] {
  align-items: flex-end;
}

[data-numberflow-input-root] [data-barrel-wheel][data-direction="up"] [data-barrel-wheel-digits-wrapper] {
  transform: translateY(calc((9 - var(--digit-position)) * (1em + var(--digit-gap))));
}

[data-numberflow-input-root] [data-barrel-wheel] [data-barrel-digit] {
  display: inline-flex;
  height: 1em;
  line-height: 1em;
  pointer-events: none;
  text-align: center;
  user-select: none;
  -webkit-user-select: none;
  -moz-user-select: none;
  -ms-user-select: none;
  -webkit-touch-callout: none;
  width: 100%;
}
`;

let injected = false;

/**
 * Injects the component's stylesheet into <head> exactly once.
 * Safe to call in SSR (no-op) and on every mount (idempotent).
 */
export const injectStyles = (): void => {
  if (injected) {
    return;
  }
  if (typeof document === "undefined") {
    return;
  }
  if (document.getElementById(STYLE_ID)) {
    injected = true;
    return;
  }
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = css;
  document.head.appendChild(style);
  injected = true;
};
