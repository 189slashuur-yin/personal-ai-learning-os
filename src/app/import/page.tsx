import { ImportWorkbench } from "./import-workbench";

export default function ImportPage() {
  return (
    <main className="page-shell">
      <p className="page-step">Import</p>
      <h1 className="page-title">导入内容</h1>
      <p className="page-description">粘贴对话、导入 ChatGPT Export 或手动整理轮次；预览后再确认写入本地。</p>
      <ImportWorkbench />
    </main>
  );
}
