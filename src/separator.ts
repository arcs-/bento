import type { BentoSeparatorElement } from "./bento.ts";
import { setState } from "./elements.ts";
import { BentoPanel } from "./panel.ts";
import { type Axis, separatorRules, separatorSheet } from "./styles.ts";

/** What a separator asks of its group. Deltas are px towards the end of the group. */
export interface SeparatorGroupLink {
  readonly axis: Axis;
  /** A drag starts: moves measure from the layout now. */
  startDrag(separator: BentoSeparator): void;
  dragTo(separator: BentoSeparator, delta: number): void;
  endDrag(): void;
  /** A key moves the separator from where it is. */
  step(separator: BentoSeparator, delta: number): void;
  /** Home and End move the primary panel to its `min` or `max`. */
  stepPrimaryTo(separator: BentoSeparator, bound: "min" | "max"): void;
  /** Key up: the key's resizes are done. */
  endSteps(): void;
  toggle(separator: BentoSeparator): void;
  reset(separator: BentoSeparator): void;
}

/** What the group decides about a separator on each layout. */
export interface SeparatorRender {
  readonly axis: Axis;
  readonly hidden: boolean;
  /** Percentages of the group's space for the primary panel. */
  readonly now: number;
  readonly min: number;
  readonly max: number;
}

type PointerState =
  | { readonly kind: "idle" }
  | {
      readonly kind: "dragging";
      readonly pointerId: number;
      /** The pointer coordinate at the press, on the group's axis. */
      readonly origin: number;
      /** 1, or -1 where the axis runs against the coordinate, in right-to-left. */
      readonly direction: 1 | -1;
      latest: number;
      frame: number | null;
      released: boolean;
    };

const hasSizeOrCollapses = (panel: BentoPanel) => panel.hasAttribute("size") || panel.collapsible;

const stepKeys: Record<Axis, Record<string, 1 | -1>> = {
  inline: { ArrowRight: 1, ArrowLeft: -1 },
  block: { ArrowDown: 1, ArrowUp: -1 },
};

export class BentoSeparator extends HTMLElement implements BentoSeparatorElement {
  readonly #internals = this.attachInternals();
  readonly #sheet = new CSSStyleSheet();
  #rules = "";
  #group: SeparatorGroupLink | null = null;
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
    this.addEventListener("keyup", () => this.#group?.endSteps());
    this.addEventListener("blur", () => this.#group?.endSteps());
    this.addEventListener("dblclick", () => this.#group?.reset(this));
    this.#writeRules();
  }

  connectedCallback(): void {
    if (!this.hasAttribute("tabindex")) this.setAttribute("tabindex", "0");
  }

  disconnectedCallback(): void {
    this.#endDrag();
  }

  attach(group: SeparatorGroupLink): void {
    this.#group = group;
  }

  /** Leaves `group`, unless the element moved on to another group already. */
  detach(group: SeparatorGroupLink): void {
    if (this.#group === group) this.#group = null;
  }

  /**
   * The panel it resizes and toggles: the neighbour its `aria-controls` names, else the one
   * with a `size` or `collapsible`, the later one on a tie.
   */
  get primary(): BentoPanel | null {
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

  render(render: SeparatorRender): void {
    this.#look = render;
    const primary = this.primary;
    this.#internals.ariaOrientation = render.axis === "inline" ? "vertical" : "horizontal";
    this.#internals.ariaValueNow = String(Math.round(render.now));
    this.#internals.ariaValueMin = String(Math.round(render.min));
    this.#internals.ariaValueMax = String(Math.round(render.max));
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

  /** The pointer coordinate on the group's axis, and which way it runs. */
  #axisOf(event: PointerEvent): { coordinate: number; direction: 1 | -1 } {
    const inline = this.#group?.axis !== "block";
    const rightToLeft = inline && getComputedStyle(this).direction === "rtl";
    return { coordinate: inline ? event.clientX : event.clientY, direction: rightToLeft ? -1 : 1 };
  }

  readonly #pressed = (event: PointerEvent) => {
    if (event.button !== 0 || this.#pointer.kind !== "idle" || !this.#group) return;
    event.preventDefault();
    this.focus({ preventScroll: true });
    this.setPointerCapture(event.pointerId);
    const { coordinate, direction } = this.#axisOf(event);
    this.#pointer = {
      kind: "dragging",
      pointerId: event.pointerId,
      origin: coordinate,
      direction,
      latest: coordinate,
      frame: null,
      released: false,
    };
    setState(this.#internals, "dragging", true);
    this.#writeRules();
    this.#group.startDrag(this);
  };

  readonly #moved = (event: PointerEvent) => {
    const pointer = this.#pointer;
    if (pointer.kind !== "dragging" || event.pointerId !== pointer.pointerId) return;
    pointer.latest = this.#axisOf(event).coordinate;
    pointer.frame ??= requestAnimationFrame(this.#frame);
  };

  /** Applies the latest pointer position, once per frame. */
  readonly #frame = () => {
    const pointer = this.#pointer;
    if (pointer.kind !== "dragging") return;
    pointer.frame = null;
    this.#group?.dragTo(this, (pointer.latest - pointer.origin) * pointer.direction);
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
    setState(this.#internals, "dragging", false);
    this.#writeRules();
    this.#group?.endDrag();
  }

  readonly #keyPressed = (event: KeyboardEvent) => {
    const group = this.#group;
    if (!group) return;
    const step = stepKeys[group.axis][event.key];
    if (step) {
      const mirrored = group.axis === "inline" && getComputedStyle(this).direction === "rtl";
      const distance = event.shiftKey ? 100 : 10;
      group.step(this, step * distance * (mirrored ? -1 : 1));
    } else if (event.key === "Home" || event.key === "End") {
      group.stepPrimaryTo(this, event.key === "Home" ? "min" : "max");
    } else if (event.key === "Enter") {
      group.toggle(this);
    } else return;
    event.preventDefault();
  };
}
