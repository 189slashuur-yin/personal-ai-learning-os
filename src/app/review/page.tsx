import { ReviewProposal } from "./review-proposal";

export default function ReviewPage() {
  return (
    <main className="page-shell">
      <p className="page-step">步骤 3</p>
      <h1 className="page-title">审核建议</h1>
      <p className="page-description">
        查看 Demo Analyzer 生成的 Proposal，并决定是否接受。
      </p>
      <ReviewProposal />
    </main>
  );
}
