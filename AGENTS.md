# AGENTS.md

本文件适用于整个仓库，供未来 AI 和自动化协作者执行任务时遵守。

## 首要规则

1. **不要直接操作 LocalStorage。** Page、Component 和 Service 不得调用 `window.localStorage`、复制 storage key 或自行 JSON 解析。所有浏览器持久化必须通过 `src/infrastructure/storage` 中的 BrowserStorage，并由 `src/core/contracts` 描述能力。
2. **不要跳过质量检查。** 完成任何改动后必须运行 `npm run lint`、`npm run build` 和 `git diff --check`。失败时先修复或明确交接，不能把未验证状态描述为完成。
3. **不要提前接真实 AI。** 当前只启用 Demo Provider。没有明确任务以及密钥、安全、隐私、费用、错误处理和验收方案时，不得实现或启用 OpenAI、Claude、Ollama、Custom Provider，也不得加入 API Key。
4. **不要大规模重构。** 只修改当前任务所需范围。不要顺手迁移框架、替换状态管理、引入数据库、重写目录或完整 DDD 化。

## 分层约束

- Entity：只定义领域数据与状态，不依赖 UI、浏览器或 Infrastructure。
- Contract：描述 Core 所需能力，不暴露 LocalStorage 细节。
- BrowserStorage：集中处理 key、序列化、默认值和旧数据兼容。
- Service：处理转换、跨实体规则和用例编排；优先依赖 Contract。
- Page：负责路由和交互，组合 Service/BrowserStorage，不复制业务规则。

新增 Analyzer 必须实现 `AnalyzerProvider`，返回带来源与生成元数据的 Proposal。任何 Analyzer 都不得直接创建 KnowledgeCard 或自动接受 Proposal。

## 数据安全与兼容

- 假定用户浏览器中已有 Sprint1–Sprint6 数据；新增字段必须安全处理缺失值。
- 修改 LocalStorage 结构前先定义迁移或归一化策略，不得静默清空数据。
- Conversation 的复制和级联删除必须使用现有 Workspace Service，并维护 Source、Message、Proposal、KnowledgeCard 引用。
- 破坏性操作需要明确用户确认和影响说明。
- 不提交密钥、令牌、真实聊天记录或个人隐私数据。

## 工作方式

- 开始前阅读 `PROJECT.md`、`ARCHITECTURE.md`、`ROADMAP.md` 和 `HANDOFF.md`。
- 检查 `git status`，保留用户已有改动，不覆盖无关文件。
- 先确认 Sprint 范围和验收标准；`ROADMAP.md` 中 Sprint7–9 的建议不是已批准需求。
- 优先做最小、完整、可验证的改动，并同步必要文档。
- 除非用户明确要求，不创建 commit、不推送、不修改业务范围外的文件。

## 完成定义

任务只有在以下条件满足后才可标记完成：

- 请求的行为或文档已经实现。
- 没有超出任务范围的改动。
- `npm run lint` 通过。
- `npm run build` 通过。
- `git diff --check` 通过。
- Handoff 记录了结果、关键文件、限制和下一步。
