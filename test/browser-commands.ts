import type { Locator } from "vitest/browser";

/** The custom commands as the test page calls them; test/commands.ts runs them in Node. */

export type ReducedMotion = "reduce" | "no-preference";

/** What assistive tech sees of one node. */
export interface AccessibleNode {
  name: string;
  orientation: string | undefined;
  valueNow: number | undefined;
  valueMin: number | undefined;
  valueMax: number | undefined;
  focusable: boolean;
}

declare module "vitest/browser" {
  interface BrowserCommands {
    /**
     * Presses the primary button on the center pixel of the target, or that far off it,
     * with real pointer events.
     */
    pointerDown: (target: Locator, offsetX?: number, offsetY?: number) => Promise<void>;
    /** Moves the pressed pointer by a delta in CSS pixels, in `steps` pointermove events. */
    pointerMove: (deltaX: number, deltaY: number, steps?: number) => Promise<void>;
    /** Double-clicks the center pixel of the target, without waiting for it to look clickable. */
    doubleClick: (target: Locator) => Promise<void>;
    /** Releases the pointer if it is pressed, so a failed test leaves no button down. */
    pointerUp: () => Promise<void>;
    emulateReducedMotion: (preference: ReducedMotion) => Promise<void>;
    /** Chromium only: the nodes with a role in the accessibility tree of the test frame. */
    accessibleNodes: (role: string) => Promise<AccessibleNode[]>;
    /** A 1x1 PNG, base64, of what the test frame renders at a point in its viewport. */
    screenshotPixel: (x: number, y: number) => Promise<string>;
  }
}
