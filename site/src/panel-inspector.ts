import type { BentoPanelElement } from "../../src/bento.ts";
import { isModal, isPanel, panelName } from "./panels.ts";

/** A value as the inspector shows it: code, a yes or no flag, or plain text. */
type Value =
  | { readonly kind: "code"; readonly text: string }
  | { readonly kind: "flag"; readonly on: boolean }
  | { readonly kind: "text"; readonly text: string };

interface Comparison {
  readonly name: string;
  readonly live: Value;
  readonly start: Value;
}

interface Fact {
  readonly name: string;
  readonly value: Value;
}

interface Section {
  readonly title: string;
  readonly comparison?: Comparison;
  readonly facts: readonly Fact[];
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

const code = (text: string): Value => ({ kind: "code", text });
const flag = (on: boolean): Value => ({ kind: "flag", on });
const text = (content: string): Value => ({ kind: "text", text: content });
const sizeValue = (size: string) => (size ? code(size) : text("fills"));

function sections(panel: BentoPanelElement): Section[] {
  const { width, height } = panel.getBoundingClientRect();
  const modalFacts: Fact[] = panel.modal
    ? [
        { name: "modal", value: code(panel.modal) },
        { name: "matches", value: flag(isModal(panel)) },
      ]
    : [{ name: "modal", value: text("never") }];
  return [
    {
      title: "Size",
      comparison: {
        name: "size",
        live: sizeValue(panel.size),
        start: sizeValue(panel.defaultSize),
      },
      facts: [
        { name: "rendered", value: text(`${Math.round(width)} × ${Math.round(height)} px`) },
        { name: "min", value: code(panel.min || "0") },
        { name: "max", value: panel.max ? code(panel.max) : text("none") },
      ],
    },
    {
      title: "State",
      comparison: {
        name: "collapsed",
        live: flag(panel.collapsed),
        start: flag(panel.defaultCollapsed),
      },
      facts: [
        { name: "collapsible", value: flag(panel.collapsible) },
        { name: "collapsed-size", value: code(panel.collapsedSize || "0") },
        ...modalFacts,
      ],
    },
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

function element<Tag extends keyof HTMLElementTagNameMap>(
  tag: Tag,
  className: string,
  ...children: (Node | string)[]
): HTMLElementTagNameMap[Tag] {
  const created = document.createElement(tag);
  if (className) created.className = className;
  created.append(...children);
  return created;
}

function valueNode(value: Value): Node {
  switch (value.kind) {
    case "code":
      return element("code", "inspector-code", value.text);
    case "flag":
      return element("span", value.on ? "flag flag-on" : "flag", value.on ? "yes" : "no");
    case "text":
      return document.createTextNode(value.text);
  }
}

const sameValue = (first: Value, second: Value) => JSON.stringify(first) === JSON.stringify(second);

function comparisonTable({ name, live, start }: Comparison): HTMLTableElement {
  const headings = element(
    "tr",
    "",
    element("td", ""),
    element("th", "", "Live"),
    element("th", "", "Start"),
  );
  for (const heading of headings.querySelectorAll("th")) heading.scope = "col";
  const label = element("th", "", name);
  label.scope = "row";
  const row = element(
    "tr",
    sameValue(live, start) ? "" : "differs",
    label,
    element("td", "", valueNode(live)),
    element("td", "", valueNode(start)),
  );
  return element("table", "compare", element("thead", "", headings), element("tbody", "", row));
}

function factList(facts: readonly Fact[]): HTMLDListElement {
  return element(
    "dl",
    "facts",
    ...facts.map(({ name, value }) =>
      element("div", "fact", element("dt", "", name), element("dd", "", valueNode(value))),
    ),
  );
}

function statesSection(panel: BentoPanelElement): HTMLElement {
  const active = customStates.filter(
    (state) => customStatesWork && panel.matches(`:state(${state})`),
  );
  const content = !customStatesWork
    ? [element("p", "inspector-muted", "Not supported in this browser")]
    : active.length === 0
      ? [element("p", "inspector-muted", "None active")]
      : [element("ul", "state-tags", ...active.map((state) => element("li", "state-tag", state)))];
  return element("section", "inspector-section", element("h3", "", ":state()"), ...content);
}

/**
 * Shows one panel's live state next to its starting state: click or focus any panel, or hover
 * one in a demo. It follows `resize` and `toggle`, and a `ResizeObserver` for everything else.
 */
export class PanelInspector {
  readonly #title: HTMLElement;
  readonly #hint: HTMLElement;
  readonly #body: HTMLElement;
  readonly #ignored: Element;
  readonly #sizeObserver = new ResizeObserver(() => this.#render());
  readonly #attributeObserver = new MutationObserver(() => this.#render());
  #panel: BentoPanelElement | null = null;

  constructor(root: HTMLElement, ignored: Element) {
    const title = root.querySelector<HTMLElement>("[data-inspected-name]");
    const hint = root.querySelector<HTMLElement>("[data-inspector-hint]");
    const body = root.querySelector<HTMLElement>("[data-inspector-body]");
    if (!title || !hint || !body) throw new Error("the panel inspector markup is incomplete");
    this.#title = title;
    this.#hint = hint;
    this.#body = body;
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
    this.#sizeObserver.disconnect();
    this.#attributeObserver.disconnect();
    this.#panel = panel;
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
    this.#title.textContent = panelName(panel);
    this.#hint.hidden = true;
    this.#body.replaceChildren(
      ...sections(panel).map(({ title, comparison, facts }) =>
        element(
          "section",
          "inspector-section",
          element("h3", "", title),
          ...(comparison ? [comparisonTable(comparison)] : []),
          factList(facts),
        ),
      ),
      statesSection(panel),
    );
  }
}
