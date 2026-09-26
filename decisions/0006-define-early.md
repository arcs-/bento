# Element definitions load before the app

The library ships one small script that registers the elements. Apps load it as a blocking script in the document head, inline when they want no network wait. Only a page that loads it late hides its groups until the elements are defined.

## Why
Two things need JS before the first paint. A modal panel depends on the viewport, which no server knows, so it would render inline on a phone and flip once JS runs. And in browsers without typed `attr()`, layout itself comes from JS. When a definition is registered before the parser reaches an element, the element upgrades as it is created, with its attributes already set, so both are settled before the first paint in every browser. react-resizable-panels gets its first paint by running its render on the server, which a web component's constructor cannot do; this is the equivalent moment.

Next's `<Script strategy="beforeInteractive">` runs before hydration but does not block; a plain script tag in the root layout head does, which is how next-themes avoids its theme flash. Nuxt's head config renders a blocking script. The cost is one small script before paint, cached after the first visit or inlined.

## Sources
- [MDN: using custom elements, upgrade](https://developer.mozilla.org/en-US/docs/Web/API/Web_components/Using_custom_elements)
- [MDN: :defined](https://developer.mozilla.org/en-US/docs/Web/CSS/:defined)
- [Next.js Script, beforeInteractive](https://nextjs.org/docs/app/api-reference/components/script)
- [Nuxt: SEO and meta, head scripts](https://nuxt.com/docs/getting-started/seo-meta)
