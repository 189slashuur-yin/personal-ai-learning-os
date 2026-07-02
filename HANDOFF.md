# Handoff

## 当前状态

截至 2026-07-02，Sprint1–Sprint6 已完成，当前分支为 `main`，业务实现最新提交为 `56cf44e`（`feat: improve analyzer provider metadata`）。本轮仅更新项目文档，没有修改 `src` 业务代码，也没有创建 Git commit。

产品当前可在单个浏览器中完成：Import/Conversation → Source/Message → Proposal → Review → KnowledgeCard → Tag。Dashboard、全局搜索、Provider Settings 和来源质量元数据已经存在。

唯一启用的 Analyzer 是 Demo Provider，它使用确定性的本地逻辑且不访问外部 API。OpenAI、Claude、Ollama 和 Custom Provider 只是 `Coming Soon` 占位。

## Sprint 进度

- Sprint1：完成 — Import → Proposal → Review → KnowledgeCard。
- Sprint2：完成 — Conversation Workspace。
- Sprint3：完成 — Search / Dashboard / Project Engineering。
- Sprint4：完成 — Message Engine / selected Messages → Proposal / Proposal Workspace。
- Sprint5：完成 — Tag System / Knowledge Quality。
- Sprint6：完成 — AI Provider Interface / Settings / Analyzer Metadata。
- Sprint7–Sprint9：未开始，范围尚未确认；`ROADMAP.md` 中仅记录建议方向。

## 重要文件

产品与协作：

- `README.md`：面向使用者的项目说明、功能与运行方式。
- `PROJECT.md`：目标、阶段、MVP 和非目标。
- `ARCHITECTURE.md`：Entity / Contract / BrowserStorage / Service / Page 分层。
- `ROADMAP.md`：Sprint1–9 状态。
- `CHANGELOG.md`：已完成 Sprint 与关键提交。
- `AGENTS.md`：未来 AI 必须遵守的操作约束。

实现入口：

- `src/core/entities`：Conversation、ImportedSource、Message、Proposal、KnowledgeCard、Tag、AIProvider。
- `src/core/contracts`：Storage 与 Analyzer Provider 契约。
- `src/core/services`：Message Parser、Provider、Review、Knowledge、Tag、Search、Workspace 编排。
- `src/infrastructure/storage`：唯一允许封装 LocalStorage key 与序列化的目录。
- `src/app/conversation/[id]/conversation-detail.tsx`：Source、Message、Proposal 的主要工作区。
- `src/app/conversation/[id]/proposal-workspace.tsx`：多 Proposal 展示与追溯。
- `src/app/knowledge/[id]/knowledge-detail.tsx`：Knowledge 编辑、Tag 和来源质量。
- `src/app/settings/provider-settings.tsx`：Provider 选择界面。

## 架构与数据注意事项

- Page 不得直接读写 LocalStorage；必须使用 `Browser*Storage`。
- Core 不应依赖 React、Next.js、`window` 或具体 Storage Adapter。
- `current-source` 和 `current-proposal` 是旧单流程兼容指针，不是唯一事实来源。
- 部分旧实体缺少 `conversationId`、Provider 或分析元数据；新增逻辑必须兼容。
- Conversation 复制/删除涉及多个实体，必须继续通过 `conversation-workspace` Service 保持引用一致。
- 删除 Proposal 不删除已生成的 KnowledgeCard；删除 Tag 只解除关联。
- Analyzer 只能输出 Proposal；KnowledgeCard 必须经过人工 Review。

## 不要做

- 不要在 Page/Component 里直接调用 `window.localStorage`。
- 不要跳过 `npm run lint`、`npm run build` 或 `git diff --check`。
- 不要在没有明确任务、安全方案和验收标准时接入真实 AI Provider。
- 不要顺手进行大规模重构、替换架构或引入数据库。
- 不要破坏旧 LocalStorage 数据兼容，也不要把密钥或个人数据写进仓库。

## 下一步建议

先让产品负责人确认 Sprint7 的范围。当前最稳妥的候选方向是存储版本与可验证的导出/导入、备份恢复，因为清除站点数据会丢失全部内容；但这只是建议，不是已经批准的需求。

若选择该方向，建议先定义：导出格式版本、旧数据归一化、冲突策略、损坏文件错误提示和恢复验收用例。不要借此直接替换 LocalStorage 或重构所有 Storage Contract。

如果下一任务是接真实 AI，先暂停实现并确认 Provider 安全边界、密钥存储、网络错误、重试、费用、隐私与日志策略。继续要求所有输出先进入 Proposal Review。

## 交付检查

本次文档更新已在 2026-07-02 完成以下验证：

- `npm run lint`：通过。
- `npm run build`：通过；Next.js 16.2.9 production build 成功生成 12 个页面。
- `git diff --check`：通过。
- `git status --short`：仅包含本任务指定的 7 份文档，没有修改 `src`。

后续每次业务或文档变更完成后仍需执行：

```bash
npm run lint
npm run build
git diff --check
```

同时确认 `git diff --name-only` 只包含任务允许修改的文件，并在 handoff 中记录验证结果与未解决问题。
