/**
 * Adds a panel at the end of a group, or removes it again. Separators are the app's to write,
 * so the template holds the separator together with its panel, and both carry `data-added`.
 * The group lays itself out again whenever its children change, even in the middle of a drag.
 */
export function toggleAddedPanel(
  button: HTMLButtonElement,
  group: Element,
  template: HTMLTemplateElement,
): void {
  button.addEventListener("click", () => {
    const added = group.querySelectorAll(":scope > [data-added]");
    if (added.length > 0) {
      for (const element of added) element.remove();
    } else {
      group.append(template.content.cloneNode(true));
    }
    button.ariaPressed = String(added.length === 0);
  });
}
