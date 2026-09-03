import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getChatGPTUser } from '@/app/chatgpt-auth';
import { executeGoogleApproval, GoogleConnectorError } from '@/lib/google';
import { executeMicrosoftApproval, MicrosoftConnectorError } from '@/lib/microsoft';
import { validMutation } from '@/lib/http-security';
import { loadState, saveState, StateConflictError } from '@/lib/store';
import type { AuditEvent } from '@/lib/types';
import { ownsWorkspace } from '@/lib/workspaces';

export const dynamic = 'force-dynamic';
const schema = z.object({ approvalId: z.string().min(1).max(200), workspaceId: z.string().min(2).max(64) });

export async function POST(request: NextRequest) {
  if (!validMutation(request)) return NextResponse.json({ title: 'Request rejected', detail: 'CSRF validation failed.', status: 403 }, { status: 403 });
  const user = await getChatGPTUser();
  if (!user) return NextResponse.json({ title: 'Sign in required', status: 401 }, { status: 401 });
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ title: 'Invalid approval request', status: 422 }, { status: 422 });
  const current = await loadState(user.userId, { name: user.displayName, email: user.email });
  if (!ownsWorkspace(current, parsed.data.workspaceId)) return NextResponse.json({ title: 'Workspace denied', status: 403 }, { status: 403 });
  const approval = current.approvals.find((item) => item.id === parsed.data.approvalId && item.workspaceId === parsed.data.workspaceId);
  if (!approval) return NextResponse.json({ title: 'Approval not found in this workspace', status: 404 }, { status: 404 });
  try {
    const microsoft = approval.actionType === 'CREATE_OUTLOOK_DRAFT' || approval.actionType === 'CREATE_OUTLOOK_EVENT';
    const result = microsoft ? await executeMicrosoftApproval(user.userId, approval) : await executeGoogleApproval(user.userId, approval);
    const draft = approval.actionType === 'CREATE_GMAIL_DRAFT' || approval.actionType === 'CREATE_OUTLOOK_DRAFT';
    const executionResult = draft
      ? `${microsoft ? 'Outlook' : 'Gmail'} draft created · Draft ID ${result.providerId}`
      : `Private ${microsoft ? 'Outlook' : 'Google Calendar'} event created · Event ID ${result.providerId} · No invitations sent`;
    const audit: AuditEvent = { id: `audit-execute-${Date.now()}`, workspaceId: approval.workspaceId, timestamp: 'Just now', actor: user.displayName, action: draft ? `Created ${microsoft ? 'Outlook' : 'Gmail'} draft` : 'Created private calendar event', detail: `${executionResult}. Idempotency key ${approval.idempotencyKey}${result.duplicate ? ' returned the existing result' : ''}.`, riskTier: 'R2', outcome: 'SUCCEEDED' };
    const next = { ...current, approvals: current.approvals.map((item) => item.id === approval.id ? { ...item, status: 'EXECUTED' as const, executionResult } : item), audit: [audit, ...current.audit] };
    const state = await saveState(user.userId, next, current.version);
    return NextResponse.json({ state, duplicate: result.duplicate });
  } catch (error) {
    if (error instanceof StateConflictError) return NextResponse.json({ title: 'Version conflict', detail: error.message, status: 409 }, { status: 409 });
    const detail = error instanceof GoogleConnectorError || error instanceof MicrosoftConnectorError ? error.message : 'The approved action failed safely.';
    return NextResponse.json({ title: 'Execution failed', detail, status: 502 }, { status: 502 });
  }
}
