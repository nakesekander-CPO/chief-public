# ADR 0003: D1 demo persistence; PostgreSQL production seam

**Status:** Accepted for hosted demo · 3 September 2026

Sites provides D1, so the hosted release persists an atomic, versioned, per-owner typed snapshot and includes normalized relational migrations. A production multi-user deployment should promote normalized tables to the runtime source of truth and use PostgreSQL plus pgvector behind an HTTPS service when scale or semantic-search quality requires it. Embeddings are retrieval indexes, never authoritative memory.
