import type { BentoPanelElement } from "../../src/bento.ts";
import { toggleAddedPanel } from "./demos/runtime-panel.ts";
import { rememberLayout } from "./demos/saved-layout.ts";
import { guardUnsavedChanges } from "./demos/unsaved-changes.ts";
import { EventLog } from "./event-log.ts";
import { showLiveSizes } from "./live-readouts.ts";
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
  const addGroup = document.querySelector("#runtime-demo");
  const addTemplate = document.querySelector<HTMLTemplateElement>("#added-panel");
  if (addButton && addGroup && addTemplate) toggleAddedPanel(addButton, addGroup, addTemplate);
}

startEventLogs();
startDemos();
wirePanelControls();
showLiveSizes();
