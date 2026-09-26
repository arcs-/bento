/**
 * The panel's events. None bubbles and none is composed, so they reach no code but listeners
 * on the panel or, in the capture phase, its parents.
 */

export type ToggleCause = "user" | "other";

const toggleState = (collapsed: boolean) => (collapsed ? "closed" : "open");

/** Fires `beforetoggle`; returns false when a listener canceled a change the user asked for. */
export function dispatchBeforeToggle(
  panel: HTMLElement,
  collapsed: boolean,
  cause: ToggleCause,
): boolean {
  return panel.dispatchEvent(
    new ToggleEvent("beforetoggle", {
      oldState: toggleState(!collapsed),
      newState: toggleState(collapsed),
      cancelable: cause === "user",
    }),
  );
}

export function dispatchToggle(panel: HTMLElement, collapsed: boolean): void {
  panel.dispatchEvent(
    new ToggleEvent("toggle", {
      oldState: toggleState(!collapsed),
      newState: toggleState(collapsed),
    }),
  );
}

export function dispatchResize(panels: Iterable<HTMLElement>, type: "resize" | "resizeend"): void {
  for (const panel of panels) panel.dispatchEvent(new Event(type));
}

/** Fires `resize` in the next frame for every panel added until then, once each. */
export class ResizeQueue {
  readonly #panels = new Set<HTMLElement>();
  #frame: number | null = null;

  add(panels: Iterable<HTMLElement>): void {
    for (const panel of panels) this.#panels.add(panel);
    this.#frame ??= requestAnimationFrame(() => this.flush());
  }

  /** Fires the queued events now, as before a `resizeend` that must follow them. */
  flush(): void {
    if (this.#frame !== null) cancelAnimationFrame(this.#frame);
    this.#frame = null;
    dispatchResize(this.#panels, "resize");
    this.#panels.clear();
  }
}
