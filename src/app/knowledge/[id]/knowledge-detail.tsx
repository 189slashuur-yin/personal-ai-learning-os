"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";
import type { KnowledgeCard } from "@/core/entities/knowledge-card";
import type { Round } from "@/core/entities/round";
import { CapabilityBadges } from "@/app/capability-badges";
import type { Tag } from "@/core/entities/tag";
import {
  addTagToKnowledgeCard,
  createTag,
  removeTagFromKnowledgeCard,
} from "@/core/services/tag-management";
import { TaskService } from "@/core/services/task-service";
import { RoundKnowledgeService } from "@/core/services/round-knowledge-service";
import { BrowserTagStorage } from "@/infrastructure/storage/browser-tag-storage";
import { BrowserTaskStorage } from "@/infrastructure/storage/browser-task-storage";
import { BrowserWorkspaceStorage } from "@/infrastructure/storage/browser-workspace-storage";
import {
  createConversationStorage,
  createKnowledgeCardStorage,
  createMessageStorage,
  createProposalStorage,
  createRoundStorage,
  ensureIndexedDBLoaded,
  getStorageMode,
} from "@/infrastructure/storage/storage-factory";
import { flushCachesToIndexedDB } from "@/infrastructure/storage/indexeddb/preload";

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

function excerpt(value: string, maxLength = 240) {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > maxLength
    ? `${normalized.slice(0, maxLength - 1).trimEnd()}…`
    : normalized;
}

export function KnowledgeDetail({ cardId }: { cardId: string }) {
  const router = useRouter();
  const [card, setCard] = useState<KnowledgeCard | null | undefined>(undefined);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [sourceConversationTitle, setSourceConversationTitle] = useState<string | null>(null);
  const [sourceRound, setSourceRound] = useState<Round | null>(null);
  const [sourceRoundId, setSourceRoundId] = useState<string | null>(null);
  const [sourceMessageCount, setSourceMessageCount] = useState<number | null>(null);
  const [missingSourceMessageCount, setMissingSourceMessageCount] = useState(0);
  const [sourceEvidenceExcerpt, setSourceEvidenceExcerpt] = useState<string | null>(null);
  const [tags, setTags] = useState<Tag[]>([]);
  const [newTagName, setNewTagName] = useState("");
  const [tagError, setTagError] = useState<string | null>(null);
  const [taskNotice, setTaskNotice] = useState<string | null>(null);
  const [taskError, setTaskError] = useState<string | null>(null);
  const [knowledgeError, setKnowledgeError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<"idle" | "dirty" | "saved">(
    "idle",
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      async function load() {
        if (getStorageMode() === "indexedDB") await ensureIndexedDBLoaded();
        const storedCard = createKnowledgeCardStorage().getById(cardId);
        const proposal = storedCard
          ? createProposalStorage().getById(storedCard.proposalId)
          : null;
        const conversationId =
          storedCard?.sourceConversationId ?? proposal?.conversationId;
        const conversation = conversationId
          ? createConversationStorage().getById(conversationId)
          : null;
        const roundId = storedCard?.sourceRoundId ?? proposal?.sourceRoundId ?? null;
        const round = roundId ? createRoundStorage().getById(roundId) : null;
        setCard(storedCard);
        setTags(new BrowserTagStorage().getAll());
        setSourceConversationTitle(conversation?.title ?? null);
        setSourceRoundId(roundId);
        setSourceRound(round);
        setSourceMessageCount(
          storedCard?.sourceMessageCount ??
            proposal?.sourceMessageIds?.length ??
            null,
        );
        const sourceMessageIds =
          storedCard?.sourceMessageIds ?? proposal?.sourceMessageIds ?? [];
        const availableMessageIds = new Set(
          createMessageStorage().getAll().map((message) => message.id),
        );
        setMissingSourceMessageCount(
          sourceMessageIds.filter(
            (messageId) => !availableMessageIds.has(messageId),
          ).length,
        );
        setSourceEvidenceExcerpt(
          storedCard?.sourceEvidenceExcerpt ??
            proposal?.sourceEvidence.excerpt ??
            null,
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
      }
      void load().catch(() => {
        setCard(null);
        setDraft(null);
      });
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

  async function persistCanonicalKnowledgeState() {
    if (getStorageMode() === "indexedDB") {
      await flushCachesToIndexedDB();
    }
  }

  async function saveKnowledge() {
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

    try {
      setKnowledgeError(null);
      createKnowledgeCardStorage().update(nextCard);
      await persistCanonicalKnowledgeState();
      setCard(nextCard);
      setSaveStatus("saved");
    } catch (error) {
      setSaveStatus("dirty");
      setKnowledgeError(
        error instanceof Error ? error.message : "Knowledge 保存失败。",
      );
    }
  }

  async function deleteKnowledge() {
    if (
      !window.confirm(
        "彻底删除这条知识？此操作无法撤销；关联 Task 会保留，并显示 source missing。",
      )
    ) {
      return;
    }
    if (
      !window.confirm(
        `再次确认：永久删除「${draft?.title ?? card?.title ?? "这条知识"}」？删除后无法恢复。`,
      )
    ) {
      return;
    }
    try {
      setKnowledgeError(null);
      createKnowledgeCardStorage().remove(cardId);
      await persistCanonicalKnowledgeState();
      router.push("/knowledge");
    } catch (error) {
      setKnowledgeError(
        error instanceof Error ? error.message : "Knowledge 删除失败。",
      );
    }
  }

  async function duplicateKnowledge() {
    if (!card) return;
    try {
      setKnowledgeError(null);
      const copy = new RoundKnowledgeService(
        createKnowledgeCardStorage(),
        createProposalStorage(),
      ).duplicate(card);
      await persistCanonicalKnowledgeState();
      router.push(`/knowledge/${copy.id}`);
    } catch (error) {
      setKnowledgeError(
        error instanceof Error ? error.message : "Knowledge 复制失败。",
      );
    }
  }

  function exportKnowledge() { if (!card || !draft) return; const content = `# ${draft.title}\n\n${draft.summary}\n\n${draft.content}`; const blob = new Blob([content], { type: "text/markdown" }); const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = `${draft.title}.md`; link.click(); URL.revokeObjectURL(link.href); }

  function createTaskFromKnowledge() {
    if (!card || !draft) return;

    setTaskNotice(null);
    setTaskError(null);

    try {
      const proposal = createProposalStorage().getById(card.proposalId);
      const conversationId =
        card.sourceConversationId ?? proposal?.conversationId;
      const workspaceId = conversationId
        ? createConversationStorage().getById(conversationId)?.workspaceId
        : undefined;

      new TaskService(
        new BrowserTaskStorage(),
        new BrowserWorkspaceStorage(),
      ).createTask({
        title: `Review: ${draft.title.trim() || card.title}`,
        status: "inbox",
        type: "review",
        priority: "medium",
        workspaceId,
        sourceRef: {
          type: "knowledge",
          entityId: card.id,
          titleSnapshot: draft.title.trim() || card.title,
          summarySnapshot: excerpt(draft.summary || draft.content),
        },
      });
      setTaskNotice("Task 已创建，并保留当前 Knowledge 来源快照。");
    } catch {
      setTaskError("Task 创建失败，请确认浏览器允许本地保存。");
    }
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
          <button
            className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
            onClick={createTaskFromKnowledge}
            type="button"
          >
            Create Task
          </button>
          <button className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700" onClick={duplicateKnowledge} type="button">Duplicate Knowledge</button>
          <button className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700" onClick={exportKnowledge} type="button">Export Markdown</button>
        </div>
      </div>

      {taskNotice ? (
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-800" role="status">
          <span>{taskNotice}</span>
          <span className="flex gap-3 font-semibold">
            <Link className="underline" href="/tasks">前往 Tasks</Link>
            <Link className="underline" href="/today">前往 Today</Link>
          </span>
        </div>
      ) : null}
      {taskError ? (
        <p className="mt-5 rounded-xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700" role="alert">{taskError}</p>
      ) : null}
      {knowledgeError ? (
        <p className="mt-5 rounded-xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700" role="alert">
          {knowledgeError}
        </p>
      ) : null}

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
          <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <p className={`rounded-lg border p-3 ${draft.status === "Active" ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-zinc-200 bg-zinc-50 text-zinc-600"}`}>
              <span className="font-semibold">Active</span> 表示仍在日常使用和默认搜索中显示。
            </p>
            <p className={`rounded-lg border p-3 ${draft.status === "Archived" ? "border-sky-200 bg-sky-50 text-sky-900" : "border-zinc-200 bg-zinc-50 text-zinc-600"}`}>
              <span className="font-semibold">Archived</span> 表示暂时退出日常视图，但仍可搜索和恢复。
            </p>
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
            {sourceRound ? (
              <div>
                <dt className="font-medium text-zinc-500">来源 Round</dt>
                <dd className="mt-1.5 text-zinc-900"><Link className="font-medium hover:underline" href={`/conversation/${sourceRound.conversationId}?round=${encodeURIComponent(sourceRound.id)}#round-${sourceRound.id}`}>{sourceRound.title}</Link></dd>
              </div>
            ) : sourceRoundId ? (
              <div><dt className="font-medium text-zinc-500">来源 Round</dt><dd className="mt-1.5 text-amber-700">Round 已不可用；Knowledge 内容未受影响</dd></div>
            ) : null}
            {sourceMessageCount ? (
              <div>
                <dt className="font-medium text-zinc-500">来源 Messages</dt>
                <dd className="mt-1.5 text-zinc-900">{sourceMessageCount} 条</dd>
              </div>
            ) : null}
            <div><dt className="font-medium text-zinc-500">创建时间</dt><dd className="mt-1.5 text-zinc-900">{formatDate(card.createdAt)}</dd></div>
            <div><dt className="font-medium text-zinc-500">更新时间</dt><dd className="mt-1.5 text-zinc-900">{formatDate(card.updatedAt)}</dd></div>
            {card.providerName ? (
              <div><dt className="font-medium text-zinc-500">来源 Provider</dt><dd className="mt-1.5 text-zinc-900">{card.providerName}</dd></div>
            ) : null}
            <div>
              <dt className="font-medium text-zinc-500">Provider Capability Snapshot</dt>
              <dd className="mt-2">
                <CapabilityBadges capabilities={card.providerCapabilitySnapshot} />
              </dd>
            </div>
            {card.generatedAt ? (
              <div><dt className="font-medium text-zinc-500">Proposal 生成时间</dt><dd className="mt-1.5 text-zinc-900">{formatDate(card.generatedAt)}</dd></div>
            ) : null}
            {card.analysisMode ? (
              <div><dt className="font-medium text-zinc-500">Analysis mode</dt><dd className="mt-1.5 capitalize text-zinc-900">{card.analysisMode}</dd></div>
            ) : null}
            <div><dt className="font-medium text-zinc-500">状态</dt><dd className="mt-1.5 text-zinc-900">{draft.status}</dd></div>
          </dl>
          {card.previousContentSnapshots?.length ? <section className="mt-8 border-t border-zinc-100 pt-6"><h2 className="text-sm font-semibold">Previous content snapshots</h2><div className="mt-3 space-y-3">{card.previousContentSnapshots.map((snapshot) => <details className="rounded-lg border border-zinc-200 p-3" key={snapshot.capturedAt}><summary className="cursor-pointer text-xs font-semibold text-zinc-600">更新前快照 · {formatDate(snapshot.capturedAt)}</summary><p className="mt-3 whitespace-pre-wrap text-sm text-zinc-700">{snapshot.content}</p></details>)}</div></section> : null}
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
          <p className="text-sm text-zinc-600">暂时不用时，推荐 Archive；内容仍可恢复。</p>
          <button
            className="rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100"
            onClick={() => changeDraft({ status: draft.status === "Active" ? "Archived" : "Active" })}
            type="button"
          >
            {draft.status === "Active" ? "推荐：Archive" : "恢复为 Active"}
          </button>
        </div>
      </article>

      <section className="mt-8 rounded-2xl border border-red-200 bg-red-50 p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-red-700">Danger Zone</p>
        <h2 className="mt-2 text-lg font-semibold text-red-950">Delete Forever</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-red-800">
          永久删除无法恢复。通常应优先使用 Archive；只有确认不再需要这条知识时才执行删除。关联 Task 会保留，但来源会显示 missing。
        </p>
        <button
          className="mt-4 rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-100"
          onClick={deleteKnowledge}
          type="button"
        >
          Delete Forever（需要二次确认）
        </button>
      </section>
    </main>
  );
}
