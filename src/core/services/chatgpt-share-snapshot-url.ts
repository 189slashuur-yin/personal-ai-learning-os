export type ChatGPTShareIdentity = {
  resourceHash: string;
};

const CHATGPT_RESOURCE_ID_PATTERN = /^[a-zA-Z0-9_-]{8,128}$/;
const PALOS_LOCAL_IDENTITY_NAMESPACE =
  "palos:chatgpt-conversation-snapshot:v1:";

export class ChatGPTShareUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ChatGPTShareUrlError";
  }
}

function bytesToHex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

async function hashIdentityValue(value: string): Promise<ChatGPTShareIdentity> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return { resourceHash: bytesToHex(digest) };
}

export function normalizeChatGPTConversationSourceUrl(rawUrl: string): string {
  const value = rawUrl.trim();
  if (!value) {
    throw new ChatGPTShareUrlError("ChatGPT 来源链接为空。");
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ChatGPTShareUrlError(
      "无法识别这个链接。请使用 https://chatgpt.com/share/… 或 https://chatgpt.com/c/…。",
    );
  }

  if (url.protocol !== "https:" || url.hostname.toLowerCase() !== "chatgpt.com") {
    throw new ChatGPTShareUrlError(
      "来源链接必须使用 https://chatgpt.com/share/… 或 https://chatgpt.com/c/…。",
    );
  }

  const pathSegments = url.pathname.split("/").filter(Boolean);
  if (
    pathSegments.length !== 2 ||
    !["share", "c"].includes(pathSegments[0].toLowerCase()) ||
    !CHATGPT_RESOURCE_ID_PATTERN.test(pathSegments[1])
  ) {
    throw new ChatGPTShareUrlError(
      "无法识别这个 ChatGPT 对话链接。请使用 https://chatgpt.com/share/<id> 或 https://chatgpt.com/c/<id>。",
    );
  }

  const resourceKind = pathSegments[0].toLowerCase();
  const resourceId = pathSegments[1];
  return `https://chatgpt.com/${resourceKind}/${resourceId}`;
}

export function normalizeChatGPTShareUrl(rawUrl: string): string {
  const normalizedUrl = normalizeChatGPTConversationSourceUrl(rawUrl);
  if (!normalizedUrl.startsWith("https://chatgpt.com/share/")) {
    throw new ChatGPTShareUrlError(
      "ChatGPT Share URL 必须使用 https://chatgpt.com/share/<share-id>。",
    );
  }
  return normalizedUrl;
}

export async function identifyChatGPTConversationSourceUrl(
  rawUrl: string,
): Promise<ChatGPTShareIdentity> {
  return hashIdentityValue(normalizeChatGPTConversationSourceUrl(rawUrl));
}

export async function identifyChatGPTShareUrl(
  rawUrl: string,
): Promise<ChatGPTShareIdentity> {
  return hashIdentityValue(normalizeChatGPTShareUrl(rawUrl));
}

export async function identifyPalosLocalSnapshotSource(
  conversationId: string,
): Promise<ChatGPTShareIdentity> {
  const normalizedConversationId = conversationId.trim();
  if (!normalizedConversationId) {
    throw new ChatGPTShareUrlError(
      "无法生成本地来源标识：Conversation ID 为空。",
    );
  }
  return hashIdentityValue(
    `${PALOS_LOCAL_IDENTITY_NAMESPACE}${normalizedConversationId}`,
  );
}

export function shareResourceFingerprint(resourceHash: string): string {
  return resourceHash.slice(0, 8);
}
