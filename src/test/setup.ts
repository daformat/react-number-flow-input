import "@testing-library/jest-dom/vitest";

// Pin the runtime locale used by Intl.NumberFormat to "en-US" so that
// assertions about formatted numbers, group separators and decimal
// characters behave identically on every developer machine and on CI.
// Tests that need a different locale still pass it explicitly via the
// `locale` prop and override this default.
//
// `defaultLocale` is the locale substituted whenever `Intl.NumberFormat`
// is invoked with no locale argument. Tests can call `setDefaultLocale`
// to simulate the browser switching its default locale at runtime
// (e.g. via Chrome DevTools' "Sensors → Locale" panel), then restore
// it in `afterEach` if needed.
const OriginalNumberFormat = Intl.NumberFormat;
let defaultLocale: string = "en-US";

export const setDefaultLocale = (locale: string): void => {
  defaultLocale = locale;
};

const PatchedNumberFormat = function (
  this: unknown,
  locales?: Intl.LocalesArgument,
  options?: Intl.NumberFormatOptions,
) {
  const resolvedLocales: Intl.LocalesArgument =
    locales === undefined ? defaultLocale : locales;
  if (new.target) {
    return new OriginalNumberFormat(resolvedLocales, options);
  }
  return OriginalNumberFormat(resolvedLocales, options);
} as unknown as typeof Intl.NumberFormat;
// @ts-expect-error we can write the proto here
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
