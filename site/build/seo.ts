import { escapeAttribute } from "./highlight.ts";

/** The site's absolute URL with its base, such as `https://example.org/bento/`; unset in development. */
const siteUrl = (() => {
  const configured = process.env.BENTO_SITE_URL;
  if (!configured) return null;
  return new URL(configured.endsWith("/") ? configured : `${configured}/`);
})();

const pageUrl = (file: string) =>
  siteUrl ? new URL(file === "index.html" ? "" : file, siteUrl).href : null;

export interface PageDescription {
  readonly file: string;
  readonly title: string;
  readonly description: string;
}

const meta = (attribute: "name" | "property", key: string, value: string) =>
  `<meta ${attribute}="${key}" content="${escapeAttribute(value)}" />`;

/** Data about the library for search engines; a data block, which no script policy governs. */
function structuredData(): string {
  const data = {
    "@context": "https://schema.org",
    "@type": "SoftwareSourceCode",
    name: "bento",
    description: "A framework independent library that creates nicely resizable panel UIs.",
    programmingLanguage: "TypeScript",
    runtimePlatform: "Web browsers",
    license: "https://opensource.org/licenses/MIT",
    codeRepository: "https://github.com/arcs-/bento",
    author: { "@type": "Person", name: "Patrick Stillhart", url: "https://stillh.art" },
    ...(siteUrl ? { url: siteUrl.href } : {}),
  };
  return `<script type="application/ld+json">${JSON.stringify(data)}</script>`;
}

/**
 * Canonical URL, Open Graph and Twitter cards for one page. Absolute URLs need the site's URL,
 * so the canonical link and the image appear only when `BENTO_SITE_URL` is set.
 */
export function seoHead({ file, title, description }: PageDescription): string {
  const url = pageUrl(file);
  const image = siteUrl ? new URL("og-image.png", siteUrl).href : null;
  const tags = [
    url ? `<link rel="canonical" href="${escapeAttribute(url)}" />` : "",
    meta("property", "og:type", "website"),
    meta("property", "og:site_name", "bento"),
    meta("property", "og:title", title),
    meta("property", "og:description", description),
    url ? meta("property", "og:url", url) : "",
    image ? meta("property", "og:image", image) : "",
    image ? meta("property", "og:image:width", "1200") : "",
    image ? meta("property", "og:image:height", "630") : "",
    image ? meta("property", "og:image:alt", "The bento box icon on brushed steel") : "",
    meta("name", "twitter:card", image ? "summary_large_image" : "summary"),
    meta("name", "twitter:title", title),
    meta("name", "twitter:description", description),
    file === "index.html" ? structuredData() : "",
  ];
  return tags.filter(Boolean).join("\n    ");
}

/** The sitemap lists every page, or nothing without a site URL to make them absolute. */
export function sitemap(files: readonly string[]): string | null {
  if (!siteUrl) return null;
  const entries = files.map((file) => `  <url><loc>${pageUrl(file)}</loc></url>`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.join("\n")}\n</urlset>\n`;
}

export function robots(): string {
  const sitemapLine = siteUrl ? `Sitemap: ${new URL("sitemap.xml", siteUrl).href}\n` : "";
  return `User-agent: *\nAllow: /\n${sitemapLine}`;
}
