import type { BentoPanelElement } from "../../src/bento.ts";
import { isModal, isPanel } from "./panels.ts";

function describePanel(panel: BentoPanelElement, name: string): string {
  if (isModal(panel)) return `${name}: drawer, ${panel.collapsed ? "closed" : "open"}`;
  const width = Math.round(panel.getBoundingClientRect().width);
  return `${name}: ${width} px${panel.collapsed ? ", collapsed" : ""}`;
}

/**
 * Keeps readouts of panel sizes current: the status bar cells name a panel by id, and a
 * `[data-live-width]` element shows the width of the panel it sits in. A `ResizeObserver`
 * sees every size change, animated or not; `toggle` covers a drawer opening or closing.
 */
export function showLiveSizes(): void {
  const readouts = [
    ...document.querySelectorAll<HTMLElement>("[data-status-of], [data-live-width]"),
  ];
  const targets = readouts.flatMap((readout) => {
    const id = readout.dataset.statusOf;
    const panel = id ? document.getElementById(id) : readout.closest("bento-panel");
    return isPanel(panel) ? [{ readout, panel, name: readout.textContent?.trim() ?? "" }] : [];
  });

  const update = () => {
    for (const { readout, panel, name } of targets) {
      readout.textContent = readout.dataset.statusOf
        ? describePanel(panel, name)
        : `${Math.round(panel.getBoundingClientRect().width)} px`;
    }
  };
  const observer = new ResizeObserver(update);
  for (const { panel } of targets) observer.observe(panel);
  document.addEventListener("toggle", update, { capture: true });
}
