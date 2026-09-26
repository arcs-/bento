# bento

A framework independent library that creates nicely resizable panel UIs.

- Resizable panels, horizontal or vertical, stackable
- Simple interface that follows ARIA and HTML conventions
- Based on web components and works well in react and vue
- Works with SSR as well as small/mobile screens
- Animations aiding in understanding layout changes

```html
<bento-group>
  <bento-panel size="370px" min="270px" collapsible modal="(max-width: 768px)">A box on the left</bento-panel>
  <bento-separator aria-label="Resize sidebar"></bento-separator>
  <bento-panel>Main</bento-panel>
</bento-group>
```

## Install

```sh
npm install bento
```

To prevent layout shifts ensure `bento.js` is loaded as a blocking script in the `<head>`. See the [Getting started](https://arcs-.github.io/bento/start.html) guide.

## Reference

| Element | Attributes |
|---|---|
| `<bento-group>` | `orientation`: `horizontal` (default) or `vertical` |
| `<bento-panel>` | `size`, `min`, `max` in `px` or `%`; `collapsible`; `collapsed`; `collapsed-size`; `modal`, a media query |
| `<bento-separator>` | your `aria-label`, and `aria-controls` to pick the panel it resizes |

- Every attribute is optional and has a property. `size` and `collapsed` are live.
- Panels fire `resize`, `resizeend`, `beforetoggle` (cancel it to veto a user's collapse) and `toggle`.
- Style everything with your own CSS or utility classes; `:state(collapsed)` and `:state(modal)` expose live state.
- React 19 typings: `bento/react`.

Docs and live examples: [arcs-.github.io/bento](https://arcs-.github.io/bento/). Browser support: Baseline Widely available, browsers from March 2024 on.

## License

MIT
