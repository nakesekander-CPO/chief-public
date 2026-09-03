import { env } from 'cloudflare:workers';
import { MICROSOFT_SCOPES, microsoftConfigured } from './microsoft-config';
import { sanitizeUntrustedContent } from './policy';
import type {
  AppState, Approval, InboxThread, Meeting, MicrosoftConnectionStatus, Outcome,
  Person, SourceItem, WorkspaceId,
} from './types';

export { MICROSOFT_SCOPES, microsoftConfigured } from './microsoft-config';

type AccountRow = {
  id: string;
  owner_id: string;
  workspace_id: WorkspaceId;
  email: string;
  access_token_cipher: string;
  refresh_token_cipher: string | null;
  expires_at: number;
  scopes: string;
  status: 'CONNECTED' | 'REAUTH_REQUIRED';
  last_synced_at: string | null;
};

let initialized = false;

async function ensureSchema() {
  if (initialized) return;
  const db = env.DB;
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS connector_accounts (
      id TEXT PRIMARY KEY NOT NULL,
      owner_id TEXT NOT NULL,
      workspace_id TEXT NOT NULL,
      provider TEXT NOT NULL,
      email TEXT NOT NULL,
      access_token_cipher TEXT NOT NULL,
      refresh_token_cipher TEXT,
      expires_at INTEGER NOT NULL,
      scopes TEXT NOT NULL,
      status TEXT NOT NULL,
      last_synced_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`),
    db.prepare('CREATE UNIQUE INDEX IF NOT EXISTS idx_connector_owner_workspace_provider ON connector_accounts(owner_id, workspace_id, provider)'),
    db.prepare(`CREATE TABLE IF NOT EXISTS oauth_states (
      state_hash TEXT PRIMARY KEY NOT NULL,
      owner_id TEXT NOT NULL,
      workspace_id TEXT NOT NULL,
      provider TEXT NOT NULL DEFAULT 'GOOGLE',
      code_verifier_cipher TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      used_at TEXT
    )`),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_oauth_states_owner_expires ON oauth_states(owner_id, expires_at)'),
    db.prepare(`CREATE TABLE IF NOT EXISTS connector_executions (
      idempotency_key TEXT PRIMARY KEY NOT NULL,
      owner_id TEXT NOT NULL,
      workspace_id TEXT NOT NULL,
      provider TEXT NOT NULL DEFAULT 'GOOGLE',
      action_type TEXT NOT NULL,
      provider_id TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_connector_executions_owner_workspace ON connector_executions(owner_id, workspace_id)'),
  ]);
  initialized = true;
}

function requireConfig() {
  if (!microsoftConfigured()) throw new MicrosoftConnectorError('Microsoft 365 is not configured for this Chief deployment.');
  const tenantId = process.env.MICROSOFT_TENANT_ID!;
  if (!/^[a-z0-9.-]+$/i.test(tenantId)) throw new MicrosoftConnectorError('Microsoft tenant configuration is invalid.');
  return {
    clientId: process.env.MICROSOFT_CLIENT_ID!,
    clientSecret: process.env.MICROSOFT_CLIENT_SECRET!,
    tenantId,
    redirectUri: process.env.MICROSOFT_REDIRECT_URI!,
  };
}

function identityBase(tenantId: string) {
  return `https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0`;
}

export async function getMicrosoftConnectionStatus(ownerId: string, workspaceId: WorkspaceId): Promise<MicrosoftConnectionStatus> {
  if (!microsoftConfigured()) return { configured: false, status: 'NOT_CONNECTED', scopes: [] };
  await ensureSchema();
  const row = await env.DB.prepare(`SELECT email, workspace_id, status, last_synced_at, scopes FROM connector_accounts
    WHERE owner_id = ? AND workspace_id = ? AND provider = 'MICROSOFT'`)
    .bind(ownerId, workspaceId)
    .first<{ email: string; workspace_id: WorkspaceId; status: 'CONNECTED' | 'REAUTH_REQUIRED'; last_synced_at: string | null; scopes: string }>();
  if (!row) return { configured: true, status: 'NOT_CONNECTED', scopes: MICROSOFT_SCOPES };
  return {
    configured: true,
    status: row.status,
    email: row.email,
    workspaceId: row.workspace_id,
    lastSyncedAt: row.last_synced_at ?? undefined,
    scopes: row.scopes.split(' ').filter(Boolean),
  };
}

export async function beginMicrosoftOAuth(ownerId: string, workspaceId: WorkspaceId) {
  const config = requireConfig();
  await ensureSchema();
  const state = randomToken(32);
  const codeVerifier = randomToken(48);
  const codeChallenge = await digest(codeVerifier);
  const stateHash = await digest(state);
  await env.DB.prepare(`DELETE FROM oauth_states WHERE owner_id = ? AND provider = 'MICROSOFT' AND expires_at < ?`).bind(ownerId, Date.now()).run();
  await env.DB.prepare(`INSERT INTO oauth_states (state_hash, owner_id, workspace_id, provider, code_verifier_cipher, expires_at, used_at)
    VALUES (?, ?, ?, 'MICROSOFT', ?, ?, NULL)`)
    .bind(stateHash, ownerId, workspaceId, await encrypt(codeVerifier), Date.now() + 10 * 60_000)
    .run();
  const url = new URL(`${identityBase(config.tenantId)}/authorize`);
  url.searchParams.set('client_id', config.clientId);
  url.searchParams.set('redirect_uri', config.redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('response_mode', 'query');
  url.searchParams.set('scope', MICROSOFT_SCOPES.join(' '));
  url.searchParams.set('prompt', 'select_account');
  url.searchParams.set('state', state);
  url.searchParams.set('code_challenge', codeChallenge);
  url.searchParams.set('code_challenge_method', 'S256');
  return { state, url: url.toString() };
}

export async function completeMicrosoftOAuth(ownerId: string, state: string, cookieState: string, code: string) {
  if (!state || !constantTimeEqual(state, cookieState)) throw new MicrosoftConnectorError('Microsoft connection state did not match.');
  const config = requireConfig();
  await ensureSchema();
  const stateHash = await digest(state);
  const row = await env.DB.prepare(`SELECT workspace_id, code_verifier_cipher, expires_at, used_at FROM oauth_states
    WHERE state_hash = ? AND owner_id = ? AND provider = 'MICROSOFT'`)
    .bind(stateHash, ownerId)
    .first<{ workspace_id: WorkspaceId; code_verifier_cipher: string; expires_at: number; used_at: string | null }>();
  if (!row || row.used_at || row.expires_at < Date.now()) throw new MicrosoftConnectorError('Microsoft connection state expired or was already used.');
  await env.DB.prepare('UPDATE oauth_states SET used_at = ? WHERE state_hash = ? AND used_at IS NULL').bind(new Date().toISOString(), stateHash).run();
  const tokenResponse = await fetch(`${identityBase(config.tenantId)}/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code,
      redirect_uri: config.redirectUri,
      grant_type: 'authorization_code',
      code_verifier: await decrypt(row.code_verifier_cipher),
      scope: MICROSOFT_SCOPES.join(' '),
    }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!tokenResponse.ok) throw new MicrosoftConnectorError('Microsoft did not complete the authorization exchange.');
  const tokens = await tokenResponse.json() as { access_token: string; refresh_token?: string; expires_in: number; scope?: string };
  const profile = await graphJson<{ id: string; mail?: string; userPrincipalName?: string }>(
    'https://graph.microsoft.com/v1.0/me?$select=id,mail,userPrincipalName',
    { authorization: `Bearer ${tokens.access_token}` },
  );
  const email = profile.mail ?? profile.userPrincipalName;
  if (!email) throw new MicrosoftConnectorError('Microsoft account identity did not include an email address.');
  const existing = await getAccount(ownerId, row.workspace_id);
  const refreshTokenCipher = tokens.refresh_token ? await encrypt(tokens.refresh_token) : existing?.refresh_token_cipher ?? null;
  if (!refreshTokenCipher) throw new MicrosoftConnectorError('Microsoft did not provide offline access. Reconnect and grant consent.');
  const now = new Date().toISOString();
  await env.DB.prepare(`INSERT INTO connector_accounts
    (id, owner_id, workspace_id, provider, email, access_token_cipher, refresh_token_cipher, expires_at, scopes, status, last_synced_at, created_at, updated_at)
    VALUES (?, ?, ?, 'MICROSOFT', ?, ?, ?, ?, ?, 'CONNECTED', NULL, ?, ?)
    ON CONFLICT(owner_id, workspace_id, provider) DO UPDATE SET
      email = excluded.email,
      access_token_cipher = excluded.access_token_cipher,
      refresh_token_cipher = excluded.refresh_token_cipher,
      expires_at = excluded.expires_at,
      scopes = excluded.scopes,
      status = 'CONNECTED',
      updated_at = excluded.updated_at`)
    .bind(`microsoft:${ownerId}:${row.workspace_id}`, ownerId, row.workspace_id, email, await encrypt(tokens.access_token), refreshTokenCipher, Date.now() + tokens.expires_in * 1000, tokens.scope ?? MICROSOFT_SCOPES.join(' '), now, now)
    .run();
  return { workspaceId: row.workspace_id, email };
}

export async function disconnectMicrosoft(ownerId: string, workspaceId: WorkspaceId) {
  await ensureSchema();
  await env.DB.prepare(`DELETE FROM connector_accounts WHERE owner_id = ? AND workspace_id = ? AND provider = 'MICROSOFT'`).bind(ownerId, workspaceId).run();
}

export async function syncMicrosoft(ownerId: string, workspaceId: WorkspaceId, state: AppState): Promise<{ state: AppState; imported: number }> {
  const accessToken = await accessTokenFor(ownerId, workspaceId);
  const headers = { authorization: `Bearer ${accessToken}`, Prefer: 'outlook.body-content-type="text", outlook.timezone="UTC"' };
  const messageUrl = new URL('https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages');
  messageUrl.searchParams.set('$select', 'id,subject,from,receivedDateTime,bodyPreview');
  messageUrl.searchParams.set('$top', '20');
  messageUrl.searchParams.set('$orderby', 'receivedDateTime desc');
  const messages = await graphJson<{ value?: GraphMessage[] }>(messageUrl.toString(), headers);
  const startDateTime = new Date(Date.now() - 24 * 60 * 60_000).toISOString();
  const endDateTime = new Date(Date.now() + 30 * 24 * 60 * 60_000).toISOString();
  const calendarUrl = new URL('https://graph.microsoft.com/v1.0/me/calendarView');
  calendarUrl.searchParams.set('startDateTime', startDateTime);
  calendarUrl.searchParams.set('endDateTime', endDateTime);
  calendarUrl.searchParams.set('$select', 'id,subject,bodyPreview,location,start,end,attendees,isCancelled');
  calendarUrl.searchParams.set('$top', '30');
  calendarUrl.searchParams.set('$orderby', 'start/dateTime');
  const events = await graphJson<{ value?: GraphEvent[] }>(calendarUrl.toString(), headers);

  const syncedAt = new Date();
  const emailData = (messages.value ?? []).map((message) => emailRecord(message, workspaceId, syncedAt));
  const calendarData = (events.value ?? []).filter((event) => !event.isCancelled).map((event) => calendarRecord(event, workspaceId, syncedAt));
  const sources = [...emailData.map((item) => item.source), ...calendarData.map((item) => item.source)];
  const inbox = emailData.map((item) => item.inbox);
  const meetings = calendarData.map((item) => item.meeting);
  const people = uniquePeople(calendarData.flatMap((item) => item.people), workspaceId);
  const outcomes = makeOutcomes(inbox, meetings, workspaceId);
  const keepOtherProvider = <T extends { workspaceId: WorkspaceId; connectorProvider?: string }>(items: T[]) => items.filter((item) => item.workspaceId !== workspaceId || item.connectorProvider !== 'MICROSOFT');
  const mergedInbox = [...keepOtherProvider(state.inbox), ...inbox];
  const mergedMeetings = [...keepOtherProvider(state.meetings), ...meetings];
  const mergedOutcomes = [...keepOtherProvider(state.outcomes), ...outcomes];
  const workspaceOutcomes = mergedOutcomes.filter((item) => item.workspaceId === workspaceId).sort((a, b) => b.priority - a.priority);
  const workspace = state.workspaces.find((item) => item.id === workspaceId)!;
  const brief = {
    workspaceId,
    ruling: workspaceOutcomes[0]?.title ?? 'No consequential ask is visible in the current sync window.',
    rationale: workspaceOutcomes.length
      ? 'This is the highest-consequence item found in authorized workspace evidence. Review the source before treating it as a commitment or decision.'
      : 'Chief found no direct ask or near-term meeting that requires judgment. Nothing was promoted to approved truth.',
    outcomeIds: workspaceOutcomes.slice(0, 3).map((item) => item.id),
    ignoredCount: Math.max(0, mergedInbox.filter((item) => item.workspaceId === workspaceId).length - workspaceOutcomes.filter((item) => item.category !== 'INFORM').length),
  };
  const next: AppState = {
    ...state,
    sources: [...keepOtherProvider(state.sources), ...sources],
    inbox: mergedInbox,
    meetings: mergedMeetings,
    people: [...keepOtherProvider(state.people), ...people],
    outcomes: mergedOutcomes,
    briefs: [...state.briefs.filter((item) => item.workspaceId !== workspaceId), brief],
    audit: [{
      id: `audit-microsoft-sync-${Date.now()}`,
      workspaceId,
      timestamp: 'Just now',
      actor: 'Connector',
      action: 'Synced Microsoft 365 evidence',
      detail: `Imported ${emailData.length} Outlook messages and ${calendarData.length} calendar events into ${workspace.name}. No candidate was promoted and no external write occurred.`,
      riskTier: 'R0',
      outcome: 'SUCCEEDED',
    }, ...state.audit],
  };
  await env.DB.prepare(`UPDATE connector_accounts SET last_synced_at = ?, updated_at = ?
    WHERE owner_id = ? AND workspace_id = ? AND provider = 'MICROSOFT'`)
    .bind(syncedAt.toISOString(), syncedAt.toISOString(), ownerId, workspaceId)
    .run();
  return { state: next, imported: sources.length };
}

export async function executeMicrosoftApproval(ownerId: string, approval: Approval) {
  await ensureSchema();
  if (approval.actionType !== 'CREATE_OUTLOOK_DRAFT' && approval.actionType !== 'CREATE_OUTLOOK_EVENT') {
    throw new MicrosoftConnectorError('This approval does not target Microsoft 365.');
  }
  const scopedKey = await digest(`${ownerId}\u0000${approval.workspaceId}\u0000MICROSOFT\u0000${approval.idempotencyKey}`);
  const existing = await env.DB.prepare(`SELECT provider_id FROM connector_executions
    WHERE idempotency_key = ? AND owner_id = ? AND workspace_id = ? AND provider = 'MICROSOFT'`)
    .bind(scopedKey, ownerId, approval.workspaceId)
    .first<{ provider_id: string }>();
  if (existing) return { providerId: existing.provider_id, duplicate: true };
  if (approval.status !== 'PENDING' || approval.riskTier !== 'R2') throw new MicrosoftConnectorError('Only a pending R2 approval may execute.');
  const accessToken = await accessTokenFor(ownerId, approval.workspaceId);
  let providerId: string;
  if (approval.actionType === 'CREATE_OUTLOOK_DRAFT') {
    if (!approval.payload.to || !approval.payload.subject || !approval.payload.body) throw new MicrosoftConnectorError('The approved Outlook payload is incomplete.');
    const result = await graphJson<{ id: string }>('https://graph.microsoft.com/v1.0/me/messages', {
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
    }, {
      method: 'POST',
      body: JSON.stringify({
        subject: sanitizeHeader(approval.payload.subject),
        body: { contentType: 'Text', content: approval.payload.body },
        toRecipients: [{ emailAddress: { address: sanitizeHeader(approval.payload.to) } }],
      }),
    });
    providerId = result.id;
  } else {
    if (!approval.payload.subject || !approval.payload.start || !approval.payload.end) throw new MicrosoftConnectorError('The approved Outlook calendar payload is incomplete.');
    if (!isRfc3339(approval.payload.start) || !isRfc3339(approval.payload.end)) throw new MicrosoftConnectorError('Calendar approval times must include an RFC3339 time-zone offset.');
    const result = await graphJson<{ id: string }>('https://graph.microsoft.com/v1.0/me/events', {
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
    }, {
      method: 'POST',
      body: JSON.stringify({
        subject: sanitizeHeader(approval.payload.subject),
        body: { contentType: 'Text', content: approval.payload.body ?? '' },
        start: { dateTime: graphUtc(approval.payload.start), timeZone: 'UTC' },
        end: { dateTime: graphUtc(approval.payload.end), timeZone: 'UTC' },
        attendees: [],
        sensitivity: 'private',
        isOnlineMeeting: false,
        transactionId: scopedKey.slice(0, 64),
      }),
    });
    providerId = result.id;
  }
  await env.DB.prepare(`INSERT INTO connector_executions
    (idempotency_key, owner_id, workspace_id, provider, action_type, provider_id, created_at)
    VALUES (?, ?, ?, 'MICROSOFT', ?, ?, ?)`)
    .bind(scopedKey, ownerId, approval.workspaceId, approval.actionType, providerId, new Date().toISOString())
    .run();
  return { providerId, duplicate: false };
}

async function getAccount(ownerId: string, workspaceId: WorkspaceId) {
  await ensureSchema();
  return env.DB.prepare(`SELECT * FROM connector_accounts WHERE owner_id = ? AND workspace_id = ? AND provider = 'MICROSOFT'`)
    .bind(ownerId, workspaceId)
    .first<AccountRow>();
}

async function accessTokenFor(ownerId: string, workspaceId: WorkspaceId) {
  const config = requireConfig();
  const account = await getAccount(ownerId, workspaceId);
  if (!account || account.status !== 'CONNECTED') throw new MicrosoftConnectorError('Connect the Microsoft 365 account mapped to this workspace first.');
  if (account.expires_at > Date.now() + 60_000) return decrypt(account.access_token_cipher);
  if (!account.refresh_token_cipher) throw new MicrosoftConnectorError('Microsoft authorization must be renewed.');
  const response = await fetch(`${identityBase(config.tenantId)}/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: await decrypt(account.refresh_token_cipher),
      grant_type: 'refresh_token',
      scope: MICROSOFT_SCOPES.join(' '),
    }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) {
    await env.DB.prepare(`UPDATE connector_accounts SET status = 'REAUTH_REQUIRED', updated_at = ? WHERE id = ?`).bind(new Date().toISOString(), account.id).run();
    throw new MicrosoftConnectorError('Microsoft authorization expired. Reconnect the account.');
  }
  const tokens = await response.json() as { access_token: string; refresh_token?: string; expires_in: number };
  const refreshTokenCipher = tokens.refresh_token ? await encrypt(tokens.refresh_token) : account.refresh_token_cipher;
  await env.DB.prepare(`UPDATE connector_accounts SET access_token_cipher = ?, refresh_token_cipher = ?, expires_at = ?, updated_at = ? WHERE id = ?`)
    .bind(await encrypt(tokens.access_token), refreshTokenCipher, Date.now() + tokens.expires_in * 1000, new Date().toISOString(), account.id)
    .run();
  return tokens.access_token;
}

async function graphJson<T>(url: string, headers: Record<string, string>, init: RequestInit = {}) {
  const response = await fetch(url, { ...init, headers: { ...headers, ...(init.headers ?? {}) }, signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new MicrosoftConnectorError(`Microsoft Graph request failed with status ${response.status}.`);
  return response.json() as Promise<T>;
}

type GraphMessage = {
  id: string;
  subject?: string;
  bodyPreview?: string;
  receivedDateTime?: string;
  from?: { emailAddress?: { name?: string; address?: string } };
};
type GraphEvent = {
  id: string;
  subject?: string;
  bodyPreview?: string;
  isCancelled?: boolean;
  location?: { displayName?: string };
  start?: { dateTime?: string; timeZone?: string };
  end?: { dateTime?: string; timeZone?: string };
  attendees?: Array<{ emailAddress?: { name?: string; address?: string } }>;
};

function emailRecord(message: GraphMessage, workspaceId: WorkspaceId, syncedAt: Date): { source: SourceItem; inbox: InboxThread } {
  const excerpt = sanitizeUntrustedContent((message.bodyPreview ?? '').slice(0, 1_500));
  const subject = message.subject ?? '(No subject)';
  const sender = message.from?.emailAddress?.name ?? message.from?.emailAddress?.address ?? 'Unknown sender';
  const timestamp = parseGraphDate(message.receivedDateTime, syncedAt);
  const sourceId = `${workspaceId}:microsoft:mail:${message.id}`;
  const hasAsk = /\?|\b(please|can you|could you|need you|by (today|tomorrow|monday|tuesday|wednesday|thursday|friday))\b/i.test(excerpt.text);
  return {
    source: { id: sourceId, workspaceId, type: 'Email', title: subject, author: sender, timestamp: formatDateTime(timestamp), ingestedAt: formatDateTime(syncedAt), excerpt: excerpt.text || 'No message preview was available.', truthState: 'OBSERVED', connector: 'Outlook · Live', connectorProvider: 'MICROSOFT', freshness: `Synced ${formatDateTime(syncedAt)}`, suspicious: excerpt.suspicious },
    inbox: { id: `${workspaceId}:microsoft:inbox:${message.id}`, workspaceId, sender, subject, summary: excerpt.text || 'No preview available.', exactAsk: excerpt.suspicious ? 'Instruction-like content detected. Review manually.' : hasAsk ? 'This message appears to contain a direct ask. Open the source and verify it.' : 'No explicit ask detected.', classification: excerpt.suspicious ? 'SENSITIVE' : hasAsk ? 'REPLY' : 'INFORM', received: formatShortTime(timestamp), sourceId, suspicious: excerpt.suspicious, connectorProvider: 'MICROSOFT' },
  };
}

function calendarRecord(event: GraphEvent, workspaceId: WorkspaceId, syncedAt: Date): { source: SourceItem; meeting: Meeting; people: Person[] } {
  const start = parseGraphDate(event.start?.dateTime, syncedAt);
  const end = parseGraphDate(event.end?.dateTime, start);
  const title = event.subject ?? '(Untitled event)';
  const description = sanitizeUntrustedContent((event.bodyPreview ?? '').slice(0, 2_000));
  const sourceId = `${workspaceId}:microsoft:calendar:${event.id}`;
  const people = (event.attendees ?? []).filter((attendee) => attendee.emailAddress?.address).map((attendee) => {
    const address = attendee.emailAddress!.address!;
    const name = attendee.emailAddress?.name ?? address;
    return { id: `${workspaceId}:microsoft:person:${stableId(address)}`, workspaceId, name, title: address, initials: personInitials(name), lastInteraction: formatDateTime(start), connectorProvider: 'MICROSOFT' as const };
  });
  return {
    source: { id: sourceId, workspaceId, type: 'Calendar', title, author: 'Microsoft 365 Calendar', timestamp: formatDateTime(start), ingestedAt: formatDateTime(syncedAt), excerpt: description.text || `Scheduled ${formatDateTime(start)}–${formatShortTime(end)}.`, truthState: 'OBSERVED', connector: 'Microsoft 365 Calendar · Live', connectorProvider: 'MICROSOFT', freshness: `Synced ${formatDateTime(syncedAt)}`, suspicious: description.suspicious },
    meeting: { id: `${workspaceId}:microsoft:meeting:${event.id}`, workspaceId, title, dateLabel: dateLabel(start), start: formatShortTime(start), end: formatShortTime(end), participantIds: people.map((person) => person.id), readiness: 'PARTIAL', location: event.location?.displayName || 'Location not provided', connectorProvider: 'MICROSOFT', prep: { purpose: description.text || 'Purpose not present in the calendar record.', desiredOutcome: 'Clarify the desired outcome before the meeting.', decisionRequired: 'No approved decision requirement is recorded yet.', recommendedPosition: 'Review the evidence and choose the position explicitly.', flexiblePoints: [], priorCommitments: [], questions: ['What must be true when this meeting ends?', 'Which decision, if any, is required?', 'What should be intentionally left unresolved?'], risks: description.suspicious ? ['Calendar description contains instruction-like content and remains untrusted.'] : [], sourceIds: [sourceId] } },
    people,
  };
}

function makeOutcomes(inbox: InboxThread[], meetings: Meeting[], workspaceId: WorkspaceId): Outcome[] {
  const asks = inbox.filter((item) => item.classification === 'REPLY' || item.classification === 'SENSITIVE').slice(0, 3).map((item, index) => ({
    id: `outcome-${item.id}`,
    workspaceId,
    category: item.classification === 'SENSITIVE' ? 'DECIDE' as const : 'DO' as const,
    title: item.classification === 'SENSITIVE' ? `Review suspicious message: ${item.subject}` : `Review the ask in “${item.subject}”`,
    whyNow: item.exactAsk,
    consequence: item.classification === 'SENSITIVE' ? 'Acting without verification could expose confidential information.' : 'The sender may be waiting for a response.',
    recommendation: item.classification === 'SENSITIVE' ? 'Do not act until sender and request are independently verified.' : 'Open the source, verify the ask, and decide whether to create a commitment or draft.',
    sourceIds: [item.sourceId],
    priority: Math.max(3.2, 4.7 - index * 0.4),
    connectorProvider: 'MICROSOFT' as const,
  }));
  const calendar = meetings.filter((meeting) => meeting.dateLabel === 'Today' || meeting.dateLabel === 'Tomorrow').slice(0, Math.max(0, 3 - asks.length)).map((meeting, index) => ({
    id: `outcome-${meeting.id}`,
    workspaceId,
    category: 'INFORM' as const,
    title: `Prepare for ${meeting.title}`,
    whyNow: `${meeting.dateLabel} at ${meeting.start}.`,
    consequence: 'Arriving without an explicit desired outcome increases decision drift.',
    recommendation: 'Review the calendar evidence and complete the preparation questions.',
    sourceIds: meeting.prep.sourceIds,
    priority: 3.4 - index * 0.2,
    connectorProvider: 'MICROSOFT' as const,
  }));
  return [...asks, ...calendar].slice(0, 3);
}

function uniquePeople(people: Person[], workspaceId: WorkspaceId) {
  return [...new Map(people.map((person) => [person.id, person])).values()].map((person) => ({ ...person, workspaceId }));
}
function parseGraphDate(value: string | undefined, fallback: Date) {
  if (!value) return fallback;
  const normalized = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(value) ? value : `${value}Z`;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? fallback : date;
}
function graphUtc(value: string) { return new Date(value).toISOString().replace(/Z$/, ''); }
function dateLabel(date: Date) { const today = new Date(); const day = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime(); const base = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime(); if (day === base) return 'Today'; if (day === base + 86_400_000) return 'Tomorrow'; return new Intl.DateTimeFormat('en-IE', { weekday: 'short', day: 'numeric', month: 'short' }).format(date); }
function formatDateTime(date: Date) { return new Intl.DateTimeFormat('en-IE', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Europe/Dublin' }).format(date); }
function formatShortTime(date: Date) { return new Intl.DateTimeFormat('en-IE', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Europe/Dublin' }).format(date); }
function personInitials(name: string) { return name.split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'P'; }
function stableId(value: string) { let hash = 0; for (const char of value) hash = ((hash << 5) - hash + char.charCodeAt(0)) | 0; return Math.abs(hash).toString(36); }
function sanitizeHeader(value: string) { return value.replace(/[\r\n]+/g, ' ').trim(); }
function isRfc3339(value: string) { return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/i.test(value) && !Number.isNaN(Date.parse(value)); }
function randomToken(bytes: number) { const value = crypto.getRandomValues(new Uint8Array(bytes)); return encodeBase64Url(value); }
function constantTimeEqual(a: string, b: string) { if (a.length !== b.length) return false; let diff = 0; for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i); return diff === 0; }
function encodeBase64Url(value: Uint8Array) { let binary = ''; for (const byte of value) binary += String.fromCharCode(byte); return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
function decodeBase64Url(value: string) { const base64 = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '='); const binary = atob(base64); return Uint8Array.from(binary, (char) => char.charCodeAt(0)); }
async function digest(value: string) { return encodeBase64Url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))); }
async function encryptionKey() { const secret = process.env.TOKEN_ENCRYPTION_KEY; if (!secret) throw new MicrosoftConnectorError('Token encryption is not configured.'); const digestValue = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret)); return crypto.subtle.importKey('raw', digestValue, 'AES-GCM', false, ['encrypt', 'decrypt']); }
async function encrypt(value: string) { const iv = crypto.getRandomValues(new Uint8Array(12)); const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await encryptionKey(), new TextEncoder().encode(value)); return `v1.${encodeBase64Url(iv)}.${encodeBase64Url(new Uint8Array(cipher))}`; }
async function decrypt(value: string) { const [version, iv, cipher] = value.split('.'); if (version !== 'v1' || !iv || !cipher) throw new MicrosoftConnectorError('Stored Microsoft authorization is unreadable.'); const clear = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: decodeBase64Url(iv) }, await encryptionKey(), decodeBase64Url(cipher)); return new TextDecoder().decode(clear); }

export class MicrosoftConnectorError extends Error {}
