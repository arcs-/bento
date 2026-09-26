import type { Axis } from "../model/render.ts";

interface AxisSizes {
  readonly inline: number;
  readonly block: number;
}

/**
 * A group's measurements, from a `ResizeObserver` only: its content box, the border boxes of
 * its children that are not panels, and its gap, read in the observer's callback.
 */
export class GroupMeasure {
  readonly #host: HTMLElement;
  readonly #axis: () => Axis;
  readonly #observer: ResizeObserver;
  readonly #sizes = new Map<Element, AxisSizes>();
  #gap = 0;

  /** `measured` runs after every delivery, once the new sizes are in. */
  constructor(host: HTMLElement, axis: () => Axis, measured: () => void) {
    this.#host = host;
    this.#axis = axis;
    this.#observer = new ResizeObserver((entries) => {
      this.#take(entries);
      measured();
    });
  }

  start(): void {
    this.#observer.observe(this.#host);
  }

  stop(): void {
    this.#observer.disconnect();
    this.#sizes.clear();
  }

  /** Measures a child that is not a panel: it takes space from the panels. */
  track(child: Element): void {
    this.#observer.observe(child, { box: "border-box" });
  }

  untrack(child: Element): void {
    this.#observer.unobserve(child);
    this.#sizes.delete(child);
  }

  /**
   * The px the panels share: the group's content box less the `others`, the children that
   * are not panels, and the gaps between everything that renders a box. Null while
   * unmeasured, or measured at 0×0 because an ancestor hides the group.
   */
  space(others: readonly Element[], panelCount: number): number | null {
    const groupSize = this.#sizes.get(this.#host);
    if (!groupSize || (groupSize.inline === 0 && groupSize.block === 0)) return null;
    const axis = this.#axis();
    const boxes = others.flatMap((child) => {
      const size = this.#sizes.get(child);
      return size && (size.inline > 0 || size.block > 0) ? [size[axis]] : [];
    });
    const othersSize = boxes.reduce((total, size) => total + size, 0);
    const items = panelCount + boxes.length;
    return Math.max(0, groupSize[axis] - othersSize - this.#gap * Math.max(0, items - 1));
  }

  #take(entries: readonly ResizeObserverEntry[]): void {
    for (const entry of entries) {
      const own = entry.target === this.#host;
      const [box] = own ? entry.contentBoxSize : entry.borderBoxSize;
      if (box) this.#sizes.set(entry.target, { inline: box.inlineSize, block: box.blockSize });
      if (own) {
        const style = getComputedStyle(this.#host);
        const gap = this.#axis() === "inline" ? style.columnGap : style.rowGap;
        this.#gap = Number.parseFloat(gap) || 0;
      }
    }
  }
}
