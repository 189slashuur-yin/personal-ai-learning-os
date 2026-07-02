# Changelog

本文件记录当前仓库已经完成的 Sprint 与关键提交。日期使用仓库 commit date。

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
