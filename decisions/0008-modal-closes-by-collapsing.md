# A modal panel closes by collapsing

A modal panel shows while not collapsed, so there is no `open`. Entering modal mode collapses it; leaving restores its layout state. Closing is a collapse, so it fires `beforetoggle` and `toggle` like any other ([0010](0010-veto-with-beforetoggle.md)).

## Why
One state instead of two, and no invalid combination like an open collapsed panel. A modal panel is closed on arrival, like Material 3's modal navigation drawer, while the same panel beside the content was expanded. The internal `<dialog>` supplies Escape and the back gesture through its cancelable `cancel`. `popover` could not veto at all: its `beforetoggle` is not cancelable when closing.

Tap outside is a click on the backdrop, which is the dialog itself ([0013](0013-modal-styled-through-the-panel.md)). `closedby="any"` would do the same but is not Baseline (Safari lacks it).

## Sources
- [MDN: dialog, cancel and close events](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/dialog)
- [MDN: beforetoggle, not cancelable when closing](https://developer.mozilla.org/en-US/docs/Web/API/HTMLElement/beforetoggle_event)
- [caniuse: dialog closedby](https://caniuse.com/mdn-html_elements_dialog_closedby)
- [Material 3, Navigation drawer](https://m3.material.io/components/navigation-drawer/guidelines)
