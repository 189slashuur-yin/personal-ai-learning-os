"use client";

import { useState } from "react";

const backupCommand = "node scripts/backup-local-data.mjs";

export function DataManagement() {
  const [copyStatus, setCopyStatus] = useState<string | null>(null);

  async function copyCommand() {
    try {
      await navigator.clipboard.writeText(backupCommand);
      setCopyStatus("备份命令已复制。");
    } catch {
      setCopyStatus("无法自动复制，请手动选择命令文本。");
    }
  }

  return (
    <section className="mt-10 max-w-3xl rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-zinc-950">Data Management</h2>
      <div className="mt-4 space-y-2 text-sm leading-6 text-zinc-600">
        <p>Conversation、Knowledge、Task 等结构化数据目前主要保存在当前浏览器 LocalStorage。</p>
        <p>代码与文档保存在项目目录；清除站点数据会删除浏览器中的记录。</p>
        <p>Asset 当前只保存 metadata 与路径，不保存、复制或上传文件内容。</p>
        <p>备份脚本：<code className="font-semibold text-zinc-900">scripts/backup-local-data.mjs</code></p>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3 rounded-lg bg-zinc-950 p-3 text-sm text-white">
        <code className="min-w-0 flex-1 break-all">{backupCommand}</code>
        <button className="rounded-md bg-white px-3 py-1.5 text-xs font-semibold text-zinc-950" onClick={copyCommand} type="button">
          复制备份命令
        </button>
      </div>
      <p className="mt-3 text-xs leading-5 text-amber-700">
        浏览器不会执行此脚本；请在项目目录的终端手动运行。当前脚本不包含 LocalStorage 导出。
      </p>
      {copyStatus ? <p className="mt-2 text-xs text-zinc-500" role="status">{copyStatus}</p> : null}
    </section>
  );
}

