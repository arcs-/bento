import { describe, expect, test } from "vitest";
import { page } from "vitest/browser";
import {
  block,
  frames,
  drag,
  group,
  groupSize,
  height,
  layout,
  panel,
  panelEventTypes,
  pressKeys,
  recordErrors,
  recordEvents,
  render,
  sampleFrames,
  sampleUntilAt,
  separator,
  settleAt,
  sidebarLayout,
  width,
} from "./fixtures.ts";
import { testViewport } from "./viewport.ts";

const twoBarePanels = `
  <bento-panel id="first"></bento-panel>
  <bento-separator id="handle"></bento-separator>
  <bento-panel id="second"></bento-panel>`;

describe("smallest layout", () => {
  test("two bare panels split the group equally", async () => {
    await render(layout(twoBarePanels));
    const first = panel("first");
    const second = panel("second");

    expect(width(first)).toBeCloseTo(width(second), 0);
    expect(width(first) + width(separator("handle")) + width(second)).toBeCloseTo(
      groupSize.width,
      0,
    );
    expect(height(first)).toBeCloseTo(groupSize.height, 0);
  });

  test("vertical stacks the panels", async () => {
    await render(layout(twoBarePanels, 'orientation="vertical"'));
    const first = panel("first");
    const second = panel("second");

    expect(height(first)).toBeCloseTo(height(second), 0);
    expect(second.getBoundingClientRect().top).toBeGreaterThan(first.getBoundingClientRect().top);
    expect(width(first)).toBeCloseTo(groupSize.width, 0);
  });

  test("a bad orientation falls back to horizontal", async () => {
    await render(layout(twoBarePanels, 'orientation="diagonal"'));

    expect(group("layout").orientation).toBe("horizontal");
    expect(panel("second").getBoundingClientRect().left).toBeGreaterThan(
      panel("first").getBoundingClientRect().left,
    );
    expect(height(panel("first"))).toBeCloseTo(groupSize.height, 0);
  });
});

const threePanels = (firstAttributes: string) => `
  <bento-panel id="first" ${firstAttributes}></bento-panel>
  <bento-separator id="first-handle"></bento-separator>
  <bento-panel id="second"></bento-panel>
  <bento-separator id="second-handle"></bento-separator>
  <bento-panel id="third"></bento-panel>`;

const separatorsWidth = () => width(separator("first-handle")) + width(separator("second-handle"));

const customProperty = (probeId: string, name: string) =>
  getComputedStyle(block(probeId)).getPropertyValue(name).trim();

describe("sizes", () => {
  test("a px size is fixed, panels without one share the rest", async () => {
    await render(layout(threePanels('size="300px"')));

    expect(width(panel("first"))).toBeCloseTo(300, 0);
    expect(width(panel("second"))).toBeCloseTo((groupSize.width - 300 - separatorsWidth()) / 2, 0);
    expect(width(panel("third"))).toBeCloseTo(width(panel("second")), 0);

    group("layout").style.width = "800px";
    await sampleUntilAt(() => width(panel("second")), (800 - 300 - separatorsWidth()) / 2);
    expect(width(panel("first"))).toBeCloseTo(300, 0);
  });

  test("a percentage is of the group's space, what its panels share", async () => {
    await render(layout(threePanels('size="25%"')));

    expect(width(panel("first"))).toBeCloseTo((groupSize.width - separatorsWidth()) / 4, 0);

    group("layout").style.width = "800px";
    await sampleUntilAt(() => width(panel("first")), (800 - separatorsWidth()) / 4);
  });

  test("with no flexible panel the last one fills", async () => {
    await render(
      layout(`
        <bento-panel id="first" size="200px"></bento-panel>
        <bento-separator id="handle"></bento-separator>
        <bento-panel id="last" size="300px"></bento-panel>`),
    );

    expect(width(panel("first"))).toBeCloseTo(200, 0);
    expect(width(panel("last"))).toBeCloseTo(groupSize.width - 200 - width(separator("handle")), 0);
  });

  test("a bad length or a unit other than px and % falls back to the default", async () => {
    await render(
      layout(`
        <bento-panel id="first" size="banana" min="wide" max="-"></bento-panel>
        <bento-separator id="first-handle"></bento-separator>
        <bento-panel id="second" size="20rem"></bento-panel>
        <bento-separator id="second-handle"></bento-separator>
        <bento-panel id="third"></bento-panel>`),
    );
    const first = panel("first");
    const second = panel("second");

    expect(width(first)).toBeCloseTo(width(panel("third")), 0);
    expect(width(second)).toBeCloseTo(width(panel("third")), 0);
    expect(width(first) * 3 + separatorsWidth()).toBeCloseTo(groupSize.width, 0);
    expect(first.size).toBe("");
    expect(first.defaultSize).toBe("banana");
  });

  test("gap on the group spaces its children", async () => {
    await render(`<style>#layout { gap: 10px }</style>${layout(twoBarePanels)}`);
    const first = panel("first");
    const second = panel("second");

    expect(width(first)).toBeCloseTo(width(second), 0);
    expect(width(first) + width(separator("handle")) + width(second) + 20).toBeCloseTo(
      groupSize.width,
      0,
    );
  });

  test("a child that renders no box takes no gap", async () => {
    await render(`
      <style>#layout { gap: 10px }</style>
      ${layout(`${twoBarePanels}<template></template><div style="display: none"></div>`)}`);

    expect(width(panel("first"))).toBeCloseTo(
      (groupSize.width - width(separator("handle")) - 20) / 2,
      0,
    );
  });

  test("app rules win over the default styles, even for layout", async () => {
    await render(`<style>#sidebar { flex: 0 0 123px }</style>${sidebarLayout('size="300px"')}`);

    expect(width(panel("sidebar"))).toBeCloseTo(123, 0);
  });
});

/** A panel `#styled` with the given style, three 40px children, separator `#handle`, `#main`. */
function styledPanelLayout(style: string, groupAttributes = ""): string {
  return layout(
    `<bento-panel id="styled" size="300px" collapsible style="${style}">
      <div id="first" style="flex: none; block-size: 40px; background: rgb(0, 0, 255)"></div>
      <div id="second" style="flex: none; block-size: 40px"></div>
      <div id="third" style="flex: none; block-size: 40px"></div>
    </bento-panel>
    <bento-separator id="handle"></bento-separator>
    <bento-panel id="main"></bento-panel>`,
    groupAttributes,
  );
}

const boxOf = (id: string) => block(id).getBoundingClientRect();

/** Scrolls `#third` into view and returns how far `#first` moved, as a scroller would. */
function scrollToThird(): number {
  const before = boxOf("first").top;
  block("third").scrollIntoView({ block: "end" });
  return before - boxOf("first").top;
}

describe("a panel's layout styles lay out and scroll its children", () => {
  test("flex, direction and gap on the panel lay out its children", async () => {
    await render(styledPanelLayout("display: flex; flex-direction: column; gap: 10px"));

    expect(boxOf("second").top - boxOf("first").bottom).toBeCloseTo(10, 0);
    expect(boxOf("third").top - boxOf("second").bottom).toBeCloseTo(10, 0);
    expect(width(block("first"))).toBeCloseTo(300, 0);
    expect(width(panel("styled"))).toBeCloseTo(300, 0);
    expect(height(panel("styled"))).toBeCloseTo(groupSize.height, 0);
  });

  test("a grid on the panel lays out its children, and the panel stays the group's item", async () => {
    await render(
      styledPanelLayout("display: grid; grid-template-columns: 1fr 1fr; place-content: center"),
    );

    expect(width(block("first"))).toBeCloseTo(150, 0);
    expect(boxOf("second").left - boxOf("first").left).toBeCloseTo(150, 0);
    expect(boxOf("third").top).toBeGreaterThan(boxOf("first").top);
    expect(width(panel("styled"))).toBeCloseTo(300, 0);
    expect(panel("styled").getBoundingClientRect().left).toBeCloseTo(
      group("layout").getBoundingClientRect().left,
      0,
    );
  });

  test("overflow on the panel scrolls its children; the panel's own box never scrolls", async () => {
    await render(
      styledPanelLayout("display: flex; flex-direction: column; gap: 200px; overflow-y: auto"),
    );

    expect(scrollToThird()).toBeGreaterThan(100);
    expect(boxOf("third").bottom).toBeLessThanOrEqual(
      panel("styled").getBoundingClientRect().bottom + 1,
    );
    expect(panel("styled").scrollTop).toBe(0);
    expect(panel("styled").getBoundingClientRect().top).toBeCloseTo(
      group("layout").getBoundingClientRect().top,
      0,
    );
  });

  test("in a vertical group, overflow on the group's axis scrolls too", async () => {
    await render(
      styledPanelLayout(
        "display: flex; flex-direction: column; gap: 60px; overflow-y: auto",
        'orientation="vertical"',
      ).replace('size="300px"', 'size="100px"'),
    );

    expect(height(panel("styled"))).toBeCloseTo(100, 0);
    expect(scrollToThird()).toBeGreaterThan(50);
    expect(panel("styled").scrollTop).toBe(0);
  });

  test("a panel laid out with flex still collapses to 0, animated, and to a rail", async () => {
    await render(styledPanelLayout("display: flex; flex-direction: column; gap: 10px"));
    const styled = panel("styled");

    await pressKeys(separator("handle"), "{Enter}");
    const contentWidths: number[] = [];
    const collapsing = await sampleUntilAt(() => {
      if (width(styled) > 1) contentWidths.push(width(block("first")));
      return width(styled);
    }, 0);

    expect(collapsing.some((sample) => sample > 1 && sample < 299)).toBe(true);
    for (const contentWidth of contentWidths) expect(contentWidth).toBeCloseTo(300, 0);
    expect(block("first").checkVisibility()).toBe(false);

    styled.setAttribute("collapsed-size", "48px");
    await frames();
    expect(width(styled)).toBeCloseTo(48, 0);
    expect(block("first").checkVisibility()).toBe(true);
    expect(width(block("first"))).toBeCloseTo(48, 0);
  });
});

describe("content", () => {
  test("one element with height: 100% fills the panel", async () => {
    await render(
      layout(`
        <bento-panel id="sidebar" size="300px"><div id="content" style="height: 100%"></div></bento-panel>
        <bento-separator></bento-separator>
        <bento-panel></bento-panel>`),
    );

    expect(height(block("content"))).toBeCloseTo(groupSize.height, 0);
    expect(width(block("content"))).toBeCloseTo(300, 0);
  });

  test("keeps at least min while the panel is smaller, clipped by the panel", async () => {
    await render(`
      <bento-group id="layout" style="width: 400px; height: 200px">
        <bento-panel id="first" size="300px" min="300px"></bento-panel>
        <bento-separator id="handle"></bento-separator>
        <bento-panel id="squeezed" min="300px">
          <div id="content" style="height: 100px"></div>
        </bento-panel>
      </bento-group>`);
    const squeezed = panel("squeezed");
    const content = block("content");

    expect(width(squeezed)).toBeLessThan(300);
    expect(width(content)).toBeCloseTo(300, 0);

    const panelBox = squeezed.getBoundingClientRect();
    const contentBox = content.getBoundingClientRect();
    const beyondPanelEnd = contentBox.right > panelBox.right + 2;
    const clippedX = beyondPanelEnd ? panelBox.right + 1 : panelBox.left - 1;
    expect(document.elementFromPoint(clippedX, contentBox.top + 10)).not.toBe(content);
  });

  test("is a size container, so @container queries follow the panel", async () => {
    await render(`
      <style>@container (min-width: 350px) { #probe { color: rgb(0, 128, 0) } }</style>
      ${sidebarLayout('size="300px"')}`);
    const probe = document.createElement("span");
    probe.id = "probe";
    block("sidebar-content").append(probe);

    expect(getComputedStyle(probe).color).not.toBe("rgb(0, 128, 0)");

    panel("sidebar").size = "400px";
    await expect.poll(() => getComputedStyle(probe).color).toBe("rgb(0, 128, 0)");
  });

  test("position: fixed content is placed against the viewport, also while animating", async () => {
    await render(`
      <div style="height: 40px"></div>
      ${sidebarLayout('size="300px" collapsible')}`);
    const fixed = document.createElement("div");
    fixed.setAttribute("style", "position: fixed; left: 10px; top: 5px; width: 5px; height: 5px");
    block("main-content").append(fixed);
    const fixedPosition = () => {
      const box = fixed.getBoundingClientRect();
      return box.left + box.top;
    };

    expect(fixedPosition()).toBeCloseTo(15, 0);

    const positionsWhileCollapsing: number[] = [];
    await pressKeys(separator("handle"), "{Enter}");
    await sampleUntilAt(() => {
      positionsWhileCollapsing.push(fixedPosition());
      return width(panel("sidebar"));
    }, 0);
    for (const position of positionsWhileCollapsing) expect(position).toBeCloseTo(15, 0);
  });
});

describe("nesting", () => {
  test("nested groups lay out inside their panel and inherit no size", async () => {
    await render(
      layout(`
        <bento-panel id="outer" size="400px">
          <bento-group id="inner" style="height: 100px">
            <bento-panel id="inner-first"></bento-panel>
            <bento-separator id="inner-handle"></bento-separator>
            <bento-panel id="inner-second"></bento-panel>
          </bento-group>
        </bento-panel>
        <bento-separator id="handle"></bento-separator>
        <bento-panel id="main"></bento-panel>`),
    );

    const innerFirst = width(panel("inner-first"));
    expect(innerFirst).toBeCloseTo(width(panel("inner-second")), 0);
    expect(
      innerFirst + width(separator("inner-handle")) + width(panel("inner-second")),
    ).toBeCloseTo(400, 0);
  });

  test("--bento-* custom properties are readable inside a panel and never inherited", async () => {
    await render(
      layout(`
        <bento-panel id="outer" size="400px" min="200px" max="600px" collapsed-size="48px">
          <div id="outer-probe" style="width: var(--bento-min)"></div>
          <bento-group id="inner" style="height: 100px">
            <bento-panel id="inner-panel"><div id="inner-probe"></div></bento-panel>
          </bento-group>
        </bento-panel>
        <bento-separator id="handle"></bento-separator>
        <bento-panel id="main"></bento-panel>`),
    );
    expect(width(block("outer-probe"))).toBeCloseTo(200, 0);
    expect(customProperty("outer-probe", "--bento-size")).toBe("400px");
    expect(customProperty("outer-probe", "--bento-min")).toBe("200px");
    expect(customProperty("outer-probe", "--bento-max")).toBe("600px");
    expect(customProperty("outer-probe", "--bento-collapsed-size")).toBe("48px");

    expect(customProperty("inner-probe", "--bento-size")).not.toBe("400px");
    expect(["0", "0px"]).toContain(customProperty("inner-probe", "--bento-min"));
    expect(customProperty("inner-probe", "--bento-max")).not.toBe("600px");
    expect(["0", "0px"]).toContain(customProperty("inner-probe", "--bento-collapsed-size"));
  });
});

describe("a nested group its collapsed panel hides", () => {
  test("keeps its layout, fires nothing, and applies a write made meanwhile without animating", async () => {
    await render(
      layout(`
        <bento-panel id="outer" size="400px" collapsible>
          <bento-group id="inner" style="height: 100px">
            <bento-panel id="inner-first" size="200px"></bento-panel>
            <bento-separator id="inner-handle"></bento-separator>
            <bento-panel id="inner-end" size="150px" min="100px" collapsible></bento-panel>
          </bento-group>
        </bento-panel>
        <bento-separator id="handle"></bento-separator>
        <bento-panel id="main"></bento-panel>`),
    );
    const innerEvents = recordEvents(group("inner"), panelEventTypes, { capture: true });
    const innerEnd = panel("inner-end");

    await pressKeys(separator("handle"), "{Enter}");
    await settleAt(() => width(panel("outer")), 0);
    await expect.poll(() => group("inner").checkVisibility()).toBe(false);
    await frames(2);
    innerEnd.collapsed = true;
    await frames();
    await pressKeys(separator("handle"), "{Enter}");
    const innerEndWidths = await sampleFrames(() => width(innerEnd), 3);
    await settleAt(() => width(panel("outer")), 400);

    for (const sample of innerEndWidths) expect(sample).toBeCloseTo(0, 0);
    const innerSpace = 400 - width(separator("inner-handle"));
    expect(width(panel("inner-first"))).toBeCloseTo(innerSpace, 0);
    expect(innerEvents).toEqual([]);
  });
});

const shareWidth = () => width(panel("share"));

describe("a percentage size and the viewport", () => {
  test("follows a viewport resize", async () => {
    await render(`
      <style>body { margin: 0 }</style>
      <bento-group id="layout" style="width: 100%; height: 100px">
        <bento-panel id="share" size="25%"></bento-panel>
        <bento-separator id="handle"></bento-separator>
        <bento-panel></bento-panel>
      </bento-group>`);
    expect(shareWidth()).toBeCloseTo((testViewport.width - width(separator("handle"))) / 4, 0);

    await page.viewport(600, 600);

    await sampleUntilAt(shareWidth, (600 - width(separator("handle"))) / 4);
  });
});

describe("dynamic panels", () => {
  test("a panel removed while it animates leaves the rest filling the group", async () => {
    await render(sidebarLayout('size="300px" collapsible'));
    const errors = recordErrors();
    await pressKeys(separator("handle"), "{Enter}");
    await frames(3);

    panel("sidebar").remove();
    separator("handle").remove();
    await frames();

    expect(width(panel("main"))).toBeCloseTo(groupSize.width, 0);
    expect(errors()).toEqual([]);
  });

  test("panels and separators added or removed at runtime relayout", async () => {
    await render(sidebarLayout('size="300px"'));
    const main = panel("main");
    const addedHandle = document.createElement("bento-separator");
    const added = document.createElement("bento-panel");
    added.setAttribute("size", "200px");

    group("layout").append(addedHandle, added);
    const spaceTaken = () => 300 + width(separator("handle")) + width(addedHandle) + 200;
    await sampleUntilAt(() => width(main), groupSize.width - spaceTaken());
    expect(width(added)).toBeCloseTo(200, 0);

    addedHandle.remove();
    added.remove();
    await sampleUntilAt(() => width(main), groupSize.width - 300 - width(separator("handle")));
  });

  test("the app's separators keep working after a panel is added", async () => {
    await render(sidebarLayout('size="300px"'));
    const addedHandle = document.createElement("bento-separator");
    const added = document.createElement("bento-panel");
    added.setAttribute("size", "200px");
    group("layout").append(addedHandle, added);

    await drag(addedHandle, -50);

    expect(width(added)).toBeCloseTo(250, 0);
    expect(width(panel("sidebar"))).toBeCloseTo(300, 0);
  });
});
