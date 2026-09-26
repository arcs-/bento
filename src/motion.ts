/**
 * Toggle animations with Web Animations: each changed panel's `flex` runs from the layout
 * before to the layout after, over the final rules, so nothing is committed to `style`. While
 * it runs, every changed panel's content is frozen, so nothing reflows per frame.
 */
import { sameShape, type Snapshot, stillEdge } from "./layout.ts";
import type { ContentState } from "./styles.ts";

export interface Timing {
  readonly duration: number;
  readonly easing: string;
}

/** The first entry of a computed list, which may contain commas inside functions. */
const firstEntry = (list: string) => list.split(/,(?![^(]*\))/)[0]?.trim() ?? "";

/** The panel's own `transition-duration` and `transition-timing-function`; reads style, not layout. */
export function toggleTiming(panel: Element): Timing {
  const style = getComputedStyle(panel);
  const duration = firstEntry(style.transitionDuration);
  const milliseconds = duration.endsWith("ms") ? 1 : 1000;
  return {
    duration: (Number.parseFloat(duration) || 0) * milliseconds,
    easing: firstEntry(style.transitionTimingFunction) || "ease",
  };
}

const prefersReducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

interface SizeChange<Panel> {
  readonly panel: Panel;
  readonly from: number;
  readonly to: number;
}

interface Run<Panel> {
  readonly animations: readonly Animation[];
  /** The size changes, while they can still be reversed exactly. */
  readonly changes: readonly SizeChange<Panel>[];
  readonly frozen: ReadonlyMap<Panel, ContentState>;
}

const flexAt = (size: number): Keyframe => ({ flex: `0 0 ${size}px` });

export class Motion<Panel extends Element> {
  #run: Run<Panel> | null = null;
  readonly #contentOf: (panel: Panel) => Element;
  readonly #settled: () => void;

  /** `settled` runs whenever frozen content is free again, to render it. */
  constructor(contentOf: (panel: Panel) => Element, settled: () => void) {
    this.#contentOf = contentOf;
    this.#settled = settled;
  }

  frozen(panel: Panel): ContentState | null {
    return this.#run?.frozen.get(panel) ?? null;
  }

  /**
   * The layout moves from `before` to `after`. A running toggle that this undoes exactly
   * reverses; any other change finishes it first. The change animates when `source`, the
   * panel whose toggle caused it, is given; it times the animation.
   */
  transition(before: Snapshot<Panel>, after: Snapshot<Panel>, source: Panel | null): void {
    const comparable = before.space !== null && sameShape(before, after);
    const changes = comparable ? sizeChanges(before, after) : [];
    if (this.#run) {
      if (comparable && changes.length === 0) return;
      if (source && this.#reverses(changes)) return;
      this.#stop();
    }
    if (!source || changes.length === 0) return;
    const timing = toggleTiming(source);
    if (timing.duration <= 0) return;

    const frozen = new Map<Panel, ContentState>();
    after.panels.forEach((panel, index) => {
      const change = changes.find((candidate) => candidate.panel === panel);
      if (!change) return;
      const anchor = stillEdge(before.layout, after.layout, index);
      frozen.set(panel, { kind: "frozen", size: Math.max(change.from, change.to), anchor });
    });
    const reduced = prefersReducedMotion();
    const animations = reduced
      ? this.#crossFade(before, after, changes, timing)
      : changes.map(({ panel, from, to }) => panel.animate([flexAt(from), flexAt(to)], timing));
    const run: Run<Panel> = { animations, changes: reduced ? [] : changes, frozen };
    this.#run = run;
    const lastToEnd = animations.at(-1);
    if (lastToEnd) {
      lastToEnd.onfinish = () => {
        if (this.#run !== run) return;
        this.#run = null;
        this.#settled();
      };
    }
  }

  /** Jumps a running toggle to its end and renders the settled state. */
  finish(): void {
    if (!this.#run) return;
    this.#stop();
    this.#settled();
  }

  #stop(): void {
    const run = this.#run;
    this.#run = null;
    for (const animation of run?.animations ?? []) animation.finish();
  }

  /** Reverses the running toggle when `changes` lead exactly back to where it started. */
  #reverses(changes: readonly SizeChange<Panel>[]): boolean {
    const run = this.#run;
    if (!run || run.changes.length === 0 || run.changes.length !== changes.length) return false;
    const undoes = run.changes.every(({ panel, from }) => {
      const change = changes.find((candidate) => candidate.panel === panel);
      return change && Math.abs(change.to - from) < 0.5;
    });
    if (!undoes) return false;
    for (const animation of run.animations) animation.reverse();
    this.#run = { ...run, changes };
    return true;
  }

  /**
   * Reduced motion: the size changes at once and every toggled panel's content fades in its
   * own direction. Collapsing content fades out first, while the sizes hold; expanding content
   * fades in after the change. Returns the animations in the order they end.
   */
  #crossFade(
    before: Snapshot<Panel>,
    after: Snapshot<Panel>,
    changes: readonly SizeChange<Panel>[],
    timing: Timing,
  ): Animation[] {
    const toggled = after.panels
      .flatMap((panel, index) => {
        const collapsing = after.layout[index]?.collapsed ?? false;
        return collapsing === before.layout[index]?.collapsed ? [] : [{ panel, collapsing }];
      })
      .toSorted((first, second) => Number(second.collapsing) - Number(first.collapsing));
    const anyCollapsing = toggled.some(({ collapsing }) => collapsing);
    const holds = anyCollapsing
      ? changes.map(({ panel, from }) => panel.animate([flexAt(from), flexAt(from)], timing))
      : [];
    const fades = toggled.map(({ panel, collapsing }) =>
      this.#contentOf(panel).animate(
        { opacity: collapsing ? [1, 0] : [0, 1] },
        { ...timing, delay: !collapsing && anyCollapsing ? timing.duration : 0, fill: "backwards" },
      ),
    );
    return [...holds, ...fades];
  }
}

function sizeChanges<Panel>(before: Snapshot<Panel>, after: Snapshot<Panel>): SizeChange<Panel>[] {
  return after.panels.flatMap((panel, index) => {
    const from = before.layout[index]?.size ?? 0;
    const to = after.layout[index]?.size ?? 0;
    return Math.abs(from - to) < 0.5 ? [] : [{ panel, from, to }];
  });
}
