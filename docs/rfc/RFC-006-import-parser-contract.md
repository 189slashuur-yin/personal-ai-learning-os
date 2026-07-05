# RFC-006: Import and Parser Contract

## Status

Proposed for v1.0 Phase0 architecture freeze. Human approval required before implementation.

## Context

The current product supports TXT and Clipboard profiles, but source producer, transport channel, file format, parsing rules, persistence and Conversation creation are coupled in UI flows. v1.0 needs one import boundary that can safely support Clipboard, GPT Export, Claude Export, Markdown, TXT and JSON without letting parser code write storage or silently discard unknown content.

## Decision

Import is an application workflow, not a Conversation subtype and not a Parser side effect.

```text
ImportArtifact
  → format detection
  → selected versioned Parser
  → ParseResult
  → ImportPreview + warnings
  → explicit user confirmation
  → ImportService persists ImportReceipt + Conversation/Source/Round/Message
```

## Input concepts

- **Channel**: `clipboard` or `file`. Channel describes how bytes/text entered the app.
- **Format**: `gpt-export`, `claude-export`, `markdown`, `txt`, or `json`.
- **Producer**: optional source system such as ChatGPT or Claude.
- **ImportArtifact**: immutable in-memory input descriptor containing name, media type, size, optional hash, text/bytes and detected format candidates.

Clipboard is a channel, not a format. A Clipboard payload may be Markdown, TXT, JSON, or a recognizable provider transcript.

## Parser contract

Every parser is pure and versioned:

```text
Parser
  id
  version
  supports(artifact) → confidence + reasons
  parse(artifact, options) → ParseResult
```

`ParseResult` contains:

- zero or more `ConversationDraft` records;
- each draft's source metadata and ordered `RoundDraft` / `MessageDraft` records;
- parser ID/version and detected producer/format;
- warnings, errors and diagnostics with locations where possible;
- unconsumed content or a count/hash proving that some input was not mapped;
- suggested titles and external source IDs when present;
- record counts used by preview and validation.

Parser code must not access BrowserStorage, create canonical IDs, call a Provider, create Proposal/Knowledge, or mutate existing Conversation data.

## Supported parser behavior

### GPT Export

- Recognize the approved ChatGPT export schema version(s).
- One exported chat becomes one ConversationDraft.
- Preserve message order, roles, timestamps when valid, external chat/message IDs as provenance metadata, and unsupported nodes as warnings.
- A multi-chat export creates multiple drafts under one ImportReceipt.

### Claude Export

- Recognize the approved Claude export schema version(s).
- One exported conversation becomes one ConversationDraft.
- Preserve supported roles/order/timestamps and report unsupported content blocks or attachments without inventing text.

### Markdown

- Preserve the complete source segment.
- Use explicit role headings/labels when recognized; otherwise import as deterministic `unknown` Messages rather than dropping paragraphs.
- Code fences must remain intact and must not trigger speaker detection inside the fence.

### TXT

- Preserve the complete text.
- Apply the selected deterministic role profile when present.
- If no roles are recognized, create one `unknown` Message and one unanswered Round.

### JSON

- JSON is a container format, not permission to guess arbitrary semantics.
- Recognized GPT/Claude schemas delegate to their dedicated parsers.
- A separately approved generic schema may be mapped only after preview.
- Unknown JSON must be rejected with diagnostics or offered as preserved plain text; it must never be evaluated as code or partially imported without warning.

## Preview and confirmation

Before any write, the user sees:

- detected channel, format, producer, parser and parser version;
- number of Conversations, Rounds and Messages;
- suggested titles and a bounded content preview;
- unknown roles, unsupported blocks, missing timestamps and unconsumed content;
- whether the operation creates new Conversations or explicitly appends to one existing Conversation;
- collision/conflict behavior and estimated local storage impact.

Import requires explicit confirmation. Parser confidence never authorizes persistence.

## Persistence and provenance

After confirmation, ImportService creates canonical IDs and writes through Contracts. A successful import creates an immutable `ImportReceipt` containing metadata only:

- receipt ID, time, channel, format and producer;
- parser ID/version;
- artifact name, size and optional hash;
- created Conversation IDs and external conversation IDs;
- counts, warnings and completion status.

Each Conversation retains its own ImportedSource segment and provenance reference to the receipt. The full multi-chat export is not duplicated into every Conversation. Whether the original whole artifact is retained must be an explicit user choice and cannot exceed LocalStorage safety limits silently.

ImportReceipt references Conversations but does not own their lifecycle. Deleting a Conversation leaves a missing reference in the receipt for audit; deleting a receipt never deletes Conversations.

## Failure and recovery

- Detection or parse failure writes nothing.
- Preview cancellation writes nothing.
- Persistence uses a staged plan, preflight validation and recovery snapshot because LocalStorage has no transaction.
- Partial writes must be detected and rolled back or reported as incomplete; the UI must not report success.
- Retry uses the same artifact hash, parser version and options when available.
- Import logs and errors must not include full private transcript content.

## Relationship to backup/restore import

Content Import and PALOS Data Restore are different workflows. RFC-006 parses external content into new domain records. A versioned PALOS export/restore preserves canonical IDs and full cross-collection relationships and requires its own exchange-schema RFC. Generic JSON Import must not accept a PALOS backup as content by accident.

## Non-goals

- Implementing parsers in Phase0
- Provider calls or AI-assisted parsing
- HTML/DOM scraping
- Attachment-byte import, OCR or filesystem scanning
- Silent append, silent merge or automatic conflict resolution
- Database migration, cloud sync, RAG or embedding
