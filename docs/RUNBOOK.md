# Runbook

## Local operation

Install dependencies, copy `.env.example` to `.env`, and run `npm run dev`. The local runtime supplies D1 and uses `CHIEF_OWNER_NAME` plus `CHIEF_OWNER_EMAIL` as the local-only identity. `GET /api/health` returns liveness and whether live model execution is configured.

## Release

Run `npm run check`, generate and inspect migrations after schema changes, then deploy the exact successful build through Sites. Do not publish a version with ambiguous access; Chief should remain owner-only by default.

## Failure handling

- Connector revoked: mark stale, stop retries, preserve last-source timestamps, request reconnection.
- Transient provider failure: bounded exponential backoff with jitter, circuit-break on repeated failure.
- Invalid model output: one repair attempt, then fail visibly without candidate mutation.
- Approval expired: do not execute; regenerate an exact preview.
- Version conflict: reload authoritative D1 state before retrying a user edit.
- Dead letter: expose the job and redacted reason in the developer inspector.

## Backup, restore, export, deletion

Use D1 point-in-time export for backup. Restore into a separate database and verify workspace counts and audit continuity before switching bindings. Workspace export should include canonical records, source metadata, audit events, and user-authored content. High-friction deletion must remove sources, chunks, embeddings, connector mapping, and derived artifacts, then append a non-content deletion audit record. Never delete audit content silently.

Rotate OAuth encryption keys by adding a new versioned key, writing new tokens with it, then re-encrypting old tokens before retiring the prior key. Never log keys or tokens.
