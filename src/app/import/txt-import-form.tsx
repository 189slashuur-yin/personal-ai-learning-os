"use client";

import { useRouter } from "next/navigation";
import { type ChangeEvent, useState } from "react";
import type { ImportedSource } from "@/core/entities/imported-source";
import { BrowserSourceStorage } from "@/infrastructure/storage/browser-source-storage";

export function TxtImportForm() {
  const router = useRouter();
  const [source, setSource] = useState<ImportedSource | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    setSource(null);
    setError(null);

    if (!file) {
      return;
    }

    if (!file.name.toLowerCase().endsWith(".txt")) {
      setError("当前任务只支持 TXT 文件，请重新选择。");
      return;
    }

    try {
      const content = await file.text();

      if (!content.trim()) {
        setError("这个 TXT 文件没有可分析的文字内容。");
        return;
      }

      setSource({
        id: crypto.randomUUID(),
        kind: "text",
        name: file.name,
        content,
        importedAt: new Date().toISOString(),
      });
    } catch {
      setError("文件读取失败，请重新选择。");
    }
  }

  function continueToAnalysis() {
    if (!source) {
      return;
    }

    new BrowserSourceStorage().saveCurrent(source);
    router.push("/analysis");
  }

  return (
    <section className="mt-8 max-w-2xl space-y-6">
      <label className="block rounded-xl border border-dashed border-zinc-300 bg-white p-6">
        <span className="block font-medium text-zinc-900">选择 TXT 文件</span>
        <span className="mt-1 block text-sm text-zinc-500">
          文件只会保存在当前浏览器中。
        </span>
        <input
          accept=".txt,text/plain"
          className="mt-4 block w-full text-sm text-zinc-600 file:mr-4 file:rounded-md file:border-0 file:bg-zinc-900 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white"
          onChange={handleFileChange}
          type="file"
        />
      </label>

      {error ? (
        <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      {source ? (
        <div className="space-y-4 rounded-xl border border-zinc-200 bg-white p-6">
          <div>
            <p className="font-medium text-zinc-950">已识别 TXT 内容</p>
            <p className="mt-1 text-sm text-zinc-500">
              {source.name} · {source.content.length} 个字符
            </p>
          </div>
          <p className="max-h-36 overflow-hidden whitespace-pre-wrap rounded-lg bg-zinc-50 p-4 text-sm leading-6 text-zinc-700">
            {source.content.slice(0, 300)}
          </p>
          <button
            className="rounded-lg bg-zinc-950 px-5 py-3 text-sm font-medium text-white"
            onClick={continueToAnalysis}
            type="button"
          >
            保存并进入分析
          </button>
        </div>
      ) : null}
    </section>
  );
}
