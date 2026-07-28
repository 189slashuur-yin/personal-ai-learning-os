import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  CHATGPT_SHARE_SNAPSHOT_PARSER_VERSION,
  parseChatGPTShareSnapshot,
} from "@/core/services/chatgpt-share-snapshot-parser";

function loadFixture(name: string): string {
  return readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
}

describe("ChatGPT Conversation Snapshot parser", () => {
  it("parses semantic saved-page HTML without importing page chrome", () => {
    const html = `
      <!doctype html>
      <html>
        <head>
          <meta property="og:title" content="Synthetic Snapshot – ChatGPT">
          <script>
            window.__PRIVATE_ACCOUNT_STATE__ = {
              message: "<div data-message-author-role='assistant'>private</div>"
            };
          </script>
        </head>
        <body>
          <nav>Share page navigation</nav>
          <article data-testid="conversation-turn-0">
            <div data-message-author-role="user">
              <p>Hello &amp; welcome.</p>
              <pre><code>const label = "Assistant:";
return label;</code></pre>
              <button aria-label="Edit message">Edit</button>
            </div>
          </article>
          <article data-testid="conversation-turn-1">
            <div data-message-author-role="assistant">
              <p>Hi! The code block remains part of this answer.</p>
              <button aria-label="Copy">Copy</button>
            </div>
          </article>
          <footer>ChatGPT can make mistakes.</footer>
        </body>
      </html>
    `;

    const result = parseChatGPTShareSnapshot({
      kind: "saved-html",
      content: html,
    });

    expect(result).toMatchObject({
      title: "Synthetic Snapshot",
      inputKind: "saved-html",
      parserVersion: CHATGPT_SHARE_SNAPSHOT_PARSER_VERSION,
      errors: [],
    });
    expect(result.messages).toEqual([
      {
        role: "user",
        ordinal: 0,
        content:
          'Hello & welcome.\nconst label = "Assistant:";\nreturn label;',
      },
      {
        role: "assistant",
        ordinal: 1,
        content: "Hi! The code block remains part of this answer.",
      },
    ]);
    expect(
      result.messages.some((message) =>
        /navigation|private|edit|copy|mistakes/i.test(message.content),
      ),
    ).toBe(false);
  });

  it("parses the synthetic public share-page fixture", () => {
    const result = parseChatGPTShareSnapshot({
      kind: "saved-html",
      content: loadFixture("chatgpt-share-snapshot-initial.html"),
    });

    expect(result.errors).toEqual([]);
    expect(result.messages).toHaveLength(3);
    expect(result.messages.map(({ role }) => role)).toEqual([
      "user",
      "assistant",
      "user",
    ]);
    expect(JSON.stringify(result)).not.toMatch(
      /accountState|shared page navigation|ChatGPT can make mistakes|<article/i,
    );
  });

  it("parses a saved logged-in conversation page without private payload or chrome", () => {
    const result = parseChatGPTShareSnapshot({
      kind: "saved-html",
      content: loadFixture("chatgpt-conversation-snapshot-logged-in.html"),
    });

    expect(result).toMatchObject({
      title: "Logged-in Conversation Fixture",
      errors: [],
    });
    expect(result.messages).toEqual([
      {
        role: "user",
        ordinal: 0,
        content: "Can PALOS import a locally saved signed-in conversation?",
      },
      {
        role: "assistant",
        ordinal: 1,
        content:
          'Yes, when semantic message roles are present in the saved HTML.\nconst source = "local file only";',
      },
    ]);
    expect(JSON.stringify(result)).not.toMatch(
      /private@example|internalPayload|private-user-message-id|navigation|history chrome|account menu|You said|ChatGPT said/i,
    );
  });

  it("parses rendered text and does not split role-like content", () => {
    const text = `Synthetic heading copied from the page

You said:
Explain why this remains one message.

Assistant:
This line is quoted content, not a speaker boundary.

\`\`\`text
ChatGPT said:
This is inside a code block.
\`\`\`

ChatGPT said:
It remains one user message because strong rendered labels are used.`;

    const result = parseChatGPTShareSnapshot({
      kind: "pasted-text",
      content: text,
    });

    expect(result.errors).toEqual([]);
    expect(result.messages).toHaveLength(2);
    expect(result.messages[0]).toEqual({
      role: "user",
      ordinal: 0,
      content: `Explain why this remains one message.

Assistant:
This line is quoted content, not a speaker boundary.

\`\`\`text
ChatGPT said:
This is inside a code block.
\`\`\``,
    });
    expect(result.messages[1]).toEqual({
      role: "assistant",
      ordinal: 1,
      content:
        "It remains one user message because strong rendered labels are used.",
    });
    expect(result.warnings).toContain(
      "Ignored text before the first supported speaker label.",
    );
  });

  it("supports compatibility User/Assistant labels when strong labels are absent", () => {
    const result = parseChatGPTShareSnapshot({
      kind: "pasted-text",
      content: `User:
Question

Assistant:
Answer`,
    });

    expect(result.errors).toEqual([]);
    expect(result.messages).toEqual([
      { role: "user", content: "Question", ordinal: 0 },
      { role: "assistant", content: "Answer", ordinal: 1 },
    ]);
    expect(result.warnings).toContain(
      "Parsed compatibility User/Assistant labels; prefer You said/ChatGPT said labels when available.",
    );
  });

  it("fails explicitly for unsupported HTML layouts", () => {
    const result = parseChatGPTShareSnapshot({
      kind: "saved-html",
      content: `
        <html>
          <head><title>Unsupported page</title></head>
          <body>
            <main>
              <div class="generated-build-class">User text without semantic role metadata</div>
            </main>
          </body>
        </html>
      `,
    });

    expect(result.messages).toEqual([]);
    expect(result.errors).toEqual([
      "无法从这个网页文件识别 ChatGPT 对话。请上传公开分享页或已登录对话页保存的完整 HTML；当前文件可能不完整或页面结构暂不支持。",
    ]);
  });

  it("fails explicitly for unsupported pasted-text layouts", () => {
    const result = parseChatGPTShareSnapshot({
      kind: "pasted-text",
      content: "An unlabeled transcript cannot be imported safely.",
    });

    expect(result.messages).toEqual([]);
    expect(result.errors).toEqual([
      "无法识别对话角色。请粘贴包含“你说 / ChatGPT 说”或“User / Assistant”标签的完整对话内容。",
    ]);
  });
});
