import type { BentoPanelElement } from "../../src/bento.ts";

export const isPanel = (target: unknown): target is BentoPanelElement =>
  target instanceof HTMLElement && target.localName === "bento-panel";

export const isModal = (panel: BentoPanelElement) =>
  panel.modal !== "" && matchMedia(panel.modal).matches;

/** The first words a panel shows, which is how a reader would name it. */
function firstText(panel: BentoPanelElement): string | undefined {
  const texts = document.createTreeWalker(panel, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) =>
      node.textContent?.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP,
  });
  return texts.nextNode()?.textContent?.trim();
}

/** An id, else a label, else the panel's first text. */
export function panelName(panel: BentoPanelElement): string {
  if (panel.id) return `#${panel.id}`;
  const label = panel.getAttribute("aria-label") ?? firstText(panel);
  return label ? `"${label.trim()}"` : "an unnamed panel";
}
