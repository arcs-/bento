import type { BentoSeparatorElement } from "../bento.ts";
import { setState } from "./element.ts";
import { groupOf } from "../group/link.ts";
import { BentoPanel, panelAccess } from "./panel.ts";
import type { SeparatorRender } from "../model/render.ts";
import type { Axis } from "../model/render.ts";
import { separatorRules, separatorSheet } from "../style/styles.ts";

type PointerState =
  | { readonly kind: "idle" }
  | {
      readonly kind: "dragging";
      readonly pointerId: number;
      readonly axis: Axis;
      /** The pointer coordinate at the press, on the group's axis. */
      readonly origin: number;
      /** 1, or -1 where the axis runs against the coordinate, in right-to-left. */
      readonly direction: 1 | -1;
      latest: number;
      frame: number | null;
      released: boolean;
    };

/** The group's access to its separators, kept off the element's public surface. */
export interface SeparatorAccess {
  /**
   * The panel a separator resizes and toggles: the neighbour its `aria-controls` names, else
   * the one with a starting size or `collapsible`, the later one on a tie.
   */
  primary(separator: BentoSeparator): BentoPanel | null;
  render(separator: BentoSeparator, render: SeparatorRender): void;
}

/** Created by the class's static block, which alone can reach the private members. */
export let separatorAccess!: SeparatorAccess;

const hasSizeOrCollapses = (panel: BentoPanel) =>
  panelAccess.hasStartingSize(panel) || panel.collapsible;

const coordinateOn = (axis: Axis, event: PointerEvent) =>
  axis === "inline" ? event.clientX : event.clientY;

/** ARIA values are percentages with one decimal. */
const ariaPercent = (share: number) => String(Math.round(share * 10) / 10);

/**
 * No text gets selected while a drag crosses the panels. The press itself is not prevented, so
 * the browser focuses the separator as a pointer focus, without a focus ring.
 */
const preventSelection = (event: Event) => event.preventDefault();

const stepKeys: Record<Axis, Record<string, 1 | -1>> = {
  inline: { ArrowRight: 1, ArrowLeft: -1 },
  block: { ArrowDown: 1, ArrowUp: -1 },
};

export class BentoSeparator extends HTMLElement implements BentoSeparatorElement {
  readonly #internals = this.attachInternals();
  readonly #sheet = new CSSStyleSheet();
  #rules = "";
  #pointer: PointerState = { kind: "idle" };
  /** Until its group renders it, a separator looks like one in a horizontal group. */
  #look: Pick<SeparatorRender, "axis" | "hidden"> = { axis: "inline", hidden: false };

  constructor() {
    super();
    this.attachShadow({ mode: "open" }).adoptedStyleSheets = [separatorSheet, this.#sheet];
    this.#internals.role = "separator";
    this.addEventListener("pointerdown", this.#pressed);
    this.addEventListener("pointermove", this.#moved);
    for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) {
      this.addEventListener(type, this.#released);
    }
    this.addEventListener("keydown", this.#keyPressed);
    this.addEventListener("keyup", () => groupOf(this)?.endSteps());
    this.addEventListener("blur", () => groupOf(this)?.endSteps());
    this.addEventListener("dblclick", () => groupOf(this)?.reset(this));
    this.#writeRules();
  }

  connectedCallback(): void {
    if (!this.hasAttribute("tabindex")) this.setAttribute("tabindex", "0");
  }

  disconnectedCallback(): void {
    this.#endDrag();
  }

  static {
    separatorAccess = {
      primary: (separator) => separator.#primary(),
      render: (separator, render) => separator.#render(render),
    };
  }

  #primary(): BentoPanel | null {
    const before = this.previousElementSibling;
    const after = this.nextElementSibling;
    const neighbours = [before, after].filter((neighbour) => neighbour instanceof BentoPanel);
    const controlsId = this.getAttribute("aria-controls");
    const root = this.getRootNode();
    const controlled =
      controlsId && (root instanceof Document || root instanceof ShadowRoot)
        ? root.getElementById(controlsId)
        : null;
    const named = neighbours.find((neighbour) => neighbour === controlled);
    return named ?? neighbours.findLast(hasSizeOrCollapses) ?? neighbours.at(-1) ?? null;
  }

  #render(render: SeparatorRender): void {
    this.#look = render;
    const primary = this.#primary();
    this.#internals.ariaOrientation = render.axis === "inline" ? "vertical" : "horizontal";
    this.#internals.ariaValueNow = ariaPercent(render.now);
    this.#internals.ariaValueMin = ariaPercent(render.min);
    this.#internals.ariaValueMax = ariaPercent(render.max);
    if ("ariaControlsElements" in this.#internals) {
      this.#internals.ariaControlsElements = primary ? [primary] : [];
    }
    this.#writeRules();
  }

  #writeRules(): void {
    const { axis, hidden } = this.#look;
    const rules = separatorRules({ axis, hidden, dragging: this.#pointer.kind === "dragging" });
    if (rules === this.#rules) return;
    this.#rules = rules;
    this.#sheet.replaceSync(rules);
  }

  /** 1, or -1 where the axis runs against screen coordinates, in right-to-left; reads style. */
  #towardsEnd(axis: Axis): 1 | -1 {
    return axis === "inline" && getComputedStyle(this).direction === "rtl" ? -1 : 1;
  }

  readonly #pressed = (event: PointerEvent) => {
    const group = groupOf(this);
    if (event.button !== 0 || this.#pointer.kind !== "idle" || !group) return;
    this.setPointerCapture(event.pointerId);
    const axis = group.axis();
    const origin = coordinateOn(axis, event);
    this.#pointer = {
      kind: "dragging",
      pointerId: event.pointerId,
      axis,
      origin,
      direction: this.#towardsEnd(axis),
      latest: origin,
      frame: null,
      released: false,
    };
    setState(this.#internals, "dragging", true);
    this.#writeRules();
    this.ownerDocument.addEventListener("selectstart", preventSelection, { capture: true });
    group.startDrag(this);
  };

  readonly #moved = (event: PointerEvent) => {
    const pointer = this.#pointer;
    if (pointer.kind !== "dragging" || event.pointerId !== pointer.pointerId) return;
    pointer.latest = coordinateOn(pointer.axis, event);
    pointer.frame ??= requestAnimationFrame(this.#frame);
  };

  /** Applies the latest pointer position, once per frame. */
  readonly #frame = () => {
    const pointer = this.#pointer;
    if (pointer.kind !== "dragging") return;
    pointer.frame = null;
    groupOf(this)?.dragTo(this, (pointer.latest - pointer.origin) * pointer.direction);
    if (pointer.released) this.#endDrag();
  };

  readonly #released = (event: Event) => {
    const pointer = this.#pointer;
    if (pointer.kind !== "dragging") return;
    if (event instanceof PointerEvent && event.pointerId !== pointer.pointerId) return;
    if (pointer.frame === null) this.#endDrag();
    else pointer.released = true;
  };

  #endDrag(): void {
    const pointer = this.#pointer;
    if (pointer.kind !== "dragging") return;
    if (pointer.frame !== null) cancelAnimationFrame(pointer.frame);
    this.#pointer = { kind: "idle" };
    this.ownerDocument.removeEventListener("selectstart", preventSelection, { capture: true });
    setState(this.#internals, "dragging", false);
    this.#writeRules();
    groupOf(this)?.endDrag();
  }

  /** Keys with Alt, Ctrl or Meta are the browser's shortcuts; Shift makes a step 100px. */
  readonly #keyPressed = (event: KeyboardEvent) => {
    const group = groupOf(this);
    if (!group || event.altKey || event.ctrlKey || event.metaKey) return;
    const axis = group.axis();
    const step = stepKeys[axis][event.key];
    if (step) {
      const distance = event.shiftKey ? 100 : 10;
      group.step(this, step * distance * this.#towardsEnd(axis));
    } else if (event.key === "Home" || event.key === "End") {
      group.stepPrimaryTo(this, event.key === "Home" ? "min" : "max");
    } else if (event.key === "Enter") {
      if (!event.repeat) group.toggle(this);
    } else return;
    event.preventDefault();
  };
}
