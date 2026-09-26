import { describe, expect, test } from "vitest";
import { commands } from "vitest/browser";
import {
  activateUser,
  animationsDone,
  block,
  colorAtCenterOf,
  doubleClick,
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
  recordErrors,
  recordEvents,
  release,
  render,
  sampleFrames,
  sampleUntil,
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
const startWidth = () => width(panel("start"));

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
        #sidebar { transition-duration: 1200ms; transition-timing-function: linear }
        #sidebar.instant { transition-duration: 0s }
      </style>
      ${sidebarLayout('size="300px" collapsible')}`);
    const timeline: { elapsed: number; sidebarWidth: number }[] = [];

    await pressKeys(separator("handle"), "{Enter}");
    await sampleUntilAt(() => {
      const sidebarWidth = measureSidebar();
      timeline.push({ elapsed: performance.now(), sidebarWidth });
      return sidebarWidth;
    }, 0);

    /** Speeds between samples, relative to each other, so a slow machine only adds samples. */
    const moving = timeline.filter(({ sidebarWidth }) => isBetween(sidebarWidth, 300, 0));
    const first = moving[0];
    const last = moving.at(-1);
    if (!first || !last) throw new Error("the toggle never moved");
    const speed = (first.sidebarWidth - last.sidebarWidth) / (last.elapsed - first.elapsed);
    expect(speed).toBeGreaterThan(300 / 1200 / 1.4);
    expect(speed).toBeLessThan((300 / 1200) * 1.4);
    const midpoint = (first.elapsed + last.elapsed) / 2;
    const middle = moving.reduce((nearest, sample) =>
      Math.abs(sample.elapsed - midpoint) < Math.abs(nearest.elapsed - midpoint) ? sample : nearest,
    );
    const linearAtMiddle = first.sidebarWidth - speed * (middle.elapsed - first.elapsed);
    expect(Math.abs(middle.sidebarWidth - linearAtMiddle)).toBeLessThan(30);

    panel("sidebar").classList.add("instant");
    await pressKeys(separator("handle"), "{Enter}");
    for (const sample of await sampleFrames(measureSidebar)) expect(sample).toBeCloseTo(300, 0);
  });

  test("toggling back mid-way reverses from where the size is, without a jump", async () => {
    await render(`
      <style>#sidebar { transition-duration: 1200ms; transition-timing-function: linear }</style>
      ${sidebarLayout('size="300px" collapsible')}`);

    await pressKeys(separator("handle"), "{Enter}");
    const collapsing = await sampleUntil(measureSidebar, (sample) => sample < 180);
    const reversedAt = collapsing.at(-1) ?? 0;
    await pressKeys(separator("handle"), "{Enter}");
    const expanding = await sampleUntilAt(measureSidebar, 300);

    for (const sample of expanding) expect(sample).toBeGreaterThan(reversedAt - 40);
    expect(expanding.some((sample) => isBetween(sample, reversedAt, 300))).toBe(true);
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

  test("while collapsing, its content keeps its start size; the neighbour's reflows live", async () => {
    await render(sidebarLayout('size="300px" collapsible'));
    const contentWidths: number[] = [];
    const mainTracking: { panel: number; content: number }[] = [];

    await pressKeys(separator("handle"), "{Enter}");
    await sampleUntilAt(() => {
      const currentWidth = measureSidebar();
      if (currentWidth > 1) contentWidths.push(width(block("sidebar-content")));
      mainTracking.push({ panel: width(panel("main")), content: width(block("main-content")) });
      return currentWidth;
    }, 0);

    for (const contentWidth of contentWidths) expect(contentWidth).toBeCloseTo(300, 0);
    for (const { panel: mainWidth, content } of mainTracking) {
      expect(content).toBeCloseTo(mainWidth, 0);
    }
    expect(contentWidths.some((contentWidth) => contentWidth > 1)).toBe(true);
  });

  test("a group nested in a neighbour that reflows relayouts every frame, unanimated", async () => {
    await render(`
      <style>#sidebar { transition-duration: 600ms }</style>
      ${layout(`
        <bento-panel id="sidebar" size="300px" collapsible></bento-panel>
        <bento-separator id="handle"></bento-separator>
        <bento-panel id="main">
          <bento-group id="inner" style="height: 100px">
            <bento-panel id="inner-first"></bento-panel>
            <bento-separator id="inner-handle"></bento-separator>
            <bento-panel id="inner-second" size="200px" collapsible></bento-panel>
          </bento-group>
        </bento-panel>`)}`);
    const errors = recordErrors();
    const innerPanels = [panel("inner-first"), panel("inner-second")];
    const innerFills: { main: number; inner: number }[] = [];

    await pressKeys(separator("handle"), "{Enter}");
    await sampleUntilAt(() => {
      const [first, second] = innerPanels.map(width);
      innerFills.push({
        main: width(panel("main")),
        inner: (first ?? 0) + width(separator("inner-handle")) + (second ?? 0),
      });
      expect(innerPanels.flatMap((innerPanel) => innerPanel.getAnimations())).toEqual([]);
      return measureSidebar();
    }, 0);

    const moving = innerFills.filter(({ main }) => isBetween(main, 699, 999));
    expect(moving.length).toBeGreaterThan(0);
    for (const { main, inner } of moving) expect(inner).toBeCloseTo(main, 0);
    expect(width(panel("inner-second"))).toBeCloseTo(200, 0);
    expect(errors()).toEqual([]);
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

/** Every frame moves on from the one before, and the end is reached only through the middle. */
function expectSmooth(samples: readonly number[], from: number, to: number): void {
  const direction = Math.sign(to - from);
  samples.forEach((sample, index) => {
    const previous = samples[index - 1] ?? from;
    expect((sample - previous) * direction).toBeGreaterThanOrEqual(-0.5);
  });
  const firstAtEnd = samples.findIndex((sample) => isAt(sample, to));
  expect(samples.slice(0, firstAtEnd).some((sample) => isBetween(sample, from, to))).toBe(true);
}

describe("a panel holding a nested group", () => {
  const withNestedGroup = sidebarLayout('size="300px" min="150px" collapsible').replace(
    '<div id="sidebar-content" style="height: 100px; background: rgb(0, 0, 255)"></div>',
    `<bento-group orientation="vertical">
      <bento-panel id="nested-top"></bento-panel>
      <bento-separator></bento-separator>
      <bento-panel id="nested-bottom" size="40%" min="56px" collapsible></bento-panel>
    </bento-group>`,
  );

  test("opens and closes frame by frame, never showing its end size first", async () => {
    await render(`<style>#sidebar { transition-duration: 500ms }</style>${withNestedGroup}`);
    await activateUser();
    const sidebar = panel("sidebar");

    sidebar.collapsed = true;
    expectSmooth(await sampleUntilAt(measureSidebar, 0), 300, 0);
    sidebar.collapsed = false;
    expectSmooth(await sampleUntilAt(measureSidebar, 300), 0, 300);
    await pressKeys(separator("handle"), "{Enter}");
    expectSmooth(await sampleUntilAt(measureSidebar, 0), 300, 0);
    await pressKeys(separator("handle"), "{Enter}");
    expectSmooth(await sampleUntilAt(measureSidebar, 300), 0, 300);
    expect(sidebar.collapsed).toBe(false);
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
    const deadline = performance.now() + 8000;
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
    await render(sidebarLayout('size="300px" collapsible style="transition-duration: 2s"'));

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

  test("the app writing collapsed on a panel the group collapsed makes the collapse its own", async () => {
    await render(threeSidebars);
    group("layout").style.width = "600px";
    await expect.poll(() => panel("end").collapsed).toBe(true);

    panel("end").collapsed = true;
    await frames();
    group("layout").style.width = "1000px";
    await frames(5);
    await animationsDone();

    expect(panel("end").collapsed).toBe(true);
    expect(width(panel("end"))).toBeCloseTo(0, 0);
  });

  test("a double-click resetting a group-collapsed panel to its collapsed start keeps it collapsed", async () => {
    await render(threeSidebars.replace('id="start"', 'id="start" collapsed'));
    await pressKeys(separator("start-handle"), "{Enter}");
    await settleAt(startWidth, 300);
    await pressKeys(separator("end-handle"), "{Enter}");
    await pressKeys(separator("end-handle"), "{Enter}");
    await settleAt(endWidth, 300);
    group("layout").style.width = "700px";
    await expect.poll(() => panel("start").collapsed).toBe(true);

    await doubleClick(separator("start-handle"));
    group("layout").style.width = "1000px";
    await frames(5);
    await animationsDone();

    expect(panel("start").collapsed).toBe(true);
    expect(startWidth()).toBeCloseTo(0, 0);
  });

  test("an attribute change that collapses its own panel fires nothing on it", async () => {
    await render(threeSidebars);
    const endEvents = recordEvents(panel("end"), ["beforetoggle", "toggle"]);

    panel("end").setAttribute("min", "500px");

    await expect.poll(() => panel("end").collapsed).toBe(true);
    await frames(3);
    expect(endEvents).toEqual([]);
  });
});
