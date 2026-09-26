import type { BentoGroupElement, Orientation } from "./bento.ts";
import { GroupCoordinator } from "./coordinator.ts";
import { upgradeProperties } from "./elements.ts";
import { groupRules, groupSheet } from "./styles.ts";

/** `<bento-group>`: its only surface is `orientation`; the coordinator does the rest. */
export class BentoGroup extends HTMLElement implements BentoGroupElement {
  static readonly observedAttributes = ["orientation"];

  readonly #sheet = new CSSStyleSheet();
  readonly #coordinator = new GroupCoordinator(this);

  constructor() {
    super();
    const root = this.attachShadow({ mode: "open" });
    root.adoptedStyleSheets = [groupSheet, this.#sheet];
    const slot = document.createElement("slot");
    slot.addEventListener("slotchange", () => this.#coordinator.childrenChanged());
    root.append(slot);
    this.#sheet.replaceSync(groupRules(this.#coordinator.axis()));
    upgradeProperties(this, ["orientation"]);
  }

  connectedCallback(): void {
    this.#coordinator.connected();
  }

  disconnectedCallback(): void {
    this.#coordinator.disconnected();
  }

  attributeChangedCallback(): void {
    this.#sheet.replaceSync(groupRules(this.#coordinator.axis()));
    this.#coordinator.invalidate({ kind: "resettle" });
  }

  get orientation(): Orientation {
    return this.getAttribute("orientation") === "vertical" ? "vertical" : "horizontal";
  }

  set orientation(orientation: Orientation) {
    this.setAttribute("orientation", orientation);
  }
}
