/**
 * The sheet of a modal panel: a `<dialog>` in the panel's shadow root. As its child it
 * inherits the panel's box styles; the top layer, Escape, the back gesture and the inert
 * page behind come from the browser. It fades in and out, timed like the panel's toggles;
 * a fade is no motion, so reduced motion keeps it.
 */
import { toggleTiming } from "../style/motion.ts";

export interface SheetOwner {
  readonly host: HTMLElement;
  /** Escape, the back gesture or a tap outside asked to close; the owner may refuse. */
  closeRequested(): void;
  /** The sheet closed without asking: the browser closed it, or another modal panel showed. */
  closedWithoutAsking(): void;
}

/**
 * Only a `shown` sheet has its dialog open, modal, and takes close requests. A `hiding` one is
 * a leftover: its dialog is closed, so the page is live at once, and it stays drawn, inert,
 * while it fades out. A fading sheet holds its fade, so a newer fade can tell it replaced it.
 */
type SheetState =
  | { readonly kind: "closed" }
  | { readonly kind: "shown"; readonly fadeIn: Animation | null }
  | { readonly kind: "hiding"; readonly fadeOut: Animation };

const closed: SheetState = { kind: "closed" };

const shownSheets = new Set<ModalSheet>();

function isOutside(event: MouseEvent, element: Element): boolean {
  if (event.target !== element) return false;
  const { left, right, top, bottom } = element.getBoundingClientRect();
  const { clientX, clientY } = event;
  return clientX < left || clientX > right || clientY < top || clientY > bottom;
}

export class ModalSheet {
  readonly #dialog = document.createElement("dialog");
  readonly #owner: SheetOwner;
  #state: SheetState = closed;
  #pressedOutside = false;

  constructor(root: ShadowRoot, owner: SheetOwner) {
    this.#owner = owner;
    const dialog = this.#dialog;
    root.append(dialog);
    dialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      this.#requestClose();
    });
    dialog.addEventListener("close", () => this.#closedByBrowser());
    dialog.addEventListener("pointerdown", (event) => {
      this.#pressedOutside = isOutside(event, dialog);
    });
    dialog.addEventListener("click", (event) => {
      if (this.#pressedOutside && isOutside(event, dialog)) this.#requestClose();
    });
  }

  /** Names the dialog as the panel's own `aria-label` and `aria-labelledby` name the panel. */
  name(label: string | null, labelledBy: readonly Element[]): void {
    this.#dialog.ariaLabel = label;
    if ("ariaLabelledByElements" in this.#dialog) this.#dialog.ariaLabelledByElements = labelledBy;
  }

  /** Takes the content into the sheet, for modal mode. */
  adopt(clip: Element): void {
    this.#dialog.append(clip);
  }

  /** Shows the sheet, fading back from where a fade out got to, then closes any other one. */
  show(): void {
    const state = this.#state;
    if (state.kind === "shown" || !this.#dialog.isConnected) return;
    this.#dialog.inert = false;
    if (!this.#dialog.open) this.#dialog.showModal();
    this.#state = {
      kind: "shown",
      fadeIn: this.#fadeFrom(state.kind === "hiding" ? state.fadeOut : null, 1),
    };
    shownSheets.add(this);
    for (const other of shownSheets) {
      if (other === this || other.#owner.host.contains(this.#owner.host)) continue;
      other.hide();
      other.#owner.closedWithoutAsking();
    }
  }

  /**
   * Closes the dialog, so the page behind is live and gets its focus back at once, and fades
   * the sheet out as an inert leftover. Outside the top layer, later positioned content may
   * paint over the leftover, and the backdrop goes at once.
   */
  hide(): void {
    const state = this.#state;
    if (state.kind !== "shown") return;
    shownSheets.delete(this);
    this.#dialog.close();
    const fadeOut = this.#fadeFrom(state.fadeIn, 0);
    if (!fadeOut) {
      this.#state = closed;
      return;
    }
    this.#dialog.inert = true;
    this.#state = { kind: "hiding", fadeOut };
    fadeOut.onfinish = () => {
      if (this.#state.kind === "hiding" && this.#state.fadeOut === fadeOut) this.close();
    };
  }

  /** Closes at once, leftover included, as when the panel leaves the page or modal mode. */
  close(): void {
    const state = this.#state;
    this.#state = closed;
    shownSheets.delete(this);
    if (state.kind === "hiding") state.fadeOut.cancel();
    this.#dialog.inert = false;
    this.#dialog.close();
  }

  #requestClose(): void {
    if (this.#state.kind === "shown") this.#owner.closeRequested();
  }

  /**
   * A `close` event while the sheet is shown and the dialog closed: the browser closed it
   * without asking. One from the sheet's own close, or after it opened again, is stale.
   */
  #closedByBrowser(): void {
    if (this.#state.kind !== "shown" || this.#dialog.open) return;
    this.#state = closed;
    shownSheets.delete(this);
    this.#owner.closedWithoutAsking();
  }

  /**
   * Fades towards `opacity`: reverses `running` when it still runs the other way, else starts
   * a new fade. Returns null when the panel's duration is 0.
   */
  #fadeFrom(running: Animation | null, opacity: 0 | 1): Animation | null {
    if (running?.playState === "running") {
      running.onfinish = null;
      running.reverse();
      return running;
    }
    const { duration, easing } = toggleTiming(this.#owner.host);
    if (duration <= 0) return null;
    return this.#dialog.animate({ opacity: [1 - opacity, opacity] }, { duration, easing });
  }
}
