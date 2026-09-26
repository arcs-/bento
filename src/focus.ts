/**
 * Moves focus out of panels whose content is about to be hidden, to the separator that
 * resizes them, so the keyboard user stays where the panel was. Reads no layout.
 */
export function rescueFocus(
  hiding: readonly HTMLElement[],
  separatorOf: (panel: HTMLElement) => HTMLElement | null,
): void {
  for (const panel of hiding) {
    if (panel.matches(":focus-within")) separatorOf(panel)?.focus({ preventScroll: true });
  }
}
