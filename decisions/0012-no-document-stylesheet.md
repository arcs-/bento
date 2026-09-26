# No document stylesheet

The script is the whole install. Every default style is a constructed `CSSStyleSheet`, adopted by the element's shadow root: one shared sheet per element type, plus a per-element sheet for live values. Nothing is injected into the document, no `<style>` element and no `style` attribute.

## Why
One tag to load, and nothing to keep in step. Constructed stylesheets are CSSOM objects, not `<style>` elements, so `style-src` does not apply: a strict Content Security Policy needs no nonce and no `'unsafe-inline'`. A `<style>` in a shadow root would need one.

Default styles as `:host` rules lose to every rule of the app, whatever its layer or specificity. So Tailwind classes and any other app CSS win without `@layer bento`.

A document stylesheet had two jobs, and neither survives. Typed `attr()` would derive layout before JS, but the definition script blocks the first paint anyway ([0004](0004-attributes-only.md), [0006](0006-define-early.md)). `:not(:defined)` would hide elements until the script runs, which only a page that loads it late needs. That page writes the one rule itself, and the docs show it.

## Sources
- [MDN: CSP style-src](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Security-Policy/style-src)
- [MDN: Document.adoptedStyleSheets](https://developer.mozilla.org/en-US/docs/Web/API/Document/adoptedStyleSheets)
- [CSS Scoping: shadow tree styles and the cascade](https://drafts.csswg.org/css-scoping/#shadow-cascading)
