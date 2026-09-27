import { describe, expect, test } from "vitest";
import { commands } from "vitest/browser";
import {
  drag,
  frames,
  group,
  groupSize,
  height,
  isBetween,
  layout,
  moveBy,
  panel,
  pixels,
  press,
  pressKeys,
  recordEvents,
  release,
  removeRendered,
  render,
  sampleFrames,
  sampleUntilAt,
  separator,
  settleAt,
  sidebarLayout,
  toggleStates,
  width,
} from "./fixtures.ts";

/** Parses a live `size` such as `"31.5%"` into its percentage. */
function percent(size: string): number {
  if (!size.endsWith("%")) throw new Error(`expected a % size, got "${size}"`);
  return Number.parseFloat(size);
}

/** Writes a panel's size back on every `resize`, as a controlled React component does. */
function echo(target: HTMLElementTagNameMap["bento-panel"]): void {
  target.addEventListener("resize", () => {
    const { size } = target;
    target.size = size;
  });
}

describe("drag", () => {
  test("resizes the primary panel and writes px to its live size", async () => {
    await render(sidebarLayout('size="300px"'));

    await drag(separator("handle"), 50);

    expect(width(panel("sidebar"))).toBeCloseTo(350, 0);
    expect(pixels(panel("sidebar").size)).toBeCloseTo(350, 0);
    expect(panel("main").size).toBe("");
  });

  test("writes live sizes rounded to 0.01 of their unit, free of float noise", async () => {
    await render(sidebarLayout('size="26.3%"'));
    await drag(separator("handle"), 7);
    expect(panel("sidebar").size).toMatch(/^\d+(\.\d{1,2})?%$/);

    removeRendered();
    await render(sidebarLayout('size="263.3px"'));
    await drag(separator("handle"), 7.3);
    expect(panel("sidebar").size).toMatch(/^\d+(\.\d{1,2})?px$/);
  });

  test("follows the pointer frame by frame, never animated", async () => {
    await render(sidebarLayout('size="300px"'));
    const sidebar = panel("sidebar");

    await press(separator("handle"));
    for (const expected of [320, 340, 360]) {
      await moveBy(20);
      const samples = await sampleFrames(() => width(sidebar), 3);
      for (const sample of samples) expect(sample).toBeCloseTo(expected, 0);
    }
    await release();
  });

  test("min and max clamp it", async () => {
    await render(sidebarLayout('size="300px" min="200px" max="500px"'));
    const sidebar = panel("sidebar");

    await press(separator("handle"));
    await moveBy(300);
    expect(width(sidebar)).toBeCloseTo(500, 0);
    await moveBy(-600);
    expect(width(sidebar)).toBeCloseTo(200, 0);
    await release();

    expect(pixels(sidebar.size)).toBeCloseTo(200, 0);
    expect(sidebar.collapsed).toBe(false);
  });

  test("the later neighbour with a size is primary", async () => {
    await render(
      layout(`
        <bento-panel id="main" min="100px" max="800px"></bento-panel>
        <bento-separator id="handle"></bento-separator>
        <bento-panel id="aside" size="300px" min="200px" max="500px"></bento-panel>`),
    );
    const aside = panel("aside");

    await drag(separator("handle"), -100);
    expect(width(aside)).toBeCloseTo(400, 0);
    expect(pixels(aside.size)).toBeCloseTo(400, 0);
    expect(panel("main").size).toBe("");

    await pressKeys(separator("handle"), "{Home}");
    expect(width(aside)).toBeCloseTo(200, 0);
    await pressKeys(separator("handle"), "{End}");
    expect(width(aside)).toBeCloseTo(500, 0);
  });

  test("between two flexible panels the earlier gets a % share, the later stays flexible", async () => {
    await render(
      layout(`
        <bento-panel id="first"></bento-panel>
        <bento-separator id="handle"></bento-separator>
        <bento-panel id="second"></bento-panel>`),
    );
    const space = groupSize.width - width(separator("handle"));
    const startWidth = width(panel("first"));

    await drag(separator("handle"), 100);

    expect(width(panel("first"))).toBeCloseTo(startWidth + 100, 0);
    expect(percent(panel("first").size)).toBeCloseTo(((startWidth + 100) / space) * 100, 1);
    expect(panel("second").size).toBe("");
  });

  test("only the two neighbours change; other flexible panels keep their share as %", async () => {
    await render(
      layout(`
        <bento-panel id="one"></bento-panel>
        <bento-separator id="first-handle"></bento-separator>
        <bento-panel id="two"></bento-panel>
        <bento-separator id="second-handle"></bento-separator>
        <bento-panel id="three"></bento-panel>`),
    );
    const separators = width(separator("first-handle")) + width(separator("second-handle"));
    const [oneWidth, twoWidth] = ["one", "two"].map((id) => width(panel(id)));

    await drag(separator("second-handle"), -100);

    expect(width(panel("one"))).toBeCloseTo(oneWidth ?? 0, 0);
    expect(width(panel("two"))).toBeCloseTo((twoWidth ?? 0) - 100, 0);
    expect(panel("one").size).toMatch(/%$/);
    expect(panel("two").size).toMatch(/%$/);
    expect(panel("three").size).toBe("");

    const [oneShare, twoShare] = ["one", "two"].map((id) => percent(panel(id).size) / 100);
    group("layout").style.width = "800px";
    await sampleUntilAt(() => width(panel("one")), (800 - separators) * (oneShare ?? 0));
    expect(width(panel("two"))).toBeCloseTo((800 - separators) * (twoShare ?? 0), 0);
  });

  test("a px sidebar stays px; of the flexible panels beyond, only its neighbour changes", async () => {
    await render(
      layout(`
        <bento-panel id="sidebar" size="200px"></bento-panel>
        <bento-separator id="handle"></bento-separator>
        <bento-panel id="main"></bento-panel>
        <bento-separator></bento-separator>
        <bento-panel id="aside"></bento-panel>`),
    );
    const asideWidth = width(panel("aside"));

    await drag(separator("handle"), 50);

    expect(panel("sidebar").size).toBe("250px");
    expect(panel("main").size).toBe("");
    expect(width(panel("aside"))).toBeCloseTo(asideWidth, 0);
  });

  test("a % size saved on resizeend and rendered back as the attribute round-trips", async () => {
    await render(
      layout(`
        <bento-panel id="first"></bento-panel>
        <bento-separator id="handle"></bento-separator>
        <bento-panel id="second"></bento-panel>`),
    );
    let saved = "";
    panel("first").addEventListener("resizeend", () => (saved = panel("first").size));
    await drag(separator("handle"), 123);
    const draggedWidth = width(panel("first"));
    removeRendered();

    await render(
      layout(`
        <bento-panel id="first" size="${saved}"></bento-panel>
        <bento-separator id="handle"></bento-separator>
        <bento-panel id="second"></bento-panel>`),
    );

    expect(saved).toMatch(/%$/);
    expect(panel("first").size).toBe(saved);
    expect(width(panel("first"))).toBeCloseTo(draggedWidth, 0);
  });

  test("with two sized panels the separator lands where the pointer does", async () => {
    await render(
      layout(`
        <bento-panel id="first" size="200px"></bento-panel>
        <bento-separator id="handle"></bento-separator>
        <bento-panel id="last" size="300px"></bento-panel>`),
    );
    const handle = separator("handle");
    const startPosition = handle.getBoundingClientRect().left;

    await drag(handle, 50);

    expect(handle.getBoundingClientRect().left).toBeCloseTo(startPosition + 50, 0);
    expect(width(panel("first"))).toBeCloseTo(250, 0);
  });

  test("pushes further panels down to their min and keeps one panel flexible", async () => {
    await render(
      layout(`
        <bento-panel id="first" size="300px"></bento-panel>
        <bento-separator id="first-handle"></bento-separator>
        <bento-panel id="middle" min="200px"></bento-panel>
        <bento-separator id="second-handle"></bento-separator>
        <bento-panel id="last" size="300px" min="100px"></bento-panel>`),
    );
    const separatorsWidth = width(separator("first-handle")) + width(separator("second-handle"));
    const middle = panel("middle");
    const last = panel("last");

    await press(separator("first-handle"));
    await moveBy(300);
    expect(width(panel("first"))).toBeCloseTo(600, 0);
    expect(width(middle)).toBeCloseTo(200, 0);
    expect(width(last)).toBeCloseTo(groupSize.width - 800 - separatorsWidth, 0);

    await moveBy(200);
    expect(width(panel("first"))).toBeCloseTo(groupSize.width - 300 - separatorsWidth, 0);
    expect(width(middle)).toBeCloseTo(200, 0);
    expect(width(last)).toBeCloseTo(100, 0);
    await release();

    expect(middle.size).toBe("");
  });

  test("follows the writing direction in right-to-left", async () => {
    await render(sidebarLayout('size="300px"', 'dir="rtl"'));
    const sidebar = panel("sidebar");
    expect(sidebar.getBoundingClientRect().right).toBeCloseTo(
      group("layout").getBoundingClientRect().right,
      0,
    );

    await drag(separator("handle"), -50);

    expect(width(sidebar)).toBeCloseTo(350, 0);
  });
});

/**
 * Panels a drag of `#push-handle` pushes: `#near`, then collapsible `#middle` and `#far`, all
 * 200px with a min of 100px; `#main` is on the other side. `reversed` puts them after the
 * separator instead, so the drag towards the end pushes them.
 */
function pushedPanels({ reversed = false, groupAttributes = "" } = {}): string {
  const pushed = [
    '<bento-panel id="far" size="200px" min="100px" collapsible></bento-panel>',
    '<bento-panel id="middle" size="200px" min="100px" collapsible></bento-panel>',
    '<bento-panel id="near" size="200px" min="100px"></bento-panel>',
  ];
  const sides = [
    (reversed ? pushed.toReversed() : pushed).join("<bento-separator></bento-separator>"),
    '<bento-panel id="main"></bento-panel>',
  ];
  return layout(
    (reversed ? sides.toReversed() : sides).join(
      '<bento-separator id="push-handle"></bento-separator>',
    ),
    groupAttributes,
  );
}

const collapsedStates = () => ["middle", "far"].map((id) => panel(id).collapsed);

describe("collapse on push", () => {
  test("pushed panels at min collapse past halfway, nearest first, and stay collapsed", async () => {
    await render(pushedPanels());
    const middleEvents = recordEvents(panel("middle"), ["beforetoggle", "toggle"]);

    await press(separator("push-handle"));
    await moveBy(-240);
    expect(width(panel("near"))).toBeCloseTo(100, 0);
    expect(width(panel("middle"))).toBeCloseTo(100, 0);
    expect(collapsedStates()).toEqual([false, false]);
    await moveBy(-20);
    expect(collapsedStates()).toEqual([true, false]);
    await moveBy(-200);
    expect(collapsedStates()).toEqual([true, true]);
    await release();

    expect(toggleStates(middleEvents)).toEqual([
      "beforetoggle open→closed cancelable",
      "toggle open→closed",
    ]);
    group("layout").style.width = "1200px";
    await frames(5);
    expect(collapsedStates()).toEqual([true, true]);
  });

  test("dragging back expands them again, in reverse order", async () => {
    await render(pushedPanels());

    await press(separator("push-handle"));
    await moveBy(-460);
    expect(collapsedStates()).toEqual([true, true]);
    await moveBy(20);
    expect(collapsedStates()).toEqual([true, false]);
    await moveBy(200);
    expect(collapsedStates()).toEqual([false, false]);
    await moveBy(240);
    await release();

    for (const id of ["near", "middle", "far"]) expect(width(panel(id))).toBeCloseTo(200, 0);
  });

  test("a veto holds a pushed panel at min, and the drag pushes past it", async () => {
    await render(pushedPanels());
    panel("middle").addEventListener("beforetoggle", (event) => event.preventDefault());

    await press(separator("push-handle"));
    await moveBy(-300);
    expect(width(panel("middle"))).toBeCloseTo(100, 0);
    expect(width(panel("far"))).toBeCloseTo(100, 0);
    await moveBy(-200);
    await release();

    expect(collapsedStates()).toEqual([false, true]);
    expect(width(panel("middle"))).toBeCloseTo(100, 0);
  });

  test("a panel that is not collapsible stops at its min", async () => {
    await render(pushedPanels().replaceAll(" collapsible", ""));

    await drag(separator("push-handle"), -600);

    for (const id of ["near", "middle", "far"]) expect(width(panel(id))).toBeCloseTo(100, 0);
  });

  test("arrow keys collapse a pushed panel as soon as it would go below min", async () => {
    await render(pushedPanels());
    await drag(separator("push-handle"), -195);
    expect(width(panel("middle"))).toBeCloseTo(105, 0);

    await pressKeys(separator("push-handle"), "{ArrowLeft}");

    expect(collapsedStates()).toEqual([true, false]);
  });

  test("the same works towards the end, and in right-to-left", async () => {
    await render(pushedPanels({ reversed: true }));
    await press(separator("push-handle"));
    await moveBy(260);
    expect(collapsedStates()).toEqual([true, false]);
    await release();
    removeRendered();

    await render(pushedPanels({ groupAttributes: 'dir="rtl"' }));
    await press(separator("push-handle"));
    await moveBy(260);
    expect(collapsedStates()).toEqual([true, false]);
    await release();
  });
});

describe("collapse by drag", () => {
  test("holds at min, snaps past halfway to collapsed-size and back", async () => {
    await render(sidebarLayout('size="300px" min="200px" collapsible'));
    const sidebar = panel("sidebar");

    await press(separator("handle"));
    await moveBy(-150);
    expect(width(sidebar)).toBeCloseTo(200, 0);
    expect(sidebar.collapsed).toBe(false);

    await moveBy(-60);
    expect(sidebar.collapsed).toBe(true);
    await settleAt(() => width(sidebar), 0);

    await moveBy(30);
    expect(sidebar.collapsed).toBe(false);
    await settleAt(() => width(sidebar), 200);
    await release();
  });

  test("snaps to a rail at its collapsed-size", async () => {
    await render(sidebarLayout('size="300px" min="200px" collapsed-size="48px" collapsible'));
    const sidebar = panel("sidebar");

    await press(separator("handle"));
    await moveBy(-190);
    await release();

    expect(sidebar.collapsed).toBe(true);
    await settleAt(() => width(sidebar), 48);
  });
});

describe("an app echoing sizes back on resize, as a controlled React component does", () => {
  test("keeps the hold at min and the snap past halfway", async () => {
    await render(sidebarLayout('size="300px" min="200px" collapsible'));
    const sidebar = panel("sidebar");
    echo(sidebar);

    await press(separator("handle"));
    await moveBy(-150);
    expect(width(sidebar)).toBeCloseTo(200, 0);
    await moveBy(-60);
    expect(sidebar.collapsed).toBe(true);
    await moveBy(30);
    expect(sidebar.collapsed).toBe(false);
    await settleAt(() => width(sidebar), 200);
    await release();
  });

  test("keeps the push-back: dragging back restores a pushed panel", async () => {
    await render(
      layout(`
        <bento-panel id="first" size="300px"></bento-panel>
        <bento-separator id="first-handle"></bento-separator>
        <bento-panel id="middle" min="200px"></bento-panel>
        <bento-separator id="second-handle"></bento-separator>
        <bento-panel id="last" size="300px" min="100px"></bento-panel>`),
    );
    for (const id of ["first", "middle", "last"]) echo(panel(id));

    await press(separator("first-handle"));
    await moveBy(400);
    expect(width(panel("last"))).toBeCloseTo(100, 0);
    await moveBy(-400);
    await release();

    expect(width(panel("last"))).toBeCloseTo(300, 0);
    expect(width(panel("first"))).toBeCloseTo(300, 0);
  });
});

/**
 * On the first `resize`, writes the size the panel had before the drag back, a task later, as
 * a controlled component lagging behind does; after that it stays out of the way.
 */
function echoOlderOnce(target: HTMLElementTagNameMap["bento-panel"]): void {
  const older = target.size;
  target.addEventListener(
    "resize",
    () => {
      setTimeout(() => {
        target.size = older;
      });
    },
    { once: true },
  );
}

describe("an app writing an older size back during the drag", () => {
  test("keeps the snap past halfway, measured from where the drag started", async () => {
    await render(sidebarLayout('size="300px" min="200px" collapsible'));
    const sidebar = panel("sidebar");
    echoOlderOnce(sidebar);

    await press(separator("handle"));
    await moveBy(-50);
    await frames(2);
    await moveBy(-160);
    expect(sidebar.collapsed).toBe(true);
    await release();
  });

  test("keeps the push-back: dragging back to the start restores every panel", async () => {
    await render(
      layout(`
        <bento-panel id="first" size="300px"></bento-panel>
        <bento-separator id="first-handle"></bento-separator>
        <bento-panel id="middle" min="200px"></bento-panel>
        <bento-separator id="second-handle"></bento-separator>
        <bento-panel id="last" size="300px" min="100px"></bento-panel>`),
    );
    for (const id of ["first", "last"]) echoOlderOnce(panel(id));

    await press(separator("first-handle"));
    await moveBy(400);
    await frames(2);
    await moveBy(-400);
    await release();

    expect(width(panel("first"))).toBeCloseTo(300, 0);
    expect(width(panel("last"))).toBeCloseTo(300, 0);
  });
});

describe("a group-collapsed panel opened by a drag", () => {
  test("opens as the user's expand: a cancelable beforetoggle, then to the front", async () => {
    await render(
      layout(`
        <bento-panel id="start" size="300px" min="200px" collapsible></bento-panel>
        <bento-separator></bento-separator>
        <bento-panel id="main" min="300px"></bento-panel>
        <bento-separator id="end-handle"></bento-separator>
        <bento-panel id="end" size="300px" min="200px" collapsible></bento-panel>`),
    );
    group("layout").style.width = "650px";
    await expect.poll(() => panel("end").collapsed).toBe(true);
    const recorded = recordEvents(panel("end"), ["beforetoggle", "toggle"]);

    await drag(separator("end-handle"), -250);

    expect(toggleStates(recorded)).toEqual([
      "beforetoggle closed→open cancelable",
      "toggle closed→open",
    ]);
    expect(panel("end").collapsed).toBe(false);
    expect(panel("start").collapsed).toBe(true);
  });
});

describe("a vertical group", () => {
  test("snaps and animates on the block axis", async () => {
    await render(sidebarLayout('size="100px" min="60px" collapsible', 'orientation="vertical"'));
    const sidebar = panel("sidebar");

    await press(separator("handle"));
    await commands.pointerMove(0, -80, 5);
    const snapping = await sampleUntilAt(() => height(sidebar), 0);
    await release();

    expect(sidebar.collapsed).toBe(true);
    expect(snapping.some((sample) => isBetween(sample, 60, 0))).toBe(true);
  });
});

describe("panels that disappear mid-drag", () => {
  test("throw nothing, and the drag ends cleanly", async () => {
    await render(
      layout(`
        <bento-panel id="sidebar" size="300px"></bento-panel>
        <bento-separator id="handle"></bento-separator>
        <bento-panel id="main"></bento-panel>
        <bento-separator id="aside-handle"></bento-separator>
        <bento-panel id="aside" size="200px"></bento-panel>`),
    );
    const errors: unknown[] = [];
    const recordError = (event: ErrorEvent | PromiseRejectionEvent) =>
      errors.push("error" in event ? event.error : event.reason);
    window.addEventListener("error", recordError);
    window.addEventListener("unhandledrejection", recordError);
    const handle = separator("handle");

    await press(handle);
    await moveBy(50);
    panel("sidebar").remove();
    await moveBy(50);
    await release();
    handle.remove();

    window.removeEventListener("error", recordError);
    window.removeEventListener("unhandledrejection", recordError);
    expect(errors).toEqual([]);
    const main = panel("main");
    expect(width(main) + width(separator("aside-handle")) + width(panel("aside"))).toBeCloseTo(
      groupSize.width,
      0,
    );

    await drag(separator("aside-handle"), -50);
    expect(width(panel("aside"))).toBeCloseTo(250, 0);
  });
});
