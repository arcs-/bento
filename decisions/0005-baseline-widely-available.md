# Compatibility is Baseline Widely available

A feature counts once every engine has shipped it for 30 months. MDN and caniuse show the badge; check it before using a feature. A newer feature may enhance a behavior, never carry it. As of September 2026 that means browsers from March 2024 on: roughly Chrome and Edge 123, Firefox 124, Safari 17.4.

## What Bento uses

| Feature | Used for | Widely available |
|---|---|---|
| custom elements, shadow DOM | the elements | yes, for years |
| Web Animations, `Element.animate()` | collapse and expand ([0014](0014-animate-with-web-animations.md)) | yes, for years |
| `ElementInternals` ARIA | separator role and values | yes, since October 2023 |
| constructed stylesheets, `adoptedStyleSheets` | all styles, CSP-safe | yes, since September 2025 |
| `<dialog>` modal, its inert background | modal panels | yes, since September 2024 |
| `::backdrop` inheriting from its element | `--bento-backdrop` | yes, since September 2026 |
| `overflow: clip` | the clipping wrapper | yes, since March 2025 |
| `@container` size queries | content adapts to its panel | yes, since August 2025 |
| `:state()` custom states | live state for app CSS, never for our own; feature-detected | from November 2026 |

## What Bento does not use, and when that could change

| Feature | Would replace | Widely available |
|---|---|---|
| `popover` | `<dialog>` for modal panels | July 2027 |
| declarative shadow DOM | nothing needed | February 2027 |
| typed `attr()` | nothing needed ([0004](0004-attributes-only.md)) | no date yet |
| `@property` | nothing needed | January 2027 |

## First paint of server-rendered HTML
Correct in every browser once the definition script blocks in the head: the elements upgrade at parse time ([0006](0006-define-early.md)). A page that loads it later must hide undefined elements itself until then.

## Why
"Last versions" leaves out everyone a year behind, which enterprise customers often are. Widely available is the industry definition of safe, and the tables show it costs nothing that matters: every carrying feature is in.

## Sources
- [Baseline definition](https://web.dev/baseline)
- [Popover API is Baseline Newly available, January 2025](https://web.dev/blog/popover-baseline)
- [Declarative shadow DOM status](https://webstatus.dev/features/declarative-shadow-dom)
- [Typed attr() status](https://webstatus.dev/features/attr)
- [Constructable stylesheets status](https://webstatus.dev/features/constructed-stylesheets)
- MDN browser-compat-data 8.1.3
