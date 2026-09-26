# Plan

## Words
- **group** `<bento-group>` – lays out panels and separators, `horizontal` or `vertical`. Groups nest.
- **panel** `<bento-panel>` – the element you write. The group sets its size, which may become 0. It clips its content, which keeps at least `min`, so content is never squished. While collapsing, content keeps its start size until the end; while expanding, it takes its end size from the start. Content is a size container, so it adapts with `@container` instead of JS thresholds.
- **separator** `<bento-separator>` – the draggable line between two panels. Carries the ARIA role of the same name. It resizes and toggles its primary panel, the window splitter pattern's term: the neighbour with a starting `size` or `collapsible`, the later one on a tie, or the one its `aria-controls` names. Double-click resets the primary panel to its starting size and collapsed state. It is focusable, adding `tabindex="0"` when the author did not ([why](decisions/0011-aria-through-element-internals.md)). It stays next to a collapsed panel, so it can reopen it, and hides next to a modal one. Adding and removing separators is the app's job, as in react-resizable-panels.
- **collapsed** – a panel at its `collapsed-size` (default 0). Set by attribute, never inferred from size. At 0 its content is `display: none`, so focus and assistive tech skip it; a rail keeps its content, sized to the rail. Dragging below `min` holds the panel at `min` and snaps it past halfway to `collapsed-size`; arrow keys snap at `min` ([why](decisions/0009-snap-at-halfway.md)). Expanding restores the size from before the collapse. Snapping and toggling animate; plain drag, mount and window resize never do. A collapse or expand by the user can be vetoed with a cancelable `beforetoggle`, like an editor with unsaved changes ([why](decisions/0010-veto-with-beforetoggle.md)).
- **modal** – a panel whose `modal` media query matches. It leaves the group and shows as a modal dialog over it while not collapsed; entering modal mode collapses it. One shows at a time: showing one collapses the others, like `popover="auto"`. Escape, back gesture and tap outside close it by collapsing, so `beforetoggle` can veto that too ([why](decisions/0008-modal-closes-by-collapsing.md)). Side, bottom or full screen is CSS on the panel itself: in modal mode its box styles go to the sheet, and `--bento-backdrop` colors the backdrop ([why](decisions/0013-modal-styled-through-the-panel.md)). Opening one is always the app's write; only closing can be the user's.

## Example
```html
<bento-group>
  <bento-panel size="370px" min="270px" collapsible modal="(max-width: 768px)"></bento-panel>
  <bento-separator></bento-separator>
  <bento-panel></bento-panel>
</bento-group>
```
Every attribute is optional. Defaults: `orientation` `horizontal`, no `size` means fill the remaining space shared equally, `min` `0`, `collapsed-size` `0`, no `max`, not collapsible, never modal.

## Idea
- web components, so it works in any framework and from plain HTML alone
- declarative first, but the JS API hides nothing: every attribute has a property; `size` and `collapsed` are live and writable, their attributes, or property writes before the first layout, are the starting state, like `value` and `defaultValue` on `<input>`; live state is `:state()` for CSS; the light DOM is never written, except a separator's missing `tabindex` ([why](decisions/0007-defaults-and-live-state.md))
- one element per panel; the clipping wrapper is internal (shadow DOM) and never styled; everything visible is light DOM, so `class`, `style`, `data-*` and `aria-*` land where you write them; no part is exposed; a modal panel's sheet takes the panel's own styles ([why](decisions/0013-modal-styled-through-the-panel.md))
- no document stylesheet: default styles are constructed stylesheets adopted by each shadow root, so nothing is injected into the document and a strict CSP needs no exception ([why](decisions/0012-no-document-stylesheet.md))
- a panel is a layout box: its `display`, flex and grid settings, `gap`, alignment and `overflow` lay out and scroll its children, which the internal wrapper takes over from it, so utility classes go on the panel; only padding, and borders on the collapsing sides, need a content element, or the panel stops collapsing at its padding
- attributes are the whole markup interface; at upgrade the elements derive `--bento-size`, `--bento-min`, `--bento-max` and `--bento-collapsed-size` from them, on every panel, and consumer CSS may read those ([why](decisions/0004-attributes-only.md))
- a changed `size` or `collapsed` attribute applies only while the live state is clean, like `value` on an `<input>` nobody typed in; it never animates
- flex layout: a panel with `size` is fixed at it, panels without share the rest; lengths are `px` or `%` of the group's space, other units fall back to the default; weights come when someone needs them
- a drag changes only its two neighbours and the panels it pushes; every other panel keeps its size. A panel keeps its kind of size: px stays px, and a flexible or `%` panel gets `%`, so it keeps its share when the group resizes, like react-resizable-panels' default `preserve-relative-size`
- one panel always stays flexible: the later neighbour of a drag between flexible panels stays flexible, and every other flexible panel keeps its current share as `%`; with none flexible, the last one fills
- DOM order is priority, earlier panels keep their space: dragging pushes further panels down to their `min`; a shrinking group collapses panels from the end and re-expands them when space returns; a collapse by the user stays; a panel the user or app expands moves to the front, most recent first, so expanding always shows it
- `horizontal` follows the writing direction: layout math, drag and arrow keys use start and end, never left and right, so right-to-left works
- server rendered: the definitions load blocking in the head, so elements upgrade at parse time and the first paint is right in every browser; hydration never moves or animates anything: property writes animate only after user activation ([why](decisions/0006-define-early.md), [why](decisions/0007-defaults-and-live-state.md))
- separators are explicit elements; inserting them ourselves would fight frameworks that own the DOM
- panels may appear, disappear or collapse at any moment, even mid-drag
- layout math is a pure function; collapse, drag and modal are small explicit state machines, so an invalid combination cannot exist
- a modal panel is a `<dialog>` inside its shadow root: top layer, Escape and an inert background come from the browser; the dialog is the sheet and takes the panel's box styles
- no `z-index` but the separator's `z-index: 1`, so positioned content in the next panel cannot cover its hit area; the top layer and DOM order cover the rest
- build only what a real app needs

## Rules
A rule backed by research links its record in `decisions/`: what, why, sources. Read it before changing the rule.
- minimal interface: every attribute has a default, the smallest layout needs none; complexity lives inside the library, never in the markup
- typesafe as far as feasible: no `any`, push errors to compile time; a bad attribute value falls back to the default, never breaks layout.
- there is always a clean solution, never hack
- as few dependencies as feasible, never at the cost of size or complexity; the core has none; frameworks get JSX typings, no adapters ([why](decisions/0003-no-framework-adapters.md))
- compatibility: Baseline Widely available, checked on MDN or caniuse before using a feature; newer features may enhance a behavior, never carry it ([why](decisions/0005-baseline-widely-available.md))
- challenge every name; be as expressive as possible
- names follow ARIA and HTML when they define one, otherwise the most established library name ([why](decisions/0002-names.md))
- tooling: Vite, Vitest browser mode, oxlint, oxfmt, more where needed
- tests: few, each proving a promise of this plan through public behavior, never snapshots; written first where the plan already specifies the behavior; run in Chromium, Firefox and WebKit
- accessible from the start: separators follow the WAI-ARIA window splitter pattern, optional keys included where they fit: arrow keys resize by 10px, 100px with Shift, Enter toggles collapse, Home and End go to min and max; F6 is left to the app, it is a page-wide shortcut; `aria-valuenow` is the primary panel's share of the group, 0 to 100 with one decimal; keys with Alt, Ctrl or Meta are left to the browser. When content holding focus is hidden, focus moves to its separator if that is visible. ARIA goes through `ElementInternals`, so the light DOM rule holds; where that cannot carry it, the author's attributes do and the docs say so ([why](decisions/0011-aria-through-element-internals.md))
- barebones default styles, like the browser's for `<input>`: usable, no look of their own; `:host` rules, so any app rule wins, Tailwind classes included; system colors, so dark mode and forced colors work; larger hit areas on coarse pointers
- performance: upgrade never reads layout; measuring is a `ResizeObserver` only, whose callback may read style, a drag reads nothing and writes once per frame, and content reflows live because feedback beats cost; a toggle freezes the content of the panels that collapse or expand, so they never squish, while their neighbours reflow live, like a drag; nothing makes a panel the containing block of `position: fixed` content, so no `transform` or `contain`
- events fire on the panel and never bubble, so they reach no code but listeners on the panel or, in the capture phase, its parents: `resize` whenever the user changes its `size`, directly or by pushing it, at most once per frame plus a last one right before `resizeend`, and `resizeend` on commit, pointer or key up or a double-click reset, like `scroll` and `scrollend`; `beforetoggle` and `toggle` for every collapse and expand, cancelable only when the user caused it ([why](decisions/0010-veto-with-beforetoggle.md)); like `value` on an `<input>`, none fires when the app writes a property; none fires for the first measured layout, which is the starting state
- `prefers-reduced-motion` reduces, never removes: the size change is instant and content cross-fades, dragging is untouched ([why](decisions/0001-reduced-motion.md))

## First app needs today
- horizontal only, `px` only, main panel flexible, nesting three deep
- sidebars have default, min and max in `px` and are collapsible; overview collapses to a 48px rail, not 0
- right sidebars register and unregister at runtime
- collapse and expand animate; drag, mount and window resize must not
- below a breakpoint sidebars leave the layout and become drawers over the main panel; opening one closes the other
- menus opened inside a modal panel must render inside it, the rest of the page is inert
- server rendered; today hydration corrects sizes, which must not animate
- no persistence of sizes across reloads, for now

## Prior art
- react-resizable-panels (v4): React only; apps wrap it in hooks to add animation, pinned content and drawers, and guards against it throwing mid-drag
- shoelace `sl-split-panel`: web component, but only two panes, no collapse animation
- split.js: vanilla, imperative, no animation
- dockview-core: vanilla, full docking, far too big
Nothing does N panels + declarative HTML + animated collapse + modal panels.

## Goal
- independent open source library under MIT, published as `bento` on npm
- small: the definition script blocks the first paint, under 10 kB min+gzip, well under react-resizable-panels' 15 kB with animation and modal panels included
- replaces react-resizable-panels in a real app; Vue later, again typings only
- docs site themed like a metal bento box: chrome, brushed metal, 1990s style; the content lives in panels

## Non-goals
- docking, tabs, floating or popped-out panels, dragging panels to rearrange them; that is dockview
- storing sizes; the app saves `size` on `resizeend` and renders it back as the attribute
- a second API per framework

## Traps
- author CSS beats `:host` rules; that is what lets every app rule win, and also why an app's `flex` or `flex-basis` on a panel overrides the layout, which the docs say
- live values cannot go on the host's `style`, which is light DOM; they go in a per-element constructed stylesheet
- custom properties inherit, so a nested panel without `size` would take its outer panel's; every panel declares every `--bento-*`
- a dialog's `::backdrop` inside a shadow root cannot be styled from outside, not reliably even through `::part()`; only inherited custom properties reach it
- a transition on `flex-basis` also fires on drag writes, and an app's `flex` class breaks it mid-way; toggles and snaps use Web Animations instead ([why](decisions/0014-animate-with-web-animations.md))
- a bubbling event reaches `window`, so a bubbling `resize` would run every window resize listener on each drag frame, and `input` or `change` would reach form and page-wide listeners; that is why bento's events never bubble
- dragging needs `touch-action: none` and pointer capture on the separator, or touch scrolls, iframes swallow the pointer and text gets selected
- unnamed `@container` queries reach slotted content through the flat tree; named containers across the shadow boundary do not match
- React 19 sets `size` and `collapsed` as properties on the client, so writes before the first layout are the starting state
- React 19 does not attach `on*` handlers of custom elements while hydrating ([facebook/react#35446](https://github.com/facebook/react/issues/35446)); until it does, server-rendered apps listen through a ref
- Chrome before 125 throws on `:state()` names without dashes; custom states are feature-detected
