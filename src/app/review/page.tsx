import { ReviewProposal } from "./review-proposal";

type ReviewPageProps = {
  searchParams: Promise<{ proposalId?: string; proposal?: string }>;
};

export default async function ReviewPage({ searchParams }: ReviewPageProps) {
  const { proposalId, proposal } = await searchParams;

  return (
    <main className="page-shell">
      <p className="page-step">步骤 3</p>
      <h1 className="page-title">审核建议</h1>
      <p className="page-description">
        查看 AI 整理建议，并决定是否确认加入知识库。未处理的建议会保留为草稿。
      </p>
      <ReviewProposal proposalId={proposalId ?? proposal} />
    </main>
  );
}
