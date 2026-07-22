"use client";

import { useEffect, useRef, useState } from "react";
import type { Round } from "@/core/entities/round";
import {
  DebouncedAutosave,
  type AutosaveStatus,
} from "@/core/services/debounced-autosave";
import { RoundKnowledgeService } from "@/core/services/round-knowledge-service";
import {
  parseRoundRecord,
  serializeRoundRecord,
  type RoundRecordDraft,
} from "@/core/services/round-record";
import { RoundService } from "@/core/services/round-service";
import {
  createKnowledgeCardStorage,
  createProposalStorage,
  createRoundStorage,
  getStorageMode,
} from "@/infrastructure/storage/storage-factory";
import { drainPendingWritesOrThrow } from "@/infrastructure/storage/indexeddb/database";

const primaryFields: Array<{
  field: "notes" | "conclusion" | "nextActions";
  label: string;
  placeholder: string;
}> = [
  {
    field: "notes",
    label: "我的备注",
    placeholder: "记录这一轮对你有用的观察或补充。",
  },
  {
    field: "conclusion",
    label: "本轮结论",
    placeholder: "这一轮最终确认了什么？",
  },
  {
    field: "nextActions",
    label: "下一步",
    placeholder: "下一轮从哪里继续？",
  },
];

const advancedFields: Array<{
  field: "goal" | "decisions" | "pendingQuestions" | "legacyNote";
  label: string;
  placeholder: string;
}> = [
  { field: "goal", label: "本轮目标", placeholder: "这一轮要解决什么？" },
  { field: "decisions", label: "新增决定", placeholder: "本轮新增的人工决定。" },
  { field: "pendingQuestions", label: "遗留问题", placeholder: "尚未解决的问题。" },
  {
    field: "legacyNote",
    label: "旧自由 Round Note",
    placeholder: "未分段的旧 Round Note 会完整保留在这里。",
  },
];

const statusLabels: Record<AutosaveStatus, string> = {
  unchanged: "未修改",
  dirty: "等待保存",
  saving: "保存中…",
  saved: "已保存",
  error: "保存失败，点击重试",
};

export function RoundRecordPanel({
  round,
  onSaved,
}: {
  round: Round;
  onSaved: (round: Round) => void;
}) {
  const [draft, setDraft] = useState(() => parseRoundRecord(round));
  const [status, setStatus] = useState<AutosaveStatus>("unchanged");
  const [knowledgeNotice, setKnowledgeNotice] = useState<string | null>(null);
  const draftRef = useRef(draft);
  const latestRoundRef = useRef(round);
  const onSavedRef = useRef(onSaved);
  const autosaveRef = useRef<DebouncedAutosave<RoundRecordDraft> | null>(null);

  useEffect(() => {
    onSavedRef.current = onSaved;
  }, [onSaved]);

  useEffect(() => {
    latestRoundRef.current = round;
  }, [round]);

  useEffect(() => {
    let active = true;
    const autosave = new DebouncedAutosave<RoundRecordDraft>(
      async (value) => {
        const serialized = serializeRoundRecord(value);
        const updated = new RoundService(createRoundStorage()).updateRound(
          round.id,
          serialized,
        );

        if (!updated) {
          throw new Error("Round no longer exists");
        }

        if (getStorageMode() === "indexedDB") {
          await drainPendingWritesOrThrow();
        }

        latestRoundRef.current = updated;
        if (active) onSavedRef.current(updated);
      },
      setStatus,
      750,
    );
    autosaveRef.current = autosave;

    const flushBeforeUnload = () => {
      void autosave.flush();
    };
    window.addEventListener("beforeunload", flushBeforeUnload);

    return () => {
      active = false;
      window.removeEventListener("beforeunload", flushBeforeUnload);
      void autosave.dispose();
      if (autosaveRef.current === autosave) {
        autosaveRef.current = null;
      }
    };
  }, [round.id]);

  function updateField(field: keyof RoundRecordDraft, value: string) {
    const next = { ...draftRef.current, [field]: value };
    draftRef.current = next;
    setDraft(next);
    setKnowledgeNotice(null);
    autosaveRef.current?.schedule(next);
  }

  async function saveConclusionAsKnowledge() {
    const flushed = await autosaveRef.current?.flush();

    if (flushed === false) {
      setKnowledgeNotice("本轮记录尚未保存成功，请重试后再创建 Knowledge。");
      return;
    }

    const content = draftRef.current.conclusion.trim();

    if (!content) {
      setKnowledgeNotice("请先填写本轮结论。");
      return;
    }

    const storedRound =
      createRoundStorage().getById(round.id) ?? latestRoundRef.current;
    const title = `${storedRound.title} · 本轮结论`;
    const confirmed = window.confirm(
      `预览 Knowledge\n\n标题：${title}\n\n内容：${content}\n\n确认后才会创建 Knowledge。`,
    );

    if (!confirmed) return;

    const result = new RoundKnowledgeService(
      createKnowledgeCardStorage(),
      createProposalStorage(),
    ).createManualWithResult(storedRound, title, content);
    setKnowledgeNotice(
      result.created
        ? "已保存为 Knowledge；不会影响本轮记录或参考来源。"
        : "相同来源与内容的 Knowledge 已存在，未重复创建。",
    );
  }

  return (
    <section
      className="min-w-0 rounded-xl border border-amber-200 bg-amber-50/40 p-4"
      data-testid={`round-record-${round.id}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-zinc-950">本轮记录</p>
          <p className="mt-1 text-xs text-zinc-500">只属于当前 Round，不会被历史参考覆盖。</p>
        </div>
        <button
          className={
            status === "error"
              ? "rounded-full bg-red-100 px-2.5 py-1 text-[11px] font-semibold text-red-700"
              : "rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-zinc-600"
          }
          onClick={() => {
            if (status === "error") autosaveRef.current?.retry();
          }}
          type="button"
        >
          {statusLabels[status]}
        </button>
      </div>

      <div className="mt-4 grid gap-3">
        {primaryFields.map(({ field, label, placeholder }) => (
          <label className="min-w-0 text-xs font-semibold text-zinc-800" key={field}>
            <span className="flex flex-wrap items-center justify-between gap-2">
              <span>{label}</span>
              {field === "conclusion" ? (
                <button
                  className="text-[11px] font-semibold text-emerald-700 hover:text-emerald-900"
                  onClick={saveConclusionAsKnowledge}
                  type="button"
                >
                  保存为 Knowledge
                </button>
              ) : null}
            </span>
            <textarea
              aria-label={label}
              className="mt-1.5 min-h-20 w-full min-w-0 resize-y rounded-lg border border-amber-200 bg-white p-3 text-sm font-normal leading-6"
              data-round-record-field={field}
              onBlur={() => autosaveRef.current?.flush()}
              onChange={(event) => updateField(field, event.target.value)}
              placeholder={placeholder}
              value={draft[field]}
            />
          </label>
        ))}
      </div>

      <details className="mt-3 rounded-lg border border-amber-100 bg-white px-3 py-2">
        <summary className="cursor-pointer text-xs font-semibold text-zinc-700">
          更多记录
        </summary>
        <div className="mt-3 grid gap-3">
          {advancedFields.map(({ field, label, placeholder }) => (
            <label className="min-w-0 text-xs font-semibold text-zinc-700" key={field}>
              {label}
              <textarea
                aria-label={label}
                className="mt-1.5 min-h-20 w-full min-w-0 resize-y rounded-lg border border-zinc-200 p-3 text-sm font-normal leading-6"
                data-round-record-field={field}
                onBlur={() => autosaveRef.current?.flush()}
                onChange={(event) => updateField(field, event.target.value)}
                placeholder={placeholder}
                value={draft[field]}
              />
            </label>
          ))}
        </div>
      </details>

      {knowledgeNotice ? (
        <p className="mt-3 text-xs font-medium text-emerald-800" role="status">
          {knowledgeNotice}
        </p>
      ) : null}
    </section>
  );
}
