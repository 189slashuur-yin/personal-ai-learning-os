# RFC-007: v1.0 Search Result Contract

## Status

Proposed for v1.0 Phase0 architecture freeze. Human approval required before implementation.

## Decision

Search remains a non-persistent, read-only projection over canonical records. v1.0 replaces the overlapping legacy `SearchResult` and v0.9 `SearchDocumentMatch` vocabulary with one public Search Result contract while allowing internal SearchDocuments to remain implementation details.

## Default search surface

An unfiltered search includes exactly these user-facing result kinds:

1. Conversation
2. Knowledge
3. Round
4. Proposal
5. Task
6. Asset
7. Raw Message

Workspace and Tag are filters/facets and navigation context, not default content results. ImportedSource is an advanced provenance result for diagnostics or explicit source search. The legacy Q&A Pair kind is superseded by Round.

## Result contract

```text
SearchResult
  resultId
  kind: conversation | knowledge | round | proposal | task | asset | raw-message
  entityId
  title
  snippet
  matchedFields[]
  matchMode
  score
  updatedAt?
  context:
    workspaceId?
    workspaceName?
    conversationId?
    conversationTitle?
    roundId?
  anchor:
    entityType
    entityId
    messageId?
    field?
  facets:
    tags[]?
    proposalStatus?
    knowledgeStatus?
    taskStatus/type/priority?
    assetOwnerType?
  provenance:
    sourceLabel?
    sourcePath?
    liveReferenceState: available | missing | snapshot-only
```

`resultId` identifies the projection instance (`kind + entityId`); it is not a new canonical identity. Navigation is derived at the Page/router boundary from the typed anchor, not treated as domain ownership.

## Mapping rules

- **Conversation:** title, note and bounded transcript/source summary; anchor Conversation.
- **Knowledge:** title, summary, content and provenance snapshot; anchor Knowledge.
- **Round:** projected question/answer/context text; anchor Round, optionally its best matching Message.
- **Proposal:** title, summary, evidence and review/application metadata; anchor Proposal.
- **Task:** title, description and SourceRef snapshots; anchor Task.
- **Asset:** filename, original name, note, MIME/hash/path metadata; never file bytes or extracted text unless a future approved design adds it.
- **Raw Message:** exact Message content and role; anchor Message inside its Round/Conversation.

The same Message content may support both a Round and Raw Message result. The UI may group or de-emphasize duplicates, but must not merge their identities or claim one is canonical over the other.

## Ranking and filters

Ranking remains deterministic and explainable. Exact and field-priority matches outrank contains, which outrank fuzzy. Raw evidence and interpreted content are visibly typed; Search must not present a Proposal or Knowledge conclusion as if it were a raw Message.

Required filters/facets:

- result kind;
- Workspace context;
- Tag where applicable;
- Proposal/Knowledge/Task status;
- Task type/priority;
- Asset owner type;
- updated date range;
- match mode.

Search quality changes require fixed relevance fixtures and 1k/10k performance measurements. A persistent index, third-party index library, embedding, hybrid retrieval or RAG requires a separate approved decision.

## Missing references and deletion

Search reads current canonical data and provenance snapshots. If a live source is missing, results may remain for independent Proposal, Knowledge or Task records and must mark `snapshot-only` or `missing`. Search never repairs references or deletes dependent records.

## Compatibility

- During Message-to-Round migration, legacy `qa-pair` result requests resolve to Round when possible or degrade to Conversation.
- Existing URL parameters may be read, but v1.0 writes the new result-kind vocabulary.
- Runtime indexes are rebuilt; no persisted index migration is required.

## Non-goals

- Search as canonical storage
- Mutating data from the index layer
- Semantic answers, RAG or embedding
- File-content extraction
- Persistent browser index before measurement and lifecycle design
