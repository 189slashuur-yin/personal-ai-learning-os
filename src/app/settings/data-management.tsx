"use client";

import { type ChangeEvent, useState } from "react";
import type { AppDataBundle } from "@/infrastructure/storage/browser-app-data-storage";
import { BrowserAppDataStorage } from "@/infrastructure/storage/browser-app-data-storage";

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
};

export function DataManagement() {
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);

  async function copyCommand() {
    try {
      await navigator.clipboard.writeText(backupCommand);
      setCopyStatus("备份命令已复制。");
    } catch {
      setCopyStatus("无法自动复制，请手动选择命令文本。");
    }
  }

  function downloadBundle() {
    const bundle = new BrowserAppDataStorage().exportData();
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
      const next = new BrowserAppDataStorage().preview(await file.text());
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

  function importBundle() {
    if (!preview || !selectedKeys.length) return;
    if (
      !window.confirm(
        `将导入 ${selectedKeys.length} 个 PALOS keys。现有同类数据会被替换；继续？`,
      )
    ) return;
    if (
      !window.confirm(
        "二次确认：已检查 key / entity count 和导入类型。失败时会回滚原数据。",
      )
    ) return;
    try {
      const count = new BrowserAppDataStorage().importData(
        preview.bundle,
        selectedKeys,
      );
      setCopyStatus(`已导入 ${count} 个 keys。`);
    } catch {
      setCopyStatus("导入失败，原数据已回滚，没有清空旧数据。");
    }
  }

  return (
    <section className="mt-10 max-w-3xl rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-zinc-950">Data Management</h2>
      <div className="mt-4 space-y-2 text-sm leading-6 text-zinc-600">
        <p>结构化数据保存在当前浏览器 LocalStorage；清除站点数据会删除记录。</p>
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
        <div className="mt-3 flex flex-wrap gap-3">
          <button className="rounded-lg bg-zinc-950 px-4 py-2.5 text-sm font-semibold text-white" onClick={downloadBundle} type="button">Export App Data</button>
          <label className="rounded-lg border border-zinc-300 px-4 py-2.5 text-sm font-semibold">选择 Import App Data<input accept="application/json,.json" className="sr-only" onChange={chooseBundle} type="file" /></label>
        </div>
        {preview ? (
          <div className="mt-4 rounded-lg border border-zinc-200 p-4">
            <p className="text-sm font-semibold">Import Preview · {preview.bundle.exportedAt}</p>
            <p className="mt-1 text-xs text-zinc-500">先按领域选择，再可逐 key 微调。</p>
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
      </div>
      {copyStatus ? <p className="mt-3 text-xs text-zinc-500" role="status">{copyStatus}</p> : null}
    </section>
  );
}
