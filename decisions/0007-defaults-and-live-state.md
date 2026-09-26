# Attributes are defaults, live state is ours

Every attribute has a property. `size` and `collapsed` are live state: dragging, toggling and writing the property change them, and writing `collapsed` animates like a toggle. Their attributes are the defaults, reflected by `defaultSize` and `defaultCollapsed`. Every other property reflects its attribute. Live state is also a custom state for CSS, like `:state(collapsed)`. The light DOM is never written.

## Why
HTML does the same with form controls: `value` and `checked` are live, `defaultValue` and `defaultChecked` reflect the attributes, and `min` or `max` simply reflect. Frameworks own attributes and `style`, so writing back to them fights re-renders. `ElementInternals` gives ARIA and custom states without touching the light DOM. `:state()` is Baseline Widely available from November 2026, before a first release.

## Sources
- [HTML spec, input value mode "value"](https://html.spec.whatwg.org/multipage/input.html#dom-input-value-value)
- [MDN: ElementInternals](https://developer.mozilla.org/en-US/docs/Web/API/ElementInternals)
- [MDN: CustomStateSet](https://developer.mozilla.org/en-US/docs/Web/API/CustomStateSet)
