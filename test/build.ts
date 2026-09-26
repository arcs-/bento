import { build } from "vite";
import type { TestProject } from "vitest/node";

const buildBundle = async (): Promise<void> => {
  await build({ logLevel: "warn", build: { emptyOutDir: false } });
};

/**
 * Builds dist/bento.js before every run, watch reruns included, so every test loads the
 * minified script that ships.
 */
export default async function setup(project: TestProject): Promise<void> {
  await buildBundle();
  project.onTestsRerun(buildBundle);
}
