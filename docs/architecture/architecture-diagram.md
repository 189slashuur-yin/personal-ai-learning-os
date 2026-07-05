# Architecture Diagram

## v1.0 Phase0 freeze candidate

```mermaid
flowchart TD
  W[Workspace] --> C[Conversation]
  C --> R[Round]
  R --> M[Message]
  C --> S[ImportedSource]
  C --> V[ConversationVersion]
  I[ImportArtifact] --> P0[Parser + Preview]
  P0 --> C
  S --> A[AnalyzerRun]
  R --> A
  M --> A
  A --> P[Proposal]
  P --> D[ReviewDecision]
  D --> K[Knowledge]
  K --> KR[KnowledgeRevision]
  X[Search read model] --> C
  X --> R
  X --> M
  X --> P
  X --> K
  X --> T[Task]
  X --> AS[Asset metadata]
```

Conversation remains the aggregate root; Round is a stable child. Proposal, Knowledge and Task are independent. Parser and Search are non-owning boundaries. This diagram is approval-pending and has no runtime implementation yet.

## v0.9 runtime history

Epic B 将 Workspace 引入为 Conversation 的顶层归属，但仍保持 local-first、模块化单体和人工审核边界。

```mermaid
flowchart TD
  W[Workspace] --> C[Conversation]
  C --> S[Source]
  C --> M[Message]
  C --> V[ConversationVersion]
  S --> A[AnalyzerRun]
  M --> A
  A --> P[Proposal]
  P --> R[Review]
  R --> K[KnowledgeCard]
  K --> T[Tag]
  W --> X[Search 2.0]
  C --> X
  P --> X
  K --> X
  T --> X
  X -. future .-> MM[Memory]
  MM -. future .-> AG[Agent]
```

当前只实现到 Workspace、Conversation、Knowledge Editing 相关的 Phase2 能力。Memory 与 Agent 仅用于表达未来方向，不是当前实现范围；同样不引入 Workspace 树形层级、数据库、权限或云同步。
