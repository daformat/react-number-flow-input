import "@testing-library/jest-dom/vitest";

// Pin the runtime locale used by Intl.NumberFormat to "en-US" so that
// assertions about formatted numbers, group separators and decimal
// characters behave identically on every developer machine and on CI.
// Tests that need a different locale still pass it explicitly via the
// `locale` prop and override this default.
const OriginalNumberFormat = Intl.NumberFormat;
const PatchedNumberFormat = function (
  this: unknown,
  locales?: Intl.LocalesArgument,
  options?: Intl.NumberFormatOptions,
) {
  const resolvedLocales: Intl.LocalesArgument =
    locales === undefined ? "en-US" : locales;
  if (new.target) {
    return new OriginalNumberFormat(resolvedLocales, options);
  }
  return OriginalNumberFormat(resolvedLocales, options);
} as unknown as typeof Intl.NumberFormat;
PatchedNumberFormat.prototype = OriginalNumberFormat.prototype;
PatchedNumberFormat.supportedLocalesOf =
  OriginalNumberFormat.supportedLocalesOf.bind(OriginalNumberFormat);
Intl.NumberFormat = PatchedNumberFormat;

// jsdom does not implement the Web Animations API; SplitFlapDisplayChar calls
// `element.getAnimations({ subtree: true })` once a flip completes, so we
// stub it with a no-op that returns no running animations.
if (!("getAnimations" in Element.prototype)) {
  Object.defineProperty(Element.prototype, "getAnimations", {
    configurable: true,
    writable: true,
    value: function getAnimations() {
      return [];
    },
  });
}
