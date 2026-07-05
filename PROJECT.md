# Project

## 产品目标

Personal AI Learning OS 面向希望长期整理 AI 对话与学习材料的个人用户。产品要解决的不是“再做一个聊天客户端”，而是把分散的原始内容变成可审核、可追溯、可维护的个人知识。

核心原则：

- **Local first**：MVP 数据默认留在当前浏览器。
- **Source first**：保留原始 Source 或 Message 引用，知识能够回到证据。
- **Human in the loop**：分析结果先成为 Proposal，用户审核后才能沉淀为 KnowledgeCard。
- **Replaceable boundaries**：存储和分析能力通过 Contract 隔离，为以后替换实现保留空间。
- **Small, complete increments**：按 Sprint 完成端到端闭环，不为未确认需求提前扩张架构。

## 当前阶段

截至 2026-07-05，运行时版本仍为 v0.9 draft — Data Foundation & Search。项目已在既有知识主链路上增加九类运行时 SearchDocument、具体 Message / Q&A / Proposal / Knowledge 片段定位、轻量 subsequence fuzzy、Conversation Note、Asset metadata foundation、手动备份脚本与 Data Management 说明。v1.0 Phase0 已形成 Architecture Freeze candidate，但尚未获得人工批准，也未改变运行时。

- Current Version：v0.9 draft
- Current Focus：v1.0 Phase0 Architecture Freeze candidate；v0.9 manual QA pending
- Next Recommended Phase：人工批准 Phase0；批准前不实现 Round、不执行迁移

v1.0 planning 必须以 v0.9 人工 QA 结果为输入；当前候选 Backlog 不构成实现授权。

## v1.0 Phase0 domain freeze candidate

- Conversation 是一个逻辑对话线程，不代表 Import、主题或项目。
- Workspace 表达项目/主题归属；一次 Import 可创建一个或多个 Conversation。
- Conversation 保持 Aggregate Root；Round 是带稳定 ID 的子实体，拥有 Message 分组语义。
- Question / Answer 是 Round Messages 的投影，不单独持久化。
- Proposal、Knowledge、Task 是独立 Aggregate；通过来源引用和快照关联 Conversation/Round/Message。
- Review 是显式人工 ReviewDecision；accepted Proposal 仍需幂等 apply 才能创建/更新 Knowledge。
- Search 是只读投影；默认结果为 Conversation、Knowledge、Round、Proposal、Task、Asset、Raw Message。
- Import Parser 必须纯函数化、版本化，先 preview/diagnostics，再由用户确认写入。
- v1.0 不新增 Session；Round、Conversation、Workspace、ImportReceipt 已覆盖其候选语义。

冻结包见 [Architecture Review](./docs/reviews/Architecture-Review-v1.0-Phase0.md) 与 [Architecture Freeze Report](./docs/reviews/Architecture-Freeze-v1.0-Phase0.md)。上述内容只有在人工整体批准后才成为 v1.x Domain 基线；批准前不得实施。

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

MVP 的部署假设是单人、单浏览器、单设备、小数据量。LocalStorage 集合与实体 ID 是当前事实来源。

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
