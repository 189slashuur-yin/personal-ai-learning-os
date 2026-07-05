# Domain Boundaries

## v1.0 Phase0 freeze candidate

| Domain | Responsible for | Not responsible for |
| --- | --- | --- |
| Conversation | One logical dialogue thread; Source segments, Round/Message ordering, copy/delete/restore invariants | Project/topic identity, Review, Knowledge lifecycle, Task state |
| Round | Stable interaction grouping and Question/Answer/Context projection over Messages | Aggregate-root lifecycle, Proposal/Knowledge ownership, Session |
| Import | Format detection, pure/versioned Parser, preview, diagnostics, confirmed persistence and receipt | Provider analysis, silent writes/merge, PALOS backup restore |
| Proposal / Review | Generated interpretation, evidence snapshot, immutable human decision and idempotent application | Raw transcript ownership or direct Provider mutation of Knowledge |
| Knowledge | Reviewed current content, provenance, revision history, Active/Archived lifecycle | Conversation/Round ownership, Task action state |
| Search | Typed read projection, ranking, facets, anchors and missing-reference display | Canonical storage, repair, mutation, RAG |

This table supersedes conflicting relationship statements after human approval. The detailed current/legacy boundaries below remain useful where they do not conflict.

## Boundary principles

Each domain owns its language and state transitions. Cross-domain references are explicit IDs resolved through Contracts and Services; they do not allow one domain to silently mutate another. BrowserStorage owns persistence mechanics, not business policy.

| Domain | Responsible for | Not responsible for |
| --- | --- | --- |
| Workspace | Single-level placement, Inbox fallback, archive/restore, safe rehoming on deletion. | Content ownership, nested folders, permissions, deleting Conversation/Task content. |
| Conversation | Conversation metadata, Source/Message context, explicit snapshots and restore orchestration. | Knowledge truth, Task completion, AI decisions, Workspace lifecycle. |
| Knowledge | Reviewed knowledge content, edit/archive lifecycle, provenance snapshot, Tag association. | Actions, due dates, completion, reminders, or declaring a linked Task done. |
| Task | Action text, implemented lifecycle/status, due date, Workspace placement and optional SourceRef snapshot. | Knowledge content, source lifecycle, Calendar events, reminders, automation, or autonomous execution. |
| Activity (planned) | Append-only factual record of meaningful user/domain events, with actor/time/subject metadata. | Current business state, authorization, undo, Task completion truth, analytics conclusions, or command execution. |
| Analyzer / Review | Analyzer produces traceable Proposal; Review captures explicit human acceptance/rejection. | Direct Knowledge or Task mutation by AI. |
| Provider | Analysis transport/capability, Provider metadata, execution result or error. | Business decisions, accepting Proposal, creating/completing/deleting Task, or choosing what the user should persist. |
| Search | Query normalization, read-time mapping/filtering/ranking, navigation metadata. | Owning source data, becoming the canonical store, mutating results, RAG, or inferred business state. |
| Tag | Reusable classification identity and Knowledge association. | Folder hierarchy, Task status, access control. |
| Memory (future) | Undefined until a dedicated RFC establishes data, retention, consent, and deletion semantics. | Any currently approved product behavior. |
| Agent (future) | Undefined until a dedicated RFC establishes authority, tools, confirmation, audit, and failure boundaries. | Any currently approved product behavior or implied Task automation. |

## Critical separations

### Knowledge does not own action

Knowledge answers “what has been retained and reviewed.” Task answers “what the user intends to do.” A KnowledgeCard can be archived while a linked Task stays open, and completing a Task cannot change Knowledge status. `knowledge_review` is a TaskType, not a Knowledge lifecycle state.

### Task does not own knowledge content

Task may store concise action wording and notes, but it does not duplicate or edit KnowledgeCard content. Its SourceRef is identity for traceability and navigation. If the KnowledgeCard is deleted, Task remains usable and displays the source as `deleted`.

### Activity does not own business state

Activity may record that a user completed or reopened a Task, but `Task.status` remains the current-state source of truth. Activity cannot authorize, trigger, reconstruct, or override domain transitions in the initial design.

### Provider does not make business decisions

Provider may return a Task suggestion only as unpersisted, reviewable input. It cannot call Task storage, decide completion, or bypass user confirmation. Existing Proposal → Review → Knowledge rules remain unchanged.

### Search does not own data

Search reads and maps canonical collections. Deleting or editing a search result delegates to the owning domain. Search does not create shadow copies, a second lifecycle, or a new persistent index in the current local-first architecture.

## Cross-domain operations

| Operation | Owning use case | Required result |
| --- | --- | --- |
| Delete Conversation | Conversation Workspace Service | Existing aggregate cleanup continues, but linked Task survives and resolves SourceRef as `deleted`. |
| Delete KnowledgeCard | Knowledge use case | Knowledge is removed; linked Task survives with `deleted` source display. |
| Delete Workspace | Workspace Service | Conversations and Tasks are moved to Inbox before Workspace removal. |
| Complete Task | Task Service | Task state/timestamps change; linked source does not change. |
| Suggest Task with AI | Future explicitly approved suggestion use case | User sees a draft; no Task write until explicit confirmation. |

These operations must use Contracts and Services. Page, Component, Provider, and raw BrowserStorage calls must not duplicate the orchestration policy.
