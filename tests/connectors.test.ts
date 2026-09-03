import { describe, expect, it } from 'vitest';
import { ConnectorPolicyError, MockGoogleConnector } from '../lib/connectors';

const context = { userId: 'owner', workspaceId: 'northstar' as const, connectedAccountId: 'demo', mappedWorkspaceId: 'northstar' as const, approved: true };

describe('connector policy boundary', () => {
  it('executes an approved draft once', async () => {
    const connector = new MockGoogleConnector();
    const input = { idempotencyKey: 'draft-1', to: 'elena@example.demo', subject: 'Update', body: 'Draft only.' };
    const first = await connector.createGmailDraft(context, input);
    const second = await connector.createGmailDraft(context, input);
    expect(first.duplicate).toBe(false);
    expect(second).toEqual({ providerId: first.providerId, duplicate: true });
  });

  it('fails closed without approval or workspace mapping', async () => {
    const connector = new MockGoogleConnector();
    await expect(connector.createGmailDraft({ ...context, approved: false }, { idempotencyKey: 'x', to: 'x', subject: 'x', body: 'x' })).rejects.toBeInstanceOf(ConnectorPolicyError);
    await expect(connector.createGmailDraft({ ...context, mappedWorkspaceId: 'private' }, { idempotencyKey: 'y', to: 'x', subject: 'x', body: 'x' })).rejects.toBeInstanceOf(ConnectorPolicyError);
  });

  it('cannot invite attendees through the MVP calendar write', async () => {
    const connector = new MockGoogleConnector();
    await expect(connector.createPrivateCalendarEvent(context, { idempotencyKey: 'event', title: 'Review', start: '10:00', end: '10:30', attendees: ['external@example.demo'] })).rejects.toThrow(/cannot invite attendees/i);
  });
});
