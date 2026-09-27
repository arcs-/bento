/// <reference types="bento-panels/react" />
import type { BentoPanelElement } from "bento-panels";
import { type ReactNode, useEffect, useRef } from "react";

export function Layout({ sidebarOpen, children }: { sidebarOpen: boolean; children: ReactNode }) {
  const sidebar = useRef<BentoPanelElement>(null);

  useEffect(() => {
    const panel = sidebar.current;
    const keepUnsaved = (event: ToggleEvent) => {
      if (event.newState === "closed" && event.cancelable && hasUnsavedChanges()) {
        event.preventDefault();
      }
    };
    panel?.addEventListener("beforetoggle", keepUnsaved);
    return () => panel?.removeEventListener("beforetoggle", keepUnsaved);
  }, []);

  return (
    <bento-group>
      <bento-panel
        ref={sidebar}
        id="sidebar"
        size="320px"
        min="240px"
        collapsible
        collapsed={!sidebarOpen}
        modal="(max-width: 768px)"
        aria-label="Sidebar"
      >
        <nav className="h-full overflow-auto">…</nav>
      </bento-panel>
      <bento-separator aria-label="Resize sidebar" aria-controls="sidebar" tabIndex={0} />
      <bento-panel>
        <main className="h-full overflow-auto">{children}</main>
      </bento-panel>
    </bento-group>
  );
}
