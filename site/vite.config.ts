import { defineConfig } from "vite";
import { bentoScript } from "./build/bento-script.ts";
import { pageInputs, sitePages, siteRoot } from "./build/pages.ts";

/** Baseline Widely available as of September 2026, as for the library, see decisions/0005. */
const baselineWidelyAvailable = ["chrome123", "edge123", "firefox124", "safari17.4"];

/**
 * The docs site: plain multi-page HTML, CSS and a little TypeScript. `BENTO_SITE_BASE` sets the
 * public path, for example `/bento/` on GitHub Pages; pages link each other relatively.
 */
export default defineConfig({
  root: siteRoot,
  base: process.env.BENTO_SITE_BASE ?? "/",
  publicDir: false,
  plugins: [bentoScript(), sitePages()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    target: baselineWidelyAvailable,
    modulePreload: { polyfill: false },
    assetsInlineLimit: 0,
    rollupOptions: { input: pageInputs() },
  },
});
