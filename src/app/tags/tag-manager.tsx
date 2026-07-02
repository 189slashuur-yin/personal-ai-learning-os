"use client";

import { type FormEvent, useEffect, useMemo, useState } from "react";
import type { KnowledgeCard } from "@/core/entities/knowledge-card";
import type { Tag } from "@/core/entities/tag";
import { createTag, updateTag } from "@/core/services/tag-management";
import { BrowserKnowledgeCardStorage } from "@/infrastructure/storage/browser-knowledge-card-storage";
import { BrowserTagStorage } from "@/infrastructure/storage/browser-tag-storage";

type TagDraft = {
  name: string;
  color: string;
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function TagManager() {
  const [tags, setTags] = useState<Tag[] | null>(null);
  const [cards, setCards] = useState<KnowledgeCard[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<TagDraft>({ name: "", color: "" });
  const [newTag, setNewTag] = useState<TagDraft>({ name: "", color: "" });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setTags(new BrowserTagStorage().getAll());
      setCards(new BrowserKnowledgeCardStorage().getAll());
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  const countsByTagId = useMemo(() => {
    const counts = new Map<string, number>();
    cards.forEach((card) => {
      new Set(card.tagIds).forEach((tagId) => {
        counts.set(tagId, (counts.get(tagId) ?? 0) + 1);
      });
    });
    return counts;
  }, [cards]);

  function isDuplicateName(name: string, ignoredId?: string) {
    const normalizedName = name.trim().toLocaleLowerCase();
    return tags?.some(
      (tag) =>
        tag.id !== ignoredId &&
        tag.name.toLocaleLowerCase() === normalizedName,
    );
  }

  function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (isDuplicateName(newTag.name)) {
      setError("已存在同名 Tag。");
      return;
    }

    try {
      const tag = createTag(newTag.name, newTag.color.trim() || undefined);
      new BrowserTagStorage().save(tag);
      setTags((current) =>
        [...(current ?? []), tag].sort((a, b) =>
          a.name.localeCompare(b.name, "zh-CN"),
        ),
      );
      setNewTag({ name: "", color: "" });
    } catch (createError) {
      setError(
        createError instanceof Error ? createError.message : "Tag 创建失败。",
      );
    }
  }

  function startEditing(tag: Tag) {
    setEditingId(tag.id);
    setDraft({ name: tag.name, color: tag.color ?? "" });
    setError(null);
  }

  function saveEdit(tag: Tag) {
    setError(null);

    if (isDuplicateName(draft.name, tag.id)) {
      setError("已存在同名 Tag。");
      return;
    }

    try {
      const nextTag = updateTag(tag, draft);
      new BrowserTagStorage().save(nextTag);
      setTags((current) =>
        (current ?? [])
          .map((item) => (item.id === tag.id ? nextTag : item))
          .sort((a, b) => a.name.localeCompare(b.name, "zh-CN")),
      );
      setEditingId(null);
    } catch (updateError) {
      setError(
        updateError instanceof Error ? updateError.message : "Tag 更新失败。",
      );
    }
  }

  function deleteTag(tag: Tag) {
    const associationCount = countsByTagId.get(tag.id) ?? 0;
    const message = associationCount
      ? `删除 Tag「${tag.name}」？它会从 ${associationCount} 条 Knowledge 中移除，但不会删除 KnowledgeCard。`
      : `删除 Tag「${tag.name}」？此操作无法撤销。`;

    if (!window.confirm(message)) return;

    const cardStorage = new BrowserKnowledgeCardStorage();
    const nextCards = cards.map((card) => {
      if (!card.tagIds.includes(tag.id)) return card;
      const nextCard = {
        ...card,
        tagIds: card.tagIds.filter((tagId) => tagId !== tag.id),
      };
      cardStorage.update(nextCard);
      return nextCard;
    });

    new BrowserTagStorage().remove(tag.id);
    setCards(nextCards);
    setTags((current) =>
      (current ?? []).filter((item) => item.id !== tag.id),
    );
    if (editingId === tag.id) setEditingId(null);
    setError(null);
  }

  if (!tags) {
    return (
      <p className="mt-8 text-sm text-zinc-500" role="status">
        正在读取 Tags…
      </p>
    );
  }

  return (
    <section className="mt-8">
      <form
        className="grid gap-3 rounded-xl border border-zinc-200 bg-white p-5 shadow-sm sm:grid-cols-[minmax(0,1fr)_minmax(0,14rem)_auto]"
        onSubmit={handleCreate}
      >
        <label>
          <span className="text-xs font-semibold text-zinc-600">名称</span>
          <input
            className="mt-2 w-full rounded-lg border border-zinc-200 px-3 py-2.5 text-sm outline-none focus:border-zinc-400"
            onChange={(event) => setNewTag((current) => ({ ...current, name: event.target.value }))}
            placeholder="例如：React"
            value={newTag.name}
          />
        </label>
        <label>
          <span className="text-xs font-semibold text-zinc-600">颜色（可选）</span>
          <input
            className="mt-2 w-full rounded-lg border border-zinc-200 px-3 py-2.5 text-sm outline-none focus:border-zinc-400"
            onChange={(event) => setNewTag((current) => ({ ...current, color: event.target.value }))}
            placeholder="#2563eb 或 blue"
            value={newTag.color}
          />
        </label>
        <button className="self-end rounded-lg bg-zinc-950 px-4 py-2.5 text-sm font-medium text-white hover:bg-zinc-800" type="submit">
          新建 Tag
        </button>
      </form>

      {error ? (
        <p className="mt-3 text-sm text-red-600" role="alert">{error}</p>
      ) : null}

      <div className="mt-6 overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
        {tags.length === 0 ? (
          <div className="p-10 text-center">
            <h2 className="font-semibold text-zinc-950">尚无 Tag</h2>
            <p className="mt-2 text-sm text-zinc-500">在上方创建第一个 Tag。</p>
          </div>
        ) : (
          <div className="divide-y divide-zinc-100">
            {tags.map((tag) => {
              const isEditing = editingId === tag.id;
              return (
                <article className="p-5" key={tag.id}>
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      {isEditing ? (
                        <div className="grid gap-3 sm:grid-cols-2">
                          <label>
                            <span className="text-xs font-medium text-zinc-500">名称</span>
                            <input
                              autoFocus
                              className="mt-1.5 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400"
                              onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
                              value={draft.name}
                            />
                          </label>
                          <label>
                            <span className="text-xs font-medium text-zinc-500">颜色</span>
                            <input
                              className="mt-1.5 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400"
                              onChange={(event) => setDraft((current) => ({ ...current, color: event.target.value }))}
                              placeholder="#2563eb 或 blue"
                              value={draft.color}
                            />
                          </label>
                        </div>
                      ) : (
                        <div className="flex items-center gap-3">
                          <span
                            aria-label={tag.color ? `颜色 ${tag.color}` : "未设置颜色"}
                            className="h-4 w-4 shrink-0 rounded-full border border-zinc-300 bg-zinc-100"
                            style={tag.color ? { backgroundColor: tag.color } : undefined}
                          />
                          <h2 className="truncate font-semibold text-zinc-950">{tag.name}</h2>
                          <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-600">
                            {countsByTagId.get(tag.id) ?? 0} 条 Knowledge
                          </span>
                        </div>
                      )}
                      <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-zinc-500">
                        <div><dt className="inline">创建：</dt><dd className="inline">{formatDate(tag.createdAt)}</dd></div>
                        <div><dt className="inline">更新：</dt><dd className="inline">{formatDate(tag.updatedAt)}</dd></div>
                        {!isEditing ? <div><dt className="inline">颜色：</dt><dd className="inline">{tag.color ?? "未设置"}</dd></div> : null}
                      </dl>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      {isEditing ? (
                        <>
                          <button className="rounded-lg bg-zinc-950 px-3 py-2 text-sm font-medium text-white" onClick={() => saveEdit(tag)} type="button">保存</button>
                          <button className="rounded-lg border border-zinc-200 px-3 py-2 text-sm font-medium text-zinc-600" onClick={() => setEditingId(null)} type="button">取消</button>
                        </>
                      ) : (
                        <button className="rounded-lg border border-zinc-200 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50" onClick={() => startEditing(tag)} type="button">编辑</button>
                      )}
                      <button className="rounded-lg px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50" onClick={() => deleteTag(tag)} type="button">删除</button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
