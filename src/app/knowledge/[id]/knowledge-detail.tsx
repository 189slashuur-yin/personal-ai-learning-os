"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { KnowledgeCard } from "@/core/entities/knowledge-card";
import { BrowserConversationStorage } from "@/infrastructure/storage/browser-conversation-storage";
import { BrowserKnowledgeCardStorage } from "@/infrastructure/storage/browser-knowledge-card-storage";
import { BrowserProposalStorage } from "@/infrastructure/storage/browser-proposal-storage";

type Draft = Pick<KnowledgeCard, "title" | "content" | "status">;

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "long",
    timeStyle: "short",
  }).format(new Date(value));
}

export function KnowledgeDetail({ cardId }: { cardId: string }) {
  const router = useRouter();
  const [card, setCard] = useState<KnowledgeCard | null | undefined>(undefined);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [sourceConversationTitle, setSourceConversationTitle] = useState<string | null>(null);
  const [sourceMessageCount, setSourceMessageCount] = useState<number | null>(null);
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving">("saved");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const storedCard = new BrowserKnowledgeCardStorage().getById(cardId);
      const proposal = storedCard
        ? new BrowserProposalStorage().getById(storedCard.proposalId)
        : null;
      const conversationId =
        storedCard?.sourceConversationId ?? proposal?.conversationId;
      const conversation = conversationId
        ? new BrowserConversationStorage().getById(conversationId)
        : null;
      setCard(storedCard);
      setSourceConversationTitle(conversation?.title ?? null);
      setSourceMessageCount(
        storedCard?.sourceMessageCount ?? proposal?.sourceMessageIds?.length ?? null,
      );
      setDraft(
        storedCard
          ? {
              title: storedCard.title,
              content: storedCard.content,
              status: storedCard.status,
            }
          : null,
      );
    }, 0);
    return () => window.clearTimeout(timer);
  }, [cardId]);

  useEffect(() => {
    if (!card || !draft) return;

    const timer = window.setTimeout(() => {
      new BrowserKnowledgeCardStorage().update({ ...card, ...draft });
      setSaveStatus("saved");
    }, 500);
    return () => window.clearTimeout(timer);
  }, [card, draft]);

  if (card === undefined) {
    return <p className="workspace-shell text-sm text-zinc-500" role="status">正在读取 Knowledge…</p>;
  }

  if (!card || !draft) {
    return (
      <main className="workspace-shell">
        <p className="eyebrow">Not found</p>
        <h1 className="workspace-title">Knowledge 不存在</h1>
        <Link className="mt-6 inline-block rounded-lg bg-zinc-950 px-4 py-2.5 text-sm font-medium text-white" href="/knowledge">返回知识库</Link>
      </main>
    );
  }

  function changeDraft(next: Partial<Draft>) {
    setDraft((current) => (current ? { ...current, ...next } : current));
    setSaveStatus("saving");
  }

  function deleteKnowledge() {
    if (!window.confirm("彻底删除这条知识？此操作无法撤销。")) return;
    new BrowserKnowledgeCardStorage().remove(cardId);
    router.push("/knowledge");
  }

  return (
    <main className="workspace-shell pb-24">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <Link className="text-sm font-medium text-zinc-500 hover:text-zinc-950" href="/knowledge">← 返回知识库</Link>
        <span aria-live="polite" className="text-xs text-zinc-500">
          {saveStatus === "saving" ? "自动保存中…" : "已自动保存"}
        </span>
      </div>

      <article className="mt-6 overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <div className="border-b border-zinc-100 p-6 sm:p-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="eyebrow">Knowledge Detail</p>
            <select
              aria-label="知识状态"
              className={`rounded-full border-0 px-3 py-1.5 text-xs font-semibold outline-none ${draft.status === "Active" ? "bg-emerald-50 text-emerald-700" : "bg-zinc-100 text-zinc-600"}`}
              onChange={(event) => changeDraft({ status: event.target.value as KnowledgeCard["status"] })}
              value={draft.status}
            >
              <option value="Active">Active</option>
              <option value="Archived">Archived</option>
            </select>
          </div>
          <label className="mt-5 block">
            <span className="sr-only">标题</span>
            <input
              className="w-full border-0 p-0 text-3xl font-semibold tracking-tight text-zinc-950 outline-none placeholder:text-zinc-300 sm:text-4xl"
              onChange={(event) => changeDraft({ title: event.target.value })}
              placeholder="知识标题"
              value={draft.title}
            />
          </label>
        </div>

        <div className="p-6 sm:p-8">
          <label className="block">
            <span className="text-sm font-semibold text-zinc-900">内容</span>
            <textarea
              className="mt-3 min-h-72 w-full resize-y rounded-xl border border-zinc-200 bg-zinc-50 p-4 leading-7 text-zinc-700 outline-none focus:border-zinc-400 focus:bg-white"
              onChange={(event) => changeDraft({ content: event.target.value })}
              placeholder="知识内容"
              value={draft.content}
            />
          </label>

          <dl className="mt-8 grid gap-5 border-t border-zinc-100 pt-6 text-sm sm:grid-cols-3">
            <div><dt className="font-medium text-zinc-500">来源</dt><dd className="mt-1.5 break-words text-zinc-900">{card.sourceFile}</dd></div>
            {sourceConversationTitle ? (
              <div>
                <dt className="font-medium text-zinc-500">来源 Conversation</dt>
                <dd className="mt-1.5 text-zinc-900">{sourceConversationTitle}</dd>
              </div>
            ) : null}
            {sourceMessageCount ? (
              <div>
                <dt className="font-medium text-zinc-500">来源 Messages</dt>
                <dd className="mt-1.5 text-zinc-900">{sourceMessageCount} 条</dd>
              </div>
            ) : null}
            <div><dt className="font-medium text-zinc-500">创建时间</dt><dd className="mt-1.5 text-zinc-900">{formatDate(card.createdAt)}</dd></div>
            <div><dt className="font-medium text-zinc-500">状态</dt><dd className="mt-1.5 text-zinc-900">{draft.status}</dd></div>
          </dl>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-zinc-100 bg-zinc-50 px-6 py-4 sm:px-8">
          <button
            className="rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100"
            onClick={() => changeDraft({ status: draft.status === "Active" ? "Archived" : "Active" })}
            type="button"
          >
            {draft.status === "Active" ? "Archive" : "恢复为 Active"}
          </button>
          <button className="rounded-lg px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50" onClick={deleteKnowledge} type="button">彻底删除</button>
        </div>
      </article>
    </main>
  );
}
