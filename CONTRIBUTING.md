# Contributing

The README is the specification: every behavior it promises is proven by a test. A rule backed by research links its record in `decisions/`: what, why, sources. Read it before changing the rule, and change both together.

## Principles
- minimal interface: every attribute has a default, the smallest layout needs none; complexity lives inside the library, never in the markup
- declarative first, but the JS API hides nothing: every attribute has a property; nothing internal is reachable on the elements
- the light DOM is never written, except a separator's missing `tabindex` ([why](decisions/0007-defaults-and-live-state.md), [why](decisions/0011-aria-through-element-internals.md))
- one element per panel; the clipping wrapper is internal (shadow DOM) and never styled; no part is exposed ([why](decisions/0013-modal-styled-through-the-panel.md))
- no document stylesheet: default styles are constructed stylesheets adopted by each shadow root, `:host` rules so any app rule wins; live values go in a per-element constructed stylesheet ([why](decisions/0012-no-document-stylesheet.md))
- attributes are the whole markup interface ([why](decisions/0004-attributes-only.md))
- layout math is a pure function; collapse, drag, modal and starting state are small explicit state machines, so an invalid combination cannot exist
- separators are explicit elements; inserting them would fight frameworks that own the DOM
- a modal panel is a `<dialog>` inside its shadow root: top layer, Escape and an inert background come from the browser
- no `z-index` but the separator's `z-index: 1`, so positioned content in the next panel cannot cover its hit area; the top layer and DOM order cover the rest
- typesafe as far as feasible: no `any`, push errors to compile time; a bad attribute value falls back to the default, never breaks layout
- there is always a clean solution, never hack
- as few dependencies as feasible, never at the cost of size or complexity; the core has none; frameworks get typings, no adapters ([why](decisions/0003-no-framework-adapters.md))
- compatibility: Baseline Widely available, checked on MDN or caniuse before using a feature; newer features may enhance a behavior, never carry it ([why](decisions/0005-baseline-widely-available.md))
- names follow ARIA and HTML when they define one, otherwise the most established library name; challenge every name ([why](decisions/0002-names.md))
- build what a real app needs, nothing speculative

## Performance
- the script blocks the first paint: it stays under 10 kB min+gzip, and `pnpm build` fails above it
- upgrade never reads layout; measuring is a `ResizeObserver` only, whose callback may read style; a drag reads nothing and writes once per frame
- a toggle freezes the content of the panels that collapse or expand; everything else reflows live, because feedback beats cost ([why](decisions/0014-animate-with-web-animations.md))
- nothing makes a panel the containing block of `position: fixed` content, so no `transform`, `filter` or `contain` on it

## Tests
Few, each proving a promise of the README through public behavior, never snapshots, never internals. Written first where the behavior is already specified. They run in Chromium, Firefox and WebKit, against the built `dist/bento.js`.

`pnpm check` runs lint, format, typecheck, tests and the size budget. Tooling: Vite, Vitest browser mode, oxlint, oxfmt.

## Traps
- author CSS beats `:host` rules; that lets every app rule win, and is also why an app's `flex` or `flex-basis` on a panel overrides the layout
- custom properties inherit, so a nested panel without `size` would take its outer panel's; every panel declares every `--bento-*`
- a dialog's `::backdrop` inside a shadow root cannot be styled from outside, not reliably even through `::part()`; only inherited custom properties reach it
- a transition on `flex-basis` also fires on drag writes, and an app's `flex` class breaks it mid-way; toggles use Web Animations ([why](decisions/0014-animate-with-web-animations.md))
- a bubbling event reaches `window`: a bubbling `resize` would run every window resize listener on each drag frame, and `input` or `change` would reach form and page-wide listeners; bento's events never bubble
- dragging needs `touch-action: none` and pointer capture on the separator, or touch scrolls and iframes swallow the pointer; preventing `pointerdown` would stop native focus and show a focus ring on the first click, so text selection is blocked with `selectstart` instead
- unnamed `@container` queries reach slotted content through the flat tree; named containers across the shadow boundary do not match
- React 19 sets `size` and `collapsed` as properties on the client, so writes before the first layout are the starting state
- React 19 does not attach `on*` handlers of custom elements while hydrating ([facebook/react#35446](https://github.com/facebook/react/issues/35446))
- Chrome before 125 throws on `:state()` names without dashes; custom states are feature-detected
- Playwright's Firefox on macOS 27 cannot read `~/Library/Application Support/Firefox`; the test config gives it its own `CFFIXED_USER_HOME`
