import { describe, expect, test } from "vitest";
import { page, userEvent } from "vitest/browser";
import {
  doubleClick,
  drag,
  frames,
  group,
  isBetween,
  mount,
  panel,
  parse,
  pixels,
  pressKeys,
  render,
  sampleFrames,
  sampleUntilAt,
  separator,
  settleAt,
  sidebarLayout,
  width,
} from "./fixtures.ts";

function describeMutation({ type, attributeName, target }: MutationRecord): string {
  const targetId = target instanceof Element ? `#${target.id}` : "";
  return `${type} ${attributeName ?? ""} on ${target.nodeName}${targetId}`;
}

describe("properties", () => {
  test("reflect their attributes like HTML, empty when absent", async () => {
    await render(`
      <bento-group id="bare"><bento-panel id="bare-panel"></bento-panel></bento-group>
      <bento-group id="full" orientation="vertical">
        <bento-panel id="full-panel" size="300px" collapsed min="200px" max="500px"
          collapsible collapsed-size="48px" modal="(max-width: 0px)"></bento-panel>
      </bento-group>`);
    const bare = panel("bare-panel");
    const full = panel("full-panel");

    expect(group("bare").orientation).toBe("horizontal");
    expect({
      size: bare.size,
      defaultSize: bare.defaultSize,
      defaultCollapsed: bare.defaultCollapsed,
      min: bare.min,
      max: bare.max,
      collapsible: bare.collapsible,
      collapsedSize: bare.collapsedSize,
      modal: bare.modal,
    }).toEqual({
      size: "",
      defaultSize: "",
      defaultCollapsed: false,
      min: "",
      max: "",
      collapsible: false,
      collapsedSize: "",
      modal: "",
    });

    expect(group("full").orientation).toBe("vertical");
    expect({
      defaultSize: full.defaultSize,
      defaultCollapsed: full.defaultCollapsed,
      min: full.min,
      max: full.max,
      collapsible: full.collapsible,
      collapsedSize: full.collapsedSize,
      modal: full.modal,
    }).toEqual({
      defaultSize: "300px",
      defaultCollapsed: true,
      min: "200px",
      max: "500px",
      collapsible: true,
      collapsedSize: "48px",
      modal: "(max-width: 0px)",
    });
  });

  test("writing a reflecting property writes its attribute", async () => {
    await render(sidebarLayout('size="300px" max="500px" collapsible'));
    const sidebar = panel("sidebar");

    sidebar.defaultSize = "250px";
    sidebar.min = "100px";
    sidebar.max = "400px";
    sidebar.collapsible = false;
    sidebar.collapsedSize = "48px";
    sidebar.modal = "(max-width: 0px)";
    group("layout").orientation = "vertical";

    expect(sidebar.getAttribute("size")).toBe("250px");
    expect(sidebar.getAttribute("min")).toBe("100px");
    expect(sidebar.getAttribute("max")).toBe("400px");
    expect(sidebar.hasAttribute("collapsible")).toBe(false);
    expect(sidebar.getAttribute("collapsed-size")).toBe("48px");
    expect(sidebar.getAttribute("modal")).toBe("(max-width: 0px)");
    expect(group("layout").getAttribute("orientation")).toBe("vertical");
  });
});

describe("live state", () => {
  test("size is live and writable; the attribute stays the default", async () => {
    await render(sidebarLayout('size="300px"'));
    const sidebar = panel("sidebar");
    expect(sidebar.size).toBe("300px");

    await drag(separator("handle"), 50);
    expect(pixels(sidebar.size)).toBeCloseTo(350, 0);
    expect(sidebar.defaultSize).toBe("300px");

    sidebar.size = "400px";
    await settleAt(() => width(sidebar), 400);
    expect(sidebar.size).toBe("400px");
    expect(sidebar.getAttribute("size")).toBe("300px");
    expect(getComputedStyle(sidebar).getPropertyValue("--bento-size").trim()).toBe("300px");
  });

  test("collapsed is live and writable, and writing it animates", async () => {
    await render(sidebarLayout('size="300px" collapsible'));
    const sidebar = panel("sidebar");

    sidebar.collapsed = true;
    const collapsing = await sampleUntilAt(() => width(sidebar), 0);

    expect(collapsing.some((sample) => isBetween(sample, 300, 0))).toBe(true);
    expect(sidebar.collapsed).toBe(true);
    expect(sidebar.defaultCollapsed).toBe(false);
    expect(sidebar.hasAttribute("collapsed")).toBe(false);
  });

  test.runIf(CSS.supports("selector(:state(collapsed))"))(
    ":state(collapsed) matches the live state",
    async () => {
      await render(sidebarLayout('size="300px" collapsible'));
      const sidebar = panel("sidebar");
      expect(sidebar.matches(":state(collapsed)")).toBe(false);

      await pressKeys(separator("handle"), "{Enter}");

      expect(sidebar.matches(":state(collapsed)")).toBe(true);
    },
  );

  test("the light DOM is never written, not by upgrade, input, toggling or modal mode", async () => {
    /** Separators rendered with the `tabindex` bento would add, as a hydrating app does. */
    const container = parse(`
      ${sidebarLayout('size="300px" min="200px" collapsible modal="(max-width: 700px)"')}
      <bento-group id="vertical" orientation="vertical" style="height: 200px">
        <bento-panel id="top"></bento-panel>
        <bento-separator id="vertical-handle"></bento-separator>
        <bento-panel id="bottom" size="50%"></bento-panel>
      </bento-group>`);
    for (const handle of container.querySelectorAll("bento-separator")) {
      handle.setAttribute("tabindex", "0");
    }
    const mutations: MutationRecord[] = [];
    const observer = new MutationObserver((records) => mutations.push(...records));
    observer.observe(container, {
      subtree: true,
      childList: true,
      attributes: true,
      characterData: true,
    });

    mount(container);
    await frames();
    await drag(separator("handle"), 50);
    await drag(separator("vertical-handle"), 0, -20);
    await pressKeys(separator("handle"), "{ArrowRight}{Home}{End}");
    await doubleClick(separator("handle"));
    await pressKeys(separator("handle"), "{Enter}");
    await pressKeys(separator("handle"), "{Enter}");
    group("layout").style.width = "800px";
    await frames();
    await page.viewport(600, 600);
    await expect.poll(() => panel("sidebar").collapsed).toBe(true);
    panel("sidebar").collapsed = false;
    await frames(5);
    await userEvent.keyboard("{Escape}");
    await frames(5);
    observer.disconnect();

    const libraryMutations = mutations.filter(
      (record) => !(record.target === group("layout") && record.attributeName === "style"),
    );
    expect(libraryMutations.map(describeMutation)).toEqual([]);
  });
});

describe("attribute changes after upgrade", () => {
  test("apply while the live state is clean, without animating", async () => {
    await render(sidebarLayout('size="300px" collapsible'));
    const sidebar = panel("sidebar");
    const sidebarWidth = () => width(sidebar);

    sidebar.setAttribute("size", "400px");
    await frames();
    for (const sample of await sampleFrames(sidebarWidth)) expect(sample).toBeCloseTo(400, 0);
    expect(sidebar.size).toBe("400px");

    sidebar.setAttribute("collapsed", "");
    await frames();
    for (const sample of await sampleFrames(sidebarWidth)) expect(sample).toBeCloseTo(0, 0);
    expect(sidebar.collapsed).toBe(true);

    sidebar.removeAttribute("collapsed");
    await frames();
    for (const sample of await sampleFrames(sidebarWidth)) expect(sample).toBeCloseTo(400, 0);
  });

  test("a changed size attribute no longer moves a panel the user resized", async () => {
    await render(sidebarLayout('size="300px"'));
    const sidebar = panel("sidebar");
    await drag(separator("handle"), 50);

    sidebar.setAttribute("size", "200px");
    await frames(5);

    expect(width(sidebar)).toBeCloseTo(350, 0);
    expect(pixels(sidebar.size)).toBeCloseTo(350, 0);
    expect(sidebar.defaultSize).toBe("200px");
  });

  test("a property write dirties its property only", async () => {
    await render(sidebarLayout('size="300px" collapsible'));
    const sidebar = panel("sidebar");
    sidebar.size = "350px";
    await settleAt(() => width(sidebar), 350);

    sidebar.setAttribute("size", "200px");
    await frames(5);
    expect(width(sidebar)).toBeCloseTo(350, 0);

    sidebar.setAttribute("collapsed", "");
    await frames();
    for (const sample of await sampleFrames(() => width(sidebar))) expect(sample).toBeCloseTo(0, 0);
    expect(sidebar.collapsed).toBe(true);
  });

  test("a changed collapsed attribute no longer toggles a panel the user toggled", async () => {
    await render(sidebarLayout('size="300px" collapsible collapsed'));
    const sidebar = panel("sidebar");
    await pressKeys(separator("handle"), "{Enter}");
    await settleAt(() => width(sidebar), 300);

    sidebar.removeAttribute("collapsed");
    sidebar.setAttribute("collapsed", "");
    await frames(5);

    expect(sidebar.collapsed).toBe(false);
    expect(width(sidebar)).toBeCloseTo(300, 0);
  });
});
