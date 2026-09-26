# No framework adapters

The library ships the elements and JSX typings. No React or Vue wrapper, not for behavior and not for server rendering.

## Why
React 19 and Vue both render custom elements natively, including properties and events, and pass Custom Elements Everywhere. Vue only needs `isCustomElement` in its compiler options and a `GlobalComponents` augmentation for typed templates. A behavior wrapper would only add a dependency and a second API.

A server mirror that renders the sizes as inline properties, the way react-resizable-panels does, was considered and dropped. A modal panel depends on the viewport, which no server knows, so the definition script must block in the head anyway ([0006](0006-define-early.md)). Once it does, the first paint is right in every browser and the mirror adds nothing but a second API and a hydration rule.

## Sources
- [React 19 release notes, custom elements](https://react.dev/blog/2024/12/05/react-19)
- [Custom Elements Everywhere](https://custom-elements-everywhere.com/)
