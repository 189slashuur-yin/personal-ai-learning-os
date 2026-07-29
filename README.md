# PALOS — Personal AI Context Manager

PALOS 是一个本地优先的个人 AI 上下文管理工作区。它保留可追溯的 AI 对话原始过程，同时帮助用户人工维护当前上下文、决策、约束和下一步行动；Analyzer 关闭时，导入、整理、Task、Search 与 Export 仍可完整使用。

## Project Status

- Current Version：v1.7 release candidate（final QA passed；release commit pending）
- Current Phase：Personal AI Context Management
- Current Focus：v1.7 Final Release QA — data semantics、autosave reliability、minimal closure
- Verification：9 个 Vitest 文件 / 213 tests；Playwright release gate 2/2；lint/build/diff-check passed；真实三轮浏览器 QA 与 1280/390px 可视复核通过

### Feature Matrix

| Feature | Status | Notes |
| --- | --- | --- |
| Conversation | ✅ | 创建、编辑、复制、删除、Message Timeline 与 Q&A Pair 派生视图。 |
| Round | ✅ v1.7 | 持久化 Round、Round-first UI，以及复用 Summary / Note 的本轮目标、结论、决定、遗留问题和下一步记录。 |
| Help | ✅ | 内置中文概念说明、推荐流程与 Ollama 使用边界。 |
| Workspace | ✅ alpha | Workspace / Folder 多层树、排序、移动与安全回迁 Inbox/上级。 |
| Search | ✅ v1.7 | 本地关键词 + fuzzy；Round 的“我的备注 / 下一步”等结构化字段可分别显示匹配来源。 |
| Conversation Note | ✅ | Conversation 独立备注，可全文搜索。 |
| Conversation Context | ✅ v1.7 | 顶部 Dashboard 展示人工维护的长期背景、当前状态、决策、约束与下一步；不依赖 Analyzer。 |
| Round Context | ✅ v1.7 | 动态态显示“当前推荐参考”，人工确认后显示“已固定参考”；固定 Snapshot 不随来源变化。 |
| Continue Context | ✅ v1.7 | 可复制 Conversation Context、最近 Rounds、Pending Questions 与 Next Actions，并区分备注/下一步；不调用 AI。 |
| Context Timeline | ✅ v1.7 | 明显的 History / Timeline 入口，复用 ConversationVersion 追加变化，不覆盖历史。 |
| Context Export | ✅ v1.7 | 稳定 `palos-context-export` JSON，包含 Conversation、Context、Decision history、Task 与 Round summary。 |
| Assets | ✅ | Conversation 可登记本地文件 metadata/path；不保存文件内容。 |
| Backup | ✅ | 文档与项目内 data/ 的时间戳目录备份脚本。 |
| Knowledge | ✅ | Review 后生成、编辑、归档与来源追溯。 |
| Provider | ✅ | Demo Provider 与可选本地 Ollama；云 Provider 未启用。 |
| Version | ✅ | Conversation History、版本记录与恢复点。 |
| Import | ✅ v1.6.5 candidate | New / Existing × ChatGPT Export / Paste Text / TXT File 六种组合；Preview、进度、flush/reload verification 与明确错误。 |
| Export / Restore | ✅ candidate | PALOS App Data restore 先预校验并备份，写入后验证；失败只在备份恢复也通过验证时声明已回滚。 |
| Recipe | ✅ foundation | 本地手动工作流模板；不自动执行，不是 Agent。 |
| Tag | ✅ | Tag 管理、关联与筛选。 |
| Proposal | ✅ | Source / Messages 分析、证据与生成元数据。 |
| Review | ✅ | 人工接受或拒绝 Proposal。 |
| Ollama | ✅ | 默认关闭，用户显式配置后仅访问本地服务。 |
| Task | ✅ | Today、任务生命周期，以及 Knowledge / Conversation / Message 来源创建与快照。 |
| Today | ✅ | Overdue、Today、Upcoming、Inbox、Completed Today 与 Quick Capture。 |
| Source-linked Task | ✅ | 从 Knowledge、Conversation、选中 Messages 创建并保留来源快照。 |
| Task Search | ✅ | Task 关键词、Workspace、status、priority 与 type 筛选。 |

```text
AI 对话 / Import
        ↓
Conversation → Round → 本轮记录
        ↓          ↘ 人工确认的 Context Snapshot
Conversation Context → Decision / Task → 继续这个主题
        ↓
可选 Analyze → Proposal → Review → Knowledge
```

Round 自有记录与 inherited reference 是两条独立链路：我的备注和下一步以版本化、可逆分段保存在 `Round.note`，本轮结论保存在 `Round.summary`；动态推荐不写数据，用户确认后才固定既有 snapshot。Autosave 约 750ms 防抖，blur、折叠/切换和组件卸载会主动 flush；UI 只在 IndexedDB transaction 完成后显示“已保存”，失败可用最新 draft 重试。`beforeunload` 仅是 best-effort 补充，不是唯一可靠边界。

Knowledge 仍必须人工预览确认；autosave 和 inheritance 不会创建 Proposal/Knowledge。同一来源与规范化内容的重复确认会复用已有 Knowledge，不做全局语义去重。Imported Round 默认不提供单轮破坏性或原始数据编辑入口；AI Provider、Agent、MCP、RAG、Embedding 与 Cloud Sync 不属于 v1.7。

v0.9 draft 在当时的 LocalStorage 基线上增加统一 SearchDocument、具体文本片段检索、轻量 fuzzy、Conversation Note、Asset metadata、备份脚本和 Data Management 说明。当前 v1.7 仍使用七个 canonical IndexedDB business stores；该段只描述历史版本。

v1.0 Phase2 已把 Phase1 的 Conversation/Round 基线扩展为 Second Brain Workspace。当前 ChatGPT 导入仅支持官方 Export zip 解压后的 `conversations.json` 文本消息；同一 ChatGPT source 优先按 `externalConversationId` / `externalMessageId` 识别，后续更新只追加新 identity。Existing append 不用纯 content hash 做跨 source 全局去重，避免误删不同来源的合法同内容 Message。

### Import mode matrix

| Import target | ChatGPT Export | Paste Text | TXT File |
| --- | --- | --- | --- |
| New Conversation | 支持；每个选中 ChatGPT Conversation 新建或按既有 external identity 跳过重复 | 支持；labeled-text parser + Preview | 支持；UTF-8 `.txt` + TXT parser + Preview |
| Existing Conversation | 支持；追加新 message identity，不覆盖旧内容 | 支持；追加 Source / Messages / Rounds | 支持；保留文件名与 Source metadata，追加后执行 flush → clear caches → preload → 引用/计数验证 |

Import target 与 input source 各只有一个选择区。切换 New/Existing 或 ChatGPT/Paste/TXT 时会清理不适用的 target、文件、文本、success/error 与 URL 参数。空白 TXT、无法 UTF-8 解码、没有可解析角色标签或没有 Message 的文件不会显示成功，也不会创建 Empty Conversation。

## 当前功能

- 导入 TXT，保存原始 Source，并从 Source 生成 Proposal。
- 直接粘贴 ChatGPT、Claude、DeepSeek、Gemini 或普通对话文本，创建 Conversation 与可追溯 Source。
- Clipboard Import 使用六种 Import Profile 做纯文本角色预处理，自动建议标题并在导入前展示 Message 解析预览。
- 导入结果展示来源、Message / Unknown 数量；Conversation Detail 保留 Import Profile 信息。
- 按中英文发言标记解析 Messages，保护三反引号代码块，并从选中 Messages 进入现有 Analyzer / Review / Knowledge 流程。
- 创建、重命名、编辑、自动保存、复制和级联删除 Conversation。
- 在 Conversation 内人工编辑长期背景、当前状态、决策记录、约束条件与下一步行动，并查看保留旧值的 Context Timeline。
- Conversation 首屏提供 Context Dashboard，并明确区分普通 Note、Summary、Conclusion、Pending Questions 与长期 Context。
- 每个 Round 提供本轮记录入口，支持本轮目标、结论、新增决定、遗留问题与下一步行动；复用已有 Summary / Note。
- 为 Round 选择历史 Context 来源，逐字段保留、删除、修改，或取消继承；只有人工确认后才保存 Context Snapshot。
- 生成并复制“继续这个主题”文本，包含 Context、最近 Rounds、Pending Questions 与 Next Actions，不调用 AI。
- 将原始文本解析为 Message 时间线，选择多条 Message 生成 Proposal。
- 从 Messages 派生 Q&A Pair，支持搜索、排序、展开、折叠与按 Pair 选择 Analyze；不新增持久化结构。
- Conversation 顶部提供原始内容 → Messages → Q&A Pair → Analyze → Review → Knowledge 动态流程引导。
- 在 Conversation 内查看多个 Proposal、来源证据、状态和分析元数据。
- Review Proposal，并在接受后创建可追溯的 KnowledgeCard。
- 浏览、搜索、编辑、归档、删除 KnowledgeCard，并检查来源完整性。
- 创建、编辑和删除 Tag；给 KnowledgeCard 添加 Tag，并按 Tag 筛选。
- Dashboard 统计，以及 Conversation、Proposal、Knowledge、Tag、Workspace、Task 的结构化全局搜索、分组结果与最近更新。
- 多层 Workspace / Folder、默认 Inbox、Conversation Explorer、Workspace Mode 与快速切换。
- Today 展示 Overdue、Today、Upcoming、Inbox 与 Completed Today，支持 Workspace 筛选、Quick Capture、完成与重开。
- Tasks 支持日期视图、Workspace、Priority、Type、标题/描述搜索，以及完成、重开、归档、恢复和删除。
- Knowledge Detail、Conversation Detail 与 Message Timeline 可显式创建带来源快照的 Task；来源删除后 Task 仍可读取。
- Conversation Context 内可直接创建、完成或重开轻量 Next Action Task；不增加 Calendar、Reminder 或 Habit。
- Search 支持 Task title、description 与 SourceRef 快照，并按 Workspace、status、priority、type 筛选。
- Provider Settings、Provider Registry 和 Analyzer Provider Contract。
- Analyzer Prompt 默认模板、结构化输出校验、运行状态、错误与可恢复重试。
- 展示 Provider、生成时间、分析模式、Message 数量与证据摘要等元数据。
- 展示 Proposal confidence、risk level 与 suggested action；旧数据使用 legacy 默认展示。
- Provider Configuration 默认目录、只读参数、enabled 状态与离线 Connection Test。
- Provider Capability Badge，以及 Proposal 和 KnowledgeCard 的生成能力快照。
- Ollama Provider Adapter，以及可编辑的本地地址、模型、超时和真实本地连接测试。
- Source 与 selected Messages 可使用已启用并选中的 Ollama；非法输出不会写入 Proposal。
- Dashboard 横向显示最近 8 条 Conversation，并提供原文或首条 Message 摘要。
- Knowledge Detail 解释 Active / Archived，推荐 Archive，并将永久删除放入二次确认的 Danger Zone。

Settings 当前只展示可运行的 Demo 与本地 Ollama，不接入任何云 Provider。Ollama 默认关闭，且必须启用并 Test Success 后才能设为当前 Provider；Demo 始终可作为默认回退。

Task 搜索结果会打开带标题查询的 `/tasks`；当前不是按 Task ID 精确定位，同名 Task 可能同时出现。Search URL 恢复 `q`、`type`、`workspaceId`，Task status、priority、type 暂不持久化。

## 使用本地 Ollama

1. 在本机安装 Ollama。
2. 运行 `ollama serve` 启动本地服务。
3. 拉取 Settings 中配置的模型；默认模型可运行 `ollama pull qwen3:8b`。
4. 打开 `/settings`，核对 `baseUrl`、`model` 和 `timeout`，启用 Ollama 并执行 Test Connection。
5. 选择 Ollama 为当前 Provider 后，再从 Analysis 或 Conversation 发起分析。

连接失败时，请依次检查 Ollama 是否已启动、`baseUrl` 是否正确、配置的 `model` 是否已下载。Analysis 或 Conversation 中的 Ollama 失败会显示具体原因且不会写入 Proposal；可在 Settings 切回 Demo Provider 后重试。

## 运行项目

需要 Node.js 和 npm。建议使用当前 Node.js LTS。

```bash
npm ci
npm run dev
```

打开 [http://localhost:3000](http://localhost:3000)。生产构建与本地启动：

```bash
npm run build
npm run start
```

提交变更前运行质量检查：

```bash
npm run lint
npm run build
npm test -- --run
git diff --check
```

## 本地备份

项目提供无网络、无 sudo 的手动备份脚本。默认在项目的 `backups/` 下创建不覆盖旧内容的时间戳目录：

```bash
node scripts/backup-local-data.mjs
```

也可以把备份写入 iCloud Drive 或其它自定义目录：

```bash
node scripts/backup-local-data.mjs --target "/Users/xxx/Library/Mobile Documents/com~apple~CloudDocs/PALOS-Backups"
```

备份包含 `docs/`、README、PROJECT、ARCHITECTURE、ROADMAP、HANDOFF、CHANGELOG，以及存在时的项目内 `data/`。脚本不会读取项目外文件；浏览器业务数据请使用 Settings 的 Export App Data，外部 Asset 文件仍需自行保留。

## 主要页面

| 路径 | 用途 |
| --- | --- |
| `/` | Dashboard 与快速搜索 |
| `/import` | 粘贴/TXT/Manual Round Builder 与 ChatGPT `conversations.json` 最小导入 |
| `/conversation` | Conversation 列表与创建 |
| `/conversation/[id]` | Source 编辑、Timeline / Q&A Pair、Analyze 与 Proposal Workspace |
| `/workspace` | Workspace 创建、编辑、归档、恢复与安全删除 |
| `/today` | 日常 Task 入口、Quick Capture 与五类日期分区 |
| `/tasks` | Task 全量筛选、搜索、详情与生命周期管理 |
| `/review` | Proposal 审核 |
| `/knowledge` | Knowledge 列表、搜索、排序、状态与 Tag 筛选 |
| `/knowledge/[id]` | Knowledge 编辑、来源追溯与 Tag 关联 |
| `/tags` | Tag 管理 |
| `/search` | v0.9 本地全文/轻量模糊检索；支持 `q`、`workspaceId`、`type` URL 参数 |
| `/settings` | Analyzer Provider、Provider Configuration、Capability 与只读 Prompt Template 设置 |
| `/help` | 中文操作手册、核心概念、推荐流程与 Ollama 边界 |
| `/recipes` | 本地手动工作流模板 |
| `/feedback` | 本地反馈列表与 JSON 导出 |
| `/data-health` | 只读数据健康报告 |

## 技术与数据边界

- Next.js 16、React 19、TypeScript、Tailwind CSS 4。
- 模块化单体：`Entity → Contract ← BrowserStorage`，由 Service 编排业务，Page 负责交互。
- 页面不得直接调用 LocalStorage；所有 key、序列化和兼容逻辑集中在 `src/infrastructure/storage`。
- IndexedDB 的 7 个 canonical stores 为 `conversations`、`messages`、`rounds`、`sources`、`proposals`、`knowledge-cards`、`conversation-versions`。
- v1.7 只给现有 Conversation、Round、ConversationVersion 增加兼容可选字段；没有修改 IndexedDB schema 或新增 canonical store。
- LocalStorage 只保留 lightweight config、UI preference、storage/schema metadata、legacy migration 数据与 sidecars；其中 `current-source`、`current-proposal` 是选择指针，不是 canonical entity。
- Bulk diagnostics 默认隐藏且只保留 bounded memory buffer；设置 `NEXT_PUBLIC_PALOS_DIAGNOSTICS=1` 才显示 Copy Diagnostics 并输出 `[PALOS BULK DIAG]` console。Analyzer failure injection 使用独立的 `NEXT_PUBLIC_PALOS_ANALYZER_DIAGNOSTICS=1`。
- 当前没有账号、云同步、服务端数据库、云端 AI 调用或多人协作；唯一真实模型调用是用户显式启用的本地 Ollama。
- Ollama 仅使用非流式本地 HTTP；项目不负责安装、启动或下载模型，也不实现 streaming、RAG、embedding 或数据库。
- 清除浏览器站点数据会删除本地内容；Settings 提供 PALOS App Data export/import，但外部 Asset 文件仍需用户自行备份。

## 明确未实现 / Backlog

- ChatGPT share-link import，以及从 share link 更新已有 Conversation。
- mobile / PWA、cloud or multi-device sync、multi-user / family sharing。
- attachment、voice、canvas、tool nodes 的完整导入。
- ChatGPT import transaction fan-out optimization。
- advanced cross-source semantic dedup。
- AI / RAG / Embedding、云 Provider 与自动接受 Proposal。

更详细的产品边界见 [PROJECT.md](./PROJECT.md)，分层与数据流见 [ARCHITECTURE.md](./ARCHITECTURE.md)，后续计划见 [ROADMAP.md](./ROADMAP.md)。

当前工程统计见 [Project Status](./docs/project-status.md)，本版本变更与限制见 [Release v0.9 Draft](./docs/releases/v0.9-draft.md)。

架构图与决策记录见 [Architecture Diagram](./docs/architecture/architecture-diagram.md)、[RFC-004](./docs/rfc/RFC-004-data-and-search-foundation.md)、[RFC-005](./docs/rfc/RFC-005-conversation-round-model.md)、[RFC-006](./docs/rfc/RFC-006-import-parser-contract.md)、[RFC-007](./docs/rfc/RFC-007-search-result-contract.md)、[RFC-008](./docs/rfc/RFC-008-proposal-review-knowledge-lifecycle.md)、[ADR-001](./docs/adr/ADR-001-localstorage-first.md)、[ADR-002](./docs/adr/ADR-002-human-review-required.md)、[ADR-003](./docs/adr/ADR-003-local-asset-library.md) 与 [ADR-004](./docs/adr/ADR-004-conversation-remains-aggregate-root.md)。RFC-005–008 与 ADR-004 已形成当前 v1.x domain baseline；历史 ADR-001 不再代表 v1.6.x 的默认 business storage。

手工验收步骤见 [Manual QA Checklist](./docs/QA_CHECKLIST.md)。

## License

MIT
