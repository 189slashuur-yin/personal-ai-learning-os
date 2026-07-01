import { KnowledgeDetail } from "./knowledge-detail";

type KnowledgeDetailPageProps = {
  params: Promise<{ id: string }>;
};

export default async function KnowledgeDetailPage({ params }: KnowledgeDetailPageProps) {
  const { id } = await params;
  return <KnowledgeDetail cardId={id} />;
}
