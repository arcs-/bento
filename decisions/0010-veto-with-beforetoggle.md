# A user's collapse or expand can be vetoed

Before a panel collapses or expands because of the user, it fires a cancelable `beforetoggle`; `toggle` follows once it has changed. Both are `ToggleEvent`s with `oldState` and `newState` of `"open"` (expanded) or `"closed"` (collapsed), the values every `ToggleEvent` uses. This covers Enter, a drag snapping, and a modal panel closing by Escape, back gesture or tap outside. Canceling a snap holds the panel at `min`.

Changes the user did not ask for fire both too, but `beforetoggle` is not cancelable: a shrinking group collapsing or re-expanding panels, entering modal mode, showing a modal panel collapsing the others. The space is gone, and the app still learns every change it did not make. Writing `collapsed` fires neither, like writing `value` on an `<input>`: the app knows what it wrote. `<details>` and popovers fire `toggle` even then, which would only echo the app's own write back to it. The first measured layout fires nothing, including the collapses it makes: it is the starting state, not a change, since nothing was shown before it. The app reads `collapsed` after mount. A group hidden by an ancestor keeps its layout and fires nothing until it shows again.

## Why
One event pair for every collapse, modal or not, instead of `cancel` and `close` next to `toggle`. HTML uses `beforetoggle` and `toggle` for popovers and `toggle` for `<details>`. `<dialog>` shows that closing may be vetoed by the user's action and never by the app's own call: `cancel` fires for Escape, not for `close()`. For an async confirm, such as "discard unsaved changes?", the app cancels, asks, then writes `collapsed`, which cannot loop. Collapsing never removes content, so state such as an editor's survives even an auto-collapse.

Browsers may skip a dialog's `cancel` to stop pages trapping the user, for example on a repeated back gesture without user activation. A modal panel then closes without asking, and `beforetoggle` follows the browser.

## Sources
- [MDN: beforetoggle](https://developer.mozilla.org/en-US/docs/Web/API/HTMLElement/beforetoggle_event)
- [MDN: ToggleEvent](https://developer.mozilla.org/en-US/docs/Web/API/ToggleEvent)
- [MDN: dialog cancel event](https://developer.mozilla.org/en-US/docs/Web/API/HTMLDialogElement/cancel_event)
- [HTML spec, close watchers and user activation](https://html.spec.whatwg.org/multipage/interaction.html#close-requests-and-close-watchers)
