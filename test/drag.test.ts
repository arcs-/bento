import { describe, expect, test } from "vitest";
import { commands } from "vitest/browser";
import {
  drag,
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
  release,
  render,
  sampleFrames,
  sampleUntilAt,
  separator,
  settleAt,
  sidebarLayout,
  width,
} from "./fixtures.ts";

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

  test("writes live sizes rounded to 0.01px, free of float noise", async () => {
    await render(sidebarLayout('size="26.3%"'));

    await drag(separator("handle"), 7);

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

  test("between two flexible panels it gives the earlier one a size", async () => {
    await render(
      layout(`
        <bento-panel id="first"></bento-panel>
        <bento-separator id="handle"></bento-separator>
        <bento-panel id="second"></bento-panel>`),
    );
    const startWidth = width(panel("first"));

    await drag(separator("handle"), 100);

    expect(width(panel("first"))).toBeCloseTo(startWidth + 100, 0);
    expect(pixels(panel("first").size)).toBeCloseTo(startWidth + 100, 0);
    expect(panel("second").size).toBe("");
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
