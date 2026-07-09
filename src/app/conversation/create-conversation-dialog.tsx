"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import {
  conversationSourceTypes,
  type ConversationSourceType,
} from "@/core/entities/conversation";
import {
  createConversationStorage,
  ensureIndexedDBLoaded,
  getStorageMode,
} from "@/infrastructure/storage/storage-factory";
import { flushCachesToIndexedDB } from "@/infrastructure/storage/indexeddb/preload";

type CreateConversationDialogProps = {
  onClose: () => void;
};

export function CreateConversationDialog({
  onClose,
}: CreateConversationDialogProps) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [sourceType, setSourceType] =
    useState<ConversationSourceType>("Manual");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedTitle = title.trim();

    if (!trimmedTitle) {
      return;
    }

    if (getStorageMode() === "indexedDB") {
      await ensureIndexedDBLoaded();
    }

    const timestamp = new Date().toISOString();
    const id = crypto.randomUUID();

    createConversationStorage().save({
      id,
      title: trimmedTitle,
      sourceType,
      createdAt: timestamp,
      updatedAt: timestamp,
      lastOpenedAt: timestamp,
    });
    if (getStorageMode() === "indexedDB") {
      await flushCachesToIndexedDB();
    }

    router.push(`/conversation/${id}`);
  }

  return (
    <div
      aria-labelledby="create-conversation-title"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/30 px-5 backdrop-blur-sm"
      role="dialog"
    >
      <form
        className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-6 shadow-2xl"
        onSubmit={handleSubmit}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
              New workspace
            </p>
            <h2
              className="mt-2 text-xl font-semibold text-zinc-950"
              id="create-conversation-title"
            >
              创建 Conversation
            </h2>
          </div>
          <button
            aria-label="关闭"
            className="rounded-md px-2 py-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
            onClick={onClose}
            type="button"
          >
            ×
          </button>
        </div>

        <label className="mt-6 block text-sm font-medium text-zinc-800">
          标题
          <input
            autoFocus
            className="mt-2 w-full rounded-lg border border-zinc-300 px-3 py-2.5 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
            onChange={(event) => setTitle(event.target.value)}
            placeholder="例如：产品设计复盘"
            required
            value={title}
          />
        </label>

        <label className="mt-5 block text-sm font-medium text-zinc-800">
          来源
          <select
            className="mt-2 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 outline-none focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
            onChange={(event) =>
              setSourceType(event.target.value as ConversationSourceType)
            }
            value={sourceType}
          >
            {conversationSourceTypes.map((source) => (
              <option key={source} value={source}>
                {source}
              </option>
            ))}
          </select>
        </label>

        <div className="mt-7 flex justify-end gap-3">
          <button
            className="rounded-lg border border-zinc-200 px-4 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
            onClick={onClose}
            type="button"
          >
            取消
          </button>
          <button
            className="rounded-lg bg-zinc-950 px-4 py-2.5 text-sm font-medium text-white hover:bg-zinc-800"
            type="submit"
          >
            创建并打开
          </button>
        </div>
      </form>
    </div>
  );
}
