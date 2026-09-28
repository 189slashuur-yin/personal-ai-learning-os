# ADR-005: Conversation Knowledge Context Reuse

## Status

Accepted for PALOS v1.11 implementation (Sprint 0 architecture freeze, 2026-09-27). This ADR defines the implementation contract; no v1.11 production feature has been implemented by this document change.

Sprint 1 foundation, Sprint 1.1 Conversation write hardening, and Sprint 2 selection/Continue Topic are uncommitted implementation candidates. Sprint 3 Analyzer/Provider behavior remains pending. No v1.11 release has been made.

## Context

PALOS v1.10.2 can create, find and trace `KnowledgeCard` records, but cannot reuse them through a first-party Context or Analyzer path. `Conversation` currently owns five optional `ConversationContext` string fields (`longTermBackground`, `currentState`, `decisions`, `constraints`, `nextActions`). `RoundContext` snapshots only those fields and its inheritance service selects a prior Round or Conversation overview. Knowledge content does not participate in either model.

`createContinueContextText()` currently renders Conversation Context, recent Rounds, pending questions and Tasks without AI. `AnalyzerExecutionService` calls the two-method `AnalyzerProvider` contract directly: `analyzeSource(source)` or `analyzeMessages(conversationId, messages)`. Round analysis is adapted to the message method and then stamps Round origin provenance. Demo and Ollama are the only working implementations. Ollama itself constructs the provider prompt; Page/UI does not.

`AnalyzerRun` records primary source IDs and execution status. `Proposal` records primary origin provenance and evidence. Neither records reused Knowledge. Proposal is in the seven-store IndexedDB canonical set; AnalyzerRun remains a LocalStorage/debug record. App Data export/restore exports the seven IndexedDB stores plus allow-listed LocalStorage keys. Restore validation checks record IDs and primary cross-store references, but stored entity normalization currently covers Conversation Context and Round Context only.

IndexedDB is version 1 with seven stores. Adding serializable optional fields to records in existing stores does not require a database version or a new store. Existing Conversation and Proposal adapters spread unknown/additive properties when records are read and written, but explicit normalization and restore validation must be extended so malformed Knowledge Context data cannot become runtime authority.

There is no repository-backed Analyzer input limit. Demo only bounds generated summary/evidence to 120/200 characters; Ollama supplies model, timeout and prompt but no context-window or request-size constraint. Therefore those output constants are not evidence for an input budget.

## Decision

PALOS v1.11.0 adds an optional, ordered `knowledgeContextRefs` relation field to `Conversation`. It is durable Conversation-level authority and remains separate from the five semantic Conversation Context strings. No Topic, Memory or ContextBundle aggregate is introduced.

Each relation freezes a bounded title/content/update snapshot at add or explicit refresh time. A KnowledgeCard edit never rewrites existing refs automatically. A deleted source leaves a usable snapshot-only ref. An archived source remains selected and is shown with a warning. Duplicate `knowledgeCardId` values are rejected during commands and deterministically de-duplicated during legacy/restore normalization.

The first release supports a flat ordered selection of at most five refs, including cards created from other Conversations. Add, remove, reorder and refresh become visible as successful only after durable write and authoritative read-back. Failed writes retain the last confirmed selection and remain retryable. A committed-but-unverified result is reported as such and is not compensated by deleting or restoring records, because compensation could overwrite later writes.

Continue Topic gains an independent `Referenced Knowledge` section rendered from frozen snapshots. With zero valid refs, its v1.10.2 output remains byte-for-byte unchanged.

Conversation refs are included by default in Source, selected Message and Round Analyzer runs. Before a run, UI must show the exact refs that will be used and allow temporary per-run exclusion. That exclusion does not mutate the Conversation. Primary Source/Messages/Round Messages remain evidence; Knowledge is supplemental context only. Page/UI passes typed data and never concatenates provider prompts.

Reusing confirmed Knowledge needs no new Review. Provider output still creates a Pending Proposal and follows Proposal → Review → Knowledge. Providers and Analyzer execution never write KnowledgeCard.

Round does not gain a Knowledge selection or Knowledge snapshot field. Round UI may read and display the parent Conversation selection. Round analysis resolves the current Conversation refs at run time, subject to per-run exclusion; the existing `RoundContext` inheritance/source-selection algorithm is unchanged.

## Data model

Documentation pseudocode (names may receive mechanical TypeScript refinement without changing semantics):

```ts
type KnowledgeContextRef = {
  knowledgeCardId: string;
  titleSnapshot: string;
  contentSnapshot: string; // normalized, bounded, non-empty
  knowledgeUpdatedAtSnapshot: string;
  order: number; // unique contiguous order after normalization
  originalContentLength: number; // source content length at add/refresh
  contentTruncated: boolean; // originalContentLength > contentSnapshot.length
};

type Conversation = {
  // existing fields unchanged
  knowledgeContextRefs?: KnowledgeContextRef[];
};

type AnalyzerKnowledgeContextItem = {
  knowledgeCardId: string;
  titleSnapshot: string;
  contentSnapshot: string;
  knowledgeUpdatedAtSnapshot: string;
};

type AnalyzerSupplementalContext = {
  referencedKnowledge: KnowledgeReuseAuditItem[];
};

interface AnalyzerProvider {
  analyzeSource(
    source: ImportedSource,
    supplementalContext?: AnalyzerSupplementalContext,
  ): Promise<Proposal>;
  analyzeMessages(
    conversationId: string,
    selectedMessages: Message[],
    supplementalContext?: AnalyzerSupplementalContext,
  ): Promise<Proposal>;
}

type KnowledgeReuseAuditItem = AnalyzerKnowledgeContextItem & {
  originalContentLength: number;
  contentTruncated: boolean;
  sourceStatus?: "current" | "updated" | "archived-warning" | "snapshot-only";
};

type AnalyzerRun = {
  // existing origin/execution fields unchanged
  knowledgeReuseAudit?: KnowledgeReuseAuditItem[];
};

type Proposal = {
  // existing origin provenance fields unchanged
  knowledgeReuseAudit?: KnowledgeReuseAuditItem[];
};
```

Missing `Conversation.knowledgeContextRefs` means an empty selection. Missing `AnalyzerRun.knowledgeReuseAudit` or `Proposal.knowledgeReuseAudit` means “not recorded / pre-v1.11”, not proof that no Knowledge was used. For a newly executed v1.11 run, an explicitly empty array means zero refs were actually sent. Every newly written ref and audit item has all required snapshot metadata above; old missing audit fields are not synthesized into an empty audit.

The snapshot title is the card title at add/refresh time, normalized to a non-empty maximum of 200 characters. `contentSnapshot` is normalized non-empty source text, capped at 4,000 characters; `originalContentLength` is the normalized source text length before that cap. `knowledgeUpdatedAtSnapshot` copies the card's ISO `updatedAt`. New writes use a stable contiguous zero-based `order`; normalizers preserve the first valid occurrence of each card ID and reindex in stored order. Character limits count JavaScript string length consistently across preview, persistence, provider payload and audit. A run copies only the effective, ordered snapshot items, truncation metadata and display-only source status observed at run start into its audit; it never copies the entire KnowledgeCard, tags, evidence or revision history.

`knowledgeCardId` remains an identity hint and source-status lookup key, not a referential-integrity requirement. Snapshots are sufficient when the current card is missing. `order` is authoritative within a normalized Conversation selection; audit arrays preserve actual provider order and do not need a separate `order` field.

## Authority

- `Conversation.knowledgeContextRefs` is the sole persistent selection authority.
- The referenced KnowledgeCard is authority only when initially resolving an add or explicit refresh command.
- Once committed, the ref snapshot is authority for Continue Topic and the default Analyzer payload until explicit refresh/removal.
- Current Knowledge lookup may derive `current`, `updated`, `archived` or `deleted/snapshot-only` display status. It must not mutate refs.
- The Analyzer execution boundary is authority for the per-run effective selection after temporary exclusions and budget validation.
- AnalyzerRun and Proposal audit snapshots describe what that run actually used; they never become selection authority.
- Existing `sourceId`, `sourceRoundId`, `sourceMessageIds` and `conversationId` remain origin provenance and must not encode Knowledge reuse.

## Lifecycle

1. Add resolves the selected KnowledgeCards, rejects duplicates and the sixth card, creates frozen bounded refs, then durably writes the Conversation and verifies it.
2. Reorder writes a complete permutation of the current normalized IDs; malformed or stale commands fail closed.
3. Refresh resolves the current card by ID and replaces only its snapshots after explicit user action and durable verification. A missing card cannot refresh.
4. Remove deletes only the relation ref. It never deletes or archives Knowledge.
5. Knowledge edit merely derives an `updated` warning by comparing `updatedAt` with `knowledgeUpdatedAtSnapshot`.
6. Knowledge archive derives a warning but leaves the ref and its frozen snapshot intact.
7. Knowledge deletion leaves the ref intact as snapshot-only. No cleanup cascade runs.
8. Analyzer run resolves the normalized Conversation refs, applies temporary exclusions, validates the budget, displays the effective set, and passes it to execution/provider.
9. Execution saves the same actual audit snapshot on the running/completed/failed AnalyzerRun and on a produced Proposal. Analyzer failure does not mutate Conversation refs.

## Compatibility

All new entity fields and provider parameters are additive and optional. Old records read as empty/unrecorded according to the defaults above. Existing callers that omit supplemental context retain v1.10.2 behavior. Demo must accept the argument and remain deterministic/offline; it may incorporate a stable summary of supplemental snapshots without treating them as evidence. Ollama adds a clearly delimited supplemental section in its provider-owned user prompt.

Conversation copy, version snapshot/restore, merge, import and any whole-record serializer require explicit selection semantics. Ordinary Conversation saves preserve the authoritative refs. Duplicate omits refs; merge keeps target refs without union. A ConversationVersion snapshot recorded after v1.11 restores its recorded refs; an old snapshot without refs preserves the current selection. App restore/migration/clear retain their explicit full-replacement semantics.

App Data keeps `schemaVersion: 1` and the existing IndexedDB bundle keys. Export preserves optional fields inside Conversation and Proposal records and the allow-listed LocalStorage AnalyzerRun key. Restore validators and read normalizers require additive knowledge-ref/audit validation. Old backups missing all three fields restore normally, with no automatic write migration. A v1.11 backup round-trip preserves refs and audit content/order exactly after valid normalization. Unknown or malformed individual refs are not trusted. Normalization trims strings, bounds arrays, removes duplicate card IDs deterministically by first valid occurrence, and rewrites contiguous order. It must report discarded/invalid/truncated data in restore preview or reject the restore; it must not silently truncate content.

LocalStorage debug mode remains supported: Browser Conversation, Proposal and AnalyzerRun readers/writers accept the optional fields and use the same shared normalizers. No new LocalStorage key is added. AnalyzerRun remains debug/operational LocalStorage data in v1.11; the ADR does not promote it into IndexedDB.

## Provider integration

The chosen contract evolution is optional supplemental context parameters on the existing two methods. `AnalyzerExecutionService.runSource(source, options?)`, `runMessages(conversationId, messages, options?)`, and `runRound(round, messages, options?)` already converge on the two provider calls. Add resolved effective context to their optional options; the service passes it as the last provider argument and owns run/Proposal audit stamping. Old callers and providers that ignore the optional argument retain their call shape. Round continues to use `analyzeMessages`. Migration order:

1. define the DTO, shared normalizer/budget resolver and optional entity audit fields;
2. extend the interface and Demo/Ollama method signatures while all existing callers continue to compile with omitted arguments;
3. teach providers to render supplemental context at the provider boundary;
4. extend AnalyzerExecution options to receive the already-resolved effective refs and stamp one immutable audit snapshot on run and proposal;
5. wire Source, selected Messages and Round UI to preview exclusions and pass the effective context.

A unified `AnalyzerRequest` envelope is rejected for v1.11. It would provide a cleaner long-term discriminated union, but today there are only two stable methods and multiple direct callers. Replacing their arguments would require coordinated rewrites of Conversation Detail, Analysis page, retry paths, execution tests, Demo and Ollama, while offering no required v1.11 behavior unavailable through optional parameters. A future new primary evidence mode may justify a separate ADR and envelope migration.

Providers receive already-normalized frozen snapshots. They do not load Conversation or Knowledge storage. Demo/Ollama keep evidence generation grounded in the primary input. Prompt delimiters must label Knowledge as user-confirmed supplemental context and defend against treating its text as provider/system instructions.

## Audit provenance

Both `AnalyzerRun` and `Proposal` add optional `knowledgeReuseAudit` snapshots. A failed or timed-out run retains its bounded effective snapshot/audit when run persistence succeeds. Retry creates a new run with a newly resolved audit. A Proposal copies the matching run audit only when successfully created, including `[]` for an explicitly zero-ref v1.11 run. Saving only IDs is insufficient because cards can be edited, archived or deleted. Each new audit item includes card ID, title, bounded content and Knowledge update timestamp. AnalyzerRun records the effective array before provider invocation, including on failure; Proposal receives exactly the same array only when output exists.

Origin provenance answers “what content was analyzed as evidence.” Reuse audit answers “which previously confirmed Knowledge snapshots influenced this run.” UI, Review and Knowledge creation must keep these labels separate. Applying a Proposal to Knowledge continues to copy primary evidence under the existing provenance rules; it must not relabel reused Knowledge as origin evidence.

## Character budget

No hard Analyzer input limit exists in the repository. `SUMMARY_LENGTH = 120` and `EVIDENCE_LENGTH = 200` in Demo bound output fields only. Ollama sends unbounded Source/Message text and has configurable model/timeout but no model-context metadata or token counter. Consequently v1.11 defines configurable character constants rather than claiming a provider-derived token limit:

- `MAX_KNOWLEDGE_CONTEXT_REFS = 5`;
- `MAX_KNOWLEDGE_CONTEXT_REF_CONTENT_CHARS = 4_000`;
- `MAX_KNOWLEDGE_CONTEXT_TOTAL_CONTENT_CHARS = 16_000` for persistent selection and per-run payload/audit.

These are frozen v1.11 product limits, not model guarantees. Only an add or explicit refresh that creates a newly truncated snapshot requires explicit truncation confirmation; viewing, reordering, running or retrying an unchanged frozen snapshot does not ask again. Add/refresh previews disclose original and retained lengths before confirmation and record `originalContentLength` plus `contentTruncated: true`. If the total would exceed 16,000 characters, the command/run fails visibly and asks the user to remove a ref or shorten/refresh it; it never silently drops, reorders or further truncates refs. A later provider-capability budget may lower the effective limit only with an equally visible pre-run result.

## Failure semantics

- Add/remove/reorder/refresh uses one scoped durable Conversation mutation. Inside one IndexedDB transaction, read the authoritative Conversation, compare the command's expected refs baseline, patch only `knowledgeContextRefs` onto that record, and commit. A mismatch fails closed, including cross-tab stale commands. No stale full-record `put`, `replaceStores`, whole-cache authority or compensating overwrite is allowed. UI state advances only after commit plus authoritative read-back verification.
- A writer failure leaves the prior durable selection and current confirmed UI unchanged; retry uses a fresh authoritative baseline.
- A commit followed by failed verification reports `committed-unverified`. No compensating delete or overwrite is attempted.
- Resolver failures, missing source cards and archived cards never auto-rewrite the relation.
- Duplicate IDs, invalid snapshots, non-contiguous order and over-budget commands fail closed before a product write. Restore normalization follows the explicit compatibility reporting rule above.
- Provider failure/timeout retains the exact bounded effective snapshot/audit on that failed AnalyzerRun if run persistence succeeds; retry always creates a new run and new audit from a newly resolved effective selection. It never changes Conversation refs.
- Proposal persistence failure cannot be reported as a successful reusable analysis. It does not alter the selection.

## Non-goals

- Topic, Memory, ContextBundle or another aggregate
- A new IndexedDB store/version or promoting AnalyzerRun to IndexedDB
- Round-level Knowledge selection or writing refs into `RoundContext.snapshot`
- Changes to Round inheritance/source selection
- Automatic recommendations, graph relations, RAG, embeddings or vector search
- Automatic snapshot refresh, deletion cascade or archive removal
- Provider direct Knowledge writes or bypassing Proposal Review
- Exact token counting, model discovery, cloud Provider support or a general prompt framework

## Alternatives considered

- Put Knowledge text into the five Conversation Context fields: rejected because it destroys identity, ordering, update status and reuse audit, and mixes current-state prose with referenced durable Knowledge.
- Add a ContextBundle/Memory aggregate or store: rejected as premature lifecycle and migration complexity for a five-item Conversation relation.
- Store only KnowledgeCard IDs: rejected because edit/delete would make Continue Topic and historical run audit irreproducible.
- Auto-refresh refs after Knowledge edits: rejected because it rewrites previously chosen context without user confirmation.
- Add refs to RoundContext snapshots: rejected because v1.11 does not introduce Round ownership and must preserve the current inheritance algorithm.
- Unified AnalyzerRequest envelope: rejected for v1.11 for the compatibility/migration reasons in Provider integration.

## Consequences

PALOS gains a complete find → select → reuse → audit seam while retaining Conversation as aggregate root and Knowledge as an independent aggregate. Continue Topic remains deterministic, local and reproducible. Analyzer results can explain both primary evidence and reused context after source mutation/deletion.

The cost is duplicated bounded snapshot content in Conversations, AnalyzerRuns and Proposals, plus explicit stale/archived/deleted states. Conversation writes need a durable verified mutation path rather than relying on current fire-and-forget adapter success. Export/restore and both storage modes must share strict normalization. Character limits are initially product defaults and may reject unusually large selections even if a particular Ollama model could accept them.

## Migration / Sprint plan

### Sprint 1 — relation model, resolver, scoped persistence and restore/export

**Goal:** Make Conversation Knowledge selection durable and safely recoverable without exposing an incomplete UI workflow.

**In-scope modules:** `src/core/entities/{conversation,analyzer-run,proposal}.ts`, Knowledge relation DTO/resolver, `src/core/contracts`, `src/infrastructure/storage` (IndexedDB scoped writer and BrowserStorage normalizers), App Data export/restore validators, Conversation copy/version restore/merge/import projections. `RoundContext` is unchanged.

**Forbidden scope:** Provider prompts, selection UI, new store/version, whole-cache replacement for ordinary relation mutations, automatic write migration.

**DoD:** Add/remove/reorder/refresh obey max 5 and 4,000/16,000-character limits; truncated add/refresh requires confirmation; stale expected refs fail closed inside the authoritative Conversation transaction; committed-but-unverified is surfaced without compensation. Read/reload, export and restore retain valid refs; old backups lacking fields restore; malformed data is rejected or reported before restore. LocalStorage debug and IndexedDB have matching semantics. Conversation copy and version restore retain the intended snapshot.

**Tests:** resolver boundary/duplicate/order/budget cases; transaction cross-tab stale baseline and unrelated-field preservation; failure/read-back cases; reload; v1.10 backup compatibility; v1.11 backup round-trip; copy/version restore/merge/import regressions.

### Sprint 2 — selection UX and Continue Topic

**Goal:** Let users choose and inspect up to five frozen Knowledge snapshots and reuse them in a deterministic Continue Topic export.

**In-scope modules:** Conversation Detail selection controls, Knowledge status resolver, read-only Round display, `context-export-service` and Continue Topic UI.

**Forbidden scope:** Analyzer integration, Round-level persistent relation, Knowledge auto-refresh or deletion cascade.

**DoD:** Cross-Conversation selection, add/remove/reorder, explicit refresh and truncation confirmation work from durable read-back. Updated/archived/deleted states are clear; deleted source remains snapshot-only and usable, with degraded navigation. Continue Topic adds a `Referenced Knowledge` section in stable order; zero refs preserve v1.10.2 output byte for byte. Round displays parent refs without writing `RoundContext`.

**Tests:** interaction and reload paths, stale/failed write messaging, archived/deleted source states, snapshot immutability after card edit, truncation and total-limit UI, zero-ref golden output and ordered section rendering.

### Sprint 3 — Analyzer/Provider integration and reuse audit

**Goal:** Pass the effective frozen selection into Source, selected Message and Round runs while keeping primary evidence and reusable context distinct.

**In-scope modules:** `AnalyzerProvider`, Demo/Ollama providers, `AnalyzerExecutionService`, Source/Message/Round run UI, AnalyzerRun/Proposal persistence and Review audit display.

**Forbidden scope:** Provider writes to Knowledge, bypass of Proposal Review, AnalyzerRequest rewrite, RAG/vector/semantic retrieval, automatic selection.

**DoD:** Every run previews default refs and permits temporary exclusions without changing Conversation refs; budget validation blocks over-limit payloads. Optional supplemental provider argument preserves old caller behavior. Provider prompt labels Knowledge as supplemental and does not treat it as instructions or primary evidence. Running/completed/failed runs retain the exact bounded audit; retry creates a new run/audit. A successfully created Proposal copies that run audit, including `[]`; missing old audit stays unrecorded. Review preserves Proposal → Review → Knowledge.

**Tests:** Source/Message/Round and retry paths, zero/one/five refs, exclusion, provider payload order and boundaries, failure/timeout audit, Proposal carry-through, primary evidence separation, legacy caller/provider compatibility.

Sprint 2 depends on Sprint 1's durable relation/resolver. Sprint 3 depends on Sprint 1's shared DTO, resolver and audit normalization; it may follow Sprint 2 so the same selection and warning UX is reused.

### Implementation candidate status (2026-09-27)

Sprint 0 architecture is frozen. Sprint 1 relation/resolver/writer/restore support is implemented in the working tree. Sprint 1.1 makes ordinary IndexedDB Conversation saves read the durable record in a transaction and preserve its current refs; LocalStorage debug saves preserve refs synchronously. Version restore is an explicit replacement, while legacy snapshots lacking refs preserve the current selection. Sprint 2 adds Conversation Detail selection, frozen source warnings and explicit refresh, plus deterministic Continue Topic rendering. Sprint 3 adds authoritative runtime resolution, optional two-method Provider supplemental arguments, temporary exclusions, run/Proposal audit snapshots and read-only UI summaries. These are uncommitted implementation candidates; v1.11 has not been released. The LocalStorage debug cross-tab limitation and long-Timeline/selection-preview performance remain non-blocking product follow-ups. Final browser gate and control review remain pending.

## Frozen exclusions

v1.11 does not add KnowledgeRevision, manual Message → Knowledge, Daily Sync, cross-tab live subscription, Timeline virtualization, semantic/RAG/vector search, automatic selection, a Topic/Memory/ContextBundle, Round-level persistent relation, or an AI Aggregation shared Core.
