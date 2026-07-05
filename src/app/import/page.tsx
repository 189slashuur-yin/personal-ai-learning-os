import { ImportWorkbench } from "./import-workbench";

export default function ImportPage() {
  return (
    <main className="page-shell">
      <p className="page-step">Import</p>
      <h1 className="page-title">导入内容</h1>
      <p className="page-description">先解析与预览 Round，再由你确认写入本地数据。</p>
      <ImportWorkbench />
    </main>
  );
}
