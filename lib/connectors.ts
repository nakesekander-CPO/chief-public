import { canExecute } from './policy';
import type { WorkspaceId } from './types';

export interface ConnectorContext {
  userId: string;
  workspaceId: WorkspaceId;
  connectedAccountId: string;
  mappedWorkspaceId: WorkspaceId;
  approved: boolean;
}

export interface ConnectorHealth {
  provider: string;
  status: 'HEALTHY' | 'DEGRADED' | 'REVOKED';
  lastSuccessfulSync: string | null;
  scopes: string[];
}

export interface GmailDraftInput {
  idempotencyKey: string;
  threadId?: string;
  to: string;
  subject: string;
  body: string;
}

export interface CalendarEventInput {
  idempotencyKey: string;
  title: string;
  start: string;
  end: string;
  attendees: string[];
}

export interface ExecutiveConnector {
  health(): Promise<ConnectorHealth>;
  sync(cursor?: string): Promise<{ cursor: string; changedSourceIds: string[] }>;
  createGmailDraft(context: ConnectorContext, input: GmailDraftInput): Promise<{ providerId: string; duplicate: boolean }>;
  createPrivateCalendarEvent(context: ConnectorContext, input: CalendarEventInput): Promise<{ providerId: string; duplicate: boolean }>;
}

export class MockGoogleConnector implements ExecutiveConnector {
  private readonly executions = new Map<string, string>();

  async health(): Promise<ConnectorHealth> {
    return { provider: 'Google mock', status: 'HEALTHY', lastSuccessfulSync: '6 minutes ago', scopes: ['gmail.readonly', 'gmail.compose', 'calendar.readonly', 'calendar.events.owned', 'contacts.readonly'] };
  }

  async sync(cursor = 'demo-0') {
    return { cursor: cursor === 'demo-0' ? 'demo-1' : cursor, changedSourceIds: cursor === 'demo-0' ? ['src-elena', 'src-calendar-council'] : [] };
  }

  async createGmailDraft(context: ConnectorContext, input: GmailDraftInput) {
    this.assertWrite(context, 'CREATE_GMAIL_DRAFT');
    return this.idempotent(input.idempotencyKey, 'gmail-draft');
  }

  async createPrivateCalendarEvent(context: ConnectorContext, input: CalendarEventInput) {
    this.assertWrite(context, 'CREATE_CALENDAR_EVENT');
    if (input.attendees.length) throw new ConnectorPolicyError('MVP calendar writes cannot invite attendees.');
    return this.idempotent(input.idempotencyKey, 'calendar-event');
  }

  private assertWrite(context: ConnectorContext, action: string) {
    if (context.workspaceId !== context.mappedWorkspaceId) throw new ConnectorPolicyError('Connected account is not mapped to this workspace.');
    const decision = canExecute(action, context.approved);
    if (!decision.allowed) throw new ConnectorPolicyError(decision.reason);
  }

  private idempotent(key: string, prefix: string) {
    const existing = this.executions.get(key);
    if (existing) return { providerId: existing, duplicate: true };
    const providerId = `${prefix}-${this.executions.size + 1}`;
    this.executions.set(key, providerId);
    return { providerId, duplicate: false };
  }
}

export class ConnectorPolicyError extends Error {}

export const futureConnectorKinds = ['TEAMS', 'GENERIC_MCP', 'FILE_SOURCE', 'CRM', 'MARKDOWN_VAULT'] as const;
