# ARIA goes through ElementInternals

The separator's role, orientation and values are set on its `ElementInternals`, never as attributes. `aria-controls` points at the primary panel through element reflection where available. Elsewhere the author writes it, with an `id` on the panel; an author's `aria-controls` also picks the primary panel. The label is the author's: `aria-label`, or `aria-labelledby` pointing at the panel's visible title.

## Why
The elements upgrade before the framework hydrates ([0006](0006-define-early.md)), so an attribute written at upgrade is an extra attribute to React, which warns about it, like the attributes browser extensions inject. `ElementInternals` ARIA is Baseline Widely available since October 2023 and never shows in the DOM. Element reflection for `aria-controls` is Baseline only since April 2025, so it enhances and the author's attribute carries it. We cannot write an `id` on the author's panel, and cannot know a good label.

## Sources
- [WAI-ARIA window splitter pattern](https://www.w3.org/WAI/ARIA/apg/patterns/windowsplitter/)
- [MDN: ElementInternals.ariaValueNow](https://developer.mozilla.org/en-US/docs/Web/API/ElementInternals/ariaValueNow)
- [MDN: ElementInternals.ariaControlsElements](https://developer.mozilla.org/en-US/docs/Web/API/ElementInternals/ariaControlsElements)
- [Next.js discussion: hydration error from an injected attribute](https://github.com/vercel/next.js/discussions/72035)
