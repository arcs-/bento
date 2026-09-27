import { type Length, toPixels } from "./length.ts";

/**
 * The layout math, pure: every length is resolved to px on the group's axis first.
 * Only panels in the group enter; a modal panel is left out before the call.
 */

/** What a panel asks of the layout, as lengths; a missing or invalid one is null. */
export interface PanelRequest {
  readonly size: Length | null;
  readonly min: Length | null;
  readonly max: Length | null;
  readonly collapsedSize: Length | null;
  readonly collapsible: boolean;
  readonly collapsed: boolean;
}

const sameLength = (first: Length | null, second: Length | null) =>
  first === second ||
  (first !== null &&
    second !== null &&
    first.amount === second.amount &&
    first.unit === second.unit);

export function sameRequest(first: PanelRequest, second: PanelRequest): boolean {
  return (
    sameLength(first.size, second.size) &&
    sameLength(first.min, second.min) &&
    sameLength(first.max, second.max) &&
    sameLength(first.collapsedSize, second.collapsedSize) &&
    first.collapsible === second.collapsible &&
    first.collapsed === second.collapsed
  );
}

/**
 * A request resolved to px against the group's space. A collapse by the group is an output of
 * the layout, never part of a request.
 */
export interface ResolvedRequest {
  /** The live size; null fills the remaining space. */
  readonly size: number | null;
  readonly min: number;
  readonly max: number;
  readonly collapsedSize: number;
  readonly collapsible: boolean;
  readonly collapsed: boolean;
}

/** Resolves a request against the group's space. A rail's panel is never smaller than its rail. */
export function resolveRequest(request: PanelRequest, space: number): ResolvedRequest {
  const pixels = (length: Length | null) => (length ? toPixels(length, space) : null);
  const collapsedSize = pixels(request.collapsedSize) ?? 0;
  return {
    size: pixels(request.size),
    min: Math.max(pixels(request.min) ?? 0, collapsedSize),
    max: pixels(request.max) ?? Infinity,
    collapsedSize,
    collapsible: request.collapsible,
    collapsed: request.collapsed,
  };
}

export interface PanelBox {
  readonly size: number;
  readonly collapsed: boolean;
  /** Rendered flexible: it takes the remaining space. */
  readonly fills: boolean;
}

export type Layout = readonly PanelBox[];

/** A group's layout at one moment: its panels in DOM order, what they asked, what they got. */
export interface Snapshot<Panel> {
  readonly panels: readonly Panel[];
  readonly requests: readonly PanelRequest[];
  readonly resolved: readonly ResolvedRequest[];
  readonly layout: Layout;
  /** Null before the first measurement; the layout then comes from the attributes alone. */
  readonly space: number | null;
}

/** The same panels in the same space: a change from one to the other can move or animate. */
export function sameShape<Panel>(first: Snapshot<Panel>, second: Snapshot<Panel>): boolean {
  return (
    first.space === second.space &&
    first.panels.length === second.panels.length &&
    first.panels.every((panel, index) => panel === second.panels[index])
  );
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(value, max));

const sum = (values: readonly number[]) => values.reduce((total, value) => total + value, 0);

/** One panel while the group fits it: what it needs, then the size it gets. */
interface Fit {
  readonly request: ResolvedRequest;
  need: number;
  size: number;
  collapsed: boolean;
  fills: boolean;
}

/** Expanded panels without a size fill; with none of them, the last expanded panel does. */
function markFillers(fits: readonly Fit[]): void {
  for (const fit of fits) fit.fills = !fit.collapsed && fit.request.size === null;
  const lastExpanded = fits.findLast((fit) => !fit.collapsed);
  if (lastExpanded && !fits.some((fit) => fit.fills)) lastExpanded.fills = true;
}

/** Shares `space` equally among the filling panels, each held within its need and `max`, as flex does. */
function shareAmong(fillers: readonly Fit[], space: number): void {
  let open = fillers;
  let remaining = space;
  while (open.length > 0) {
    const share = remaining / open.length;
    const belowNeed = open.filter((fit) => fit.need > share);
    const aboveMax = open.filter((fit) => fit.request.max < share);
    const held = belowNeed.length > 0 ? belowNeed : aboveMax;
    if (held.length === 0) {
      for (const fit of open) fit.size = share;
      return;
    }
    for (const fit of held) {
      fit.size = belowNeed.length > 0 ? fit.need : fit.request.max;
      remaining -= fit.size;
    }
    open = open.filter((fit) => !held.includes(fit));
  }
}

/**
 * Fits the panels into `space`. `priority` lists panel indices, the first keeps its space
 * longest: while too little space is left, the last one shrinks to its `min`, then collapses
 * if it can, then the one before it. Collapses by the group follow from the space alone, so
 * the panels re-expand once it returns.
 */
export function layoutGroup(
  space: number,
  requests: readonly ResolvedRequest[],
  priority: readonly number[],
): Layout {
  const fits: Fit[] = requests.map((request) => ({
    request,
    need: 0,
    size: 0,
    collapsed: request.collapsed,
    fills: false,
  }));
  markFillers(fits);
  for (const fit of fits) {
    const { request } = fit;
    if (request.collapsed) fit.need = request.collapsedSize;
    else fit.need = fit.fills ? request.min : clamp(request.size ?? 0, request.min, request.max);
  }

  let overflow = sum(fits.map((fit) => fit.need)) - space;
  const lowestPriorityFirst = priority.toReversed().flatMap((index) => fits[index] ?? []);
  for (const fit of lowestPriorityFirst) {
    if (overflow <= 0) break;
    if (fit.collapsed) continue;
    const { min, collapsible, collapsedSize } = fit.request;
    const shrink = Math.min(overflow, fit.need - min);
    fit.need -= shrink;
    overflow -= shrink;
    if (overflow > 0 && collapsible) {
      overflow -= fit.need - collapsedSize;
      fit.need = collapsedSize;
      fit.collapsed = true;
    }
  }
  for (const fit of lowestPriorityFirst) {
    if (overflow <= 0) break;
    const squeeze = Math.min(overflow, fit.need);
    fit.need -= squeeze;
    overflow -= squeeze;
  }

  markFillers(fits);
  for (const fit of fits) fit.size = fit.need;
  const fixedSpace = sum(fits.filter((fit) => !fit.fills).map((fit) => fit.need));
  shareAmong(
    fits.filter((fit) => fit.fills),
    space - fixedSpace,
  );

  return fits.map(({ size, collapsed, fills }) => ({
    size,
    collapsed,
    fills,
  }));
}

/** When a drag snaps: past halfway to `collapsed-size`, or keys, as soon as they go below `min`. */
export type SnapRule = "halfway" | "atMin";

export interface SeparatorMove {
  /** Index of the panel before the separator. */
  readonly before: number;
  /** Px towards the end, measured from the start layout. */
  readonly delta: number;
  readonly snap: SnapRule;
  /** Panels whose `beforetoggle` was canceled: they hold instead of toggling. */
  readonly vetoed: ReadonlySet<number>;
}

const halfway = (request: ResolvedRequest) => (request.min + request.collapsedSize) / 2;

/** Float noise below this, as from resolving `%`, never makes a target cross a threshold. */
const tolerance = 0.01;

function snapsCollapsed(request: ResolvedRequest, target: number, snap: SnapRule): boolean {
  return target < (snap === "halfway" ? halfway(request) : request.min) - tolerance;
}

/**
 * Moves one separator from the `start` layout, like react-resizable-panels: the nearest panel
 * on one side grows, and the panels on the other give, nearest first: each down to its `min`,
 * then, if it is collapsible and not vetoed, snapping collapsed once the move takes it past
 * its threshold, and so on to the next one. Returns the new requests, sizes in px, and
 * changes nothing but the neighbours and the pushed panels. One flexible neighbour, the later
 * one of two, stays flexible; every other flexible panel gets its current size, so it keeps
 * it. A panel
 * the move opens gets at least its `min`, even when the others cannot give that much: it is
 * the user's expand, and the layout makes room by its priority.
 */
export function moveSeparator(
  requests: readonly ResolvedRequest[],
  start: Layout,
  { before, delta, snap, vetoed }: SeparatorMove,
): ResolvedRequest[] {
  const next = [...requests];
  const growing = delta > 0 ? before : before + 1;
  const nearestShrinking = delta > 0 ? before + 1 : before;
  const step = delta > 0 ? 1 : -1;
  const grower = requests[growing];
  const growerBox = start[growing];
  if (!grower || !growerBox || !start[nearestShrinking] || delta === 0) return next;

  const reach = Math.abs(delta);
  const opens =
    growerBox.collapsed &&
    !vetoed.has(growing) &&
    (snap === "atMin" || grower.collapsedSize + reach > halfway(grower));
  if (growerBox.collapsed && !opens) return next;
  const wanted = opens
    ? clamp(grower.collapsedSize + reach, grower.min, grower.max) - growerBox.size
    : Math.max(0, Math.min(growerBox.size + reach, grower.max) - growerBox.size);
  if (wanted === 0) return next;

  const sizes = start.map((box) => box.size);
  let given = 0;
  for (let index = nearestShrinking; index >= 0 && index < requests.length; index += step) {
    const request = requests[index];
    const box = start[index];
    if (!request || !box || box.collapsed) continue;
    const target = box.size - (wanted - given);
    const collapses =
      request.collapsible && !vetoed.has(index) && snapsCollapsed(request, target, snap);
    const gives = collapses
      ? box.size - request.collapsedSize
      : clamp(wanted - given, 0, Math.max(0, box.size - request.min));
    if (collapses) next[index] = { ...request, collapsed: true };
    sizes[index] = box.size - gives;
    given += gives;
    if (given >= wanted) break;
  }
  sizes[growing] = clamp(growerBox.size + given, opens ? grower.min : 0, grower.max);
  if (opens) next[growing] = { ...grower, collapsed: false };

  const flexible = (index: number) =>
    Boolean(start[index]?.fills && requests[index]?.size === null);
  const neighbours = [Math.max(growing, nearestShrinking), Math.min(growing, nearestShrinking)];
  const keeper = neighbours.find(flexible);
  return next.map((request, index) => {
    const box = start[index];
    const size = sizes[index] ?? 0;
    if (!box || request.collapsed || index === keeper) return request;
    if (flexible(index) && keeper !== undefined) return { ...request, size };
    const lastFills = box.fills && request.size !== null;
    return size === box.size || lastFills ? request : { ...request, size };
  });
}

/** Panels whose content a change hides: collapsed to 0 now, and not before. */
const hidesContent = (box: PanelBox | undefined) => Boolean(box?.collapsed && box.size === 0);

export function hidingPanels<Panel>(before: Snapshot<Panel>, next: Snapshot<Panel>): Panel[] {
  return next.panels.filter(
    (panel, index) =>
      hidesContent(next.layout[index]) &&
      !hidesContent(before.layout[before.panels.indexOf(panel)]),
  );
}

/** The edge of a panel that stays put between two layouts; frozen content anchors there. */
export function stillEdge(before: Layout, after: Layout, index: number): "start" | "end" {
  const startOf = (layout: Layout) => sum(layout.slice(0, index).map((box) => box.size));
  return Math.abs(startOf(before) - startOf(after)) < 0.5 ? "start" : "end";
}
