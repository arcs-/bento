import { build } from "vite";

/** Builds dist/bento.js first, so the parse-time tests load the script that ships. */
export default async function buildBundle(): Promise<void> {
  await build({ logLevel: "warn", build: { emptyOutDir: false } });
}
