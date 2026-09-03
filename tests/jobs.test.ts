import { describe, expect, it } from 'vitest';
import { retryDelayMs, transitionJob, type DurableJob } from '../lib/jobs';

const job: DurableJob = { id: 'job-1', workspaceId: 'northstar', workflow: 'DAILY_BRIEF', status: 'QUEUED', attempt: 0, maxAttempts: 3, idempotencyKey: 'brief-2026-09-03', history: [] };

describe('durable job state machine', () => {
  it('leases running work and records history', () => {
    const running = transitionJob(job, 'RUNNING', 1_000);
    expect(running.attempt).toBe(1);
    expect(running.leaseExpiresAt).toBe(61_000);
    expect(running.history).toHaveLength(1);
  });

  it('rejects invalid state transitions', () => {
    expect(() => transitionJob(job, 'SUCCEEDED', 1_000)).toThrow(/Invalid job transition/);
  });

  it('uses bounded exponential backoff with jitter', () => {
    expect(retryDelayMs(1, 0.5)).toBe(1_000);
    expect(retryDelayMs(20, 1)).toBe(75_000);
  });
});
