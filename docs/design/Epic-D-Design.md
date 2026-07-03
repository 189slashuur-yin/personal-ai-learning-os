# Epic D Design: Task / Productivity Layer

## Status

Architecture Pack v1 is frozen. D0 is complete as a documentation milestone; D1–D5 remain planned and require their own implementation acceptance checks. No Task runtime code or storage exists as a result of this document.

## Product intent

Epic D adds a minimal action layer beside the existing knowledge workflow. It lets the user capture, place, schedule, complete, and trace Tasks without turning Knowledge into a task manager or letting AI act autonomously.

Epic D phase one does **only Task**. It does not implement Agent, Calendar, or RAG. It also excludes reminders, recurrence, Pomodoro, habits, and workflow automation.

## Delivery sequence

### D0 — RFC / Domain Model (frozen)

- Accept [RFC-003 Task Domain](../rfc/RFC-003-task-domain.md).
- Freeze the [Domain Model](../architecture/DOMAIN_MODEL.md), [Domain Boundaries](../architecture/DOMAIN_BOUNDARIES.md), and [Data Lifecycle](../architecture/DATA_LIFECYCLE.md).
- Record Task as planned, Activity as planned/not immediate, and Memory/Agent as future.
- No runtime, storage, route, or package change.

### D1 — Task Domain

- Add Task entity, `TaskType`, `SourceRef`, Contract, BrowserStorage adapter, and Task Service.
- Support user-driven create, edit, complete, reopen, move, reschedule, and delete.
- Normalize missing/invalid Workspace placement to Inbox without touching old data.
- Preserve linked Task when Conversation or Knowledge is deleted; resolve its source as `deleted`.
- Move Tasks to Inbox when their Workspace is deleted.
- Add unit-level or repository-appropriate verification for view predicates and cross-domain deletion rules.

Acceptance requires the exact RFC-003 boundaries and all repository quality checks. D1 does not include a full Today UI.

### D2 — Today / Task UI

- Add Task navigation and Inbox / Today / Upcoming / Completed views.
- Use local-date semantics from RFC-003; Today includes overdue open Tasks.
- Provide explicit confirmation for destructive actions and clear empty/degraded states.
- Keep Workspace as an orthogonal filter and do not present a Calendar grid.

### D3 — Source-linked Task

- Create or link a Task from Conversation and Knowledge user flows.
- Display source type, current title when available, and `deleted` when missing.
- Navigate only when the source resolves.
- Any AI assistance is suggestion-only and unpersisted until explicit user confirmation; enabling a real AI Provider is outside this Epic.

### D4 — Activity (planned, not immediate)

- D4 is not part of the first implementation phase and must not be started automatically after D3.
- Before coding, approve event vocabulary, actor, ordering, retention/deletion, compatibility, privacy, and QA in a separate design update or RFC.
- Activity records facts and never owns Task or Knowledge state.

### D5 — Release v0.7

- Stabilize and document only the Epic D scope actually implemented.
- Run regression and manual QA for legacy Sprint1–Sprint11 data, Conversation/Knowledge deletion, Workspace fallback, source degradation, and Task views.
- Publish release notes with explicit limitations and no implied Agent, Calendar, RAG, reminder, or recurrence support.

## Architecture invariants

1. Task is independent from Knowledge and Conversation lifecycle.
2. Knowledge does not acquire action status; Task does not acquire knowledge content.
3. Inbox / Today / Upcoming / Completed are derived views over one Task collection.
4. AI can suggest but cannot create, complete, or delete Task.
5. Page, Component, Service, and Provider never access LocalStorage directly; persistence goes through the Task Contract and BrowserStorage.
6. Activity is not current business state and is not immediate scope.
7. Existing Proposal → Review → KnowledgeCard behavior remains unchanged.

## Release gate

D5 can be marked complete only when implemented parts have documented acceptance, old-data compatibility, manual lifecycle coverage, `npm run lint`, `npm run build`, and `git diff --check` passing. Architecture approval alone does not change the current v0.6 feature matrix.

