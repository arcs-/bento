import { type Length, toPixels } from "./length.ts";

/**
 * The layout math, pure: every length is resolved to px on the group's axis first.
 * Only panels in the group enter; a modal panel is left out before the call.
 */

/** What a panel asks of the layout, as lengths; a missing or invalid one is null. */
export interface PanelSettings {
  readonly size: Length | null;
  readonly min: Length | null;
  readonly max: Length | null;
  readonly collapsedSize: Length | null;
  readonly collapsible: boolean;
  readonly collapsed: boolean;
}

/** What the app and user asked of one panel. A collapse by the group is an output, never an input. */
export interface PanelIntent {
  /** The live size; null fills the remaining space. */
  readonly size: number | null;
  readonly min: number;
  readonly max: number;
  readonly collapsedSize: number;
  readonly collapsible: boolean;
  readonly collapsed: boolean;
}

/** Resolves the settings against the group's space. A rail's panel is never smaller than its rail. */
export function resolveIntent(settings: PanelSettings, space: number): PanelIntent {
  const pixels = (length: Length | null) => (length ? toPixels(length, space) : null);
  const collapsedSize = pixels(settings.collapsedSize) ?? 0;
  return {
    size: pixels(settings.size),
    min: Math.max(pixels(settings.min) ?? 0, collapsedSize),
    max: pixels(settings.max) ?? Infinity,
    collapsedSize,
    collapsible: settings.collapsible,
    collapsed: settings.collapsed,
  };
}

export interface PanelBox {
  readonly size: number;
  readonly collapsed: boolean;
  readonly collapsedByGroup: boolean;
  /** Rendered flexible: it takes the remaining space. */
  readonly fills: boolean;
}

export type Layout = readonly PanelBox[];

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(value, max));

const sum = (values: readonly number[]) => values.reduce((total, value) => total + value, 0);

/** Expanded panels without a size fill; with none of them, the last expanded panel does. */
function fillingPanels(intents: readonly PanelIntent[], collapsed: readonly boolean[]): boolean[] {
  const fills = intents.map((intent, index) => !collapsed[index] && intent.size === null);
  const lastExpanded = collapsed.lastIndexOf(false);
  if (!fills.includes(true) && lastExpanded >= 0) fills[lastExpanded] = true;
  return fills;
}

/** Shares `space` equally among the filling panels, each held within its floor and ceiling, as flex does. */
function shareAmong(
  fillers: readonly number[],
  space: number,
  floors: readonly number[],
  ceilings: readonly number[],
): Map<number, number> {
  const shares = new Map<number, number>();
  let open = fillers;
  let remaining = space;
  while (open.length > 0) {
    const share = remaining / open.length;
    const belowFloor = open.filter((index) => (floors[index] ?? 0) > share);
    const aboveCeiling = open.filter((index) => (ceilings[index] ?? Infinity) < share);
    const held = belowFloor.length > 0 ? belowFloor : aboveCeiling;
    if (held.length === 0) {
      for (const index of open) shares.set(index, share);
      break;
    }
    const bounds = belowFloor.length > 0 ? floors : ceilings;
    for (const index of held) {
      const size = bounds[index] ?? 0;
      shares.set(index, size);
      remaining -= size;
    }
    open = open.filter((index) => !held.includes(index));
  }
  return shares;
}

/**
 * Fits the panels into `space`. `priority` lists panel indices, the first keeps its space
 * longest: while too little space is left, the last one shrinks to its `min`, then collapses
 * if it can, then the one before it. Collapses by the group follow from the space alone, so
 * the panels re-expand once it returns.
 */
export function layoutGroup(
  space: number,
  intents: readonly PanelIntent[],
  priority: readonly number[],
): Layout {
  const collapsed = intents.map((intent) => intent.collapsed);
  const collapsedByGroup = intents.map(() => false);
  let fills = fillingPanels(intents, collapsed);
  const needs = intents.map((intent, index) => {
    if (intent.collapsed) return intent.collapsedSize;
    return fills[index] ? intent.min : clamp(intent.size ?? 0, intent.min, intent.max);
  });

  let overflow = sum(needs) - space;
  const lowestPriorityFirst = priority.toReversed();
  for (const index of lowestPriorityFirst) {
    const intent = intents[index];
    if (overflow <= 0) break;
    if (!intent || collapsed[index]) continue;
    const shrink = Math.min(overflow, (needs[index] ?? 0) - intent.min);
    needs[index] = (needs[index] ?? 0) - shrink;
    overflow -= shrink;
    if (overflow > 0 && intent.collapsible) {
      overflow -= (needs[index] ?? 0) - intent.collapsedSize;
      needs[index] = intent.collapsedSize;
      collapsed[index] = true;
      collapsedByGroup[index] = true;
    }
  }
  for (const index of lowestPriorityFirst) {
    if (overflow <= 0) break;
    const squeeze = Math.min(overflow, needs[index] ?? 0);
    needs[index] = (needs[index] ?? 0) - squeeze;
    overflow -= squeeze;
  }

  fills = fillingPanels(intents, collapsed);
  const fillers = fills.flatMap((filling, index) => (filling ? [index] : []));
  const fixedSpace = sum(needs.filter((_need, index) => !fills[index]));
  const shares = shareAmong(
    fillers,
    space - fixedSpace,
    needs,
    intents.map((intent) => intent.max),
  );

  return intents.map((_intent, index) => ({
    size: shares.get(index) ?? needs[index] ?? 0,
    collapsed: collapsed[index] ?? false,
    collapsedByGroup: collapsedByGroup[index] ?? false,
    fills: fills[index] ?? false,
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

const halfway = (intent: PanelIntent) => (intent.min + intent.collapsedSize) / 2;

function snapsCollapsed(intent: PanelIntent, target: number, snap: SnapRule): boolean {
  return target < (snap === "halfway" ? halfway(intent) : intent.min);
}

/**
 * Moves one separator from the `start` layout, like react-resizable-panels: the nearest panel
 * on one side grows, the nearest on the other gives down to its `min` or snaps collapsed, and
 * further panels are pushed down to their `min`. Returns the new intents; a panel that fills
 * keeps filling, except that between two filling panels the earlier one gets a size.
 */
export function moveSeparator(
  intents: readonly PanelIntent[],
  start: Layout,
  { before, delta, snap, vetoed }: SeparatorMove,
): PanelIntent[] {
  const next = [...intents];
  const growing = delta > 0 ? before : before + 1;
  const nearestShrinking = delta > 0 ? before + 1 : before;
  const step = delta > 0 ? 1 : -1;
  const grower = intents[growing];
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
  for (let index = nearestShrinking; index >= 0 && index < intents.length; index += step) {
    const intent = intents[index];
    const box = start[index];
    if (!intent || !box || box.collapsed) continue;
    const target = box.size - (wanted - given);
    if (
      index === nearestShrinking &&
      intent.collapsible &&
      !vetoed.has(index) &&
      snapsCollapsed(intent, target, snap)
    ) {
      next[index] = { ...intent, collapsed: true };
      sizes[index] = intent.collapsedSize;
      given += box.size - intent.collapsedSize;
      break;
    }
    const gives = clamp(wanted - given, 0, Math.max(0, box.size - intent.min));
    sizes[index] = box.size - gives;
    given += gives;
    if (given >= wanted) break;
  }
  if (opens && given < grower.min - grower.collapsedSize) return [...intents];

  sizes[growing] = Math.min(growerBox.size + given, grower.max);
  if (opens) next[growing] = { ...grower, collapsed: false };

  const earlierFills = start[Math.min(growing, nearestShrinking)]?.fills ?? false;
  const laterFills = start[Math.max(growing, nearestShrinking)]?.fills ?? false;
  const sized = earlierFills && laterFills ? Math.min(growing, nearestShrinking) : -1;
  return next.map((intent, index) => {
    const box = start[index];
    const size = sizes[index] ?? 0;
    const keepsSize = !box || intent.collapsed || (box.fills && index !== sized);
    return keepsSize || size === box.size ? intent : { ...intent, size };
  });
}

/** The edge of a panel that stays put between two layouts; frozen content anchors there. */
export function stillEdge(before: Layout, after: Layout, index: number): "start" | "end" {
  const startOf = (layout: Layout) => sum(layout.slice(0, index).map((box) => box.size));
  return Math.abs(startOf(before) - startOf(after)) < 0.5 ? "start" : "end";
}
