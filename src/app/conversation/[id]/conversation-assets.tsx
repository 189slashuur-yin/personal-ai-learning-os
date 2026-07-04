"use client";

import { useEffect, useState } from "react";
import type { Asset } from "@/core/entities/asset";
import { AssetService } from "@/core/services/asset-service";
import { BrowserAssetStorage } from "@/infrastructure/storage/browser-asset-storage";

export function ConversationAssets({ conversationId }: { conversationId: string }) {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [filename, setFilename] = useState("");
  const [localPath, setLocalPath] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  function service() {
    return new AssetService(new BrowserAssetStorage());
  }

  function refresh() {
    setAssets(service().listForEntity("conversation", conversationId));
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setAssets(
        new AssetService(new BrowserAssetStorage()).listForEntity(
          "conversation",
          conversationId,
        ),
      );
    }, 0);
    return () => window.clearTimeout(timer);
  }, [conversationId]);

  function addAsset() {
    try {
      service().addMetadata({
        entityType: "conversation",
        entityId: conversationId,
        filename,
        localPath,
        note,
      });
      setFilename("");
      setLocalPath("");
      setNote("");
      setError(null);
      refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "无法保存 Asset metadata。");
    }
  }

  function removeAsset(asset: Asset) {
    const confirmed = window.confirm(
      `删除「${asset.filename}」的 metadata？本地文件不会被删除。`,
    );
    if (!confirmed) return;
    service().removeMetadata(asset.id);
    refresh();
  }

  return (
    <section className="detail-section">
      <div className="detail-section-heading">
        <p className="detail-kicker">02 · Local Assets</p>
        <h2 className="detail-title">Assets</h2>
        <p className="detail-description">
          浏览器版本只记录文件路径和 metadata；不会复制、上传或读取本机文件。
        </p>
      </div>
      <div className="rounded-xl border border-zinc-200 bg-white p-5">
        <div className="grid gap-3 md:grid-cols-3">
          <label className="text-xs font-semibold text-zinc-600">
            文件名
            <input className="mt-1.5 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm font-normal" onChange={(event) => setFilename(event.target.value)} value={filename} />
          </label>
          <label className="text-xs font-semibold text-zinc-600">
            本地路径
            <input className="mt-1.5 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm font-normal" onChange={(event) => setLocalPath(event.target.value)} placeholder="/Users/... 或 assets/..." value={localPath} />
          </label>
          <label className="text-xs font-semibold text-zinc-600">
            备注
            <input className="mt-1.5 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm font-normal" onChange={(event) => setNote(event.target.value)} value={note} />
          </label>
        </div>
        <button className="mt-3 rounded-lg bg-zinc-950 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40" disabled={!filename.trim()} onClick={addAsset} type="button">
          添加 Asset metadata
        </button>
        {error ? <p className="mt-3 text-sm text-red-700" role="alert">{error}</p> : null}
        <div className="mt-5 space-y-3">
          {assets.length === 0 ? <p className="text-sm text-zinc-500">尚未关联 Asset。</p> : assets.map((asset) => (
            <div className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-zinc-100 bg-zinc-50 p-3" key={asset.id}>
              <div className="min-w-0">
                <p className="font-medium text-zinc-900">{asset.filename}</p>
                <p className="mt-1 break-all text-xs text-zinc-500">{asset.localPath ?? "未记录路径"}</p>
                {asset.note ? <p className="mt-1 text-sm text-zinc-600">{asset.note}</p> : null}
              </div>
              <button className="text-xs font-semibold text-red-700" onClick={() => removeAsset(asset)} type="button">删除 metadata</button>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
