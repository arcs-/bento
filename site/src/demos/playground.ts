/** Enough panels to try pushing and squeezing, few enough to stay readable. */
const maxPanels = 6;

const isSeparator = (element: Element | null) => element?.localName === "bento-separator";

const removeButton = (panel: Element | null | undefined) =>
  panel?.querySelector<HTMLButtonElement>("[data-remove]") ?? null;

/**
 * A playground of panels. Add appends a separator and a numbered panel; each panel's Remove
 * takes it out together with the separator beside it. Separators are the app's to write, and
 * the group lays itself out again whenever its children change.
 */
export function playground(
  group: Element,
  add: HTMLButtonElement,
  template: HTMLTemplateElement,
): void {
  const panels = () => [...group.querySelectorAll(":scope > bento-panel")];
  let count = panels().length;

  const refresh = () => {
    const all = panels();
    add.disabled = all.length >= maxPanels;
    for (const panel of all) {
      const button = removeButton(panel);
      if (button) button.disabled = all.length === 1;
    }
  };

  add.addEventListener("click", () => {
    count += 1;
    const pieces = template.content.cloneNode(true);
    if (!(pieces instanceof DocumentFragment)) return;
    for (const label of pieces.querySelectorAll("[data-label]")) {
      label.textContent = `Panel ${count}`;
    }
    pieces.querySelector("bento-separator")?.setAttribute("aria-label", `Resize panel ${count}`);
    removeButton(pieces.querySelector("bento-panel"))?.setAttribute(
      "aria-label",
      `Remove panel ${count}`,
    );
    group.append(pieces);
    refresh();
  });

  group.addEventListener("click", (event) => {
    const button = event.target instanceof Element ? event.target.closest("[data-remove]") : null;
    const removed = button?.closest("bento-panel");
    const all = panels();
    if (!removed || all.length === 1) return;
    const index = all.indexOf(removed);
    const neighbour = all[index - 1] ?? all[index + 1];
    const before = removed.previousElementSibling;
    const separator = isSeparator(before) ? before : removed.nextElementSibling;
    if (isSeparator(separator)) separator?.remove();
    removed.remove();
    refresh();
    const next = removeButton(neighbour);
    (next && !next.disabled ? next : add).focus();
  });

  refresh();
}
