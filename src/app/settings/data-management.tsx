"use client";

import { type ChangeEvent, useState } from "react";
import type { AppDataBundle } from "@/infrastructure/storage/app-data-storage";
import { AppDataStorage } from "@/infrastructure/storage/app-data-storage";
import {
  getStorageMode,
  setStorageMode,
  type StorageMode,
} from "@/infrastructure/storage/storage-factory";
import {
  countStore,
  replaceStores,
  type StoreName,
} from "@/infrastructure/storage/indexeddb/database";
import {
  clearCaches,
  preloadAll,
} from "@/infrastructure/storage/indexeddb/preload";
import { BrowserConversationStorage } from "@/infrastructure/storage/browser-conversation-storage";
import { BrowserMessageStorage } from "@/infrastructure/storage/browser-message-storage";
import { BrowserRoundStorage } from "@/infrastructure/storage/browser-round-storage";
import { BrowserSourceStorage } from "@/infrastructure/storage/browser-source-storage";
import { BrowserProposalStorage } from "@/infrastructure/storage/browser-proposal-storage";
import { BrowserKnowledgeCardStorage } from "@/infrastructure/storage/browser-knowledge-card-storage";
import { BrowserConversationVersionStorage } from "@/infrastructure/storage/browser-conversation-version-storage";

const backupCommand = "node scripts/backup-local-data.mjs";
const importGroups = [
  { label: "Workspaces / Folders", keys: ["ai-learning-os.workspaces"] },
  { label: "Conversations", keys: ["ai-learning-os.conversations", "ai-learning-os.sources", "ai-learning-os.conversation-versions"] },
  { label: "Rounds / Messages", keys: ["ai-learning-os.rounds", "ai-learning-os.messages"] },
  { label: "Proposals", keys: ["ai-learning-os.proposals", "ai-learning-os.current-proposal"] },
  { label: "Knowledge", keys: ["ai-learning-os.knowledge-cards"] },
  { label: "Tags", keys: ["ai-learning-os.tags"] },
  { label: "Tasks", keys: ["ai-learning-os.tasks"] },
  { label: "Assets", keys: ["ai-learning-os.assets"] },
] as const;

type Preview = {
  bundle: AppDataBundle;
  keys: string[];
  counts: Record<string, number>;
  indexedDBCounts: Record<string, number>;
};

export function DataManagement() {
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);

  // ---- Migration state ----
  const [currentMode, setCurrentMode] = useState<StorageMode>(getStorageMode);
  const [migratePreview, setMigratePreview] = useState<
    Record<string, number> | null
  >(null);
  const [migrating, setMigrating] = useState(false);
  const [migrateReport, setMigrateReport] = useState<string | null>(null);
  const [migrateError, setMigrateError] = useState<string | null>(null);

  async function copyCommand() {
    try {
      await navigator.clipboard.writeText(backupCommand);
      setCopyStatus("备份命令已复制。");
    } catch {
      setCopyStatus("无法自动复制，请手动选择命令文本。");
    }
  }

  async function downloadBundle() {
    const bundle = await new AppDataStorage().exportData();
    const blob = new Blob([JSON.stringify(bundle, null, 2)], {
      type: "application/json",
    });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `palos-app-data-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  async function chooseBundle(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const next = new AppDataStorage().preview(await file.text());
      setPreview(next);
      setSelectedKeys(next.keys);
      setCopyStatus(null);
    } catch (error) {
      setPreview(null);
      setCopyStatus(
        error instanceof Error ? error.message : "无法读取 App Data 备份。",
      );
    }
  }

  function toggleGroup(keys: readonly string[], selected: boolean) {
    const available = keys.filter((key) => preview?.keys.includes(key));
    setSelectedKeys((current) =>
      selected
        ? [...new Set([...current, ...available])]
        : current.filter((key) => !available.includes(key)),
    );
  }

  async function importBundle() {
    if (!preview) return;
    const indexedDBRecordCount = Object.values(preview.indexedDBCounts).reduce(
      (sum, count) => sum + count,
      0,
    );
    if (!selectedKeys.length && indexedDBRecordCount === 0) return;
    if (
      !window.confirm(
        `将导入 ${selectedKeys.length} 个 PALOS LocalStorage keys，并恢复 ${indexedDBRecordCount} 条 IndexedDB 业务记录。现有同类数据会被替换；继续？`,
      )
    ) return;
    if (
      !window.confirm(
        "二次确认：已检查 key / entity count 和导入类型。失败时会回滚原数据。",
      )
    ) return;
    try {
      const result = await new AppDataStorage().importData(
        preview.bundle,
        selectedKeys,
      );
      setCurrentMode(getStorageMode());
      setCopyStatus(
        `已导入 ${result.importedLocalStorageKeys} 个 LocalStorage keys，恢复 ${result.importedIndexedDBStores} 个 IndexedDB stores / ${result.indexedDBRecords} 条业务记录。`,
      );
    } catch (error) {
      setCopyStatus(
        error instanceof Error
          ? `导入失败：${error.message}`
          : "导入失败，原数据已回滚，没有清空旧数据。",
      );
    }
  }

  // PALOS business localStorage keys that should be cleared on "Clear All".
  // These match the keys exported by BrowserAppDataStorage and read by
  // Dashboard / Search / Recent Imports via Browser*Storage classes.
  const PALOS_LOCALSTORAGE_KEYS = [
    "ai-learning-os.workspaces",
    "ai-learning-os.conversations",
    "ai-learning-os.sources",
    "ai-learning-os.current-source",
    "ai-learning-os.messages",
    "ai-learning-os.rounds",
    "ai-learning-os.proposals",
    "ai-learning-os.current-proposal",
    "ai-learning-os.knowledge-cards",
    "ai-learning-os.assets",
    "ai-learning-os.tasks",
    "ai-learning-os.tags",
    "ai-learning-os.analyzer-runs",
    "ai-learning-os.conversation-versions",
    "ai-learning-os.recipes",
    "ai-learning-os.feedback",
    "ai-learning-os.app-event-log",
    "ai-learning-os.provider-configurations",
    "ai-learning-os.analyzer-prompt-templates",
    "ai-learning-os.current-provider",
  ];

  async function clearBusinessData() {
    if (
      !window.confirm(
        "将清空 IndexedDB 与 LocalStorage 中的全部 PALOS 业务数据：Conversation、Message、Round、Source、Proposal、KnowledgeCard、ConversationVersion，以及 LocalStorage 中的导入记录、搜索数据等。\n\n保留：palos.storage-mode（IndexedDB / LocalStorage 模式选择）、主题、Provider 配置等轻量设置不会被清除。继续？",
      )
    ) return;
    if (
      !window.confirm(
        "二次确认：清空后刷新页面也不会恢复，但 palos.storage-mode 会保留，页面仍使用当前存储引擎。请确认已完成 App Data Export。",
      )
    ) return;

    try {
      // 1. Clear IndexedDB business stores
      await replaceStores({
        conversations: [],
        messages: [],
        rounds: [],
        sources: [],
        proposals: [],
        "knowledge-cards": [],
        "conversation-versions": [],
      });

      // 2. Clear in-memory caches
      clearCaches();
      await preloadAll();

      // 3. Clear all PALOS localStorage business keys
      for (const key of PALOS_LOCALSTORAGE_KEYS) {
        try {
          window.localStorage.removeItem(key);
        } catch {
          // non-critical per-key failure
        }
      }

      setCopyStatus("PALOS 业务数据已全部清空（IndexedDB + LocalStorage）。轻量配置已保留。");
    } catch (error) {
      setCopyStatus(
        error instanceof Error
          ? `清空失败：${error.message}`
          : "清空失败，数据状态未确认。",
      );
    }
  }

  // ---- Migration helpers ----

  function previewMigration() {
    try {
      const counts: Record<string, number> = {
        Conversations: new BrowserConversationStorage().getAll().length,
        Messages: new BrowserMessageStorage().getAll().length,
        Rounds: new BrowserRoundStorage().getAll().length,
        Sources: new BrowserSourceStorage().getAll().length,
        Proposals: new BrowserProposalStorage().getAll().length,
        "Knowledge Cards": new BrowserKnowledgeCardStorage().getAll().length,
        "Conversation Versions":
          new BrowserConversationVersionStorage().getAll().length,
      };
      setMigratePreview(counts);
      setMigrateError(null);
    } catch {
      setMigrateError("无法读取 LocalStorage 数据用于预览。");
    }
  }

  async function executeMigration() {
    if (!migratePreview) return;
    if (
      !window.confirm(
        "将把 LocalStorage 中的全部数据复制到 IndexedDB。\n\n" +
          "• LocalStorage 原数据不会删除\n" +
          "• 迁移后 PALOS 继续使用默认 IndexedDB\n" +
          "• LocalStorage legacy/debug 切换仅用于兼容和调试\n\n" +
          "继续？",
      )
    )
      return;

    setMigrating(true);
    setMigrateError(null);
    setMigrateReport(null);

    try {
      const stores: {
        name: StoreName;
        data: unknown[];
      }[] = [
        {
          name: "conversations",
          data: new BrowserConversationStorage().getAll(),
        },
        { name: "messages", data: new BrowserMessageStorage().getAll() },
        { name: "rounds", data: new BrowserRoundStorage().getAll() },
        { name: "sources", data: new BrowserSourceStorage().getAll() },
        { name: "proposals", data: new BrowserProposalStorage().getAll() },
        {
          name: "knowledge-cards",
          data: new BrowserKnowledgeCardStorage().getAll(),
        },
        {
          name: "conversation-versions",
          data: new BrowserConversationVersionStorage().getAll(),
        },
      ];

      const totalRecords = stores.reduce(
        (sum, store) => sum + store.data.length,
        0,
      );

      await replaceStores(
        Object.fromEntries(
          stores.map((store) => [store.name, store.data]),
        ) as Partial<Record<StoreName, unknown[]>>,
      );

      // Verify
      clearCaches();
      await preloadAll();
      const verifyCounts: number[] = await Promise.all(
        stores.map((s) => countStore(s.name)),
      );
      const totalWritten = verifyCounts.reduce((a, b) => a + b, 0);

      if (totalWritten !== totalRecords) {
        throw new Error(
          `verification mismatch: expected ${totalRecords}, got ${totalWritten}`,
        );
      }

      setStorageMode("indexedDB");
      setMigrateReport(
        `✅ 迁移完成：${totalRecords} 条记录已写入 IndexedDB（验证 ${totalWritten} 条）。\n` +
          "LocalStorage 数据保留未删除。页面即将刷新…",
      );

      // Reload after short delay so user sees the report
      setTimeout(() => window.location.reload(), 2000);
    } catch (error) {
      setMigrateError(
        error instanceof Error
          ? `迁移失败：${error.message}`
          : "迁移失败，请重试。LocalStorage 数据未受影响。",
      );
    } finally {
      setMigrating(false);
    }
  }

  function switchToLocalStorage() {
    if (
      !window.confirm(
        "切回 LocalStorage 模式？\n\nIndexedDB 中的数据不会删除，但应用将改用 LocalStorage。",
      )
    )
      return;
    setStorageMode("localStorage");
    setCurrentMode("localStorage");
    setMigrateReport("已切回 LocalStorage 模式。页面即将刷新…");
    setTimeout(() => window.location.reload(), 1000);
  }

  return (
    <section className="mt-10 max-w-3xl rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-zinc-950">Data Management</h2>
      <div className="mt-4 space-y-2 text-sm leading-6 text-zinc-600">
        <p>业务数据默认保存在当前浏览器 IndexedDB；LocalStorage 仅保留轻量配置、UI 偏好与旧数据迁移兼容。</p>
        <p>Asset 只保存 metadata 与路径，不保存、复制或上传文件内容。</p>
        <p>备份脚本：<code className="font-semibold text-zinc-900">scripts/backup-local-data.mjs</code></p>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3 rounded-lg bg-zinc-950 p-3 text-sm text-white">
        <code className="min-w-0 flex-1 break-all">{backupCommand}</code>
        <button className="rounded-md bg-white px-3 py-1.5 text-xs font-semibold text-zinc-950" onClick={copyCommand} type="button">复制备份命令</button>
      </div>
      <p className="mt-3 text-xs leading-5 text-amber-700">脚本继续保留，但不会替浏览器执行；LocalStorage 请用下方 App Data 导出。</p>

      <div className="mt-6 border-t border-zinc-100 pt-5">
        <h3 className="font-semibold">Export / Import App Data</h3>
        <p className="mt-1 text-xs text-zinc-500">
          导出/导入 PALOS 自身的全部业务数据（IndexedDB + LocalStorage 配置），用于备份恢复或跨浏览器迁移。
          与 ChatGPT Export Import（在 Import 页面导入 conversations.json）是不同功能：
          App Data 导入会替换现有数据，ChatGPT Import 会创建或追加 Conversation。
        </p>
        <div className="mt-3 flex flex-wrap gap-3">
          <button className="rounded-lg bg-zinc-950 px-4 py-2.5 text-sm font-semibold text-white" onClick={downloadBundle} type="button">Export App Data</button>
          <label className="rounded-lg border border-zinc-300 px-4 py-2.5 text-sm font-semibold">选择 Import App Data<input accept="application/json,.json" className="sr-only" onChange={chooseBundle} type="file" /></label>
        </div>
        {preview ? (
          <div className="mt-4 rounded-lg border border-zinc-200 p-4">
            <p className="text-sm font-semibold">Import Preview · {preview.bundle.exportedAt}</p>
            <p className="mt-1 text-xs text-zinc-500">LocalStorage 轻量配置可按领域选择；IndexedDB 业务数据会作为正式存储快照恢复。</p>
            {Object.values(preview.indexedDBCounts).some((count) => count > 0) ? (
              <dl className="mt-3 grid grid-cols-2 gap-2 rounded-lg bg-emerald-50 p-3 text-xs sm:grid-cols-4">
                {Object.entries(preview.indexedDBCounts).map(([label, count]) => (
                  <div key={label}>
                    <dt className="font-semibold text-emerald-800">{label}</dt>
                    <dd className="text-emerald-950">{count} records</dd>
                  </div>
                ))}
              </dl>
            ) : null}
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {importGroups.map((group) => {
                const available = group.keys.filter((key) => preview.keys.includes(key));
                const selected = available.length > 0 && available.every((key) => selectedKeys.includes(key));
                return (
                  <label className="rounded-lg border border-zinc-200 p-3 text-xs font-semibold" key={group.label}>
                    <input checked={selected} className="mr-2" disabled={!available.length} onChange={(event) => toggleGroup(group.keys, event.target.checked)} type="checkbox" />
                    {group.label} · {available.reduce((sum, key) => sum + preview.counts[key], 0)} records
                  </label>
                );
              })}
            </div>
            <details className="mt-4">
              <summary className="cursor-pointer text-xs font-semibold text-zinc-600">Advanced: PALOS keys</summary>
              <div className="mt-3 grid gap-2">
                {preview.keys.map((key) => (
                  <label className="text-xs" key={key}>
                    <input checked={selectedKeys.includes(key)} className="mr-2" onChange={(event) => setSelectedKeys((current) => event.target.checked ? [...new Set([...current, key])] : current.filter((item) => item !== key))} type="checkbox" />
                    {key} · {preview.counts[key]} records
                  </label>
                ))}
              </div>
            </details>
            <button className="mt-4 rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white" onClick={importBundle} type="button">确认导入所选类型</button>
          </div>
        ) : null}
        <div className="mt-5 rounded-lg border border-red-200 bg-red-50 p-4">
          <p className="text-sm font-semibold text-red-900">Clear All App Data</p>
          <p className="mt-1 text-xs leading-5 text-red-700">
            清空 IndexedDB 全部业务表 + LocalStorage PALOS 业务键。<strong>palos.storage-mode（存储引擎选择）保留</strong>，轻量配置（如主题、Provider 配置）也保留。清空后刷新页面，应用将以当前存储模式启动，数据为空。
          </p>
          <button
            className="mt-3 rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white"
            onClick={clearBusinessData}
            type="button"
          >
            Clear All App Data
          </button>
        </div>
      </div>
      {copyStatus ? <p className="mt-3 text-xs text-zinc-500" role="status">{copyStatus}</p> : null}

      {/* ---- Legacy Data Migration ---- */}
      <div className="mt-8 border-t border-zinc-200 pt-6">
        <h3 className="font-semibold text-zinc-950">
          Legacy Data Migration / 旧数据迁移
        </h3>
        <p className="mt-1 text-sm text-zinc-600">
          当前业务存储：<strong>{currentMode === "indexedDB" ? "IndexedDB" : "LocalStorage (legacy/debug)"}</strong>
        </p>

        <div className="mt-4 space-y-4">
          <div className="rounded-lg border border-sky-200 bg-sky-50 p-4">
            <p className="text-sm font-semibold text-sky-900">
              旧 LocalStorage 数据不会自动删除
            </p>
            <p className="mt-1 text-xs text-sky-800">
              此工具只用于检测旧版本业务数据，并复制到 IndexedDB。正常新用户无需执行这一步。
            </p>
          </div>

          {!migratePreview ? (
            <button
              className="rounded-lg bg-sky-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-800"
              onClick={previewMigration}
              type="button"
            >
              Preview legacy LocalStorage data
            </button>
          ) : (
            <div className="rounded-lg border border-sky-200 bg-sky-50 p-4">
              <p className="text-sm font-semibold text-sky-900">
                迁移预览（LocalStorage → IndexedDB）
              </p>
              <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
                {Object.entries(migratePreview).map(([label, count]) => (
                  <div key={label}>
                    <dt className="text-xs text-sky-700">{label}</dt>
                    <dd className="text-lg font-bold text-sky-900">{count}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-3 text-xs text-sky-700">
                总计：{Object.values(migratePreview).reduce((a, b) => a + b, 0)} 条记录。
                {Object.values(migratePreview).every((count) => count === 0)
                  ? "无需迁移。"
                  : "LocalStorage 原数据不会被删除。"}
              </p>
              <button
                className="mt-3 rounded-lg bg-sky-700 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-800 disabled:opacity-40"
                disabled={migrating || Object.values(migratePreview).every((count) => count === 0)}
                onClick={executeMigration}
                type="button"
              >
                {migrating ? "迁移中…" : "迁移旧数据到 IndexedDB"}
              </button>
            </div>
          )}

          {migrateError ? (
            <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
              {migrateError}
            </p>
          ) : null}
        </div>

        <details className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-4">
          <summary className="cursor-pointer text-sm font-semibold text-amber-900">
            Advanced / Debug
          </summary>
          <p className="mt-2 text-xs leading-5 text-amber-800">
            切回 LocalStorage 仅用于旧数据兼容、调试或回滚验证；普通使用不需要切换。
          </p>
          <div className="mt-4">
            <button
              className="rounded-lg border border-amber-300 bg-white px-4 py-2 text-sm font-semibold text-amber-800 hover:bg-amber-50"
              onClick={switchToLocalStorage}
              type="button"
            >
              切回 LocalStorage legacy/debug
            </button>
          </div>
        </details>

        {migrateReport ? (
          <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
            <p className="text-sm font-semibold text-emerald-900">
              {migrateReport}
            </p>
          </div>
        ) : null}
      </div>
    </section>
  );
}
