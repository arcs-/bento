import type { BentoPanelElement } from "../../src/bento.ts";
import { isModal, isPanel } from "./panels.ts";

interface Readout {
  readonly element: HTMLElement;
  readonly panel: BentoPanelElement;
  readonly name: string;
}

const readoutSelector = "[data-status-of], [data-live-width]";

function describePanel(panel: BentoPanelElement, name: string): string {
  if (isModal(panel)) return `${name}: drawer, ${panel.collapsed ? "closed" : "open"}`;
  const width = Math.round(panel.getBoundingClientRect().width);
  return `${name}: ${width} px${panel.collapsed ? ", collapsed" : ""}`;
}

function readoutOf(element: HTMLElement): Readout | null {
  const id = element.dataset.statusOf;
  const panel = id ? document.getElementById(id) : element.closest("bento-panel");
  return isPanel(panel) ? { element, panel, name: element.textContent?.trim() ?? "" } : null;
}

/**
 * Keeps readouts of panel sizes current: the status bar cells name a panel by id, and a
 * `[data-live-width]` element shows the width of the panel it sits in, also in panels added
 * later. A `ResizeObserver` sees every size change, animated or not; `toggle` covers a drawer
 * opening or closing.
 */
export function showLiveSizes(): void {
  const readouts = new Map<HTMLElement, Readout>();
  const update = () => {
    for (const [element, { panel, name }] of readouts) {
      if (!element.isConnected) readouts.delete(element);
      else if (element.dataset.statusOf) element.textContent = describePanel(panel, name);
      else element.textContent = `${Math.round(panel.getBoundingClientRect().width)} px`;
    }
  };
  const sizeObserver = new ResizeObserver(update);
  /** Starts watching the readouts in or at `root`; returns whether there were new ones. */
  const watch = (root: Element | Document) => {
    const found = [...root.querySelectorAll<HTMLElement>(readoutSelector)];
    if (root instanceof HTMLElement && root.matches(readoutSelector)) found.push(root);
    const fresh = found.filter((element) => !readouts.has(element));
    for (const element of fresh) {
      const readout = readoutOf(element);
      if (!readout) continue;
      readouts.set(element, readout);
      sizeObserver.observe(readout.panel);
    }
    return fresh.length > 0;
  };

  watch(document);
  new MutationObserver((mutations) => {
    const added = mutations.flatMap(({ addedNodes }) => [...addedNodes]);
    const fresh = added.filter((node) => node instanceof Element).map((node) => watch(node));
    if (fresh.includes(true)) update();
  }).observe(document.body, { childList: true, subtree: true });
  document.addEventListener("toggle", update, { capture: true });
}
