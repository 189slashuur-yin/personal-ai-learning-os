# Personal AI Learning OS

Personal AI Learning OS 是一个本地优先的个人学习与知识整理工作区。它把聊天记录或 TXT 文本保留为可追溯来源，将内容整理成待审核的 Proposal，再由用户确认并沉淀为 KnowledgeCard。

```text
Import / Conversation
        ↓
Source → Messages
        ↓
Proposal → Review
        ↓
KnowledgeCard + Tags
```

当前是完成 Sprint7 的浏览器端 MVP：数据保存在当前浏览器的 LocalStorage 中，不需要数据库，也不会调用外部 AI API。内置 Demo Provider 使用确定性的本地逻辑，适合验证产品流程，不代表真实 AI 分析质量。

## 当前功能

- 导入 TXT，保存原始 Source，并从 Source 生成 Proposal。
- 创建、重命名、编辑、自动保存、复制和级联删除 Conversation。
- 将原始文本解析为 Message 时间线，选择多条 Message 生成 Proposal。
- 在 Conversation 内查看多个 Proposal、来源证据、状态和分析元数据。
- Review Proposal，并在接受后创建可追溯的 KnowledgeCard。
- 浏览、搜索、编辑、归档、删除 KnowledgeCard，并检查来源完整性。
- 创建、编辑和删除 Tag；给 KnowledgeCard 添加 Tag，并按 Tag 筛选。
- Dashboard 统计与 Conversation、Proposal、Knowledge 的全局搜索。
- Provider Settings、Provider Registry 和 Analyzer Provider Contract。
- Analyzer Prompt 默认模板、结构化输出校验、运行状态、错误与可恢复重试。
- 展示 Provider、生成时间、分析模式、Message 数量与证据摘要等元数据。
- 展示 Proposal confidence、risk level 与 suggested action；旧数据使用 legacy 默认展示。

真实 OpenAI、Claude、Ollama 和 Custom Provider 目前仅显示为 `Coming Soon`，不可选择。

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
| `/import` | TXT 导入 |
| `/conversation` | Conversation 列表与创建 |
| `/conversation/[id]` | Source 编辑、Message 时间线、Proposal Workspace |
| `/review` | Proposal 审核 |
| `/knowledge` | Knowledge 列表、搜索、排序、状态与 Tag 筛选 |
| `/knowledge/[id]` | Knowledge 编辑、来源追溯与 Tag 关联 |
| `/tags` | Tag 管理 |
| `/search` | 全局搜索 |
| `/settings` | Analyzer Provider 与只读 Prompt Template 设置 |

## 技术与数据边界

- Next.js 16、React 19、TypeScript、Tailwind CSS 4。
- 模块化单体：`Entity → Contract ← BrowserStorage`，由 Service 编排业务，Page 负责交互。
- 页面不得直接调用 LocalStorage；所有 key、序列化和兼容逻辑集中在 `src/infrastructure/storage`。
- 当前没有账号、云同步、服务端数据库、真实 AI 调用或多人协作。
- 清除浏览器站点数据会删除本地内容；当前尚无正式备份恢复流程。

更详细的产品边界见 [PROJECT.md](./PROJECT.md)，分层与数据流见 [ARCHITECTURE.md](./ARCHITECTURE.md)，后续计划见 [ROADMAP.md](./ROADMAP.md)。

## License

MIT
