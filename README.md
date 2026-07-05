# Personal AI Learning OS

Personal AI Learning OS 是一个本地优先的个人学习与知识整理工作区。它把聊天记录或 TXT 文本保留为可追溯来源，将内容整理成待审核的 Proposal，再由用户确认并沉淀为 KnowledgeCard。

## Project Status

- Current Version：v1.0 alpha draft
- Current Phase：v1.0 Phase2 — Second Brain Workspace
- Current Focus：Epic M–AB 已实现并通过自动门禁；alpha 人工 QA 待执行
- Next Recommended Phase：执行 `docs/qa/V10-MANUAL-QA-PLAN.md`，解决 Release Review 中的人工验收阻塞项

### Feature Matrix

| Feature | Status | Notes |
| --- | --- | --- |
| Conversation | ✅ | 创建、编辑、复制、删除、Message Timeline 与 Q&A Pair 派生视图。 |
| Round | ✅ alpha | 持久化 Round、旧 Message 预检迁移、Round-first UI 与合并/拆分/排序/绑定。 |
| Help | ✅ | 内置中文概念说明、推荐流程与 Ollama 使用边界。 |
| Workspace | ✅ alpha | Workspace / Folder 多层树、排序、移动与安全回迁 Inbox/上级。 |
| Search | ✅ | 九类 SearchDocument 的本地全文、片段定位与轻量模糊搜索。 |
| Conversation Note | ✅ | Conversation 独立备注，可全文搜索。 |
| Assets | ✅ | Conversation 可登记本地文件 metadata/path；不保存文件内容。 |
| Backup | ✅ | 文档与项目内 data/ 的时间戳目录备份脚本。 |
| Knowledge | ✅ | Review 后生成、编辑、归档与来源追溯。 |
| Provider | ✅ | Demo Provider 与可选本地 Ollama；云 Provider 未启用。 |
| Version | ✅ | Conversation History、版本记录与恢复点。 |
| Import | ✅ alpha | Paste/TXT/Manual Round Builder，以及 ChatGPT `conversations.json` 最小导入、增量与去重。 |
| Export / Restore | ✅ alpha | PALOS App Data 预览/分类导入、失败回滚，以及 Conversation/Round/Knowledge/Workspace 导出。 |
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
Import / Conversation
        ↓
Source → Messages → Rounds
        ↓
Q&A Pair → Analyze → Proposal → Review
        ↓
KnowledgeCard + Tags
```

v0.9 draft 在 v0.8 基线上增加统一 SearchDocument、具体文本片段检索、轻量 fuzzy、Conversation Note、Asset metadata、备份脚本和 Data Management 说明。结构化数据仍保存在 LocalStorage 中，不引入数据库、RAG 或云同步。

v1.0 Phase2 已把 Phase1 的 Conversation/Round 基线扩展为 Second Brain Workspace：Conversation 是长对话线程，Round 是最小整理单位，Knowledge 是已确认知识，Proposal 是 AI 整理建议，Workspace/Folder 提供多层组织。ChatGPT 导入仅支持官方 Export zip 解压后的 `conversations.json` 文本消息；重复导入按 external ID、缺失时按 content hash 增量去重，不自动覆盖旧 Rounds。

## 当前功能

- 导入 TXT，保存原始 Source，并从 Source 生成 Proposal。
- 直接粘贴 ChatGPT、Claude、DeepSeek、Gemini 或普通对话文本，创建 Conversation 与可追溯 Source。
- Clipboard Import 使用六种 Import Profile 做纯文本角色预处理，自动建议标题并在导入前展示 Message 解析预览。
- 导入结果展示来源、Message / Unknown 数量；Conversation Detail 保留 Import Profile 信息。
- 按中英文发言标记解析 Messages，保护三反引号代码块，并从选中 Messages 进入现有 Analyzer / Review / Knowledge 流程。
- 创建、重命名、编辑、自动保存、复制和级联删除 Conversation。
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

备份包含 `docs/`、README、PROJECT、ARCHITECTURE、ROADMAP、HANDOFF、CHANGELOG，以及存在时的项目内 `data/`。脚本不会读取项目外文件；浏览器 LocalStorage 请使用 Settings 的 Export App Data，外部 Asset 文件仍需自行保留。

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
- 当前没有账号、云同步、服务端数据库、云端 AI 调用或多人协作；唯一真实模型调用是用户显式启用的本地 Ollama。
- Ollama 仅使用非流式本地 HTTP；项目不负责安装、启动或下载模型，也不实现 streaming、RAG、embedding 或数据库。
- 清除浏览器站点数据会删除本地内容；当前尚无正式备份恢复流程。

更详细的产品边界见 [PROJECT.md](./PROJECT.md)，分层与数据流见 [ARCHITECTURE.md](./ARCHITECTURE.md)，后续计划见 [ROADMAP.md](./ROADMAP.md)。

当前工程统计见 [Project Status](./docs/project-status.md)，本版本变更与限制见 [Release v0.9 Draft](./docs/releases/v0.9-draft.md)。

架构图与决策记录见 [Architecture Diagram](./docs/architecture/architecture-diagram.md)、[RFC-004](./docs/rfc/RFC-004-data-and-search-foundation.md)、[RFC-005](./docs/rfc/RFC-005-conversation-round-model.md)、[RFC-006](./docs/rfc/RFC-006-import-parser-contract.md)、[RFC-007](./docs/rfc/RFC-007-search-result-contract.md)、[RFC-008](./docs/rfc/RFC-008-proposal-review-knowledge-lifecycle.md)、[ADR-001](./docs/adr/ADR-001-localstorage-first.md)、[ADR-002](./docs/adr/ADR-002-human-review-required.md)、[ADR-003](./docs/adr/ADR-003-local-asset-library.md) 与 [ADR-004](./docs/adr/ADR-004-conversation-remains-aggregate-root.md)。RFC-005–008 与 ADR-004 当前均为 approval-pending candidate。

手工验收步骤见 [Manual QA Checklist](./docs/QA_CHECKLIST.md)。

## License

MIT
