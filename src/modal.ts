/**
 * The sheet of a modal panel: a `<dialog>` in the panel's shadow root. As its child it
 * inherits the panel's box styles; the top layer, Escape, the back gesture and the inert
 * page behind come from the browser. It fades in and out, timed like the panel's toggles;
 * a fade is no motion, so reduced motion keeps it.
 */
import { toggleTiming } from "./motion.ts";

export interface SheetOwner {
  readonly host: HTMLElement;
  /** Escape, the back gesture or a tap outside asked to close; the owner may refuse. */
  closeRequested(): void;
  /** The sheet closed without asking: the browser closed it, or another modal panel showed. */
  closedWithoutAsking(): void;
}

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
  #shown = false;
  #fade: Animation | null = null;
  #pressedOutside = false;

  constructor(root: ShadowRoot, owner: SheetOwner) {
    this.#owner = owner;
    const dialog = this.#dialog;
    root.append(dialog);
    dialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      owner.closeRequested();
    });
    dialog.addEventListener("close", () => {
      if (!this.#shown) return;
      this.#forget();
      owner.closedWithoutAsking();
    });
    dialog.addEventListener("pointerdown", (event) => {
      this.#pressedOutside = isOutside(event, dialog);
    });
    dialog.addEventListener("click", (event) => {
      if (this.#pressedOutside && isOutside(event, dialog)) owner.closeRequested();
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

  show(): void {
    if (this.#shown || !this.#dialog.isConnected) return;
    for (const other of shownSheets) {
      if (other.#owner.host.contains(this.#owner.host)) continue;
      other.hide();
      other.#owner.closedWithoutAsking();
    }
    this.#shown = true;
    shownSheets.add(this);
    if (!this.#dialog.open) this.#dialog.showModal();
    this.#fadeTo(1);
  }

  /** Fades the sheet out, then closes the dialog. */
  hide(): void {
    if (!this.#shown) return;
    this.#forget();
    this.#fadeTo(0);
  }

  /** Closes at once, as when the panel leaves the page or modal mode. */
  close(): void {
    this.#forget();
    this.#fade?.cancel();
    this.#dialog.close();
  }

  #forget(): void {
    this.#shown = false;
    shownSheets.delete(this);
  }

  /** Fades towards `opacity`, reversing a fade the other way that is still running. */
  #fadeTo(opacity: 0 | 1): void {
    const closeWhenHidden = () => {
      if (!this.#shown) this.#dialog.close();
    };
    const running = this.#fade?.playState === "running" ? this.#fade : null;
    if (running) {
      running.reverse();
    } else {
      const { duration, easing } = toggleTiming(this.#owner.host);
      if (duration <= 0) return closeWhenHidden();
      this.#fade = this.#dialog.animate({ opacity: [1 - opacity, opacity] }, { duration, easing });
    }
    if (this.#fade) this.#fade.onfinish = closeWhenHidden;
  }
}
