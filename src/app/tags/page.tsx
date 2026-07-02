import Link from "next/link";
import { TagManager } from "./tag-manager";

export default function TagsPage() {
  return (
    <main className="workspace-shell pb-24">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Tag Management</p>
          <h1 className="workspace-title">管理 Tags</h1>
          <p className="workspace-description">
            统一维护名称与颜色，并查看每个 Tag 关联的知识数量。
          </p>
        </div>
        <Link
          className="rounded-lg border border-zinc-200 bg-white px-4 py-2.5 text-sm font-medium text-zinc-700 shadow-sm hover:border-zinc-300 hover:bg-zinc-50"
          href="/knowledge"
        >
          返回知识库
        </Link>
      </div>
      <TagManager />
    </main>
  );
}
