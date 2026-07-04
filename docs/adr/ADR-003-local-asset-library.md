# ADR-003: Local Asset Library

## Status

Accepted for v0.9 metadata foundation.

## Context

PALOS needs to associate conversations, knowledge, tasks, and workspaces with unstructured local files. The current browser runtime stores structured records in LocalStorage. Putting file bytes or base64 payloads in that store would quickly consume quota, block the main thread during serialization, make records harder to inspect and migrate, and turn one large attachment into a risk for the whole local dataset.

A database BLOB would not solve the current product boundary either: PALOS has no database runtime, and introducing one only for attachments would create a migration, deployment, and backup system before it is otherwise needed.

## Decision

PALOS uses a local asset-library design:

- File content lives in a user-controlled local `assets/` path or another explicitly chosen filesystem location.
- Structured storage saves only Asset metadata: owner entity, filename/original name, MIME type, size, hash, local/relative path, note, and timestamps.
- The browser implementation records metadata only. It does not copy files into the project, upload them, or read arbitrary local paths.
- A future CLI or desktop adapter may manage copying and integrity checks through an `AssetStorage`/asset-library boundary without changing domain owners.

## Why metadata belongs in structured storage

Metadata is small, queryable, and sufficient to show ownership, path, notes, integrity hints, and backup requirements. Keeping it behind a Core contract preserves the current `Entity → Contract ← BrowserStorage` dependency direction. File bytes remain independent of LocalStorage quota and serialization.

## Why start with local paths

Local paths match PALOS's single-user, local-first phase and work without credentials, network availability, recurring fees, or a cloud privacy policy. A relative path can remain portable inside a PALOS data/asset bundle; an optional absolute local path can describe files the browser version does not manage.

Path existence is not guaranteed. Missing files are a valid degraded state and must be reported honestly rather than deleting metadata or inventing a replacement.

## Future object-storage migration

If OBS, S3, or another object store is approved later, a new asset-content adapter can map the same Asset identity to an object key and store provider/location metadata. Migration should:

1. copy bytes with checksum verification;
2. retain the Asset ID and owner reference;
3. record object key, version, and migration result separately from the original path;
4. keep local metadata readable until verification succeeds;
5. define credentials, encryption, privacy, deletion, cost, offline, and rollback behavior in a new RFC.

The UI and owning domains should depend on Asset Service/Contract, not OBS/S3 SDKs.

## Local backup strategy

- Create timestamped, non-overwriting backup directories or archives.
- Include repository documentation and project-local `data/` when present.
- Include a managed project-local `assets/` library when such a directory is introduced and explicitly in scope.
- Preserve Asset metadata and relative paths together with managed files.
- Treat absolute external paths as references only; the backup script must not follow them or read files outside the project.
- Allow the backup target itself to be outside the project, such as an iCloud Drive folder.
- Verify copy failures and report them; never describe a partial backup as complete.

Browser LocalStorage requires a separate explicit export/import capability before it can be included in a filesystem backup. v0.9's script foundation does not silently claim to back up browser-only records.

## Consequences

The initial browser experience requires users to enter file metadata and keep the referenced file organized themselves. In exchange, PALOS avoids quota-heavy binary persistence and preserves a clean migration path toward a CLI-managed local library or approved object storage.

## Non-goals

- File upload or automatic copying in the browser
- Reading arbitrary user files
- Cloud sync, OBS/S3 integration, or credential storage
- Database migration or BLOB storage
- Content extraction, OCR, embeddings, or RAG
