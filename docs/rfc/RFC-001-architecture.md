# RFC-001: Core Knowledge Architecture

## Status

Accepted for the current local-first architecture.

## Core flow

```text
Conversation → Source / Message → AnalyzerRun → Proposal → Review → KnowledgeCard
```

Conversation 保存学习上下文；Source 保留原始材料，Message 保存可选择的对话单元。AnalyzerRun 记录一次分析的输入、Provider、状态和错误。成功结果只能写为 Proposal，用户在 Review 中接受后，才可由 Service 创建 KnowledgeCard。

## Decisions

- Entity 只描述领域数据；Contract 描述 Core 所需能力。
- BrowserStorage 集中处理 LocalStorage key、序列化和旧数据兼容。
- Service 编排跨实体规则；Page 负责路由、表单和组合依赖。
- Proposal 保存来源证据与生成元数据。
- KnowledgeCard 保存接受时快照，后续来源变化不得静默改写历史知识。
- Analyzer 不得直接创建 KnowledgeCard，也不得自动接受 Proposal。

## Consequences

链路比直接生成知识多一个审核步骤，但能保留来源、失败记录和人工判断。未来替换 Storage 或 Analyzer 时，应实现既有 Contract，而不是让 Page 依赖数据库或 Provider 细节。
