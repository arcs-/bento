import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";
import { bentoScriptName } from "./bento-script.ts";
import { codeBlock, escapeAttribute, escapeHtml, type Language, toLanguage } from "./highlight.ts";
import { markdownSection, markdownToHtml, type MarkdownOptions } from "./markdown.ts";

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
  {
    file: "decisions.html",
    label: "Design decisions",
    icon: '<path d="M5 2.5h7l3 3v12H5z"/><path d="M8 9h4M8 12h4"/>',
  },
];

export const pageFiles = navigation.map(({ file }) => file);

const decisionFiles = () =>
  readdirSync(decisionsRoot)
    .filter((file) => file.endsWith(".md"))
    .toSorted();

const decisionAnchor = (file: string) => basename(file, ".md");

/** A sibling record's file name becomes its anchor on the decisions page. */
function linkTarget(href: string): string {
  return /^\d{4}-[\w-]+\.md$/.test(href) ? `decisions.html#${decisionAnchor(href)}` : href;
}

function renderDecision(file: string): string {
  const source = readFileSync(join(decisionsRoot, file), "utf8");
  const [titleLine = "", ...body] = source.split("\n");
  const anchor = decisionAnchor(file);
  const number = anchor.slice(0, 4);
  const title = titleLine.replace(/^# /, "");
  const options: MarkdownOptions = { headingOffset: 1, idPrefix: `${anchor}-`, linkTarget };
  return `<article class="record" aria-labelledby="${anchor}">
  <h2 id="${anchor}"><span class="record-number">${number}</span> ${escapeHtml(title)}</h2>
  ${markdownToHtml(body.join("\n"), options)}
</article>`;
}

function renderDecisionSection(file: string, heading: string): string {
  const source = readFileSync(join(decisionsRoot, file), "utf8");
  const options: MarkdownOptions = { headingOffset: 2, idPrefix: "", linkTarget };
  return markdownToHtml(markdownSection(source, heading), options);
}

const languages: Record<string, Language> = {
  ".ts": "ts",
  ".tsx": "ts",
  ".css": "css",
  ".html": "html",
};

const liveBlock = /<!-- (demo|live) -->([\s\S]*?)<!-- \/\1 -->/g;

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
      ? [...source.matchAll(liveBlock)].map((match) => match[2] ?? "").join("\n")
      : source;
  const title = escapeHtml(caption ?? path);
  return `<figure class="code-figure"><figcaption>${title}</figcaption>${codeBlock(code, language, caption ?? path)}</figure>`;
}

/** A demo, live and as the code it is. */
function renderDemo(markup: string): string {
  return `<div class="specimen"><div class="specimen-stage">${markup}</div>${codeBlock(markup, "html", "Markup of the demo above")}</div>`;
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
    .replaceAll(liveBlock, (_block, kind: string, markup: string) =>
      kind === "live" ? markup : renderDemo(markup),
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
    )
    .replaceAll("<!-- decisions -->", () => decisionFiles().map(renderDecision).join("\n"));
}

/** Fails the build on a link to a record that does not exist. */
function checkDecisionLinks(html: string, page: string): void {
  const anchors = new Set(decisionFiles().map(decisionAnchor));
  for (const [, anchor = ""] of html.matchAll(/decisions\.html#(\d{4}-[\w-]+?)"/g)) {
    if (!anchors.has(anchor)) throw new Error(`${page} links to a missing record: ${anchor}`);
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
 * The site navigation, then the current page's sections as their own list, so hiding that list
 * in the rail moves nothing above it.
 */
function navigationHtml(currentFile: string, content: string): string {
  const items = navigation.map(({ file, label, icon }) => {
    const current = file === currentFile ? ' aria-current="page"' : "";
    return `<li>
      <a class="nav-link" href="${file}"${current}>
        <svg class="nav-icon" viewBox="0 0 20 20" aria-hidden="true">${icon}</svg>
        <span class="nav-label">${label}</span>
      </a>
    </li>`;
  });
  const sections = [...content.matchAll(/<h2 id="([^"]+)"[^>]*>([\s\S]*?)<\/h2>/g)];
  const sectionItems = sections.map(
    ([, id = "", heading = ""]) =>
      `<li><a class="toc-link" href="#${id}">${stripTags(heading)}</a></li>`,
  );
  const toc =
    sectionItems.length > 0
      ? `<nav class="toc-section" aria-labelledby="toc-title">
      <p id="toc-title" class="toc-title">On this page</p>
      <ol class="toc">${sectionItems.join("")}</ol>
    </nav>`
      : "";
  return `<nav aria-label="Site"><ul class="nav-list">${items.join("")}</ul></nav>${toc}`;
}

interface PageMeta {
  readonly title: string;
  readonly description: string;
  readonly inspectorCollapsed: boolean;
}

function takeMeta(fragment: string): { meta: PageMeta; content: string } {
  const title = /<title>([\s\S]*?)<\/title>/.exec(fragment)?.[1] ?? "bento";
  const description =
    /<meta\s+name="description"\s+content="([^"]*)"\s*\/?>/.exec(fragment)?.[1] ?? "";
  const inspector =
    /<meta\s+name="inspector"\s+content="([^"]*)"\s*\/?>/.exec(fragment)?.[1] ?? "collapsed";
  const content = fragment.replaceAll(/<title>[\s\S]*?<\/title>|<meta\s[^>]*>/g, "").trim();
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
 * the shared layout, builds the navigation, and expands demos, code and decision records. A
 * file that starts with a doctype is a whole document and only has its markers expanded.
 */
export function renderPage(file: string, source: string): string {
  if (/^<!doctype/i.test(source.trimStart())) {
    return expandMarkers(source).replaceAll("{{bentoScript}}", bentoScriptName);
  }
  const { meta, content } = takeMeta(source);
  const expanded = expandMarkers(content);
  checkDecisionLinks(expanded, file);
  const page = fill(readFileSync(layoutPath, "utf8"), {
    title: escapeHtml(file === "index.html" ? meta.title : `${meta.title} – bento`),
    description: escapeAttribute(meta.description),
    bentoScript: bentoScriptName,
    inspectorCollapsed: meta.inspectorCollapsed ? " collapsed" : "",
    navigation: navigationHtml(file, expanded),
    content: expanded,
  });
  checkUniqueIds(page, file);
  return page;
}

export function sitePages(): Plugin {
  return {
    name: "site-pages",
    transformIndexHtml: {
      order: "pre",
      handler: (html, context) => renderPage(basename(context.filename), html),
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
