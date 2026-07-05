# RFC-005: Conversation and Round Model

## Status

Proposed for v1.0 Phase0 architecture freeze. Human approval required before implementation.

## Decision summary

- Conversation represents one logical dialogue thread.
- Conversation remains the aggregate root.
- Round is a stable child entity inside Conversation, not a new aggregate root.
- Message remains the canonical raw utterance and belongs to exactly one Round.
- Question and Answer are projections over Messages, not persisted entities.
- Proposal and Knowledge are independent aggregates that reference Round and retain evidence snapshots.
- Session is not introduced in v1.0.

## Conversation definition

A Conversation is one ordered, user-recognizable dialogue thread whose Messages share continuity and can be read as one transcript. It may originate from:

- one native ChatGPT or Claude chat;
- one Markdown/TXT transcript interpreted as a dialogue;
- a Clipboard paste;
- a manually created dialogue.

A Conversation is **not**:

- an import attempt or file—the Import workflow may create one or many Conversations;
- a topic or project—Workspace and Tags provide that organization;
- an arbitrary collection of unrelated chats;
- a Provider session or network connection;
- Knowledge—the reviewed interpretation has an independent lifecycle.

When a GPT/Claude export contains multiple chats, each source chat becomes a separate Conversation. They may share one ImportReceipt. Appending content is allowed only when the user explicitly chooses an existing Conversation and the preview shows the resulting new Rounds.

## Round definition

A Round is one stable interaction unit within a Conversation. It groups contiguous Messages that belong to the same question/response context.

Conceptual shape:

```text
Round
  id
  conversationId
  ordinal
  kind: answered | unanswered | orphan-assistant | context
  createdAt
  updatedAt

Message
  id
  conversationId
  roundId
  role
  content
  order
  createdAt
  updatedAt
```

Round does not duplicate `messageIds`; Message `roundId` is the membership source of truth. `ordinal` orders Rounds inside a Conversation, while Message `order` preserves the complete transcript order.

### Grouping rules

The deterministic v1 grouping rule is:

1. Sort Messages by `order`, then timestamp and ID as deterministic tie-breakers.
2. A `user` or `unknown` Message starts a new Round.
3. Following contiguous `assistant` Messages join that Round until another initiating Message appears.
4. Assistant Messages without a preceding initiating Message form an `orphan-assistant` Round.
5. Contiguous `system` Messages form a `context` Round; they are not silently converted into a user question.
6. A Round with an initiating Message and no assistant response is `unanswered`; with both it is `answered`.

These rules are defaults for migration and parser output. Later user-facing split/merge actions may be implemented without changing the domain: they mutate Round membership through a Conversation use case and preserve Message content/identity.

## Question and Answer

Question and Answer are named projections for reading and search:

- Question = ordered `user`/`unknown` content in a Round.
- Answer = ordered `assistant` content in a Round.
- Context = ordered `system` content in a context Round.

They are not entities, do not have independent storage, and do not own Proposal or Knowledge. The current Q&A Pair model becomes a compatibility projection over Round during migration and is not part of the final canonical model.

## Aggregate decision

Round is not an aggregate root because:

- it cannot exist without a Conversation;
- its ordering and Message membership must be validated against sibling Rounds;
- Conversation copy, delete, import append, and restore must update all affected Rounds atomically at the use-case level;
- making Round independently deletable would create ambiguity about transcript continuity and ownership.

Round still has a stable ID so Search, Proposal, Knowledge provenance, Task SourceRef and URL anchors can target it. Stable identity does not imply aggregate-root status or a separate product workspace.

All Round/Message mutations go through a Conversation/Round service using Contracts. Page and Component code must not patch membership directly.

## Relationships

### Proposal

A Proposal is generated from an explicit `AnalysisTarget`:

- a Conversation;
- one Round;
- selected Messages within one Conversation;
- an ImportedSource segment.

The Proposal stores the target reference plus immutable evidence snapshots. It is not owned by the source. Deleting the Conversation degrades the live reference but does not delete the Proposal by default.

### Knowledge

Knowledge is never owned by Round. Applying an accepted Proposal creates Knowledge or a KnowledgeRevision with provenance entries that may reference Conversation, Round and Message IDs and must include readable evidence snapshots. Knowledge remains readable if live sources later disappear.

### Task

Task remains independent. A SourceRef may target a Round or Message and keeps title/summary snapshots. Conversation deletion does not cascade into Task.

### Search

Round is the stable semantic search unit. Raw Message remains separately searchable for exact evidence. Search results use Round ID and optional Message ID as anchors; Search does not own either record.

### Asset

Asset metadata may reference a Conversation or Round when that owner type is explicitly supported by the Asset contract. Deleting metadata never deletes external file bytes. Conversation deletion may remove metadata owned by its child Rounds only after impact confirmation and through the Conversation use case.

## Session decision

No Session entity is needed in v1.0.

- One logical provider chat maps to Conversation.
- One project/topic maps to Workspace, not Session.
- One import execution maps to ImportReceipt, not Session.
- One interaction maps to Round.

Adding Session would duplicate Conversation identity without a separate lifecycle or invariant. If a future product needs multiple live encounters inside one long-running case, it must first demonstrate a lifecycle that cannot be represented by Workspace → Conversation → Round and requires a new RFC after v1.x.

## Copy, delete and restore

- Copy Conversation: create new Conversation, Round and Message IDs and remap all child references; do not copy ConversationVersion history. Proposal/Knowledge are not copied automatically.
- Delete Conversation: delete owned Source segments, Rounds, Messages, Versions, Note and owner-scoped Asset metadata. Proposal, Knowledge, Task and ImportReceipt remain with degraded references and snapshots.
- Privacy erasure: a separate destructive use case may include derived artifacts, but must preview every affected aggregate and require explicit confirmation.
- Restore ConversationVersion: historical snapshot remains immutable. Restored Messages receive current live IDs as today; the restore use case deterministically creates corresponding live Rounds and updates only the restored Conversation aggregate.

## Compatibility

Legacy Messages without `roundId` are valid until the approved migration completes. Reads must not silently write. Q&A Pair remains available as a derived compatibility view while legacy data is present. RFC-005 does not authorize changing storage, running migration, or modifying runtime code.

## Non-goals

- Session
- Round as project/workspace
- Persisted Question or Answer entities
- Round-owned Proposal, Knowledge or Task
- Automatic AI split/merge or automatic Proposal acceptance
- Cross-Conversation Round
- Database, RAG, embedding, Agent, Calendar, Reminder or cloud sync
