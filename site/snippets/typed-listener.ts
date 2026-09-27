import type { BentoPanelElement } from "bento-panels";

export function keepOpen(panel: BentoPanelElement): void {
  panel.addEventListener("beforetoggle", (event) => {
    if (event.newState === "closed" && event.cancelable) event.preventDefault();
  });
}
