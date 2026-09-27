# Contributing

The Behavior section below is the specification: every promise in it is proven by a test. A rule backed by research links its record in `decisions/`: what, why, sources. Read it before changing the rule, and change both together.

## Behavior

The specification: every promise here is proven by a test. User docs live on the website and follow it.

### Elements

**`<bento-group>`** lays out panels and separators. Groups nest.

| Attribute | Default | Meaning |
|---|---|---|
| `orientation` | `horizontal` | `horizontal` or `vertical` |

**`<bento-panel>`** is a panel. It clips its content, which keeps at least `min` and never squishes. Content is a size container, so `@container` queries work inside it.

| Attribute | Default | Meaning |
|---|---|---|
| `size` | fill | starting size in `px` or `%`; without it, panels share the remaining space |
| `min` | `0` | smallest size while dragging; `min`, `max` and `collapsed-size` take `px` or `%` like `size` |
| `max` | none | largest size while dragging |
| `collapsible` | off | dragging below `min` holds the panel, past halfway to `collapsed-size` it snaps collapsed |
| `collapsed` | off | starts at `collapsed-size`; toggling animates |
| `collapsed-size` | `0` | size when collapsed, for example a rail |
| `modal` | never | media query; when it matches, the panel leaves the group and shows as a modal dialog while not collapsed |

**`<bento-separator>`** is the draggable line between two panels. It resizes its primary panel: the neighbour with a `size` or `collapsible`, the later one on a tie, or the one its `aria-controls` names. Keyboard: arrow keys resize by 10px, 100px with Shift, Home and End go to min and max, Enter toggles collapse; double-click resets to the starting size and collapsed state. It is focusable and adds `tabindex="0"` if you didn't; when React hydrates it, render `tabindex="0"` yourself. It stays next to a collapsed panel, so it can reopen it, and hides next to a modal one. Adding and removing separators is up to you.

Every attribute has a property. `size` and `collapsed` are live and writable. Their attributes, or property writes before the panel is laid out, are the starting state, read by `defaultSize` and `defaultCollapsed`, like `value` and `defaultValue` on `<input>`. A changed attribute applies to the live state only until the user or a property write has changed it, and never animates. Writing `collapsed` animates once the user has interacted with the page; corrections on load, such as after hydration, apply instantly.

Events fire on the panel and never bubble; to hear them on a parent, listen in the capture phase. `resize` whenever the user changes its `size`, directly or by pushing it, at most once per frame; `resizeend` when a drag, key press or double-click reset is done, like `scroll` and `scrollend`. No event fires when you write a property or change an attribute, nor for the first layout. `beforetoggle` before a panel collapses or expands, `toggle` after, for every change you did not write yourself, including a group collapsing panels as it shrinks and a modal panel closing. When the user caused it, cancel `beforetoggle` to keep the panel as it is, for example while an editor has unsaved changes.

### Layout

- A panel with a `size` keeps it; panels without share the rest equally. One panel always stays flexible: with none, the last one fills.
- A drag changes only the separator's two neighbours, and further panels it pushes down to their `min`. Once a pushed panel is at its `min` and the drag goes on, it collapses if it is collapsible, nearest first, past halfway to its `collapsed-size`, like the neighbour does; a user's collapse, so `beforetoggle` can veto it and it stays collapsed. Every other panel keeps its size. A panel keeps its kind of size: `px` stays `px`, and a flexible or `%` panel gets a `%`, so it keeps its share when the group resizes. The later neighbour of a drag between flexible panels stays flexible.
- Dragging below `min` holds a collapsible panel at `min` and snaps it collapsed past halfway to `collapsed-size`; dragging back past halfway expands it. Arrow keys snap as soon as they go below `min`. Expanding restores the size from before the collapse.
- DOM order is priority. A shrinking group collapses collapsible panels from the end and expands them again when space returns; a collapse by the user stays. A panel the user or you expand moves to the front, so expanding always shows it.
- Toggles and snaps animate; drags, mounting and window resizes never do. While a panel collapses or expands its content keeps its larger size, so it never squishes; its neighbours reflow live.
- Collapsed is a state you or the user set, never inferred from size. A collapsed panel at 0 hides its content; a rail, `collapsed-size` above 0, keeps it, sized to the rail.
- `horizontal` follows the writing direction, so right-to-left works for layout, drags and arrow keys.
- Panels and separators may be added, removed or collapsed at any moment, even mid-drag.

### Loading and frameworks

Load the element definitions as a blocking script in the document head, before your app, so server-rendered HTML lays out at parse time in every browser. The script brings its own styles: there is nothing to link, and it needs no Content Security Policy exception.

If you load it later, hide the elements until then:

```css
:is(bento-group, bento-panel, bento-separator):not(:defined) { visibility: hidden }
```

React and Vue need no wrapper. For React 19 JSX typings, reference `bento-panels/react`; props use the attribute names, and events are `onresize`, `onresizeend`, `onbeforetoggle` and `ontoggle`, with a `Capture` suffix on parents. The first props are the starting state; later ones are live writes, so `collapsed` can be controlled. React 19 does not yet attach these handlers while hydrating server-rendered HTML ([facebook/react#35446](https://github.com/facebook/react/issues/35446)); there, add listeners through a ref. Vue needs `compilerOptions.isCustomElement` for tags starting with `bento-`.

### Styling

Default styles are barebones, like the browser's for inputs, and live inside the elements, so any rule of yours wins, Tailwind classes included. They use system colors, so dark mode and high contrast work. The separator is a 1px line with a 24px hit area, larger on touch screens, a resize cursor, a highlight on hover and drag, and a focus ring. Group, panel and separator are real elements, so `class`, `style`, `id`, `data-*` and `aria-*` land on them as written. Layout is ours: a `flex` or `flex-basis` of yours on a panel overrides it. A panel's `display`, flex and grid settings, `gap`, alignment and `overflow` lay out and scroll its children, so `class="flex flex-col gap-2 overflow-auto"` works on the panel. Padding and borders on the sides that collapse go on a content element inside, not the panel, or the panel stops collapsing at its padding. Margins on panels and separators are not supported; `gap` on the group is. `@container` queries inside a panel must be unnamed. Toggles animate with the panel's `transition-duration` and `transition-timing-function`, so `duration-300 ease-out` restyles them; any other `transition` on a panel would animate drags too. `--bento-size`, `--bento-min`, `--bento-max` and `--bento-collapsed-size` are readable from CSS.

A modal panel is a full-height sheet on the side it sits on, over a backdrop. Style the panel itself: in modal mode its size, padding, background, border, radius and shadow go to the sheet, so `max-md:w-[85vw]` or a bottom sheet is plain CSS on the panel. The backdrop takes its color from `--bento-backdrop` on the panel, in Tailwind `[--bento-backdrop:rgb(0_0_0/.4)]`. Give a modal panel an `aria-label`, or `aria-labelledby` where the browser reflects ARIA elements; it names the dialog. Menus opened inside a modal panel must render inside it, since the rest of the page is inert. Opening a modal panel is up to you: write `collapsed = false`. One shows at a time; showing one collapses the others. Escape, the back gesture and a tap outside close it by collapsing, so `beforetoggle` can veto that too. The sheet fades in and out with the panel's `transition-duration`. Closing gives the page back at once: right after `collapsed = true` you can focus or scroll it while the sheet fades away.

### Accessibility

Separators follow the WAI-ARIA window splitter pattern; `aria-valuenow` is the primary panel's share of the group, 0 to 100. Keys with Alt, Ctrl or Meta are left to the browser, and F6 to your app. Give each an `aria-label`, or `aria-labelledby` pointing at its panel's title. In browsers without ARIA element reflection, also add `aria-controls` with the panel's `id`. When a panel collapses while focus is inside it, focus moves to its separator. A panel collapsed to 0 hides its content from focus and assistive tech. With `prefers-reduced-motion`, the size change is instant and content cross-fades. Dragging is never animated.

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
Few, each proving a promise of the Behavior section through public behavior, never snapshots, never internals. Written first where the behavior is already specified. They run in Chromium, Firefox and WebKit, against the built `dist/bento.js`.

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
