/**
 * What the group writes into its children on each layout, pure: built from the layout and
 * the requests, never from the DOM.
 */
import type { PanelBox, ResolvedRequest, Snapshot } from "./layout.ts";
import { formatPixels } from "./length.ts";

/** The group's axis in logical terms: `horizontal` is the inline axis, so right-to-left is free. */
export type Axis = "inline" | "block";

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

export interface PanelRender {
  /** Collapsed as shown, a collapse by the group included. */
  readonly collapsed: boolean;
  readonly look: PanelLook;
}

/** What a separator shows of its primary panel, in percentages of the group's space. */
export interface SeparatorRender {
  readonly axis: Axis;
  readonly hidden: boolean;
  readonly now: number;
  readonly min: number;
  readonly max: number;
}

const maxOf = (request: ResolvedRequest) =>
  Number.isFinite(request.max) ? formatPixels(request.max) : null;

function contentOf(request: ResolvedRequest, box: PanelBox): ContentState {
  if (!box.collapsed) return { kind: "shown", min: formatPixels(request.min) };
  return { kind: box.size === 0 ? "hidden" : "rail" };
}

/** A panel beside the content, laid out in px; `frozen` holds its content while a toggle runs. */
export function measuredRender(
  axis: Axis,
  request: ResolvedRequest,
  box: PanelBox,
  frozen: ContentState | null,
): PanelRender {
  return {
    collapsed: box.collapsed,
    look: {
      kind: "inline",
      axis,
      basis: box.fills ? null : formatPixels(box.size),
      fillMin: formatPixels(Math.min(request.min, box.size)),
      fillMax: maxOf(request),
      content: frozen ?? contentOf(request, box),
    },
  };
}

/** Before the first measurement: a fixed panel takes its live size as written. */
export function unmeasuredRender(
  axis: Axis,
  size: string,
  request: ResolvedRequest,
  box: PanelBox,
): PanelRender {
  const basis = box.collapsed ? formatPixels(box.size) : size || null;
  return {
    collapsed: box.collapsed,
    look: {
      kind: "inline",
      axis,
      basis: box.fills ? null : basis,
      fillMin: "0px",
      fillMax: maxOf(request),
      content: contentOf(request, box),
    },
  };
}

/** A modal sheet on the side of the group its panel sits on, as wide as its live size. */
export function modalRender(
  axis: Axis,
  collapsed: boolean,
  side: "start" | "end",
  size: string,
): PanelRender {
  return { collapsed, look: { kind: "modal", axis, side, size: size || null } };
}

export function separatorRender<Panel>(
  axis: Axis,
  hidden: boolean,
  { resolved, layout, space }: Snapshot<Panel>,
  primaryIndex: number,
): SeparatorRender {
  const request = resolved[primaryIndex];
  const share = (size: number) => (space ? (size / space) * 100 : 0);
  if (!request) return { axis, hidden, now: 0, min: 0, max: 0 };
  const othersNeed = resolved.reduce(
    (total, other, index) =>
      index === primaryIndex ? total : total + (other.collapsed ? other.collapsedSize : other.min),
    0,
  );
  return {
    axis,
    hidden,
    now: share(layout[primaryIndex]?.size ?? 0),
    min: share(request.collapsible ? request.collapsedSize : request.min),
    max: share(Math.min(request.max, (space ?? 0) - othersNeed)),
  };
}
