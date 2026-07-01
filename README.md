# AI Learning OS

AI Learning OS 是一个本地优先（Local First）的 AI 学习与知识整理系统。

## 项目目标

日常使用 ChatGPT、Claude、DeepSeek 等工具时，有价值的信息往往散落在不同对话和文本文件中。随着内容增多，原始记录难以回顾，真正可复用的知识也很容易被埋没。

AI Learning OS 希望提供一个清晰、可控的整理流程：先保存完整来源，再生成可审核的整理建议，最后由用户确认并沉淀为知识卡。当前数据全部保存在浏览器本地，不依赖数据库或外部 AI 服务。

典型使用流程：

```text
Conversation
    ↓
Proposal
    ↓
KnowledgeCard
```

- **Conversation**：承载一段学习对话或导入文本的完整上下文。
- **Proposal**：从原始内容中生成、等待用户审核的整理建议。
- **KnowledgeCard**：用户接受 Proposal 后形成的可复用知识。

## 当前功能

### Sprint 1

- TXT 文件导入与本地保存
- Demo Analyzer 生成 Proposal
- Proposal Review 与接受流程
- KnowledgeCard 创建与持久化

### Sprint 2

- Conversation Workspace
- Conversation 创建、详情与原始文本管理
- Dashboard 本地数据统计
- Knowledge Workspace
- Conversation、Proposal 与 Knowledge 全局搜索

### Sprint 3

- Conversation 原始文本编辑器
- 800ms 防抖自动保存与保存状态
- 字符数、字数和最后保存时间
- Conversation 最近打开记录
- Inline Rename
- Conversation 完整复制
- Conversation 及关联数据级联删除

## 项目架构

项目采用模块化单体结构，并按职责划分为四层：

```text
src/
├── core/
│   ├── entities/        # Domain
│   ├── contracts/       # Storage contracts
│   └── services/        # Service
├── infrastructure/
│   └── storage/         # Browser Storage implementations
└── app/                 # Next.js pages and UI components
```

### Domain

定义 Conversation、ImportedSource、Proposal 和 KnowledgeCard 等核心实体。Domain 不依赖页面或浏览器存储实现。

### Storage

通过 Contract 描述数据读写能力，再由 BrowserStorage 使用 LocalStorage 实现。页面不直接操作 LocalStorage，未来更换存储方式时不需要重写领域逻辑。

### Service

封装 Demo Analyzer、Proposal 接受、KnowledgeCard 创建、Conversation 复制与级联删除等跨实体业务规则。

### App

负责路由、页面布局、用户交互和调用 Service/Storage，不承载底层持久化细节。

这种分层让业务规则、存储实现和 UI 保持独立，同时避免在当前阶段提前引入数据库或复杂基础设施。

## Roadmap

### Sprint 1 — 核心知识链路

完成 Source → Proposal → Review → KnowledgeCard 的最小闭环。

### Sprint 2 — Conversation Workspace

完成 Conversation 工作区、Dashboard、Knowledge Workspace 和本地搜索。

### Sprint 3 — Conversation Engine

完善自动保存、访问历史、重命名、复制、级联删除和 Dashboard 时间维度。

### Sprint 4 — 计划

规划更完整的内容解析与知识整理体验，并继续保持用户审核优先。

### Sprint 5 — 计划

规划可扩展的智能分析能力与长期知识工作流。

## 开发

安装依赖：

```bash
npm install
```

启动开发服务器：

```bash
npm run dev
```

运行代码检查：

```bash
npm run lint
```

运行生产构建：

```bash
npm run build
```

## 技术栈

- Next.js
- React
- TypeScript
- LocalStorage

## License

MIT
