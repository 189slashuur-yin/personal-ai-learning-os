# Project

## 产品目标

PALOS 面向需要与 AI 长期协作的个人用户。产品要解决的不是“再做一个聊天客户端”，而是同时保留对话原始过程、维护当前有效上下文，并把真正长期稳定的信息沉淀为可追溯 Knowledge。

核心原则：

- **Local first**：业务数据默认留在当前浏览器 IndexedDB；LocalStorage 仅保留轻量配置、UI 偏好和旧数据迁移兼容。
- **Source first**：保留原始 Source 或 Message 引用，知识能够回到证据。
- **Human in the loop**：分析结果先成为 Proposal，用户审核后才能沉淀为 KnowledgeCard。
- **Replaceable boundaries**：存储和分析能力通过 Contract 隔离，为以后替换实现保留空间。
- **Small, complete increments**：按 Sprint 完成端到端闭环，不为未确认需求提前扩张架构。
- **Useful without AI**：关闭 Analyzer / Provider 后，Import、Context、Decision、Task、Search 与 Export 仍然可用。

## 当前阶段

截至 2026-08-03，v1.8.2 authoritative mutation hardening maintenance release 已完成。Source autosave、Message edit/regenerate、普通 import/export append、Merge、Duplicate 与 Conversation Version Restore 现在都在实际 IndexedDB write transaction 内读取 authoritative Snapshot ownership 后才写入。该路径不修改 Snapshot/IndexedDB schema，不新增 canonical store、journal、UI 或产品功能。

- Current Version：v1.8.2 authoritative mutation hardening maintenance release
- Release Metadata：release commit `ced161a`；tag `v1.8.2`
- Current Focus：maintenance release closed；P0/P1/P2 complete
- Automated Status：Vitest 377/377；Playwright 3/3；lint/build passed
- Next Recommended Phase：已接受风险维持现状；Snapshot lifecycle、read UX、Search hardening 与其它 backlog 仍需另行批准

v1.7 继续把 Conversation 作为 Aggregate Root、Round 作为最小整理单元、Task 作为独立行动实体、Knowledge 作为长期稳定信息。Context 是当前有效状态，不等于所有聊天，也不自动升级为 Knowledge。

v1.7 Final Usability Correction 不扩展领域：每个 Round 卡片内直接显示“我的备注 / 本轮结论 / 下一步”。我的备注、下一步、目标、决定、遗留问题使用同一个版本化 serializer/parser 写入 `Round.note`，本轮结论继续写 `Round.summary`；纯文本、旧分段、`【补充备注】` 和未知旧文本均兼容且编辑单字段不会静默删除其它内容。

每个 Round 拥有独立、revision-aware 的 750ms autosave controller；写入串行，blur、折叠/切换和卸载主动 flush，IndexedDB transaction 完成后才显示“已保存”，失败保留最新 draft 供 retry。动态态显示“当前推荐参考”，不写当前 Round；用户主动确认后显示“已固定参考”，固定 snapshot 与 Round 自有记录都不会被来源后续变化覆盖。Knowledge 只在人工预览确认后创建，同一来源与规范化内容的重复确认不重复建卡。

## v1.0 Phase2 product language

- Conversation = 可长期追加的长对话线程。
- Round = 一轮问答，也是最小整理单位。
- Context = 用户人工维护的当前有效背景、状态、决策、约束与下一步方向。
- Context Snapshot = 某一 Round 人工确认后当时有效的上下文；可继承、覆盖或排除。
- Proposal = AI 整理建议 / 草稿；必须人工确认。
- Knowledge = 已确认知识，可从同一 Round 持续沉淀多条。
- Workspace / Folder = Conversation 的多层组织树；删除节点不删除 Conversation。
- Recipe = 本地手动工作流模板，不是 Agent，不自动执行。
- Task / Today = 可选行动项，不是 Second Brain 主流程。
- ChatGPT Export Import = 仅处理 zip 解压后的 `conversations.json` 最小文本；不处理其中的附件、图片、tool call、canvas、voice 或 shared link reference。
- ChatGPT Conversation Snapshot = 用户必须上传本地 saved HTML 或粘贴完整 rendered transcript；可选提供严格的 ChatGPT share/conversation URL 作为来源 identity。New 无 URL 时生成 PALOS local resourceHash，Existing 无 URL时使用所选 Conversation 的有效 Snapshot history。PALOS 不请求 URL、不读取 cookie/session，preview 后显式确认才写 immutable Snapshot history。
- 重复 ChatGPT 导入复用已有 Conversation，只追加新 Message；旧 Rounds 不自动覆盖。

v1.7 的信息边界：Conversation 保存“讨论过什么”，Context 表达“现在什么仍然有效”，Knowledge 只保存“值得长期复用且已人工确认的稳定信息”。短期价格讨论、临时尝试和未确认判断不会仅因出现在 Context 或 Conversation 中自动成为 Knowledge。

## v1.0 Phase1 implementation baseline

- Conversation 是一个逻辑对话线程，不代表 Import、主题或项目。
- Workspace 表达项目/主题归属；一次 Import 可创建一个或多个 Conversation。
- Conversation 保持 Aggregate Root；Round 是带稳定 ID 的子实体，拥有 Message 分组语义。
- Question / Answer 是 Round Messages 的投影，不单独持久化。
- Proposal、Knowledge、Task 是独立 Aggregate；通过来源引用和快照关联 Conversation/Round/Message。
- Review 是显式人工 ReviewDecision；accepted Proposal 仍需幂等 apply 才能创建/更新 Knowledge。
- Search 是只读投影；默认结果为 Conversation、Knowledge、Round、Proposal、Task、Asset、Raw Message。
- Import Parser 必须纯函数化、版本化，先 preview/diagnostics，再由用户确认写入。
- v1.0 不新增 Session；Round、Conversation、Workspace、ImportReceipt 已覆盖其候选语义。

冻结包见 [Architecture Review](./docs/reviews/Architecture-Review-v1.0-Phase0.md) 与 [Architecture Freeze Report](./docs/reviews/Architecture-Freeze-v1.0-Phase0.md)。Phase1 实现与冻结模型之间的兼容字段差异、迁移限制和人工验收范围记录在 [Migration Report](./docs/migrations/Message-to-Round-v1.0-Phase1.md)。

当前重点是建立可长期积累、可搜索、可手动备份的数据基础，而不是接入生产基础设施。Demo Provider 默认启用且不访问网络；Ollama 默认关闭，只在用户配置、启用并选择后访问本地 HTTP 服务。云 Provider、数据库、RAG 和多用户能力均未实现。

Epic D 已在 Knowledge 旁实现独立 Task Domain，解决“接下来做什么”，而不把行动状态塞进 KnowledgeCard。v0.7 覆盖 Today、来源关联与 Task Search；Activity 仍为 planned / not immediate，Agent、Calendar、Reminder、Recurring Task、RAG、数据库与 AI Suggest Task 不在范围。设计基线见 [Epic D Design](./docs/design/Epic-D-Design.md)。

## 当前 MVP 边界

MVP 包含：

- TXT 与手动 Conversation 内容的本地保存。
- Clipboard 纯文本的 Import Profile、智能标题、解析预览与导入结果摘要。
- Conversation 工作区及其复制、删除、重命名和自动保存。
- Source 到 Message 的本地规则解析。
- 从完整 Source 或选中 Messages 生成 Proposal。
- Proposal 的来源证据、状态、Provider 与生成元数据。
- 人工 Review，以及 Accepted Proposal 到 KnowledgeCard 的转换。
- KnowledgeCard 的编辑、归档、删除、搜索、Tag 管理与来源质量提示。
- Dashboard、本地统计，以及跨 Conversation、Proposal、Knowledge、Tag、Workspace、Task 的关键词与结构化过滤搜索。
- 独立 Task Domain、Today / Tasks UI、来源快照与 Task Search。
- Storage Contract、BrowserStorage Adapter、AnalyzerProvider Contract 与 Provider Registry。
- Demo Provider 与用户显式启用的本地 Ollama 可运行；其它 Provider 仅为设置页占位。
- 默认 Source / Messages Prompt Template、Analyzer 结构化输出校验与运行记录。
- Analyzer 失败隔离、可恢复错误重试和 Demo 模拟失败入口。
- 七个 Provider 的默认配置与 enabled 持久化；仅 Ollama 的 baseUrl、model、timeout 可编辑。
- Connection Test：Demo 为 Success，Ollama 请求本地服务，其余为 Not Implemented。
- Capability 展示与 Proposal / KnowledgeCard 生成能力快照。

MVP 的部署假设是单人、单浏览器、单设备。IndexedDB 中的业务集合与实体 ID 是当前事实来源；LocalStorage 只作为 legacy migration source、轻量配置和调试回退。

## 非目标

当前阶段明确不做：

- 直接接入 OpenAI、Claude 或自定义云模型 API。
- API Key 收集、密钥托管、用量计费或模型路由。
- 服务端数据库、登录、账号体系、云同步和多人协作。
- 自动接受 Proposal，或让分析器绕过 Review 直接写 KnowledgeCard。
- 向量数据库、Embedding、RAG、语义问答或知识图谱。
- 移动原生应用、浏览器扩展和第三方插件市场。
- 为假设中的未来需求进行大规模重构或完整 DDD 化。
- 承诺 LocalStorage 是长期生产存储方案。
- Ollama streaming、embedding、tool calling 或 RAG。
- Epic D 第一阶段之外的 Calendar、Reminder、Recurring Task、Pomodoro、Habit、Workflow、Activity、Memory 或 Agent。

## 成功标准

在当前阶段，一条完整链路应满足：原始内容可保存；分析结果有来源；用户可审核；接受后生成唯一、可编辑、可追溯的知识卡；刷新页面后数据仍存在；lint 和 production build 通过。

## 产品约束

1. Page 不直接操作 LocalStorage，浏览器持久化只能通过 BrowserStorage。
2. 跨实体规则放入 Service，Storage 只处理持久化与兼容。
3. Core 不依赖 React、Next.js 或浏览器 API。
4. 新 AI 实现必须实现 `AnalyzerProvider`，输出 Proposal，并保留审核步骤。
5. 修改存储结构时必须考虑已有浏览器数据的归一化或迁移。
6. 删除、覆盖和级联操作必须由用户明确触发，并清楚说明影响。
7. 每个交付必须通过 `npm run lint`、`npm run build` 和 `git diff --check`。

Sprint 状态与建议方向见 [ROADMAP.md](./ROADMAP.md)；Epic D 的领域决策见 [RFC-003](./docs/rfc/RFC-003-task-domain.md)。
