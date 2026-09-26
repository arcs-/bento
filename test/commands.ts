import type { SerializedLocator } from "vitest/browser";
import type { BrowserCommand, BrowserCommandContext } from "vitest/node";
import type { AccessibleNode, ReducedMotion } from "./browser-commands.ts";

/**
 * Server-side commands for what a page cannot do alone: real pointer input with pointer
 * capture, emulating `prefers-reduced-motion`, and reading the accessibility tree that
 * `ElementInternals` feeds. They run in Node through the playwright provider.
 */

interface Point {
  x: number;
  y: number;
}

const pointerPositions = new Map<string, Point>();

function currentPointer(context: BrowserCommandContext): Point {
  const position = pointerPositions.get(context.sessionId);
  if (!position) throw new Error("pointerMove without pointerDown");
  return position;
}

/** The target's center in whole pixels, so a 1px wide target is hit in every engine's rounding. */
async function centerPixel(
  context: BrowserCommandContext,
  target: SerializedLocator,
): Promise<Point> {
  const box = await context.iframe.locator(target.selector).boundingBox();
  if (!box) throw new Error(`${target.locator} has no box to point at`);
  return { x: Math.floor(box.x + box.width / 2), y: Math.floor(box.y + box.height / 2) };
}

const pointerDown: BrowserCommand<[SerializedLocator, number?, number?], void> = async (
  context,
  target,
  offsetX = 0,
  offsetY = 0,
) => {
  const center = await centerPixel(context, target);
  const pressed = { x: center.x + offsetX, y: center.y + offsetY };
  await context.page.mouse.move(pressed.x, pressed.y);
  await context.page.mouse.down();
  pointerPositions.set(context.sessionId, pressed);
};

const doubleClick: BrowserCommand<[SerializedLocator], void> = async (context, target) => {
  const center = await centerPixel(context, target);
  await context.page.mouse.dblclick(center.x, center.y);
};

const pointerMove: BrowserCommand<[number, number, number?], void> = async (
  context,
  deltaX,
  deltaY,
  steps = 1,
) => {
  const start = currentPointer(context);
  const end = { x: start.x + deltaX, y: start.y + deltaY };
  await context.page.mouse.move(end.x, end.y, { steps });
  pointerPositions.set(context.sessionId, end);
};

const pointerUp: BrowserCommand<[], void> = async (context) => {
  if (!pointerPositions.delete(context.sessionId)) return;
  await context.page.mouse.up();
};

const emulateReducedMotion: BrowserCommand<[ReducedMotion], void> = async (context, preference) => {
  await context.page.emulateMedia({ reducedMotion: preference });
};

interface AXValue {
  value?: unknown;
}

interface AXNode {
  ignored: boolean;
  role?: AXValue;
  name?: AXValue;
  value?: AXValue;
  properties?: { name: string; value: AXValue }[];
}

interface FrameTree {
  frame: { id: string; name?: string };
  childFrames?: FrameTree[];
}

function findFrameId(tree: FrameTree, frameName: string): string | undefined {
  if (tree.frame.name === frameName) return tree.frame.id;
  for (const child of tree.childFrames ?? []) {
    const frameId = findFrameId(child, frameName);
    if (frameId) return frameId;
  }
  return undefined;
}

function toNumber(value: AXValue | undefined): number | undefined {
  return value?.value === undefined ? undefined : Number(value.value);
}

function toAccessibleNode(node: AXNode): AccessibleNode {
  const property = (name: string) => node.properties?.find((entry) => entry.name === name)?.value;
  const orientation = property("orientation")?.value;
  return {
    name: String(node.name?.value ?? ""),
    orientation: typeof orientation === "string" ? orientation : undefined,
    valueNow: toNumber(node.value) ?? toNumber(property("valuenow")),
    valueMin: toNumber(property("valuemin")),
    valueMax: toNumber(property("valuemax")),
    focusable: property("focusable")?.value === true,
  };
}

const accessibleNodes: BrowserCommand<[string], AccessibleNode[]> = async (context, role) => {
  const session = await context.page.context().newCDPSession(context.page);
  try {
    const testFrame = await context.frame();
    const { frameTree } = (await session.send("Page.getFrameTree")) as { frameTree: FrameTree };
    const frameId = findFrameId(frameTree, testFrame.name());
    if (!frameId) throw new Error("test frame not found in the frame tree");
    const { nodes } = (await session.send("Accessibility.getFullAXTree", { frameId })) as {
      nodes: AXNode[];
    };
    return nodes.filter((node) => !node.ignored && node.role?.value === role).map(toAccessibleNode);
  } finally {
    await session.detach();
  }
};

const screenshotPixel: BrowserCommand<[number, number], string> = async (context, x, y) => {
  const testFrame = await context.frame();
  const frameBox = await (await testFrame.frameElement()).boundingBox();
  if (!frameBox) throw new Error("test frame has no box");
  const png: Uint8Array = await context.page.screenshot({
    clip: { x: frameBox.x + x, y: frameBox.y + y, width: 1, height: 1 },
  });
  return btoa(String.fromCharCode(...png));
};

export const browserCommands = {
  pointerDown,
  pointerMove,
  pointerUp,
  doubleClick,
  emulateReducedMotion,
  accessibleNodes,
  screenshotPixel,
};
