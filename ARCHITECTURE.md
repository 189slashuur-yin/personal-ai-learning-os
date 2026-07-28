# Architecture

## Current release context

- Current Version：v1.8 release checkpoint complete（`v1.8.0-rc1`）
- Current Focus：immutable Conversation Snapshot architecture 已落地，进入最终 release 验收
- Next Recommended Phase：确认最终 `v1.8.0` release；已延期 lifecycle、read UX 与 Search hardening 需单独批准

当前架构结论仍受单浏览器、本地优先与浏览器存储边界约束。PALOS 业务数据默认使用 IndexedDB；LocalStorage 保留为轻量配置、UI 偏好、schema/storage metadata 与旧数据迁移来源。v1.0 候选必须先完成范围和验收评审，不能从本文的演进 seam 推定为已批准实现。

## v1.8 Conversation Snapshot workflow delta

- v1.8 immutable Snapshot architecture 已完整落地：ImportedSource history、resourceHash identity、versioned parser、comparator、delta projector、canonical writer、reload verification、legacy migration 与 ImportWorkbench workflow 保持分层。
- Import UI 仍是 target 与 input source 两个正交轴；input source 第四项命名为 `ChatGPT Conversation Snapshot`，复用原有 New / Existing state，并在 Snapshot 表单中只渲染一个 target selector。
- Conversation content 必填且严格二选一：用户上传的本地 saved HTML 或粘贴的完整 rendered transcript。可选来源 identity 接受严格 ChatGPT share URL 或 logged-in conversation URL；URL 仅存在于 React capture state 与一次 workflow request，用于规范化和 SHA-256 resourceHash，不持久化、不请求、不读取 cookie/session/internal API。
- New 无 URL时对 namespaced PALOS local identity 生成稳定 resourceHash；Existing 无 URL时从所选 Conversation 的唯一有效 immutable history 取得既有 resourceHash。旧 Share Snapshot v2 histories 继续兼容。
- UI 只调用公开 `ChatGPTShareSnapshotWorkflow.preview()` / `confirm()`；parser、comparator、delta projector 与 canonical plan 仍封装在 workflow 内。UI 不读取 private plan，也不直接调用 canonical operation。
- resourceHash history 仍是真实 owner authority。New / Existing selector 是用户意图 guard：resolved target 与选择不一致时 preview 明确阻止 confirm，不静默重定向写入；URL-only 在 parser 前阻止。
- preview 显示 new/append/same/blocked、existing/snapshot/new Message counts、Round extend/create/total impact，以及 Conversation、Message provenance 和 Round enrichment preservation。
- 输入、target、Workspace、标题或 content kind 改变都会丢弃旧 preview/workflow instance；异步 preview/file read 使用 revision guard，不能用 stale baseline confirm。
- confirm 仅在 IndexedDB authoritative state 已加载、preview confirmable、baseline 与 target intent 均有效时启用；写入仍由 hardened canonical writer 的单事务与 reload verification 完成。LocalStorage debug mode 不执行 Share Snapshot canonical write。
- Snapshot-owned Conversation 的通用 Source / Message mutation 统一由 Core ownership guard 阻止；Detail、普通 import/export append、Merge、Duplicate 与 Version Restore 都不能绕过 canonical writer。guard 不下沉到通用 Storage，因此 canonical operation 与权威恢复装载仍可工作。
- 普通 Conversation Version Restore 保留既有“重新生成 Message ID”语义，并按 snapshot/current Message order 将现有 `Round.messageIds` 重映射到恢复后的 canonical Messages；Round 内容、顺序与 enrichment 不变，连续 Restore 和 IndexedDB reload 后引用仍一致。
- 七个 canonical IndexedDB stores、数据库 schema、Snapshot metadata schema 与 Conversation aggregate boundary 均未改变。

## v1.7 Context Management delta

- Conversation 仍是 Aggregate Root；新增可选嵌入 `context`，包含长期背景、当前状态、决策记录、约束条件与下一步行动文本。原 `note`、`summary`、`conclusion`、`pendingQuestions` 全部保留并维持原职责。
- Round 仍是 Conversation 子实体；新增可选嵌入 Context 配置，记录 inheritance mode、source Round、excluded fields、manual overrides、confirmed snapshot 与 confirmed time。没有新增 Memory/Context Aggregate。
- `RoundContextInheritanceService` 从当前 Round 之前由近到远查找“存在人工 Summary/Note 或 confirmed snapshot”的 Round，跳过空 Round；没有候选时回退 Conversation Overview。默认引用是只读投影，不写当前 Round snapshot；只有用户主动改选来源、关闭引用或使用高级 Override/Exclude 时才写既有配置。
- `ConversationContextService` 集中执行 Context CRUD、字段归一化、变化比较与 Timeline 追加。每次有效更新复用 `ConversationVersion`，以 optional `kind=context` 和 `contextChanges` 保存历史；旧 Version 继续可读。
- Next Actions 继续复用独立 Task，通过既有 Conversation SourceRef 关联；不新增 Calendar、Reminder、Habit、自动执行或 AI 自动建 Task。
- Search 仍是运行时关键词 + subsequence fuzzy，不新增索引或持久化结构；Round Note 通过统一 parser 投影为 notes/nextActions/goal/decisions/pendingQuestions/legacyNote matched fields。
- Context Export 是纯 Service DTO，格式为 `palos-context-export` v1.0，包含 Conversation、Context、Decision history、关联 Task 与 Round summary/context snapshot；不调用模型。
- Final Usability Correction 不增加持久化字段：Round 默认三个字段分别映射 `Round.note` 的“我的备注”段、`Round.summary`、`Round.note` 的“下一步行动”段。`round-record.ts` 是唯一 serializer/parser，canonical note 带内部版本标记和 header-line 转义；纯文本、旧分段、`【补充备注】`、重复兼容段及未知旧文本可归一化 round-trip。
- “继续这个主题”复用 Context Export DTO 和同一 Round parser 生成纯文本，分别输出“我的备注 / 本轮结论 / 下一步”，只读取 Conversation Context、最近 Rounds、Pending Questions 与关联 Task；不写 Storage、不调用 Provider。
- autosave 使用 750ms 防抖和 per-controller revision/in-flight 串行；blur、折叠/切换和组件卸载主动 flush，`beforeunload` 仅 best-effort。IndexedDB optimistic cache update 后还必须等待 tracked transaction 成功才显示“已保存”；失败保留最新 draft 并显示 retry。每次按键不直接写 IndexedDB。
- 页面级 Round Inspector 已移除；展开 Round 自身形成响应式局部双栏。高级 inheritance 的 `excludedFields` / `overrides` 数据继续可读写，但只放在“调整参考”的二级折叠区，不改变 `RoundContext` model。
- 默认历史投影显示“当前推荐参考”且不写数据；人工确认后读取并显示已固定 snapshot，不再用 live source 内容冒充历史快照。Round own record 与 inherited snapshot 始终独立。
- Round 结论与 Conversation Overview 的 Knowledge 入口都先显示预览确认；现有 Knowledge 模型要求 `proposalId`，因此继续创建人工 Applied Proposal 作为 provenance 桥接。同一来源与规范化内容重复确认会复用已有卡；autosave 和 inheritance 都不调用该路径。
- 390px 下展开 Navigator 使用覆盖层而不改变主网格宽度；1280px 保持内联双栏，Round 自身在窄屏保持上下布局。
- 七个 canonical IndexedDB stores 和 schema 完全不变；新增字段均为 optional，Browser/IndexedDB adapter 对 v1.6.5 缺失值与异常形状安全归一化。

```text
Conversation
├─ note / summary / conclusion / pendingQuestions（既有字段）
├─ context（当前有效状态）
├─ ConversationVersion[kind=context]（Context Timeline）
├─ Round.context（人工确认的 inherited/local override snapshot）
└─ Task[sourceRef=conversation]（轻量 Next Actions）
```

## v1.6.5 Stable candidate runtime delta

- `analysis-result`、Round/Conversation Workspace、Workspace/Tag Manager、Tasks/Today 中的七类 canonical entity 统一通过 `storage-factory` 获取；Task、Workspace、Asset、AnalyzerRun、Tag 与其它 sidecar 继续使用原 adapter，不扩大迁移范围。
- App Data restore 在任何写入前验证 envelope、IndexedDB store key、record ID、重复 ID 与已提供 canonical store 之间的引用；不改 schema。
- Restore 在 drain pending writes 后备份所选 LocalStorage key 与将被替换的 IndexedDB stores；写入后 reload cache，并逐 store 验证 ID 集与 LocalStorage 内容。失败时恢复并验证备份；验证不完整时明确报告数据状态未确认。
- Backup 是当前 restore 操作内的回滚快照，不是 durable journal；页面崩溃或浏览器异常退出后的 journal recovery 未实现。
- Playwright 单条串行 E2E 使用独立浏览器上下文，覆盖 create Conversation、TXT append、reload、Search、App Data export、delete/reload 与 restore/Search。
- URL 直接进入 `inputMode=txt` 时 parser 初始状态与 UI mode 对齐为 TXT，避免只在手工切换模式后才使用 TXT parser。

## v1.6.4 runtime delta

- 当时的 Import UI 是两个正交选择：target 为 New / Existing，input source 为 ChatGPT Export / Paste Text / TXT File，共六种组合；v1.8 Phase 2E 在同一 input source 轴增加第四种 Share Snapshot mode，Existing 仍只渲染一个 target selector。
- Paste/TXT 复用 `ImportParserPipeline` 与 `ImportService`；Existing + TXT 不进入 structured ChatGPT parser。TXT 必须是可解码 UTF-8、非空且包含可解析角色标签。
- `ImportService` 生成 canonical Message/Round IDs 后返回实际 ID 集；IndexedDB success 需经过 flush → clear caches → preload → Conversation/Source/Message/Round count、ownership 与 Round.messageIds verification。
- Import phase 明确为 idle、parsing、preview-ready、confirming、importing、flushing、verifying、success、failed、quota-stopped；批量 UI 每 10 个 Conversation 更新一次 React progress，不逐 Message setState。
- ChatGPT Existing append 按 external message identity 去重；同一 source 的后续更新可追加新 identity。不同 source 的相同 content 不用纯 `contentHash` 全局去重；缺少可靠 identity 时宁可保留，advanced semantic dedup 留在 backlog。
- Bulk diagnostics 始终可写入 bounded memory buffer，但 Copy Diagnostics 与 console 只在 `NEXT_PUBLIC_PALOS_DIAGNOSTICS=1` 开启；Analyzer failure diagnostics 独立使用 `NEXT_PUBLIC_PALOS_ANALYZER_DIAGNOSTICS=1`。
- v1.6.1 canonical atomic delete、v1.6.2 structured ChatGPT linearization/count parity 与 v1.6.3 referential integrity 都保持原边界，没有重写。

## v1.0 Phase2 runtime delta

- Workspace 兼容扩展 `parentId/order/type/collapsed`，形成多层 Workspace/Folder；Conversation 仍只归属一个节点。
- Conversation Explorer 与 Workspace Mode 是 Page 级读写组合，不改变 Conversation/Round 的 Aggregate 边界。
- Round 增加可选 summary；Conversation 增加可选 summary/conclusion/pendingQuestions。缺失字段按旧数据安全读取。
- Proposal 仍是 AI 草稿，Knowledge 仍需人工确认；Knowledge update 保存 previous content snapshot。
- Asset 仍只保存 metadata/path/status，不读取或删除真实文件。
- Recipe 只记录本地手动步骤，不执行 Analyzer，不是 Agent。
- App Data 导入导出由 BrowserAppDataStorage 集中拥有 PALOS keys，导入先校验/预览，失败回滚。
- ChatGPT `conversations.json` 由 pure linearizer 读取 current-node 主分支，只接收 User/Assistant 文本。首次导入复用现有 ImportService 生成 Rounds；重复导入按 external conversation/message identity append Message，绝不自动覆盖旧 Rounds。

## v1.0 Phase0 architecture freeze

本节是已批准的 v1.x Domain 基线；Phase1 在其边界内实现 Conversation / Round alpha。

```text
Workspace → Conversation (Aggregate Root)
                 ├─ ImportedSource segment[]
                 ├─ Round[] → Message[]
                 └─ ConversationVersion[]

Provider → AnalyzerRun → Proposal → ReviewDecision
                                    └─ explicit apply → Knowledge → KnowledgeRevision[]

ImportArtifact → Parser → Preview → Confirm → ImportReceipt + Conversation[]

SearchDocument → SearchResult（read-only）
```

冻结规则：

- Conversation 代表一个逻辑对话线程，不代表 Import、主题或项目。
- Round 是 Conversation 内稳定的交互单元和 Message 分组；不是 Aggregate Root。
- Question/Answer 是 Round Messages 的投影，不是独立持久化实体；现有 Q&A Pair 是迁移兼容读模型。
- Proposal、Knowledge、Task 不属于 Round；它们用 typed reference 与 snapshot 关联来源并拥有独立生命周期。
- ReviewDecision 是不可变人工决定；Accepted Proposal 必须显式、幂等 apply 才能创建 Knowledge 或追加 KnowledgeRevision。
- Workspace 继续提供 Conversation/Task 归属；Round 继承 Conversation 上下文。
- Search 默认返回 Conversation、Knowledge、Round、Proposal、Task、Asset、Raw Message，不拥有数据。
- Import Parser 纯函数化、版本化，不写 Storage；Preview + 人工确认后才由 ImportService 持久化。
- 不引入 Session；Conversation、Round、Workspace、ImportReceipt 已覆盖其候选职责。

当前删除边界：Conversation 删除使用统一 dependency collector 清理 Source、Round、Message、Version、关联 Proposal 与 owner sidecars；正式 KnowledgeCard 与 Task 保留，但 provenance 降级为 missing，不生成失效 live link。该语义由 v1.6.3 referential-integrity 回归覆盖。

详细决策见 [RFC-005](./docs/rfc/RFC-005-conversation-round-model.md)、[RFC-006](./docs/rfc/RFC-006-import-parser-contract.md)、[RFC-007](./docs/rfc/RFC-007-search-result-contract.md)、[RFC-008](./docs/rfc/RFC-008-proposal-review-knowledge-lifecycle.md)、[ADR-004](./docs/adr/ADR-004-conversation-remains-aggregate-root.md) 与 [Freeze Report](./docs/reviews/Architecture-Freeze-v1.0-Phase0.md)。

## v1.0 Phase1 runtime delta

- `Round` 通过 `RoundStorage` / `BrowserRoundStorage` 独立保存，并由 `RoundService` 统一执行新增、编辑、删除、合并、拆分、排序与 messageIds 重新绑定。
- 为兼容本次验收字段，Round 持久化 `question`、`answer`、`messageIds`；Service/Parser 负责统一生成这些投影，旧 Message 仍是保留的原始数据，不自动增加字段或被删除。
- `MessageToRoundMigrationService` 提供全量或单 Conversation dry-run summary 与显式 apply；没有 page-load 自动迁移、schema swap 或旧数据清理。
- `ConversationParser` 是 pure/versioned Core contract；`ImportParserPipeline` 只产草稿与 Preview，`ImportService.confirm` 才通过 Contracts 写 Conversation/Source/Message/Round。
- Proposal/Knowledge 只增加 optional `sourceRoundId`；旧记录无需回填。SearchDocument 继续是运行时读模型，新增 Round/Asset，Raw Message 仅在高级模式显示。
- Page/Component 未直接访问 LocalStorage；所有新持久化仍集中在 Infrastructure。

## v0.9 Data Foundation & Search baseline

v0.9 新增运行时 `SearchDocument` 读模型与 `SearchIndexService`，从 Workspace、Conversation、Source、Message、派生 Q&A Pair、Proposal、KnowledgeCard、Task、Tag 构建全文文档。索引不持久化、不拥有源数据；搜索使用标准化 contains、简单评分与低权重 subsequence fuzzy，并返回 snippet、matched fields、Workspace 和来源路径。

Conversation 新增可选 `note`，由 BrowserConversationStorage 兼容旧数据。Asset 使用独立 Entity、Contract、BrowserStorage 与 Service，只保存 owner、path、hash 等 metadata；浏览器不保存或读取文件内容。备份脚本只复制项目白名单文档和存在时的 `data/`，不宣称导出浏览器 LocalStorage。完整决策见 [RFC-004](./docs/rfc/RFC-004-data-and-search-foundation.md) 与 [ADR-003](./docs/adr/ADR-003-local-asset-library.md)。

本版本不包含 RAG、Embedding、Agent、Calendar、Reminder、Cloud Sync、数据库迁移或真实云 Provider API。

## Release v0.7 architecture baseline

v0.7 是 Phase2 的 Daily Learning Workflow 基线，Epic D 已完成。Task 已作为独立领域接入 Contract、BrowserStorage、Service、Today / Tasks UI 与 Search；系统继续采用 Entity、Contract、BrowserStorage、Service、Page 五类职责，并保持 Demo Provider 默认可用、Ollama 可选启用、人工 Review 必经的边界。

当前工程约包含 18 个 Entity 文件、20 个 Service 文件、12 个 BrowserStorage Adapter 和 12 个 Page 入口。详细统计与口径见 [docs/project-status.md](./docs/project-status.md)。

## Epic D architecture baseline

Architecture Pack v1 冻结了 Epic D（Task / Productivity Layer）的设计边界，Task 运行时现已实现。Task 作为独立行动领域，可选关联 Conversation、KnowledgeCard、Message 等来源快照，归属单层 Workspace，并拥有自身的日期与完成状态；源删除时 Task 保留并显示 `deleted`，Workspace 删除时 Task 回迁 Inbox。

Epic D 第一阶段只实现 Task。Activity 为 planned / not immediate；Memory 与 Agent 仍为 future。Calendar、Reminder、Recurring Task、Pomodoro、Habit、Workflow、Agent 与 RAG 均不在本阶段范围。完整决策见 [RFC-003](./docs/rfc/RFC-003-task-domain.md)、[Domain Model](./docs/architecture/DOMAIN_MODEL.md)、[Domain Boundaries](./docs/architecture/DOMAIN_BOUNDARIES.md)、[Data Lifecycle](./docs/architecture/DATA_LIFECYCLE.md) 与 [Epic D Design](./docs/design/Epic-D-Design.md)。

## 架构概览

项目是一个 local-first 的模块化单体，采用五类清晰职责：Entity、Contract、BrowserStorage、Service、Page。

当前 v0.9 运行时的顶层领域关系为 `Workspace → Conversation → Source / Message / ConversationVersion → AnalyzerRun → Proposal → Review → KnowledgeCard → Tag / Search`，旁侧包含独立 `Task → Today / Tasks / Search` 行动链路。Phase0 目标关系见上节；Activity 仍仅为 planned。完整模型见 [docs/architecture/DOMAIN_MODEL.md](./docs/architecture/DOMAIN_MODEL.md)。

```text
Page ───────────────→ Service ───────────────→ Contract
 │                       │                        ↑
 │                       └────────→ Entity        │ implements
 │                                                │
 └── composition / simple CRUD ─────────→ Storage Adapter
                                          ├── IndexedDB canonical stores
                                          └── LocalStorage config / sidecars / legacy
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
| `Workspace` | Conversation 的多层 Workspace/Folder 归属；Inbox 是默认根节点。 |
| `Conversation` | 工作区聚合入口；保存标题、来源类型、时间信息与 v1.7 可选 Context。 |
| `Round` | Conversation 子实体与最小整理单元；v1.7 可选保存人工确认的 Context inheritance snapshot。 |
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
| `SearchFilter` | Search 2.0 的关键词、实体类型、Workspace、Tag、Provider、状态、Task 筛选与日期范围条件。 |
| `SearchResult` | 当前 Search entity 类型统一映射后的标题、摘要、匹配字段与展示元数据。 |
| `Task` | 独立行动实体；拥有状态、优先级、类型、日期、Workspace、SourceRef 快照与生命周期时间。 |

`Task` 已实现并遵循 RFC-003 的独立生命周期与删除边界；当前 SourceRef 在兼容设计上扩展到 Message、Proposal、Workspace 与 Manual 快照。`Activity` 尚未实现，仍为 planned / not immediate。

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

## BrowserStorage / IndexedDB 层

位置：`src/infrastructure/storage`

Storage adapters 是 Contract 的浏览器持久化实现。IndexedDB 是 Conversation、Message、Round、Source、Proposal、KnowledgeCard 与 ConversationVersion 的默认正式业务存储；Browser LocalStorage adapter 保留用于 legacy compatibility、migration source、rollback/debug 与轻量配置。

七个 canonical IndexedDB stores：

1. `conversations`
2. `messages`
3. `rounds`
4. `sources`
5. `proposals`
6. `knowledge-cards`
7. `conversation-versions`

LocalStorage sidecars 包括 `current-source`、`current-proposal` 等当前选择指针；它们必须通过 Infrastructure adapter 读取和清理，不能被合并回 canonical entity 集合。Workspace、Task、Tag、AnalyzerRun、Asset metadata、Feedback/AppEventLog、Provider 配置与 UI preference 仍是现有 LocalStorage/sidecar 边界，不得误写为上述七个 canonical stores。

Storage adapters 负责：

- IndexedDB store 或 LocalStorage key 的集中管理。
- JSON 序列化与反序列化。
- 集合查询、保存、更新和删除。
- 旧数据的默认值与兼容归一化。
- `current-source`、`current-proposal`、当前 Provider 等页面流程指针。

LocalStorage 集合 key 继续使用 `ai-learning-os.*` 命名空间。`current-source` 和 `current-proposal` 只是当前流程指针，不是跨实体关系的唯一事实来源；持续业务数据应以 IndexedDB 集合、实体 ID 和引用字段为准。

所有 BrowserStorage 只能在浏览器客户端调用。Page 必须通过 Adapter 使用本地数据，禁止复制 key、JSON 解析或直接 LocalStorage 访问。

## Service 层

位置：`src/core/services`

Service 承担领域转换和跨实体编排：

- `message-parser`：把原始文本按说话人规则解析为 Message。
- `import-parser-pipeline`：纯函数解析 Paste/TXT，生成 Message/Round drafts 与 errors/warnings。
- `import-service`：New confirm 与 Existing append 的唯一 text/TXT write boundary，返回实际新增 ID/count 供 durability verification。
- `chatgpt-export-import`：structured ChatGPT linearization、external identity 去重与 append orchestration；不承担 TXT parsing。
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
  → SearchFilter（query / type / workspace / tag / provider / status / task filters / date）
  → 分组展示与实体路由
```

Search 不新增持久化 key 或索引；`q`、`workspaceId` 和 `type` 只保存在 URL 中用于刷新恢复。空关键词使用相同 Service 返回按更新时间排序的本地最近内容。

## 一致性与兼容

- 同一 Proposal 只能对应一张 KnowledgeCard。
- 删除 Conversation 会通过 canonical Service 清理关联 Message、Round、Source、Proposal、Version；正式 KnowledgeCard 与 Task 保留并降级来源。
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

IndexedDB 是当前七类 canonical business data 的事实来源；LocalStorage 仍承载轻量配置与部分 sidecars，其容量、同步写与无事务限制仍适用。需要继续迁移其它集合时，应新增或替换 Contract Adapter，而不是让 Page 直接依赖数据库。

同理，接入真实 AI 前应先确认安全、密钥、错误处理、成本、重试和隐私方案。Provider 仍只能生成 Proposal，人工 Review 边界保持不变。

Workspace/Folder 已支持本地多层组织，但不引入账号、权限、团队协作、服务端数据库或云同步。相关历史决策见 [RFC-002](./docs/rfc/RFC-002-workspace.md)；人工审核边界见 [ADR-002](./docs/adr/ADR-002-human-review-required.md)。

v0.9 SearchIndexService 是对当前 LocalStorage 集合的同步运行时构建与线性评分，适合当前单浏览器小数据量边界；它不包含数据库索引、RAG、Embedding、AI 语义搜索或云同步。

Task 使用独立 Contract、BrowserStorage 与 Service，并由 Search 只读映射。Knowledge 不负责行动，Task 不负责知识内容，Provider 不负责业务决策，Search 不拥有数据，未来 Activity 不负责当前业务状态。AI 不能直接创建、完成或删除 Task；AI Suggest Task 也未实现。

明确 backlog：ChatGPT share-link import、从 share link 更新已有 Conversation、mobile/PWA、cloud/multi-device sync、multi-user/family sharing、attachment/voice/canvas/tool nodes、import transaction fan-out optimization、advanced cross-source semantic dedup，以及 AI/RAG/Embedding。它们都不是当前 runtime 能力。
