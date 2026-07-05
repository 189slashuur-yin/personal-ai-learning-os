# Message to Round Migration Report — v1.0 Phase1

- Date: 2026-07-05
- Runtime: v1.0 alpha draft
- Scope: Phase1 Epic A–L only
- Execution state: migration capability implemented; no user browser data was migrated by this repository task

## Result

Phase1 adds stable Round records without deleting or rewriting legacy Message records. `MessageToRoundMigrationService` builds deterministic `round-v1-<firstMessageId>` plans, reports Conversation/Message/existing/planned/new/covered counts plus warnings/errors, rejects ID membership collisions, rechecks input before apply, and is idempotent for unchanged input.

Migration is never triggered on page load. A legacy Conversation shows an explicit preview/confirmation action. Empty Conversations create no Round; missing Conversation references are warnings in full preview. Existing Q&A Pair remains derived from Messages and continues to work.

## Storage and compatibility

- New key: `ai-learning-os.rounds`, owned only by `BrowserRoundStorage`.
- Existing Message, Q&A Pair, Proposal, KnowledgeCard, ConversationVersion and Search data is not deleted or bulk rewritten.
- Round stores the requested compatibility projections `question`, `answer`, and `messageIds`; Message remains preserved raw data. Service/Parser paths own projection generation and Round mutation.
- Proposal `sourceType/sourceRoundId`, KnowledgeCard `sourceRoundId`, and AnalyzerRun `roundId` are optional. Old records require no backfill.
- SearchDocument remains runtime-only; Round/Asset documents are rebuilt from canonical storage.

## Breaking Changes

None. Existing LocalStorage collections and old Message/Q&A/Proposal/Knowledge reads remain accepted. The import page now presents the new Preview-first workbench; the previous form components remain in the tree for compatibility but are no longer the primary route UI.

## Known Issues

- This alpha does not implement the Phase0 recovery-export/staging/commit-marker exchange protocol; apply is additive Round creation only and therefore does not claim a full schema migration transaction.
- Parser support is deterministic labeled text parsing, not native provider JSON export parsing. JSON is a non-writing placeholder.
- Round question/answer/messageIds are compatibility projections and can diverge from later Message edits; no automatic reverse synchronization runs.
- Round split uses deterministic text/message midpoint splitting; users should review the result.
- Manual browser QA and fixed old-data fixtures have not yet been executed; there is no automated test suite.
- Existing Conversation deletion semantics for independent Proposal/Knowledge are unchanged in Phase1 and remain a follow-up architecture-alignment item.

## Manual QA Steps

1. Export or otherwise preserve a test browser profile before using migration controls.
2. Open old answered, unanswered, orphan-assistant, system/context and unknown-role Conversations; inspect preview counts and confirm only selected test data.
3. Compare every Message ID/content/order before and after; repeat generation and confirm no duplicates.
4. Exercise all seven text parsers, TXT file import, cancellation before Confirm, and JSON placeholder behavior.
5. Exercise Round edit/note/search/fold/add/delete/merge/split/reorder/rebind and verify timestamps/order.
6. Analyze Round and Conversation, Review, create Knowledge, search the Round, and follow all Round links.
7. Copy/delete a disposable Round Conversation and verify remapped IDs plus retained legacy evidence.
8. Run the V10 checklist in `docs/QA_CHECKLIST.md` and the existing v0.9 regression checklist.

## Remaining TODO

- Execute and record manual QA with fixed legacy fixtures.
- Design/implement the recovery export, staging collections, checksum manifest, commit marker and rollback before any future destructive schema migration.
- Add native, version-pinned provider JSON parsers only under separately approved acceptance criteria.
- Decide post-Phase1 projection synchronization semantics and align Conversation deletion with the frozen independent Proposal/Knowledge lifecycle.
- Do not start M–Z/AA without a new explicit scope.
