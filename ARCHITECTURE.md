# AI Learning OS Architecture

## 1. 架构目标

AI Learning OS 是一个 local-first 的个人学习工作区。它把原始对话或文本保存为 Source，经由确定性的分析流程生成 Proposal，再由用户确认并沉淀为 KnowledgeCard。

当前版本的核心目标是：保持业务模型清晰、让数据只存于当前浏览器，并为未来接入 AI、数据库和插件留下可替换边界。

## 2. 总体结构

```text
┌──────────────────────────────────────────────────────────────┐
│ App                                                          │
│ Next.js App Router、根布局、全局样式、导航与运行时入口       │
│ src/app/layout.tsx · src/app/globals.css                     │
└──────────────────────────────┬───────────────────────────────┘
                               ↓
┌──────────────────────────────────────────────────────────────┐
│ Pages                                                        │
│ Dashboard · Import · Conversation · Analysis · Review        │
│ Knowledge · Search                                           │
│ 负责交互、路由、展示，以及把用户操作交给 Service/Storage     │
└──────────────────────────────┬───────────────────────────────┘
                               ↓
┌──────────────────────────────────────────────────────────────┐
│ Service                                                      │
│ Demo Analyzer · Proposal Review · Knowledge Creation         │
│ Conversation Workspace · Global Search · Text Statistics     │
│ 负责用例编排、转换、搜索和跨实体规则                         │
└──────────────────────────────┬───────────────────────────────┘
                               ↓
┌──────────────────────────────────────────────────────────────┐
│ Storage                                                      │
│ Core Contracts                 Infrastructure Adapters        │
│ ConversationStorage      ←→    BrowserConversationStorage     │
│ SourceStorage            ←→    BrowserSourceStorage           │
│ ProposalStorage          ←→    BrowserProposalStorage         │
│ KnowledgeCardStorage     ←→    BrowserKnowledgeCardStorage    │
│ 负责持久化边界、序列化、查询和数据兼容                       │
└──────────────────────────────┬───────────────────────────────┘
                               ↓
┌──────────────────────────────────────────────────────────────┐
│ Entity                                                       │
│ Conversation · ImportedSource · Proposal · KnowledgeCard     │
│ 定义领域语言、标识、状态和实体之间的引用                     │
└──────────────────────────────────────────────────────────────┘
```

图中的箭头表示一次典型用户操作的处理方向，不代表所有源码 import 都只能单向向下。具体依赖采用了轻量的依赖倒置：Service 依赖 Entity 和 Storage Contract，浏览器实现位于 Infrastructure；业务规则不需要知道数据最终写入 LocalStorage 还是数据库。

## 3. 目录与职责

```text
src/
├── app/                         # App 与 Pages：路由、组件、交互
│   ├── conversation/            # Conversation 列表和工作区
│   ├── import/                  # 文本导入
│   ├── analysis/                # Demo Analyzer 入口和结果
│   ├── review/                  # Proposal 审核
│   ├── knowledge/               # Knowledge 列表和详情
│   └── search/                  # 全局搜索
├── core/
│   ├── entities/                # 领域实体与状态类型
│   ├── contracts/               # Storage 抽象接口
│   └── services/                # 业务用例和领域编排
└── infrastructure/
    └── storage/                 # Storage Contract 的浏览器实现
```

各层的主要约束：

- Pages 可以组织 UI 状态和调用用例，但不应复制跨实体业务规则。
- Service 接收 Entity 或 Contract，通过明确输入输出完成一个业务动作。
- Storage Adapter 负责浏览器持久化细节，不决定 Proposal 是否可接受等业务规则。
- Entity 不依赖 React、Next.js、LocalStorage 或其他基础设施。

## 4. 核心领域关系

```text
Conversation
  │ id
  │
  ├── 0..* Source
  │          conversationId → Conversation.id
  │
  │          Source
  │            │ id
  │            │
  │            └── 0..* Proposal
  │                       sourceId → Source.id
  │
  │                       Proposal
  │                         │ id
  │                         │
  │                         └── 0..1 KnowledgeCard
  │                                    proposalId → Proposal.id
  │
  └── 工作区删除/复制由 Conversation Workspace Service 统一编排
```

### Conversation

Conversation 是用户的学习工作区和聚合入口，保存标题、来源类型以及创建、更新、最近打开时间。它不直接内嵌大段原始文本；正文由 Source 独立保存。

### Source

代码中的实体名为 `ImportedSource`，领域概念简称 Source。它保存原始文本、文件名、导入时间和更新时间，并通过可选的 `conversationId` 归属 Conversation。

`conversationId` 可选是为了支持“先导入、后进入工作区”的流程。进入正式工作区后，Source 应绑定 Conversation。当前工作区服务已按一对多关系处理 Source。

### Proposal

Proposal 是从 Source 提炼出的待审核建议，通过 `sourceId` 保留可追溯关系。它包含标题、摘要、来源证据、生成方式和 `Pending / Accepted` 状态。

当前 `Demo Analyzer` 是确定性本地逻辑，不调用 AI。接受 Proposal 是显式的用户动作，不应由持久化层自动完成。

### KnowledgeCard

KnowledgeCard 是用户接受 Proposal 后形成的知识成果，通过 `proposalId` 追溯到 Proposal，并间接追溯至 Source 和 Conversation。当前 Storage 会阻止同一 Proposal 重复生成多张知识卡，因此关系为一对零或一。

KnowledgeCard 具有 `Active / Archived` 生命周期状态。它保存内容快照和来源文件名，使知识在原始 Source 后续变化时仍有独立语义。

### 生命周期与一致性

```text
创建 Conversation
        ↓
导入或编辑 Source
        ↓
Demo Analyzer 生成 Proposal（Pending）
        ↓
用户接受 Proposal（Accepted）
        ↓
创建 KnowledgeCard（Active）
```

跨实体操作由 Service 处理。例如删除 Conversation 时，`conversation-workspace` 会按 Source、Proposal、KnowledgeCard 的引用关系清理整个工作区；复制时会创建新 ID 并重建引用映射，避免副本继续指向原工作区。

LocalStorage 中的 `current-source` 和 `current-proposal` 是早期单流程页面的当前项指针，不是实体关系的唯一事实来源。集合数据与实体 ID 才是持续演进时的主数据。

## 5. 为什么当前采用 LocalStorage

LocalStorage 适合当前阶段的产品边界：

- **local-first**：个人学习内容默认留在用户自己的浏览器中。
- **零后端成本**：无需服务器、数据库、鉴权和部署额外基础设施。
- **离线可用**：数据读写不依赖网络，适合原型和单设备个人工作区。
- **迭代速度快**：可以先验证 Conversation → Proposal → Knowledge 的核心流程。
- **迁移路径清晰**：Pages 和 Service 面向 Storage Contract，后续可以增加数据库 Adapter。

这不是无限期的技术承诺。LocalStorage 容量有限、同步读写、不支持事务与复杂索引，也不能自然解决多设备同步、并发、权限、备份和团队协作。出现大规模数据、跨设备或多用户需求时，应迁移到 IndexedDB 或服务端数据库。

## 6. 为什么采用 Domain 分层

Domain 层让代码围绕产品语言组织，而不是围绕 React 组件或浏览器 API 组织。

- **统一语言**：Conversation、Source、Proposal、KnowledgeCard 在 Entity 中有唯一含义。
- **规则集中**：接受 Proposal、创建 KnowledgeCard、级联删除和复制映射放在 Service 中。
- **可测试**：纯 Service 可以使用内存版 Storage Contract 测试，无需浏览器和页面。
- **可替换**：Next.js、LocalStorage、未来数据库或 AI Provider 都是外围实现。
- **控制复杂度**：随着 Tag、Message、Version 等能力增加，规则不会散落在多个页面组件里。

当前实现是轻量 Domain 架构，不追求完整 DDD 仪式。只有产生明确业务价值的实体、契约和服务才进入 Core。

## 7. 为什么 Pages 不直接操作浏览器 Storage

页面直接调用 `window.localStorage` 看似更短，但会快速形成隐性耦合：

- 每个页面都需要知道 key、JSON 结构、默认值和兼容规则。
- 相同读写逻辑会重复，排序、去重、归一化行为容易不一致。
- Conversation 删除或复制涉及多个集合，页面内操作难以保证引用完整性。
- 服务端渲染环境没有 `window`，直接读取容易造成运行时错误。
- 更换 IndexedDB、数据库或测试用内存存储时，需要修改所有页面。
- 数据结构升级缺少统一的迁移和版本入口。

因此当前路径是：Pages 调用 Service 或 Storage Contract 的 Browser Adapter；Service 在涉及业务规则时依赖 Contract。LocalStorage 的 key 和序列化只存在于 `infrastructure/storage` 中。

## 8. 当前数据流示例

以接受一条 Proposal 为例：

```text
Review Page
    ↓ 用户点击“接受”
Proposal Review Service
    ↓ Pending → Accepted
ProposalStorage.saveCurrent(...)
    ↓
Knowledge Creation Service
    ↓ Accepted Proposal → KnowledgeCard
KnowledgeCardStorage.save(...)
    ↓
Browser Storage Adapter
    ↓ JSON serialize
LocalStorage
```

以全局搜索为例：

```text
Search Page（300ms debounce）
    ↓
Browser Storage Adapters 读取本地实体集合
    ↓
Global Search Service
    ↓ 标题 / 内容 / 来源匹配
按 Conversation / Proposal / Knowledge 分组展示
```

## 9. 未来扩展

### Tag

新增 `Tag` Entity 和实体关联表，避免直接把标签字符串复制进每个对象。Service 负责添加、移除、合并和按标签筛选；数据库阶段可使用多对多关系。

### Message

把 Source 中的整段文本解析为有顺序的 Message，记录角色、时间、内容和来源位置。Message 应从 Source 派生并保留定位信息，支持逐条引用与局部提炼。

### Search

当前搜索是浏览器内的小数据量线性匹配。未来可加入分词、相关度排序、模糊匹配、字段权重、过滤器和持久化索引；数据量增大后可替换为 IndexedDB 索引或服务端全文检索，而不改变结果领域模型。

### AI

定义 `Analyzer` 或 `AIProvider` Contract，将当前 Demo Analyzer 与真实模型实现并列。AI 输出必须先映射为 Proposal，保留模型、提示词、来源证据和生成时间；AI 不应绕过用户审核直接写入 KnowledgeCard。

### Database

新增服务端 Storage Adapter，优先保持现有 Contract 的语义。数据库需要补充用户边界、事务、级联策略、索引、备份与同步冲突处理。LocalStorage 可作为离线缓存，但不再充当跨设备事实来源。

### Version

为 Source、Proposal 和 KnowledgeCard 引入不可变 Revision 或 Version Entity。每次重要修改创建版本记录，而不是覆盖历史；支持差异对比、恢复、来源追踪以及 AI 生成结果复现。

### Plugin

定义受控的 Plugin Manifest 与扩展点，例如 Importer、Analyzer、Exporter、Search Provider 和页面动作。插件通过 Contract 交换稳定 DTO，不直接读取内部 LocalStorage key；同时需要权限声明、版本兼容和故障隔离。

## 10. 演进原则

1. Entity ID 和引用关系保持稳定，展示字段可以演进。
2. 业务规则优先进入 Service，不进入 Storage Adapter。
3. 新基础设施通过 Contract 接入，避免 Core 依赖具体 Provider。
4. 数据格式变更必须考虑旧 LocalStorage 数据的归一化或迁移。
5. AI 生成内容保持可追溯，并继续经过用户审核。
6. 先扩展现有边界；只有现有边界无法表达真实业务时才新增抽象。
