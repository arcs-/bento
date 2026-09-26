import { afterEach, describe, expect, test } from "vitest";
import bentoScript from "../dist/bento.js?raw";
import { mount } from "./fixtures.ts";

/**
 * These tests load the built dist/bento.js, as a page would, into a fresh document:
 * a blocking classic script in the head, before server-rendered markup.
 */

const frameSize = { width: 600, height: 300 };

interface FrameSizes {
  sidebar: number;
  main: number;
}

interface ProbedWindow extends Window {
  firstFrame?: FrameSizes & { upgraded: boolean };
  measure?: () => FrameSizes;
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

/** Measures in the first animation frame, before the first paint, and on demand later. */
const measuringScript = `<script>
  const widthOf = (id) => document.getElementById(id).getBoundingClientRect().width;
  window.measure = () => ({ sidebar: widthOf("sidebar"), main: widthOf("main") });
  requestAnimationFrame(() => {
    window.firstFrame = { ...window.measure(), upgraded: document.getElementById("sidebar").matches(":defined") };
  });
</script>`;

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
      <html><head><script src="${bentoScriptUrl()}"></script></head>
      <body>${serverRenderedLayout}${measuringScript}</body></html>`);
    await expect.poll(() => frameWindow.firstFrame).toBeDefined();
    const { firstFrame, measure } = frameWindow;
    if (!firstFrame || !measure) throw new Error("the frame did not measure");

    expect(firstFrame.upgraded).toBe(true);
    expect(firstFrame.sidebar).toBeCloseTo(200, 0);
    await framesOf(frameWindow, 10);
    expect(measure().sidebar).toBeCloseTo(firstFrame.sidebar, 0);
    expect(measure().main).toBeCloseTo(firstFrame.main, 0);
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

    expect(frameWindow.firstFrame?.sidebar).toBeCloseTo(200, 0);
    sidebar.collapsed = true;
    await expect.poll(() => frameWindow.measure?.().sidebar).toBeCloseTo(0, 0);

    expect(frameWindow.violations).toEqual([]);
    expect(frameWindow.injectedStyles).toEqual([]);
    expect(frameWindow.document.styleSheets).toHaveLength(0);
    expect(frameWindow.document.adoptedStyleSheets).toHaveLength(0);
  });
});
