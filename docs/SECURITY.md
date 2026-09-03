# Security and privacy

## Threat model

Primary risks are workspace leakage, prompt injection through external content, excessive connector scopes, approval bypass, duplicate consequential writes, OAuth token exposure, XSS, CSRF, and sensitive source content in logs.

## Implemented controls

- Workspace IDs are mandatory in domain contracts and filtered before retrieval ranking.
- SIWC identity is read server-side; client identity is never trusted for authorization.
- Mutations use an HttpOnly same-site CSRF cookie plus an in-memory header token and same-origin check.
- State payloads are size-limited, validated, and version-checked.
- External excerpts are marked untrusted; injection patterns are detected and tested.
- Policy code, not a model, assigns R0–R4 and gates writes.
- R2 Google and Microsoft connector methods re-check approval, workspace mapping, provider-scoped idempotency, and calendar-attendee restrictions.
- Google and Microsoft OAuth use one-time expiring provider-bound state plus PKCE. Tokens are versioned AES-GCM ciphertext in D1 and are never returned to the browser.
- Dynamic workspace creation begins empty; state validation rejects records, citations, participants, or brief outcomes that cross workspace boundaries.
- R4 operations are absent from connector interfaces.
- Client-visible errors use problem details and request IDs; no stack traces are returned.
- No secrets or live personal/company information belong in the shareable repository. Examples use fictional identities; local and hosted values stay in ignored or managed secret storage.
- Hosted access is intended to be owner-only.

## Remaining production hardening

Add incremental provider cursors, key rotation automation, Google Cross-Account Protection, durable distributed rate limits, and independent penetration testing before expanding access beyond the owner. Gmail's draft-capable `gmail.compose` OAuth scope also authorizes sending at the provider layer even though Chief implements no send endpoint; public distribution requires an explicit risk decision and may trigger Google's restricted-scope verification and assessment requirements. Upload scanning remains required before adding file ingestion. Do not claim compliance certification without an independent assessment.

Incident response: disable the affected connector, revoke tokens, rotate the encryption key, preserve redacted audit metadata, identify impacted workspaces, and notify the owner with confirmed scope only.
