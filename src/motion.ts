/**
 * Toggle animations with Web Animations: each changed panel's `flex` runs from the layout
 * before to the layout after, over the final rules, so nothing is committed to `style`.
 */

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

export const prefersReducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

export interface SizeChange {
  readonly panel: Element;
  readonly from: number;
  readonly to: number;
}

/** The content that cross-fades under reduced motion, instead of the size moving. */
export interface Fade {
  readonly content: Element;
  readonly collapsing: boolean;
}

const flexAt = (size: number): Keyframe => ({ flex: `0 0 ${size}px` });

export class Motion {
  #animations: Animation[] = [];
  #changes: readonly SizeChange[] = [];

  get running(): boolean {
    return this.#animations.length > 0;
  }

  /**
   * Animates the changes; `onEnd` runs once they are done, unless they were finished or
   * reversed into a new run first. Under reduced motion the size changes at once, after a
   * fade out when collapsing, before a fade in when expanding.
   */
  start(changes: readonly SizeChange[], timing: Timing, fade: Fade | null, onEnd: () => void) {
    this.finish();
    const options: KeyframeAnimationOptions = { duration: timing.duration, easing: timing.easing };
    const reduced = fade !== null;
    const sizeAnimations = changes.flatMap(({ panel, from, to }) => {
      if (!reduced) return [panel.animate([flexAt(from), flexAt(to)], options)];
      return fade.collapsing ? [panel.animate([flexAt(from), flexAt(from)], options)] : [];
    });
    const opacity = fade?.collapsing ? [1, 0] : [0, 1];
    const fadeAnimations = fade ? [fade.content.animate({ opacity }, options)] : [];
    const animations = [...sizeAnimations, ...fadeAnimations];
    this.#animations = animations;
    this.#changes = reduced ? [] : changes;
    const [first] = animations;
    if (!first) return onEnd();
    first.onfinish = () => {
      if (this.#animations !== animations) return;
      this.#animations = [];
      onEnd();
    };
  }

  /** Reverses the running toggle when `sizes` lead exactly back to where it started. */
  reverseTo(sizes: ReadonlyMap<Element, number>): boolean {
    const returnsToStart =
      this.#changes.length > 0 &&
      this.#changes.length === sizes.size &&
      this.#changes.every(({ panel, from }) => Math.abs((sizes.get(panel) ?? NaN) - from) < 0.5);
    if (!returnsToStart) return false;
    this.#changes = this.#changes.map(({ panel, from, to }) => ({ panel, from: to, to: from }));
    for (const animation of this.#animations) animation.reverse();
    return true;
  }

  /** Jumps every running animation to its end; the caller renders the settled state. */
  finish(): void {
    const animations = this.#animations;
    this.#animations = [];
    this.#changes = [];
    for (const animation of animations) animation.finish();
  }
}
