import type { BentoPanelElement } from "../bento.ts";
import { setState, upgradeProperties } from "./element.ts";
import { dispatchBeforeToggle, dispatchToggle } from "../group/events.ts";
import { groupOf } from "../group/link.ts";
import type { PanelRequest } from "../model/layout.ts";
import { formatLength, type Length, parseLength, pixelLength } from "../model/length.ts";
import { ModalSheet } from "./modal-sheet.ts";
import { isCollapsed, type ModeEvent, nextMode, type PanelMode } from "../model/machines.ts";
import type { PanelRender } from "../model/render.ts";
import { StartingState } from "../model/machines.ts";
import { type BentoCustomProperties, panelRules, panelSheet } from "../style/styles.ts";

/** The group's access to its panels, kept off the element's public surface. */
export interface PanelAccess {
  /** What the panel asks of the layout now, as lengths the group's space resolves. */
  request(panel: BentoPanel): PanelRequest;
  isModal(panel: BentoPanel): boolean;
  /** Collapsed as the app or user asked, apart from a collapse by the group. */
  askedCollapsed(panel: BentoPanel): boolean;
  /** Whether the panel starts with a size, which makes it a separator's primary panel. */
  hasStartingSize(panel: BentoPanel): boolean;
  /** The internal wrapper of the slotted content; it is what freezes and fades. */
  content(panel: BentoPanel): Element;
  render(panel: BentoPanel, render: PanelRender): void;
  /** A size the user dragged or keyed in. */
  resizedByUser(panel: BentoPanel, size: number): void;
  /** A collapse or expand the user asked for and nobody vetoed. */
  toggledByUser(panel: BentoPanel, collapsed: boolean): void;
  /** Double-click: the live value is back at the start and follows it again, like a form reset. */
  resetSize(panel: BentoPanel): void;
  resetCollapsed(panel: BentoPanel): void;
}

/** Created by the class's static block, which alone can reach the private members. */
export let panelAccess!: PanelAccess;

const properties = [
  "size",
  "collapsed",
  "defaultSize",
  "defaultCollapsed",
  "min",
  "max",
  "collapsible",
  "collapsedSize",
  "modal",
];

/** A valid length as CSS, or null for any other text. */
function lengthAsCss(text: string | null): string | null {
  const length = parseLength(text);
  return length ? formatLength(length) : null;
}

/** A write the app makes; it animates only once the user has interacted with the page. */
const appToggleAnimates = () => navigator.userActivation.hasBeenActive;

export class BentoPanel extends HTMLElement implements BentoPanelElement {
  static readonly observedAttributes = [
    "size",
    "collapsed",
    "min",
    "max",
    "collapsible",
    "collapsed-size",
    "modal",
    "aria-label",
    "aria-labelledby",
  ];

  readonly #internals = this.attachInternals();
  readonly #root = this.attachShadow({ mode: "open" });
  readonly #sheet = new CSSStyleSheet();
  readonly #clip = document.createElement("div");
  readonly #content = document.createElement("div");
  readonly #modalSheet: ModalSheet;
  readonly #start = new StartingState();
  #rules = "";
  #size: Length | null = null;
  #mode: PanelMode = { kind: "inline", collapsed: false };
  /** Collapsed as shown: as asked, until the group's render says otherwise. */
  #shownCollapsed = false;
  #media: MediaQueryList | null = null;
  readonly #mediaChanged = () => this.#applyModal(this.#media?.matches ?? false);

  constructor() {
    super();
    this.#root.adoptedStyleSheets = [panelSheet, this.#sheet];
    this.#clip.className = "clip";
    this.#content.className = "content";
    this.#content.append(document.createElement("slot"));
    this.#clip.append(this.#content);
    this.#root.append(this.#clip);
    this.#modalSheet = new ModalSheet(this.#root, {
      host: this,
      closeRequested: () => this.#closeModal(true),
      closedWithoutAsking: () => this.#closeModal(false),
    });
    upgradeProperties(this, properties);
  }

  connectedCallback(): void {
    this.#watchModal();
    this.#syncSheet();
    this.#nameSheet();
  }

  disconnectedCallback(): void {
    this.#media?.removeEventListener("change", this.#mediaChanged);
    this.#media = null;
    this.#modalSheet.close();
  }

  /** An attribute change is the app's write: it relayouts without animation or events. */
  attributeChangedCallback(name: string, _oldValue: string | null, value: string | null): void {
    switch (name) {
      case "aria-label":
      case "aria-labelledby":
        this.#nameSheet();
        return;
      case "modal":
        if (this.isConnected) this.#watchModal();
        break;
      case "size":
        if (this.#start.attributeChanged("size", value ?? "")) this.#size = parseLength(value);
        break;
      case "collapsed":
        if (this.#start.attributeChanged("collapsed", value !== null)) {
          this.#changeCollapsed({ type: "setDefaultCollapsed", collapsed: value !== null });
        }
        break;
    }
    this.#written(false);
  }

  get size(): string {
    return this.#size ? formatLength(this.#size) : "";
  }

  /** `null` or `undefined`, as React writes for a removed prop, means no size: the panel fills. */
  set size(size: string | null | undefined) {
    const text = size == null ? "" : String(size);
    const length = parseLength(text);
    if ((!length && text !== "") || (length ? formatLength(length) : "") === this.size) return;
    this.#start.propertyWritten("size", text);
    this.#size = length;
    this.#written(false);
  }

  get collapsed(): boolean {
    return this.#shownCollapsed;
  }

  /**
   * Writing what shows changes nothing, unless the group collapsed the panel: `true` then makes
   * the collapse the app's, so the panel stays collapsed when space returns.
   */
  set collapsed(value: boolean | null | undefined) {
    const collapsed = Boolean(value);
    if (collapsed === this.collapsed && collapsed === isCollapsed(this.#mode)) return;
    this.#start.propertyWritten("collapsed", collapsed);
    this.#changeCollapsed({ type: "setCollapsed", collapsed });
    this.#written(appToggleAnimates());
  }

  get defaultSize(): string {
    return this.#start.size;
  }

  set defaultSize(size: string) {
    this.setAttribute("size", size);
  }

  get defaultCollapsed(): boolean {
    return this.#start.collapsed;
  }

  set defaultCollapsed(collapsed: boolean) {
    this.toggleAttribute("collapsed", Boolean(collapsed));
  }

  get min(): string {
    return this.getAttribute("min") ?? "";
  }

  set min(min: string) {
    this.setAttribute("min", min);
  }

  get max(): string {
    return this.getAttribute("max") ?? "";
  }

  set max(max: string) {
    this.setAttribute("max", max);
  }

  get collapsible(): boolean {
    return this.hasAttribute("collapsible");
  }

  set collapsible(collapsible: boolean) {
    this.toggleAttribute("collapsible", Boolean(collapsible));
  }

  get collapsedSize(): string {
    return this.getAttribute("collapsed-size") ?? "";
  }

  set collapsedSize(collapsedSize: string) {
    this.setAttribute("collapsed-size", collapsedSize);
  }

  get modal(): string {
    return this.getAttribute("modal") ?? "";
  }

  set modal(modal: string) {
    this.setAttribute("modal", modal);
  }

  static {
    panelAccess = {
      request: (panel) => panel.#request(),
      isModal: (panel) => panel.#mode.kind === "modal",
      askedCollapsed: (panel) => isCollapsed(panel.#mode),
      hasStartingSize: (panel) => panel.#start.size !== "",
      content: (panel) => panel.#content,
      render: (panel, render) => panel.#render(render),
      resizedByUser: (panel, size) => {
        panel.#start.changedByUser("size");
        panel.#size = pixelLength(size);
      },
      toggledByUser: (panel, collapsed) => {
        panel.#start.changedByUser("collapsed");
        panel.#changeCollapsed({ type: "setCollapsed", collapsed });
      },
      resetSize: (panel) => {
        panel.#start.reset("size");
        panel.#size = parseLength(panel.#start.size);
      },
      resetCollapsed: (panel) => panel.#start.reset("collapsed"),
    };
  }

  /** The app wrote this panel: its group relayouts, and announces none of this panel's changes. */
  #written(animate: boolean): void {
    groupOf(this)?.invalidate({ kind: "written", panel: this, animate });
  }

  #request(): PanelRequest {
    const length = (name: string) => parseLength(this.getAttribute(name));
    return {
      size: this.#size,
      min: length("min"),
      max: length("max"),
      collapsedSize: length("collapsed-size"),
      collapsible: this.collapsible,
      collapsed: this.#mode.kind === "inline" && this.#mode.collapsed,
    };
  }

  #render({ collapsed, look }: PanelRender): void {
    this.#start.laidOut();
    this.#showCollapsed(collapsed);
    const rules = panelRules(this.#customProperties(), look);
    if (rules === this.#rules) return;
    this.#rules = rules;
    this.#sheet.replaceSync(rules);
  }

  #showCollapsed(collapsed: boolean): void {
    this.#shownCollapsed = collapsed;
    setState(this.#internals, "collapsed", collapsed);
  }

  /** An expand by the app or user moves the panel to the front of its group, so it shows. */
  #changeCollapsed(event: ModeEvent & { readonly collapsed: boolean }): void {
    const expands = !event.collapsed && this.collapsed;
    this.#changeMode(event);
    if (expands) groupOf(this)?.moveToFront(this);
  }

  #changeMode(event: ModeEvent): void {
    this.#mode = nextMode(this.#mode, event);
    this.#showCollapsed(isCollapsed(this.#mode));
    setState(this.#internals, "modal", this.#mode.kind === "modal");
    this.#syncSheet();
  }

  /** The sheet shows while the panel is modal and not collapsed. */
  #syncSheet(): void {
    if (this.#mode.kind === "modal" && this.#mode.open) this.#modalSheet.show();
    else this.#modalSheet.hide();
  }

  #nameSheet(): void {
    const root = this.getRootNode();
    const ids = this.getAttribute("aria-labelledby")?.split(/\s+/) ?? [];
    const labelledBy =
      root instanceof Document || root instanceof ShadowRoot
        ? ids.flatMap((id) => root.getElementById(id) ?? [])
        : [];
    this.#modalSheet.name(this.getAttribute("aria-label"), labelledBy);
  }

  #customProperties(): BentoCustomProperties {
    return {
      size: lengthAsCss(this.#start.size),
      min: lengthAsCss(this.getAttribute("min")) ?? "0px",
      max: lengthAsCss(this.getAttribute("max")),
      collapsedSize: lengthAsCss(this.getAttribute("collapsed-size")) ?? "0px",
    };
  }

  #watchModal(): void {
    this.#media?.removeEventListener("change", this.#mediaChanged);
    const query = this.getAttribute("modal");
    this.#media = query ? matchMedia(query) : null;
    this.#media?.addEventListener("change", this.#mediaChanged);
    this.#mediaChanged();
  }

  #applyModal(modal: boolean): void {
    if (modal === (this.#mode.kind === "modal")) return;
    groupOf(this)?.settle();
    if (!modal) this.#modalSheet.close();
    this.#changeMode({ type: modal ? "enterModal" : "leaveModal" });
    if (modal) this.#modalSheet.adopt(this.#clip);
    else this.#root.prepend(this.#clip);
    groupOf(this)?.invalidate({ kind: "resettle" });
  }

  /** Escape, the back gesture or a tap outside when `byUser`, which may veto; else not asked. */
  #closeModal(byUser: boolean): void {
    if (!dispatchBeforeToggle(this, true, byUser ? "user" : "other")) return;
    if (byUser) this.#start.changedByUser("collapsed");
    this.#changeMode({ type: "setCollapsed", collapsed: true });
    dispatchToggle(this, true);
    this.#written(false);
  }
}
