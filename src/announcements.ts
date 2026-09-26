import { dispatchBeforeToggle, dispatchToggle } from "./events.ts";

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
