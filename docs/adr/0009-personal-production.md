# ADR 0009: Personal production activation

**Status:** Accepted · 3 September 2026

Chief starts with empty, authenticated owner-scoped workspaces instead of fictional records. Existing sample snapshots are migrated once to an empty personal state. Google uses a Worker-native OAuth Authorization Code flow with PKCE, expiring one-time state, exact configured redirects, encrypted tokens, and a per-workspace account mapping. The connector reads a bounded source window and exposes only Gmail draft creation and attendee-free Calendar event creation behind explicit R2 approval. Live OpenAI synthesis remains disabled until its server-side secret exists; there is no deterministic response presented as model output.
