import { SearchExperience } from "./search-experience";
import {
  searchDocumentEntityTypes,
  type SearchDocumentEntityType,
} from "@/core/entities/search-document";

type SearchPageProps = {
  searchParams: Promise<{ q?: string; workspaceId?: string; type?: string }>;
};

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const { q = "", workspaceId = "", type = "" } = await searchParams;
  const initialType = searchDocumentEntityTypes.includes(
    type as SearchDocumentEntityType,
  )
    ? (type as SearchDocumentEntityType)
    : undefined;

  return (
    <main className="workspace-shell pb-24">
      <p className="eyebrow">Global search</p>
      <h1 className="workspace-title">搜索 PALOS Context</h1>
      <p className="workspace-description">优先检索当前 Context、Summary、Conclusion 与 Knowledge，再定位 Round Note 和原始 Message。索引仅在运行时构建。</p>
      <SearchExperience
        initialQuery={q}
        initialType={initialType}
        initialWorkspaceId={workspaceId}
      />
    </main>
  );
}
