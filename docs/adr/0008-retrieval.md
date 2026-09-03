# ADR 0008: Central workspace-first hybrid retrieval

**Status:** Accepted · 3 September 2026

Agents do not improvise retrieval. `lib/context.ts` filters workspace authorization first, then ranks lexical/semantic candidates, boosts active canonical records, penalizes suspicious and superseded content, truncates deterministically, and emits a citation map plus omission count. Cross-workspace similarity can never override isolation.
