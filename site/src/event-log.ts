import type { BentoPanelElement } from "../../src/bento.ts";
import { isPanel } from "./panels.ts";

const panelEvents = ["resize", "resizeend", "beforetoggle", "toggle"] as const;

const panelName = (panel: BentoPanelElement) => (panel.id ? `#${panel.id}` : "a panel");

/**
 * Lists every bento event fired under `scope`. Panel events never bubble, so the log listens
 * in the capture phase. That runs before the panel's own listeners, so whether a listener
 * canceled a `beforetoggle` is read once the dispatch is over.
 */
export class EventLog {
  readonly #list: HTMLOListElement;
  readonly #limit = 80;

  constructor(list: HTMLOListElement, scope: EventTarget) {
    this.#list = list;
    for (const type of panelEvents) {
      scope.addEventListener(type, (event) => this.#heard(event), { capture: true });
    }
  }

  clear(): void {
    this.#list.replaceChildren();
  }

  #heard(event: Event): void {
    const panel = event.target;
    if (!isPanel(panel)) return;
    if (event instanceof ToggleEvent) {
      const entry = this.#add(event.type, panel, `${event.oldState} to ${event.newState}`);
      if (event.type === "beforetoggle" && event.cancelable) {
        queueMicrotask(() => this.#markCanceled(entry, event.defaultPrevented));
      }
      return;
    }
    const repeated = this.#list.firstElementChild;
    if (repeated instanceof HTMLLIElement && repeated.dataset.key === `${event.type}${panel.id}`) {
      this.#repeat(repeated, panel.size);
    } else {
      this.#add(event.type, panel, panel.size);
    }
  }

  #add(type: string, panel: BentoPanelElement, detail: string): HTMLLIElement {
    const entry = document.createElement("li");
    entry.dataset.key = `${type}${panel.id}`;
    entry.dataset.type = type;
    entry.append(
      this.#part("event-type", type),
      this.#part("event-target", panelName(panel)),
      this.#part("event-detail", detail),
    );
    this.#list.prepend(entry);
    if (this.#list.children.length > this.#limit) this.#list.lastElementChild?.remove();
    return entry;
  }

  #repeat(entry: HTMLLIElement, detail: string): void {
    const count = Number(entry.dataset.count ?? "1") + 1;
    entry.dataset.count = String(count);
    const detailPart = entry.querySelector(".event-detail");
    if (detailPart) detailPart.textContent = detail;
    const countPart =
      entry.querySelector(".event-count") ?? entry.appendChild(this.#part("event-count", ""));
    countPart.textContent = `${count} times`;
  }

  #markCanceled(entry: HTMLLIElement, canceled: boolean): void {
    entry.append(
      this.#part(
        canceled ? "event-canceled" : "event-cancelable",
        canceled ? "canceled" : "cancelable",
      ),
    );
  }

  #part(className: string, text: string): HTMLSpanElement {
    const part = document.createElement("span");
    part.className = className;
    part.textContent = text;
    return part;
  }
}
