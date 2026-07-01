import Link from "next/link";
import type { Conversation } from "@/core/entities/conversation";

type ConversationCardProps = {
  conversation: Conversation;
  knowledgeCount: number;
  proposalCount: number;
};

export function ConversationCard({
  conversation,
  knowledgeCount,
  proposalCount,
}: ConversationCardProps) {
  const updatedAt = new Intl.DateTimeFormat("zh-CN", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(conversation.updatedAt));

  return (
    <Link
      className="group block rounded-xl border border-zinc-200 bg-white p-5 transition hover:-translate-y-0.5 hover:border-zinc-300 hover:shadow-md"
      href={`/conversation/${conversation.id}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="truncate font-semibold text-zinc-950 group-hover:text-black">
            {conversation.title}
          </h2>
          <p className="mt-1 text-sm text-zinc-500">
            {conversation.sourceType} · 更新于 {updatedAt}
          </p>
        </div>
        <span className="rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1 text-xs font-medium text-zinc-600">
          {conversation.sourceType}
        </span>
      </div>
      <div className="mt-5 flex gap-5 border-t border-zinc-100 pt-4 text-xs text-zinc-500">
        <span>
          <strong className="mr-1 text-zinc-800">{knowledgeCount}</strong>
          Knowledge
        </span>
        <span>
          <strong className="mr-1 text-zinc-800">{proposalCount}</strong>
          Proposal
        </span>
      </div>
    </Link>
  );
}
