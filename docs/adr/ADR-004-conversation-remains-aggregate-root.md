# ADR-004: Conversation Remains the Aggregate Root

## Status

Proposed for v1.0 Phase0 architecture freeze. Human approval required.

## Context

The runtime-derived Q&A Pair is useful for reading but does not provide stable identity for search anchors, provenance or future import normalization. Introducing Round solves that problem, but making it an aggregate root or letting it own Proposal/Knowledge would create competing lifecycle boundaries inside one transcript.

## Decision

Conversation represents one logical dialogue thread and remains the aggregate root. Round is a stable child entity that groups ordered Messages. Question and Answer are projections over Message roles. Proposal, Knowledge, Task and Asset metadata remain independent records connected by references and snapshots; Round does not own their lifecycle. No Session entity is introduced.

All Round/Message membership changes are validated by a Conversation/Round use case through Contracts. Copy, delete, append and restore operate on the Conversation aggregate and must maintain Round/Message invariants.

## Consequences

- Search and provenance gain stable Round anchors.
- Existing Q&A Pair behavior can be migrated deterministically without persisting separate Question/Answer truth.
- Conversation operations become responsible for one additional child collection.
- Proposal and Knowledge survive source deletion and retain evidence snapshots, so privacy erasure must be a separate explicit operation.
- A staged, reversible Message-to-Round migration is required before runtime claims can change.

## Rejected alternatives

- **Round as aggregate root:** rejected because ordering, copy/delete and transcript continuity remain Conversation invariants.
- **Round owns Proposal/Knowledge:** rejected because Review, application, edit and archive lifecycles are independent of the raw transcript.
- **Persist Q&A Pair unchanged:** rejected because it is a derived view with unstable identity.
- **Add Session:** rejected because Conversation, ImportReceipt, Workspace and Round already cover the proposed meanings without a distinct Session lifecycle.
