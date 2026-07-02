import Link from "next/link";
import type { Conversation } from "@/core/entities/conversation";

type ConversationCardProps = {
  conversation: Conversation;
  knowledgeCount: number;
  messageCount: number;
  proposalCount: number;
  onDelete: (conversation: Conversation) => void;
  onDuplicate: (conversation: Conversation) => void;
};

export function ConversationCard({
  conversation,
  knowledgeCount,
  messageCount,
  proposalCount,
  onDelete,
  onDuplicate,
}: ConversationCardProps) {
  const updatedAt = new Intl.DateTimeFormat("zh-CN", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(conversation.updatedAt));

  return (
    <article className="group rounded-xl border border-zinc-200 bg-white p-5 transition hover:-translate-y-0.5 hover:border-zinc-300 hover:shadow-md">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <Link href={`/conversation/${conversation.id}`}>
            <h2 className="truncate font-semibold text-zinc-950 group-hover:text-black">
              {conversation.title}
            </h2>
          </Link>
          <p className="mt-1 text-sm text-zinc-500">
            {conversation.sourceType} · 更新于 {updatedAt}
          </p>
        </div>
        <span className="rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1 text-xs font-medium text-zinc-600">
          {conversation.sourceType}
        </span>
      </div>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-zinc-100 pt-4 text-xs text-zinc-500">
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          <span>
            <strong className="mr-1 text-zinc-800">{messageCount}</strong>
            Messages
          </span>
          <span>
            <strong className="mr-1 text-zinc-800">{knowledgeCount}</strong>
            Knowledge
          </span>
          <span>
            <strong className="mr-1 text-zinc-800">{proposalCount}</strong>
            Proposal
          </span>
        </div>
        <div className="flex gap-3">
          <button
            aria-label={`Duplicate ${conversation.title}`}
            className="font-medium text-zinc-500 hover:text-zinc-950"
            onClick={() => onDuplicate(conversation)}
            type="button"
          >
            Duplicate
          </button>
          <button
            aria-label={`Delete ${conversation.title}`}
            className="font-medium text-red-500 hover:text-red-700"
            onClick={() => onDelete(conversation)}
            type="button"
          >
            Delete
          </button>
        </div>
      </div>
    </article>
  );
}
