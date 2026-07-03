# Roadmap

状态定义：`已完成` 表示能力已在当前工作区实现；`未开始` 表示尚无实现承诺。后续 Sprint 的主题开始前需要重新确认范围。

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

- 增加非流式 OllamaProvider，默认 `http://localhost:11434` 与 `qwen2.5:7b`，默认不启用。
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
