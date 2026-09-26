/**
 * The sheet of a modal panel: a `<dialog>` in the panel's shadow root. As its child it
 * inherits the panel's box styles; the top layer, Escape, the back gesture and the inert
 * page behind come from the browser.
 */

export interface SheetOwner {
  readonly host: HTMLElement;
  /** Escape, the back gesture or a tap outside asked to close; the owner may refuse. */
  closeRequested(): void;
  /** The dialog closed without asking, as browsers do against pages trapping the user. */
  closedByBrowser(): void;
  /** Another modal panel showed; one shows at a time. */
  closedForAnother(): void;
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
      if (this.#shown) {
        this.#hidden();
        owner.closedByBrowser();
      }
    });
    dialog.addEventListener("pointerdown", (event) => {
      this.#pressedOutside = isOutside(event, dialog);
    });
    dialog.addEventListener("click", (event) => {
      if (this.#pressedOutside && isOutside(event, dialog)) owner.closeRequested();
    });
  }

  set label(label: string | null) {
    this.#dialog.ariaLabel = label;
  }

  /** Takes the content into the sheet, for modal mode. */
  adopt(clip: Element): void {
    this.#dialog.append(clip);
  }

  show(): void {
    if (this.#shown || !this.#dialog.isConnected) return;
    for (const other of shownSheets) {
      if (!other.#owner.host.contains(this.#owner.host)) {
        other.hide();
        other.#owner.closedForAnother();
      }
    }
    this.#shown = true;
    shownSheets.add(this);
    this.#dialog.showModal();
  }

  hide(): void {
    if (!this.#shown) return;
    this.#hidden();
    this.#dialog.close();
  }

  #hidden(): void {
    this.#shown = false;
    shownSheets.delete(this);
  }
}
