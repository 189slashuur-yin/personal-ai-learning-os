# Personal AI Learning OS

Personal AI Learning OS 是一个本地优先的个人学习与知识整理工作区。它把聊天记录或 TXT 文本保留为可追溯来源，将内容整理成待审核的 Proposal，再由用户确认并沉淀为 KnowledgeCard。

## Project Status

- Current Version：v0.6
- Current Phase：Phase2
- Current Epic：Epic D / D2 Today & Task UI (Final Build Pending)

### Feature Matrix

| Feature | Status | Notes |
| --- | --- | --- |
| Conversation | ✅ | 创建、编辑、复制、删除与 Message Timeline。 |
| Workspace | ✅ | 单层 Workspace 与默认 Inbox。 |
| Search | ✅ | 五类实体的本地结构化搜索。 |
| Knowledge | ✅ | Review 后生成、编辑、归档与来源追溯。 |
| Provider | ✅ | Demo Provider 与可选本地 Ollama；云 Provider 未启用。 |
| Version | ✅ | Conversation Snapshot 与 Restore。 |
| Import | ✅ | TXT 与 Clipboard Import。 |
| Tag | ✅ | Tag 管理、关联与筛选。 |
| Proposal | ✅ | Source / Messages 分析、证据与生成元数据。 |
| Review | ✅ | 人工接受或拒绝 Proposal。 |
| Ollama | ✅ | 默认关闭，用户显式配置后仅访问本地服务。 |
| Task | 🟡 | Today、Quick Capture、任务筛选与生命周期操作已实现；最终 build 待复跑。 |

```text
Import / Conversation
        ↓
Source → Messages
        ↓
Proposal → Review
        ↓
KnowledgeCard + Tags
```

Release v0.6 处于 Phase2，Epic A、Epic B、Epic C Search 2.0 与 Epic D D0–D2 已完成。Conversation 与 Task 可归属单层 Workspace；Today 提供日常任务入口，Tasks 提供完整本地筛选与生命周期操作。数据仍保存在 LocalStorage 中，不需要数据库。内置 Demo Provider 使用确定性的本地逻辑；用户也可以显式启用本机 Ollama，通过本地 HTTP 生成待审核 Proposal。

## 当前功能

- 导入 TXT，保存原始 Source，并从 Source 生成 Proposal。
- 直接粘贴 ChatGPT、Claude、DeepSeek、Gemini 或普通对话文本，创建 Conversation 与可追溯 Source。
- Clipboard Import 使用六种 Import Profile 做纯文本角色预处理，自动建议标题并在导入前展示 Message 解析预览。
- 导入结果展示来源、Message / Unknown 数量；Conversation Detail 保留 Import Profile 信息。
- 按中英文发言标记解析 Messages，保护三反引号代码块，并从选中 Messages 进入现有 Analyzer / Review / Knowledge 流程。
- 创建、重命名、编辑、自动保存、复制和级联删除 Conversation。
- 将原始文本解析为 Message 时间线，选择多条 Message 生成 Proposal。
- 在 Conversation 内查看多个 Proposal、来源证据、状态和分析元数据。
- Review Proposal，并在接受后创建可追溯的 KnowledgeCard。
- 浏览、搜索、编辑、归档、删除 KnowledgeCard，并检查来源完整性。
- 创建、编辑和删除 Tag；给 KnowledgeCard 添加 Tag，并按 Tag 筛选。
- Dashboard 统计，以及 Conversation、Proposal、Knowledge、Tag、Workspace 的结构化全局搜索、分组结果与最近更新。
- 单层 Workspace、默认 Inbox、Conversation 筛选与归属切换，以及 Dashboard / Search Workspace 上下文。
- Today 展示 Overdue、Today、Upcoming、Inbox 与 Completed Today，支持 Workspace 筛选、Quick Capture、完成与重开。
- Tasks 支持日期视图、Workspace、Priority、Type、标题/描述搜索，以及完成、重开、归档、恢复和删除。
- Provider Settings、Provider Registry 和 Analyzer Provider Contract。
- Analyzer Prompt 默认模板、结构化输出校验、运行状态、错误与可恢复重试。
- 展示 Provider、生成时间、分析模式、Message 数量与证据摘要等元数据。
- 展示 Proposal confidence、risk level 与 suggested action；旧数据使用 legacy 默认展示。
- Provider Configuration 默认目录、只读参数、enabled 状态与离线 Connection Test。
- Provider Capability Badge，以及 Proposal 和 KnowledgeCard 的生成能力快照。
- Ollama Provider Adapter，以及可编辑的本地地址、模型、超时和真实本地连接测试。
- Source 与 selected Messages 可使用已启用并选中的 Ollama；非法输出不会写入 Proposal。

OpenAI、Claude、Gemini、DeepSeek 和 Azure OpenAI 只提供默认配置与能力展示，不会发起真实请求。Ollama 默认关闭，Demo Provider 始终可作为默认回退。

## 使用本地 Ollama

1. 在本机安装 Ollama。
2. 运行 `ollama serve` 启动本地服务。
3. 拉取 Settings 中配置的模型；默认模型可运行 `ollama pull qwen2.5:7b`。
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

## 主要页面

| 路径 | 用途 |
| --- | --- |
| `/` | Dashboard 与快速搜索 |
| `/import` | TXT File Import 与 Clipboard Import |
| `/conversation` | Conversation 列表与创建 |
| `/conversation/[id]` | Source 编辑、Message 时间线、Proposal Workspace |
| `/workspace` | Workspace 创建、编辑、归档、恢复与安全删除 |
| `/today` | 日常 Task 入口、Quick Capture 与五类日期分区 |
| `/tasks` | Task 全量筛选、搜索、详情与生命周期管理 |
| `/review` | Proposal 审核 |
| `/knowledge` | Knowledge 列表、搜索、排序、状态与 Tag 筛选 |
| `/knowledge/[id]` | Knowledge 编辑、来源追溯与 Tag 关联 |
| `/tags` | Tag 管理 |
| `/search` | Search 2.0 全局检索中心；支持 `q`、`workspaceId`、`type` URL 参数 |
| `/settings` | Analyzer Provider、Provider Configuration、Capability 与只读 Prompt Template 设置 |

## 技术与数据边界

- Next.js 16、React 19、TypeScript、Tailwind CSS 4。
- 模块化单体：`Entity → Contract ← BrowserStorage`，由 Service 编排业务，Page 负责交互。
- 页面不得直接调用 LocalStorage；所有 key、序列化和兼容逻辑集中在 `src/infrastructure/storage`。
- 当前没有账号、云同步、服务端数据库、云端 AI 调用或多人协作；唯一真实模型调用是用户显式启用的本地 Ollama。
- Ollama 仅使用非流式本地 HTTP；项目不负责安装、启动或下载模型，也不实现 streaming、RAG、embedding 或数据库。
- 清除浏览器站点数据会删除本地内容；当前尚无正式备份恢复流程。

更详细的产品边界见 [PROJECT.md](./PROJECT.md)，分层与数据流见 [ARCHITECTURE.md](./ARCHITECTURE.md)，后续计划见 [ROADMAP.md](./ROADMAP.md)。

当前工程统计见 [Project Status](./docs/project-status.md)，本版本变更与限制见 [Release v0.6](./docs/releases/v0.6.md)。

架构图与决策记录见 [Architecture Diagram](./docs/architecture/architecture-diagram.md)、[Product Roadmap Review](./docs/architecture/product-roadmap-review.md)、[RFC-001](./docs/rfc/RFC-001-architecture.md)、[RFC-002](./docs/rfc/RFC-002-workspace.md)、[ADR-001](./docs/adr/ADR-001-localstorage-first.md) 与 [ADR-002](./docs/adr/ADR-002-human-review-required.md)。

手工验收步骤见 [Manual QA Checklist](./docs/QA_CHECKLIST.md)。

## License

MIT
