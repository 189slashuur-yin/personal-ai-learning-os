# Changelog

本文件记录当前仓库已经完成的 Sprint 与关键提交。日期使用仓库 commit date。

## 2026-07-03 — Sprint11: Clipboard Import Profiles / Preview / QA

状态：已完成，未创建 Git commit。

- 增加 ImportProfile Entity、ImportProfileService 与六种默认纯文本导入 Profile。
- Clipboard Import 按来源别名解析 Messages，自动建议可编辑标题，并展示角色统计与前三条预览。
- Unknown 比例超过一半时显示保留原文提示；不解析平台 JSON 导出文件。
- 导入成功后展示标题、来源、Message / Unknown 数量与 Conversation 入口。
- Conversation Detail 展示 Import Profile，Dashboard Recent Imports 明确展示 sourceType 与 message count。

## 2026-07-03 — Sprint10: Clipboard Import Engine

状态：已完成，未创建 Git commit。

- Import 页面增加 Clipboard Import，同时保留现有 TXT 导入。
- 支持 Conversation 标题、ChatGPT / Claude / DeepSeek / Gemini / Manual / Plain Text 来源、字符与行数统计及原文预览。
- Conversation Parser 扩展中英文发言标记、冒号与代码块保护；无法识别时完整保留为 Unknown Message。
- Clipboard Conversation 可从 Messages 进入既有 Demo / Ollama Analyzer、Validator、Retry、Review 与 KnowledgeCard 流程。
- Dashboard 增加 Recent Imports，并补充 Conversation 与详情统计。

## 2026-07-03 — Sprint9 Stabilization

状态：已完成，未创建 Git commit。

- Settings 增加 Ollama 安装、`ollama serve` 与模型拉取说明。
- Ollama Connection Test 失败时统一提示检查服务状态、baseUrl 和已下载模型。
- Analysis 与 Conversation 的 Ollama 失败界面显示具体原因，明确不写入 Proposal，并提示切回 Demo Provider。
- 更新用户与工程文档；未新增云 Provider、streaming、RAG、embedding 或数据库。

## 2026-07-02 — Sprint9: Local Ollama Provider

状态：已完成，尚未创建 Git commit。

- 增加 OllamaProvider，通过本地 `/api/chat` 非流式分析 Source 或 selected Messages。
- Settings 支持 Ollama enabled、baseUrl、model、timeout 与真实 `/api/tags` Connection Test。
- Ollama 输出复用 Sprint7 PromptTemplate 和 AnalyzerOutputValidator；失败不写 Proposal。
- Demo Provider 保持默认回退；未接入云 Provider、API Key、数据库、streaming、embedding 或 tool calling。

## 2026-07-02 — Sprint8: Provider Configuration / Test / Capability

状态：已完成，尚未创建 Git commit。

- 增加 ProviderConfiguration、ProviderCapability、Contract、BrowserStorage 与 Service。
- Settings 展示七个默认配置，只有 enabled 可编辑；不启用真实 Analyzer。
- 增加完全离线的 Test Connection，并在 Dashboard 展示最近结果。
- Proposal 保存生成能力，Review 展示能力，KnowledgeCard 保存能力快照。

## 2026-07-02 — Sprint7: Analyzer Templates / Schema / Safety

状态：已完成，尚未创建 Git commit。

- 增加 Source / Messages Analyzer Prompt Template、Contract、BrowserStorage、Service 与 Settings 只读展示。
- 增加结构化输出类型和 Validator；Demo Provider 校验通过后才转换为 Proposal。
- Proposal 增加 confidence、risk level、suggested action，并兼容 Sprint1–6 旧数据。
- 增加 AnalyzerError、AnalyzerRun、运行存储、失败隔离、模拟错误与按原来源 Retry。
- Provider 不可用、模板缺失或 Validator 失败时禁止写入 ProposalStorage。

## 2026-07-02 — Sprint6: AI Provider Interface / Settings / Metadata

状态：已完成。

- 增加 `AIProvider` Entity、`AnalyzerProvider` Contract、Demo Provider、Provider Registry 与 Provider Service。
- 增加 Provider Settings 和当前 Provider 的 BrowserStorage。
- Proposal 与 KnowledgeCard 保留 Provider、生成时间、分析模式、Message 数量和来源证据元数据。
- OpenAI、Claude、Ollama、Custom 仍为禁用占位，无真实 AI 调用。

关键提交：

- `b643c1f` — `feat: add demo provider settings`
- `56cf44e` — `feat: improve analyzer provider metadata`

## 2026-07-02 — Sprint5: Tag System / Knowledge Quality

状态：已完成。

- 增加 Tag Entity、Contract、BrowserStorage 与管理服务。
- 增加 Tag 管理页、KnowledgeCard 关联和 Tag 筛选。
- 稳定 Proposal 状态与多 Proposal 存储行为。
- 增加 Knowledge 来源 Message 快照与缺失引用提示。

关键提交：

- `2e463c9` — `feat: stabilize proposals and add tags`

## 2026-07-02 — Sprint4: Message Engine / Proposal Workspace

状态：已完成。

- 将 Conversation 原始文本解析为有序 Message。
- 支持多选 Messages 并生成可追溯 Proposal。
- 增加 Conversation 内 Proposal Workspace、详情、Review 入口与删除。

关键提交：

- `f66f2b2` — `feat: generate proposal from selected messages`
- `60745be` — `feat: add conversation proposal workspace`

## 2026-07-02 — Sprint3: Search / Dashboard / Project Engineering

状态：已完成。

- 完成 Dashboard、本地统计、Knowledge 工作区和全局搜索体验。
- 整理项目与架构文档，清理重复文件。

关键提交：

- `0d1cece` — `docs: project engineering for Sprint3`
- `8a7592a` — `chore: clean up Sprint3 duplicate files`

## 2026-07-02 — Sprint2: Conversation Workspace

状态：已完成。

- 增加 Conversation 创建、列表、详情、编辑、自动保存、复制和级联删除。
- 将 Source、Proposal 和 Knowledge 组织进持续工作的 Conversation 上下文。

关键提交：

- `96d61ab` — `feat: add conversation workspace`

## 2026-07-01 — Sprint1: Import → Proposal → Review → KnowledgeCard

状态：已完成。

- 初始化 Next.js 项目与领域/存储分层。
- 增加 TXT 导入、Demo Analyzer、Proposal Review 和首张 KnowledgeCard。

关键提交：

- `c76c8b1` — `feat: initialize Sprint 1 foundation`
- `6392f9d` — `feat: implement demo analyzer`
- `8777731` — `feat: implement proposal review`
- `6985cab` — `feat: create first knowledge card`
