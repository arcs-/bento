/**
 * The public types of bento, and nothing else: its declaration is the package's whole type
 * surface. The runtime is src/index.ts, which registers the elements.
 */

export type Orientation = "horizontal" | "vertical";

/** `"open"` is expanded, `"closed"` is collapsed, the values every `ToggleEvent` uses. */
export type ToggleState = "open" | "closed";

/** Fired on a panel before and after it collapses or expands. */
export interface BentoToggleEvent extends ToggleEvent {
  readonly oldState: ToggleState;
  readonly newState: ToggleState;
}

/** Events a panel fires. None bubbles; parents hear them in the capture phase only. */
export interface BentoPanelEventMap extends Omit<
  HTMLElementEventMap,
  "resize" | "beforetoggle" | "toggle"
> {
  /** The user changed the live size, directly or by pushing it; at most once per frame. */
  resize: Event;
  /** A drag or key press is done, on pointer or key up, like `scrollend`. */
  resizeend: Event;
  /** Before a collapse or expand the app did not write; cancelable only when the user caused it. */
  beforetoggle: BentoToggleEvent;
  /** After a collapse or expand the app did not write. */
  toggle: BentoToggleEvent;
}

type BentoPanelListener<Type extends keyof BentoPanelEventMap> = (
  this: BentoPanelElement,
  event: BentoPanelEventMap[Type],
) => unknown;

/** `<bento-group>` lays out panels and separators. Groups nest. */
export interface BentoGroupElement extends HTMLElement {
  /** Reflects `orientation`; a missing or unknown value reads as `"horizontal"`. */
  orientation: Orientation;
}

/**
 * `<bento-panel>`, the element you write; the group sets its size.
 * String properties reflect like HTML's: `""` when the attribute is absent.
 */
export interface BentoPanelElement extends HTMLElement {
  /**
   * Live size in `px` or `%`; dragging writes px. `""` while the panel fills; writing `""`,
   * `null` or `undefined` makes it fill. Writes before the first layout are the starting size.
   */
  get size(): string;
  set size(size: string | null | undefined);
  /**
   * Live collapsed state. Writing it fires no event; it animates like a toggle once the page
   * has had user activation. Writes before the first layout are the starting state.
   */
  get collapsed(): boolean;
  set collapsed(collapsed: boolean | null | undefined);
  /** The starting size: the `size` attribute, or a `size` write before the first layout. Writing it writes the attribute. */
  defaultSize: string;
  /** The starting collapsed state, from the attribute or an early write. Writing it writes the attribute. */
  defaultCollapsed: boolean;
  /** Reflects `min`; absent means 0. */
  min: string;
  /** Reflects `max`; absent means no maximum. */
  max: string;
  /** Reflects `collapsible`. */
  collapsible: boolean;
  /** Reflects `collapsed-size`; absent means 0. */
  collapsedSize: string;
  /** Reflects `modal`, a media query; absent means never modal. */
  modal: string;

  addEventListener<Type extends keyof BentoPanelEventMap>(
    type: Type,
    listener: BentoPanelListener<Type>,
    options?: boolean | AddEventListenerOptions,
  ): void;
  addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions,
  ): void;
  removeEventListener<Type extends keyof BentoPanelEventMap>(
    type: Type,
    listener: BentoPanelListener<Type>,
    options?: boolean | EventListenerOptions,
  ): void;
  removeEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | EventListenerOptions,
  ): void;
}

/**
 * `<bento-separator>`, the draggable line between two panels. It has no attributes of its own;
 * the author gives it `aria-label` or `aria-labelledby`, and `aria-controls` to pick its primary
 * panel. It adds `tabindex="0"` when the author gave none.
 */
export interface BentoSeparatorElement extends HTMLElement {}

declare global {
  interface HTMLElementTagNameMap {
    "bento-group": BentoGroupElement;
    "bento-panel": BentoPanelElement;
    "bento-separator": BentoSeparatorElement;
  }
}
