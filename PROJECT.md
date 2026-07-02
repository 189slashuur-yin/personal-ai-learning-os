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

截至 2026-07-02，Sprint1–Sprint6 已完成。项目已经从单次 TXT 导入流程演进为可在浏览器中运行的个人知识工作区，包含 Conversation、Message、Proposal、KnowledgeCard、Tag 和 AIProvider 领域模型。

当前重点是验证产品工作流和边界，而不是接入生产基础设施。Demo Provider 是唯一启用的 Analyzer Provider；它不访问网络。真实 Provider、数据库和多用户能力均未实现。

## 当前 MVP 边界

MVP 包含：

- TXT 与手动 Conversation 内容的本地保存。
- Conversation 工作区及其复制、删除、重命名和自动保存。
- Source 到 Message 的本地规则解析。
- 从完整 Source 或选中 Messages 生成 Proposal。
- Proposal 的来源证据、状态、Provider 与生成元数据。
- 人工 Review，以及 Accepted Proposal 到 KnowledgeCard 的转换。
- KnowledgeCard 的编辑、归档、删除、搜索、Tag 管理与来源质量提示。
- Dashboard、本地统计和跨实体搜索。
- Storage Contract、BrowserStorage Adapter、AnalyzerProvider Contract 与 Provider Registry。
- 仅 Demo Provider 可运行；其它 Provider 仅为设置页占位。

MVP 的部署假设是单人、单浏览器、单设备、小数据量。LocalStorage 集合与实体 ID 是当前事实来源。

## 非目标

当前阶段明确不做：

- 直接接入 OpenAI、Claude、Ollama 或自定义模型 API。
- API Key 收集、密钥托管、用量计费或模型路由。
- 服务端数据库、登录、账号体系、云同步和多人协作。
- 自动接受 Proposal，或让分析器绕过 Review 直接写 KnowledgeCard。
- 大规模全文检索、向量数据库、RAG 或知识图谱。
- 移动原生应用、浏览器扩展和第三方插件市场。
- 为假设中的未来需求进行大规模重构或完整 DDD 化。
- 承诺 LocalStorage 是长期生产存储方案。

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

Sprint 状态与建议方向见 [ROADMAP.md](./ROADMAP.md)。
