import { TxtImportForm } from "./txt-import-form";

export default function ImportPage() {
  return (
    <main className="page-shell">
      <p className="page-step">步骤 1</p>
      <h1 className="page-title">导入 TXT</h1>
      <p className="page-description">
        上传 TXT 后，将它归入已有 Conversation，或自动创建一个新的工作区。
      </p>
      <TxtImportForm />
    </main>
  );
}
