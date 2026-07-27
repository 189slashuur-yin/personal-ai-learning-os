export type ChatGPTShareIdentity = {
  resourceHash: string;
};

const SHARE_ID_PATTERN = /^[a-zA-Z0-9_-]{8,128}$/;

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

export function normalizeChatGPTShareUrl(rawUrl: string): string {
  const value = rawUrl.trim();
  if (!value) {
    throw new ChatGPTShareUrlError("ChatGPT Share URL is required.");
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ChatGPTShareUrlError("ChatGPT Share URL is invalid.");
  }

  if (url.protocol !== "https:" || url.hostname.toLowerCase() !== "chatgpt.com") {
    throw new ChatGPTShareUrlError(
      "ChatGPT Share URL must use https://chatgpt.com/share/.",
    );
  }

  const pathSegments = url.pathname.split("/").filter(Boolean);
  if (
    pathSegments.length !== 2 ||
    pathSegments[0].toLowerCase() !== "share" ||
    !SHARE_ID_PATTERN.test(pathSegments[1])
  ) {
    throw new ChatGPTShareUrlError(
      "ChatGPT Share URL must match https://chatgpt.com/share/<share-id>.",
    );
  }

  const shareId = pathSegments[1];
  return `https://chatgpt.com/share/${shareId}`;
}

export async function identifyChatGPTShareUrl(
  rawUrl: string,
): Promise<ChatGPTShareIdentity> {
  const normalizedUrl = normalizeChatGPTShareUrl(rawUrl);
  const bytes = new TextEncoder().encode(normalizedUrl);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return { resourceHash: bytesToHex(digest) };
}

export function shareResourceFingerprint(resourceHash: string): string {
  return resourceHash.slice(0, 8);
}
