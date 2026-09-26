/** A build-time syntax highlighter for the few languages the docs show. No runtime cost. */

const languages = ["html", "ts", "css", "sh"] as const;

export type Language = (typeof languages)[number];

export function toLanguage(name: string): Language {
  const language = languages.find((candidate) => candidate === name);
  if (!language) throw new Error(`no highlighting for "${name}"`);
  return language;
}

export function escapeHtml(text: string): string {
  return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

export function escapeAttribute(text: string): string {
  return escapeHtml(text).replaceAll('"', "&quot;");
}

const token = (kind: string, text: string) =>
  `<span class="tok-${kind}">${escapeHtml(text)}</span>`;

interface Rule {
  readonly kind: string;
  readonly pattern: RegExp;
}

/** Applies the first rule that matches at each position; unmatched text passes through escaped. */
function highlightWith(source: string, rules: readonly Rule[]): string {
  const combined = new RegExp(rules.map(({ pattern }) => `(${pattern.source})`).join("|"), "g");
  let html = "";
  let position = 0;
  for (const match of source.matchAll(combined)) {
    html += escapeHtml(source.slice(position, match.index));
    const ruleIndex = match.slice(1).findIndex((group) => group !== undefined);
    html += token(rules[ruleIndex]?.kind ?? "plain", match[0]);
    position = match.index + match[0].length;
  }
  return html + escapeHtml(source.slice(position));
}

const tsKeywords =
  /\b(?:import|export|from|type|interface|const|let|function|return|if|else|for|of|new|class|extends|implements|readonly|private|async|await|true|false|null|undefined|this|void|typeof|instanceof|in|as|try|catch|default)\b/;

const scriptRules: readonly Rule[] = [
  { kind: "comment", pattern: /\/\*[\s\S]*?\*\/|\/\/[^\n]*/ },
  { kind: "string", pattern: /"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`/ },
  { kind: "keyword", pattern: tsKeywords },
  /** JSX elements: lower-case names only, so a generic such as `useRef<Element>` stays plain. */
  { kind: "tag", pattern: /<\/?[a-z][\w-]*|\/>/ },
  { kind: "number", pattern: /\b\d+(?:\.\d+)?(?:px|ms|%)?\b/ },
];

const cssRules: readonly Rule[] = [
  { kind: "comment", pattern: /\/\*[\s\S]*?\*\// },
  { kind: "string", pattern: /"[^"\n]*"|'[^'\n]*'/ },
  { kind: "keyword", pattern: /@[\w-]+|:state\([\w-]+\)|:not\(:defined\)|::?[\w-]+/ },
  /** Selectors: names followed by a `{` before any `;` or `}`. */
  { kind: "tag", pattern: /[.#]?[a-z][\w-]*(?=[^{};]*\{)/ },
  { kind: "attr", pattern: /--[\w-]+|[\w-]+(?=\s*:\s)/ },
  { kind: "number", pattern: /\b\d+(?:\.\d+)?(?:px|ms|s|%|vw|rem)?\b/ },
];

const shellRules: readonly Rule[] = [
  { kind: "comment", pattern: /#[^\n]*/ },
  { kind: "keyword", pattern: /^(?:npm|pnpm|yarn)\b/ },
];

/** Highlights one tag's inside: its name, then attributes and their values. */
function highlightTag(tag: string): string {
  const parts = /^(<\/?)([\w-]+)([\s\S]*?)(\/?>)$/.exec(tag);
  if (!parts) return escapeHtml(tag);
  const [, open = "", name = "", attributes = "", close = ""] = parts;
  let highlighted = "";
  let position = 0;
  for (const match of attributes.matchAll(/([\w:@.-]+)(?:=("[^"]*"|'[^']*'|[^\s>]+))?/g)) {
    const [, attribute = "", value] = match;
    highlighted += escapeHtml(attributes.slice(position, match.index));
    highlighted +=
      token("attr", attribute) + (value === undefined ? "" : `=${token("value", value)}`);
    position = match.index + match[0].length;
  }
  highlighted += escapeHtml(attributes.slice(position));
  return token("punct", open) + token("tag", name) + highlighted + token("punct", close);
}

function highlightHtml(source: string): string {
  let html = "";
  let position = 0;
  for (const match of source.matchAll(/<!--[\s\S]*?-->|<\/?[\w-]+(?:\s[^<>]*?)?\/?>/g)) {
    html += escapeHtml(source.slice(position, match.index));
    html += match[0].startsWith("<!--") ? token("comment", match[0]) : highlightTag(match[0]);
    position = match.index + match[0].length;
  }
  return html + escapeHtml(source.slice(position));
}

export function highlight(source: string, language: Language): string {
  switch (language) {
    case "html":
      return highlightHtml(source);
    case "ts":
      return highlightWith(source, scriptRules);
    case "css":
      return highlightWith(source, cssRules);
    case "sh":
      return highlightWith(source, shellRules);
  }
}

/** Removes the indentation every non-empty line shares, and blank lines at either end. */
export function dedent(source: string): string {
  const lines = source.replaceAll("\t", "  ").split("\n");
  while (lines[0]?.trim() === "") lines.shift();
  while (lines.at(-1)?.trim() === "") lines.pop();
  const indents = lines
    .filter((line) => line.trim())
    .map((line) => /^ */.exec(line)?.[0].length ?? 0);
  const shared = Math.min(...indents);
  return lines.map((line) => line.slice(shared)).join("\n");
}

export function codeBlock(source: string, language: Language, label?: string): string {
  const labelAttribute = label ? ` aria-label="${escapeAttribute(label)}"` : "";
  return `<pre class="code" data-language="${language}" tabindex="0"${labelAttribute}><code>${highlight(dedent(source), language)}</code></pre>`;
}
