# Names follow ARIA and HTML

`orientation="horizontal | vertical"`, `separator`, `group`, `min`, `max`, `collapsed`. Events follow `window`, scrolling and popovers: `resize`, `resizeend`, `beforetoggle`, `toggle`, all on the panel, none bubbling. `input` and `change` were rejected: they bubble into form and page-wide listeners, and form controls inside a panel fire them too. A `bento-` prefix, as Web Awesome uses, is not needed while nothing bubbles. The window splitter pattern's primary pane is the primary panel.

## Why
When ARIA or HTML already names a thing, that name is what devs and assistive tech expect. react-resizable-panels v4 arrived at the same names: `Group`, `Panel`, `Separator`, `orientation`. `direction` was rejected because CSS uses it for text direction. `box` was rejected for the group because the panel's internal wrapper is a box in every CSS sense. `open` was rejected for the collapse state: on `<details>` it is absent by default, which would hide every panel that doesn't set it. `modal` won over `drawer`: HTML has `<dialog>` and ARIA has `aria-modal`, nothing has a drawer, and a drawer is only one CSS form of a modal panel next to a bottom sheet or a full screen.

## Sources
- [WAI-ARIA window splitter pattern](https://www.w3.org/WAI/ARIA/apg/patterns/windowsplitter/)
- [react-resizable-panels](https://www.npmjs.com/package/react-resizable-panels) v4 type definitions
