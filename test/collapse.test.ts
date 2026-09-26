import { describe, expect, test } from "vitest";
import { commands } from "vitest/browser";
import {
  activateUser,
  block,
  colorAtCenterOf,
  drag,
  frames,
  group,
  isAt,
  isBetween,
  layout,
  mount,
  moveBy,
  panel,
  parse,
  pixels,
  press,
  pressKeys,
  recordEvents,
  release,
  render,
  sampleFrames,
  sampleUntilAt,
  separator,
  settleAt,
  sidebarLayout,
  toggleStates,
  width,
  type Color,
} from "./fixtures.ts";

const measureSidebar = () => width(panel("sidebar"));
const endWidth = () => width(panel("end"));

const isPartlyFaded = ({ red, blue }: Color) => blue > 200 && red > 20 && red < 235;
const isFullBlue = ({ red, blue }: Color) => blue > 250 && red < 5;

describe("collapsed", () => {
  test("at size 0 its content is not rendered, so focus skips it", async () => {
    await render(sidebarLayout('size="300px" collapsible collapsed'));
    const button = document.createElement("button");
    block("sidebar-content").append(button);

    expect(width(panel("sidebar"))).toBeCloseTo(0, 0);
    expect(button.checkVisibility()).toBe(false);
    button.focus();
    expect(document.activeElement).not.toBe(button);
  });

  test("a rail keeps its content, sized to the rail", async () => {
    await render(sidebarLayout('size="300px" collapsible collapsed collapsed-size="48px"'));

    expect(width(panel("sidebar"))).toBeCloseTo(48, 0);
    expect(block("sidebar-content").checkVisibility()).toBe(true);
    expect(width(block("sidebar-content"))).toBeCloseTo(48, 0);
  });

  test("the separator stays next to a collapsed panel and reopens it", async () => {
    await render(sidebarLayout('size="300px" collapsible collapsed'));
    const handle = separator("handle");

    expect(handle.checkVisibility({ visibilityProperty: true })).toBe(true);
    await pressKeys(handle, "{Enter}");

    expect(panel("sidebar").collapsed).toBe(false);
    await settleAt(() => width(panel("sidebar")), 300);
  });

  test("expanding restores the size from before the collapse", async () => {
    await render(sidebarLayout('size="300px" collapsible'));
    const sidebar = panel("sidebar");
    await drag(separator("handle"), 100);

    await pressKeys(separator("handle"), "{Enter}");
    await settleAt(() => width(sidebar), 0);
    expect(pixels(sidebar.size)).toBeCloseTo(400, 0);
    await pressKeys(separator("handle"), "{Enter}");

    await settleAt(() => width(sidebar), 400);
  });

  test("is set, never inferred from size: a panel dragged to 0 is not collapsed", async () => {
    await render(sidebarLayout('size="300px"'));

    await drag(separator("handle"), -400);

    expect(width(panel("sidebar"))).toBeCloseTo(0, 0);
    expect(panel("sidebar").collapsed).toBe(false);
  });
});

describe("animation", () => {
  test("toggling animates the size both ways", async () => {
    await render(sidebarLayout('size="300px" collapsible'));

    await pressKeys(separator("handle"), "{Enter}");
    const collapsing = await sampleUntilAt(measureSidebar, 0);
    await pressKeys(separator("handle"), "{Enter}");
    const expanding = await sampleUntilAt(measureSidebar, 300);

    expect(collapsing.some((sample) => isBetween(sample, 300, 0))).toBe(true);
    expect(expanding.some((sample) => isBetween(sample, 0, 300))).toBe(true);
  });

  test("toggles take their timing from the panel's transition-duration and -timing-function", async () => {
    await render(`
      <style>
        #sidebar { transition-duration: 600ms; transition-timing-function: linear }
        #sidebar.instant { transition-duration: 0s }
      </style>
      ${sidebarLayout('size="300px" collapsible')}`);
    const timeline: { elapsed: number; sidebarWidth: number }[] = [];

    const start = performance.now();
    await pressKeys(separator("handle"), "{Enter}");
    await sampleUntilAt(() => {
      const sidebarWidth = measureSidebar();
      timeline.push({ elapsed: performance.now() - start, sidebarWidth });
      return sidebarWidth;
    }, 0);

    const firstAtEnd = timeline.find(({ sidebarWidth }) => isAt(sidebarWidth, 0));
    expect(firstAtEnd?.elapsed).toBeGreaterThan(450);
    const nearHalfway = timeline.filter(({ elapsed }) => elapsed > 250 && elapsed < 350);
    for (const { sidebarWidth } of nearHalfway) expect(sidebarWidth).toBeCloseTo(150, -2);

    panel("sidebar").classList.add("instant");
    await pressKeys(separator("handle"), "{Enter}");
    for (const sample of await sampleFrames(measureSidebar)) expect(sample).toBeCloseTo(300, 0);
  });

  test("snapping animates the size", async () => {
    await render(sidebarLayout('size="300px" min="200px" collapsible'));

    await press(separator("handle"));
    await commands.pointerMove(-250, 0, 5);
    const snapping = await sampleUntilAt(() => width(panel("sidebar")), 0);
    await release();

    expect(snapping.some((sample) => isBetween(sample, 200, 0))).toBe(true);
  });

  test("mounting and resizing the group never animate", async () => {
    const container = parse(sidebarLayout('size="25%"'));
    mount(container);

    for (const sample of await sampleFrames(measureSidebar)) expect(sample).toBeCloseTo(250, 0);

    group("layout").style.width = "800px";
    await frames();
    for (const sample of await sampleFrames(measureSidebar)) expect(sample).toBeCloseTo(200, 0);
  });

  test("property writes before the first layout never animate, as when React hydrates", async () => {
    const container = parse(sidebarLayout('size="300px" collapsible'));
    const sidebar = container.querySelector("bento-panel");
    if (!sidebar) throw new Error("no panel parsed");
    sidebar.size = "200px";

    mount(container);
    sidebar.collapsed = true;

    for (const sample of await sampleFrames(measureSidebar)) expect(sample).toBeCloseTo(0, 0);
    sidebar.collapsed = false;
    await settleAt(measureSidebar, 200);
  });

  test("while collapsing, content keeps its start size; the neighbour's has its end size", async () => {
    await render(sidebarLayout('size="300px" collapsible'));
    const endWidthOfMain = width(group("layout")) - width(separator("handle"));
    const contentWidths: number[] = [];
    const mainContentWidths: number[] = [];

    await pressKeys(separator("handle"), "{Enter}");
    await sampleUntilAt(() => {
      const currentWidth = measureSidebar();
      if (currentWidth > 1) contentWidths.push(width(block("sidebar-content")));
      mainContentWidths.push(width(block("main-content")));
      return currentWidth;
    }, 0);

    for (const contentWidth of contentWidths) expect(contentWidth).toBeCloseTo(300, 0);
    for (const contentWidth of mainContentWidths) {
      expect(contentWidth).toBeCloseTo(endWidthOfMain, 0);
    }
  });

  test("while expanding, content has its end size from the start", async () => {
    await render(sidebarLayout('size="300px" collapsible collapsed'));
    const contentWidths: number[] = [];

    await pressKeys(separator("handle"), "{Enter}");
    const expanding = await sampleUntilAt(() => {
      contentWidths.push(width(block("sidebar-content")));
      return width(panel("sidebar"));
    }, 300);

    expect(expanding.some((sample) => isBetween(sample, 0, 300))).toBe(true);
    for (const contentWidth of contentWidths) expect(contentWidth).toBeCloseTo(300, 0);
  });
});

describe("reduced motion", () => {
  interface Observation {
    sidebarWidth: number;
    contentColor: Color;
  }

  /** Screenshots are slower than frames; a long transition-duration gives them time to catch the fade. */
  async function observeUntil(done: (observation: Observation) => boolean): Promise<Observation[]> {
    const observations: Observation[] = [];
    const deadline = performance.now() + 3000;
    while (performance.now() < deadline) {
      const observation = {
        sidebarWidth: measureSidebar(),
        contentColor: await colorAtCenterOf(block("sidebar-content")),
      };
      observations.push(observation);
      if (done(observation)) return observations;
    }
    throw new Error("the toggle never finished");
  }

  test("the size changes at once and the content cross-fades", async () => {
    await commands.emulateReducedMotion("reduce");
    await render(sidebarLayout('size="300px" collapsible style="transition-duration: 1s"'));

    await pressKeys(separator("handle"), "{Enter}");
    const collapsing = await observeUntil(({ sidebarWidth }) => isAt(sidebarWidth, 0));
    await pressKeys(separator("handle"), "{Enter}");
    const expanding = await observeUntil(({ contentColor }) => isFullBlue(contentColor));

    for (const { sidebarWidth } of [...collapsing, ...expanding]) {
      expect(isAt(sidebarWidth, 0) || isAt(sidebarWidth, 300)).toBe(true);
    }
    for (const { sidebarWidth } of expanding) expect(sidebarWidth).toBeCloseTo(300, 0);
    expect(collapsing.some(({ contentColor }) => isPartlyFaded(contentColor))).toBe(true);
    expect(expanding.some(({ contentColor }) => isPartlyFaded(contentColor))).toBe(true);
  });

  test("dragging is untouched", async () => {
    await commands.emulateReducedMotion("reduce");
    await render(sidebarLayout('size="300px"'));

    await press(separator("handle"));
    await moveBy(50);
    const samples = await sampleFrames(() => width(panel("sidebar")), 3);
    await release();

    for (const sample of samples) expect(sample).toBeCloseTo(350, 0);
  });
});

describe("shrinking group", () => {
  const threeSidebars = layout(`
    <bento-panel id="start" size="300px" min="200px" collapsible></bento-panel>
    <bento-separator id="start-handle"></bento-separator>
    <bento-panel id="main" min="300px"></bento-panel>
    <bento-separator id="end-handle"></bento-separator>
    <bento-panel id="end" size="300px" min="200px" collapsible></bento-panel>`);

  test("collapses panels from the end and re-expands them when space returns, unanimated", async () => {
    await render(threeSidebars);

    group("layout").style.width = "600px";
    await expect.poll(() => panel("end").collapsed).toBe(true);
    expect(panel("start").collapsed).toBe(false);
    const collapsing = [endWidth(), ...(await sampleFrames(endWidth))];

    group("layout").style.width = "1000px";
    await expect.poll(() => panel("end").collapsed).toBe(false);
    const expanding = [endWidth(), ...(await sampleFrames(endWidth))];

    for (const sample of collapsing) expect(sample).toBeCloseTo(0, 0);
    for (const sample of expanding) expect(sample).toBeCloseTo(300, 0);
  });

  test("an expanded panel moves to the front; earlier panels group-collapse for it", async () => {
    await render(threeSidebars);
    group("layout").style.width = "700px";
    await expect.poll(() => panel("end").collapsed).toBe(true);
    const startEvents = recordEvents(panel("start"), ["beforetoggle", "toggle"]);
    const endEvents = recordEvents(panel("end"), ["beforetoggle", "toggle"]);

    panel("end").collapsed = false;

    await expect.poll(() => panel("start").collapsed).toBe(true);
    expect(panel("end").collapsed).toBe(false);
    await settleAt(() => width(panel("end")), 300);
    expect(toggleStates(startEvents)).toEqual(["beforetoggle open→closed", "toggle open→closed"]);
    expect(endEvents).toEqual([]);
  });

  test("the panel whose toggle caused a change times it, not the first that changes", async () => {
    await render(`
      <style>#start { transition-duration: 0s } #end { transition-duration: 600ms }</style>
      ${threeSidebars}`);
    group("layout").style.width = "700px";
    await expect.poll(() => panel("end").collapsed).toBe(true);
    await activateUser();

    panel("end").collapsed = false;
    const startWidths = await sampleUntilAt(() => width(panel("start")), 0);

    expect(startWidths.some((sample) => isBetween(sample, 300, 0))).toBe(true);
  });

  test("a collapse by the user stays when space returns", async () => {
    await render(threeSidebars);
    await pressKeys(separator("end-handle"), "{Enter}");
    expect(panel("end").collapsed).toBe(true);

    group("layout").style.width = "600px";
    await frames(5);
    group("layout").style.width = "1000px";
    await frames(5);

    expect(panel("end").collapsed).toBe(true);
    expect(width(panel("end"))).toBeCloseTo(0, 0);
  });
});
