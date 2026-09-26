# A modal panel is styled through the panel

You style the `<bento-panel>` itself, in both modes. In modal mode the panel's box leaves the group, and its box styles go to the sheet inside the internal `<dialog>`: size, padding, background, border, radius and shadow. `class="bg-white max-md:w-[85vw]"` styles the sheet as it is. By default the sheet is full height, on the side of the group the panel sits on, as wide as its size and capped to the viewport. The dialog itself covers the viewport and is the backdrop, restyled through `::part(backdrop)`, the only internal part exposed. Its own `::backdrop` stays transparent.

## Why
Most apps style with utility classes on the element they write, and the panel is that element. Exposing the dialog as a part would make every sheet style an arbitrary variant, `[&::part(modal)]:w-80`, and would split one panel's look across two selectors.

The backdrop cannot follow the same path. A dialog's `::backdrop` in a shadow root cannot be styled from outside, not even through `::part()`, and custom properties do not reach it reliably. A real element can, so the dialog is the backdrop. That also makes tap outside a plain click on the dialog in every browser, where `closedby="any"` is not Baseline ([0008](0008-modal-closes-by-collapsing.md)).

## Sources
- [whatwg/html#3601: a dialog's ::backdrop in shadow DOM cannot be styled](https://github.com/whatwg/html/issues/3601)
- [MDN: ::part()](https://developer.mozilla.org/en-US/docs/Web/CSS/::part)
- [MDN: ::backdrop](https://developer.mozilla.org/en-US/docs/Web/CSS/::backdrop)
