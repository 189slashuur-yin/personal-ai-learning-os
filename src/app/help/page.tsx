import Link from "next/link";

const concepts = [
  ["Workspace / Folder", "多层组织树。Conversation 只归属一个节点；删除 Folder 不会删除 Conversation。"],
  ["Import", "支持 TXT、粘贴文本，以及 ChatGPT 官方 Export zip 解压后的 conversations.json 最小导入。不会自动解析完整 zip。"],
  ["Conversation", "一个可长期追加的长对话线程。可以在 Workspace Mode 中按 Round 持续整理。"],
  ["Round", "一轮问答，也是备注、总结、建议、知识与附件的最小整理单位。"],
  ["Messages", "从原始内容拆分出的对话轮次，保留 User、Assistant、Unknown 等角色和原始顺序。"],
  ["Q&A Pair", "由一问一答组成的整理单元，从 Messages 自动派生，帮助按问题阅读和选择内容。"],
  ["Proposal / AI 整理建议", "AI 生成的草稿。它可保留、拒绝或确认，但不会自动写入知识库。"],
  ["Review / 确认加入知识库", "人工确认整理建议。只有你接受 Proposal 后，系统才会创建 Knowledge。"],
  ["Knowledge / 已确认知识", "由你确认、适合长期保留的知识，可继续编辑、归档、搜索和追溯来源。"],
  ["Tags", "知识标签，用于给 Knowledge 分类和筛选。"],
  ["Tasks / Today", "Tasks 是可选行动项；Today 汇总今天、逾期和近期事项，但它们不是 Import → Analyze → Review → Knowledge 主流程的必需步骤。"],
  ["Ollama Provider", "运行在本机的 AI，只在 Analyze / 生成整理建议时使用。它不是导入来源，也不会替你导入聊天记录。"],
  ["Provider 额度", "ChatGPT Plus 订阅额度不等于 OpenAI API 额度。本版本不会调用 OpenAI 或 Claude 真实 API。"],
  ["Asset / 附件", "当前只记录文件名、路径和说明，不读取或删除真实文件。文件移动后需要 Relink；未来可接本地脚本复制到 data/assets。"],
  ["Recipe", "本地工作流模板，用来记录步骤；它不是 Agent，本版本不会自动执行或调用 Ollama 跑流程。"],
  ["ChatGPT Export", "当前只支持 conversations.json 中的 User / Assistant 文本。附件、图片、tool call、canvas、voice、shared link 会跳过或不处理；重复导入按 external message id，缺失时按 content hash 增量去重。"],
  ["Import 2.0", "导入入口明确分为三类：粘贴并导入对话、导入 ChatGPT Export、手动整理轮次。支持 User/Assistant、用户/AI、我/GPT、问/答四种 role alias；Manual Round Builder 入口更明显。shared link 与浏览器插件为未来预留。"],
  ["Conversation Navigator", "左侧可折叠导航面板，展示所有 Round 的序号、标题、Summary/Proposal/Knowledge 状态。折叠后仅显示 Round 序号圆点，点击可滚动到对应 Round。"],
  ["Message Timeline 三态", "底层 Message Timeline 支持 Collapsed / Preview / Full 三种模式。默认 Collapsed 避免长对话直接丢入巨大列表；Preview 显示前 5 条并提供展开全部；Full 保留完整搜索、编辑与选择功能。"],
  ["Round Inspector", "选择 Round 后右侧显示 Inspector 面板，可直接编辑 Round Note 与 Summary，查看关联 Proposal、Knowledge、Assets，执行 Analyze，以及上下 Round 快速切换。"],
  ["Error / Feedback", "Analyze 运行状态显示 provider、startedAt 与 running/failed/timeout；失败提供 Retry、Switch to Demo、Increase Timeout。Feedback 页面支持从任意页面一键跳转并自动捕获页面路径。"],
  ["Data Health", "本地只读健康报告，覆盖 orphan proposal/knowledge/asset/round、missing sourceRoundId、duplicate import risk 与 invalid workspace。不自动修改数据。"],
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
      <section className="mt-6 rounded-xl border border-sky-200 bg-sky-50 p-5"><h2 className="font-semibold text-sky-950">Context Help</h2><p className="mt-2 text-sm text-sky-800">每个主页面右上角的“?”回到这里。先在 Import 导入，在 Conversation 按 Round 整理，再确认 AI 整理建议进入 Knowledge。常见误区：Proposal 不是已确认知识；Recipe 不是 Agent；附件路径不代表文件已复制。</p></section>

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

      <section className="mt-10 rounded-xl border border-emerald-200 bg-emerald-50 p-5">
        <h2 className="font-semibold text-emerald-950">v1.1 新功能</h2>
        <div className="mt-2 space-y-2 text-sm leading-6 text-emerald-900">
          <p><strong>Conversation Navigator：</strong>左侧可折叠的 Round 导航面板，支持搜索与快速跳转。</p>
          <p><strong>Message Timeline 三态：</strong>Collapsed（默认折叠）、Preview（显示前 5 条）、Full（完整功能），避免长对话直接展示全部消息。</p>
          <p><strong>Round Inspector：</strong>选择 Round 后右侧出现编辑面板，可直接编辑 Note/Summary，查看关联内容，上下切换 Round。</p>
          <p><strong>Import 2.0：</strong>入口文案更直观，ChatGPT Export 独立突出，Manual Round Builder 更明显，role alias 文档清晰。</p>
          <p><strong>Search UX：</strong>Round 结果可跳转到对应 Round；Conversation / Knowledge / Round / Proposal 默认优先。</p>
          <p><strong>Error / Feedback：</strong>Analyze 状态显示 provider/startedAt/status，失败可 Retry/Switch/Increase Timeout；Feedback 一键记录并自动带当前页面。</p>
          <p><strong>Data Health：</strong>增加 duplicate import risk、orphan round；详细说明 missing sourceRoundId。</p>
          <p className="mt-3 text-xs">已知限制：不实现语义搜索、不引入新搜索库、不做三栏复杂布局、不实现 shared link 抓取或浏览器插件。</p>
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
