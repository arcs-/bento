import { describe, expect, test } from "vitest";
import { commands, server, userEvent } from "vitest/browser";
import {
  doubleClick,
  drag,
  frames,
  height,
  layout,
  moveBy,
  panel,
  pixels,
  press,
  pressKeys,
  release,
  render,
  separator,
  settleAt,
  sidebarLayout,
  width,
} from "./fixtures.ts";

const twoCollapsiblePanels = (separatorAttributes: string) =>
  layout(`
    <bento-panel id="first" collapsible></bento-panel>
    <bento-separator id="handle" ${separatorAttributes}></bento-separator>
    <bento-panel id="second" collapsible></bento-panel>`);

describe("keyboard", () => {
  test("arrow keys resize by 10px, with Shift by 100px", async () => {
    await render(sidebarLayout('size="300px" min="100px" max="600px"'));
    const sidebar = panel("sidebar");
    const handle = separator("handle");

    await pressKeys(handle, "{ArrowRight}");
    expect(width(sidebar)).toBeCloseTo(310, 0);
    await pressKeys(handle, "{Shift>}{ArrowRight}{/Shift}");
    expect(width(sidebar)).toBeCloseTo(410, 0);
    await pressKeys(handle, "{ArrowLeft}");
    expect(width(sidebar)).toBeCloseTo(400, 0);
    expect(pixels(sidebar.size)).toBeCloseTo(400, 0);
  });

  test("up and down arrows move the separator of a vertical group", async () => {
    await render(sidebarLayout('size="100px"', 'orientation="vertical"'));
    const sidebar = panel("sidebar");

    await pressKeys(separator("handle"), "{ArrowDown}");
    expect(height(sidebar)).toBeCloseTo(110, 0);
    await pressKeys(separator("handle"), "{ArrowUp}{ArrowUp}");
    expect(height(sidebar)).toBeCloseTo(90, 0);
  });

  test("arrow keys follow the writing direction in right-to-left", async () => {
    await render(sidebarLayout('size="300px"', 'dir="rtl"'));

    await pressKeys(separator("handle"), "{ArrowLeft}");

    expect(width(panel("sidebar"))).toBeCloseTo(310, 0);
  });

  test("Home and End go to min and max", async () => {
    await render(sidebarLayout('size="300px" min="200px" max="500px" collapsible'));
    const sidebar = panel("sidebar");

    await pressKeys(separator("handle"), "{End}");
    expect(width(sidebar)).toBeCloseTo(500, 0);
    await pressKeys(separator("handle"), "{Home}");
    expect(width(sidebar)).toBeCloseTo(200, 0);
    expect(sidebar.collapsed).toBe(false);
  });

  test("arrow keys snap collapsed as soon as they go below min", async () => {
    await render(sidebarLayout('size="205px" min="200px" collapsible'));
    const sidebar = panel("sidebar");

    await pressKeys(separator("handle"), "{ArrowLeft}");

    expect(sidebar.collapsed).toBe(true);
    await settleAt(() => width(sidebar), 0);
  });

  test("Enter toggles a collapsible primary panel", async () => {
    await render(sidebarLayout('size="300px" collapsible'));
    const sidebar = panel("sidebar");

    await pressKeys(separator("handle"), "{Enter}");
    expect(sidebar.collapsed).toBe(true);
    await settleAt(() => width(sidebar), 0);

    await pressKeys(separator("handle"), "{Enter}");
    expect(sidebar.collapsed).toBe(false);
    await settleAt(() => width(sidebar), 300);
  });

  test("Enter leaves a panel that is not collapsible as it is", async () => {
    await render(sidebarLayout('size="300px"'));

    await pressKeys(separator("handle"), "{Enter}");
    await frames(10);

    expect(panel("sidebar").collapsed).toBe(false);
    expect(width(panel("sidebar"))).toBeCloseTo(300, 0);
  });

  test("on a tie the later neighbour is primary", async () => {
    await render(twoCollapsiblePanels(""));

    await pressKeys(separator("handle"), "{Enter}");

    expect(panel("second").collapsed).toBe(true);
    expect(panel("first").collapsed).toBe(false);
  });

  test("aria-controls names the primary panel", async () => {
    await render(twoCollapsiblePanels('aria-controls="first"'));

    await pressKeys(separator("handle"), "{Enter}");

    expect(panel("first").collapsed).toBe(true);
    expect(panel("second").collapsed).toBe(false);
  });
});

describe("double-click", () => {
  test("resets the primary panel to its default size and collapsed state", async () => {
    await render(sidebarLayout('size="300px" collapsible'));
    const sidebar = panel("sidebar");
    await drag(separator("handle"), 100);
    expect(width(sidebar)).toBeCloseTo(400, 0);

    await doubleClick(separator("handle"));
    await settleAt(() => width(sidebar), 300);
    expect(pixels(sidebar.size)).toBeCloseTo(300, 0);

    await pressKeys(separator("handle"), "{Enter}");
    await settleAt(() => width(sidebar), 0);
    await doubleClick(separator("handle"));
    expect(sidebar.collapsed).toBe(false);
    await settleAt(() => width(sidebar), 300);
  });

  test("resets a panel that starts collapsed back to collapsed", async () => {
    await render(sidebarLayout('size="300px" collapsible collapsed'));
    const sidebar = panel("sidebar");
    await pressKeys(separator("handle"), "{Enter}");
    await settleAt(() => width(sidebar), 300);

    await doubleClick(separator("handle"));

    expect(sidebar.collapsed).toBe(true);
    await settleAt(() => width(sidebar), 0);
  });
});

describe("accessibility", () => {
  test("the separator is focusable in tab order; tabindex is the only attribute it adds", async () => {
    await render(`
      <button id="before">before</button>
      ${sidebarLayout('size="300px"')}
      <bento-group><bento-panel></bento-panel>
        <bento-separator id="skipped" tabindex="-1"></bento-separator><bento-panel></bento-panel>
      </bento-group>`);
    const handle = separator("handle");

    document.getElementById("before")?.focus();
    await userEvent.tab();

    expect(document.activeElement).toBe(handle);
    expect(handle.getAttributeNames().toSorted()).toEqual(["aria-label", "id", "tabindex"]);
    expect(handle.getAttribute("tabindex")).toBe("0");
    expect(separator("skipped").getAttribute("tabindex")).toBe("-1");
  });

  test.runIf(server.browser === "chromium")(
    "role, orientation and percentages of the group reach assistive tech",
    async () => {
      await render(sidebarLayout('size="250px" min="100px" max="600px"'));
      const [horizontalGroupSeparator] = await commands.accessibleNodes("separator");

      expect(horizontalGroupSeparator).toMatchObject({
        name: "Sidebar",
        orientation: "vertical",
        focusable: true,
      });
      expect(horizontalGroupSeparator?.valueNow).toBeCloseTo(25, 0);
      expect(horizontalGroupSeparator?.valueMin).toBeCloseTo(10, 0);
      expect(horizontalGroupSeparator?.valueMax).toBeCloseTo(60, 0);

      await pressKeys(separator("handle"), "{ArrowRight}");
      const [afterKeyPress] = await commands.accessibleNodes("separator");
      expect(afterKeyPress?.valueNow).toBeCloseTo(26, 0);
    },
  );

  test.runIf(server.browser === "chromium")(
    "a separator in a vertical group is horizontal",
    async () => {
      await render(sidebarLayout('size="100px"', 'orientation="vertical"'));

      const [verticalGroupSeparator] = await commands.accessibleNodes("separator");

      expect(verticalGroupSeparator?.orientation).toBe("horizontal");
    },
  );
});

describe("hit area", () => {
  test("a positioned element in the next panel does not cover it", async () => {
    await render(
      layout(`
        <bento-panel id="sidebar" size="300px"></bento-panel>
        <bento-separator id="handle"></bento-separator>
        <bento-panel id="main">
          <div style="position: relative; height: 300px"></div>
        </bento-panel>`),
    );

    await press(separator("handle"), 3);
    await moveBy(50);
    await release();

    expect(width(panel("sidebar"))).toBeCloseTo(350, 0);
  });
});
