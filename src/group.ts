import type { BentoGroupElement, Orientation } from "./bento.ts";
import { upgradeProperties } from "./elements.ts";
import { dispatchBeforeToggle, dispatchResize, dispatchToggle, ResizeQueue } from "./events.ts";
import {
  type Layout,
  layoutGroup,
  moveSeparator,
  type PanelBox,
  type PanelIntent,
  type PanelSettings,
  resolveIntent,
  type SnapRule,
  stillEdge,
} from "./layout.ts";
import { Motion, prefersReducedMotion, type SizeChange, toggleTiming } from "./motion.ts";
import { BentoPanel, type PanelGroupLink } from "./panel.ts";
import { BentoSeparator, type SeparatorGroupLink, type SeparatorRender } from "./separator.ts";
import {
  type Axis,
  type ContentState,
  groupRules,
  groupSheet,
  type PanelRender,
} from "./styles.ts";

/** The committed layout of the panels in the group, in DOM order; modal panels are left out. */
interface Snapshot {
  readonly panels: readonly BentoPanel[];
  readonly settings: readonly PanelSettings[];
  readonly intents: readonly PanelIntent[];
  readonly layout: Layout;
  /** Null before the first measurement; the layout then comes from the attributes alone. */
  readonly space: number | null;
}

/** A drag in progress: every move measures from `start`, so dragging back restores pushed panels. */
interface DragSession {
  readonly separator: BentoSeparator;
  start: Snapshot;
  /** The delta already applied when the session last rebased onto a changed group. */
  offset: number;
  latestDelta: number;
  readonly vetoed: Set<BentoPanel>;
  readonly resized: Set<BentoPanel>;
}

interface AxisSizes {
  readonly inline: number;
  readonly block: number;
}

const emptySnapshot: Snapshot = { panels: [], settings: [], intents: [], layout: [], space: null };

const px = (size: number) => `${size}px`;

const isModal = (element: Element | null) => element instanceof BentoPanel && element.isModal;

const samePanels = (before: Snapshot, after: Snapshot) =>
  before.panels.length === after.panels.length &&
  before.panels.every((panel, index) => panel === after.panels[index]);

function sameLayout(before: Layout, after: Layout): boolean {
  return (
    before.length === after.length &&
    before.every((box, index) => {
      const other = after[index];
      return other && Math.abs(box.size - other.size) < 0.5 && box.collapsed === other.collapsed;
    })
  );
}

export class BentoGroup
  extends HTMLElement
  implements BentoGroupElement, PanelGroupLink, SeparatorGroupLink
{
  static readonly observedAttributes = ["orientation"];

  readonly #sheet = new CSSStyleSheet();
  readonly #observer = new ResizeObserver((entries) => this.#measured(entries));
  readonly #sizes = new Map<Element, AxisSizes>();
  readonly #motion = new Motion();
  /** Content frozen while a toggle animates. */
  readonly #frozen = new Map<BentoPanel, ContentState>();
  #gap = 0;
  #children: readonly Element[] = [];
  #committed: Snapshot = emptySnapshot;
  /** Panels the user or app expanded, most recent first; they keep their space longest. */
  #priority: readonly BentoPanel[] = [];
  /** A batched layout is queued; true when it animates. */
  #pending: boolean | null = null;
  /**
   * A toggle written after the first layout but before the first measurement animates once
   * measured, from the layout before it.
   */
  #toggledBeforeMeasure: Snapshot | null = null;
  #drag: DragSession | null = null;
  readonly #keyResized = new Set<BentoPanel>();
  readonly #keyResizeQueue = new ResizeQueue();

  constructor() {
    super();
    const root = this.attachShadow({ mode: "open" });
    root.adoptedStyleSheets = [groupSheet, this.#sheet];
    const slot = document.createElement("slot");
    slot.addEventListener("slotchange", () => this.#childrenChanged());
    root.append(slot);
    this.#sheet.replaceSync(groupRules(this.axis));
    upgradeProperties(this, ["orientation"]);
  }

  connectedCallback(): void {
    this.#observer.observe(this);
    this.#childrenChanged();
  }

  disconnectedCallback(): void {
    this.#observer.disconnect();
    this.#sizes.clear();
    this.#children = [];
  }

  attributeChangedCallback(): void {
    this.#sheet.replaceSync(groupRules(this.axis));
    this.invalidate(false);
  }

  get orientation(): Orientation {
    return this.getAttribute("orientation") === "vertical" ? "vertical" : "horizontal";
  }

  set orientation(orientation: Orientation) {
    this.setAttribute("orientation", orientation);
  }

  get axis(): Axis {
    return this.orientation === "vertical" ? "block" : "inline";
  }

  invalidate(animate: boolean): void {
    if (this.#pending === null) queueMicrotask(() => this.#pending !== null && this.#render());
    this.#pending = Boolean(this.#pending) || animate;
  }

  settle(): void {
    if (!this.#motion.running) return;
    this.#motion.finish();
    this.#frozen.clear();
    this.#writeChildren();
  }

  expanded(panel: BentoPanel): void {
    this.#priority = [panel, ...this.#priority.filter((other) => other !== panel)];
  }

  startDrag(separator: BentoSeparator): void {
    this.settle();
    this.#drag = {
      separator,
      start: this.#committed,
      offset: 0,
      latestDelta: 0,
      vetoed: new Set(),
      resized: new Set(),
    };
  }

  dragTo(separator: BentoSeparator, delta: number): void {
    const drag = this.#drag;
    if (drag?.separator !== separator) return;
    drag.latestDelta = delta;
    const resized = this.#move(separator, delta - drag.offset, "halfway", drag.start, drag.vetoed);
    for (const panel of resized) drag.resized.add(panel);
    dispatchResize(resized, "resize");
  }

  endDrag(): void {
    const drag = this.#drag;
    this.#drag = null;
    if (drag) dispatchResize(drag.resized, "resizeend");
  }

  step(separator: BentoSeparator, delta: number): void {
    this.settle();
    const resized = this.#move(separator, delta, "atMin", this.#committed, new Set());
    for (const panel of resized) this.#keyResized.add(panel);
    this.#keyResizeQueue.add(resized);
  }

  stepPrimaryTo(separator: BentoSeparator, bound: "min" | "max"): void {
    const { panels, intents, layout, space } = this.#committed;
    const primary = separator.primary;
    const index = primary ? panels.indexOf(primary) : -1;
    const intent = intents[index];
    const box = layout[index];
    if (!intent || !box || space === null) return;
    const target = bound === "min" ? intent.min : Math.min(intent.max, space);
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
    const primary = separator.primary;
    if (primary?.collapsible) this.#toggleByUser(primary, !primary.collapsed);
  }

  /** Double-click: the primary panel returns to its default size and collapsed state. */
  reset(separator: BentoSeparator): void {
    const primary = separator.primary;
    if (!primary) return;
    const sizeBefore = primary.size;
    primary.resetSize();
    const toggles = primary.collapsed !== primary.defaultCollapsed;
    if (!(toggles && this.#toggleByUser(primary, primary.defaultCollapsed))) this.#render(false);
    primary.cleanCollapsed();
    if (primary.size !== sizeBefore) {
      dispatchResize([primary], "resize");
      dispatchResize([primary], "resizeend");
    }
  }

  #childrenChanged(): void {
    const children = [...this.children];
    for (const child of this.#children) {
      if (children.includes(child)) continue;
      if (child instanceof BentoPanel || child instanceof BentoSeparator) child.detach(this);
      this.#observer.unobserve(child);
      this.#sizes.delete(child);
    }
    for (const child of children) {
      if (child instanceof BentoPanel || child instanceof BentoSeparator) child.attach(this);
      if (!(child instanceof BentoPanel)) this.#observer.observe(child, { box: "border-box" });
    }
    this.#children = children;
    this.#priority = this.#priority.filter((panel) => children.includes(panel));
    this.invalidate(false);
  }

  #measured(entries: readonly ResizeObserverEntry[]): void {
    for (const entry of entries) {
      const [box] = entry.target === this ? entry.contentBoxSize : entry.borderBoxSize;
      if (box) this.#sizes.set(entry.target, { inline: box.inlineSize, block: box.blockSize });
    }
    const style = getComputedStyle(this);
    this.#gap = Number.parseFloat(this.axis === "inline" ? style.columnGap : style.rowGap) || 0;
    this.#render();
  }

  #panels(): BentoPanel[] {
    return this.#children.filter((child) => child instanceof BentoPanel);
  }

  #separatorHidden(separator: Element): boolean {
    return isModal(separator.previousElementSibling) || isModal(separator.nextElementSibling);
  }

  /** The px the panels share: the group's content box less the other children and the gaps. */
  #space(inGroup: readonly BentoPanel[]): number | null {
    const groupSize = this.#sizes.get(this);
    if (!groupSize || (groupSize.inline === 0 && groupSize.block === 0)) return null;
    const others = this.#children.filter(
      (child) => !(child instanceof BentoPanel || this.#separatorHidden(child)),
    );
    const othersSize = others.reduce(
      (total, child) => total + (this.#sizes.get(child)?.[this.axis] ?? 0),
      0,
    );
    const items = inGroup.length + others.length;
    return Math.max(0, groupSize[this.axis] - othersSize - this.#gap * Math.max(0, items - 1));
  }

  /** Lays out panels at `space`, or, unmeasured, from their settings alone. */
  #layOut(
    panels: readonly BentoPanel[],
    settings: readonly PanelSettings[],
    space: number | null,
  ): Snapshot {
    const intents = settings.map((setting) => resolveIntent(setting, space ?? 0));
    const layout = layoutGroup(space ?? Infinity, intents, this.#priorityOrder(panels));
    return { panels, settings, intents, layout, space };
  }

  #priorityOrder(inGroup: readonly BentoPanel[]): number[] {
    const recent = this.#priority.filter((panel) => inGroup.includes(panel));
    const rest = inGroup.filter((panel) => !recent.includes(panel));
    return [...recent, ...rest].map((panel) => inGroup.indexOf(panel));
  }

  /**
   * Lays the panels out and renders every child. Collapses the app or user did not make fire
   * non-cancelable toggle events; the first layout fires none.
   */
  #render(requested = false, rebaseDrag = true): void {
    let animate = requested || Boolean(this.#pending);
    this.#pending = null;
    const allPanels = this.#panels();
    const panels = allPanels.filter((panel) => !panel.isModal);
    const space = this.#space(panels);
    const next = this.#layOut(
      panels,
      panels.map((panel) => panel.settings()),
      space,
    );
    const { layout } = next;
    let before = this.#committed;
    if (space === null && animate && before !== emptySnapshot) {
      this.#toggledBeforeMeasure ??= before;
    } else if (space !== null && before.space === null) {
      const unmeasured = this.#toggledBeforeMeasure ?? before;
      animate ||= this.#toggledBeforeMeasure !== null;
      this.#toggledBeforeMeasure = null;
      before = this.#layOut(unmeasured.panels, unmeasured.settings, space);
    }

    const collapsedIn = (panel: BentoPanel) => {
      const box = layout[panels.indexOf(panel)];
      return box ? box.collapsed : panel.collapsedByMode;
    };
    const toggled = allPanels.filter(
      (panel) => panel.announced !== null && panel.announced !== collapsedIn(panel),
    );
    for (const panel of toggled) dispatchBeforeToggle(panel, collapsedIn(panel), "other");

    this.#animateTo(before, next, animate);
    this.#committed = next;
    if (rebaseDrag && this.#drag) {
      this.#drag.start = next;
      this.#drag.offset = this.#drag.latestDelta;
    }
    this.#writeChildren();

    for (const panel of allPanels) {
      const collapsed = collapsedIn(panel);
      if (panel.announced === null) panel.announced = collapsed;
    }
    for (const panel of toggled) {
      panel.announced = collapsedIn(panel);
      dispatchToggle(panel, collapsedIn(panel));
    }
  }

  /** Starts, reverses, keeps or finishes the toggle animation for a new layout. */
  #animateTo(before: Snapshot, next: Snapshot, animate: boolean): void {
    const comparable =
      before.space !== null && before.space === next.space && samePanels(before, next);
    const changes: SizeChange[] = comparable
      ? next.panels.flatMap((panel, index) => {
          const from = before.layout[index]?.size ?? 0;
          const to = next.layout[index]?.size ?? 0;
          return Math.abs(from - to) < 0.5 ? [] : [{ panel, from, to }];
        })
      : [];

    if (this.#motion.running) {
      if (comparable && sameLayout(before.layout, next.layout)) return;
      const targets = new Map(changes.map(({ panel, to }) => [panel, to]));
      if (animate && comparable && this.#motion.reverseTo(targets)) return;
      this.settle();
    }

    const toggledIndex = next.layout.findIndex(
      (box, index) => box.collapsed !== before.layout[index]?.collapsed,
    );
    const toggledPanel = next.panels[toggledIndex];
    const toggledBox = next.layout[toggledIndex];
    if (!animate || !toggledPanel || !toggledBox || changes.length === 0) return;
    const timing = toggleTiming(toggledPanel);
    if (timing.duration <= 0) return;

    next.panels.forEach((panel, index) => {
      const change = changes.find((candidate) => candidate.panel === panel);
      if (!change) return;
      const anchor = stillEdge(before.layout, next.layout, index);
      this.#frozen.set(panel, { kind: "frozen", size: Math.max(change.from, change.to), anchor });
    });
    const fade = prefersReducedMotion()
      ? { content: toggledPanel.content, collapsing: toggledBox.collapsed }
      : null;
    this.#motion.start(changes, timing, fade, () => {
      this.#frozen.clear();
      this.#writeChildren();
    });
  }

  #writeChildren(): void {
    const { panels, intents, layout, space } = this.#committed;
    const firstFiller = panels[layout.findIndex((box) => box.fills)];
    for (const child of this.#children) {
      if (child instanceof BentoPanel) {
        const index = panels.indexOf(child);
        const intent = intents[index];
        const box = layout[index];
        if (intent && box) child.render(this.#panelRender(child, intent, box, space !== null));
        else child.render(this.#modalRender(child, firstFiller));
      }
      if (child instanceof BentoSeparator) child.render(this.#separatorRender(child));
    }
  }

  #panelRender(
    panel: BentoPanel,
    intent: PanelIntent,
    box: PanelBox,
    measured: boolean,
  ): PanelRender {
    const unmeasuredFixed = !measured && !box.collapsed;
    const content: ContentState =
      this.#frozen.get(panel) ??
      (box.collapsed
        ? { kind: box.size === 0 ? "hidden" : "rail" }
        : { kind: "shown", min: px(intent.min) });
    return {
      kind: "inline",
      axis: this.axis,
      basis: box.fills ? null : unmeasuredFixed ? panel.sizeText : px(box.size),
      fillMin: measured ? px(Math.min(intent.min, box.size)) : "0px",
      fillMax: Number.isFinite(intent.max) ? px(intent.max) : null,
      content,
    };
  }

  /** A modal sheet sits on the side of the group its panel does, as wide as its size. */
  #modalRender(panel: BentoPanel, firstFiller: BentoPanel | undefined): PanelRender {
    const precedes =
      !firstFiller ||
      Boolean(panel.compareDocumentPosition(firstFiller) & Node.DOCUMENT_POSITION_FOLLOWING);
    return {
      kind: "modal",
      axis: this.axis,
      side: precedes ? "start" : "end",
      size: panel.sizeText,
    };
  }

  #separatorRender(separator: BentoSeparator): SeparatorRender {
    const { panels, intents, layout, space } = this.#committed;
    const primary = separator.primary;
    const index = primary ? panels.indexOf(primary) : -1;
    const intent = intents[index];
    const share = (size: number) => (space ? (size / space) * 100 : 0);
    const othersNeed = intents.reduce(
      (total, other, otherIndex) =>
        otherIndex === index ? total : total + (other.collapsed ? other.collapsedSize : other.min),
      0,
    );
    return {
      axis: this.axis,
      hidden: this.#separatorHidden(separator),
      now: share(layout[index]?.size ?? 0),
      min: share(intent ? (intent.collapsible ? intent.collapsedSize : intent.min) : 0),
      max: share(intent ? Math.min(intent.max, (space ?? 0) - othersNeed) : 0),
    };
  }

  /**
   * Moves a separator by `delta` from `start`, asking before every collapse or expand it
   * causes; a veto holds the panel. Returns the panels whose live size changed.
   */
  #move(
    separator: BentoSeparator,
    delta: number,
    snap: SnapRule,
    start: Snapshot,
    vetoed: Set<BentoPanel>,
  ): BentoPanel[] {
    const { panels, intents: current } = this.#committed;
    const before = panels.findIndex((panel) => panel === separator.previousElementSibling);
    const after = separator.nextElementSibling;
    if (before < 0 || panels[before + 1] !== after || !samePanels(start, this.#committed))
      return [];

    const propose = (holding: ReadonlySet<BentoPanel>) =>
      moveSeparator(start.intents, start.layout, {
        before,
        delta,
        snap,
        vetoed: new Set([...holding].map((panel) => panels.indexOf(panel))),
      });
    const togglesIn = (proposal: readonly PanelIntent[]) =>
      panels.filter((_panel, index) => proposal[index]?.collapsed !== current[index]?.collapsed);

    const stillToggling = new Set(togglesIn(propose(new Set())));
    for (const panel of vetoed) if (!stillToggling.has(panel)) vetoed.delete(panel);
    let proposal = propose(vetoed);
    const accepted = togglesIn(proposal).filter((panel) => {
      const collapsed = proposal[panels.indexOf(panel)]?.collapsed ?? false;
      const approved = dispatchBeforeToggle(panel, collapsed, "user");
      if (!approved) vetoed.add(panel);
      return approved;
    });
    proposal = propose(vetoed);

    const resized: BentoPanel[] = [];
    panels.forEach((panel, index) => {
      const intent = proposal[index];
      if (!intent) return;
      if (intent.size !== null && intent.size !== current[index]?.size) {
        panel.resizedByUser(intent.size);
        resized.push(panel);
      }
      if (accepted.includes(panel)) panel.toggledByUser(intent.collapsed);
    });
    this.#render(accepted.length > 0, false);
    for (const panel of accepted) dispatchToggle(panel, panel.collapsed);
    return resized;
  }

  /** Enter, or the collapsed part of a double-click: returns false when a listener vetoed it. */
  #toggleByUser(panel: BentoPanel, collapsed: boolean): boolean {
    if (!dispatchBeforeToggle(panel, collapsed, "user")) return false;
    panel.toggledByUser(collapsed);
    this.#render(true);
    dispatchToggle(panel, collapsed);
    return true;
  }
}
