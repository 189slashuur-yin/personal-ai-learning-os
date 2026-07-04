import Link from "next/link";

const concepts = [
  ["Workspace", "项目或大分类。用它把不同主题的 Conversation、Knowledge 和 Tasks 放在各自的上下文中。"],
  ["Import", "把外部内容导入 Learning OS。目前支持 TXT 和剪贴板纯文本，并保留原始内容。"],
  ["Conversation", "一段对话或材料的工作区。这里可以查看原文、拆分 Messages、分析并追踪整理结果。"],
  ["Messages", "从原始内容拆分出的对话轮次，保留 User、Assistant、Unknown 等角色和原始顺序。"],
  ["Q&A Pair", "由一问一答组成的整理单元，从 Messages 自动派生，帮助按问题阅读和选择内容。"],
  ["Proposal / 整理建议", "AI 生成的候选总结。它只是待审核建议，不会自动进入 Knowledge。"],
  ["Review", "人工审核整理建议。只有你接受 Proposal 后，系统才会创建 Knowledge。"],
  ["Knowledge", "经过人工确认、适合长期保留的知识，可继续编辑、归档、搜索和追溯来源。"],
  ["Tags", "知识标签，用于给 Knowledge 分类和筛选。"],
  ["Tasks / Today", "Tasks 是可选行动项；Today 汇总今天、逾期和近期事项，但它们不是 Import → Analyze → Review → Knowledge 主流程的必需步骤。"],
  ["Ollama Provider", "运行在本机的 AI，只在 Analyze / 生成整理建议时使用。它不是导入来源，也不会替你导入聊天记录。"],
] as const;

const flow = [
  "Workspace",
  "Import",
  "Conversation",
  "Generate Messages",
  "Q&A Pair",
  "Analyze",
  "Review",
  "Knowledge",
] as const;

export default function HelpPage() {
  return (
    <main className="page-shell pb-16">
      <p className="eyebrow">Product Help</p>
      <h1 className="page-title">操作手册</h1>
      <p className="page-description max-w-3xl">
        Learning OS 把外部对话或材料变成可审核、可追溯的长期知识。第一次使用时，按下面的推荐流程走一遍即可。
      </p>

      <section className="mt-10 rounded-2xl border border-sky-200 bg-sky-50 p-6">
        <p className="text-sm font-semibold text-sky-950">推荐流程</p>
        <ol className="mt-4 flex flex-wrap items-center gap-2 text-sm text-sky-950">
          {flow.map((step, index) => (
            <li className="flex items-center gap-2" key={step}>
              <span className="rounded-full bg-white px-3 py-1.5 font-medium shadow-sm">
                {index + 1}. {step}
              </span>
              {index < flow.length - 1 ? <span aria-hidden="true">→</span> : null}
            </li>
          ))}
        </ol>
        <p className="mt-4 text-sm leading-6 text-sky-900">
          先选择 Workspace 并导入内容，在 Conversation 生成 Messages；用 Q&amp;A Pair 阅读和选择范围，再 Analyze 生成整理建议，经 Review 确认后进入 Knowledge。
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link className="rounded-lg bg-sky-950 px-4 py-2.5 text-sm font-medium text-white" href="/import">
            开始 Import
          </Link>
          <Link className="rounded-lg border border-sky-300 bg-white px-4 py-2.5 text-sm font-medium text-sky-950" href="/settings">
            设置 Ollama
          </Link>
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-semibold text-zinc-950">核心概念</h2>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          {concepts.map(([title, description]) => (
            <article className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm" key={title}>
              <h3 className="font-semibold text-zinc-950">{title}</h3>
              <p className="mt-2 text-sm leading-6 text-zinc-600">{description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-10 rounded-xl border border-amber-200 bg-amber-50 p-5">
        <h2 className="font-semibold text-amber-950">Ollama 使用边界</h2>
        <p className="mt-2 text-sm leading-6 text-amber-900">
          Ollama Provider 是 Analyze 阶段使用的本地模型。你仍需先通过 Import 保存原文并生成 Messages；Ollama 不连接 ChatGPT、Claude 或其它平台，也不是 Import 来源。
        </p>
      </section>

      <section className="mt-10 rounded-xl border border-emerald-200 bg-emerald-50 p-5">
        <h2 className="font-semibold text-emerald-950">数据保存与备份</h2>
        <div className="mt-2 space-y-2 text-sm leading-6 text-emerald-900">
          <p>结构化数据主要保存在当前浏览器 LocalStorage；清除站点数据会删除这些记录。</p>
          <p>Asset 目前只记录文件名、路径和备注等 metadata，不复制或读取本机文件。</p>
          <p>在项目目录运行 <code className="font-semibold">node scripts/backup-local-data.mjs</code> 可备份文档及存在时的项目内 data/。</p>
          <p>该脚本目前不导出浏览器 LocalStorage；完整数据导入/导出仍是后续能力。</p>
        </div>
        <Link className="mt-4 inline-block text-sm font-semibold text-emerald-950 underline" href="/settings">
          查看 Data Management
        </Link>
      </section>
    </main>
  );
}
