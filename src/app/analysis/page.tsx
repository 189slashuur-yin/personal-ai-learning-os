import { AnalysisResult } from "./analysis-result";

export default function AnalysisPage() {
  return (
    <main className="page-shell">
      <p className="page-step">步骤 2</p>
      <h1 className="page-title">Demo Analyzer</h1>
      <p className="page-description">
        从已保存的 TXT Source 读取内容，并生成一条固定结构的 Proposal。
      </p>
      <AnalysisResult />
    </main>
  );
}
