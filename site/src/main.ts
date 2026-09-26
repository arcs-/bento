import type { BentoPanelElement } from "../../src/bento.ts";
import { playground } from "./demos/playground.ts";
import { rememberLayout } from "./demos/saved-layout.ts";
import { guardUnsavedChanges } from "./demos/unsaved-changes.ts";
import { EventLog } from "./event-log.ts";
import { showLiveSizes } from "./live-readouts.ts";
import { PanelInspector } from "./panel-inspector.ts";
import { wireSectionLinks } from "./section-links.ts";
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

/** Storage can be missing or throw, in private windows or with site data blocked. */
function localStorageIfAvailable(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function startDemos(): void {
  const editor = document.querySelector<BentoPanelElement>("bento-panel#notes");
  if (editor) guardUnsavedChanges(editor);

  const remembered = document.querySelector<BentoPanelElement>("bento-panel#remembered");
  const storage = localStorageIfAvailable();
  if (remembered && storage) rememberLayout(remembered, storage, "bento-docs-remembered-panel");

  const addButton = document.querySelector<HTMLButtonElement>("#add-panel");
  const panelGroup = document.querySelector("#playground");
  const panelTemplate = document.querySelector<HTMLTemplateElement>("#playground-panel");
  if (addButton && panelGroup && panelTemplate) playground(panelGroup, addButton, panelTemplate);
}

/** Inspects the first demo panel, or the page's own content panel on pages without demos. */
function startPanelInspector(): void {
  const root = document.querySelector<HTMLElement>("[data-panel-inspector]");
  const inspectorPanel = document.querySelector("#inspector");
  const first =
    document.querySelector<BentoPanelElement>(".specimen-stage bento-panel") ??
    document.querySelector<BentoPanelElement>("bento-panel#page-panel");
  if (!root || !inspectorPanel || !first) return;
  const inspector = new PanelInspector(root, inspectorPanel);
  inspector.inspect(first);
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
