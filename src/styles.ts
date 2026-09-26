/**
 * Every style bento ships: shared constructed sheets per element type, and builders for the
 * per-element sheet of live values. All are shadow rules, so any rule of the app wins.
 */

/** The group's axis in logical terms: `horizontal` is the inline axis, so right-to-left is free. */
export type Axis = "inline" | "block";

function sheet(rules: string): CSSStyleSheet {
  const constructed = new CSSStyleSheet();
  constructed.replaceSync(rules);
  return constructed;
}

export const groupSheet = sheet(`:host { display: flex; block-size: 100% }`);

/**
 * `.content` is the size container that `@container` queries in the panel resolve to. The host
 * is one too: without a container among its light DOM ancestors, WebKit never looks into the
 * shadow tree for nested content, only for the panel's direct children.
 */
export const panelSheet = sheet(`
:host { display: block; container-type: size; min-inline-size: 0; min-block-size: 0; transition: none 0.2s ease }
.clip { display: flex; overflow: clip; inline-size: 100%; block-size: 100% }
.content { flex: none; box-sizing: border-box; container-type: size; inline-size: 100%; block-size: 100% }
dialog {
  position: fixed; overflow: clip; color: inherit; box-sizing: inherit;
  inline-size: inherit; block-size: inherit; min-inline-size: inherit; max-inline-size: inherit;
  min-block-size: inherit; max-block-size: inherit; inset: inherit; margin: inherit;
  padding: inherit; background: inherit; border: inherit; border-radius: inherit; box-shadow: inherit
}
dialog[open] { display: flex; flex-direction: column }
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

export type ContentState =
  | { readonly kind: "shown"; readonly min: string }
  | { readonly kind: "hidden" }
  | { readonly kind: "rail" }
  /** During a toggle: kept at a fixed size, anchored at the edge that does not move. */
  | { readonly kind: "frozen"; readonly size: number; readonly anchor: "start" | "end" };

/** How a panel looks in its group, beside the content or as a modal sheet. */
export type PanelLook =
  | {
      readonly kind: "inline";
      readonly axis: Axis;
      /** A CSS length, or null while the panel fills. */
      readonly basis: string | null;
      readonly fillMin: string;
      readonly fillMax: string | null;
      readonly content: ContentState;
    }
  | {
      readonly kind: "modal";
      readonly axis: Axis;
      readonly side: "start" | "end";
      readonly size: string | null;
    };

function customPropertiesRule({ size, min, max, collapsedSize }: BentoCustomProperties): string {
  return `:host { --bento-size: ${size ?? "initial"}; --bento-min: ${min}; --bento-max: ${max ?? "initial"}; --bento-collapsed-size: ${collapsedSize} }`;
}

function contentRules(axis: Axis, content: ContentState): string {
  const direction = axis === "block" ? ".clip { flex-direction: column }" : "";
  switch (content.kind) {
    case "shown":
      return `${direction} .content { min-${axis}-size: ${content.min} }`;
    case "hidden":
      return ".content { display: none }";
    case "rail":
      return direction;
    case "frozen": {
      const anchor = content.anchor === "end" ? ".clip { justify-content: flex-end }" : "";
      return `${direction} ${anchor} .content { ${axis}-size: ${content.size}px }`;
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
