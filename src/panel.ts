import type { BentoPanelElement } from "./bento.ts";
import { setState, upgradeProperties } from "./elements.ts";
import { dispatchBeforeToggle, dispatchToggle } from "./events.ts";
import type { PanelSettings } from "./layout.ts";
import { formatLength, type Length, parseLength, pixelLength } from "./length.ts";
import { ModalSheet } from "./modal.ts";
import { isCollapsed, type ModeEvent, nextMode, type PanelMode } from "./panel-mode.ts";
import { type PanelDefaults, type PanelRender, panelRules, panelSheet } from "./styles.ts";

/** What a panel asks of the group it sits in. */
export interface PanelGroupLink {
  /** Lays the group out again, batched; `animate` when the change is a toggle. */
  invalidate(animate: boolean): void;
  /** Finishes a running toggle, before a change that must not animate. */
  settle(): void;
  /** Moves an expanded panel to the front of the group's priority, so it shows. */
  expanded(panel: BentoPanel): void;
}

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
  ];

  readonly #internals = this.attachInternals();
  readonly #root = this.attachShadow({ mode: "open" });
  readonly #sheet = new CSSStyleSheet();
  readonly #clip = document.createElement("div");
  /** The internal wrapper of the slotted content; it is what freezes and fades. */
  readonly content = document.createElement("div");
  readonly #modalSheet: ModalSheet;
  #rules = "";
  #size: Length | null = null;
  #sizeDirty = false;
  #mode: PanelMode = { kind: "inline", collapsed: false };
  #collapsedDirty = false;
  /** The collapsed state events last announced; null until the first layout, which fires none. */
  #announced: boolean | null = null;
  #group: PanelGroupLink | null = null;
  #media: MediaQueryList | null = null;
  readonly #mediaChanged = () => this.#applyModal(this.#media?.matches ?? false);

  constructor() {
    super();
    this.#root.adoptedStyleSheets = [panelSheet, this.#sheet];
    this.#clip.className = "clip";
    this.content.className = "content";
    this.content.append(document.createElement("slot"));
    this.#clip.append(this.content);
    this.#root.append(this.#clip);
    this.#modalSheet = new ModalSheet(this.#root, {
      host: this,
      closeRequested: () => this.#closeModal(true),
      closedByBrowser: () => this.#closeModal(false),
      closedForAnother: () => this.#closeModal(false),
    });
    upgradeProperties(this, properties);
  }

  connectedCallback(): void {
    this.#watchModal();
    this.#syncSheet();
  }

  disconnectedCallback(): void {
    this.#media?.removeEventListener("change", this.#mediaChanged);
    this.#media = null;
    this.#modalSheet.hide();
  }

  attributeChangedCallback(name: string, _oldValue: string | null, value: string | null): void {
    if (name === "size" && !this.#sizeDirty) this.#size = parseLength(value);
    if (name === "collapsed" && !this.#collapsedDirty) {
      this.#changeMode({ type: "setDefaultCollapsed", collapsed: value !== null });
      this.announced = this.#announced === null ? null : isCollapsed(this.#mode);
    }
    if (name === "aria-label") this.#modalSheet.label = value;
    if (name === "modal" && this.isConnected) this.#watchModal();
    else this.#group?.invalidate(false);
  }

  get size(): string {
    return this.#size ? formatLength(this.#size) : "";
  }

  set size(size: string) {
    const length = parseLength(String(size));
    if (!length && size !== "") return;
    this.#size = length;
    this.#sizeDirty = true;
    this.#group?.invalidate(false);
  }

  get collapsed(): boolean {
    return this.#announced ?? isCollapsed(this.#mode);
  }

  set collapsed(collapsed: boolean) {
    this.#collapsedDirty = true;
    this.#setCollapsed(Boolean(collapsed));
    this.#group?.invalidate(true);
  }

  get defaultSize(): string {
    return this.getAttribute("size") ?? "";
  }

  set defaultSize(size: string) {
    this.setAttribute("size", size);
  }

  get defaultCollapsed(): boolean {
    return this.hasAttribute("collapsed");
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

  get isModal(): boolean {
    return this.#mode.kind === "modal";
  }

  /** Collapsed as asked for, apart from a collapse by the group; a modal panel is while not shown. */
  get collapsedByMode(): boolean {
    return isCollapsed(this.#mode);
  }

  /** The collapsed state last announced by events; the group's layout moves it on. */
  get announced(): boolean | null {
    return this.#announced;
  }

  set announced(collapsed: boolean | null) {
    this.#announced = collapsed;
    setState(this.#internals, "collapsed", this.collapsed);
  }

  attach(group: PanelGroupLink): void {
    this.#group = group;
  }

  /** Leaves `group`, unless the element moved on to another group already. */
  detach(group: PanelGroupLink): void {
    if (this.#group === group) this.#group = null;
  }

  /** What the panel asks of the layout now, as lengths the group's space resolves. */
  settings(): PanelSettings {
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

  /** The live size as CSS, for a layout that has not been measured yet. */
  get sizeText(): string | null {
    return this.#size ? formatLength(this.#size) : null;
  }

  render(render: PanelRender): void {
    const rules = panelRules(this.#defaults(), render);
    if (rules === this.#rules) return;
    this.#rules = rules;
    this.#sheet.replaceSync(rules);
  }

  /** A size the user dragged or keyed in. */
  resizedByUser(size: number): void {
    this.#size = pixelLength(size);
    this.#sizeDirty = true;
  }

  /** A collapse or expand the user asked for and nobody vetoed. */
  toggledByUser(collapsed: boolean): void {
    this.#collapsedDirty = true;
    this.#setCollapsed(collapsed);
  }

  /** Double-click: back to the size attribute, clean again, like a form reset. */
  resetSize(): void {
    this.#size = parseLength(this.getAttribute("size"));
    this.#sizeDirty = false;
  }

  cleanCollapsed(): void {
    this.#collapsedDirty = false;
  }

  #setCollapsed(collapsed: boolean): void {
    if (!collapsed && this.collapsed) this.#group?.expanded(this);
    this.#changeMode({ type: "setCollapsed", collapsed });
    this.announced = this.#announced === null ? null : collapsed;
  }

  #changeMode(event: ModeEvent): void {
    this.#mode = nextMode(this.#mode, event);
    setState(this.#internals, "collapsed", this.collapsed);
    setState(this.#internals, "modal", this.isModal);
    this.#syncSheet();
  }

  /** The sheet shows while the panel is modal and not collapsed. */
  #syncSheet(): void {
    if (this.#mode.kind === "modal" && this.#mode.open) this.#modalSheet.show();
    else this.#modalSheet.hide();
  }

  #defaults(): PanelDefaults {
    const valid = (name: string) => {
      const length = parseLength(this.getAttribute(name));
      return length ? formatLength(length) : null;
    };
    return {
      size: valid("size"),
      min: valid("min") ?? "0px",
      max: valid("max"),
      collapsedSize: valid("collapsed-size") ?? "0px",
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
    if (modal === this.isModal) return;
    this.#group?.settle();
    this.#changeMode({ type: modal ? "enterModal" : "leaveModal" });
    if (modal) this.#modalSheet.adopt(this.#clip);
    else this.#root.prepend(this.#clip);
    this.#group?.invalidate(false);
  }

  /** Escape, the back gesture or a tap outside when `byUser`, which may veto; else the browser. */
  #closeModal(byUser: boolean): void {
    if (!dispatchBeforeToggle(this, true, byUser ? "user" : "other")) return;
    if (byUser) this.#collapsedDirty = true;
    this.#setCollapsed(true);
    dispatchToggle(this, true);
  }
}
