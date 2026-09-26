# Attributes are defaults, live state is ours

Every attribute has a property. `size` and `collapsed` are live state: dragging, toggling and writing the property change them. Writing `collapsed` animates like a toggle once the page has had user activation; before that it applies instantly, so corrections on load, such as after hydration, never animate.

A panel's starting state comes from its `size` and `collapsed` attributes, or from writes to those properties before its first layout, as React makes on the client. It is what double-click resets to, what picks the primary panel and what `--bento-*` show, and it never animates. `defaultSize` and `defaultCollapsed` read it; setting them writes the attribute. A later attribute change updates it, and the live state too while that is clean. Every other property reflects its attribute; string properties read `""` when the attribute is absent, as in HTML, and a filling panel's `size` is `""`. Each live property is clean until the user or a property write changes it; while clean, a changed attribute applies to it. Live state is also a custom state for CSS: `:state(collapsed)` and `:state(modal)` on a panel, `:state(dragging)` on a separator. The light DOM is never written, with one exception: a separator adds a missing `tabindex` ([0011](0011-aria-through-element-internals.md)).

## Why
HTML does the same with form controls: `value` and `checked` are live, `defaultValue` and `defaultChecked` reflect the attributes, and `min` or `max` simply reflect.

React 19 sets a property on a custom element whenever one of that name exists, and an attribute only on the server. So `<bento-panel size="300px">` is an attribute in server HTML and a property write on the client. Taking early writes as the starting state makes both mean the same thing, with the same names everywhere, and makes later prop changes live writes, so controlled components work. Renaming either side was rejected: live properties under other names would leave React writing attributes that stop applying once the user changes the panel, and attributes under other names would break server rendering.

`navigator.userActivation.hasBeenActive` is Baseline Widely available since May 2026. Before any user activation, nothing on the page was the user's doing, so a write then is a correction, not a change to show. Frameworks own attributes and `style`, so writing back to them fights re-renders. `ElementInternals` gives ARIA and custom states without touching the light DOM. `:state()` is Baseline Widely available from November 2026, before a first release.

## Sources
- [HTML spec, input value mode "value"](https://html.spec.whatwg.org/multipage/input.html#dom-input-value-value)
- [MDN: ElementInternals](https://developer.mozilla.org/en-US/docs/Web/API/ElementInternals)
- [MDN: CustomStateSet](https://developer.mozilla.org/en-US/docs/Web/API/CustomStateSet)
- [React: custom element props and events](https://react.dev/reference/react-dom/components#custom-html-elements)
- [MDN: Navigator.userActivation](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/userActivation)
