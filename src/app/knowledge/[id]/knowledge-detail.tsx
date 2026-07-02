"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";
import type { KnowledgeCard } from "@/core/entities/knowledge-card";
import type { Tag } from "@/core/entities/tag";
import {
  addTagToKnowledgeCard,
  createTag,
  removeTagFromKnowledgeCard,
} from "@/core/services/tag-management";
import { BrowserConversationStorage } from "@/infrastructure/storage/browser-conversation-storage";
import { BrowserKnowledgeCardStorage } from "@/infrastructure/storage/browser-knowledge-card-storage";
import { BrowserMessageStorage } from "@/infrastructure/storage/browser-message-storage";
import { BrowserProposalStorage } from "@/infrastructure/storage/browser-proposal-storage";
import { BrowserTagStorage } from "@/infrastructure/storage/browser-tag-storage";

type Draft = Pick<
  KnowledgeCard,
  "title" | "content" | "summary" | "status" | "tagIds"
>;

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
  const [missingSourceMessageCount, setMissingSourceMessageCount] = useState(0);
  const [sourceEvidenceExcerpt, setSourceEvidenceExcerpt] = useState<string | null>(null);
  const [tags, setTags] = useState<Tag[]>([]);
  const [newTagName, setNewTagName] = useState("");
  const [tagError, setTagError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<"idle" | "dirty" | "saved">(
    "idle",
  );

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
      setTags(new BrowserTagStorage().getAll());
      setSourceConversationTitle(conversation?.title ?? null);
      setSourceMessageCount(
        storedCard?.sourceMessageCount ?? proposal?.sourceMessageIds?.length ?? null,
      );
      const sourceMessageIds =
        storedCard?.sourceMessageIds ?? proposal?.sourceMessageIds ?? [];
      const availableMessageIds = new Set(
        new BrowserMessageStorage().getAll().map((message) => message.id),
      );
      setMissingSourceMessageCount(
        sourceMessageIds.filter((messageId) => !availableMessageIds.has(messageId)).length,
      );
      setSourceEvidenceExcerpt(
        storedCard?.sourceEvidenceExcerpt ?? proposal?.sourceEvidence.excerpt ?? null,
      );
      setDraft(
        storedCard
          ? {
              title: storedCard.title,
              content: storedCard.content,
              summary: storedCard.summary,
              status: storedCard.status,
              tagIds: storedCard.tagIds,
            }
          : null,
      );
    }, 0);
    return () => window.clearTimeout(timer);
  }, [cardId]);

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
    setSaveStatus("dirty");
  }

  function saveKnowledge() {
    if (!card || !draft || saveStatus !== "dirty") return;

    const timestamp = new Date().toISOString();
    const nextCard: KnowledgeCard = {
      ...card,
      ...draft,
      updatedAt: timestamp,
      archivedAt:
        draft.status === "Archived"
          ? card.archivedAt ?? timestamp
          : undefined,
    };

    new BrowserKnowledgeCardStorage().update(nextCard);
    setCard(nextCard);
    setSaveStatus("saved");
  }

  function deleteKnowledge() {
    if (!window.confirm("彻底删除这条知识？此操作无法撤销。")) return;
    new BrowserKnowledgeCardStorage().remove(cardId);
    router.push("/knowledge");
  }

  function addTag(tagId: string) {
    if (!card || !draft) return;
    const taggedCard = addTagToKnowledgeCard({ ...card, ...draft }, tagId);
    changeDraft({ tagIds: taggedCard.tagIds });
  }

  function removeTag(tagId: string) {
    if (!card || !draft) return;
    const taggedCard = removeTagFromKnowledgeCard({ ...card, ...draft }, tagId);
    changeDraft({ tagIds: taggedCard.tagIds });
  }

  function handleCreateTag(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedName = newTagName.trim();

    if (!normalizedName) {
      setTagError("请输入 Tag 名称。");
      return;
    }

    const existingTag = tags.find(
      (tag) => tag.name.toLocaleLowerCase() === normalizedName.toLocaleLowerCase(),
    );
    const tag = existingTag ?? createTag(normalizedName);

    if (!existingTag) {
      new BrowserTagStorage().save(tag);
      setTags((current) => [...current, tag].sort((a, b) => a.name.localeCompare(b.name, "zh-CN")));
    }

    addTag(tag.id);
    setNewTagName("");
    setTagError(null);
  }

  return (
    <main className="workspace-shell pb-24">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <Link className="text-sm font-medium text-zinc-500 hover:text-zinc-950" href="/knowledge">← 返回知识库</Link>
        <div className="flex items-center gap-3">
          <span aria-live="polite" className="text-xs text-zinc-500">
            {saveStatus === "dirty"
              ? "有未保存更改"
              : saveStatus === "saved"
                ? "已保存"
                : ""}
          </span>
          <button
            className="rounded-lg bg-zinc-950 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-zinc-300"
            disabled={saveStatus !== "dirty"}
            onClick={saveKnowledge}
            type="button"
          >
            保存
          </button>
        </div>
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
            <span className="text-sm font-semibold text-zinc-900">简短摘要</span>
            <textarea
              className="mt-3 min-h-28 w-full resize-y rounded-xl border border-zinc-200 bg-zinc-50 p-4 leading-7 text-zinc-700 outline-none focus:border-zinc-400 focus:bg-white"
              onChange={(event) => changeDraft({ summary: event.target.value })}
              placeholder="用几句话概括这条知识"
              value={draft.summary}
            />
          </label>

          <label className="block">
            <span className="mt-6 block text-sm font-semibold text-zinc-900">内容</span>
            <textarea
              className="mt-3 min-h-72 w-full resize-y rounded-xl border border-zinc-200 bg-zinc-50 p-4 leading-7 text-zinc-700 outline-none focus:border-zinc-400 focus:bg-white"
              onChange={(event) => changeDraft({ content: event.target.value })}
              placeholder="知识内容"
              value={draft.content}
            />
          </label>

          <section className="mt-8 border-t border-zinc-100 pt-6">
            <h2 className="text-sm font-semibold text-zinc-900">Tags</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {tags.length === 0 ? (
                <p className="text-sm text-zinc-500">尚无 Tag，可在下方快速新建。</p>
              ) : (
                tags.map((tag) => {
                  const selected = draft.tagIds.includes(tag.id);
                  return (
                    <button
                      aria-pressed={selected}
                      className={`rounded-full border px-3 py-1.5 text-xs font-medium ${selected ? "border-zinc-950 bg-zinc-950 text-white" : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-400"}`}
                      key={tag.id}
                      onClick={() => (selected ? removeTag(tag.id) : addTag(tag.id))}
                      style={!selected && tag.color ? { borderColor: tag.color } : undefined}
                      type="button"
                    >
                      {tag.name}{selected ? " ×" : " +"}
                    </button>
                  );
                })
              )}
            </div>
            <form className="mt-4 flex max-w-md gap-2" onSubmit={handleCreateTag}>
              <label className="min-w-0 flex-1">
                <span className="sr-only">新 Tag 名称</span>
                <input
                  className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm outline-none placeholder:text-zinc-400 focus:border-zinc-400"
                  onChange={(event) => {
                    setNewTagName(event.target.value);
                    setTagError(null);
                  }}
                  placeholder="快速新建 Tag"
                  value={newTagName}
                />
              </label>
              <button className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white" type="submit">
                新建并添加
              </button>
            </form>
            {tagError ? <p className="mt-2 text-xs text-red-600">{tagError}</p> : null}
          </section>

          <dl className="mt-8 grid gap-5 border-t border-zinc-100 pt-6 text-sm sm:grid-cols-3">
            <div><dt className="font-medium text-zinc-500">来源 Source</dt><dd className="mt-1.5 break-words text-zinc-900">{card.sourceFile}</dd></div>
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
            <div><dt className="font-medium text-zinc-500">更新时间</dt><dd className="mt-1.5 text-zinc-900">{formatDate(card.updatedAt)}</dd></div>
            <div><dt className="font-medium text-zinc-500">状态</dt><dd className="mt-1.5 text-zinc-900">{draft.status}</dd></div>
          </dl>
          {missingSourceMessageCount > 0 && sourceEvidenceExcerpt ? (
            <section className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4">
              <h2 className="text-sm font-semibold text-amber-950">
                {missingSourceMessageCount} 条原始 Message 已不可用
              </h2>
              <p className="mt-1 text-xs text-amber-800">生成时保存的 Evidence 快照仍可用：</p>
              <blockquote className="mt-3 whitespace-pre-wrap border-l-2 border-amber-300 pl-3 text-sm leading-6 text-amber-950">
                {sourceEvidenceExcerpt}
              </blockquote>
            </section>
          ) : null}
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
