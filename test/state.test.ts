import { describe, expect, test } from "vitest";
import { page, userEvent } from "vitest/browser";
import {
  activateUser,
  animationsDone,
  block,
  doubleClick,
  drag,
  frames,
  group,
  isBetween,
  layout,
  mount,
  panel,
  parse,
  pixels,
  pressKeys,
  render,
  renderBuiltSidebarLayout,
  sampleFrames,
  sampleUntilAt,
  separator,
  settleAt,
  sidebarLayout,
  width,
} from "./fixtures.ts";

const veto = (event: Event) => event.preventDefault();

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

const lifecycle = ["constructor", "connectedCallback", "disconnectedCallback"];

/** Every name an element answers to beyond `HTMLElement`: its own keys and its class's. */
function surfaceOf(tag: keyof HTMLElementTagNameMap): string[] {
  const element = document.createElement(tag);
  const prototype: object = customElements.get(tag)?.prototype ?? {};
  return [...Object.keys(element), ...Object.getOwnPropertyNames(prototype)].toSorted();
}

describe("public surface", () => {
  test("no element carries an internal member, only its documented properties", () => {
    expect(surfaceOf("bento-group")).toEqual(
      [...lifecycle, "attributeChangedCallback", "orientation"].toSorted(),
    );
    expect(surfaceOf("bento-panel")).toEqual(
      [
        ...lifecycle,
        "attributeChangedCallback",
        "size",
        "collapsed",
        "defaultSize",
        "defaultCollapsed",
        "min",
        "max",
        "collapsible",
        "collapsedSize",
        "modal",
      ].toSorted(),
    );
    expect(surfaceOf("bento-separator")).toEqual(lifecycle.toSorted());
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

  test("collapsed is live and writable, and writing it animates after user activation", async () => {
    await render(sidebarLayout('size="300px" collapsible'));
    const sidebar = panel("sidebar");
    await activateUser();

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

describe("starting state", () => {
  test("property writes before the first layout are the start, as React makes them", async () => {
    await renderBuiltSidebarLayout({ size: "250px", collapsed: true, collapsible: true });
    const sidebar = panel("sidebar");
    const sidebarWidth = () => width(sidebar);

    expect(sidebar.hasAttribute("size")).toBe(false);
    expect(sidebar.defaultSize).toBe("250px");
    expect(sidebar.defaultCollapsed).toBe(true);
    expect(sidebarWidth()).toBeCloseTo(0, 0);
    expect(getComputedStyle(block("sidebar-content")).getPropertyValue("--bento-size").trim()).toBe(
      "250px",
    );

    await pressKeys(separator("handle"), "{Enter}");
    await settleAt(sidebarWidth, 250);
    await drag(separator("handle"), 50);
    await doubleClick(separator("handle"));
    expect(sidebar.collapsed).toBe(true);
    expect(sidebar.size).toBe("250px");
  });

  test("a later attribute change moves the start, and the live state while clean", async () => {
    await renderBuiltSidebarLayout({ size: "250px", collapsible: true });
    const sidebar = panel("sidebar");

    sidebar.setAttribute("size", "200px");
    await frames();
    for (const sample of await sampleFrames(() => width(sidebar)))
      expect(sample).toBeCloseTo(200, 0);
    expect(sidebar.defaultSize).toBe("200px");

    await drag(separator("handle"), 50);
    sidebar.defaultSize = "150px";
    await frames(5);
    expect(width(sidebar)).toBeCloseTo(250, 0);

    await doubleClick(separator("handle"));
    await settleAt(() => width(sidebar), 150);
    expect(sidebar.size).toBe("150px");
  });

  test("null and undefined, as React writes for a removed prop, mean no size and expanded", async () => {
    await render(sidebarLayout('size="300px" collapsible collapsed'));
    const sidebar = panel("sidebar");

    sidebar.size = undefined;
    sidebar.collapsed = null;
    await frames();
    await animationsDone();

    expect(sidebar.size).toBe("");
    expect(sidebar.collapsed).toBe(false);
    expect(width(sidebar)).toBeCloseTo(width(panel("main")), 0);
    sidebar.setAttribute("size", "200px");
    await frames(5);
    expect(width(sidebar)).toBeCloseTo(width(panel("main")), 0);
  });

  test("a write equal to the live value changes nothing, so the live state stays clean", async () => {
    await render(sidebarLayout('size="300px" collapsible'));
    const sidebar = panel("sidebar");

    sidebar.size = "300px";
    sidebar.collapsed = false;
    sidebar.setAttribute("size", "200px");
    sidebar.setAttribute("collapsed", "");
    await frames();

    for (const sample of await sampleFrames(() => width(sidebar))) expect(sample).toBeCloseTo(0, 0);
    sidebar.removeAttribute("collapsed");
    await settleAt(() => width(sidebar), 200);
  });

  test("removing a clean collapsed attribute expands the panel to the front, like any expand", async () => {
    await render(
      layout(`
        <bento-panel id="start" size="300px" min="200px" collapsible></bento-panel>
        <bento-separator></bento-separator>
        <bento-panel id="main" min="300px"></bento-panel>
        <bento-separator></bento-separator>
        <bento-panel id="end" size="300px" min="200px" collapsible collapsed></bento-panel>`),
    );
    group("layout").style.width = "700px";
    await frames();

    panel("end").removeAttribute("collapsed");

    await expect.poll(() => panel("start").collapsed).toBe(true);
    expect(panel("end").collapsed).toBe(false);
    await settleAt(() => width(panel("end")), 300);
  });

  test("a vetoed double-click keeps the collapsed state the user's", async () => {
    await render(sidebarLayout('size="300px" collapsible'));
    const sidebar = panel("sidebar");
    await pressKeys(separator("handle"), "{Enter}");
    await settleAt(() => width(sidebar), 0);
    sidebar.addEventListener("beforetoggle", veto);

    await doubleClick(separator("handle"));
    sidebar.removeEventListener("beforetoggle", veto);
    sidebar.setAttribute("collapsed", "");
    sidebar.removeAttribute("collapsed");
    await frames(5);

    expect(sidebar.collapsed).toBe(true);
    expect(width(sidebar)).toBeCloseTo(0, 0);
  });
});
