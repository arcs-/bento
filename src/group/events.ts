/**
 * The panel's events. None bubbles and none is composed, so they reach no code but listeners
 * on the panel or, in the capture phase, its parents.
 */

export type ToggleCause = "user" | "other";

const toggleState = (collapsed: boolean) => (collapsed ? "closed" : "open");

function dispatchToggleEvent(
  panel: HTMLElement,
  type: "beforetoggle" | "toggle",
  collapsed: boolean,
  cancelable: boolean,
): boolean {
  const oldState = toggleState(!collapsed);
  const newState = toggleState(collapsed);
  return panel.dispatchEvent(new ToggleEvent(type, { oldState, newState, cancelable }));
}

/** Fires `beforetoggle`; returns false when a listener canceled a change the user asked for. */
export function dispatchBeforeToggle(
  panel: HTMLElement,
  collapsed: boolean,
  cause: ToggleCause,
): boolean {
  return dispatchToggleEvent(panel, "beforetoggle", collapsed, cause === "user");
}

export function dispatchToggle(panel: HTMLElement, collapsed: boolean): void {
  dispatchToggleEvent(panel, "toggle", collapsed, false);
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

/**
 * The collapsed state each panel's events last told, so that a layout can announce every
 * collapse and expand nobody else did, with non-cancelable toggle events.
 */
export class Announcements {
  readonly #told = new Map<HTMLElement, boolean>();

  forget(panel: HTMLElement): void {
    this.#told.delete(panel);
  }

  /**
   * Fires `beforetoggle` for every panel whose shown state differs from the one told, except
   * the `quiet` ones, whose writer announces them or needs none. Returns the step to run once
   * the new states show: it records them and fires `toggle`. A panel told nothing yet, as in
   * the first measured layout, is recorded without events.
   */
  announce(shown: ReadonlyMap<HTMLElement, boolean>, quiet: ReadonlySet<HTMLElement>): () => void {
    const changed = [...shown].filter(([panel, collapsed]) => {
      const told = this.#told.get(panel);
      return !quiet.has(panel) && told !== undefined && told !== collapsed;
    });
    for (const [panel, collapsed] of changed) dispatchBeforeToggle(panel, collapsed, "other");
    return () => {
      for (const [panel, collapsed] of shown) this.#told.set(panel, collapsed);
      for (const [panel, collapsed] of changed) dispatchToggle(panel, collapsed);
    };
  }
}
