# Changelog

本文件记录当前仓库已经完成的 Sprint 与关键提交。日期使用仓库 commit date。

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
