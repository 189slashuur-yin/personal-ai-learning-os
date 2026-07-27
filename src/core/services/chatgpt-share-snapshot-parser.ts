import type { ParsedMessageDraft } from "@/core/entities/import-parser";

export const CHATGPT_SHARE_SNAPSHOT_PARSER_VERSION = "1.0.0";

export type ChatGPTShareSnapshotInputKind = "saved-html" | "pasted-text";

export type ChatGPTShareSnapshotMessageDraft = Omit<
  ParsedMessageDraft,
  "role"
> & {
  role: "user" | "assistant";
  ordinal: number;
};

export type ChatGPTShareSnapshotParseResult = {
  title: string;
  messages: ChatGPTShareSnapshotMessageDraft[];
  inputKind: ChatGPTShareSnapshotInputKind;
  parserVersion: typeof CHATGPT_SHARE_SNAPSHOT_PARSER_VERSION;
  warnings: string[];
  errors: string[];
};

export type ChatGPTShareSnapshotInput =
  | {
      kind: "saved-html";
      content: string;
    }
  | {
      kind: "pasted-text";
      content: string;
    };

type HtmlAttributes = Record<string, string>;

type HtmlToken =
  | {
      type: "start";
      name: string;
      attributes: HtmlAttributes;
      selfClosing: boolean;
    }
  | {
      type: "end";
      name: string;
    }
  | {
      type: "text";
      value: string;
    };

type HtmlStackEntry = {
  name: string;
  hidden: boolean;
  messageRoot: boolean;
  titleRoot: boolean;
  preformatted: boolean;
};

type ActiveHtmlMessage = {
  role: "user" | "assistant";
  chunks: string[];
};

const SKIPPED_TAGS = new Set([
  "button",
  "canvas",
  "footer",
  "form",
  "nav",
  "noscript",
  "script",
  "style",
  "svg",
  "template",
  "textarea",
]);

const BLOCK_TAGS = new Set([
  "address",
  "article",
  "aside",
  "blockquote",
  "div",
  "dl",
  "fieldset",
  "figcaption",
  "figure",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "header",
  "hr",
  "li",
  "main",
  "ol",
  "p",
  "pre",
  "section",
  "table",
  "tbody",
  "td",
  "tfoot",
  "th",
  "thead",
  "tr",
  "ul",
]);

const VOID_TAGS = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
]);

const HTML_ENTITIES: Record<string, string> = {
  amp: "&",
  apos: "'",
  gt: ">",
  hellip: "…",
  ldquo: "“",
  lsquo: "‘",
  lt: "<",
  mdash: "—",
  nbsp: "\u00a0",
  ndash: "–",
  quot: '"',
  rdquo: "”",
  rsquo: "’",
};

function decodeHtmlEntities(value: string): string {
  return value.replace(
    /&(#(?:x[\da-f]+|\d+)|[a-z][\da-z]+);/gi,
    (entity, body: string) => {
      if (body.startsWith("#x") || body.startsWith("#X")) {
        const codePoint = Number.parseInt(body.slice(2), 16);
        return Number.isFinite(codePoint)
          ? String.fromCodePoint(codePoint)
          : entity;
      }
      if (body.startsWith("#")) {
        const codePoint = Number.parseInt(body.slice(1), 10);
        return Number.isFinite(codePoint)
          ? String.fromCodePoint(codePoint)
          : entity;
      }
      return HTML_ENTITIES[body.toLowerCase()] ?? entity;
    },
  );
}

function parseAttributes(raw: string): HtmlAttributes {
  const attributes: HtmlAttributes = {};
  const tagNameMatch = raw.match(/^<\s*[^\s/>]+/);
  const body = raw
    .slice(tagNameMatch?.[0].length ?? 0)
    .replace(/\/?\s*>$/, "");
  const pattern =
    /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

  for (const match of body.matchAll(pattern)) {
    const name = match[1].toLowerCase();
    const value = match[2] ?? match[3] ?? match[4] ?? "";
    attributes[name] = decodeHtmlEntities(value);
  }
  return attributes;
}

function findTagEnd(html: string, start: number): number {
  let quote: '"' | "'" | null = null;
  for (let index = start + 1; index < html.length; index += 1) {
    const character = html[index];
    if (quote) {
      if (character === quote) quote = null;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (character === ">") return index;
  }
  return -1;
}

function tokenizeHtml(html: string): HtmlToken[] {
  const tokens: HtmlToken[] = [];
  let cursor = 0;

  while (cursor < html.length) {
    const open = html.indexOf("<", cursor);
    if (open < 0) {
      tokens.push({ type: "text", value: html.slice(cursor) });
      break;
    }
    if (open > cursor) {
      tokens.push({ type: "text", value: html.slice(cursor, open) });
    }
    if (html.startsWith("<!--", open)) {
      const commentEnd = html.indexOf("-->", open + 4);
      cursor = commentEnd < 0 ? html.length : commentEnd + 3;
      continue;
    }

    const close = findTagEnd(html, open);
    if (close < 0) {
      tokens.push({ type: "text", value: html.slice(open) });
      break;
    }
    const raw = html.slice(open, close + 1);
    const endMatch = raw.match(/^<\s*\/\s*([a-zA-Z][\w:-]*)/);
    if (endMatch) {
      tokens.push({ type: "end", name: endMatch[1].toLowerCase() });
      cursor = close + 1;
      continue;
    }
    const startMatch = raw.match(/^<\s*([a-zA-Z][\w:-]*)/);
    if (startMatch) {
      const name = startMatch[1].toLowerCase();
      tokens.push({
        type: "start",
        name,
        attributes: parseAttributes(raw),
        selfClosing: /\/\s*>$/.test(raw) || VOID_TAGS.has(name),
      });
    }
    cursor = close + 1;
  }

  return tokens;
}

function isHiddenElement(name: string, attributes: HtmlAttributes): boolean {
  return (
    SKIPPED_TAGS.has(name) ||
    "hidden" in attributes ||
    attributes["aria-hidden"]?.toLowerCase() === "true" ||
    attributes.role?.toLowerCase() === "button" ||
    attributes.style
      ?.toLowerCase()
      .replace(/\s+/g, "")
      .includes("display:none") === true
  );
}

function messageRole(
  attributes: HtmlAttributes,
): "user" | "assistant" | null {
  const value = attributes["data-message-author-role"]?.toLowerCase();
  return value === "user" || value === "assistant" ? value : null;
}

function appendBoundary(chunks: string[]): void {
  if (chunks.length === 0 || chunks[chunks.length - 1].endsWith("\n")) return;
  chunks.push("\n");
}

function normalizeVisibleHtmlText(chunks: string[]): string {
  const value = chunks.join("").replace(/\r\n?/g, "\n");
  const lines = value.split("\n").map((line) => line.replace(/[ \t]+$/g, ""));
  while (lines.length > 0 && !lines[0].trim()) lines.shift();
  while (lines.length > 0 && !lines[lines.length - 1].trim()) lines.pop();

  const compacted: string[] = [];
  for (const line of lines) {
    if (!line.trim() && !compacted[compacted.length - 1]?.trim()) continue;
    compacted.push(line);
  }
  return compacted.join("\n");
}

function cleanTitle(value: string): string {
  return value
    .replace(/\s*[|–—-]\s*ChatGPT\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function fallbackTitle(messages: ChatGPTShareSnapshotMessageDraft[]): string {
  const firstUser = messages.find((message) => message.role === "user");
  return (
    firstUser?.content.split("\n")[0].trim().slice(0, 80) ||
    "ChatGPT Share Snapshot"
  );
}

function parseSavedHtml(content: string): ChatGPTShareSnapshotParseResult {
  const warnings: string[] = [];
  const errors: string[] = [];
  const messages: ChatGPTShareSnapshotMessageDraft[] = [];
  const stack: HtmlStackEntry[] = [];
  let activeMessage: ActiveHtmlMessage | null = null;
  const titleChunks: string[] = [];
  let metadataTitle = "";

  if (!content.trim()) {
    return {
      title: "ChatGPT Share Snapshot",
      messages,
      inputKind: "saved-html",
      parserVersion: CHATGPT_SHARE_SNAPSHOT_PARSER_VERSION,
      warnings,
      errors: ["ChatGPT Share Snapshot HTML is empty."],
    };
  }

  for (const token of tokenizeHtml(content)) {
    const parent = stack[stack.length - 1];
    const parentHidden = parent?.hidden ?? false;

    if (token.type === "text") {
      if (parentHidden) continue;
      const decoded = decodeHtmlEntities(token.value);
      if (activeMessage) {
        if (parent?.preformatted) {
          activeMessage.chunks.push(decoded);
        } else {
          const visible = decoded.replace(/\s+/g, " ");
          if (visible.trim()) activeMessage.chunks.push(visible);
        }
      }
      if (parent?.titleRoot) titleChunks.push(decoded);
      continue;
    }

    if (token.type === "start") {
      const hidden = parentHidden || isHiddenElement(token.name, token.attributes);
      const role = hidden ? null : messageRole(token.attributes);
      const messageRoot = Boolean(role && !activeMessage);
      const titleRoot = !hidden && token.name === "title";
      const preformatted =
        !hidden && (parent?.preformatted === true || token.name === "pre");

      if (
        !hidden &&
        token.name === "meta" &&
        (token.attributes.property?.toLowerCase() === "og:title" ||
          token.attributes.name?.toLowerCase() === "twitter:title")
      ) {
        metadataTitle ||= cleanTitle(token.attributes.content ?? "");
      }

      if (messageRoot && role) {
        activeMessage = { role, chunks: [] };
      } else if (activeMessage && !hidden) {
        if (token.name === "br" || BLOCK_TAGS.has(token.name)) {
          appendBoundary(activeMessage.chunks);
        }
      }

      const entry: HtmlStackEntry = {
        name: token.name,
        hidden,
        messageRoot,
        titleRoot,
        preformatted,
      };

      if (!token.selfClosing) {
        stack.push(entry);
      } else if (activeMessage && !hidden && BLOCK_TAGS.has(token.name)) {
        appendBoundary(activeMessage.chunks);
      }
      continue;
    }

    const entry = stack.pop();
    if (!entry) continue;

    if (activeMessage && !entry.hidden && BLOCK_TAGS.has(entry.name)) {
      appendBoundary(activeMessage.chunks);
    }
    if (entry.messageRoot && activeMessage) {
      const messageContent = normalizeVisibleHtmlText(activeMessage.chunks);
      if (messageContent) {
        messages.push({
          role: activeMessage.role,
          content: messageContent,
          ordinal: messages.length,
        });
      } else {
        warnings.push(
          `Ignored an empty ${activeMessage.role} message container.`,
        );
      }
      activeMessage = null;
    }
  }

  if (activeMessage) {
    errors.push("ChatGPT Share Snapshot HTML contains an unclosed message.");
  }
  if (messages.length === 0) {
    errors.push(
      "Unsupported ChatGPT Share Snapshot HTML layout: no semantic message containers were found.",
    );
  }

  const documentTitle = cleanTitle(titleChunks.join(""));
  const title = metadataTitle || documentTitle || fallbackTitle(messages);
  return {
    title,
    messages,
    inputKind: "saved-html",
    parserVersion: CHATGPT_SHARE_SNAPSHOT_PARSER_VERSION,
    warnings,
    errors,
  };
}

type TextSpeakerStyle = "strong" | "compatibility";

type TextSpeaker = {
  role: "user" | "assistant";
  style: TextSpeakerStyle;
};

function parseTextSpeaker(line: string): TextSpeaker | null {
  const trimmed = line.trim();
  if (/^(?:you\s+said|你说)\s*[：:]\s*$/i.test(trimmed)) {
    return { role: "user", style: "strong" };
  }
  if (/^(?:chatgpt\s+said|chatgpt\s*说)\s*[：:]\s*$/i.test(trimmed)) {
    return { role: "assistant", style: "strong" };
  }
  if (/^(?:user|you|用户)\s*[：:]\s*$/i.test(trimmed)) {
    return { role: "user", style: "compatibility" };
  }
  if (/^(?:assistant|chatgpt|gpt)\s*[：:]\s*$/i.test(trimmed)) {
    return { role: "assistant", style: "compatibility" };
  }
  return null;
}

function trimBoundaryBlankLines(lines: string[]): string {
  const next = [...lines];
  while (next.length > 0 && !next[0].trim()) next.shift();
  while (next.length > 0 && !next[next.length - 1].trim()) next.pop();
  return next.join("\n");
}

function parsePastedText(content: string): ChatGPTShareSnapshotParseResult {
  const warnings: string[] = [];
  const errors: string[] = [];
  const messages: ChatGPTShareSnapshotMessageDraft[] = [];
  const normalized = content.replace(/\r\n?/g, "\n");
  const lines = normalized.split("\n");
  const strongSpeakerExists = lines.some(
    (line) => parseTextSpeaker(line)?.style === "strong",
  );
  let currentRole: "user" | "assistant" | null = null;
  let currentLines: string[] = [];
  let insideCodeFence = false;
  let ignoredPreamble = false;
  let usedCompatibilityLabels = false;

  const finish = () => {
    if (!currentRole) return;
    const messageContent = trimBoundaryBlankLines(currentLines);
    if (messageContent) {
      messages.push({
        role: currentRole,
        content: messageContent,
        ordinal: messages.length,
      });
    } else {
      warnings.push(`Ignored an empty ${currentRole} text section.`);
    }
    currentLines = [];
  };

  for (const line of lines) {
    const codeFence = line.trimStart().startsWith("```");
    if (codeFence) {
      if (currentRole) currentLines.push(line);
      else if (line.trim()) ignoredPreamble = true;
      insideCodeFence = !insideCodeFence;
      continue;
    }

    const speaker = insideCodeFence ? null : parseTextSpeaker(line);
    const acceptedSpeaker =
      speaker &&
      (speaker.style === "strong" ||
        (!strongSpeakerExists && speaker.style === "compatibility"))
        ? speaker
        : null;

    if (acceptedSpeaker) {
      finish();
      currentRole = acceptedSpeaker.role;
      usedCompatibilityLabels ||= acceptedSpeaker.style === "compatibility";
      continue;
    }

    if (currentRole) {
      currentLines.push(line);
    } else if (line.trim()) {
      ignoredPreamble = true;
    }
  }
  finish();

  if (insideCodeFence) {
    warnings.push("Pasted snapshot text contains an unclosed code fence.");
  }
  if (ignoredPreamble) {
    warnings.push("Ignored text before the first supported speaker label.");
  }
  if (usedCompatibilityLabels) {
    warnings.push(
      "Parsed compatibility User/Assistant labels; prefer You said/ChatGPT said labels when available.",
    );
  }
  if (messages.length === 0) {
    errors.push(
      "Unsupported ChatGPT Share Snapshot text layout: no supported speaker labels were found.",
    );
  }

  return {
    title: fallbackTitle(messages),
    messages,
    inputKind: "pasted-text",
    parserVersion: CHATGPT_SHARE_SNAPSHOT_PARSER_VERSION,
    warnings,
    errors,
  };
}

export function parseChatGPTShareSnapshot(
  input: ChatGPTShareSnapshotInput,
): ChatGPTShareSnapshotParseResult {
  return input.kind === "saved-html"
    ? parseSavedHtml(input.content)
    : parsePastedText(input.content);
}
