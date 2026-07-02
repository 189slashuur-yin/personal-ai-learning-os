# Sprint8 Handoff

## 当前状态

截至 2026-07-02，Sprint8A、Sprint8B、Sprint8C 已完成。没有接入真实 API、网络请求、API Key 或数据库，没有修改 Demo Provider 的确定性分析行为，也没有创建 Git commit。

Demo Provider 仍是唯一可运行的 Analyzer。配置中的 enabled 只是本地配置状态，不会把其它 Provider 注册为 Analyzer。

## Part1 — Sprint8A Provider Configuration

- 新增 `ProviderConfiguration` Entity、Storage Contract、BrowserStorage 与 Service。
- 内置 Demo、OpenAI、Claude、Gemini、Ollama、DeepSeek、Azure OpenAI 七个默认配置。
- Settings 展示只读 baseUrl、model、timeout 与支持标记；仅 enabled 可切换并持久化。
- 已完成 checkpoint：lint、build、diff-check 通过。

## Part2 — Sprint8B Connection Test

- `ProviderService.testConnection()` 全程离线执行。
- Demo 返回 Success；其它 Provider 返回 Not Implemented。
- 保存 lastTestTime 与 lastTestStatus；状态模型包含 Never Tested、Success、Failed、Not Implemented。
- Settings 增加 Test Connection；Dashboard 增加 Current Provider 与 Last Test。
- 已完成 checkpoint：lint、build、diff-check 通过。

## Part3 — Sprint8C Capability System

- 新增 chat、vision、tool_call、reasoning、json_output、stream、embedding、long_context 能力枚举。
- Demo 固定能力为 chat、json_output、reasoning；其它 Provider 使用默认能力。
- Settings、Analysis、Conversation、Proposal Workspace 与 Review 展示 Capability Badge。
- Demo Proposal 保存生成时 Capability；KnowledgeCard 保存 Provider Capability Snapshot。
- 旧 Proposal / KnowledgeCard 缺少能力时显示 unknown / legacy，不清空或强制回写旧数据。

## 新增文件

- `src/app/capability-badges.tsx`
- `src/core/entities/provider-configuration.ts`
- `src/core/entities/provider-capability.ts`
- `src/core/contracts/provider-configuration-storage.ts`
- `src/core/services/provider-configuration-service.ts`
- `src/infrastructure/storage/browser-provider-configuration-storage.ts`

## 修改文件

- Provider：`src/core/services/provider-service.ts`、`src/core/services/demo-provider.ts`
- 快照：`src/core/entities/proposal.ts`、`src/core/entities/knowledge-card.ts`、`src/core/services/knowledge-card-creation.ts`
- UI：Settings、Dashboard、Analysis、Conversation Detail、Proposal Workspace、Review、Knowledge Detail
- 文档：README、PROJECT、ARCHITECTURE、ROADMAP、CHANGELOG、HANDOFF

## 手动验收

1. 打开 `/settings`，确认显示七个 Provider Configuration；除 enabled 外没有可编辑字段。
2. 切换任一 enabled，刷新页面，确认状态保留且当前 Analyzer 仍为 Demo。
3. 对 Demo 点击 Test Connection，确认显示 Success；对其它 Provider 测试，确认显示 Not Implemented，且没有网络请求。
4. 打开 `/`，确认 Current Provider 为 Demo Provider，Last Test 与 Settings 一致。
5. 在 `/analysis` 生成 Proposal，确认生成前显示 Demo 的三个 Capability Badge。
6. 在 Conversation 从 Source 或 Messages 生成 Proposal，确认 Conversation 与 Proposal Workspace 显示 Capability。
7. 在 Review 确认 Generated using Capability；接受后进入 Knowledge Detail，确认保存 Provider Capability Snapshot。
8. 打开旧 Proposal / KnowledgeCard，确认缺少快照时显示 unknown / legacy，旧数据仍可使用。

## 已知限制

- 非 Demo Provider 只有默认配置和能力元数据，没有客户端、鉴权、网络测试或 Analyzer 实现。
- Failed 状态已建模，但当前离线确定性测试没有触发 Failed 的分支。
- 默认 baseUrl 与 model 仅供只读展示，不代表当前可用性或生产推荐。
- LocalStorage 仍是单浏览器存储，不具备事务、同步或正式备份恢复。
- 没有自动化测试套件；本轮验收边界为每 Part 的 lint、production build、diff-check 与手动流程。

## 下一步建议

1. Sprint9 开始前单独确认范围，不把真实 Provider 接入视为默认下一步。
2. 优先补充 Provider Configuration / Connection Test / Capability Snapshot 的自动化测试。
3. 若未来批准真实 Provider，先完成密钥、安全、隐私、费用、错误处理和验收方案，再新增独立 AnalyzerProvider 实现。

## 质量检查

Sprint8A、Sprint8B、Sprint8C 的 `npm run lint`、`npm run build`、`git diff --check` 均通过；最终 production build 成功生成 12 个页面。
