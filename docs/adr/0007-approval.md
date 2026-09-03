# ADR 0007: Application-owned approval engine

**Status:** Accepted · 3 September 2026

Risk is assigned by deterministic policy: R0 read/compute, R1 internal proposal, R2 reversible external preparation, R3 disabled consequential write, R4 prohibited. The UI approves an exact versioned payload. Connector execution re-checks policy, workspace mapping, expiration, and idempotency. No agent can approve its own work or promote a candidate to truth.
