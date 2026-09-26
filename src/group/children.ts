/**
 * What a group reads from its children and writes into them: which separators show, where
 * focus goes, and each child's render from the committed layout.
 */
import {
  type Axis,
  type ContentState,
  measuredRender,
  modalRender,
  separatorRender,
  unmeasuredRender,
} from "../model/render.ts";
import type { Snapshot } from "../model/layout.ts";
import { BentoPanel, panelAccess } from "../elements/panel.ts";
import { BentoSeparator, separatorAccess } from "../elements/separator.ts";

const isModalPanel = (element: Element | null) =>
  element instanceof BentoPanel && panelAccess.isModal(element);

export const separatorHidden = (separator: Element) =>
  isModalPanel(separator.previousElementSibling) || isModalPanel(separator.nextElementSibling);

/**
 * Moves focus out of panels whose content is about to be hidden, to the separator that
 * resizes them, so the keyboard user stays where the panel was. Reads no layout.
 */
export function rescueFocus(hiding: readonly HTMLElement[]): void {
  for (const panel of hiding) {
    if (panel.matches(":focus-within")) separatorOf(panel)?.focus({ preventScroll: true });
  }
}

/** The separator next to `panel` that resizes it, while visible. */
function separatorOf(panel: HTMLElement): HTMLElement | null {
  const siblings = [panel.previousElementSibling, panel.nextElementSibling];
  const separator = siblings.find(
    (sibling) =>
      sibling instanceof BentoSeparator &&
      separatorAccess.primary(sibling) === panel &&
      !separatorHidden(sibling),
  );
  return separator instanceof HTMLElement ? separator : null;
}

/** Collapsed as shown in `snapshot`: its layout for a panel in the group, as asked for a modal one. */
export function shownCollapsed(snapshot: Snapshot<BentoPanel>, panel: BentoPanel): boolean {
  return (
    snapshot.layout[snapshot.panels.indexOf(panel)]?.collapsed ?? panelAccess.askedCollapsed(panel)
  );
}

/** Renders every child from `committed`; `frozen` holds the content of panels mid-toggle. */
export function renderChildren(
  children: readonly Element[],
  committed: Snapshot<BentoPanel>,
  axis: Axis,
  frozen: (panel: BentoPanel) => ContentState | null,
): void {
  const { panels: inGroup, resolved, layout, space } = committed;
  const firstFiller = inGroup[layout.findIndex((box) => box.fills)];
  for (const child of children) {
    if (child instanceof BentoPanel) {
      const index = inGroup.indexOf(child);
      const request = resolved[index];
      const box = layout[index];
      if (!request || !box) {
        const precedes =
          !firstFiller ||
          Boolean(child.compareDocumentPosition(firstFiller) & Node.DOCUMENT_POSITION_FOLLOWING);
        const side = precedes ? "start" : "end";
        panelAccess.render(
          child,
          modalRender(axis, panelAccess.askedCollapsed(child), side, child.size),
        );
      } else if (space === null) {
        panelAccess.render(child, unmeasuredRender(axis, child.size, request, box));
      } else {
        panelAccess.render(child, measuredRender(axis, request, box, frozen(child)));
      }
    }
    if (child instanceof BentoSeparator) {
      const primary = separatorAccess.primary(child);
      const primaryIndex = primary ? inGroup.indexOf(primary) : -1;
      const hidden = separatorHidden(child);
      separatorAccess.render(child, separatorRender(axis, hidden, committed, primaryIndex));
    }
  }
}
