import { TxtImportForm } from "./txt-import-form";

export default function ImportPage() {
  return (
    <main className="page-shell">
      <p className="page-step">步骤 1</p>
      <h1 className="page-title">导入内容</h1>
      <p className="page-description">
        先上传一份 TXT。确认识别结果后，我们会进入模拟分析流程。
      </p>
      <TxtImportForm />
    </main>
  );
}
