# Compatibility is Baseline Widely available

A feature counts once every engine has shipped it for 30 months. MDN and caniuse show the badge; check it before using a feature. A newer feature may enhance a behavior, never carry it. As of September 2026 that means browsers from March 2024 on: roughly Chrome and Edge 123, Firefox 124, Safari 17.4.

## What Bento uses

| Feature | Used for | Widely available |
|---|---|---|
| custom elements, shadow DOM, `:defined` | the elements, hide until defined | yes, for years |
| transitions on `flex-basis` | collapse and expand | yes, for years |
| `<dialog>` modal | modal panels | yes, since September 2024 |
| `overflow: clip` | the clipping wrapper | yes, since March 2025 |
| `@container` size queries | content adapts to its panel | yes, since August 2025 |
| `inert` | background behind a modal panel | yes, since October 2025 |
| `:state()` custom states | live state for CSS | from November 2026 |
| typed `attr()` | first paint before JS | no, enhancement only |
| `@property` | typed, non-inherited `--bento-*` | no, enhancement only; January 2027 |

## What Bento does not use, and when that could change

| Feature | Would replace | Widely available |
|---|---|---|
| `popover` | `<dialog>` for modal panels | July 2027 |
| declarative shadow DOM | nothing needed | February 2027 |

## First paint of server-rendered HTML, by browser

| Browser | Before any JS | Definition script blocking in head | Script not blocking |
|---|---|---|---|
| Chrome, Edge 133+ (February 2025) | correct, from CSS | correct | correct |
| Firefox 155+ (September 2026) | correct, from CSS | correct | correct |
| Safari, all versions so far | wrong | correct, upgrade at parse time | hidden until defined |
| any browser older than those rows | wrong | correct, upgrade at parse time | hidden until defined |

Safari has typed `attr()` in Technology Preview since April 2026; Safari 27 shipped in September 2026 without it.

## Why
"Last versions" leaves out everyone a year behind, which enterprise customers often are. Widely available is the industry definition of safe, and the tables show it costs nothing that matters: every carrying feature is in, and the one enhancement degrades to a correct paint a script later.

## Sources
- [Baseline definition](https://web.dev/baseline)
- [Popover API is Baseline Newly available, January 2025](https://web.dev/blog/popover-baseline)
- [Declarative shadow DOM status](https://webstatus.dev/features/declarative-shadow-dom)
- [Typed attr() status](https://webstatus.dev/features/attr)
- [Firefox 155 release notes](https://www.firefox.com/en-US/firefox/155.0/releasenotes/)
- [WebKit features for Safari 27.0](https://webkit.org/blog/18325/webkit-features-for-safari-27-0/)
- MDN browser-compat-data 8.1.3
