# Attributes are the whole interface

`size="370px" min="270px"` and nothing else. The stylesheet derives `--bento-size`, `--bento-min`, `--bento-max` and `--bento-collapsed-size` from the attributes with typed `attr()`, and layout reads those. Consumer CSS may read them too, for complex styling. Setting them directly is not supported.

## Why
One way to say a thing, and the attribute is it. Typed `attr()` lets CSS derive the layout at first paint, before any JS, with a fallback so a bad value never breaks layout. It is not Baseline yet: Chrome since February 2025, Firefox since September 2026, Safari only in Technology Preview. Where it is missing, JS derives the same custom properties at element upgrade, without writing the light DOM, so the two paths share one model and one set of names. The attribute is the default; after a drag the live size is ours and neither attribute nor style is written ([0007](0007-defaults-and-live-state.md)).

## Sources
- [caniuse: attr() type()](https://caniuse.com/mdn-css_types_attr_type_function_string)
- [Interop 2026 focus areas](https://web.dev/blog/interop-2026)
- [Safari Technology Preview 242 release notes](https://webkit.org/blog/17934/release-notes-for-safari-technology-preview-242/)
