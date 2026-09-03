export type JobStatus = 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELED' | 'AWAITING_APPROVAL' | 'DEAD_LETTER';

export interface DurableJob {
  id: string;
  workspaceId: string;
  workflow: string;
  status: JobStatus;
  attempt: number;
  maxAttempts: number;
  idempotencyKey: string;
  leaseExpiresAt?: number;
  history: Array<{ status: JobStatus; at: number; reason?: string }>;
}

const allowedTransitions: Record<JobStatus, JobStatus[]> = {
  QUEUED: ['RUNNING', 'CANCELED'], RUNNING: ['SUCCEEDED', 'FAILED', 'AWAITING_APPROVAL', 'CANCELED'],
  FAILED: ['QUEUED', 'DEAD_LETTER'], AWAITING_APPROVAL: ['QUEUED', 'CANCELED'],
  SUCCEEDED: [], CANCELED: [], DEAD_LETTER: [],
};

export function transitionJob(job: DurableJob, next: JobStatus, now: number, reason?: string): DurableJob {
  if (!allowedTransitions[job.status].includes(next)) throw new Error(`Invalid job transition: ${job.status} → ${next}`);
  const attempt = next === 'RUNNING' ? job.attempt + 1 : job.attempt;
  if (next === 'QUEUED' && job.attempt >= job.maxAttempts) throw new Error('Retry budget exhausted; move the job to dead letter.');
  return { ...job, status: next, attempt, leaseExpiresAt: next === 'RUNNING' ? now + 60_000 : undefined, history: [...job.history, { status: next, at: now, reason }] };
}

export function retryDelayMs(attempt: number, jitter = 0.5): number {
  const base = Math.min(60_000, 1_000 * 2 ** Math.max(0, attempt - 1));
  return Math.round(base * (0.75 + Math.max(0, Math.min(1, jitter)) * 0.5));
}

export const scheduledWorkflows = [
  { workflow: 'CONNECTOR_SYNC', schedule: 'every 15 minutes' },
  { workflow: 'DAILY_BRIEF', schedule: '06:30 Europe/Dublin' },
  { workflow: 'MEETING_PREP', schedule: '24 hours and 2 hours before' },
  { workflow: 'COMMITMENT_RISK_SCAN', schedule: '07:00 Europe/Dublin' },
  { workflow: 'WEEKLY_REVIEW', schedule: 'Monday 07:00 Europe/Dublin' },
] as const;
