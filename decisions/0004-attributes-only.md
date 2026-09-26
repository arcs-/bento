# Attributes are the whole interface

`size="370px" min="270px"` and nothing else. At upgrade the elements derive `--bento-size`, `--bento-min`, `--bento-max` and `--bento-collapsed-size` from the attributes, on every panel, and layout reads those. Consumer CSS may read them too, for complex styling. Setting them directly is not supported.

## Why
One way to say a thing, and the attribute is it. A bad value falls back to the default, so it never breaks layout. The attribute is the default; after a drag the live size is ours and neither attribute nor style is written ([0007](0007-defaults-and-live-state.md)).

Typed `attr()` was the first plan: the document stylesheet would derive the properties before any JS. It was dropped with the document stylesheet ([0012](0012-no-document-stylesheet.md)). It only helps a paint before JS, and the definition script blocks the first paint anyway ([0006](0006-define-early.md)). It is also not Baseline: Chrome since February 2025, Firefox since September 2026, Safari only in Technology Preview. `@property` went with it, since every panel declares every property, so none inherits.

## Sources
- [caniuse: attr() type()](https://caniuse.com/mdn-css_types_attr_type_function_string)
- [Interop 2026 focus areas](https://web.dev/blog/interop-2026)
- [Safari Technology Preview 242 release notes](https://webkit.org/blog/17934/release-notes-for-safari-technology-preview-242/)
