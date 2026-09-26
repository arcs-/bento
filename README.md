# bento

Resizable panel layouts as three web components: drag, collapse to a rail, drawers on small screens, animated and accessible. Any framework or none, under 10 kB, no dependencies.

```html
<bento-group>
  <bento-panel size="370px" min="270px" collapsible modal="(max-width: 768px)">Sidebar</bento-panel>
  <bento-separator aria-label="Resize sidebar"></bento-separator>
  <bento-panel>Main</bento-panel>
</bento-group>
```

## Install

```sh
npm install bento
```

Load `bento.js` as a blocking script in the `<head>`, so server-rendered HTML is laid out before the first paint. No stylesheet, no CSP exception.

## Reference

| Element | Attributes |
|---|---|
| `<bento-group>` | `orientation`: `horizontal` (default) or `vertical` |
| `<bento-panel>` | `size`, `min`, `max` in `px` or `%`; `collapsible`; `collapsed`; `collapsed-size`; `modal`, a media query |
| `<bento-separator>` | your `aria-label`, and `aria-controls` to pick the panel it resizes |

- Every attribute is optional and has a property. `size` and `collapsed` are live; their attributes are the starting state.
- Panels fire `resize`, `resizeend`, `beforetoggle` (cancel it to veto a user's collapse) and `toggle`; none bubbles.
- Style everything with your own CSS or utility classes; `:state(collapsed)` and `:state(modal)` expose live state.
- React 19 typings: `bento/react`.

Docs and live examples: [arcs-.github.io/bento](https://arcs-.github.io/bento/). Browser support: Baseline Widely available, browsers from March 2024 on.

## Not included

- Docking, tabs, floating panels, rearranging panels: that is [dockview](https://dockview.dev).
- Storing sizes: save `size` and `collapsed` on `resizeend` and `toggle`, and render them back as attributes.

## License

MIT
