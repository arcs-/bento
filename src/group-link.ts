import type { BentoPanel } from "./panel.ts";
import type { BentoSeparator } from "./separator.ts";
import type { Axis } from "./styles.ts";

/** Why a group lays out again. */
export type Relayout =
  /** Attributes, children, modes or the space changed: it never animates and announces every toggle. */
  | { readonly kind: "resettle" }
  /**
   * `panel` toggled, by the app or by the user through the panel itself, who announce it or
   * need not; it animates when `animate`.
   */
  | { readonly kind: "toggle"; readonly panel: BentoPanel; readonly animate: boolean }
  /** A separator moved; the size changes are the move's own, not the app's. */
  | { readonly kind: "move" };

/** What a panel or separator asks of the group it sits in. Deltas are px towards the group's end. */
export interface GroupLink {
  axis(): Axis;
  /** Lays the group out again, batched with other changes in the same task. */
  invalidate(reason: Relayout): void;
  /** Finishes a running toggle, before a change that must not animate. */
  settle(): void;
  /** Gives an expanded panel the group's highest priority, so it shows. */
  moveToFront(panel: BentoPanel): void;
  /** A drag starts: moves measure from the layout now. */
  startDrag(separator: BentoSeparator): void;
  dragTo(separator: BentoSeparator, delta: number): void;
  endDrag(): void;
  /** A key moves the separator from where it is. */
  step(separator: BentoSeparator, delta: number): void;
  /** Home and End move the primary panel to its `min` or `max`. */
  stepPrimaryTo(separator: BentoSeparator, bound: "min" | "max"): void;
  /** Key up: the key's resizes are done. */
  endSteps(): void;
  toggle(separator: BentoSeparator): void;
  reset(separator: BentoSeparator): void;
}

/** Each child's group, kept here so that no child element carries it as a member. */
const groups = new WeakMap<Element, GroupLink>();

export const groupOf = (child: Element): GroupLink | undefined => groups.get(child);

export function joinGroup(child: Element, group: GroupLink): void {
  groups.set(child, group);
}

/** Leaves `group`, unless the child moved on to another group already. */
export function leaveGroup(child: Element, group: GroupLink): void {
  if (groups.get(child) === group) groups.delete(child);
}
