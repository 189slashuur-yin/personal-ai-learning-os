# RFC-003: Task Domain

## Status

Accepted for Epic D architecture. This RFC freezes the domain boundary; it does not mean Task has been implemented.

## Context: why Task Domain is needed

The current product turns conversations into reviewed, traceable knowledge, but it does not represent what the user intends to do next. Putting action state on `KnowledgeCard` or `Conversation` would mix content lifecycle with execution lifecycle: completing an action must not complete, archive, or rewrite its source.

Task Domain provides a small, explicit productivity layer. A Task may stand alone or point back to knowledge or a conversation, while remaining independently editable and completable.

## Decision: use Task, not LearningTask

The entity is named `Task`. `LearningTask` would encode one current product context into a general action concept and would make later actions such as “organize this conversation” or “follow up on this source” sound incorrectly out of scope. The product remains learning-oriented, but the domain term should describe the entity's responsibility rather than the application's marketing category.

## Decision: do not create a separate KnowledgeReview entity

Reviewing knowledge is an action with a particular source and intent, not a lifecycle that needs a second aggregate. A separate `KnowledgeReview` would duplicate scheduling, completion, Workspace placement, deletion behavior, and UI rules from Task.

Knowledge review is therefore represented as `TaskType = knowledge_review` with a `SourceRef` to a `KnowledgeCard`. Completing the Task does not archive, validate, or otherwise mutate the KnowledgeCard. If knowledge-specific review history is ever required, it needs a separate RFC and evidence that Task plus Activity cannot represent it.

## Task model

The D1 implementation should preserve this conceptual shape. Exact TypeScript names may be refined without changing the semantics below.

| Field | Meaning |
| --- | --- |
| `id` | Stable Task identity. |
| `title` | User-controlled action statement. |
| `notes?` | Optional supporting text; not a copy of Knowledge content. |
| `type` | `TaskType`. |
| `status` | `open` or `completed`. |
| `scheduledDate?` | Optional local calendar date used only to derive Today / Upcoming; not a Calendar event or reminder. |
| `workspaceId` | Single Workspace placement; missing/invalid values normalize to Inbox. |
| `sourceRef?` | Optional immutable reference identity to a Conversation or KnowledgeCard. |
| `completedAt?` | Set only when the user completes the Task; cleared when reopened. |
| `createdAt` / `updatedAt` | Lifecycle timestamps. |

### TaskType

Epic D freezes two initial values:

- `action`: a general user action, with or without a source.
- `knowledge_review`: a request to revisit a KnowledgeCard; normally uses a Knowledge `SourceRef`.

TaskType describes intent. It does not control completion automatically and does not create a separate storage or UI lifecycle.

### SourceRef

`SourceRef` is an optional discriminated reference:

```text
SourceRef =
  | { type: "conversation", id: Conversation.id }
  | { type: "knowledge", id: KnowledgeCard.id }
```

The Task stores only the source type and identity needed for navigation. Source titles and content remain owned by their source domains and are resolved at read time. A missing target is a valid degraded state displayed as `deleted`; it is not repaired by inventing a source or by deleting the Task.

One Task has at most one SourceRef in Epic D. Multiple sources, Message-level sources, Proposal sources, copied source snapshots, and polymorphic arbitrary entity references are non-goals for the first phase.

## Relationships

- **Knowledge** owns knowledge content and its review-approved provenance. Task may point to a KnowledgeCard but cannot edit, archive, delete, or mark it reviewed.
- **Conversation** owns conversation context and its Source / Messages. Task may point to a Conversation but is not part of the Conversation deletion aggregate.
- **Workspace** provides Task placement. A Task belongs to one Workspace; Inbox is the safe default and compatibility fallback.
- **Task** owns action wording, scheduling date, completion state, and optional source identity. These fields are not derived from the source lifecycle.

## View semantics

Inbox, Today, Upcoming, and Completed are views over one Task collection, not Task statuses or separate entities.

| View | Inclusion rule |
| --- | --- |
| Inbox | `status = open` and no `scheduledDate`. |
| Today | `status = open` and `scheduledDate` is today or earlier in the user's local date. Including overdue Tasks prevents them from disappearing. |
| Upcoming | `status = open` and `scheduledDate` is after today, ordered by date. |
| Completed | `status = completed`, ordered by `completedAt` descending. |

Workspace is an orthogonal filter. “Back to Inbox” on Workspace deletion means setting `workspaceId` to the system Inbox; it does not clear `scheduledDate`. The Task can therefore belong to Inbox while appearing in Today or Upcoming.

## Deletion and degraded references

- Deleting a Conversation does not delete linked Tasks. Their SourceRef remains, source resolution returns missing, and UI displays `deleted` with no broken navigation.
- Deleting a KnowledgeCard does not delete linked Tasks. Their SourceRef remains and displays `deleted`.
- Deleting a Workspace does not delete its Tasks. Before removing the Workspace, the Workspace use case moves those Tasks to Inbox.
- Deleting a Task affects no Conversation, KnowledgeCard, or Workspace.

These rules intentionally differ from the current Conversation aggregate's historical cascade behavior. D1 must update the relevant Workspace/Conversation orchestration and QA atomically; Page code must not recreate these rules.

## AI boundary

AI may **suggest** a Task title, type, date, or SourceRef for the user to inspect. A suggestion is not a Task and must not be persisted as one until the user explicitly confirms creation.

AI cannot directly create, complete, reopen, reschedule, move, or delete a Task. Provider and Analyzer code cannot write Task storage. Any future AI-assisted Task flow must preserve an explicit human confirmation boundary and must receive separate scope, privacy, error-handling, and acceptance review.

## Compatibility and implementation constraints

- D1 must add a Core contract and BrowserStorage adapter; Page, Component, Service, and Provider must not access LocalStorage directly.
- Missing new fields in existing browser data require safe normalization; no migration may clear Sprint1–Sprint11 data.
- Cross-domain deletion and Workspace fallback belong in Services that depend on Contracts.
- Task is planned and must not be added to existing runtime claims until D1 is implemented and verified.

## Non-goals

- Calendar
- Reminder or notification
- Recurring Task
- Pomodoro
- Habit
- Workflow or automation engine
- Agent
- RAG

