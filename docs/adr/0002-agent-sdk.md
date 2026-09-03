# ADR 0002: Official OpenAI Agents SDK for TypeScript

**Status:** Accepted · 3 September 2026

Use the Responses API for the Cloudflare-hosted synthesis route and keep agent topology as typed application definitions. The current official Agents SDK supports structured output, tool guardrails, sessions, tracing, MCP, and interruption-based human approval; however, its current PKCE dependency does not resolve under the Worker condition set used by Vinext. A self-hosted agent service can adopt it without changing contracts. Chief implements authorization and approval as deterministic application policy; SDK approval would be defense in depth, not the source of truth. Models are centralized in `lib/model-config.ts`.
