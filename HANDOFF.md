# Handoff

## 当前状态

截至 2026-07-02，Sprint1–Sprint7 已完成。本轮完成 Sprint7A、Sprint7B、Sprint7C 连续开发，没有接入真实 AI、API Key 或数据库，没有创建 Git commit。

Demo Provider 仍是唯一启用的 Analyzer。所有 Analyzer 结果仍先成为 Proposal，必须经过人工 Review 才能创建 KnowledgeCard。

## Sprint7A — Analyzer Prompt Template

- 新增 `AnalyzerPromptTemplate` 与 `PromptTemplateStorage`。
- 新增 `BrowserPromptTemplateStorage` 与 `PromptTemplateService`。
- 提供 Source Analysis Template、Messages Analysis Template 两个默认模板。
- Settings 增加只读 Analyzer Templates 区域与 Reset Defaults。
- 不包含编辑器、多版本比较、真实 AI 或 API Key。

## Sprint7B — Structured Output Schema

- 新增 `AnalyzerOutputSchema`，包含 title、summary、evidence、confidence、suggestedAction、riskLevel。
- 新增手写 `validateAnalyzerOutput`，检查必填字段、confidence 范围与枚举值。
- Demo Provider 先构造和校验结构化输出，校验通过后才转换为 Proposal。
- Review 与 Conversation Proposal Workspace 展示三个新字段。
- 旧 Proposal 分别显示 confidence `unknown`、riskLevel `legacy`、suggestedAction `legacy`。
- 校验失败不会返回 Proposal，页面不会写 ProposalStorage。

## Sprint7C — Analyzer Error / Retry / Safety

- 新增 `AnalyzerError`、`AnalyzerRun`、`AnalyzerRunStorage` 与 `BrowserAnalyzerRunStorage`。
- `AnalyzerExecutionService` 集中执行 Provider / Template 安全检查，记录 running、success、failed。
- Analysis 和 Conversation Detail 显示最近运行状态及失败说明。
- 可恢复失败显示 Retry；重试使用原 sourceId 或 messageIds，不复制无关数据。
- Analysis 和 Conversation 提供 Demo 模拟可恢复失败入口，默认运行不失败。
- Conversation 级联删除会同步删除 AnalyzerRun；复制 Conversation 不复制运行历史。

## 新增文件

- `src/core/entities/analyzer-prompt-template.ts`
- `src/core/entities/analyzer-output-schema.ts`
- `src/core/entities/analyzer-error.ts`
- `src/core/entities/analyzer-run.ts`
- `src/core/contracts/prompt-template-storage.ts`
- `src/core/contracts/analyzer-run-storage.ts`
- `src/core/services/prompt-template-service.ts`
- `src/core/services/analyzer-output-validator.ts`
- `src/core/services/analyzer-execution.ts`
- `src/infrastructure/storage/browser-prompt-template-storage.ts`
- `src/infrastructure/storage/browser-analyzer-run-storage.ts`

## 主要修改文件

- `src/core/services/demo-provider.ts`
- `src/core/entities/proposal.ts`
- `src/app/settings/provider-settings.tsx`
- `src/app/analysis/analysis-result.tsx`
- `src/app/review/review-proposal.tsx`
- `src/app/conversation/[id]/conversation-detail.tsx`
- `src/app/conversation/[id]/proposal-workspace.tsx`
- `src/core/services/conversation-workspace.ts`
- `src/app/conversation/conversation-list.tsx`
- `README.md`、`PROJECT.md`、`ARCHITECTURE.md`、`ROADMAP.md`、`CHANGELOG.md`、`HANDOFF.md`

## 手动验收步骤

1. 打开 `/settings`，确认两个模板只读显示；点击 Reset Defaults 后提示成功。
2. 导入 TXT 并进入 `/analysis`，确认 AnalyzerRun 为 success，Proposal 正常生成。
3. 在 `/review` 确认 confidence、risk level、suggested action 可见。
4. 在 Conversation 中从 Source 和选中 Messages 各生成 Proposal，确认 Workspace 展示三个字段。
5. 点击“模拟可恢复失败”，确认状态为 failed、显示错误与 Retry，且 Proposal 数量不增加。
6. 点击 Retry，确认使用同一 Source 或 Messages 成功生成 Proposal。
7. 使用 Sprint1–6 旧 Proposal，确认三个字段显示 unknown / legacy / legacy。

## 已知限制

- Prompt Template 只读且固定为单版本，不提供编辑或版本比较。
- Demo Provider 同步执行；running 状态会持久化但通常很快变为 success 或 failed。
- Retry 不包含指数退避、队列、后台任务、Streaming 或真实 API 重试。
- LocalStorage 仍是单浏览器存储，不具备事务、同步或正式备份恢复。
- 没有自动化测试套件；本轮以 lint、production build、diff-check 和手动流程为验收边界。

## Commit 建议

建议拆分为 3 个 commit：Sprint7A templates、Sprint7B schema/validator、Sprint7C run/retry/safety；文档可随 Sprint7C 或单独提交。本轮按要求未创建 commit。

## 质量检查

每个 Part 均执行 `npm run lint`、`npm run build`、`git diff --check`。最终结果：三项全部通过；Next.js 16.2.9 production build 成功生成 12 个页面。
