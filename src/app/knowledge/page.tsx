import Link from "next/link";
import { KnowledgeList } from "./knowledge-list";

export default function KnowledgePage() {
  return (
    <main className="page-shell">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="page-step">步骤 4</p>
          <h1 className="page-title">知识库</h1>
        </div>
        <Link
          className="rounded-lg border border-zinc-200 bg-white px-4 py-2.5 text-sm font-medium text-zinc-700 shadow-sm hover:border-zinc-300 hover:bg-zinc-50"
          href="/tags"
        >
          管理 Tags
        </Link>
      </div>
      <p className="page-description">
        已接受的 Proposal 会沉淀为可持续保留的 KnowledgeCard。
      </p>
      <KnowledgeList />
    </main>
  );
}
