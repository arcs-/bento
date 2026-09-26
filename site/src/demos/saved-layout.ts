import type { BentoPanelElement } from "../../../src/bento.ts";

interface SavedLayout {
  readonly size: string;
  readonly collapsed: boolean;
}

/**
 * Remembers a panel across reloads. The app saves the live state when the user is done and
 * renders it back as the attributes, the defaults, before the panel lays out. A server would
 * render them into the HTML; this static page writes them before the first measurement.
 */
export function rememberLayout(panel: BentoPanelElement, storage: Storage, key: string): void {
  const saved = storage.getItem(key);
  if (saved) {
    const { size, collapsed } = JSON.parse(saved) as SavedLayout;
    panel.defaultSize = size;
    panel.defaultCollapsed = collapsed;
  }

  const save = () => {
    const layout: SavedLayout = { size: panel.size, collapsed: panel.collapsed };
    storage.setItem(key, JSON.stringify(layout));
  };
  panel.addEventListener("resizeend", save);
  panel.addEventListener("toggle", save);
}
