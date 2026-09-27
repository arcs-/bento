/**
 * Every style bento ships: shared constructed sheets per element type, and builders for the
 * per-element sheet of live values. All are shadow rules, so any rule of the app wins.
 */
import type { Axis, ContentState, PanelLook } from "../model/render.ts";

function sheet(rules: string): CSSStyleSheet {
  const constructed = new CSSStyleSheet();
  constructed.replaceSync(rules);
  return constructed;
}

export const groupSheet = sheet(`:host { display: flex; block-size: 100% }`);

/** The panel's layout styles, which its wrappers take over from it to lay out its children. */
const forwardedLayout =
  "display: inherit; flex-flow: inherit; grid: inherit; gap: inherit; place-items: inherit; place-content: inherit";

/**
 * The panel's own box stays the group's flex item: `.clip` is out of its flow, so a `display`,
 * grid or alignment of the app's on the panel only reaches the children, through the wrappers.
 * `.clip` is the clipping box and the scroller, with the panel's `overflow`, clip by default;
 * `.content`, the children's box, keeps at least `min` and freezes during toggles.
 *
 * `.content` is the size container that `@container` queries in the panel resolve to. The host
 * is one too: without a container among its light DOM ancestors, WebKit never looks into the
 * shadow tree for nested content, only for the panel's direct children.
 */
export const panelSheet = sheet(`
:host {
  display: block; position: relative; overflow: clip; container-type: size;
  min-inline-size: 0; min-block-size: 0; transition: none 150ms cubic-bezier(0.2, 0, 0, 1)
}
.clip { position: absolute; inset: 0; overflow: inherit; ${forwardedLayout} }
.content {
  position: absolute; inset-block-start: 0; inset-inline-start: 0; box-sizing: border-box;
  container-type: size; inline-size: 100%; block-size: 100%; ${forwardedLayout}
}
dialog > .clip { position: relative; flex: 1; display: block }
dialog {
  position: fixed; overflow: inherit; color: inherit; box-sizing: inherit;
  inline-size: inherit; block-size: inherit; min-inline-size: inherit; max-inline-size: inherit;
  min-block-size: inherit; max-block-size: inherit; inset: inherit; margin: inherit;
  padding: inherit; background: inherit; border: inherit; border-radius: inherit; box-shadow: inherit
}
dialog[open], dialog[inert] { display: flex; flex-direction: column }
dialog::backdrop { background: var(--bento-backdrop, rgb(0 0 0 / 0.1)) }`);

export const separatorSheet = sheet(`
:host {
  display: block; flex: none; position: relative; z-index: 1; background: GrayText;
  touch-action: none; user-select: none; -webkit-user-select: none
}
:host::before { content: ""; position: absolute; inset: 0 }
:host(:hover) { background: Highlight }`);

export function groupRules(axis: Axis): string {
  return `:host { flex-direction: ${axis === "inline" ? "row" : "column"} }`;
}

/**
 * The values of `--bento-size`, `--bento-min`, `--bento-max` and `--bento-collapsed-size`: the
 * attribute defaults, declared on every panel so that none inherits an outer panel's.
 */
export interface BentoCustomProperties {
  readonly size: string | null;
  readonly min: string;
  readonly max: string | null;
  readonly collapsedSize: string;
}

function customPropertiesRule({ size, min, max, collapsedSize }: BentoCustomProperties): string {
  return `:host { --bento-size: ${size ?? "initial"}; --bento-min: ${min}; --bento-max: ${max ?? "initial"}; --bento-collapsed-size: ${collapsedSize} }`;
}

function contentRules(axis: Axis, content: ContentState): string {
  switch (content.kind) {
    case "shown":
      return `.content { min-${axis}-size: ${content.min} }`;
    case "hidden":
      return ".content { display: none }";
    case "rail":
      return "";
    case "frozen": {
      const anchor = content.anchor === "end" ? `inset-${axis}: auto 0;` : "";
      const physicalAxis = axis === "inline" ? "x" : "y";
      return `.clip { overflow-${physicalAxis}: hidden } .content { ${anchor} ${axis}-size: ${content.size}px }`;
    }
  }
}

function modalRules(axis: Axis, side: "start" | "end", size: string | null): string {
  const crossAxis = axis === "inline" ? "block" : "inline";
  const inset = side === "start" ? "0 auto" : "auto 0";
  return `:host {
    display: contents !important; background: Canvas;
    ${axis}-size: ${size ? `min(${size}, 100%)` : "100%"}; max-${axis}-size: 100%;
    ${crossAxis}-size: 100%; inset-${crossAxis}: 0; inset-${axis}: ${inset}
  }`;
}

export function panelRules(properties: BentoCustomProperties, look: PanelLook): string {
  if (look.kind === "modal") {
    return customPropertiesRule(properties) + modalRules(look.axis, look.side, look.size);
  }
  const { axis, basis, fillMin, fillMax, content } = look;
  const flex =
    basis === null
      ? `flex: 1 1 0; min-${axis}-size: ${fillMin}; max-${axis}-size: ${fillMax ?? "none"}`
      : `flex: 0 0 ${basis}`;
  return `${customPropertiesRule(properties)} :host { ${flex} } ${contentRules(axis, content)}`;
}

export interface SeparatorLook {
  readonly axis: Axis;
  readonly hidden: boolean;
  readonly dragging: boolean;
}

const lineWidth = 1;
const hitAreaWidth = 24;
const coarseHitAreaWidth = 40;

export function separatorRules({ axis, hidden, dragging }: SeparatorLook): string {
  const hitArea = (width: number) =>
    `:host::before { inset-${axis}: -${(width - lineWidth) / 2}px }`;
  return `
    :host { ${axis}-size: ${lineWidth}px; cursor: ${axis === "inline" ? "col" : "row"}-resize }
    ${hitArea(hitAreaWidth)} @media (pointer: coarse) { ${hitArea(coarseHitAreaWidth)} }
    ${dragging ? ":host { background: Highlight }" : ""}
    ${hidden ? ":host { display: none !important }" : ""}`;
}
