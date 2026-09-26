# Bento

A framework independent library that creates nicely resizable panel UIs.

- Simple interface that follows ARIA and HTML conventions
- Works in any framework and in plain HTML, using web components
- Correct first paint when server rendered
- Animations considered for UX and following reduced motion preferences
- Deals with small screens

## Example

```html
<bento-group>
  <bento-panel size="370px" min="270px" collapsible modal="(max-width: 768px)">
    Sidebar
  </bento-panel>
  <bento-separator></bento-separator>
  <bento-panel>Main</bento-panel>
</bento-group>
```

Every attribute is optional. Attributes set the starting state; after that, dragging and toggling own it, readable as properties.

## Elements

**`<bento-group>`** lays out panels and separators. Groups nest.

| Attribute | Default | Meaning |
|---|---|---|
| `orientation` | `horizontal` | `horizontal` or `vertical` |

**`<bento-panel>`** is a panel. It clips its content, which keeps at least `min` and never squishes. Content is a size container, so `@container` queries work inside it.

| Attribute | Default | Meaning |
|---|---|---|
| `size` | fill | starting size in `px` or `%`; without it, panels share the remaining space |
| `min` | `0` | smallest size while dragging |
| `max` | none | largest size while dragging |
| `collapsible` | off | dragging below `min` holds the panel, past halfway to `collapsed-size` it snaps collapsed |
| `collapsed` | off | starts at `collapsed-size`; toggling animates |
| `collapsed-size` | `0` | size when collapsed, for example a rail |
| `modal` | never | media query; when it matches, the panel leaves the group and shows as a modal dialog while not collapsed |

**`<bento-separator>`** is the draggable line between two panels. It resizes its primary panel: the neighbour with a `size` or `collapsible`, the later one on a tie, or the one its `aria-controls` names. Keyboard: arrow keys resize by 10px, 100px with Shift, Enter toggles collapse, Home and End go to min and max; double-click resets to the default size and collapsed state. It is focusable and adds `tabindex="0"` if you didn't; when React hydrates it, render `tabindex="0"` yourself. It stays next to a collapsed panel, so it can reopen it, and hides next to a modal one. Adding and removing separators is up to you.

Every attribute has a property. `size` and `collapsed` are live and writable; their attributes are the defaults, reflected by `defaultSize` and `defaultCollapsed`, like `value` and `defaultValue` on `<input>`.

Events fire on the panel and never bubble; to hear them on a parent, listen in the capture phase. `resize` whenever the user changes its `size`, directly or by pushing it, at most once per frame; `resizeend` when a drag or key press is done, like `scroll` and `scrollend`. No event fires when you write a property, nor for the first layout. `beforetoggle` before a panel collapses or expands, `toggle` after, for every change you did not write yourself, including a group collapsing panels as it shrinks and a modal panel closing. When the user caused it, cancel `beforetoggle` to keep the panel as it is, for example while an editor has unsaved changes.

## Install

TBD. Load the element definitions as a blocking script in the document head, before your app, so server-rendered HTML lays out at parse time in every browser. The script brings its own styles: there is nothing to link, and it needs no Content Security Policy exception.

```html
<script src="TBD"></script>
```

If you load it later, hide the elements until then:

```css
:is(bento-group, bento-panel, bento-separator):not(:defined) { visibility: hidden }
```

React and Vue need no wrapper. JSX typings and Vue compiler settings: TBD.

## Styling

Default styles are barebones, like the browser's for inputs, and live inside the elements, so any rule of yours wins, Tailwind classes included. They use system colors, so dark mode and high contrast work. The separator is a 1px line with a 24px hit area, larger on touch screens, a resize cursor, a highlight on hover and drag, and a focus ring. Group, panel and separator are real elements, so `class`, `style`, `id`, `data-*` and `aria-*` land on them as written. Layout is ours: a `flex` or `flex-basis` of yours on a panel overrides it. Your content sits in an internal wrapper, so put one element in the panel that carries layout, padding and scrolling, for example `h-full overflow-auto`. Padding and borders on the sides that collapse go on that content, not the panel, or the panel stops collapsing at its padding. Margins on panels and separators are not supported; `gap` on the group is. `@container` queries inside a panel must be unnamed. Toggles animate with the panel's `transition-duration` and `transition-timing-function`, so `duration-300 ease-out` restyles them; any other `transition` on a panel would animate drags too. `--bento-size`, `--bento-min`, `--bento-max` and `--bento-collapsed-size` are readable from CSS.

A modal panel is a full-height sheet on the side it sits on, over a backdrop. Style the panel itself: in modal mode its size, padding, background, border, radius and shadow go to the sheet, so `max-md:w-[85vw]` or a bottom sheet is plain CSS on the panel. The backdrop takes its color from `--bento-backdrop` on the panel, in Tailwind `[--bento-backdrop:rgb(0_0_0/.4)]`. Give a modal panel an `aria-label`; it names the dialog. Menus opened inside a modal panel must render inside it, since the rest of the page is inert. Opening a modal panel is up to you: write `collapsed = false`.

## Accessibility

Separators follow the WAI-ARIA window splitter pattern. Give each an `aria-label`, or `aria-labelledby` pointing at its panel's title. In browsers without ARIA element reflection, also add `aria-controls` with the panel's `id`. A panel collapsed to 0 hides its content from focus and assistive tech. With `prefers-reduced-motion`, the size change is instant and content cross-fades. Dragging is never animated.

## Browser support

Baseline Widely available: browsers from March 2024 on. Newer features enhance, never carry.

## License

MIT
