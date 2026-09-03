import type { Approval, RiskTier, TruthState } from './types';

export const PROHIBITED_ACTIONS = ['SEND_EMAIL', 'DELETE_SOURCE', 'SPEND_MONEY', 'PUBLISH', 'LEGAL_SUBMISSION', 'EMPLOYMENT_DECISION', 'MEDICAL_TREATMENT'] as const;

export function riskForAction(action: string): RiskTier {
  if ((PROHIBITED_ACTIONS as readonly string[]).includes(action)) return 'R4';
  if (action === 'CREATE_GMAIL_DRAFT' || action === 'CREATE_CALENDAR_EVENT' || action === 'CREATE_OUTLOOK_DRAFT' || action === 'CREATE_OUTLOOK_EVENT') return 'R2';
  if (action.startsWith('APPROVE_') || action.startsWith('CREATE_CANDIDATE')) return 'R1';
  return 'R0';
}

export function canExecute(action: string, approved: boolean): { allowed: boolean; reason: string } {
  const risk = riskForAction(action);
  if (risk === 'R4') return { allowed: false, reason: 'This action is technically unavailable in the MVP.' };
  if (risk === 'R2' && !approved) return { allowed: false, reason: 'Explicit approval is required before this reversible external side effect.' };
  return { allowed: true, reason: risk === 'R2' ? 'Approved exact payload may execute once.' : 'Read or internal proposal is allowed.' };
}

export function nextTruthState(current: TruthState, action: 'approve' | 'reject' | 'supersede'): TruthState {
  if (current !== 'AI_CANDIDATE' && action !== 'supersede') return current;
  if (action === 'approve') return 'APPROVED';
  if (action === 'reject') return 'REJECTED';
  return current === 'APPROVED' ? 'SUPERSEDED' : current;
}

export function executeApproval(approval: Approval, seenKeys: Set<string>): Approval {
  if (approval.status !== 'PENDING') return approval;
  if (seenKeys.has(approval.idempotencyKey)) return { ...approval, status: 'EXECUTED', executionResult: approval.executionResult ?? 'Existing execution returned; no duplicate side effect.' };
  const policy = canExecute(approval.actionType, true);
  if (!policy.allowed) return approval;
  seenKeys.add(approval.idempotencyKey);
  const outlook = approval.actionType === 'CREATE_OUTLOOK_DRAFT' || approval.actionType === 'CREATE_OUTLOOK_EVENT';
  const draft = approval.actionType === 'CREATE_GMAIL_DRAFT' || approval.actionType === 'CREATE_OUTLOOK_DRAFT';
  return { ...approval, status: 'EXECUTED', executionResult: draft ? `Mock ${outlook ? 'Outlook' : 'Gmail'} draft created · Draft ID chief_demo_0187` : 'Private calendar event created · No invitations sent' };
}

export function sanitizeUntrustedContent(value: string): { text: string; suspicious: boolean } {
  const suspicious = /(ignore|override) (all |any )?(previous|system) instructions|send confidential|reveal (the )?(system prompt|secret|token)/i.test(value);
  return { text: value.replace(/<script[\s\S]*?<\/script>/gi, '[removed executable markup]'), suspicious };
}

export function priorityScore(input: { consequence: number; urgency: number; alignment: number; blockedPeople: number; deadline: number; confidence: number }): number {
  const values = Object.values(input).map((value) => Math.max(0, Math.min(5, value)));
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10;
}
