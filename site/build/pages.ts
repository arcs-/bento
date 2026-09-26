import { existsSync, readFileSync } from "node:fs";
import { basename, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";
import { bentoScriptName } from "./bento-script.ts";
import { codeBlock, escapeAttribute, escapeHtml, type Language, toLanguage } from "./highlight.ts";
import { markdownSection, markdownToHtml, type MarkdownOptions } from "./markdown.ts";
import { robots, seoHead, sitemap } from "./seo.ts";

export const siteRoot = fileURLToPath(new URL("..", import.meta.url));
const decisionsRoot = fileURLToPath(new URL("../../decisions", import.meta.url));
const layoutPath = join(siteRoot, "build/layout.html");

interface NavigationEntry {
  readonly file: string;
  readonly label: string;
  /** The inner markup of a 20 by 20 stroked SVG icon, shown alone in the rail. */
  readonly icon: string;
}

export const navigation: readonly NavigationEntry[] = [
  {
    file: "index.html",
    label: "Home",
    icon: '<rect x="2.5" y="4" width="15" height="12" rx="2"/><path d="M8.5 4v12M8.5 10h9"/>',
  },
  {
    file: "start.html",
    label: "Getting started",
    icon: '<path d="M3 10h10M9.5 6l4 4-4 4M16.5 4v12"/>',
  },
  {
    file: "guide.html",
    label: "Guide",
    icon: '<path d="M3 4.5h5a2 2 0 0 1 2 2V16a2 2 0 0 0-2-1.5H3zM17 4.5h-5a2 2 0 0 0-2 2V16a2 2 0 0 1 2-1.5h5z"/>',
  },
  {
    file: "api.html",
    label: "API reference",
    icon: '<path d="M7 5l-4 5 4 5M13 5l4 5-4 5"/>',
  },
  {
    file: "accessibility.html",
    label: "Accessibility",
    icon: '<circle cx="10" cy="4" r="1.5"/><path d="M4 7.5h12M10 7.5v4.5l-3 5M10 12l3 5"/>',
  },
  {
    file: "compatibility.html",
    label: "Browsers and CSP",
    icon: '<path d="M10 2.5 4 5v5c0 3.8 2.6 6.2 6 7.5 3.4-1.3 6-3.7 6-7.5V5z"/>',
  },
];

export const pageFiles = navigation.map(({ file }) => file);

/** Records are not on the site, so a link to one keeps only its text. */
const linkTarget = (href: string) => (/^\d{4}-[\w-]+\.md$/.test(href) ? null : href);

/** A section of a record, rendered without its references to other records, which are not on the site. */
function renderDecisionSection(file: string, heading: string): string {
  const withReferences = readFileSync(join(decisionsRoot, file), "utf8");
  const source = withReferences.replaceAll(/ \(\[\d{4}\]\(\d{4}-[\w-]+\.md\)\)/g, "");
  const options: MarkdownOptions = { headingOffset: 2, idPrefix: "", linkTarget };
  return markdownToHtml(markdownSection(source, heading), options);
}

const languages: Record<string, Language> = {
  ".ts": "ts",
  ".tsx": "ts",
  ".css": "css",
  ".html": "html",
};

/** A demo, shown live and as code; `<!-- demo tall -->` gives it a taller stage. */
const demoBlock = /<!-- demo( tall)? -->([\s\S]*?)<!-- \/demo -->/g;
/** Markup of a whole page that a code include narrows to with `#live`. */
const liveBlock = /<!-- live -->([\s\S]*?)<!-- \/live -->/g;

/**
 * What the code of a demo leaves out, because it only makes the demo read well on this site:
 * elements marked `data-demo-only` or `data-live-width`, with their content, and the classes
 * that give demos the site's look. The live demo keeps all of it, so both have one source.
 */
const siteOnlyElement = /<([\w-]+)\b[^>]*\sdata-(?:demo-only|live-width)\b[^>]*>/;
const siteOnlyClasses = new Set([
  "demo-content",
  "notes-content",
  "discard-prompt",
  "specimen-controls",
  "satin-button",
  "anodized",
]);

/** The index just past the element whose start tag is at `start`, nested namesakes included. */
function elementEnd(html: string, start: number, tag: string): number {
  let depth = 0;
  for (const match of html.slice(start).matchAll(new RegExp(`<(/?)${tag}\\b[^>]*>`, "g"))) {
    depth += match[1] ? -1 : 1;
    if (depth === 0) return start + match.index + match[0].length;
  }
  throw new Error(`a site-only <${tag}> in a demo is never closed`);
}

function withoutSiteOnlyElements(html: string): string {
  const marked = siteOnlyElement.exec(html);
  if (!marked) return html;
  const end = elementEnd(html, marked.index, marked[1] ?? "");
  return withoutSiteOnlyElements(html.slice(0, marked.index) + html.slice(end));
}

const withoutSiteOnlyClasses = (html: string) =>
  html.replaceAll(/\sclass="([^"]*)"/g, (_attribute, classes: string) => {
    const kept = classes.split(/\s+/).filter((name) => name && !siteOnlyClasses.has(name));
    return kept.length > 0 ? ` class="${kept.join(" ")}"` : "";
  });

/** A demo's markup as a user would write it; lines left empty by a removal go too. */
const demoCode = (markup: string) =>
  withoutSiteOnlyClasses(withoutSiteOnlyElements(markup)).replaceAll(/^[ \t]*\n/gm, "");

/** The files a page includes as code, so the dev server reloads when one changes. */
export const includedFiles = new Set<string>();

/**
 * Shows a file of the site as code, under a caption that defaults to its path; `#live` narrows
 * an HTML file to its live markup.
 */
function renderCodeInclude(reference: string, caption: string | undefined): string {
  const [path = "", fragment] = reference.split("#");
  const absolutePath = join(siteRoot, path);
  includedFiles.add(absolutePath);
  const source = readFileSync(absolutePath, "utf8");
  const language = languages[extname(path)] ?? "sh";
  const code =
    fragment === "live"
      ? demoCode([...source.matchAll(liveBlock)].map((match) => match[1] ?? "").join("\n"))
      : source;
  const title = escapeHtml(caption ?? path);
  return `<figure class="code-figure"><figcaption>${title}</figcaption>${codeBlock(code, language, caption ?? path)}</figure>`;
}

/** A demo, live and as the code a user would write for it. */
function renderDemo(markup: string, tall = false): string {
  const stage = tall ? "specimen-stage specimen-stage-tall" : "specimen-stage";
  return `<div class="specimen"><div class="${stage}">${markup}</div>${codeBlock(demoCode(markup), "html", "Markup of the demo above")}</div>`;
}

/** A demo kept in its own file, so pages that show the same one share it. */
function renderDemoFile(path: string): string {
  const absolutePath = join(siteRoot, path);
  includedFiles.add(absolutePath);
  return renderDemo(readFileSync(absolutePath, "utf8"));
}

/** Expands the markers a page writes; every demo is shown live and as the code it is. */
function expandMarkers(content: string): string {
  return content
    .replaceAll(
      /<!-- snippet (\w+) -->([\s\S]*?)<!-- \/snippet -->/g,
      (_block, language: string, code: string) => codeBlock(code, toLanguage(language)),
    )
    .replaceAll(liveBlock, (_block, markup: string) => markup)
    .replaceAll(demoBlock, (_block, tall: string | undefined, markup: string) =>
      renderDemo(markup, tall !== undefined),
    )
    .replaceAll(/<!-- demo-file: (\S+) -->/g, (_marker, path: string) => renderDemoFile(path))
    .replaceAll(
      /<!-- code: (\S+)(?: \| (.+?))? -->/g,
      (_marker, reference: string, caption: string | undefined) =>
        renderCodeInclude(reference, caption),
    )
    .replaceAll(
      /<!-- decision-section: (\S+) \| (.+?) -->/g,
      (_marker, file: string, heading: string) => renderDecisionSection(file, heading),
    );
}

/** Every page's ids and its links to pages of the site, checked once all pages are rendered. */
const idsByPage = new Map<string, ReadonlySet<string>>();
const siteLinksByPage = new Map<string, readonly string[]>();

function recordLinks(html: string, page: string): void {
  idsByPage.set(page, new Set([...html.matchAll(/\sid="([^"]+)"/g)].map(([, id = ""]) => id)));
  const links = [...html.matchAll(/\shref="([\w-]+\.html)?(#[^"]+)?"/g)]
    .filter(([, target, anchor]) => target !== undefined || anchor !== undefined)
    .map(([, target = page, anchor = ""]) => `${target}${anchor}`);
  siteLinksByPage.set(page, links);
}

/** Fails the build on a link to a page that is not built, or to an anchor its page lacks. */
function checkSiteLinks(): void {
  for (const [page, links] of siteLinksByPage) {
    for (const link of links) {
      const [target = "", anchor] = link.split("#");
      const ids = idsByPage.get(target);
      if (!ids) throw new Error(`${page} links to a page that is not built: ${link}`);
      if (anchor && !ids.has(anchor)) throw new Error(`${page} links to a missing anchor: ${link}`);
    }
  }
}

/** Fails the build on an id used twice, which would break anchors and `aria-controls`. */
function checkUniqueIds(html: string, page: string): void {
  const seen = new Set<string>();
  for (const [, id = ""] of html.matchAll(/\sid="([^"]+)"/g)) {
    if (seen.has(id)) throw new Error(`${page} uses the id "${id}" twice`);
    seen.add(id);
  }
}

const stripTags = (html: string) => html.replaceAll(/<[^>]+>/g, "").trim();

/**
 * The site navigation, with the current page's sections nested under its link as dots. The rail
 * keeps the dots and hides only the words, so nothing changes height when the nav collapses.
 */
function navigationHtml(currentFile: string, content: string): string {
  const sections = [...content.matchAll(/<h2 id="([^"]+)"[^>]*>([\s\S]*?)<\/h2>/g)];
  const items = navigation.map(({ file, label, icon }) => {
    const current = file === currentFile;
    const toc =
      current && sections.length > 0
        ? `<ol class="toc" aria-label="On this page">${sections
            .map(
              ([, id = "", heading = ""]) =>
                `<li><a class="toc-link" href="#${id}"><span class="toc-label">${stripTags(heading)}</span></a></li>`,
            )
            .join("")}</ol>`
        : "";
    return `<li>
      <a class="nav-link" href="${file}"${current ? ' aria-current="page"' : ""}>
        <svg class="nav-icon" viewBox="0 0 20 20" aria-hidden="true">${icon}</svg>
        <span class="nav-label">${label}</span>
      </a>${toc}
    </li>`;
  });
  return `<nav aria-label="Site"><ul class="nav-list">${items.join("")}</ul></nav>`;
}

interface PageMeta {
  readonly title: string;
  readonly description: string;
  readonly inspectorCollapsed: boolean;
}

function takeMeta(fragment: string): { meta: PageMeta; content: string } {
  const head = /^(?:\s*(?:<title>[\s\S]*?<\/title>|<meta\s[^>]*>))+/.exec(fragment)?.[0] ?? "";
  const title = /<title>([\s\S]*?)<\/title>/.exec(head)?.[1] ?? "bento";
  const description = /<meta\s+name="description"\s+content="([^"]*)"\s*\/?>/.exec(head)?.[1] ?? "";
  const inspector =
    /<meta\s+name="inspector"\s+content="([^"]*)"\s*\/?>/.exec(head)?.[1] ?? "collapsed";
  const content = fragment.slice(head.length).trim();
  return { meta: { title, description, inspectorCollapsed: inspector !== "open" }, content };
}

function fill(template: string, values: Record<string, string>): string {
  return template.replaceAll(/\{\{(\w+)\}\}/g, (_placeholder, key: string) => {
    const value = values[key];
    if (value === undefined) throw new Error(`layout placeholder {{${key}}} has no value`);
    return value;
  });
}

/**
 * A page file is a fragment: a `<title>`, a description and its content. The plugin puts it in
 * the shared layout, builds the navigation and the head's search tags, and expands demos and code. A
 * file that starts with a doctype is a whole document and only has its markers expanded.
 */
export function renderPage(file: string, source: string): string {
  if (/^<!doctype/i.test(source.trimStart())) {
    return expandMarkers(source).replaceAll("{{bentoScript}}", bentoScriptName);
  }
  const { meta, content } = takeMeta(source);
  const expanded = expandMarkers(content);
  const title = file === "index.html" ? meta.title : `${meta.title} = bento`;
  const page = fill(readFileSync(layoutPath, "utf8"), {
    title: escapeHtml(title),
    description: escapeAttribute(meta.description),
    seoHead: seoHead({ file, title, description: meta.description }),
    bentoScript: bentoScriptName,
    inspectorCollapsed: meta.inspectorCollapsed ? " collapsed" : "",
    navigation: navigationHtml(file, expanded),
    content: expanded,
  });
  checkUniqueIds(page, file);
  recordLinks(page, file);
  return page;
}

export function sitePages(): Plugin {
  return {
    name: "site-pages",
    transformIndexHtml: {
      order: "pre",
      handler: (html, context) => renderPage(basename(context.filename), html),
    },
    generateBundle() {
      checkSiteLinks();
      const map = sitemap(pageFiles);
      if (map) this.emitFile({ type: "asset", fileName: "sitemap.xml", source: map });
      this.emitFile({ type: "asset", fileName: "robots.txt", source: robots() });
    },
    configureServer(server) {
      const reloadOn = [layoutPath, decisionsRoot];
      server.watcher.add(reloadOn);
      server.watcher.on("change", (changed) => {
        const affectsPages =
          includedFiles.has(changed) || reloadOn.some((path) => changed.startsWith(path));
        if (affectsPages) server.ws.send({ type: "full-reload" });
      });
    },
  };
}

export function pageInputs(): Record<string, string> {
  const extraPages = ["modal-frame.html"];
  const files = [...pageFiles, ...extraPages].filter((file) => existsSync(join(siteRoot, file)));
  return Object.fromEntries(files.map((file) => [basename(file, ".html"), join(siteRoot, file)]));
}
