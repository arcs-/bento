import { codeBlock, escapeAttribute, escapeHtml, toLanguage } from "./highlight.ts";

/**
 * A Markdown converter for the subset the records in `decisions/` use: headings, paragraphs,
 * lists, tables, fenced code, inline code, bold and links. Anything else renders as text.
 */

export interface MarkdownOptions {
  /** Added to every heading level, so a record's `#` title can sit below the page's `h1`. */
  readonly headingOffset: number;
  /** Keeps heading ids unique when several documents share a page. */
  readonly idPrefix: string;
  /** Maps a link target; null keeps only the link's text. */
  readonly linkTarget: (href: string) => string | null;
}

/** Inline code first, so nothing inside it is read as Markdown. */
function inline(text: string, options: MarkdownOptions): string {
  return text
    .split(/(`[^`]+`)/)
    .map((part) => {
      if (part.startsWith("`") && part.endsWith("`") && part.length > 1) {
        return `<code>${escapeHtml(part.slice(1, -1))}</code>`;
      }
      return escapeHtml(part)
        .replaceAll(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
        .replaceAll(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_link, label: string, href: string) => {
          const target = options.linkTarget(href);
          if (target === null) return label;
          const external = /^https?:/.test(target) ? ' rel="external"' : "";
          return `<a href="${escapeAttribute(target)}"${external}>${label}</a>`;
        });
    })
    .join("");
}

const tableCells = (row: string) =>
  row
    .trim()
    .replace(/^\||\|$/g, "")
    .split("|")
    .map((cell) => cell.trim());

function table(rows: readonly string[], options: MarkdownOptions): string {
  const [header = "", , ...body] = rows;
  const headCells = tableCells(header).map(
    (cell) => `<th scope="col">${inline(cell, options)}</th>`,
  );
  const bodyRows = body.map(
    (row) =>
      `<tr>${tableCells(row)
        .map((cell) => `<td>${inline(cell, options)}</td>`)
        .join("")}</tr>`,
  );
  return `<div class="table-well" tabindex="0"><table><thead><tr>${headCells.join("")}</tr></thead><tbody>${bodyRows.join("")}</tbody></table></div>`;
}

export function slug(text: string): string {
  return text
    .toLowerCase()
    .replaceAll(/[^\w\s-]/g, "")
    .trim()
    .replaceAll(/\s+/g, "-");
}

const blockStarts = /^(#{1,6} |- |\||```)/;

export function markdownToHtml(source: string, options: MarkdownOptions): string {
  const lines = source.replaceAll("\r\n", "\n").split("\n");
  const blocks: string[] = [];
  let index = 0;
  const takeWhile = (keep: (line: string) => boolean) => {
    const taken: string[] = [];
    while (index < lines.length && keep(lines[index] ?? "")) taken.push(lines[index++] ?? "");
    return taken;
  };

  while (index < lines.length) {
    const line = lines[index] ?? "";
    const heading = /^(#{1,6}) (.+)$/.exec(line);
    if (line.trim() === "") {
      index++;
    } else if (heading) {
      const level = Math.min(6, (heading[1]?.length ?? 1) + options.headingOffset);
      const text = heading[2] ?? "";
      const id = options.idPrefix + slug(text);
      blocks.push(`<h${level} id="${id}">${inline(text, options)}</h${level}>`);
      index++;
    } else if (line.startsWith("```")) {
      const language = toLanguage(line.slice(3).trim() || "sh");
      index++;
      const code = takeWhile((candidate) => !candidate.startsWith("```"));
      index++;
      blocks.push(codeBlock(code.join("\n"), language));
    } else if (line.startsWith("|")) {
      blocks.push(
        table(
          takeWhile((candidate) => candidate.startsWith("|")),
          options,
        ),
      );
    } else if (line.startsWith("- ")) {
      const items = takeWhile((candidate) => candidate.startsWith("- "));
      const listItems = items.map((item) => `<li>${inline(item.slice(2), options)}</li>`);
      blocks.push(`<ul>${listItems.join("")}</ul>`);
    } else {
      const paragraph = takeWhile(
        (candidate) => candidate.trim() !== "" && !blockStarts.test(candidate),
      );
      blocks.push(`<p>${inline(paragraph.join(" "), options)}</p>`);
    }
  }
  return blocks.join("\n");
}

/** The body of the `## heading` section, up to the next heading of that level or higher. */
export function markdownSection(source: string, heading: string): string {
  const lines = source.split("\n");
  const start = lines.findIndex((line) => line === `## ${heading}`);
  if (start < 0) throw new Error(`no section "## ${heading}"`);
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => /^#{1,2} /.test(line));
  return rest.slice(0, end < 0 ? undefined : end).join("\n");
}
