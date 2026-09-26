import { afterEach, describe, expect, test } from "vitest";
import bentoScript from "../dist/bento.js?raw";
import { isBetween, mount, press, release } from "./fixtures.ts";

/**
 * These tests load the built dist/bento.js, as a page would, into a fresh document:
 * a blocking classic script in the head, before server-rendered markup.
 */

const frameSize = { width: 600, height: 300 };

/** Each panel's width, by id. */
type FrameSizes = Record<string, number>;

interface FirstFrame {
  sizes: FrameSizes;
  collapsed: Record<string, boolean>;
  upgraded: boolean;
  animations: number;
}

interface ProbedWindow extends Window {
  firstFrame?: FirstFrame;
  measure?: () => FrameSizes;
  panelEvents?: string[];
  globalsBefore?: string[];
  globalsAfter?: string[];
  violations?: string[];
  injectedStyles?: string[];
}

const scriptUrls: string[] = [];

afterEach(() => {
  for (const url of scriptUrls.splice(0)) URL.revokeObjectURL(url);
});

function bentoScriptUrl(): string {
  const url = URL.createObjectURL(new Blob([bentoScript], { type: "text/javascript" }));
  scriptUrls.push(url);
  return url;
}

const serverRenderedLayout = `
  <bento-group id="layout">
    <bento-panel id="sidebar" size="200px" collapsible></bento-panel>
    <bento-separator id="handle"></bento-separator>
    <bento-panel id="main"></bento-panel>
  </bento-group>`;

/**
 * Measures in the first frame, right before its paint: in a \`ResizeObserver\` created after
 * bento's, since observers deliver in the order they were created, and bento's delivery is the
 * first measured layout. Later, it measures on demand.
 */
const measuringScript = `<script>
  const panels = () => [...document.querySelectorAll("bento-panel")];
  window.measure = () =>
    Object.fromEntries(panels().map((panel) => [panel.id, panel.getBoundingClientRect().width]));
  new ResizeObserver((_entries, observer) => {
    observer.disconnect();
    window.firstFrame = {
      sizes: window.measure(),
      collapsed: Object.fromEntries(panels().map((panel) => [panel.id, panel.collapsed])),
      upgraded: panels().every((panel) => panel.matches(":defined")),
      animations: document.getAnimations().length,
    };
  }).observe(document.body);
</script>`;

/** Records every panel event in the capture phase, from before the first element parses. */
const eventRecorder = `<script>
  window.panelEvents = [];
  for (const type of ["resize", "resizeend", "beforetoggle", "toggle"]) {
    document.addEventListener(type, (event) => window.panelEvents.push(type + " " + event.target.id), { capture: true });
  }
</script>`;

/** Layouts whose first paint depends on bento: px, a rail, a %, a group collapse, a modal panel. */
const serverRenderedLayouts = `
  ${serverRenderedLayout}
  <bento-group style="height: 50px">
    <bento-panel id="rail" size="300px" collapsible collapsed collapsed-size="48px"></bento-panel>
    <bento-separator></bento-separator>
    <bento-panel id="share" size="25%"></bento-panel>
    <bento-separator></bento-separator>
    <bento-panel id="rest"></bento-panel>
  </bento-group>
  <bento-group style="width: 300px; height: 50px">
    <bento-panel id="first" size="200px"></bento-panel>
    <bento-separator></bento-separator>
    <bento-panel id="too-wide" size="200px" min="150px" collapsible></bento-panel>
  </bento-group>
  <bento-group style="height: 50px">
    <bento-panel id="drawer" size="200px" collapsible modal="(min-width: 0px)"></bento-panel>
    <bento-separator></bento-separator>
    <bento-panel id="beside-drawer"></bento-panel>
  </bento-group>`;

async function loadDocument(html: string): Promise<ProbedWindow> {
  const frame = document.createElement("iframe");
  frame.width = String(frameSize.width);
  frame.height = String(frameSize.height);
  const loaded = new Promise((resolve) => frame.addEventListener("load", resolve, { once: true }));
  frame.srcdoc = html;
  const container = document.createElement("div");
  container.append(frame);
  mount(container);
  await loaded;
  const frameWindow = frame.contentWindow;
  if (!frameWindow) throw new Error("the frame has no window");
  return frameWindow;
}

async function framesOf(frameWindow: Window, count: number): Promise<void> {
  for (let frame = 0; frame < count; frame += 1) {
    await new Promise((resolve) => frameWindow.requestAnimationFrame(resolve));
  }
}

describe("a blocking script in the head", () => {
  test("upgrades server-rendered markup at parse time: the first frame is final", async () => {
    const frameWindow = await loadDocument(`<!doctype html>
      <html><head><script src="${bentoScriptUrl()}"></script>${eventRecorder}</head>
      <body style="margin: 0">${serverRenderedLayouts}${measuringScript}</body></html>`);
    await expect.poll(() => frameWindow.firstFrame).toBeDefined();
    const { firstFrame, measure } = frameWindow;
    if (!firstFrame || !measure) throw new Error("the frame did not measure");
    const { sizes, collapsed } = firstFrame;

    expect(firstFrame.upgraded, "upgraded").toBe(true);
    expect(sizes.sidebar).toBeCloseTo(200, 0);
    expect(sizes.rail).toBeCloseTo(48, 0);
    expect(sizes.share).toBeCloseTo((frameSize.width - 2) / 4, 0);
    expect(collapsed["too-wide"], "group collapse").toBe(true);
    expect(sizes["too-wide"]).toBeCloseTo(0, 0);
    expect(collapsed.drawer, "modal").toBe(true);
    expect(sizes["beside-drawer"]).toBeCloseTo(frameSize.width, 0);
    expect(firstFrame.animations).toBe(0);

    for (let frame = 0; frame < 10; frame += 1) {
      await framesOf(frameWindow, 1);
      expect(frameWindow.document.getAnimations()).toEqual([]);
    }
    const later = measure();
    for (const [id, size] of Object.entries(sizes)) expect(later[id]).toBeCloseTo(size, 0);
    expect(frameWindow.panelEvents).toEqual([]);
  });

  test("an app's collapsed write applies at once before user activation, and animates after", async () => {
    const frameWindow = await loadDocument(`<!doctype html>
      <html><head><script src="${bentoScriptUrl()}"></script></head>
      <body style="margin: 0">${serverRenderedLayout}${measuringScript}</body></html>`);
    await expect.poll(() => frameWindow.firstFrame).toBeDefined();
    const sidebar = frameWindow.document.querySelector("bento-panel");
    if (!sidebar) throw new Error("no sidebar in the frame");
    const sidebarWidth = () => sidebar.getBoundingClientRect().width;
    const samples = async () => {
      const widths: number[] = [];
      for (let frame = 0; frame < 8; frame += 1) {
        await framesOf(frameWindow, 1);
        widths.push(sidebarWidth());
      }
      return widths;
    };

    sidebar.collapsed = true;
    for (const sample of await samples()) expect(sample).toBeCloseTo(0, 0);

    const frameElement = frameWindow.frameElement;
    if (!frameElement) throw new Error("no frame element");
    await press(frameElement, 100);
    await release();
    sidebar.collapsed = false;
    expect((await samples()).some((sample) => isBetween(sample, 0, 200))).toBe(true);
  });

  test("leaks no global", async () => {
    const frameWindow = await loadDocument(`<!doctype html>
      <html><head>
        <script>window.globalsBefore = Object.getOwnPropertyNames(window);</script>
        <script src="${bentoScriptUrl()}"></script>
        <script>window.globalsAfter = Object.getOwnPropertyNames(window);</script>
      </head><body></body></html>`);
    const before = new Set([...(frameWindow.globalsBefore ?? []), "globalsBefore"]);

    expect(frameWindow.globalsAfter?.filter((name) => !before.has(name))).toEqual([]);
  });
});

describe("styles", () => {
  test("need no CSP exception: nothing is injected, and layout works under style-src 'none'", async () => {
    const frameWindow = await loadDocument(`<!doctype html>
      <html><head>
        <meta http-equiv="Content-Security-Policy" content="style-src 'none'">
        <script>
          window.violations = [];
          window.injectedStyles = [];
          document.addEventListener("securitypolicyviolation", (event) => {
            window.violations.push(event.violatedDirective);
          });
          new MutationObserver((records) => {
            for (const record of records) {
              if (record.type === "attributes") window.injectedStyles.push("style on " + record.target.id);
              for (const node of record.addedNodes) {
                if (node.nodeName === "STYLE" || node.nodeName === "LINK") window.injectedStyles.push(node.nodeName);
              }
            }
          }).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ["style"] });
        </script>
        <script src="${bentoScriptUrl()}"></script>
      </head><body>${serverRenderedLayout}${measuringScript}</body></html>`);
    await expect.poll(() => frameWindow.firstFrame).toBeDefined();
    const sidebar = frameWindow.document.getElementById(
      "sidebar",
    ) as HTMLElementTagNameMap["bento-panel"];

    expect(frameWindow.firstFrame?.sizes.sidebar).toBeCloseTo(200, 0);
    sidebar.collapsed = true;
    await expect.poll(() => frameWindow.measure?.().sidebar).toBeCloseTo(0, 0);

    expect(frameWindow.violations).toEqual([]);
    expect(frameWindow.injectedStyles).toEqual([]);
    expect(frameWindow.document.styleSheets).toHaveLength(0);
    expect(frameWindow.document.adoptedStyleSheets).toHaveLength(0);
  });
});
