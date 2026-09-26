import { describe, expect, test } from "vitest";
import { commands, page, server, userEvent } from "vitest/browser";
import {
  animationsDone,
  block,
  byId,
  clickThrough,
  colorAt,
  frames,
  group,
  isColor,
  pageAnimations,
  type Color,
  moveBy,
  panel,
  press,
  recordEvents,
  release,
  render,
  separator,
  settleAt,
  toggleStates,
  width,
} from "./fixtures.ts";
import { testViewport } from "./viewport.ts";

const narrowViewport = { width: 600, height: 600 };
const modalQuery = "(max-width: 700px)";
const green = { red: 0, green: 128, blue: 0 };
const darkRed = { red: 128, green: 0, blue: 0 };

/** `#nav` becomes modal below 700px; `#main` holds a button off to the side, over the backdrop. */
function drawerLayout({ navContent = "", aside = "" } = {}): string {
  return `
    <style>body { margin: 0 }</style>
    <bento-group id="layout" style="width: 100%; height: 300px">
      <bento-panel id="nav" class="drawer" size="300px" collapsible modal="${modalQuery}"
        aria-label="Navigation">
        <div id="nav-content" style="height: 100px">
          <button id="nav-button">inside</button>
          ${navContent}
        </div>
      </bento-panel>
      <bento-separator id="handle" aria-label="Navigation"></bento-separator>
      <bento-panel id="main">
        <div style="height: 100px"><button id="main-button" style="margin-inline-start: 400px">outside</button></div>
      </bento-panel>
      ${aside}
    </bento-group>`;
}

const modalAside = (attributes = "") => `
  <bento-separator id="aside-handle"></bento-separator>
  <bento-panel id="aside" class="drawer" size="200px" collapsible modal="${modalQuery}" ${attributes}>
    <div id="aside-content" style="height: 100px"></div>
  </bento-panel>`;

async function enterModalMode(): Promise<void> {
  await page.viewport(narrowViewport.width, narrowViewport.height);
  await expect.poll(() => panel("nav").collapsed).toBe(true);
}

async function leaveModalMode(): Promise<void> {
  await page.viewport(testViewport.width, testViewport.height);
  await expect.poll(() => panel("nav").collapsed).toBe(false);
}

/** Shows a modal panel and waits for its fade in, and any other sheet's fade out, to finish. */
async function show(panelId: string, contentId: string): Promise<void> {
  panel(panelId).collapsed = false;
  await expect.poll(() => block(contentId).checkVisibility()).toBe(true);
  await animationsDone();
}

const button = (id: string) => byId("button", id);

const veto = (event: Event) => event.preventDefault();

function centerOf(target: Element): { x: number; y: number } {
  const box = target.getBoundingClientRect();
  return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
}

function elementAtCenterOf(target: Element): Element | null {
  const { x, y } = centerOf(target);
  return document.elementFromPoint(x, y);
}

describe("entering modal mode", () => {
  test("takes the panel out of the group, collapsed, and hides its separator", async () => {
    await render(drawerLayout());
    const nav = panel("nav");
    const recorded = recordEvents(nav, ["beforetoggle", "toggle"]);
    nav.addEventListener("beforetoggle", (event) => event.preventDefault());

    await enterModalMode();
    await frames();

    expect(width(panel("main"))).toBeCloseTo(width(group("layout")), 0);
    expect(separator("handle").checkVisibility({ visibilityProperty: true })).toBe(false);
    expect(block("nav-content").checkVisibility()).toBe(false);
    expect(toggleStates(recorded)).toEqual(["beforetoggle open→closed", "toggle open→closed"]);
  });

  test.runIf(CSS.supports("selector(:state(modal))"))(
    ":state(modal) matches while the panel is modal",
    async () => {
      await render(drawerLayout());
      expect(panel("nav").matches(":state(modal)")).toBe(false);

      await enterModalMode();
      expect(panel("nav").matches(":state(modal)")).toBe(true);

      await leaveModalMode();
      expect(panel("nav").matches(":state(modal)")).toBe(false);
    },
  );

  test("leaving it restores the collapsed state from before entering", async () => {
    await render(drawerLayout({ aside: modalAside("collapsed") }));
    await enterModalMode();
    await show("aside", "aside-content");

    await leaveModalMode();

    await settleAt(() => width(panel("nav")), 300);
    expect(separator("handle").checkVisibility({ visibilityProperty: true })).toBe(true);
    expect(panel("aside").collapsed).toBe(true);
    expect(width(panel("aside"))).toBeCloseTo(0, 0);
  });
});

describe("a shown modal panel", () => {
  test("is a modal dialog in the top layer; the rest of the page is inert", async () => {
    await render(`${drawerLayout()}<div id="cover" style="position: fixed; inset: 0"></div>`);
    await enterModalMode();

    await show("nav", "nav-content");

    expect(elementAtCenterOf(button("nav-button"))).toBe(button("nav-button"));
    expect(elementAtCenterOf(button("main-button"))).not.toBe(button("main-button"));
    button("main-button").focus();
    expect(document.activeElement).not.toBe(button("main-button"));
    button("nav-button").focus();
    expect(document.activeElement).toBe(button("nav-button"));
  });

  test("keeps menus rendered inside it on top and interactive", async () => {
    await render(
      drawerLayout({
        navContent: `<button id="menu" style="position: fixed; left: 400px; top: 200px; width: 120px; height: 40px">menu</button>`,
      }),
    );
    await enterModalMode();
    await show("nav", "nav-content");
    const menu = button("menu");
    const clicks = recordEvents(menu, ["click"]);

    expect(elementAtCenterOf(menu)).toBe(menu);
    await clickThrough(menu);

    expect(clicks).toHaveLength(1);
    expect(panel("nav").collapsed).toBe(false);
  });

  test("shows alone: showing another collapses it", async () => {
    await render(drawerLayout({ aside: modalAside() }));
    await enterModalMode();
    await show("nav", "nav-content");
    const recorded = recordEvents(panel("nav"), ["beforetoggle", "toggle"]);

    await show("aside", "aside-content");

    expect(panel("nav").collapsed).toBe(true);
    expect(block("nav-content").checkVisibility()).toBe(false);
    expect(toggleStates(recorded)).toEqual(["beforetoggle open→closed", "toggle open→closed"]);
  });

  test("Escape closes it by collapsing, after a cancelable beforetoggle", async () => {
    await render(drawerLayout());
    await enterModalMode();
    await show("nav", "nav-content");
    await clickThrough(button("nav-button"));
    const recorded = recordEvents(panel("nav"), ["beforetoggle", "toggle"]);

    await userEvent.keyboard("{Escape}");

    await expect.poll(() => panel("nav").collapsed).toBe(true);
    await expect.poll(() => block("nav-content").checkVisibility()).toBe(false);
    expect(toggleStates(recorded)).toEqual([
      "beforetoggle open→closed cancelable",
      "toggle open→closed",
    ]);
  });

  test("a drag that starts inside the sheet and ends outside does not close it", async () => {
    await render(drawerLayout());
    await enterModalMode();
    await show("nav", "nav-content");

    await press(button("nav-button"));
    await moveBy(300);
    await release();
    await frames(5);

    expect(panel("nav").collapsed).toBe(false);
  });

  test.runIf(server.browser === "chromium")("its aria-label names the dialog", async () => {
    await render(drawerLayout());
    await enterModalMode();
    await show("nav", "nav-content");

    const [dialog] = await commands.accessibleNodes("dialog");

    expect(dialog?.name).toBe("Navigation");
  });

  test("a click on the backdrop closes it; canceling beforetoggle keeps it open", async () => {
    await render(drawerLayout());
    const nav = panel("nav");
    await enterModalMode();
    await show("nav", "nav-content");
    await clickThrough(button("nav-button"));
    nav.addEventListener("beforetoggle", veto);

    await userEvent.keyboard("{Escape}");
    await clickThrough(button("main-button"));
    await frames(5);
    expect(nav.collapsed).toBe(false);
    expect(block("nav-content").checkVisibility()).toBe(true);

    nav.removeEventListener("beforetoggle", veto);
    await clickThrough(button("main-button"));
    await expect.poll(() => nav.collapsed).toBe(true);
  });
});

/** Between the green sheet and the grey backdrop, by more than rounding noise. */
const isPartlyGreen = ({ red, green: greenness }: Color) => red > 20 && greenness - red > 10;
const isBackdrop = ({ red, green: greenness }: Color) => Math.abs(greenness - red) < 5;

/** How far the sheet's green shows through: 128 opaque, 0 at the grey backdrop. */
const greenness = (color: Color) => color.green - color.red;

/**
 * Screenshots are slower than frames and slower still under load; a long transition-duration
 * gives them time to catch the fade.
 */
async function colorsUntil(done: (color: Color) => boolean): Promise<Color[]> {
  const colors: Color[] = [];
  const deadline = performance.now() + 8000;
  while (performance.now() < deadline) {
    const color = await colorAt(150, 250);
    colors.push(color);
    if (done(color)) return colors;
  }
  throw new Error("the fade never finished");
}

describe("the sheet's fade", () => {
  test("fades in and out, timed by the panel, also under reduced motion; it closes after", async () => {
    await commands.emulateReducedMotion("reduce");
    await render(`
      <style>.drawer { background-color: rgb(0, 128, 0); transition-duration: 2s }</style>
      ${drawerLayout()}`);
    await enterModalMode();

    panel("nav").collapsed = false;
    const showing = await colorsUntil((color) => isColor(color, green));
    await animationsDone();
    await clickThrough(button("nav-button"));
    await userEvent.keyboard("{Escape}");
    expect(panel("nav").collapsed).toBe(true);
    expect(block("nav-content").checkVisibility()).toBe(true);
    const hiding = await colorsUntil(isBackdrop);

    expect(showing.some(isPartlyGreen)).toBe(true);
    expect(hiding.some(isPartlyGreen)).toBe(true);
    await expect.poll(() => block("nav-content").checkVisibility()).toBe(false);
  });

  test("showing it again mid-fade-out reverses the fade from where it got to", async () => {
    await render(`
      <style>
        .drawer { background-color: rgb(0, 128, 0); transition: 2s linear }
      </style>
      ${drawerLayout()}`);
    await enterModalMode();
    await show("nav", "nav-content");

    panel("nav").collapsed = true;
    const fadingOut = await colorsUntil((color) => greenness(color) < 90);
    panel("nav").collapsed = false;
    const fadingBack = await colorsUntil((color) => isColor(color, green));

    const reopenedAt = greenness(fadingOut.at(-1) ?? green);
    for (const color of fadingBack) expect(greenness(color)).toBeGreaterThan(reopenedAt - 20);
    expect(fadingBack.some((color) => greenness(color) < 118)).toBe(true);
    expect(block("nav-content").checkVisibility()).toBe(true);
    expect(elementAtCenterOf(button("main-button"))).not.toBe(button("main-button"));
  });
});

describe("a sheet while it fades or moves", () => {
  const fading = `<style>.drawer { transition-duration: 600ms }</style>${drawerLayout({ aside: modalAside() })}`;

  test("the page is live the moment the sheet starts closing; the fade is an inert leftover", async () => {
    await render(fading);
    const heading = document.createElement("h2");
    heading.tabIndex = -1;
    heading.textContent = "Results";
    panel("main").prepend(heading);
    await enterModalMode();
    await show("nav", "nav-content");

    panel("nav").collapsed = true;
    heading.focus();

    expect(document.activeElement).toBe(heading);
    expect(elementAtCenterOf(button("main-button"))).toBe(button("main-button"));
    expect(block("nav-content").checkVisibility()).toBe(true);
    button("nav-button").focus();
    expect(document.activeElement).toBe(heading);
    await animationsDone();
    expect(block("nav-content").checkVisibility()).toBe(false);
    expect(document.activeElement).toBe(heading);
  });

  test("after the user closes it, clicks and keys during the fade reach the page", async () => {
    await render(fading);
    await enterModalMode();
    await show("nav", "nav-content");
    await clickThrough(button("nav-button"));
    const recorded = recordEvents(panel("nav"), ["beforetoggle", "toggle"]);
    const clicks = recordEvents(button("main-button"), ["click"]);

    await userEvent.keyboard("{Escape}");
    await clickThrough(button("main-button"));

    expect(clicks).toHaveLength(1);
    expect(block("nav-content").checkVisibility()).toBe(true);
    expect(toggleStates(recorded)).toEqual([
      "beforetoggle open→closed cancelable",
      "toggle open→closed",
    ]);
  });

  test("a second Escape or backdrop click during the fade-out asks nothing again", async () => {
    await render(fading);
    await enterModalMode();
    await show("nav", "nav-content");
    await clickThrough(button("nav-button"));
    const recorded = recordEvents(panel("nav"), ["beforetoggle", "toggle"]);

    await userEvent.keyboard("{Escape}");
    await userEvent.keyboard("{Escape}");
    await clickThrough(button("main-button"));
    await animationsDone();

    expect(toggleStates(recorded)).toEqual([
      "beforetoggle open→closed cancelable",
      "toggle open→closed",
    ]);
  });

  test("moving a shown modal panel in the DOM, as a keyed reorder does, keeps it shown", async () => {
    await render(drawerLayout());
    await enterModalMode();
    await show("nav", "nav-content");
    const recorded = recordEvents(panel("nav"), ["beforetoggle", "toggle"]);

    group("layout").insertBefore(panel("nav"), separator("handle"));
    await frames(5);
    await animationsDone();

    expect(panel("nav").collapsed).toBe(false);
    expect(block("nav-content").checkVisibility()).toBe(true);
    expect(recorded).toEqual([]);
  });

  test("a listener collapsing the sheet that is showing, during the handover, leaves none shown", async () => {
    await render(fading);
    await enterModalMode();
    await show("nav", "nav-content");
    panel("nav").addEventListener("beforetoggle", () => {
      panel("aside").collapsed = true;
    });

    panel("aside").collapsed = false;
    await animationsDone();

    expect(panel("aside").collapsed).toBe(true);
    expect(block("aside-content").checkVisibility()).toBe(false);
    expect(block("nav-content").checkVisibility()).toBe(false);
  });

  test("hiding it right as its fade-in finishes still fades it out", async () => {
    await render(fading);
    await enterModalMode();
    panel("nav").collapsed = false;
    await Promise.all(pageAnimations().map((animation) => animation.finished));

    panel("nav").collapsed = true;
    await frames(3);

    expect(block("nav-content").checkVisibility()).toBe(true);
    await expect.poll(() => block("nav-content").checkVisibility()).toBe(false);
  });
});

describe("styling a modal panel", () => {
  test("in right-to-left, the sheet of the first panel is on the right, its start side", async () => {
    await render(`
      <style>.drawer { background-color: rgb(0, 128, 0) }</style>
      <div dir="rtl">${drawerLayout()}</div>`);
    await enterModalMode();

    await show("nav", "nav-content");

    const bottom = narrowViewport.height - 5;
    expect(isColor(await colorAt(narrowViewport.width - 150, bottom), green)).toBe(true);
    expect(isColor(await colorAt(150, bottom), green)).toBe(false);
  });

  test("by default the sheet is full height, on the panel's side, as wide as its size", async () => {
    await render(`
      <style>.drawer { background-color: rgb(0, 128, 0) }</style>
      ${drawerLayout({ aside: modalAside() })}`);
    await enterModalMode();
    const bottom = narrowViewport.height - 5;

    await show("nav", "nav-content");
    expect(isColor(await colorAt(150, bottom), green)).toBe(true);
    expect(isColor(await colorAt(280, bottom), green)).toBe(true);
    expect(isColor(await colorAt(320, bottom), green)).toBe(false);

    await show("aside", "aside-content");
    expect(isColor(await colorAt(narrowViewport.width - 100, bottom), green)).toBe(true);
    expect(isColor(await colorAt(narrowViewport.width - 220, bottom), green)).toBe(false);
  });

  test("the panel's own box styles go to the sheet, --bento-backdrop colors the backdrop", async () => {
    await render(`
      <style>
        @media ${modalQuery} {
          .drawer { width: 200px; padding-inline-start: 20px; background-color: rgb(0, 128, 0) }
        }
        .drawer { --bento-backdrop: rgb(128, 0, 0) }
      </style>
      ${drawerLayout()}`);
    await enterModalMode();

    await show("nav", "nav-content");

    expect(block("nav-content").getBoundingClientRect().left).toBeCloseTo(20, 0);
    expect(isColor(await colorAt(100, 250), green)).toBe(true);
    expect(isColor(await colorAt(260, 250), darkRed)).toBe(true);
    expect(isColor(await colorAt(500, 250), darkRed)).toBe(true);
  });

  test("a bottom sheet is plain CSS on the panel", async () => {
    await render(`
      <style>
        @media ${modalQuery} {
          .drawer {
            inset: auto 0 0 0; width: 100%; height: 50%; background-color: rgb(0, 128, 0);
          }
        }
      </style>
      ${drawerLayout()}`);
    await enterModalMode();

    await show("nav", "nav-content");

    expect(isColor(await colorAt(narrowViewport.width / 2, 100), green)).toBe(false);
    expect(isColor(await colorAt(narrowViewport.width / 2, 500), green)).toBe(true);
    expect(isColor(await colorAt(narrowViewport.width - 10, 500), green)).toBe(true);
  });
});
