/**
 * The small explicit state machines, pure: a panel's collapse and modal mode, its starting
 * state, and a group's drag session. Each is a union or a class whose transitions cannot
 * write an invalid combination.
 */
import { sameShape, type Snapshot } from "./layout.ts";

/**
 * A panel's collapse and modal state. A modal panel shows while open, so "open and collapsed"
 * or "modal and collapsed by the group" cannot be written.
 */
export type PanelMode =
  | { readonly kind: "inline"; readonly collapsed: boolean }
  /** `inlineCollapsed` is the state it had beside the content, restored when it leaves. */
  | { readonly kind: "modal"; readonly open: boolean; readonly inlineCollapsed: boolean };

export type ModeEvent =
  | { readonly type: "setCollapsed"; readonly collapsed: boolean }
  /** A default applied while clean: it never opens a modal panel, only its inline state. */
  | { readonly type: "setDefaultCollapsed"; readonly collapsed: boolean }
  | { readonly type: "enterModal" }
  | { readonly type: "leaveModal" };

export function nextMode(mode: PanelMode, event: ModeEvent): PanelMode {
  switch (event.type) {
    case "setCollapsed":
      return mode.kind === "inline"
        ? { kind: "inline", collapsed: event.collapsed }
        : { ...mode, open: !event.collapsed };
    case "setDefaultCollapsed":
      return mode.kind === "inline"
        ? { kind: "inline", collapsed: event.collapsed }
        : { ...mode, inlineCollapsed: event.collapsed };
    case "enterModal":
      return mode.kind === "modal"
        ? mode
        : { kind: "modal", open: false, inlineCollapsed: mode.collapsed };
    case "leaveModal":
      return mode.kind === "inline" ? mode : { kind: "inline", collapsed: mode.inlineCollapsed };
  }
}

/** Whether the panel shows collapsed, apart from a collapse by its group. */
export function isCollapsed(mode: PanelMode): boolean {
  return mode.kind === "inline" ? mode.collapsed : !mode.open;
}

/** The two live values of a panel that have a starting state. */
export interface Start {
  /** As written, valid or not: `defaultSize` reads it back. `""` is no size. */
  readonly size: string;
  readonly collapsed: boolean;
}

export type StartKey = keyof Start;

/**
 * Where a panel starts: its `size` and `collapsed` attributes, or property writes before its
 * first layout, as React makes on the client. Each live value follows its start while clean,
 * like an `<input>`'s value follows `defaultValue` until someone types.
 */
export class StartingState {
  #start: Start = { size: "", collapsed: false };
  readonly #dirty = new Set<StartKey>();
  #laidOut = false;

  get size(): string {
    return this.#start.size;
  }

  get collapsed(): boolean {
    return this.#start.collapsed;
  }

  /** After its first layout, property writes are live writes. */
  laidOut(): void {
    this.#laidOut = true;
  }

  /** An attribute changed the start; returns whether the live value follows it. */
  attributeChanged<Key extends StartKey>(key: Key, value: Start[Key]): boolean {
    this.#start = { ...this.#start, [key]: value };
    return !this.#dirty.has(key);
  }

  /**
   * The app wrote the property: before the first layout that is the start, which the live
   * value follows; after it, the live value is the app's.
   */
  propertyWritten<Key extends StartKey>(key: Key, value: Start[Key]): void {
    if (this.#laidOut) this.#dirty.add(key);
    else this.#start = { ...this.#start, [key]: value };
  }

  /** The user dragged, keyed or toggled it. */
  changedByUser(key: StartKey): void {
    this.#dirty.add(key);
  }

  /** Double-click: the live value is back at the start and follows it again. */
  reset(key: StartKey): void {
    this.#dirty.delete(key);
  }
}

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
