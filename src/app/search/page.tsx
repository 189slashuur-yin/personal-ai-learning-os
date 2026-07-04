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
      <h1 className="workspace-title">搜索 Learning OS</h1>
      <p className="workspace-description">搜索当前浏览器中的全部文字，并定位到具体来源片段。索引仅在运行时构建。</p>
      <SearchExperience
        initialQuery={q}
        initialType={initialType}
        initialWorkspaceId={workspaceId}
      />
    </main>
  );
}
