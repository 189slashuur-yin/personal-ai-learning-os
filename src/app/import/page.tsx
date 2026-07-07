import { Suspense } from "react";
import { ImportWorkbench } from "./import-workbench";

export default function ImportPage() {
  return (
    <main className="page-shell">
      <p className="page-step">Import</p>
      <h1 className="page-title">导入内容</h1>
      <p className="page-description">粘贴对话、导入 ChatGPT Export（conversations.json / conversations-*.json）或手动整理轮次；预览后再确认写入本地。ChatGPT 用户请在设置中导出数据 → 下载 zip → 解压找到 conversations.json 或 conversations-*.json → 选择「导入 ChatGPT Export」。</p>
      <Suspense fallback={<p className="text-sm text-zinc-500">加载导入工具…</p>}>
        <ImportWorkbench />
      </Suspense>
    </main>
  );
}
