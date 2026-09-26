/**
 * Renders the social preview, site/public/og-image.png at 1200 by 630: the icon and the name on
 * brushed steel. Run it with `pnpm site:og` when the icon or the tagline changes; the PNG is
 * committed, so builds need no browser.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const publicDirectory = fileURLToPath(new URL("../public/", import.meta.url));
const icon = readFileSync(`${publicDirectory}icon.png`).toString("base64");

const page = `<!doctype html>
<html><head><style>
  html, body { margin: 0; inline-size: 1200px; block-size: 630px; }
  body {
    display: grid; place-content: center; justify-items: center; gap: 28px;
    font-family: "DIN Alternate", "Bahnschrift", system-ui, sans-serif; color: #1a222c;
    background:
      repeating-linear-gradient(180deg, rgb(255 255 255 / 0.16) 0 1px, transparent 1px 2px),
      repeating-linear-gradient(180deg, rgb(20 28 38 / 0.04) 0 1px, transparent 1px 3px),
      linear-gradient(105deg, transparent 20%, rgb(255 255 255 / 0.4) 45%, transparent 70%),
      linear-gradient(180deg, #dde1e5, #c5ccd3);
  }
  .brand { display: flex; align-items: center; gap: 32px; }
  img { inline-size: 160px; block-size: 160px; image-rendering: auto; }
  h1 { margin: 0; font-size: 150px; line-height: 1; letter-spacing: 0.01em; }
  p { margin: 0; font-size: 40px; color: #4a5562; }
  .rule { inline-size: 420px; block-size: 6px; border-radius: 3px; background: #ffce29; }
</style></head><body>
  <div class="brand"><img src="data:image/png;base64,${icon}" alt=""><h1>bento</h1></div>
  <div class="rule"></div>
  <p>Resizable panel layouts as web components</p>
</body></html>`;

const browser = await chromium.launch();
const tab = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await tab.setContent(page, { waitUntil: "load" });
await tab.screenshot({ path: `${publicDirectory}og-image.png` });
await browser.close();
console.log("wrote site/public/og-image.png");
