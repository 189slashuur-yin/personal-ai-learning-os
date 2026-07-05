# RFC-008: Proposal, Review and Knowledge Lifecycle

## Status

Proposed for v1.0 Phase0 architecture freeze. Human approval required before implementation.

## Authority layers

```text
Conversation / Round / Message = raw or user-edited source
AnalyzerRun                    = execution record
Proposal                       = generated interpretation draft
ReviewDecision                 = explicit human judgment
Knowledge                      = applied, long-lived interpreted content
KnowledgeRevision              = immutable change snapshot inside Knowledge
```

No layer silently replaces another. Search exposes the layer type, and source deletion does not rewrite historical interpretation.

## Proposal lifecycle

```text
Pending ── accept ──> Accepted ── apply once ──> Applied
   └────── reject ──> Rejected
```

- Proposal is an independent aggregate with an explicit AnalysisTarget and evidence snapshots.
- AnalyzerRun success may create one Pending Proposal. Analyzer failure creates none.
- Pending is the only reviewable state.
- Accepted means a human approved the interpretation for application; it does not itself mutate Knowledge.
- Rejected is terminal. A revised interpretation requires a new Proposal.
- Applied records the target Knowledge ID and KnowledgeRevision ID when applicable.
- Apply is idempotent; repeated commands return the same application result.

## ReviewDecision

Review is an explicit immutable record, not merely a UI page:

```text
ReviewDecision
  id
  proposalId
  decision: accepted | rejected
  note?
  decidedAt
  actor: user
```

One Proposal has at most one terminal ReviewDecision. A correction does not edit history; the user creates/re-runs a Proposal. v1.0 has no automatic or Provider-authored review actor.

For compatibility, `Proposal.status` may remain as a materialized workflow field, but the ReviewDecision is the audit source for who/when/why.

## Knowledge definition and ownership

Knowledge is a long-lived, user-controlled interpreted record. The current TypeScript name `KnowledgeCard` may remain during compatibility, but the domain term is Knowledge.

Knowledge does not belong to Conversation or Round. It contains provenance entries with live references when available and immutable evidence snapshots for readability when they are not.

Lifecycle:

```text
create from applied Proposal → Active ↔ Archived
                                  └─ explicit permanent delete
```

Archive is reversible and preferred. Permanent deletion is explicit and does not delete source Conversation/Round/Message or the originating Proposal/ReviewDecision.

## KnowledgeRevision

Every applied content change creates an immutable revision record inside the Knowledge aggregate:

```text
KnowledgeRevision
  id
  knowledgeId
  title/content/summary snapshot
  changeType: proposal-apply | user-edit
  proposalId?
  provenance[]
  createdAt
```

- Applying an accepted create Proposal creates Knowledge plus revision 1.
- Applying an accepted update Proposal appends a revision to an explicitly targeted Knowledge.
- Direct user edits append a `user-edit` revision and do not require a Proposal.
- Revisions do not become separately searchable default entities; Search returns current Knowledge and may expose revision matches as provenance context.
- Reverting creates a new revision from an old snapshot; history is not overwritten.

## Provenance

A provenance entry can reference Conversation, Round, Message or ImportedSource and includes a readable evidence snapshot, source label, capture time and live-reference state. Multiple entries are allowed because one Knowledge record may be refined from more than one reviewed source over time.

Deleting source entities changes only live-reference state. It does not delete Knowledge, revisions or evidence snapshots. A separately confirmed privacy-erasure operation may delete both raw and derived copies after showing the full impact.

## Relationship to Task, Asset and Search

- Task may reference Knowledge but has an independent action lifecycle.
- Asset metadata may reference Knowledge; deleting metadata never deletes the Knowledge or external file.
- Search indexes current Knowledge and source/provenance snapshots while visibly distinguishing interpreted content from raw Message/Round results.

## Compatibility and migration boundary

- Existing KnowledgeCard becomes Knowledge with an initial synthetic revision derived from its current stored state only when an approved migration runs.
- Existing Proposal status remains readable. ReviewDecision backfill must distinguish known user actions from unknown legacy state and must not invent notes or timestamps.
- Existing evidence fields remain intact; normalization may add structured provenance but never drop snapshots.
- This RFC does not authorize runtime changes or migration.

## Non-goals

- Automatic acceptance or application
- Analyzer/Provider writes to Knowledge
- Round-owned Knowledge
- Collaborative review, permissions or multi-user actors
- Knowledge action/reminder state; use Task instead
- RAG, embedding, Agent or autonomous revision
