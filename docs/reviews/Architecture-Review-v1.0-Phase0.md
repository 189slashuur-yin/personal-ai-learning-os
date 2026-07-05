# v1.0 Phase0 Architecture Review

- Review date: 2026-07-05
- Scope: Conversation, Message, Q&A Pair, Proposal, Knowledge, Workspace, Task, Search, Provider, Asset, Import
- Evidence: current core docs, all RFC/ADR, release notes/reviews, QA plans, and read-only inspection of current Entity/Service/BrowserStorage boundaries
- Change boundary: documentation only; no runtime implementation or migration

## Executive conclusion

The current v0.9 model is internally workable, but it is not safe to call the v1.x domain frozen yet. The main knowledge path is sound—raw material remains separate from Proposal and human-reviewed Knowledge—but four concepts are still ambiguous or duplicated:

1. Conversation is described as context, workspace, import result, and chat thread in different places.
2. Q&A Pair is a useful projection but has no stable identity after Message edits or restore, so it cannot be the long-term search/provenance anchor.
3. Search has two generations of read models (`SearchResult` and `SearchDocument`) and still exposes implementation-era types rather than the intended v1.0 result contract.
4. Import is UI/profile-driven rather than defined as a parser boundary with preview, diagnostics, provenance, and multi-conversation export semantics.

Phase0 resolves these ambiguities with a freeze candidate:

```text
Workspace
  └─ places Conversation
       ├─ owns ImportedSource segment(s)
       ├─ owns Round[]
       │    └─ owns ordered Message[]
       └─ owns ConversationVersion[]

Provider → AnalyzerRun → Proposal → ReviewDecision
                              └─ apply → Knowledge / KnowledgeRevision

ImportArtifact → Parser → ImportPreview → explicit confirmation
                                  ├─ ImportReceipt
                                  └─ Conversation[]

SearchDocument → SearchResult (read-only projection over canonical data)
```

Proposal, Knowledge, Task, Asset metadata, and ImportReceipt are not children of Round. They keep explicit references and snapshots and have independent lifecycles.

## Current relationship review

| Concept | Current reality | Review finding | Freeze candidate |
| --- | --- | --- | --- |
| Conversation | Metadata entry linked to Source, Message, Proposal, Version, Workspace and Note | Meaning is underspecified; current copy/delete behavior makes it look like both a chat thread and a broad workspace aggregate | One logical dialogue thread; Conversation remains aggregate root |
| Message | Canonical ordered utterance under Conversation | Stable raw unit, but lacks a stable semantic group | Remains canonical; gains Round membership during a future approved migration |
| Q&A Pair | Runtime derivation from Messages | Useful UI projection but ID changes with the first Message and has no persisted lifecycle | Replaced by Round as the stable group; Question/Answer remain projections |
| Proposal | Independent persisted Analyzer output with source/message references and status | Correctly separated from raw data, but Review is only a status transition and update-existing-Knowledge semantics are undefined | Independent aggregate with explicit analysis target, evidence snapshots, ReviewDecision and idempotent application |
| KnowledgeCard | Independent editable snapshot created from an accepted Proposal | Provenance is strong; lifecycle only covers Active/Archived and direct edit, with no revision model | Canonical concept is Knowledge; application can create Knowledge or append a KnowledgeRevision |
| Workspace | Single-level placement for Conversation and Task | Boundary is clear; it should not become content ownership | Continues to place Conversation and Task; Round inherits Conversation context |
| Task | Independent action with SourceRef snapshot | Implementation has evolved beyond RFC-003's original two statuses/types | Remains independent; may reference Conversation, Round, Message, Proposal, Knowledge, Workspace or manual snapshot |
| Search | Old aggregate mapper plus v0.9 runtime SearchDocument index | Dual result vocabulary and Q&A-specific anchors will become stale | One v1.0 SearchResult contract over seven default result kinds; no ownership or mutation |
| Provider | Replaceable Analyzer boundary; Demo and explicit local Ollama only | Boundary is strong | Produces AnalyzerRun/Proposal only; never Review, Knowledge or Task mutations |
| Asset | Independent metadata with polymorphic owner and no file bytes | Current Conversation lifecycle is coordinated, but owner/reference semantics need to cover Round | Metadata record may reference a supported owner; external file lifecycle remains outside browser ownership |
| Import | TXT/Clipboard UI plus ImportProfile and deterministic Message parser | Channel, format, parser, persistence, and provenance are conflated | Import is an application workflow; parsers are pure and versioned; confirmation is required before writes |

## Conflicts found and disposition

### 1. Conversation ownership is too broad

Current deletion cascades from Conversation into Source, Message, Proposal, and Knowledge, while Task deliberately survives through a degraded SourceRef. This conflicts with the stated independence of reviewed Knowledge and with the fact that Proposal/Knowledge preserve evidence snapshots.

Disposition: Conversation owns only its raw/live dialogue structure and versions. Proposal, Knowledge and Task survive Conversation deletion with degraded live references and retained snapshots. A future privacy-erasure operation may explicitly include derived artifacts, but it must be a separate confirmed operation with an impact preview.

### 2. Q&A Pair cannot be the durable anchor

Q&A Pair is recomputed and its ID is derived from a Message ID. Conversation restore recreates Message IDs, so saved search links and future provenance would break.

Disposition: Round becomes the stable child entity and search/provenance anchor. Q&A Pair becomes a compatibility projection during migration and is removed from the final canonical model.

### 3. Round must not absorb independent lifecycles

Making Round a new aggregate root that owns Proposal or Knowledge would make deletion, Review, archival and source degradation ambiguous. It would also duplicate Conversation ordering and Workspace context.

Disposition: Round is a child entity inside the Conversation aggregate. It owns grouping semantics for Messages only. Proposal and Knowledge reference Round but are not owned by it.

### 4. Search vocabulary is split

`SearchResult` represents the older aggregate search, while `SearchDocumentMatch` represents v0.9 concrete-unit search. Workspace, Tag, Source and Q&A Pair currently appear as result types even though the requested v1.0 default is centered on user content and evidence.

Disposition: v1.0 has one result contract. Default kinds are Conversation, Knowledge, Round, Proposal, Task, Asset and Raw Message. Workspace and Tag are filters/facets; Import Source is an advanced provenance result only. Q&A Pair is replaced by Round.

### 5. Import format and source identity are conflated

Conversation `sourceType` mixes providers (ChatGPT/Claude), formats (Markdown/TXT), and creation modes (Manual/Plain Text). ImportProfile is useful for clipboard parsing but is not a general parser contract.

Disposition: import channel, detected format, external producer, parser identity/version, and Conversation source metadata are separate fields in the exchange design. Existing `sourceType` remains a compatibility field until an approved migration.

### 6. Review and Knowledge update semantics are incomplete

Review currently exists as Proposal status functions, and accepted content only creates a new KnowledgeCard. There is no explicit human decision record or safe path for applying a later Proposal to existing Knowledge.

Disposition: ReviewDecision is an immutable human decision associated one-to-one with a Proposal. An accepted Proposal can be applied once to create Knowledge or append a KnowledgeRevision to a specified Knowledge. No Analyzer applies changes directly.

### 7. RFC-003 no longer matches the implemented Task model

RFC-003 still says Task is planned and freezes a smaller status/type/source model than the current runtime.

Disposition: mark the old conceptual implementation notes as superseded by the implemented v0.7 model while preserving its durable boundary: Task is independent and AI cannot mutate it autonomously.

## Aggregate roots and ownership

| Aggregate root | Owns | References but does not own |
| --- | --- | --- |
| Conversation | Conversation metadata, ImportedSource segments, Rounds, Messages, ConversationVersions, note | Workspace, ImportReceipt; referenced by Proposal/Knowledge/Task/Asset |
| Proposal | Generated interpretation, analysis target, evidence snapshots, lifecycle/application record | Conversation/Round/Message/ImportedSource, Provider, target Knowledge |
| Knowledge | Current reviewed content, provenance entries, revision history, Active/Archived lifecycle | Proposal, Conversation/Round/Message snapshots, Tags |
| Task | Action state, schedule, Workspace placement, SourceRef snapshot | Any supported source identity |
| Workspace | Placement metadata and Inbox fallback policy | Conversation and Task are placed, not owned as content |
| Asset metadata | File-reference metadata and owner reference | External file bytes are never owned by browser storage |

ImportReceipt is an immutable application/audit record rather than a content aggregate. SearchDocument and SearchResult are runtime read models, never aggregate roots.

## Required invariants

1. Every Round belongs to exactly one Conversation.
2. Every Message belongs to exactly one Round and the same Conversation.
3. Round order is unique within a Conversation; Message order is unique within a Conversation.
4. Question and Answer are projections over Message roles, not separately persisted truth.
5. Analyzer output can only create a Proposal; a human ReviewDecision is required before application.
6. Applying one Proposal is idempotent and records the affected Knowledge/revision.
7. Knowledge remains readable when live source entities are missing because provenance snapshots are retained.
8. Search never owns, repairs, deletes, or mutates canonical entities.
9. Parser execution performs no persistence; import writes occur only after preview and explicit confirmation.
10. No migration may delete or rewrite legacy Message content, IDs, evidence snapshots, or ConversationVersion snapshots.

## Risks that remain after the design review

- LocalStorage still has no transaction; the migration requires staging, validation, recovery snapshot, and a commit marker.
- Current Conversation delete semantics must change before the new ownership model is implemented.
- ConversationVersion restore currently regenerates Message IDs; the Round migration design must assign new stable Round IDs without rewriting historical snapshots.
- KnowledgeRevision and ReviewDecision are new domain records and therefore require explicit acceptance criteria before implementation.
- Multi-conversation export files can be large; the Import design must avoid blindly duplicating a whole raw export into every Conversation.

## Review verdict

The proposed model has no unresolved ownership contradiction and is suitable as the v1.0 Phase0 freeze candidate. It is **not implementation authorization**. The architecture becomes frozen only after human approval of RFC-005, RFC-006, ADR-004, and the Architecture Freeze Report.
