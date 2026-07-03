# Architecture

## 架构概览

项目是一个 local-first 的模块化单体，采用五类清晰职责：Entity、Contract、BrowserStorage、Service、Page。

Epic B 的顶层领域关系为 `Workspace → Conversation → Source / Message / ConversationVersion → AnalyzerRun → Proposal → Review → KnowledgeCard → Tag / Search`。完整 Mermaid 图见 [docs/architecture/architecture-diagram.md](./docs/architecture/architecture-diagram.md)。

```text
Page ───────────────→ Service ───────────────→ Contract
 │                       │                        ↑
 │                       └────────→ Entity        │ implements
 │                                                │
 └── composition / simple CRUD ─────────→ BrowserStorage
                                          │
                                          └── LocalStorage
```

依赖方向的关键点是：Core 中的 Entity、Contract 和 Service 不依赖 Next.js、React 或 LocalStorage。BrowserStorage 位于 Infrastructure 并实现 Contract。Page 是组合入口，可以实例化 BrowserStorage 并调用 Service，但不能直接读写 `window.localStorage`。

```text
src/
├── core/
│   ├── entities/        # Entity
│   ├── contracts/       # Contract
│   └── services/        # Service
├── infrastructure/
│   └── storage/         # BrowserStorage
└── app/                 # Page、route 与 UI component
```

## Entity 层

位置：`src/core/entities`

Entity 定义产品语言、数据形状、状态和实体引用，不包含页面或持久化细节。

| Entity | 作用与主要关系 |
| --- | --- |
| `Workspace` | Conversation 的单层归属；Inbox 是默认 Workspace。 |
| `Conversation` | 工作区聚合入口；保存标题、来源类型和时间信息。 |
| `ImportProfile` | Clipboard 纯文本来源的名称、来源类型、说明与角色别名定义。 |
| `ImportedSource` | 原始文本；可通过 `conversationId` 归属 Conversation。 |
| `Message` | 从原始文本解析出的有序消息；通过 `conversationId` 归属 Conversation。 |
| `Proposal` | 待审核建议；可引用 Source、Conversation 和选中的 Message IDs，并保存 Provider 元数据。 |
| `KnowledgeCard` | 接受 Proposal 后的知识快照；保留 Proposal、Source、Conversation、Message、Provider 和 Tag 引用。 |
| `Tag` | 可复用标签；KnowledgeCard 通过 `tagIds` 关联。 |
| `AIProvider` | Analyzer Provider 的身份、类型和启用状态。 |
| `AnalyzerPromptTemplate` | Source / Messages 分析模板及版本元数据。 |
| `AnalyzerRun` | 一次 Analyzer 执行的来源、Provider、状态与错误记录。 |
| `ProviderConfiguration` | Provider 默认参数、配置启用状态、离线测试状态与能力集合。 |
| `ProviderCapability` | chat、vision、tool_call 等可枚举能力。 |
| `SearchFilter` | Search 2.0 的关键词、实体类型、Workspace、Tag、Provider、状态与日期范围条件。 |
| `SearchResult` | 五类实体统一映射后的标题、摘要、匹配字段与展示元数据。 |

主要数据关系：

```text
Conversation
├── Source
├── Message[]
└── Proposal[]
    ├── sourceId? / sourceMessageIds[]?
    └── KnowledgeCard?
        └── tagIds[] → Tag[]

AIProvider ── metadata ──→ Proposal ── snapshot ──→ KnowledgeCard
```

`ImportedSource.conversationId` 与部分 Proposal 元数据为可选字段，用于兼容 Sprint1 的单流程数据。读取旧数据时不可假定这些字段一定存在。

## Contract 层

位置：`src/core/contracts`

Contract 描述 Core 需要的能力，而不是具体实现。目前包括 Workspace、Conversation、Source、Message、Proposal、KnowledgeCard、Tag、AI Provider 选择、Provider Configuration、Prompt Template 和 AnalyzerRun 的存储契约，以及分析能力契约 `AnalyzerProvider`。

`AnalyzerProvider` 暴露：

- `providerInfo`
- `analyzeSource(source)`
- `analyzeMessages(conversationId, selectedMessages)`

真实 AI Provider 若将来获准接入，必须实现此 Contract，并继续返回 Proposal；不得从 Provider 直接写 Storage 或创建 KnowledgeCard。

## BrowserStorage 层

位置：`src/infrastructure/storage`

BrowserStorage 是 Contract 的 LocalStorage Adapter，负责：

- LocalStorage key 的集中管理。
- JSON 序列化与反序列化。
- 集合查询、保存、更新和删除。
- 旧数据的默认值与兼容归一化。
- `current-source`、`current-proposal`、当前 Provider 等页面流程指针。

当前集合 key 使用 `ai-learning-os.*` 命名空间。`current-source` 和 `current-proposal` 只是当前流程指针，不是跨实体关系的唯一事实来源；持续数据应以集合、实体 ID 和引用字段为准。

所有 BrowserStorage 只能在浏览器客户端调用。Page 必须通过 Adapter 使用本地数据，禁止复制 key、JSON 解析或直接 LocalStorage 访问。

## Service 层

位置：`src/core/services`

Service 承担领域转换和跨实体编排：

- `message-parser`：把原始文本按说话人规则解析为 Message。
- `import-profile-service`：提供六种默认 Import Profile，驱动来源专属解析、标题建议与导入预览统计。
- `demo-provider`：以确定性本地逻辑分析 Source 或 Messages。
- `ollama-provider`：使用 ProviderConfiguration 与 PromptTemplate，通过本地 `/api/chat` 非流式生成结构化输出并执行 Validator。
- `provider-registry` / `provider-service`：注册、选择、回退和持久化当前 Provider。
- `provider-configuration-service`：合并默认配置、保存 enabled 状态，并为离线 Connection Test 提供持久化入口。
- `proposal-review`：执行 Accepted、Rejected、Applied 状态转换。
- `knowledge-card-creation`：从 Accepted Proposal 创建可追溯的 KnowledgeCard 快照。
- `conversation-workspace`：复制或级联删除 Conversation 关联数据，并重建副本 ID 映射。
- `tag-management`：创建、更新及关联 Tag。
- `global-search`：统一映射 Conversation、Proposal、Knowledge、Tag 与 Workspace，组合关键词和结构化过滤，并保留旧字符串搜索入口。
- `text-statistics`：计算编辑器字数。
- `prompt-template-service`：提供并重置默认 Analyzer Prompt Template。
- `analyzer-output-validator`：校验 Analyzer 的结构化输出边界。
- `analyzer-execution`：执行 Provider 安全检查，记录运行状态并隔离失败。

Service 不应知道 LocalStorage key，也不应包含 React state 或路由逻辑。涉及业务规则时，Service 面向 Contract；简单页面 CRUD 目前可直接使用 BrowserStorage，但规则不能在多个 Page 中重复扩散。

## Page 层

位置：`src/app`

Page 与 UI component 负责：

- Next.js 路由、布局和导航。
- 表单、选择、确认框和展示状态。
- 在客户端组合 BrowserStorage 与 Service。
- 把实体映射为用户可理解的界面。

Page 不负责：

- 定义 LocalStorage key 或数据迁移。
- 实现可复用的跨实体业务规则。
- 让 AI 输出绕过 Proposal Review。
- 在 Core 中引入 React/Next.js 依赖。

主要路由包括 Dashboard、Workspace、Import、Conversation、Analysis、Review、Knowledge、Tags、Search 和 Settings。

## 关键数据流

从选中 Messages 生成知识：

```text
Conversation Page
  → MessageParser / BrowserMessageStorage
  → 用户选择 Message[]
  → ProviderService → AnalyzerProvider.analyzeMessages()
  → ProposalStorage
  → Review Page → ProposalReview Service
  → KnowledgeCardCreation Service
  → KnowledgeCardStorage
```

Provider 选择与元数据：

```text
Settings Page
  → ProviderService
  → ProviderRegistry
  → AIProviderStorage（保存当前 providerId）

AnalyzerProvider
  → AnalyzerExecutionService → AnalyzerRun running / success / failed
  → Structured Output Validator
  → Proposal.providerId / providerName / generatedAt / analysisMode
  → KnowledgeCard 中保存必要快照
```

Registry 始终注册 Demo Provider，并在 Ollama configuration enabled 时注册 OllamaProvider；当前 Provider 不可用时回退 Demo。其它 Provider 不包含网络客户端、密钥或真实调用。生成 Proposal 时保存 Capability，Review 展示该快照，接受后 KnowledgeCard 保存独立 Capability Snapshot。

Workspace 归属与安全删除：

```text
Workspace Page / Import / Conversation Detail
  → WorkspaceService → WorkspaceStorage
  → ConversationStorage（单层 workspaceId）

Delete Workspace
  → 关联 Conversation.workspaceId = Inbox
  → 删除 Workspace
  → 不删除 Source / Message / Proposal / KnowledgeCard
```

Dashboard、Search 与 Knowledge 列表通过 Conversation 引用解析 Workspace；无法从 KnowledgeCard / Proposal 追溯 Conversation 时显示 `unknown`，不伪造来源。

Search 2.0 数据流：

```text
Search Page
  → BrowserStorage adapters 读取现有集合
  → GlobalSearch Service 统一映射 SearchResult
  → SearchFilter（query / type / workspace / tag / provider / status / date）
  → 分组展示与实体路由
```

Search 不新增持久化 key 或索引；`q`、`workspaceId` 和 `type` 只保存在 URL 中用于刷新恢复。空关键词使用相同 Service 返回按更新时间排序的本地最近内容。

## 一致性与兼容

- 同一 Proposal 只能对应一张 KnowledgeCard。
- 删除 Conversation 会通过 Service 清理关联 Message、Source、Proposal 和 KnowledgeCard。
- 复制 Conversation 会为关联实体生成新 ID，并重建 Source、Message、Proposal 引用。
- 删除 Proposal 不会删除已经生成的 KnowledgeCard；知识卡保留来源快照并可提示引用缺失。
- 删除 Tag 会从 KnowledgeCard 的 `tagIds` 中解除关联，不会删除知识卡。
- 新增字段必须为旧 LocalStorage 数据提供安全默认值或显式迁移。
- 旧 Conversation 缺少 `workspaceId` 时由 BrowserConversationStorage 归一化为 Inbox；删除普通 Workspace 时 WorkspaceService 将关联 Conversation 回迁 Inbox。
- 旧 Conversation 缺少 `importProfileId` 时继续使用通用 Message Parser，不清空或改写历史数据。
- 旧 Proposal 缺少结构化字段时，UI 使用 unknown / legacy 展示，不回写或清空旧数据。
- Analyzer 失败只写 AnalyzerRun，不写 ProposalStorage；可恢复失败可按原 Source 或 Message IDs 重试。
- Ollama 网络不可达或超时为可恢复失败；JSON 或结构校验失败为 `INVALID_OUTPUT`，两者都不会写 ProposalStorage。
- Analysis 与 Conversation 在 Ollama 失败时展示 AnalyzerRun 中的具体原因和 Demo Provider 回退入口；切换动作仍由用户在 Settings 明确执行。

## 当前限制与演进边界

LocalStorage 适合当前单设备 MVP，但容量有限、同步读写、无事务，也不解决备份、跨设备同步和并发。需要更换存储时，应新增或替换 Contract Adapter，而不是让 Page 直接依赖数据库。

同理，接入真实 AI 前应先确认安全、密钥、错误处理、成本、重试和隐私方案。Provider 仍只能生成 Proposal，人工 Review 边界保持不变。

Workspace 只提供单层归属，不形成目录树，也不引入账号、权限、团队协作、数据库或云同步。相关决策见 [RFC-002](./docs/rfc/RFC-002-workspace.md)；LocalStorage 与人工审核边界分别见 [ADR-001](./docs/adr/ADR-001-localstorage-first.md) 和 [ADR-002](./docs/adr/ADR-002-human-review-required.md)。

Search 2.0 是对当前 LocalStorage 集合的同步线性扫描，适合当前单浏览器小数据量边界；它不包含数据库索引、RAG、Embedding、AI 搜索或云同步。
