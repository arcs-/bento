import type { BentoPanelElement } from "../../src/bento.ts";
import { playground } from "./demos/playground.ts";
import { guardUnsavedChanges } from "./demos/unsaved-changes.ts";
import { EventLog } from "./event-log.ts";
import { showLiveSizes } from "./live-readouts.ts";
import { PanelInspector } from "./panel-inspector.ts";
import { wireSectionLinks } from "./section-links.ts";
import { wireDeviceSwitch } from "./device-switch.ts";
import { wirePanelControls } from "./panel-controls.ts";

function startEventLogs(): void {
  for (const list of document.querySelectorAll<HTMLOListElement>("[data-event-log]")) {
    const scopeSelector = list.dataset.eventLog ?? "document";
    const scope = scopeSelector === "document" ? document : document.querySelector(scopeSelector);
    if (!scope) continue;
    const log = new EventLog(list, scope);
    const clearButton = document.querySelector(`[data-clear-log="${list.id}"]`);
    clearButton?.addEventListener("click", () => log.clear());
  }
}

function startDemos(): void {
  const switcher = document.querySelector(".device-switch");
  const device = document.querySelector<HTMLElement>("[data-device-frame]");
  if (switcher && device) wireDeviceSwitch(switcher, device);

  const editor = document.querySelector<BentoPanelElement>("bento-panel#notes");
  if (editor) guardUnsavedChanges(editor);

  const addButton = document.querySelector<HTMLButtonElement>("#add-panel");
  const panelGroup = document.querySelector("#playground");
  const panelTemplate = document.querySelector<HTMLTemplateElement>("#playground-panel");
  if (addButton && panelGroup && panelTemplate) playground(panelGroup, addButton, panelTemplate);
}

/** The inspector starts empty and inspects whatever panel is clicked, focused or hovered. */
function startPanelInspector(): PanelInspector | null {
  const root = document.querySelector<HTMLElement>("[data-panel-inspector]");
  const inspectorPanel = document.querySelector("#inspector");
  return root && inspectorPanel ? new PanelInspector(root, inspectorPanel) : null;
}

function startSectionLinks(): void {
  const links = [...document.querySelectorAll<HTMLAnchorElement>(".toc-link")];
  const scroller = document.querySelector<HTMLElement>("#content");
  const drawer = document.querySelector<BentoPanelElement>("bento-panel#contents");
  if (links.length > 0 && scroller && drawer) wireSectionLinks(links, scroller, drawer);
}

startEventLogs();
startSectionLinks();
startPanelInspector();
startDemos();
wirePanelControls();
showLiveSizes();
