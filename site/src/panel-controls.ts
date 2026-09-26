import type { BentoPanelElement } from "../../src/bento.ts";

const panelById = (id: string | undefined) => {
  const element = id ? document.getElementById(id) : null;
  return element?.localName === "bento-panel" ? (element as BentoPanelElement) : null;
};

/**
 * Buttons that open, collapse or close a panel by writing its live `collapsed`. The same write
 * collapses a panel beside the content and opens or closes it as a drawer in modal mode. Writes
 * fire no event, so each button updates its own `aria-expanded` after one, and on the
 * `toggle` events of changes it did not make.
 */
export function wirePanelControls(): void {
  const toggleButtons = [...document.querySelectorAll<HTMLButtonElement>("[data-toggle-panel]")];
  const showState = () => {
    for (const button of toggleButtons) {
      const panel = panelById(button.dataset.togglePanel);
      if (panel) button.ariaExpanded = String(!panel.collapsed);
    }
  };

  for (const button of toggleButtons) {
    button.addEventListener("click", () => {
      const panel = panelById(button.dataset.togglePanel);
      if (panel) panel.collapsed = !panel.collapsed;
      showState();
    });
  }
  for (const button of document.querySelectorAll<HTMLButtonElement>("[data-close-panel]")) {
    button.addEventListener("click", () => {
      const panel = panelById(button.dataset.closePanel);
      if (panel) panel.collapsed = true;
      showState();
    });
  }
  document.addEventListener("toggle", showState, { capture: true });
  showState();
}
