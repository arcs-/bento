import { describe, expect, test } from "vitest";
import { commands, page, userEvent } from "vitest/browser";
import {
  drag,
  frames,
  group,
  layout,
  mount,
  moveBy,
  panel,
  panelEventTypes,
  parse,
  press,
  pressKeys,
  recordEvents,
  release,
  render,
  separator,
  settleAt,
  sidebarLayout,
  toggleStates,
  width,
} from "./fixtures.ts";

/** Counts frames from now on, so events can be stamped with the frame they fired in. */
function startFrameCounter(): { current: () => number; stop: () => void } {
  let frame = 0;
  let running = true;
  const count = () => {
    frame += 1;
    if (running) requestAnimationFrame(count);
  };
  requestAnimationFrame(count);
  return {
    current: () => frame,
    stop: () => {
      running = false;
    },
  };
}

describe("resize and resizeend", () => {
  test("resize fires at most once per frame during a drag, resizeend once on release", async () => {
    await render(sidebarLayout('size="300px"'));
    const sidebar = panel("sidebar");
    const frameCounter = startFrameCounter();
    const resizeFrames: number[] = [];
    let resizeEndCount = 0;
    sidebar.addEventListener("resize", () => resizeFrames.push(frameCounter.current()));
    sidebar.addEventListener("resizeend", () => (resizeEndCount += 1));

    await press(separator("handle"));
    await commands.pointerMove(200, 0, 40);
    await frames(3);
    expect(resizeEndCount).toBe(0);
    await release();
    frameCounter.stop();

    expect(resizeFrames.length).toBeGreaterThan(0);
    expect(new Set(resizeFrames).size).toBe(resizeFrames.length);
    await expect.poll(() => resizeEndCount).toBe(1);
  });

  test("a key press fires resize, and resizeend on key up", async () => {
    await render(sidebarLayout('size="300px"'));
    const recorded = recordEvents(panel("sidebar"), ["resize", "resizeend"]);

    await pressKeys(separator("handle"), "{ArrowRight>}");
    await frames(3);
    expect(recorded.map((event) => event.type)).toEqual(["resize"]);

    await userEvent.keyboard("{/ArrowRight}");
    await frames(3);
    expect(recorded.map((event) => event.type)).toEqual(["resize", "resizeend"]);
  });

  test("resize fires on panels the drag pushes, not on one that only fills", async () => {
    await render(
      layout(`
        <bento-panel id="first" size="300px"></bento-panel>
        <bento-separator id="first-handle"></bento-separator>
        <bento-panel id="middle" min="200px"></bento-panel>
        <bento-separator id="second-handle"></bento-separator>
        <bento-panel id="last" size="300px" min="100px"></bento-panel>`),
    );
    const resized = new Set<string>();
    for (const id of ["first", "middle", "last"]) {
      panel(id).addEventListener("resize", () => resized.add(id));
    }

    await drag(separator("first-handle"), 400);

    expect(resized).toEqual(new Set(["first", "last"]));
  });

  test("no event fires for the first layout, the initial modal mode or a group resize", async () => {
    await page.viewport(600, 600);
    const container = parse(`
      ${sidebarLayout('size="25%" collapsible')}
      <bento-group style="width: 100%; height: 100px">
        <bento-panel id="drawer" size="200px" collapsible modal="(max-width: 700px)"></bento-panel>
        <bento-separator></bento-separator>
        <bento-panel></bento-panel>
      </bento-group>`);
    const recorded = recordEvents(container, panelEventTypes, { capture: true });

    mount(container);
    await frames(5);
    expect(panel("drawer").collapsed).toBe(true);
    group("layout").style.width = "800px";
    await frames(5);

    expect(recorded).toEqual([]);
  });
});

describe("propagation", () => {
  test("no event bubbles; the capture phase on a parent hears them", async () => {
    await render(sidebarLayout('size="300px" collapsible'));
    const bubbling = [
      ...recordEvents(group("layout"), panelEventTypes),
      ...recordEvents(document, panelEventTypes),
      ...recordEvents(window, panelEventTypes),
    ];
    const captured = recordEvents(group("layout"), panelEventTypes, { capture: true });

    await drag(separator("handle"), 50);
    await pressKeys(separator("handle"), "{Enter}");
    await settleAt(() => width(panel("sidebar")), 0);

    expect(bubbling).toEqual([]);
    expect(new Set(captured.map((event) => event.type))).toEqual(new Set(panelEventTypes));
    for (const event of captured) {
      expect(event.bubbles).toBe(false);
      expect(event.target).toBe(panel("sidebar"));
    }
  });

  test("no event fires when the app writes a property", async () => {
    await render(sidebarLayout('size="300px" collapsible'));
    const sidebar = panel("sidebar");
    const recorded = recordEvents(sidebar, panelEventTypes);

    sidebar.size = "400px";
    await settleAt(() => width(sidebar), 400);
    sidebar.collapsed = true;
    await settleAt(() => width(sidebar), 0);
    sidebar.collapsed = false;
    await settleAt(() => width(sidebar), 400);

    expect(recorded).toEqual([]);
  });
});

describe("beforetoggle and toggle", () => {
  test("a user collapse fires a cancelable beforetoggle before and a toggle after", async () => {
    await render(sidebarLayout('size="300px" collapsible'));
    const sidebar = panel("sidebar");
    const collapsedWhenFired: boolean[] = [];
    const recorded = recordEvents(sidebar, ["beforetoggle", "toggle"]);
    for (const type of ["beforetoggle", "toggle"] as const) {
      sidebar.addEventListener(type, () => collapsedWhenFired.push(sidebar.collapsed));
    }

    await pressKeys(separator("handle"), "{Enter}");
    await expect.poll(() => recorded.length).toBe(2);
    await pressKeys(separator("handle"), "{Enter}");
    await expect.poll(() => recorded.length).toBe(4);

    for (const event of recorded) expect(event).toBeInstanceOf(ToggleEvent);
    expect(toggleStates(recorded)).toEqual([
      "beforetoggle open→closed cancelable",
      "toggle open→closed",
      "beforetoggle closed→open cancelable",
      "toggle closed→open",
    ]);
    expect(collapsedWhenFired).toEqual([false, true, true, false]);
  });

  test("canceling beforetoggle keeps the panel as it is", async () => {
    await render(sidebarLayout('size="300px" collapsible'));
    const sidebar = panel("sidebar");
    sidebar.addEventListener("beforetoggle", (event) => event.preventDefault());
    const toggles = recordEvents(sidebar, ["toggle"]);

    await pressKeys(separator("handle"), "{Enter}");
    await frames(10);

    expect(sidebar.collapsed).toBe(false);
    expect(width(sidebar)).toBeCloseTo(300, 0);
    expect(toggles).toEqual([]);
  });

  test("canceling a snap holds the panel at min, one beforetoggle per crossing", async () => {
    await render(sidebarLayout('size="300px" min="200px" collapsible'));
    const sidebar = panel("sidebar");
    const beforeToggles = recordEvents(sidebar, ["beforetoggle"]);
    sidebar.addEventListener("beforetoggle", (event) => event.preventDefault());

    await press(separator("handle"));
    await moveBy(-250);
    await frames(5);
    expect(sidebar.collapsed).toBe(false);
    expect(width(sidebar)).toBeCloseTo(200, 0);
    await release();

    expect(toggleStates(beforeToggles)).toEqual(["beforetoggle open→closed cancelable"]);
  });

  test("a collapse the user did not ask for fires a beforetoggle that cannot be canceled", async () => {
    await render(sidebarLayout('size="300px" min="200px" collapsible'));
    const sidebar = panel("sidebar");
    const recorded = recordEvents(sidebar, ["beforetoggle", "toggle"]);
    sidebar.addEventListener("beforetoggle", (event) => event.preventDefault());

    group("layout").style.width = "150px";
    await expect.poll(() => recorded.length).toBe(2);

    expect(sidebar.collapsed).toBe(true);
    expect(toggleStates(recorded)).toEqual(["beforetoggle open→closed", "toggle open→closed"]);
  });
});
