/**
 * A panel's collapse and modal state. A modal panel shows while open, so "open and collapsed"
 * or "modal and collapsed by the group" cannot be written.
 */
export type PanelMode =
  | { readonly kind: "inline"; readonly collapsed: boolean }
  /** `inlineCollapsed` is the state it had beside the content, restored when it leaves. */
  | { readonly kind: "modal"; readonly open: boolean; readonly inlineCollapsed: boolean };

export type ModeEvent =
  | { readonly type: "setCollapsed"; readonly collapsed: boolean }
  /** A default applied while clean: it never opens a modal panel, only its inline state. */
  | { readonly type: "setDefaultCollapsed"; readonly collapsed: boolean }
  | { readonly type: "enterModal" }
  | { readonly type: "leaveModal" };

export function nextMode(mode: PanelMode, event: ModeEvent): PanelMode {
  switch (event.type) {
    case "setCollapsed":
      return mode.kind === "inline"
        ? { kind: "inline", collapsed: event.collapsed }
        : { ...mode, open: !event.collapsed };
    case "setDefaultCollapsed":
      return mode.kind === "inline"
        ? { kind: "inline", collapsed: event.collapsed }
        : { ...mode, inlineCollapsed: event.collapsed };
    case "enterModal":
      return mode.kind === "modal"
        ? mode
        : { kind: "modal", open: false, inlineCollapsed: mode.collapsed };
    case "leaveModal":
      return mode.kind === "inline" ? mode : { kind: "inline", collapsed: mode.inlineCollapsed };
  }
}

/** Whether the panel shows collapsed, apart from a collapse by its group. */
export function isCollapsed(mode: PanelMode): boolean {
  return mode.kind === "inline" ? mode.collapsed : !mode.open;
}
