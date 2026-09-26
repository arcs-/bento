/**
 * What a group does for its children: measures, lays out, renders, animates, and turns input
 * on its separators into moves and toggles. It lives beside the group element, so none of it
 * is part of the element's surface; children reach it through the group link.
 */
import type { BentoGroupElement } from "../bento.ts";
import {
  deltaFromStart,
  type DragState,
  idle,
  moved,
  pressed,
  rebased,
} from "../model/machines.ts";
import {
  Announcements,
  dispatchBeforeToggle,
  dispatchResize,
  dispatchToggle,
  ResizeQueue,
} from "./events.ts";
import { type GroupLink, joinGroup, leaveGroup, type Relayout } from "./link.ts";
import { GroupMeasure } from "./measure.ts";
import { formatLength, lengthLike } from "../model/length.ts";
import { renderChildren, rescueFocus, separatorHidden, shownCollapsed } from "./children.ts";
import {
  hidingPanels,
  layoutGroup,
  moveSeparator,
  type PanelRequest,
  type ResolvedRequest,
  resolveRequest,
  sameRequest,
  sameShape,
  type SnapRule,
  type Snapshot,
} from "../model/layout.ts";
import { Motion } from "../style/motion.ts";
import { BentoPanel, panelAccess } from "../elements/panel.ts";
import type { Axis } from "../model/render.ts";
import { BentoSeparator, separatorAccess } from "../elements/separator.ts";

/** The group's panels, what they asked and what they got, at one moment. */
type GroupSnapshot = Snapshot<BentoPanel>;

/** The group before its first layout. */
const emptySnapshot: GroupSnapshot = {
  panels: [],
  requests: [],
  resolved: [],
  layout: [],
  space: null,
};

/** What changed while a group was hidden applies at once when it shows again. */
const unanimated = (reason: Relayout): Relayout =>
  reason.kind === "written" ? { ...reason, animate: false } : reason;

/** How a double-click's reset of the collapsed state went. */
type ResetOutcome = "unchanged" | "toggled" | "vetoed";

export class GroupCoordinator implements GroupLink {
  readonly #host: BentoGroupElement;
  readonly #measure: GroupMeasure;
  readonly #motion = new Motion<BentoPanel>(panelAccess.content, () => this.#writeChildren());
  #children: readonly Element[] = [];
  #committed: GroupSnapshot = emptySnapshot;
  readonly #announcements = new Announcements();
  /** Panels the user or app expanded, most recent first; they keep their space longest. */
  #priority: readonly BentoPanel[] = [];
  /** Reasons to lay out again at the end of the task, or once the group shows again. */
  #queued: Relayout[] = [];
  /** Hidden by an ancestor after its first measured layout, which it keeps meanwhile. */
  #hidden = false;
  #drag: DragState<BentoSeparator, BentoPanel> = idle;
  readonly #keyResized = new Set<BentoPanel>();
  readonly #keyResizeQueue = new ResizeQueue();

  constructor(host: BentoGroupElement) {
    this.#host = host;
    this.#measure = new GroupMeasure(
      host,
      () => this.axis(),
      () => this.#measured(),
    );
  }

  connected(): void {
    this.#measure.start();
    this.childrenChanged();
  }

  disconnected(): void {
    this.#measure.stop();
    this.#children = [];
  }

  childrenChanged(): void {
    const children = [...this.#host.children];
    for (const child of this.#children) {
      if (children.includes(child)) continue;
      leaveGroup(child, this);
      this.#measure.untrack(child);
      if (child instanceof BentoPanel) this.#announcements.forget(child);
    }
    for (const child of children) {
      joinGroup(child, this);
      if (!(child instanceof BentoPanel)) this.#measure.track(child);
    }
    this.#children = children;
    this.#priority = this.#priority.filter((panel) => children.includes(panel));
    this.invalidate({ kind: "resettle" });
  }

  axis(): Axis {
    return this.#host.orientation === "vertical" ? "block" : "inline";
  }

  invalidate(reason: Relayout): void {
    if (this.#queued.push(reason) === 1) queueMicrotask(() => this.#flush());
  }

  settle(): void {
    this.#motion.finish();
  }

  moveToFront(panel: BentoPanel): void {
    this.#priority = [panel, ...this.#priority.filter((other) => other !== panel)];
  }

  startDrag(separator: BentoSeparator): void {
    this.settle();
    this.#drag = pressed(separator, this.#committed);
  }

  dragTo(separator: BentoSeparator, pointerDelta: number): void {
    const drag = this.#drag;
    if (drag.kind !== "dragging" || drag.separator !== separator) return;
    const delta = deltaFromStart(drag, pointerDelta);
    const { resized, vetoed } = this.#move(separator, delta, "halfway", drag.start, drag.vetoed);
    this.#drag = moved(drag, pointerDelta, vetoed, resized);
    dispatchResize(resized, "resize");
  }

  endDrag(): void {
    const drag = this.#drag;
    this.#drag = idle;
    if (drag.kind === "dragging") dispatchResize(drag.resized, "resizeend");
  }

  step(separator: BentoSeparator, delta: number): void {
    this.settle();
    const { resized } = this.#move(separator, delta, "atMin", this.#committed, new Set());
    for (const panel of resized) this.#keyResized.add(panel);
    this.#keyResizeQueue.add(resized);
  }

  /** Home on a collapsed panel keeps it at its smallest size; only Enter collapses or expands. */
  stepPrimaryTo(separator: BentoSeparator, bound: "min" | "max"): void {
    const { panels: inGroup, resolved, layout, space } = this.#committed;
    const primary = separatorAccess.primary(separator);
    const index = primary ? inGroup.indexOf(primary) : -1;
    const request = resolved[index];
    const box = layout[index];
    if (!request || !box || space === null) return;
    if (bound === "min" && box.collapsed) return;
    const target = bound === "min" ? request.min : Math.min(request.max, space);
    const towardsEnd = primary === separator.previousElementSibling ? 1 : -1;
    this.step(separator, (target - box.size) * towardsEnd);
  }

  endSteps(): void {
    if (this.#keyResized.size === 0) return;
    this.#keyResizeQueue.flush();
    dispatchResize(this.#keyResized, "resizeend");
    this.#keyResized.clear();
  }

  toggle(separator: BentoSeparator): void {
    const primary = separatorAccess.primary(separator);
    if (primary?.collapsible) this.#toggleByUser(primary, !primary.collapsed);
  }

  /** Double-click: the primary panel returns to its starting size and collapsed state. */
  reset(separator: BentoSeparator): void {
    const primary = separatorAccess.primary(separator);
    if (!primary) return;
    const sizeBefore = primary.size;
    panelAccess.resetSize(primary);
    const outcome = this.#resetCollapsed(primary);
    if (outcome !== "toggled") this.#render([{ kind: "resettle" }]);
    if (outcome !== "vetoed") panelAccess.resetCollapsed(primary);
    if (primary.size === sizeBefore) return;
    dispatchResize([primary], "resize");
    dispatchResize([primary], "resizeend");
  }

  /**
   * The collapsed part of a reset. A panel that shows its starting state already only takes
   * it as asked, as when the group collapsed it and it starts collapsed.
   */
  #resetCollapsed(panel: BentoPanel): ResetOutcome {
    const starting = panel.defaultCollapsed;
    if (panel.collapsed !== starting) {
      return this.#toggleByUser(panel, starting) ? "toggled" : "vetoed";
    }
    if (panelAccess.askedCollapsed(panel) === starting) return "unchanged";
    panelAccess.toggledByUser(panel, starting);
    this.#render([{ kind: "written", panel, animate: false }]);
    return "toggled";
  }

  #flush(): void {
    if (this.#queued.length > 0) this.#render([]);
  }

  #measured(): void {
    this.#render([{ kind: "resettle" }]);
  }

  #childPanels(): BentoPanel[] {
    return this.#children.filter((child) => child instanceof BentoPanel);
  }

  /** The px the panels in the group share; null while unmeasured or hidden. */
  #space(inGroup: readonly BentoPanel[]): number | null {
    const others = this.#children.filter(
      (child) => !(child instanceof BentoPanel) && !separatorHidden(child),
    );
    return this.#measure.space(others, inGroup.length);
  }

  #priorityOrder(inGroup: readonly BentoPanel[]): number[] {
    const recent = this.#priority.filter((panel) => inGroup.includes(panel));
    const rest = inGroup.filter((panel) => !recent.includes(panel));
    return [...recent, ...rest].map((panel) => inGroup.indexOf(panel));
  }

  /** Lays out panels at `space`, or, unmeasured, from their requests alone. */
  #layOut(
    panels: readonly BentoPanel[],
    requests: readonly PanelRequest[],
    space: number | null,
  ): GroupSnapshot {
    const resolved = requests.map((request) => resolveRequest(request, space ?? 0));
    const layout = layoutGroup(space ?? Infinity, resolved, this.#priorityOrder(panels));
    return { panels, requests, resolved, layout, space };
  }

  /**
   * Lays the panels out and renders every child. A group hidden by an ancestor keeps its
   * layout until it shows again. Collapses and expands that nobody announced fire
   * non-cancelable toggle events, except in the first measured layout, the starting state.
   */
  #render(reasons: readonly Relayout[]): void {
    const allPanels = this.#childPanels();
    const inGroup = allPanels.filter((panel) => !panelAccess.isModal(panel));
    const space = this.#space(inGroup);
    const before = this.#committed;
    const wasHidden = this.#hidden;
    this.#hidden = space === null && before.space !== null;
    if (this.#hidden) {
      this.#queued.push(...reasons);
      return;
    }
    const queued = [...this.#queued, ...reasons];
    this.#queued = [];
    const all = wasHidden ? queued.map(unanimated) : queued;
    const next = this.#layOut(inGroup, inGroup.map(panelAccess.request), space);
    if (!all.some((reason) => reason.kind === "move")) {
      this.#drag = rebased(this.#drag, next, changedPanels(before, next));
    }
    const written = all.flatMap((reason) => (reason.kind === "written" ? [reason] : []));

    const shown = new Map(allPanels.map((panel) => [panel, shownCollapsed(next, panel)]));
    const quiet = new Set(written.map(({ panel }) => panel));
    const announced = space === null ? null : this.#announcements.announce(shown, quiet);
    rescueFocus(hidingPanels(before, next));
    this.#motion.transition(before, next, written.find(({ animate }) => animate)?.panel ?? null);
    this.#committed = next;
    this.#writeChildren();
    announced?.();
  }

  #writeChildren(): void {
    renderChildren(this.#children, this.#committed, this.axis(), (panel) =>
      this.#motion.frozen(panel),
    );
  }

  /**
   * Moves a separator by `delta` from `start`, asking before every collapse or expand it
   * causes; a veto holds the panel until the move no longer toggles it. Returns the panels
   * whose live size changed, and the vetoes that still hold.
   */
  #move(
    separator: BentoSeparator,
    delta: number,
    snap: SnapRule,
    start: GroupSnapshot,
    vetoed: ReadonlySet<BentoPanel>,
  ): { resized: BentoPanel[]; vetoed: ReadonlySet<BentoPanel> } {
    const committed = this.#committed;
    const { panels: inGroup, layout: currentLayout, space } = committed;
    const before = inGroup.findIndex((panel) => panel === separator.previousElementSibling);
    const after = separator.nextElementSibling;
    const moves = before >= 0 && inGroup[before + 1] === after && sameShape(start, committed);
    if (!moves) return { resized: [], vetoed };

    /** Moves from what shows: a panel the group collapsed opens as the user's expand. */
    const startShown = start.resolved.map((request, index) => ({
      ...request,
      collapsed: start.layout[index]?.collapsed ?? request.collapsed,
    }));
    const propose = (holding: ReadonlySet<BentoPanel>) =>
      moveSeparator(startShown, start.layout, {
        before,
        delta,
        snap,
        vetoed: new Set([...holding].map((panel) => inGroup.indexOf(panel))),
      });
    /** Only the separator's neighbours toggle in a move; others keep what shows. */
    const togglesIn = (proposal: readonly ResolvedRequest[]) =>
      [inGroup[before], inGroup[before + 1]].filter(
        (panel): panel is BentoPanel =>
          panel !== undefined &&
          proposal[inGroup.indexOf(panel)]?.collapsed !==
            currentLayout[inGroup.indexOf(panel)]?.collapsed,
      );

    const stillToggling = new Set(togglesIn(propose(new Set())));
    const holding = new Set([...vetoed].filter((panel) => stillToggling.has(panel)));
    let proposal = propose(holding);
    for (const panel of togglesIn(proposal)) {
      const collapsed = proposal[inGroup.indexOf(panel)]?.collapsed ?? false;
      if (!dispatchBeforeToggle(panel, collapsed, "user")) holding.add(panel);
    }
    proposal = propose(holding);
    const toggled = togglesIn(proposal);

    const resized: BentoPanel[] = [];
    inGroup.forEach((panel, index) => {
      const request = proposal[index];
      if (!request) return;
      const kind = committed.requests[index]?.size ?? null;
      const size = request.size === null ? null : lengthLike(kind, request.size, space ?? 0);
      if (size && formatLength(size) !== panel.size) {
        panelAccess.resizedByUser(panel, size);
        resized.push(panel);
      }
      if (toggled.includes(panel)) panelAccess.toggledByUser(panel, request.collapsed);
    });
    const toggleReasons = toggled.map((panel): Relayout => ({
      kind: "written",
      panel,
      animate: true,
    }));
    this.#render([{ kind: "move" }, ...toggleReasons]);
    for (const panel of toggled) dispatchToggle(panel, panel.collapsed);
    return { resized, vetoed: holding };
  }

  /** Enter, or the collapsed part of a double-click: returns false when a listener vetoed it. */
  #toggleByUser(panel: BentoPanel, collapsed: boolean): boolean {
    if (!dispatchBeforeToggle(panel, collapsed, "user")) return false;
    panelAccess.toggledByUser(panel, collapsed);
    this.#render([{ kind: "written", panel, animate: true }]);
    dispatchToggle(panel, collapsed);
    return true;
  }
}

/** Panels in both layouts whose request changed between them. */
function changedPanels(before: GroupSnapshot, next: GroupSnapshot): Set<BentoPanel> {
  return new Set(
    next.panels.filter((panel, index) => {
      const earlier = before.requests[before.panels.indexOf(panel)];
      const now = next.requests[index];
      return earlier !== undefined && now !== undefined && !sameRequest(earlier, now);
    }),
  );
}
