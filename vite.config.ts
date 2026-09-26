import { defineConfig } from "vite";

/** Baseline Widely available as of September 2026, see decisions/0005. */
const baselineWidelyAvailable = ["chrome123", "edge123", "firefox124", "safari17.4"];

/**
 * One minified, self-contained IIFE: it runs as a blocking classic `<script>` in the head and
 * as an `import 'bento'` side-effect module, and leaks no global. The entry exports nothing,
 * so the IIFE assigns nothing to `name`, which Vite merely requires to be set.
 */
export default defineConfig({
  build: {
    target: baselineWidelyAvailable,
    minify: true,
    lib: {
      entry: "src/define.ts",
      name: "bento",
      formats: ["iife"],
      fileName: () => "bento.js",
    },
  },
});
