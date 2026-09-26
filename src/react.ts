/**
 * JSX typings for React 19, published as the types-only subpath `bento/react`.
 *
 * React 19 sets a prop as a property when the element has one and as an attribute otherwise,
 * and renders every prop as an attribute on the server. So the props are named like the
 * attributes, which both paths understand. Event handlers are `on` plus the exact event name,
 * which React 19 adds as a listener; a `Capture` suffix listens in the capture phase.
 */
import type { DetailedHTMLProps, HTMLAttributes } from "react";
import type {
  BentoGroupElement,
  BentoPanelElement,
  BentoSeparatorElement,
  BentoToggleEvent,
  Orientation,
} from "./bento.js";

type Listener<EventType extends Event> = ((event: EventType) => void) | undefined;

/** React's own handlers for these names never reach a custom element's events. */
type UnreachableReactHandlers = "onResize" | "onResizeCapture" | "onToggle" | "onBeforeToggle";

type ElementProps<Element extends HTMLElement> = Omit<
  DetailedHTMLProps<HTMLAttributes<Element>, Element>,
  UnreachableReactHandlers
>;

interface BentoGroupProps {
  orientation?: Orientation | undefined;
  /** Panel events never bubble; a group hears its panels' events in the capture phase. */
  onresizeCapture?: Listener<Event>;
  onresizeendCapture?: Listener<Event>;
  onbeforetoggleCapture?: Listener<BentoToggleEvent>;
  ontoggleCapture?: Listener<BentoToggleEvent>;
}

interface BentoPanelProps {
  size?: string | undefined;
  collapsed?: boolean | undefined;
  min?: string | undefined;
  max?: string | undefined;
  collapsible?: boolean | undefined;
  "collapsed-size"?: string | undefined;
  modal?: string | undefined;
  onresize?: Listener<Event>;
  onresizeend?: Listener<Event>;
  onbeforetoggle?: Listener<BentoToggleEvent>;
  ontoggle?: Listener<BentoToggleEvent>;
}

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "bento-group": ElementProps<BentoGroupElement> & BentoGroupProps;
      "bento-panel": ElementProps<BentoPanelElement> & BentoPanelProps;
      "bento-separator": ElementProps<BentoSeparatorElement>;
    }
  }
}
