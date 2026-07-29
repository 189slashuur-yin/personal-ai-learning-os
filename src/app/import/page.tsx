import { Suspense } from "react";
import { ImportWorkbench } from "./import-workbench";

export default function ImportPage() {
  return (
    <main className="page-shell">
      <p className="page-step">Import</p>
      <h1 className="page-title">导入内容</h1>
      <p className="page-description">粘贴对话、导入 ChatGPT Export（conversations.json / conversations-*.json），或从本地 saved HTML / 完整 rendered transcript 捕获 ChatGPT Conversation Snapshot；来源 URL 可选且只用于 identity。所有路径都先预览，再显式确认写入本地。PALOS 不请求 chatgpt.com，也不读取 cookie 或 session。</p>
      <Suspense fallback={<p className="text-sm text-zinc-500">加载导入工具…</p>}>
        <ImportWorkbench />
      </Suspense>
    </main>
  );
}
