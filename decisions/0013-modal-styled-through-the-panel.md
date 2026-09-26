# A modal panel is styled through the panel

You style the `<bento-panel>` itself, in both modes. In modal mode the panel's box leaves the group and the internal `<dialog>` is the sheet. As a child of the shadow root, the dialog inherits the panel's box styles: size, placement, padding, background, border, radius and shadow. So `class="bg-white max-md:w-[85vw]"` styles the sheet as written, and so does a bottom sheet written as `top-auto bottom-0 w-full h-1/2`. By default the sheet is full height, on the side of the group the panel sits on, as wide as its size and capped to the viewport. The backdrop is the dialog's own `::backdrop`, colored by `--bento-backdrop` from the panel. No part is exposed.

## Why
Most apps style with utility classes on the element they write, and the panel is that element. Exposing the dialog as a part would make every sheet style an arbitrary variant, `[&::part(modal)]:w-80`, and would split one panel's look across two selectors.

The backdrop cannot take that path. A dialog's `::backdrop` in a shadow root cannot be styled from outside. `::part(sheet)::backdrop` works in Chromium and WebKit but is not in MDN's compatibility data. What does reach it is inheritance: `::backdrop` inherits from its dialog in every engine since Safari 17.4, Widely available since September 2026. So one custom property carries it.

A first version made the dialog a transparent full-viewport backdrop, with a sheet inside it taking the panel's styles through `inherit`. Prototypes in Chromium and WebKit showed why that fails: the inner sheet inherits from the dialog, not from the panel.

## Sources
- [whatwg/html#3601: a dialog's ::backdrop in shadow DOM cannot be styled](https://github.com/whatwg/html/issues/3601)
- [MDN: ::backdrop, inheritance](https://developer.mozilla.org/en-US/docs/Web/CSS/::backdrop)
- [MDN: ::part()](https://developer.mozilla.org/en-US/docs/Web/CSS/::part)
