import { SearchExperience } from "./search-experience";
import {
  searchEntityTypes,
  type SearchEntityType,
} from "@/core/entities/search-filter";

type SearchPageProps = {
  searchParams: Promise<{ q?: string; workspaceId?: string; type?: string }>;
};

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const { q = "", workspaceId = "", type = "" } = await searchParams;
  const initialType = searchEntityTypes.includes(type as SearchEntityType)
    ? (type as SearchEntityType)
    : undefined;

  return (
    <main className="workspace-shell pb-24">
      <p className="eyebrow">Global search</p>
      <h1 className="workspace-title">搜索 Learning OS</h1>
      <p className="workspace-description">跨工作区查找标题、内容和来源。结果仅来自当前浏览器的本地存储。</p>
      <SearchExperience
        initialQuery={q}
        initialType={initialType}
        initialWorkspaceId={workspaceId}
      />
    </main>
  );
}
