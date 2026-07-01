import { KnowledgeList } from "./knowledge-list";

export default function KnowledgePage() {
  return (
    <main className="page-shell">
      <p className="page-step">步骤 4</p>
      <h1 className="page-title">知识库</h1>
      <p className="page-description">
        已接受的 Proposal 会沉淀为可持续保留的 KnowledgeCard。
      </p>
      <KnowledgeList />
    </main>
  );
}
