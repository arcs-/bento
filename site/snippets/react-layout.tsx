/// <reference types="bento/react" />
import type { ReactNode } from "react";

export function Layout({ children }: { children: ReactNode }) {
  return (
    <bento-group>
      <bento-panel
        id="sidebar"
        size="320px"
        min="240px"
        collapsible
        modal="(max-width: 768px)"
        aria-label="Sidebar"
        onbeforetoggle={(event) => {
          if (event.newState === "closed" && hasUnsavedChanges()) event.preventDefault();
        }}
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
