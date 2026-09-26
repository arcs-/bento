import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { build, type Plugin, type Rollup } from "vite";

const libraryRoot = fileURLToPath(new URL("../..", import.meta.url));
const bundlePath = join(libraryRoot, "dist/bento.js");

/** Where pages load the definitions from, relative to the site's base. */
export const bentoScriptName = "bento.js";

/** Builds dist/bento.js with the library's own config, the exact script that ships. */
function buildLibrary(watch: boolean) {
  return build({
    root: libraryRoot,
    configFile: join(libraryRoot, "vite.config.ts"),
    logLevel: "warn",
    build: { emptyOutDir: false, ...(watch ? { watch: {} } : {}) },
  });
}

const isWatcher = (output: unknown): output is Rollup.RollupWatcher =>
  typeof output === "object" && output !== null && "on" in output && "close" in output;

/**
 * Serves the built library as a classic script, the way the README tells apps to load it: a
 * blocking `<script>` in the head. A module script would be deferred and miss the first paint,
 * so even the dev server loads the bundle, rebuilt on every change to `src/`.
 */
export function bentoScript(): Plugin {
  return {
    name: "bento-script",

    async buildStart() {
      if (this.meta.watchMode) return;
      await buildLibrary(false);
      this.emitFile({ type: "asset", fileName: bentoScriptName, source: readFileSync(bundlePath) });
    },

    async configureServer(server) {
      const watcher = await buildLibrary(true);
      if (isWatcher(watcher)) {
        watcher.on("event", (event) => {
          if (event.code === "BUNDLE_END") void event.result.close();
          if (event.code === "END") server.ws.send({ type: "full-reload" });
        });
        server.httpServer?.on("close", () => void watcher.close());
      }
      const scriptUrl = server.config.base + bentoScriptName;
      server.middlewares.use((request, response, next) => {
        if (request.url?.split("?")[0] !== scriptUrl) return next();
        response.setHeader("Content-Type", "text/javascript");
        response.end(readFileSync(bundlePath));
      });
    },
  };
}
