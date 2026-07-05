# Domain Model

## v1.0 Phase0 freeze candidate

本节在人工批准后取代旧的顶层关系；当前 v0.9 runtime 仍使用下方 implemented addendum。Phase0 没有运行时修改。

```mermaid
flowchart LR
  W[Workspace] -->|places| C[Conversation AR]
  C -->|owns| S[ImportedSource segment]
  C -->|owns| R[Round]
  R -->|groups/owns| M[Message]
  C -->|owns| V[ConversationVersion]

  I[ImportArtifact] --> Parser[Versioned Parser]
  Parser --> Preview[ImportPreview]
  Preview -->|explicit confirm| Receipt[ImportReceipt]
  Receipt -. references .-> C

  Provider[Provider] --> Run[AnalyzerRun]
  S --> Run
  R --> Run
  M --> Run
  Run --> P[Proposal AR]
  P --> Review[ReviewDecision]
  Review -->|accepted + apply| K[Knowledge AR]
  K --> KR[KnowledgeRevision]

  P -. target + snapshot .-> R
  K -. provenance + snapshot .-> R
  Task[Task AR] -. SourceRef + snapshot .-> R
  Search[Search read model] --> C
  Search --> R
  Search --> M
  Search --> P
  Search --> K
  Search --> Task
  Search --> Asset[Asset metadata]
```

Aggregate roots are Conversation, Proposal, Knowledge, Task, Workspace and Asset metadata. Round is a stable Conversation child, not an aggregate root. ImportReceipt is an immutable application/audit record. SearchDocument/SearchResult, Question and Answer are projections. Session is intentionally absent.

Target invariants and compatibility are defined in RFC-005–008 and ADR-004. Until human approval, this is a candidate rather than implementation authority.

## v0.9 implemented addendum

`Task` 已实现但在 v0.9 降低主流程优先级。v0.9 新增 `Asset` metadata 实体和运行时 `SearchDocument` 读模型：Asset 可引用 Conversation、KnowledgeCard、Task 或 Workspace，但不拥有文件内容；SearchDocument 从 canonical collections 派生，不持久化、不修改源实体。Q&A Pair 仍从 Messages 派生。

```mermaid
flowchart LR
  C[Conversation] --> N[Conversation Note]
  C --> A[Asset metadata]
  K[KnowledgeCard] -. owner reference .-> A
  TK[Task] -. owner reference .-> A
  W[Workspace] -. owner reference .-> A
  W --> SD[SearchDocument runtime read model]
  C --> SD
  S[Source] --> SD
  M[Message / Q&A Pair] --> SD
  P[Proposal] --> SD
  K --> SD
  TK --> SD
  T[Tag] --> SD
```

## Status and notation

This model is the Architecture Pack v1 baseline for Epic D. Solid nodes are implemented in v0.6 unless marked otherwise; `Task` and `Activity` are planned, while `Memory` and `Agent` are future concepts without an implementation commitment.

```mermaid
flowchart LR
  W[Workspace]
  C[Conversation]
  S[Source]
  M[Message]
  V[ConversationVersion]
  AR[AnalyzerRun]
  P[Proposal]
  R[Review]
  K[KnowledgeCard]
  T[Tag]
  PR[Provider]
  SE[Search]
  TK[Task - planned]
  AC[Activity - planned]
  MM[Memory - future]
  AG[Agent - future]

  W -->|places| C
  C -->|owns context| S
  C -->|owns timeline| M
  C -->|has snapshots| V
  S -->|input| AR
  M -->|selected input| AR
  PR -->|executes| AR
  AR -->|produces| P
  P -->|requires| R
  R -->|accepted creates| K
  K <-->|classified by| T

  W -.->|places| TK
  TK -.->|optional SourceRef| C
  TK -.->|optional SourceRef| K
  AC -.->|records facts about| TK

  SE -->|reads| W
  SE -->|reads| C
  SE -->|reads| P
  SE -->|reads| K
  SE -->|reads| T
  SE -.->|may read when implemented| TK

  K -. future input .-> MM
  AC -. future input .-> MM
  MM -. future context .-> AG
```

The arrows describe allowed relationships, not ownership by the target. In particular, Search reads other domains without owning them; Provider executes analysis without deciding business state; Activity records facts without becoming the Task status source of truth.

## Domain glossary

| Domain / entity | Role |
| --- | --- |
| Workspace | Single-level placement for Conversation and planned Task; Inbox is the safe fallback. |
| Conversation | User-owned conversation context and aggregate entry point. |
| Source | Preserved raw imported material associated with a Conversation when available. |
| Message | Ordered, selectable conversation unit parsed from Source or edited by the user. |
| ConversationVersion | Append-only snapshot of Conversation and Messages for explicit restore. |
| AnalyzerRun | Execution record for one analysis attempt, including input, Provider, status, and error. |
| Proposal | Traceable Analyzer output awaiting human review. |
| Review | Human decision boundary that accepts or rejects a Proposal. |
| KnowledgeCard | Editable knowledge snapshot created only from an accepted Proposal. |
| Tag | Reusable classification associated with KnowledgeCard. |
| Provider | Replaceable analysis capability; Demo is default and Ollama is optional/local. |
| Search | Read model over existing collections; it owns no source entity or index today. |
| Task | Independent implemented action aggregate with optional source snapshot and Workspace placement. |
| Activity (planned) | Append-only record of meaningful user/domain events; not immediate Epic D scope. |
| Memory (future) | Unapproved future context/retention capability, pending separate RFC and privacy model. |
| Agent (future) | Unapproved future actor capability, pending explicit authority and safety design. |

## Aggregate and reference rules

- Conversation owns its live Source, Messages, and ConversationVersions under existing use cases; Proposal and Knowledge keep evidence/provenance snapshots where defined.
- KnowledgeCard is not a Task container. Linking it to a Task does not transfer ownership in either direction.
- Task is independently deletable and completable. Conversation or Knowledge deletion leaves its SourceRef in a valid missing-target state displayed as `deleted`.
- Workspace deletion rehomes both Conversation and planned Task placement to Inbox according to each domain service; it does not delete their content.
- Activity, when designed, observes completed business transitions. Replaying Activity is not the source of current Task or Knowledge state in the planned local-first model.

## Evolution boundary

Epic D phase one implements only Task. Activity remains planned, and Memory/Agent remain future. Calendar, reminder, recurrence, RAG, and autonomous action are not implied by this model.
