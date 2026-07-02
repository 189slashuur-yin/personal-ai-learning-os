import { AnalysisResult } from "./analysis-result";

export default function AnalysisPage() {
  return (
    <main className="page-shell">
      <p className="page-step">步骤 2</p>
      <h1 className="page-title">Analyzer</h1>
      <p className="page-description">
        使用当前 Provider 从已保存的 TXT Source 生成一条结构化 Proposal。
      </p>
      <AnalysisResult />
    </main>
  );
}
