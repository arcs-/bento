/** The shipped, minified script, which test/build.ts builds before every run. */
import "../dist/bento.js";
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
