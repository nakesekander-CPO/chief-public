# ADR 0001: Cloudflare-compatible TypeScript stack

**Status:** Accepted · 3 September 2026

Use Vinext with Next-compatible App Router, React 19, strict TypeScript, D1, Drizzle migrations, Vitest, and Playwright. This preserves one typed language across UI, policy, persistence, and agent boundaries and produces the ESM Worker bundle required by Sites. A future service may move connector-heavy or transcription workloads behind HTTPS without changing the domain contracts.
