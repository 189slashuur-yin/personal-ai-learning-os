import type { Message } from "@/core/entities/message";
import type { QAPair } from "@/core/entities/qa-pair";

type PairDraft = Omit<QAPair, "order" | "kind">;

function joinContent(current: string, next: string) {
  return current ? `${current}\n\n${next}` : next;
}

function toPair(draft: PairDraft, order: number): QAPair {
  const kind: QAPair["kind"] = draft.questionText
    ? draft.answerText
      ? "answered"
      : "unanswered"
    : "orphan-assistant";

  return { ...draft, order, kind };
}

export function deriveQAPairs(messages: Message[]): QAPair[] {
  const orderedMessages = [...messages].sort(
    (left, right) => left.order - right.order,
  );
  const pairs: QAPair[] = [];
  let current: PairDraft | null = null;

  function finishCurrent() {
    if (!current) return;
    pairs.push(toPair(current, pairs.length + 1));
    current = null;
  }

  for (const message of orderedMessages) {
    if (message.role === "user" || message.role === "unknown") {
      finishCurrent();
      current = {
        id: `qa-${message.id}`,
        questionText: message.content,
        answerText: "",
        messageIds: [message.id],
        createdAt: message.createdAt,
        updatedAt: message.updatedAt ?? message.createdAt,
      };
      continue;
    }

    if (message.role === "assistant") {
      if (!current) {
        current = {
          id: `qa-${message.id}`,
          questionText: "",
          answerText: message.content,
          messageIds: [message.id],
          createdAt: message.createdAt,
          updatedAt: message.updatedAt ?? message.createdAt,
        };
      } else {
        current.answerText = joinContent(current.answerText, message.content);
        current.messageIds.push(message.id);
        current.updatedAt = message.updatedAt ?? message.createdAt;
      }
      continue;
    }

    finishCurrent();
    pairs.push({
      id: `qa-${message.id}`,
      order: pairs.length + 1,
      questionText: message.content,
      answerText: "",
      messageIds: [message.id],
      kind: "context",
      createdAt: message.createdAt,
      updatedAt: message.updatedAt ?? message.createdAt,
    });
  }

  finishCurrent();
  return pairs;
}
