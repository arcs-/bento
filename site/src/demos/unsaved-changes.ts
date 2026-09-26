import type { BentoPanelElement } from "../../../src/bento.ts";

/**
 * Keeps an editor panel open while it holds unsaved changes. A collapse the user asks for is
 * canceled, the app asks, and only a confirmed discard writes `collapsed`, which fires no
 * event, so it cannot loop back here.
 */
export function guardUnsavedChanges(editor: BentoPanelElement): void {
  const text = editor.querySelector("textarea");
  const prompt = editor.querySelector<HTMLElement>("[data-discard-prompt]");
  const discard = editor.querySelector<HTMLButtonElement>("[data-discard]");
  const keep = editor.querySelector<HTMLButtonElement>("[data-keep]");
  if (!text || !prompt || !discard || !keep) return;
  let unsaved = false;

  text.addEventListener("input", () => {
    unsaved = true;
  });

  editor.addEventListener("beforetoggle", (event) => {
    if (event.newState !== "closed" || !event.cancelable || !unsaved) return;
    event.preventDefault();
    prompt.hidden = false;
  });

  discard.addEventListener("click", () => {
    unsaved = false;
    prompt.hidden = true;
    text.value = text.defaultValue;
    editor.collapsed = true;
  });

  keep.addEventListener("click", () => {
    prompt.hidden = true;
    text.focus();
  });
}
