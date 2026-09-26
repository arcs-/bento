import type { BentoPanelElement } from "../../src/bento.ts";

export const isPanel = (target: unknown): target is BentoPanelElement =>
  target instanceof HTMLElement && target.localName === "bento-panel";

export const isModal = (panel: BentoPanelElement) =>
  panel.modal !== "" && matchMedia(panel.modal).matches;

/** An id, else a label, else the panel's first bold text, as a reader would name it. */
export function panelName(panel: BentoPanelElement): string {
  if (panel.id) return `#${panel.id}`;
  const label = panel.getAttribute("aria-label") ?? panel.querySelector("strong")?.textContent;
  return label ? `"${label.trim()}"` : "an unnamed panel";
}
