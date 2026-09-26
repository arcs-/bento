# Element definitions load before the app

The library ships one small script that registers the elements. Apps load it as a blocking script in the document head, inline when they want no network wait. It carries its own styles, so there is nothing to link. A page that loads it late must hide undefined elements itself until then.

## Why
Two things need JS before the first paint. A modal panel depends on the viewport, which no server knows, so it would render inline on a phone and flip once JS runs. And layout itself comes from JS: the elements carry every style ([0012](0012-no-document-stylesheet.md)). When a definition is registered before the parser reaches an element, the element upgrades as it is created. Its constructor runs before the parser adds the attributes, which then arrive through `attributeChangedCallback` before `connectedCallback`, so both are settled before the first paint in every browser. react-resizable-panels gets its first paint by running its render on the server, which a web component's constructor cannot do; this is the equivalent moment.

Next's `<Script strategy="beforeInteractive">` runs before hydration but does not block; a plain script tag in the root layout head does, which is how next-themes avoids its theme flash. Nuxt's head config renders a blocking script. The cost is one small script before paint, cached after the first visit or inlined.

## Sources
- [MDN: using custom elements, upgrade](https://developer.mozilla.org/en-US/docs/Web/API/Web_components/Using_custom_elements)
- [MDN: :defined](https://developer.mozilla.org/en-US/docs/Web/CSS/:defined)
- [Next.js Script, beforeInteractive](https://nextjs.org/docs/app/api-reference/components/script)
- [Nuxt: SEO and meta, head scripts](https://nuxt.com/docs/getting-started/seo-meta)
