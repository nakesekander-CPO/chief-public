# ADR 0006: Native deterministic connector adapters

**Status:** Accepted · 3 September 2026

Use provider APIs for Gmail, Calendar, and Contacts because cursors, idempotency, scopes, and exact writes are deterministic. MCP remains an optional capability transport and never a permission grant. Every connector call receives user/workspace/account mapping, validates policy independently, and exposes only read, draft, or private-event capabilities in the MVP.
