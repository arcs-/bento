import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";
import { browserCommands } from "./test/commands.ts";
import { testViewport } from "./test/viewport.ts";

/**
 * macOS 27 protects ~/Library/Application Support/Firefox, which Playwright's Firefox reads
 * before its `-profile` and then fails to start (playwright#42768). A fresh home for Firefox
 * alone keeps it out of there.
 */
function firefoxLaunchOptions() {
  if (process.platform !== "darwin") return {};
  const inheritedEnvironment = Object.entries(process.env).filter(
    (variable): variable is [string, string] => variable[1] !== undefined,
  );
  const home = mkdtempSync(join(tmpdir(), "bento-firefox-home-"));
  return { env: { ...Object.fromEntries(inheritedEnvironment), CFFIXED_USER_HOME: home } };
}

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    globalSetup: ["test/build.ts"],
    setupFiles: ["test/setup.ts"],
    /** The pointer is the page's, shared by every test file's frame, so files take turns. */
    fileParallelism: false,
    browser: {
      enabled: true,
      provider: playwright(),
      headless: true,
      viewport: testViewport,
      screenshotFailures: false,
      commands: browserCommands,
      instances: [
        { browser: "chromium" },
        { browser: "firefox", provider: playwright({ launchOptions: firefoxLaunchOptions() }) },
        { browser: "webkit" },
      ],
    },
  },
});
