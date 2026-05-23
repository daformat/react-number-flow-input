# React number flow input

![NPM Version](https://img.shields.io/npm/v/%40daformat%2Freact-number-flow-input)
![NPM Downloads](https://img.shields.io/npm/dm/%40daformat%2Freact-number-flow-input)  
[![Follow daformat on GitHub](https://img.shields.io/github/followers/daformat?label=Follow%20%40daformat&style=social)](https://github.com/daformat)
[![Follow daformat on X](https://img.shields.io/twitter/follow/daformat?label=Follow%20%40daformat&style=social)](https://twitter.com/daformat)

A zero-dependency React component that renders an animated number input. Digits animate in as they are typed, selecting and replacing a single digit gives you the popular barrel-wheel effect made famous by [NumberFlow](https://number-flow.barvian.me/), and external `value` changes animate as a coordinated barrel-wheel roll across every digit.

## Demo

https://hello-mat.com/design-engineering/component/number-flow-input

## Features

- **Zero runtime dependencies** — peer-depends on React `>= 18`, nothing else.
- **Two synchronized inputs** — a `contenteditable` for the animated display and a hidden `<input>` for native form integration (`name`, `form`, `required`, ...).
- **Controlled or uncontrolled** — use `value` or `defaultValue`.
- **Locale-aware formatting** — optional `Intl.NumberFormat` thousand separators and locale decimal characters.
- **Smart editing** — undo/redo, copy/cut/paste, decimal-scale clamping, max-length, negative numbers, leading-zero handling, etc.
- **Custom validation** — `isAllowed(value)` predicate to reject values you don't like.
- **Animations included** — digit flow-in, barrel-wheel digit rolls, separator slide-in/out, width animation on group changes.
- **Minimal styles auto-injected** — a `<style>` tag is added to `<head>` on first mount, no CSS import required. SSR-safe.
- **Fully typed** — ships with TypeScript types.
- **Well tested** — 220+ unit and integration tests.

## Installation

```bash
npm install @daformat/react-number-flow-input
```

```bash
yarn add @daformat/react-number-flow-input
```

```bash
pnpm add @daformat/react-number-flow-input
```

```bash
bun add @daformat/react-number-flow-input
```

```bash
deno add npm:@daformat/react-number-flow-input
```

## Quick start

```tsx
import { NumberFlowInput } from "@daformat/react-number-flow-input";

export function Example() {
  return (
    <NumberFlowInput
      defaultValue={1234}
      format
      onChange={(value) => console.log(value)}
    />
  );
}
```

## Usage

### Uncontrolled

```tsx
<NumberFlowInput defaultValue={42} onChange={(value) => console.log(value)} />
```

### Controlled

```tsx
import { useState } from "react";
import { NumberFlowInput } from "@daformat/react-number-flow-input";

function Controlled() {
  const [value, setValue] = useState<number | undefined>(0);
  return <NumberFlowInput value={value} onChange={setValue} />;
}
```

External updates to `value` are diffed against the previous value and animate as a coordinated barrel-wheel roll. Initial mount never animates.

To opt out of animations on external `value` changes — for example when restoring a value programmatically or when binding to a noisy state source — pass `animateOnValueChange={false}`:

```tsx
<NumberFlowInput
  value={value}
  onChange={setValue}
  animateOnValueChange={false}
/>
```

User typing and `format` / `locale` toggles still animate; only the prop-driven value updates snap.

### Formatted display

```tsx
<NumberFlowInput format value={1234567} /> // → "1,234,567"
<NumberFlowInput format locale="de-DE" value={1234567} /> // → "1.234.567"
```

#### Custom formatter

`format` also accepts a function for full control over the displayed string. The callback receives the raw display value (digits, optional leading `-`, optional single `.` as decimal) and must return the formatted text:

```tsx
<NumberFlowInput
  defaultValue={1234.5}
  format={(raw) => `$ ${raw}`}
  onChange={console.log}
/>
// → "$ 1234.5"
```

The callback is only invoked for "real" values — empty / `"-"` / `"."` / `"-."` intermediate states bypass it and render verbatim. If your function throws, the component falls back to a safe locale-decimal-swap output.

For correct cursor positioning and animation diffing, your output should:

- use the locale's decimal character (or `.` if no locale is set);
- preserve the digit order from the raw input.

### Decimal scale & negative numbers

```tsx
<NumberFlowInput allowNegative decimalScale={2} defaultValue={-1234.5} format />
```

`decimalScale={0}` prevents the user from typing a decimal point at all. `decimalScale={n}` clamps the number of fractional digits.

### Locale

```tsx
<NumberFlowInput locale="fr-FR" defaultValue={1234.5} format />
// Renders "1 234,5" (or the locale's group separator).
```

The component accepts both `.` and the locale's decimal separator as input — typing either one resolves to the locale's decimal in the display.

### Custom validation

```tsx
<NumberFlowInput
  isAllowed={(value) => value == null || (value >= 0 && value <= 100)}
/>
```

Any keystroke that would produce a value outside the allowed range is rejected and never reaches `onChange`.

### Length limit

```tsx
<NumberFlowInput maxLength={6} />
```

### Form integration

The component renders a hidden `<input>` (offscreen, `readonly`) that mirrors the current numeric value, so it participates in native form submissions:

```tsx
<form action="/submit" method="post">
  <NumberFlowInput name="price" required min={0} max={9999} defaultValue={0} />
  <button type="submit">Save</button>
</form>
```

`name`, `form`, `required`, `min`, `max`, `minLength` and `maxLength` are forwarded to the hidden input.

### Auto focus / events

```tsx
<NumberFlowInput
  autoFocus
  onFocus={() => console.log("focused")}
  onBlur={() => console.log("blurred")}
/>
```

### Ref

The `ref` is forwarded to the `contenteditable` element:

```tsx
const ref = useRef<HTMLElement>(null);
<NumberFlowInput ref={ref} />;
```

## API

```ts
import type {
  NumberFlowInputProps,
  NumberFlowInputCommonProps,
  NumberFlowInputControlledProps,
  NumberFlowInputUncontrolledProps,
} from "@daformat/react-number-flow-input";
```

### Value props

| Prop                   | Type                  | Default | Description                                                                                                                                                                                                 |
| ---------------------- | --------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `value`                | `number \| undefined` | —       | Controlled value. When provided, changes animate as a barrel-wheel roll (except on initial mount).                                                                                                          |
| `defaultValue`         | `number`              | —       | Uncontrolled starting value.                                                                                                                                                                                |
| `onChange`             | `(value) => void`     | —       | Called with the parsed number (or `undefined` for intermediate states like `""`, `"-"`, `"."`, `"-."`).                                                                                                     |
| `onChangeText`         | `(rawText) => void`   | —       | Fires alongside `onChange` with the raw string representation (e.g. `"12345678901234567890.123"`). Use this when you need to preserve precision beyond JavaScript's `number` — see [Precision](#precision). |
| `animateOnValueChange` | `boolean`             | `true`  | When `false`, external `value` updates snap instantly — no digit-roll, no separator slide, no flow animation. Typing and `format` / `locale` toggles still animate.                                         |

> `value` and `defaultValue` are mutually exclusive — TypeScript will enforce this.

### Formatting

| Prop                 | Type                                 | Default | Description                                                                                                                      |
| -------------------- | ------------------------------------ | ------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `format`             | `boolean \| (raw: string) => string` | `false` | `true` → group via `Intl.NumberFormat`. A function takes full control of the output (see [Custom formatter](#custom-formatter)). |
| `locale`             | `string \| Intl.Locale`              | —       | Locale used for decimal and group separators. Defaults to the runtime's locale.                                                  |
| `decimalScale`       | `number`                             | —       | Max number of fractional digits. `0` forbids a decimal point entirely.                                                           |
| `autoAddLeadingZero` | `boolean`                            | `false` | Convert leading `.5` → `0.5` (and `-.5` → `-0.5`) automatically.                                                                 |
| `allowNegative`      | `boolean`                            | `false` | Allow typing a leading `-` to enter negative numbers.                                                                            |

### Editing constraints

| Prop        | Type                              | Description                                                                |
| ----------- | --------------------------------- | -------------------------------------------------------------------------- |
| `maxLength` | `number`                          | Maximum raw length the user can type (counted before formatting).          |
| `minLength` | `number`                          | Forwarded to the hidden `<input>` for form validation.                     |
| `min`/`max` | `number`                          | Forwarded to the hidden `<input>` for form validation.                     |
| `isAllowed` | `(value: number \| null) => bool` | Predicate that gates every change. Return `false` to reject the keystroke. |

### DOM / form passthroughs

`id`, `name`, `form`, `required`, `placeholder`, `className`, `style`, `onFocus`, `onBlur`, `autoFocus`. `className` and `style` are applied to the root wrapper `<span>`.

## Styling

Styles are injected globally on first mount. Every selector is scoped to `[data-numberflow-input-root]`, so they won't leak into your app.

The DOM structure (simplified):

```html
<span data-numberflow-input-root class="{className}">
  <span data-numberflow-input-wrapper>
    <span
      role="textbox"
      contenteditable="true"
      data-numberflow-input-contenteditable
      data-placeholder="{placeholder}"
    >
      <span data-char-index="0" data-flow data-show>1</span>
      <span data-char-index="1">,</span>
      <!-- ...one span per character... -->
    </span>
    <input data-numberflow-input-real-input type="string" readonly />
    <!-- barrel-wheel overlays are appended here while animating -->
  </span>
</span>
```

You can target any of the above data attributes to customize the look:

```css
[data-numberflow-input-contenteditable] {
  font-variant-numeric: tabular-nums;
  font-feature-settings: "tnum";
}

[data-numberflow-input-contenteditable]:empty::before {
  color: #999; /* placeholder color */
}
```

Animation timings live in the injected stylesheet and use `cubic-bezier(.215, .61, .355, 1)` (ease-out-cubic). The flow-in animation is `0.2s`; the barrel-wheel roll and width animation are `0.4s`.

## Precision

The component is built around a string-based internal representation, so what the user types is preserved character-by-character — there's no silent rounding inside the input itself. Where you _can_ run into precision loss is at the boundaries of JavaScript's `number` type:

| Boundary                        | Lossy?                                                           | Reason                                                                                                         |
| ------------------------------- | ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| User typing → DOM display       | No                                                               | Every keystroke is applied to a string; the DOM is updated with `textContent`.                                 |
| User typing → `onChange(value)` | Yes, for `> Number.MAX_SAFE_INTEGER` or `> 15–17` sig. figs.     | `value` is `parseFloat(rawText)`; IEEE 754 double cannot represent every decimal exactly.                      |
| Formatted display, integer part | Yes, for integers `> Number.MAX_SAFE_INTEGER`                    | When `format` is on, the integer part is re-formatted through `Intl.NumberFormat.format(parseFloat(rawText))`. |
| Formatted display, decimal part | No                                                               | The decimal part is restored verbatim from the raw string after Intl formatting.                               |
| `value` prop → display          | Inherits the precision of the value the parent already computed. | E.g. `0.1 + 0.2 === 0.30000000000000004` — the component displays exactly what JS gave it.                     |
| `defaultValue` prop → display   | Same as above.                                                   | —                                                                                                              |

### `onChangeText` for arbitrary-precision values

When you need the exact digits the user typed (BigInt math, currency stored as strings, big-decimal libraries, etc.), use the `onChangeText` callback — it fires alongside `onChange` with the raw string representation:

```tsx
import { useState } from "react";
import { NumberFlowInput } from "@daformat/react-number-flow-input";

function HugeNumber() {
  const [raw, setRaw] = useState("");

  return (
    <>
      <NumberFlowInput onChangeText={setRaw} />
      <p>BigInt: {raw === "" ? "—" : BigInt(raw.split(".")[0]).toString()}</p>
    </>
  );
}
```

The string is the unformatted internal representation: digits, an optional leading `-`, and at most one `.` (always `.`, never the locale decimal). Intermediate states like `""`, `"-"`, `"."`, `"-."` are surfaced as-is so consumers can render them if they want.

If you only consume `onChange` (the typical case), be aware that values past `9.007 × 10¹⁵` (the safe-integer ceiling) or with more than ~17 significant digits will round.

## Server-side rendering

`injectStyles()` is a no-op on the server and idempotent on the client. The component itself only touches the DOM inside `useInsertionEffect` / `useEffect`, so it renders cleanly in Next.js, Remix and other SSR frameworks.

## Browser support

Modern evergreen browsers. Required browser features:

- `Intl.NumberFormat` (for `format` / `locale`)
- Web Animations API (`element.animate(...)`) — used for the barrel-wheel and position animations
- CSS `transition` + `transform` — used for flow-in animation
- `requestAnimationFrame`, `ResizeObserver`

## Development

```bash
pnpm install
pnpm test          # vitest run
pnpm build --watch # tsc -p tsconfig.build.json
pnpm format        # prettier --write .
pnpm lint:js       # eslint .
```

### Project layout

```
src/
├── NumberFlowInput.tsx       # The component
├── styles.ts                 # Injected stylesheet
├── index.ts                  # Public entry point
└── utils/
    ├── barrelWheel.ts        # Wheel DOM helpers
    ├── changes.ts            # Diffing (typing & replacement)
    ├── combineRefs.ts        # Ref forwarding helper
    ├── cssEasing.ts          # Cubic-bezier tokens
    ├── formatting.ts         # Intl.NumberFormat wrapper
    ├── moveElementPreservingAnimation.ts
    ├── textCleaning.ts       # Raw text sanitization
    └── utils.ts              # DOM/measurement helpers
```

Every util has its own `*.test.ts` file next to it; component-level tests live in `src/NumberFlowInput.test.tsx`.

## License

[Zero-Clause BSD](./LICENSE) — do whatever you want with it.
