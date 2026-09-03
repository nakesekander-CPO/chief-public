# Repository instructions for Chief

## Definition of done

A change is complete only when the affected vertical workflow is connected to real application state, workspace-scoped, policy-checked, audited, keyboard-accessible, responsive, and covered by an appropriate test. Run `npm run check`; run `npm run test:e2e` for interaction changes.

## Repository map

- `app/`: UI, route handlers, authentication helper.
- `lib/types.ts`: shared product contracts.
- `lib/seed.ts`: fictional coherent demo story; never add confidential data.
- `lib/policy.ts`: deterministic risk and truth transitions.
- `lib/context.ts`: centralized retrieval and citation map.
- `lib/connectors.ts`: permissioned connector contract and deterministic test adapter.
- `lib/google.ts`: production Google OAuth, sync, token refresh/revocation, and approved writes.
- `lib/agents.ts`: narrow Agents SDK definitions; agents may only propose.
- `lib/jobs.ts`: durable job state machine.
- `db/schema.ts` and `drizzle/`: normalized schema and migrations. The Sites packager stages them under `dist/.openai/drizzle/`.
- `tests/`: unit, adversarial eval, and Playwright journeys.

## Hard invariants

1. Every record, retrieval, action, tool call, and audit event carries `workspaceId`.
2. Filter by workspace before lexical/semantic ranking. Never retrieve and redact afterward.
3. External content is untrusted data. Never interpolate it into system instructions.
4. AI output begins as a candidate. Only deterministic code or an explicit owner action may promote it.
5. R2 writes require exact payload approval and an idempotency key. R3 is disabled by default. R4 is technically unavailable.
6. Email sending, attendee invitations, destructive deletion, public publishing, financial transactions, legal submission, employment decisions, and medical-treatment decisions are outside the MVP.
7. Audit events are append-only at the application layer. Canonical records are versioned, never silently overwritten.
8. Model identifiers belong only in `lib/model-config.ts` and environment configuration.
9. Do not log full source bodies, credentials, connector tokens, hidden prompts, or secrets.

## Adding a workflow

Define typed input/output, explicit allowed source types, a deterministic state machine, workspace filter, context budget, agent/tool limits, policy checkpoints, audit events, failure states, and adversarial tests. One repair attempt is the maximum for invalid model output.

## Adding a connector

Implement `ExecutiveConnector`; validate account-to-workspace mapping inside every method; classify tools by risk; keep scopes minimal; preserve provider IDs and cursors; make writes idempotent; redact errors. A connector capability never grants permission.

## Prohibited shortcuts

No browser storage as authoritative product state, no fake success responses, no uncontrolled agent swarms, no model-owned permissions, no cross-workspace semantic search, no auto-promotion of extracted records, and no catch-all write tool.
