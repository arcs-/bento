import { sameShape, type Snapshot } from "./layout.ts";

/**
 * A drag session. Every move measures from `start`, so dragging back restores pushed panels
 * and un-snaps a collapse.
 */
export type DragState<Separator, Panel> =
  | { readonly kind: "idle" }
  | {
      readonly kind: "dragging";
      readonly separator: Separator;
      readonly start: Snapshot<Panel>;
      /** The pointer's delta when the session last rebased; moves measure from there. */
      readonly offset: number;
      readonly latest: number;
      /** Panels whose `beforetoggle` was canceled; they hold until the move stops toggling them. */
      readonly vetoed: ReadonlySet<Panel>;
      /** Panels whose live size the drag changed, for `resizeend`. */
      readonly resized: ReadonlySet<Panel>;
    };

export const idle = { kind: "idle" } as const;

export function pressed<Separator, Panel>(
  separator: Separator,
  start: Snapshot<Panel>,
): DragState<Separator, Panel> {
  return {
    kind: "dragging",
    separator,
    start,
    offset: 0,
    latest: 0,
    vetoed: new Set(),
    resized: new Set(),
  };
}

/** The pointer moved to `pointerDelta` from the press; returns the delta to move from `start`. */
export function deltaFromStart<Separator, Panel>(
  drag: DragState<Separator, Panel> & { kind: "dragging" },
  pointerDelta: number,
): number {
  return pointerDelta - drag.offset;
}

export function moved<Separator, Panel>(
  drag: DragState<Separator, Panel> & { kind: "dragging" },
  pointerDelta: number,
  vetoed: ReadonlySet<Panel>,
  resized: Iterable<Panel>,
): DragState<Separator, Panel> {
  return { ...drag, latest: pointerDelta, vetoed, resized: new Set([...drag.resized, ...resized]) };
}

/**
 * The group changed under the drag. When panels came, went or changed mode, or the space
 * changed, the drag continues from the layout now. Otherwise only the requests of the changed
 * panels are taken over, and every box stays where the drag started, so an app echoing a size
 * back keeps the snap and the push-back intact.
 */
export function rebased<Separator, Panel>(
  drag: DragState<Separator, Panel>,
  now: Snapshot<Panel>,
  changed: ReadonlySet<Panel>,
): DragState<Separator, Panel> {
  if (drag.kind === "idle") return drag;
  const { start } = drag;
  if (!sameShape(start, now)) {
    return { ...drag, start: now, offset: drag.latest, vetoed: new Set() };
  }
  if (changed.size === 0) return drag;
  const takeOver = <Item>(items: readonly Item[], current: readonly Item[]) =>
    items.map((item, index) => {
      const panel = start.panels[index];
      return panel && changed.has(panel) ? (current[index] ?? item) : item;
    });
  return {
    ...drag,
    start: {
      ...start,
      requests: takeOver(start.requests, now.requests),
      resolved: takeOver(start.resolved, now.resolved),
    },
  };
}
