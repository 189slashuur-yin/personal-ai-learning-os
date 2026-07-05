# RFC-004: Data and Search Foundation

## Status

Accepted for v0.9 implementation. Its durable Raw/Interpreted, runtime-index and Asset boundaries remain valid. The v1.0 result vocabulary and Round-based anchors are superseded by RFC-005 and RFC-007 after human approval.

## Context

PALOS already preserves imported conversations and turns Analyzer output into reviewable Proposal and confirmed Knowledge. Its current global search maps a small set of entity fields at read time, which is useful for navigation but cannot reliably find all textual evidence or identify the concrete Message, Q&A Pair, or source fragment that matched.

v0.9 upgrades the local-first product into a knowledge system that can accumulate, search, and back up data without introducing a server database, semantic retrieval, or autonomous behavior.

## Decision: separate Raw Data from Interpreted Data

Raw Data and Interpreted Data have different authority and lifecycle and must remain separate.

- `Conversation`, its `ImportedSource`, and ordered `Message` records are preserved raw user/imported material. Editing or parsing may produce a newer local representation, but analysis must not silently replace the original source with an interpretation.
- A derived Q&A Pair is a read model over Messages. It improves navigation and search but does not become a second canonical conversation store.
- `Proposal` is an AI interpretation draft. It carries evidence and generation metadata and remains untrusted until explicit human Review.
- `KnowledgeCard` is long-lived interpreted knowledge created only after human acceptance. It keeps provenance snapshots and remains independently editable without rewriting Conversation or Proposal history.
- Search reads all of these layers but owns none of them. A result must identify its entity and path rather than flattening raw evidence and interpreted conclusions into an indistinguishable blob.

This preserves the existing `Conversation / Source / Message → Proposal → Review → KnowledgeCard` boundary. Analyzer output still cannot create Knowledge directly.

## Search coverage

The v0.9 search read model should cover all meaningful text from:

- Workspace
- Conversation, including Conversation Note
- ImportedSource / Source
- Message
- Q&A Pair derived from Messages
- Proposal, including summary, evidence, rationale, and other user-visible interpretation text
- KnowledgeCard
- Task, including description/notes and SourceRef snapshots
- Tag
- future Attachment / Asset metadata and extracted text when a separately approved extraction design exists

Each searchable unit is represented at runtime as a `SearchDocument` with stable source identity, title, body, optional snippets, Workspace, tags, source label/path, timestamps, and metadata. SearchDocument is a read model, not a canonical entity and not a separately persisted LocalStorage collection in v0.9.

## Search evolution route

Search evolves in explicit layers; adopting an earlier layer does not imply approval of later layers.

1. **Current field `contains`**: case-insensitive matching over selected fields. This is the existing baseline and remains a compatibility fallback.
2. **Browser-local full-text / fuzzy index**: build normalized SearchDocuments at runtime and rank concrete text units. v0.9 starts here without a persistent index.
3. **Local index candidates**: evaluate SQLite FTS for a future desktop/CLI runtime, or MiniSearch / Fuse.js for a browser-local implementation. Selection requires measurement of bundle size, data volume, indexing cost, compatibility, and backup behavior.
4. **Embedding / Hybrid Search**: future candidate only. It requires an approved model/runtime, privacy policy, index lifecycle, rebuild behavior, cost and quality evaluation.
5. **RAG**: future candidate only. It requires retrieval quality gates, prompt/data disclosure controls, citations, failure behavior, and a separate product RFC.

v0.9 uses normalization, contains matching, lightweight scoring, and optionally a simple subsequence match. It does not claim semantic search.

## Why v0.9 does not implement RAG

RAG would combine retrieval, model execution, prompt assembly, and generated answers before PALOS has a dependable full-text data foundation. It would also introduce new privacy, model availability, citation, stale-index, cost, and evaluation concerns. The immediate user need is to find the user's own exact material and navigate to concrete evidence. Full-text and modest fuzzy matching solve that need with deterministic local behavior and preserve the human Review boundary.

Embedding, hybrid retrieval, and RAG therefore remain explicit non-goals for this release.

## Asset boundary

Attachment bytes must not be stored in LocalStorage. LocalStorage has small browser-dependent quotas, synchronous serialization, poor binary ergonomics, and no safe filesystem backup semantics. Large base64 values would inflate size and make unrelated structured records fragile.

Assets belong in a local filesystem asset library. Structured entities store metadata and references only, including filename, MIME type, size, hash, relative/local path, note, owner identity, and timestamps. The browser release records user-supplied metadata; it does not copy, upload, or read arbitrary local files.

An `Asset` may reference Conversation, Knowledge, Task, or Workspace without becoming part of those entities' content. Deleting Asset metadata does not delete a filesystem file in the browser implementation.

## Backup and migration boundary

Project documentation and any project-local `data/` or asset-library directory can be copied into timestamped backup bundles. Browser LocalStorage data is not automatically available to a Node.js project script; a future browser export/import flow must serialize it explicitly through Storage contracts before a complete data migration can be claimed.

Asset paths should prefer a portable relative path when possible and may retain a local path for user navigation. Hashes support later integrity checks and de-duplication but are optional in the metadata-only browser foundation.

## Compatibility

- New optional fields must safely accept Sprint1–Sprint6 and later records that omit them.
- Search indexing is rebuilt from canonical collections at runtime and must not rewrite source records.
- Conversation Note does not alter Source, Message, Proposal, Knowledge, or snapshot content.
- Asset metadata uses a new Contract and BrowserStorage adapter; Page and Service code do not access LocalStorage directly.

## Non-goals

- RAG, embeddings, vector search, or semantic answers
- Agent or autonomous actions
- Calendar, reminders, or Task workflow expansion
- Cloud sync or object-storage upload
- Database or SQLite migration in the browser product
- Real cloud Provider APIs or API keys
- Automatic local-file copying, scanning, or arbitrary filesystem reads

## v1.0 Phase0 addendum

RFC-004's `SearchDocument` remains an internal non-persistent read model. The public v1.0 search surface is frozen by RFC-007 to Conversation, Knowledge, Round, Proposal, Task, Asset and Raw Message. Workspace/Tag become facets, Q&A Pair is superseded by Round, and ImportedSource is advanced provenance search. This addendum does not authorize implementation.
