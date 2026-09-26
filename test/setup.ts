import "../src/define.ts";
import { afterEach } from "vitest";
import { commands, page } from "vitest/browser";
import { removeRendered } from "./fixtures.ts";
import { testViewport } from "./viewport.ts";

afterEach(async () => {
  await commands.pointerUp();
  removeRendered();
  await commands.emulateReducedMotion("no-preference");
  await page.viewport(testViewport.width, testViewport.height);
});
