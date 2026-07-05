# v1.0 Message to Round Migration Design

## Status

Design only. Proposed by Phase0; no migration code has been written or authorized.

## Goal

Introduce stable Round records for all existing Conversations without losing, rewriting or reinterpreting legacy Message content. The migration must preserve current IDs, timestamps, evidence snapshots, Task SourceRef snapshots and ConversationVersion history.

## Legacy and target shape

Legacy:

```text
Conversation 1 ── * Message(conversationId, order)
Q&A Pair = runtime derivation
```

Target:

```text
Conversation 1 ── * Round(conversationId, ordinal)
Round        1 ── * Message(conversationId, roundId, order)
Question/Answer = runtime projections over Round Messages
```

No existing Message is replaced. The migration adds Round records and `roundId` membership to live Messages.

## Preconditions

Implementation may start only after:

1. RFC-005 and ADR-004 receive human approval.
2. A versioned PALOS export/recovery format can capture every affected collection.
3. RoundStorage and migration capabilities are defined in Core Contracts.
4. A dry-run validator and fixed old-data fixtures exist.
5. Copy, delete, restore, import, Proposal provenance, Knowledge provenance, Task SourceRef and Search anchor behavior have automated integration coverage.

The migration service must not directly access LocalStorage. Browser-specific staging, serialization and commit markers belong behind Infrastructure contracts.

## Deterministic grouping algorithm

For each Conversation:

1. Load all live Messages with the matching `conversationId`.
2. Sort by `order`; break ties by `createdAt`, then ID.
3. Apply RFC-005 grouping rules:
   - `user`/`unknown` starts a Round;
   - contiguous `assistant` Messages join the current initiating Round;
   - assistant-without-initiator creates an orphan-assistant Round;
   - contiguous `system` Messages form a context Round.
4. Assign `ordinal` from 1 without gaps.
5. Derive a deterministic ID from the first Message identity: `round-v1-<firstMessageId>`. If malformed legacy data causes a collision, append the Conversation ID and ordinal and emit a warning.
6. Set Round `createdAt` to the earliest member timestamp and `updatedAt` to the latest valid member timestamp.
7. Add that Round ID to each member Message without changing any other Message field.

Empty Conversations create no Round. A single unrecognized/plain-text Message becomes one unanswered Round. Running the planner twice over unchanged input must produce byte-equivalent Round membership.

## Migration phases

### Phase A — Inspect and dry-run

- Detect schema version and legacy/partial Round state.
- Inventory Conversation and Message counts, invalid orders, missing Conversations, duplicate IDs and existing provenance references.
- Build the full target plan in memory.
- Validate every target invariant and present counts/warnings.
- Write nothing.

### Phase B — Recovery snapshot

- Export all affected canonical collections and migration metadata.
- Validate record counts and checksum/manifest.
- Require explicit user confirmation after showing scope and recovery location.
- If a valid recovery snapshot cannot be produced, stop.

### Phase C — Stage

- Write planned Round records and patched Message records to staging storage through Contracts.
- Do not expose staged data to normal reads.
- Record migration ID, source schema version, target schema version, parser/grouping version, counts and checksums.

### Phase D — Validate

- Every live Message has exactly one valid Round.
- Round and Message Conversation IDs agree.
- Every Conversation's Round ordinals are unique and gap-free.
- Message IDs/content/order/timestamps are unchanged.
- Proposal and Knowledge evidence snapshots are unchanged.
- Existing Message SourceRefs still resolve to the same Message IDs.
- Search can build one Round document per staged Round and one Raw Message document per Message.

### Phase E — Commit

- Swap staged Round/Message collections through the storage adapter's explicit commit operation.
- Write the schema-version/commit marker last.
- Re-read and validate committed collections before reporting success.
- Rebuild runtime SearchDocuments; no search index data is migrated.

### Phase F — Rollback or recovery

- Any failed validation before commit discards staging only.
- Any interrupted/failed commit restores the recovery snapshot and verifies its manifest.
- Startup detects an incomplete migration marker and offers recovery; it must not silently retry or clear data.
- The recovery snapshot remains user-retained until a full manual verification passes.

## Idempotency and partial legacy data

- Completed target schema plus a valid manifest: migration is a no-op.
- No Round records and all Messages lack `roundId`: normal legacy migration.
- Mixed Round membership, unknown Round IDs or mismatched Conversation IDs: classify as partial/corrupt, do not guess; require recovery or a separately reviewed repair plan.
- Existing Round IDs from an approved pre-release fixture may be retained only when all invariants validate.

## Related records

### Proposal

Preserve `sourceMessageIds` and evidence snapshots. Add derived Round references only when all selected Messages resolve. If selected Messages span multiple Rounds, retain a message-selection target plus ordered `sourceRoundIds`; do not collapse it into one Round.

### Knowledge

Preserve current provenance fields and snapshots. A future provenance-normalization migration may add Round references derived from Message IDs, but failure to derive a Round must not make Knowledge unreadable.

### Task

Message SourceRef identities and snapshots stay unchanged. A Task is not automatically retargeted from Message to Round.

### ConversationVersion

Do not rewrite stored historical snapshots. On later restore, the restore use case groups restored live Messages using the same versioned algorithm and creates new live Round IDs. The immutable snapshot remains in its original schema and is normalized at the restore boundary.

### Q&A Pair

There is no persisted Q&A collection to migrate. During compatibility, Q&A views read legacy Messages or project from Round. After migration acceptance, UI/search terminology changes to Round.

### Search

SearchDocument is rebuilt at runtime. Old `qa-pair` URLs degrade to the owning Conversation and, when a Message ID can be recovered, redirect to the corresponding Round anchor.

## Copy, append, delete and restore acceptance criteria

- Copy generates new Conversation, Round and Message IDs while preserving ordering and remapping child membership.
- Append parses new material into new Rounds; it never silently merges into an existing Round.
- Delete removes owned Round/Message records and preserves independent Proposal/Knowledge/Task snapshots per RFC-005.
- Restore produces valid Round membership and never modifies Proposal, Knowledge, Task, AnalyzerRun or historical Version records.

## Required test matrix

- empty, one Message, answered, unanswered, orphan assistant, consecutive assistant, context/system, unknown-role and malformed-order Conversations;
- mixed Chinese/English, code fences, large Messages and duplicate timestamps;
- legacy Proposal/Knowledge with valid, missing and cross-Round Message IDs;
- Snapshot restore before/after migration;
- interrupted stage, interrupted commit, invalid recovery snapshot and quota exhaustion;
- migration run twice;
- 1k/10k Message performance measurement;
- full round-trip recovery back to the exact legacy fixture.

## Explicit non-actions in Phase0

- No Round Entity/Contract/Storage implementation.
- No LocalStorage key or schema change.
- No automatic migration on page load.
- No rewrite of Message, Proposal, Knowledge, Task or Snapshot data.
- No deletion of Q&A UI before compatibility is verified.
