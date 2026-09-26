import type { BentoPanelElement } from "../../src/bento.ts";
import { isModal, isPanel, panelName } from "./panels.ts";

interface Comparison {
  readonly name: string;
  readonly live: string;
  readonly start: string;
}

interface Fact {
  readonly name: string;
  readonly value: string;
}

const customStates = ["collapsed", "modal"] as const;
const customStatesWork = CSS.supports("selector(:state(collapsed))");
const watchedAttributes = [
  "size",
  "collapsed",
  "min",
  "max",
  "collapsible",
  "collapsed-size",
  "modal",
];

const interactiveControls = "button, a, input, textarea, select, label";

const sizeText = (size: string) => size || "fills";

function comparisons(panel: BentoPanelElement): Comparison[] {
  return [
    { name: "size", live: sizeText(panel.size), start: sizeText(panel.defaultSize) },
    { name: "collapsed", live: String(panel.collapsed), start: String(panel.defaultCollapsed) },
  ];
}

function facts(panel: BentoPanelElement): Fact[] {
  const { width, height } = panel.getBoundingClientRect();
  const states = customStatesWork
    ? customStates.filter((state) => panel.matches(`:state(${state})`)).join(", ") || "none"
    : "not supported here";
  const modal = panel.modal
    ? `${isModal(panel) ? "matches" : "no match"}: ${panel.modal}`
    : "never";
  return [
    { name: "min", value: panel.min || "0" },
    { name: "max", value: panel.max || "none" },
    { name: "collapsible", value: String(panel.collapsible) },
    { name: "collapsed-size", value: panel.collapsedSize || "0" },
    { name: "modal", value: modal },
    { name: ":state()", value: states },
    { name: "rendered", value: `${Math.round(width)} × ${Math.round(height)} px` },
  ];
}

/** The panel a user points at: a separator stands for the panel it controls or follows. */
function panelOf(target: EventTarget | null): BentoPanelElement | null {
  if (!(target instanceof Element)) return null;
  if (target.localName === "bento-separator") {
    const controlsId = target.getAttribute("aria-controls");
    const controlled = controlsId ? document.getElementById(controlsId) : null;
    const neighbour = controlled ?? target.previousElementSibling;
    return isPanel(neighbour) ? neighbour : null;
  }
  const panel = target.closest("bento-panel");
  return isPanel(panel) ? panel : null;
}

/**
 * Shows one panel's live state next to its starting state: click or focus any panel, or hover
 * one in a demo. It follows `resize` and `toggle`, and a `ResizeObserver` for everything else.
 */
export class PanelInspector {
  readonly #name: HTMLElement;
  readonly #table: HTMLTableSectionElement;
  readonly #facts: HTMLDListElement;
  readonly #ignored: Element;
  readonly #sizeObserver = new ResizeObserver(() => this.#render());
  readonly #attributeObserver = new MutationObserver(() => this.#render());
  #panel: BentoPanelElement | null = null;

  constructor(root: HTMLElement, ignored: Element) {
    const name = root.querySelector<HTMLElement>("[data-inspected-name]");
    const table = root.querySelector("tbody");
    const factList = root.querySelector("dl");
    if (!name || !table || !factList) throw new Error("the panel inspector markup is incomplete");
    this.#name = name;
    this.#table = table;
    this.#facts = factList;
    this.#ignored = ignored;

    const select = (event: Event) => this.#pick(event.target);
    document.addEventListener("pointerdown", select, { capture: true });
    document.addEventListener("focusin", (event) => {
      const focusMovedOutward = event.target instanceof Node && event.target.contains(this.#panel);
      if (!focusMovedOutward) select(event);
    });
    document.addEventListener("pointerover", (event) => {
      if (event.target instanceof Element && event.target.closest(".specimen-stage")) select(event);
    });
    for (const type of ["resize", "resizeend", "toggle"]) {
      document.addEventListener(type, (event) => event.target === this.#panel && this.#render(), {
        capture: true,
      });
    }
  }

  inspect(panel: BentoPanelElement): void {
    if (panel === this.#panel) return;
    this.#panel?.removeAttribute("data-inspected");
    this.#sizeObserver.disconnect();
    this.#attributeObserver.disconnect();
    this.#panel = panel;
    panel.setAttribute("data-inspected", "");
    this.#sizeObserver.observe(panel);
    this.#attributeObserver.observe(panel, { attributeFilter: watchedAttributes });
    this.#render();
  }

  /** Using a control is not pointing at its panel, and the inspector never inspects itself. */
  #pick(target: EventTarget | null): void {
    if (!(target instanceof Element) || this.#ignored.contains(target)) return;
    if (target.closest(interactiveControls)) return;
    const panel = panelOf(target);
    if (panel) this.inspect(panel);
  }

  #render(): void {
    const panel = this.#panel;
    if (!panel) return;
    this.#name.textContent = panelName(panel);
    this.#table.replaceChildren(
      ...comparisons(panel).map(({ name, live, start }) => {
        const heading = textElement("th", name);
        heading.scope = "row";
        const row = document.createElement("tr");
        row.append(heading, textElement("td", live), textElement("td", start));
        return row;
      }),
    );
    this.#facts.replaceChildren(
      ...facts(panel).flatMap(({ name, value }) => [
        textElement("dt", name),
        textElement("dd", value),
      ]),
    );
  }
}

function textElement<Tag extends keyof HTMLElementTagNameMap>(
  tag: Tag,
  text: string,
): HTMLElementTagNameMap[Tag] {
  const element = document.createElement(tag);
  element.textContent = text;
  return element;
}
