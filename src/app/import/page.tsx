import { ClipboardImportForm } from "./clipboard-import-form";
import { TxtImportForm } from "./txt-import-form";

export default function ImportPage() {
  return (
    <main className="page-shell">
      <p className="page-step">Import</p>
      <h1 className="page-title">导入内容</h1>
      <p className="page-description">
        上传 TXT 文件，或直接粘贴 ChatGPT、Claude 与普通对话文本。
      </p>
      <div className="mt-8 grid gap-10 xl:grid-cols-2">
        <section>
          <p className="eyebrow">TXT File Import</p>
          <h2 className="mt-2 text-xl font-semibold text-zinc-950">导入 TXT 文件</h2>
          <TxtImportForm />
        </section>
        <section>
          <p className="eyebrow">Clipboard Import</p>
          <h2 className="mt-2 text-xl font-semibold text-zinc-950">粘贴对话文本</h2>
          <ClipboardImportForm />
        </section>
      </div>
    </main>
  );
}
