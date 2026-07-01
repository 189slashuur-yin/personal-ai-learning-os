import { SearchExperience } from "./search-experience";

type SearchPageProps = {
  searchParams: Promise<{ q?: string }>;
};

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const { q = "" } = await searchParams;

  return (
    <main className="workspace-shell pb-24">
      <p className="eyebrow">Global search</p>
      <h1 className="workspace-title">搜索 Learning OS</h1>
      <p className="workspace-description">跨工作区查找标题、内容和来源。结果仅来自当前浏览器的本地存储。</p>
      <SearchExperience initialQuery={q} />
    </main>
  );
}
