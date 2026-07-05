# Roadmap

状态定义：`已完成` 表示能力已在当前工作区实现；`未开始` 表示尚无实现承诺。后续 Sprint 的主题开始前需要重新确认范围。

## Current release

- Current Version：v0.9 draft
- Phase：Phase2
- Current Epic：Epic D（Completed）
- Current Focus：Data Foundation & Search；实现完成，手工 QA 待执行。
- Next Recommended Phase：v1.0 planning（范围与验收标准待批准）。

## v0.9 — Data Foundation & Search

- Conversation Note 独立于 Tags / Knowledge，并纳入全文搜索。
- SearchDocument 在运行时覆盖 Workspace、Conversation、Source、Message、Q&A Pair、Proposal、Knowledge、Task、Tag。
- `/search` 展示具体片段、来源路径、matched fields、相关度与 exact / contains / fuzzy 模式。
- 轻量 fuzzy 使用 normalized subsequence；未引入 Fuse.js、MiniSearch、Embedding 或语义搜索。
- Asset foundation 只保存 metadata/path，Conversation Detail 可手工登记与删除 metadata。
- 备份脚本复制项目文档与存在时的 data/；Settings / Help 解释数据边界。
- Task 保留但降低主流程入口优先级，不继续增强催办能力。
- 不包含 RAG、Agent、Calendar、Reminder、Cloud Sync、数据库迁移或云 Provider API。

## v0.8 — Product Onboarding + Conversation Q&A Pair UX

- 内置 `/help` 中文操作手册与八步推荐流程。
- Settings 当前只展示 Demo / Ollama；Ollama 需 enabled 且 Test Success 后才能设为当前 Provider，默认模型为 `qwen3:8b`。
- Q&A Pair 从 Messages 运行时派生，不新增 LocalStorage key，不改变 Proposal / Knowledge Snapshot。
- Conversation 支持 Timeline / Q&A Pair、Pair 搜索排序折叠、多选 Analyze 与六步动态流程引导。
- Knowledge 明确 Active / Archived 语义，永久删除进入双重确认 Danger Zone。
- Dashboard 提供最近 8 条 Conversation 横向导航。
- 不包含 RAG、Agent、Calendar、Reminder、数据库或云 Provider API。

## Product phases

- Phase1 / MVP：已完成，覆盖本地 Import、Conversation、Analyzer、Review、Knowledge 与 Provider 边界。
- Phase2：当前阶段；v0.7 已完成 Workspace、Conversation / Knowledge Editing、Search 2.0 与 Task 日常工作流。
- Phase3：未开始。Real AI、RAG 与其它候选能力必须独立评审，不能从 Epic C 完成推定为已批准。
- Phase4：未开始，候选范围为 Memory 与 Agent，当前不实现。

## Future epics

| Epic | 状态 | 范围 |
| --- | --- | --- |
| Epic D | 已完成 | Task Domain、Today / Task UI、Source-linked Task、Task Search 与 v0.7 稳定化。 |
| Epic E | v1.0 候选 | Knowledge Productivity；只考虑一个受控最小切片，开始前确认范围与验收标准。 |
| Epic F | 未开始 | 待产品负责人确认范围与验收标准。 |

## Epic D — Task / Productivity Layer（Completed）

- D0 — RFC / Domain Model：Architecture Pack v1 已冻结，包含 Task RFC、Domain Model、Domain Boundaries、Data Lifecycle 与 Epic D Design；仅文档，无运行时改动。
- D1 — Task Domain：已新增 Task、SourceRef、TaskStorage、BrowserTaskStorage 与 TaskService；支持生命周期、日期查询、Workspace 回迁、Source missing 判断、Dashboard 统计和 `/tasks` 最小调试入口。
- D2 — Today / Task UI：已新增 `/today`、Quick Capture、Overdue / Today / Upcoming / Inbox / Completed Today、Workspace 筛选；`/tasks` 支持六类视图、Workspace / Priority / Type / 搜索筛选及完整生命周期操作。
- D3 — Source-linked Task：Knowledge、Conversation 和选中 Messages 可显式创建带 SourceRef 快照的 Task；`/tasks` 与 `/today` 展示来源，源删除后显示 `Source deleted` 并保留快照。
- D4 — Task Search + Release v0.7 Stabilization：Search 2.0 已索引 Task，支持基础筛选与最近更新；v0.7 文档和发布门禁已完成。
- Activity 仍为 planned / not immediate；开始前必须另行冻结事件、隐私、保留与失败语义，且不属于 v0.7。
- 第一阶段只做 Task，不做 Agent、Calendar、RAG、Reminder、Recurring Task、Pomodoro、Habit 或 Workflow。
- AI 只能建议 Task；不能直接 Create / Complete / Delete Task。
- Task UI 与 Search 仍是单浏览器、小数据量的本地线性读取；Task 结果按标题跳到 `/tasks`，暂不按 ID 精确定位。

## v1.0 planning candidate — Epic E Knowledge Productivity

v1.0 planning 可评估 Knowledge Productivity，优先改善 Knowledge 的复习、组织与复用体验。它不是唯一或默认的下一项；Local Data Export / Import 与 Search Precision / Anchors 应一并评审。范围、数据模型和验收标准需单独批准；不得默认扩展到 Activity、Agent、RAG、Calendar 或自动化。

正式范围和验收序列见 [docs/design/Epic-D-Design.md](./docs/design/Epic-D-Design.md)，领域决策见 [RFC-003](./docs/rfc/RFC-003-task-domain.md)。

## Epic C — Search 2.0（已完成）

- Part 1：新增 SearchFilter / SearchResult Core 模型；GlobalSearch 支持 Conversation、Proposal、Knowledge、Tag、Workspace 的关键词与结构化过滤，并兼容旧字符串入口。
- Part 2：`/search` 增加 300ms debounce、类型 / Workspace / Tag / Provider / 状态筛选、五类结果分组、完整结果元数据、Empty State 与最近更新。
- Part 3：Dashboard、Knowledge、Conversation、Workspace 接入全局搜索；`q`、`workspaceId`、`type` URL 状态可在刷新后恢复。
- 明确不做数据库、RAG、Embedding、AI 搜索、云同步或权限系统。

## Epic B — Workspace Foundation（已完成）

- Part 0：架构图、产品路线评审、Workspace RFC、LocalStorage 与 Human Review ADR。
- Part 1–4：单层 Workspace、Inbox 兼容、Workspace UI、Conversation / Import / Dashboard / Search / Knowledge 集成和 QA，均已完成。
- 明确不做数据库、多级目录、团队权限、云同步、RAG、Agent、真实云 Provider 或 Workspace 树形层级。

| Sprint | 状态 | 交付范围 |
| --- | --- | --- |
| Sprint1 | 已完成 | Import → Demo Analyzer → Proposal → Review → KnowledgeCard 最小闭环。 |
| Sprint2 | 已完成 | Conversation Workspace：创建、编辑、自动保存、重命名、复制、级联删除与本地统计。 |
| Sprint3 | 已完成 | Search、Dashboard、Knowledge 工作区增强与项目工程文档整理。 |
| Sprint4 | 已完成 | Message Engine、原始文本解析、Message 选择 → Proposal、Conversation Proposal Workspace。 |
| Sprint5 | 已完成 | Tag System、Knowledge Tag 筛选、Proposal 生命周期稳定与来源质量提示。 |
| Sprint6 | 已完成 | AI Provider Interface、Provider Registry/Service、Settings、Analyzer 与 Knowledge 元数据。仅 Demo Provider 可用。 |
| Sprint7 | 已完成 | Analyzer Prompt Template、Structured Output Schema、Error / Retry / Safety。 |
| Sprint8 | 已完成 | Provider Configuration、离线 Connection Test、Capability System 与生成快照。 |
| Sprint9 | 已完成 | Ollama 本地 Provider Adapter、Settings/Connection Test、Source 与 selected Messages Analyzer 集成，以及 Stabilization 用户说明和失败兜底。 |
| Sprint10 | 已完成 | Clipboard Import UI、Conversation Text Parser、Messages → Analyzer 流程、Recent Imports 与导入统计。 |
| Sprint11 | 已完成 | Import Profiles、Smart Title、解析 Preview、导入成功摘要与 Import QA Polish。 |

## Epic A — Feature Set 1（已完成）

- Conversation Message 支持 Edit、Save、Cancel，并展示 Editing / Saved 状态。
- Message 保存后更新自身 `updatedAt` 与 Conversation `updatedAt`；旧 Message 缺少 `updatedAt` 时安全回退 `createdAt`。
- Timeline 默认展开，支持单条/全部 Collapse 与 Expand、内容搜索、当前命中高亮、上一条/下一条循环跳转。
- Timeline 显示 Message 编号、时间和角色。
- Proposal Evidence 与 Knowledge 来源内容继续使用生成时 Snapshot；Message 编辑不回写 Proposal 或 Knowledge。
- 本 Feature Set 不包含 Conversation Version、Merge、Split 或 Export。

## Epic A — Feature Set 2（已完成）

- Conversation Detail 支持创建命名 Snapshot，并展示数量、创建时间、Message 数和备注。
- `ConversationVersion` 使用独立追加式存储，保存 Conversation 与 Messages 的不可变副本；不保存 Proposal、Knowledge、AnalyzerRun、Tag 或 Provider。
- Restore 在明确确认后只恢复 Conversation 与 Messages；Conversation `updatedAt` 更新，Messages 使用新 ID 重建。
- Restore 不修改或删除 Snapshot，也不恢复 Proposal、Knowledge、AnalyzerRun、Tag 或 Provider。
- 删除 Conversation 时通过 Workspace Service 一并删除其 Snapshots；复制 Conversation 不复制原 Conversation 的历史版本。
- 本 Feature Set 不包含 Merge、Split 或 Export。

## 已完成里程碑

### Sprint1 — Core Knowledge Flow

- TXT Source 导入与 BrowserStorage。
- Demo Analyzer 生成 Proposal。
- Proposal Review 状态转换。
- Accepted Proposal 创建 KnowledgeCard。

### Sprint2 — Conversation Workspace

- Conversation 创建、列表、详情和 Source 编辑。
- 防抖自动保存、字数统计、最近打开与 inline rename。
- Conversation 复制和关联数据级联删除。

### Sprint3 — Search / Dashboard / Engineering

- Dashboard 本地统计与快捷入口。
- Conversation、Proposal、Knowledge 全局搜索。
- Knowledge 列表、详情、编辑、状态和本地查询体验。
- 项目说明与架构文档、重复文件清理。

### Sprint4 — Message and Proposal Workspace

- 原始文本解析为 Message 时间线。
- Message 多选与基于选中 Messages 生成 Proposal。
- Conversation 内多 Proposal 列表、详情、Review 入口与删除。

### Sprint5 — Tag and Knowledge Quality

- Tag 创建、编辑、删除、计数和 Knowledge 关联。
- Knowledge 按 Tag/未标记状态筛选。
- Proposal 支持 Pending、Accepted、Rejected、Applied。
- Knowledge 保存 Message 来源快照并提示缺失引用。

### Sprint6 — AI Provider Boundary

- `AIProvider` Entity 与 `AnalyzerProvider` Contract。
- Demo Provider、Provider Registry、Provider Service 和当前 Provider 存储。
- Settings 页面展示 Provider 状态；未实现 Provider 保持禁用。
- Proposal 与 Knowledge 增加 Provider、生成时间、分析模式、来源数量和证据元数据。

### Sprint7 — Analyzer Readiness and Safety

- 增加 Source / Messages 默认 Prompt Template、Storage Contract、BrowserStorage 与只读 Settings 展示。
- 增加 AnalyzerOutputSchema 与手写 Validator；Demo Provider 校验后才转换为 Proposal。
- Proposal 展示 confidence、risk level 与 suggested action，并兼容旧数据。
- 增加 AnalyzerRun、AnalyzerError、BrowserStorage、状态展示、模拟失败和按原来源 Retry。
- Provider、模板与 Validator 安全检查失败时不写 ProposalStorage。

### Sprint8 — Provider Configuration and Capability

- 七个 Provider 的默认配置、BrowserStorage 与 enabled 切换。
- `ProviderService.testConnection()`：Demo 返回 Success，其余返回 Not Implemented，全程离线。
- Dashboard 显示 Current Provider 与 Last Test。
- Capability Badge 覆盖 Settings、Analysis、Conversation 与 Review。
- Proposal 保存生成能力，KnowledgeCard 保存 Provider Capability Snapshot。

### Sprint9 — Local Ollama Provider

- 增加非流式 OllamaProvider，当前默认 `http://localhost:11434` 与 `qwen3:8b`，默认不启用。
- Settings 支持 Ollama enabled、baseUrl、model、timeout，并通过 `/api/tags` 执行真实本地连接测试。
- Source 与 selected Messages 使用 Sprint7 PromptTemplate 和 AnalyzerOutputValidator 生成 Proposal。
- Ollama 不可达时保留可恢复错误，不写 Proposal；Demo 始终作为默认回退。

### Sprint9 Stabilization — Ollama UX / Documentation

- Settings 明确说明 Ollama 的本机安装、`ollama serve` 和模型拉取步骤。
- Connection Test 失败信息引导检查服务状态、baseUrl 和已下载模型。
- Analysis 与 Conversation 显示 Ollama 失败原因、确认未写入 Proposal，并提供切回 Demo Provider 的入口。
- 同步 README、架构、Roadmap、Changelog 与 Handoff；未扩展云 Provider 或数据基础设施。

### Sprint10 — Clipboard Import Engine

- Import 页面保留 TXT 导入，并增加标题、来源、文本统计和 1000 字预览的 Clipboard Import。
- Parser 支持 ChatGPT、Claude、DeepSeek、Gemini、中英文用户标记与冒号，保护三反引号代码块，未识别文本保留为 Unknown Message。
- Conversation Detail 串联原始文本、Messages、选中 Messages、Proposal、Review 与 KnowledgeCard，继续复用 Demo / Ollama 安全链路。
- Dashboard 增加 Recent Imports；Conversation 列表和详情展示来源与关联内容统计。

### Sprint11 — Clipboard Import Profiles / Preview / QA

- 增加 `ImportProfile` Entity 与 `ImportProfileService`，内置 ChatGPT、Claude、DeepSeek、Gemini、Manual、Plain Text 六种纯文本 Profile。
- Profile 角色别名驱动 Message Parser；Clipboard 导入保存 Source 与解析后的 Messages，不读取 JSON 导出文件。
- 优先使用首条 User Message 前 30 字建议标题，无法识别时回退原文首个非空行，且允许用户修改。
- 导入前显示 Message 总数、User / Assistant / Unknown 数量、前三条预览与高 Unknown 比例提示。
- 导入成功摘要、Conversation Detail Import Profile 信息与 Dashboard Recent Imports 统计形成 QA 闭环。

## 下一 Sprint 开始前

1. 由产品负责人确认后续 Sprint 的实际范围与验收标准。
2. 不把 streaming、RAG、embedding 或云 Provider 视为已批准需求。
3. 保持 Demo 默认回退，不收集或保存云端 API Key。
4. 每个 Sprint 完成时同步更新 README、PROJECT、ARCHITECTURE、ROADMAP、CHANGELOG 和 HANDOFF。
