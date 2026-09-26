/**
 * What a group does for its children: measures, lays out, renders, animates, and turns input
 * on its separators into moves and toggles. It lives beside the group element, so none of it
 * is part of the element's surface; children reach it through the group link.
 */
import type { BentoGroupElement } from "./bento.ts";
import { deltaFromStart, type DragState, idle, moved, pressed, rebased } from "./drag.ts";
import { dispatchBeforeToggle, dispatchResize, dispatchToggle, ResizeQueue } from "./events.ts";
import { type GroupLink, joinGroup, leaveGroup, type Relayout } from "./group-link.ts";
import {
  layoutGroup,
  moveSeparator,
  type PanelRequest,
  type ResolvedRequest,
  resolveRequest,
  sameRequest,
  sameShape,
  type SnapRule,
  type Snapshot,
} from "./layout.ts";
import { Motion } from "./motion.ts";
import {
  askedCollapsed,
  BentoPanel,
  isModal,
  panelContent,
  panelRequest,
  renderPanel,
  resetCollapsed,
  resetSize,
  resizedByUser,
  toggledByUser,
} from "./panel.ts";
import { measuredRender, modalRender, separatorRender, unmeasuredRender } from "./render.ts";
import { BentoSeparator, primaryPanel, renderSeparator } from "./separator.ts";
import type { Axis } from "./styles.ts";

type Layout = Snapshot<BentoPanel>;

interface AxisSizes {
  readonly inline: number;
  readonly block: number;
}

/** The group before its first layout. */
const emptyLayout: Layout = { panels: [], requests: [], resolved: [], layout: [], space: null };

const isModalPanel = (element: Element | null) => element instanceof BentoPanel && isModal(element);

const separatorHidden = (separator: Element) =>
  isModalPanel(separator.previousElementSibling) || isModalPanel(separator.nextElementSibling);

/** What changed while a group was hidden applies at once when it shows again. */
const unanimated = (reason: Relayout): Relayout =>
  reason.kind === "toggle" ? { ...reason, animate: false } : reason;

export class GroupCoordinator implements GroupLink {
  readonly #host: BentoGroupElement;
  readonly #observer = new ResizeObserver((entries) => this.#measured(entries));
  readonly #sizes = new Map<Element, AxisSizes>();
  readonly #motion = new Motion<BentoPanel>(panelContent, () => this.#writeChildren());
  #gap = 0;
  #children: readonly Element[] = [];
  #committed: Layout = emptyLayout;
  /** The collapsed state each panel's events last told; none is told for the first measured layout. */
  readonly #announced = new Map<BentoPanel, boolean>();
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
  }

  connected(): void {
    this.#observer.observe(this.#host);
    this.childrenChanged();
  }

  disconnected(): void {
    this.#observer.disconnect();
    this.#sizes.clear();
    this.#children = [];
  }

  childrenChanged(): void {
    const children = [...this.#host.children];
    for (const child of this.#children) {
      if (children.includes(child)) continue;
      leaveGroup(child, this);
      this.#observer.unobserve(child);
      this.#sizes.delete(child);
      if (child instanceof BentoPanel) this.#announced.delete(child);
    }
    for (const child of children) {
      joinGroup(child, this);
      if (!(child instanceof BentoPanel)) this.#observer.observe(child, { box: "border-box" });
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

  stepPrimaryTo(separator: BentoSeparator, bound: "min" | "max"): void {
    const { panels, resolved, layout, space } = this.#committed;
    const primary = primaryPanel(separator);
    const index = primary ? panels.indexOf(primary) : -1;
    const request = resolved[index];
    const box = layout[index];
    if (!request || !box || space === null) return;
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
    const primary = primaryPanel(separator);
    if (primary?.collapsible) this.#toggleByUser(primary, !primary.collapsed);
  }

  /** Double-click: the primary panel returns to its starting size and collapsed state. */
  reset(separator: BentoSeparator): void {
    const primary = primaryPanel(separator);
    if (!primary) return;
    const sizeBefore = primary.size;
    resetSize(primary);
    const toggles = primary.collapsed !== primary.defaultCollapsed;
    const toggled = toggles && this.#toggleByUser(primary, primary.defaultCollapsed);
    if (!toggled) this.#render([{ kind: "resettle" }]);
    if (!toggles || toggled) resetCollapsed(primary);
    if (primary.size === sizeBefore) return;
    dispatchResize([primary], "resize");
    dispatchResize([primary], "resizeend");
  }

  #flush(): void {
    if (this.#queued.length > 0) this.#render([]);
  }

  #measured(entries: readonly ResizeObserverEntry[]): void {
    for (const entry of entries) {
      const own = entry.target === this.#host;
      const [box] = own ? entry.contentBoxSize : entry.borderBoxSize;
      if (box) this.#sizes.set(entry.target, { inline: box.inlineSize, block: box.blockSize });
      if (own) {
        const style = getComputedStyle(this.#host);
        const gap = this.axis() === "inline" ? style.columnGap : style.rowGap;
        this.#gap = Number.parseFloat(gap) || 0;
      }
    }
    this.#render([{ kind: "resettle" }]);
  }

  #panels(): BentoPanel[] {
    return this.#children.filter((child) => child instanceof BentoPanel);
  }

  /**
   * The px the panels share: the group's content box less the other children and the gaps.
   * Null while unmeasured, or measured at 0×0 because an ancestor hides the group.
   */
  #space(inGroup: readonly BentoPanel[]): number | null {
    const groupSize = this.#sizes.get(this.#host);
    if (!groupSize || (groupSize.inline === 0 && groupSize.block === 0)) return null;
    const axis = this.axis();
    const others = this.#children.filter((child) => {
      const size = this.#sizes.get(child);
      const hasBox = size !== undefined && (size.inline > 0 || size.block > 0);
      return !(child instanceof BentoPanel) && !separatorHidden(child) && hasBox;
    });
    const othersSize = others.reduce(
      (total, child) => total + (this.#sizes.get(child)?.[axis] ?? 0),
      0,
    );
    const items = inGroup.length + others.length;
    return Math.max(0, groupSize[axis] - othersSize - this.#gap * Math.max(0, items - 1));
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
  ): Layout {
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
    const allPanels = this.#panels();
    const panels = allPanels.filter((panel) => !isModal(panel));
    const space = this.#space(panels);
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
    const next = this.#layOut(panels, panels.map(panelRequest), space);
    if (!all.some((reason) => reason.kind === "move")) {
      this.#drag = rebased(this.#drag, next, changedPanels(before, next));
    }

    const toggles = all.flatMap((reason) => (reason.kind === "toggle" ? [reason] : []));
    const told = new Set(toggles.map(({ panel }) => panel));
    const collapsedIn = (panel: BentoPanel) =>
      next.layout[panels.indexOf(panel)]?.collapsed ?? askedCollapsed(panel);
    const announcing =
      space === null
        ? []
        : allPanels.filter((panel) => {
            const announced = this.#announced.get(panel);
            return !told.has(panel) && announced !== undefined && announced !== collapsedIn(panel);
          });
    for (const panel of announcing) dispatchBeforeToggle(panel, collapsedIn(panel), "other");

    this.#rescueFocus(before, next);
    this.#motion.transition(before, next, toggles.find(({ animate }) => animate)?.panel ?? null);
    this.#committed = next;
    this.#writeChildren();

    if (space !== null)
      for (const panel of allPanels) this.#announced.set(panel, collapsedIn(panel));
    for (const panel of announcing) dispatchToggle(panel, collapsedIn(panel));
  }

  /** Focus inside a panel whose content is about to be hidden moves to the panel's separator. */
  #rescueFocus(before: Layout, next: Layout): void {
    next.panels.forEach((panel, index) => {
      const box = next.layout[index];
      const previous = before.layout[before.panels.indexOf(panel)];
      const hides = box?.collapsed && box.size === 0;
      const hidden = previous?.collapsed && previous.size === 0;
      if (!hides || hidden || !panel.matches(":focus-within")) return;
      const separator = [panel.previousElementSibling, panel.nextElementSibling].find(
        (sibling) =>
          sibling instanceof BentoSeparator &&
          primaryPanel(sibling) === panel &&
          !separatorHidden(sibling),
      );
      if (separator instanceof HTMLElement) separator.focus({ preventScroll: true });
    });
  }

  #writeChildren(): void {
    const committed = this.#committed;
    const { panels, resolved, layout, space } = committed;
    const axis = this.axis();
    const firstFiller = panels[layout.findIndex((box) => box.fills)];
    for (const child of this.#children) {
      if (child instanceof BentoPanel) {
        const index = panels.indexOf(child);
        const request = resolved[index];
        const box = layout[index];
        if (!request || !box) {
          const precedes =
            !firstFiller ||
            Boolean(child.compareDocumentPosition(firstFiller) & Node.DOCUMENT_POSITION_FOLLOWING);
          const side = precedes ? "start" : "end";
          renderPanel(child, modalRender(axis, askedCollapsed(child), side, child.size));
        } else if (space === null) {
          renderPanel(child, unmeasuredRender(axis, child.size, request, box));
        } else {
          renderPanel(child, measuredRender(axis, request, box, this.#motion.frozen(child)));
        }
      }
      if (child instanceof BentoSeparator) {
        const primary = primaryPanel(child);
        const primaryIndex = primary ? panels.indexOf(primary) : -1;
        const hidden = separatorHidden(child);
        renderSeparator(child, separatorRender(axis, hidden, committed, primaryIndex));
      }
    }
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
    start: Layout,
    vetoed: ReadonlySet<BentoPanel>,
  ): { resized: BentoPanel[]; vetoed: ReadonlySet<BentoPanel> } {
    const committed = this.#committed;
    const { panels, resolved: current } = committed;
    const before = panels.findIndex((panel) => panel === separator.previousElementSibling);
    const after = separator.nextElementSibling;
    const moves = before >= 0 && panels[before + 1] === after && sameShape(start, committed);
    if (!moves) return { resized: [], vetoed };

    const propose = (holding: ReadonlySet<BentoPanel>) =>
      moveSeparator(start.resolved, start.layout, {
        before,
        delta,
        snap,
        vetoed: new Set([...holding].map((panel) => panels.indexOf(panel))),
      });
    const togglesIn = (proposal: readonly ResolvedRequest[]) =>
      panels.filter((_panel, index) => proposal[index]?.collapsed !== current[index]?.collapsed);

    const stillToggling = new Set(togglesIn(propose(new Set())));
    const holding = new Set([...vetoed].filter((panel) => stillToggling.has(panel)));
    let proposal = propose(holding);
    for (const panel of togglesIn(proposal)) {
      const collapsed = proposal[panels.indexOf(panel)]?.collapsed ?? false;
      if (!dispatchBeforeToggle(panel, collapsed, "user")) holding.add(panel);
    }
    proposal = propose(holding);
    const toggled = togglesIn(proposal);

    const resized: BentoPanel[] = [];
    panels.forEach((panel, index) => {
      const request = proposal[index];
      if (!request) return;
      if (request.size !== null && request.size !== current[index]?.size) {
        resizedByUser(panel, request.size);
        resized.push(panel);
      }
      if (toggled.includes(panel)) toggledByUser(panel, request.collapsed);
    });
    const toggleReasons = toggled.map((panel): Relayout => ({
      kind: "toggle",
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
    toggledByUser(panel, collapsed);
    this.#render([{ kind: "toggle", panel, animate: true }]);
    dispatchToggle(panel, collapsed);
    return true;
  }
}

/** Panels in both layouts whose request changed between them. */
function changedPanels(before: Layout, next: Layout): Set<BentoPanel> {
  return new Set(
    next.panels.filter((panel, index) => {
      const earlier = before.requests[before.panels.indexOf(panel)];
      const now = next.requests[index];
      return earlier !== undefined && now !== undefined && !sameRequest(earlier, now);
    }),
  );
}
