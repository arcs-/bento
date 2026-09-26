/**
 * The runtime entry, built to dist/bento.js. It registers the elements as a side effect and
 * never exports a value, so the build runs as a classic blocking `<script>` as well as an
 * `import "bento"` module. An element already defined, by a second copy, is left alone.
 */
import { BentoGroup } from "./elements/group.ts";
import { BentoPanel } from "./elements/panel.ts";
import { BentoSeparator } from "./elements/separator.ts";

const elements: Record<string, CustomElementConstructor> = {
  "bento-group": BentoGroup,
  "bento-panel": BentoPanel,
  "bento-separator": BentoSeparator,
};

for (const [name, element] of Object.entries(elements)) {
  if (!customElements.get(name)) customElements.define(name, element);
}
