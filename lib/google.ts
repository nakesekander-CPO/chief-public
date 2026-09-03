import { env } from 'cloudflare:workers';
import { GOOGLE_SCOPES, googleConfigured } from './google-config';
import { sanitizeUntrustedContent } from './policy';
import type {
  AppState, Approval, GoogleConnectionStatus, InboxThread, Meeting, Outcome,
  Person, SourceItem, WorkspaceId,
} from './types';

export { GOOGLE_SCOPES, googleConfigured } from './google-config';

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
      provider TEXT NOT NULL DEFAULT 'GOOGLE',
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
      provider TEXT NOT NULL,
      action_type TEXT NOT NULL,
      provider_id TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_connector_executions_owner_workspace ON connector_executions(owner_id, workspace_id)'),
  ]);
  initialized = true;
}

function requireConfig() {
  if (!googleConfigured()) throw new GoogleConnectorError('Google connection is not configured for this Chief deployment.');
  return {
    clientId: process.env.GOOGLE_CLIENT_ID!,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    redirectUri: process.env.GOOGLE_REDIRECT_URI!,
  };
}

export async function getGoogleConnectionStatus(ownerId: string, workspaceId?: WorkspaceId): Promise<GoogleConnectionStatus> {
  if (!googleConfigured()) return { configured: false, status: 'NOT_CONNECTED', scopes: [] };
  await ensureSchema();
  const query = workspaceId
    ? env.DB.prepare(`SELECT email, workspace_id, status, last_synced_at, scopes FROM connector_accounts
        WHERE owner_id = ? AND workspace_id = ? AND provider = 'GOOGLE'`).bind(ownerId, workspaceId)
    : env.DB.prepare(`SELECT email, workspace_id, status, last_synced_at, scopes FROM connector_accounts
        WHERE owner_id = ? AND provider = 'GOOGLE' ORDER BY updated_at DESC LIMIT 1`).bind(ownerId);
  const row = await query.first<{ email: string; workspace_id: WorkspaceId; status: 'CONNECTED' | 'REAUTH_REQUIRED'; last_synced_at: string | null; scopes: string }>();
  if (!row) return { configured: true, status: 'NOT_CONNECTED', scopes: GOOGLE_SCOPES };
  return {
    configured: true,
    status: row.status,
    email: row.email,
    workspaceId: row.workspace_id,
    lastSyncedAt: row.last_synced_at ?? undefined,
    scopes: row.scopes.split(' ').filter(Boolean),
  };
}

export async function beginGoogleOAuth(ownerId: string, workspaceId: WorkspaceId) {
  const config = requireConfig();
  await ensureSchema();
  const state = randomToken(32);
  const codeVerifier = randomToken(48);
  const codeChallenge = await digest(codeVerifier);
  const stateHash = await digest(state);
  await env.DB.prepare(`DELETE FROM oauth_states WHERE owner_id = ? AND provider = 'GOOGLE' AND expires_at < ?`).bind(ownerId, Date.now()).run();
  await env.DB.prepare(`INSERT INTO oauth_states (state_hash, owner_id, workspace_id, provider, code_verifier_cipher, expires_at, used_at)
    VALUES (?, ?, ?, 'GOOGLE', ?, ?, NULL)`).bind(stateHash, ownerId, workspaceId, await encrypt(codeVerifier), Date.now() + 10 * 60_000).run();
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('client_id', config.clientId);
  url.searchParams.set('redirect_uri', config.redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', GOOGLE_SCOPES.join(' '));
  url.searchParams.set('access_type', 'offline');
  url.searchParams.set('include_granted_scopes', 'true');
  url.searchParams.set('prompt', 'consent');
  url.searchParams.set('state', state);
  url.searchParams.set('code_challenge', codeChallenge);
  url.searchParams.set('code_challenge_method', 'S256');
  return { state, url: url.toString() };
}

export async function completeGoogleOAuth(ownerId: string, state: string, cookieState: string, code: string) {
  if (!state || !constantTimeEqual(state, cookieState)) throw new GoogleConnectorError('Google connection state did not match.');
  const config = requireConfig();
  await ensureSchema();
  const stateHash = await digest(state);
  const row = await env.DB.prepare(`SELECT workspace_id, code_verifier_cipher, expires_at, used_at FROM oauth_states
    WHERE state_hash = ? AND owner_id = ? AND provider = 'GOOGLE'`).bind(stateHash, ownerId).first<{ workspace_id: WorkspaceId; code_verifier_cipher: string; expires_at: number; used_at: string | null }>();
  if (!row || row.used_at || row.expires_at < Date.now()) throw new GoogleConnectorError('Google connection state expired or was already used.');
  await env.DB.prepare('UPDATE oauth_states SET used_at = ? WHERE state_hash = ? AND used_at IS NULL').bind(new Date().toISOString(), stateHash).run();

  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code, client_id: config.clientId, client_secret: config.clientSecret, redirect_uri: config.redirectUri, grant_type: 'authorization_code', code_verifier: await decrypt(row.code_verifier_cipher) }),
  });
  if (!tokenResponse.ok) throw new GoogleConnectorError('Google did not complete the authorization exchange.');
  const tokens = await tokenResponse.json() as { access_token: string; refresh_token?: string; expires_in: number; scope?: string };
  const profileResponse = await fetch('https://openidconnect.googleapis.com/v1/userinfo', { headers: { authorization: `Bearer ${tokens.access_token}` } });
  if (!profileResponse.ok) throw new GoogleConnectorError('Google account identity could not be verified.');
  const profile = await profileResponse.json() as { sub: string; email: string };
  const existing = await getAccount(ownerId, row.workspace_id);
  const refreshTokenCipher = tokens.refresh_token ? await encrypt(tokens.refresh_token) : existing?.refresh_token_cipher ?? null;
  if (!refreshTokenCipher) throw new GoogleConnectorError('Google did not provide offline access. Reconnect and grant consent.');
  const now = new Date().toISOString();
  await env.DB.prepare(`INSERT INTO connector_accounts
    (id, owner_id, workspace_id, provider, email, access_token_cipher, refresh_token_cipher, expires_at, scopes, status, last_synced_at, created_at, updated_at)
    VALUES (?, ?, ?, 'GOOGLE', ?, ?, ?, ?, ?, 'CONNECTED', NULL, ?, ?)
    ON CONFLICT(owner_id, workspace_id, provider) DO UPDATE SET
      email = excluded.email,
      access_token_cipher = excluded.access_token_cipher,
      refresh_token_cipher = excluded.refresh_token_cipher,
      expires_at = excluded.expires_at,
      scopes = excluded.scopes,
      status = 'CONNECTED',
      updated_at = excluded.updated_at`)
    .bind(`google:${ownerId}:${row.workspace_id}`, ownerId, row.workspace_id, profile.email, await encrypt(tokens.access_token), refreshTokenCipher, Date.now() + tokens.expires_in * 1000, tokens.scope ?? GOOGLE_SCOPES.join(' '), now, now)
    .run();
  return { workspaceId: row.workspace_id, email: profile.email };
}

export async function disconnectGoogle(ownerId: string, workspaceId: WorkspaceId) {
  await ensureSchema();
  const account = await getAccount(ownerId, workspaceId);
  if (account) {
    const token = account.refresh_token_cipher ? await decrypt(account.refresh_token_cipher) : await decrypt(account.access_token_cipher);
    await fetch('https://oauth2.googleapis.com/revoke', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token }),
    }).catch(() => undefined);
  }
  await env.DB.prepare(`DELETE FROM connector_accounts WHERE owner_id = ? AND workspace_id = ? AND provider = 'GOOGLE'`).bind(ownerId, workspaceId).run();
}

export async function syncGoogle(ownerId: string, workspaceId: WorkspaceId, state: AppState): Promise<{ state: AppState; imported: number }> {
  const accessToken = await accessTokenFor(ownerId, workspaceId);
  const headers = { authorization: `Bearer ${accessToken}` };
  const threadList = await googleJson<{ threads?: Array<{ id: string }> }>('https://gmail.googleapis.com/gmail/v1/users/me/threads?maxResults=20&q=newer_than%3A14d', headers);
  const threadDetails = await Promise.all((threadList.threads ?? []).slice(0, 20).map(({ id }) =>
    googleJson<GmailThread>(`https://gmail.googleapis.com/gmail/v1/users/me/threads/${encodeURIComponent(id)}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`, headers)
  ));
  const timeMin = encodeURIComponent(new Date(Date.now() - 24 * 60 * 60_000).toISOString());
  const timeMax = encodeURIComponent(new Date(Date.now() + 30 * 24 * 60 * 60_000).toISOString());
  const calendar = await googleJson<{ items?: GoogleEvent[] }>(`https://www.googleapis.com/calendar/v3/calendars/primary/events?singleEvents=true&orderBy=startTime&maxResults=30&timeMin=${timeMin}&timeMax=${timeMax}`, headers);

  const syncedAt = new Date();
  const emailData = threadDetails.map((thread) => emailRecord(thread, workspaceId, syncedAt));
  const calendarData = (calendar.items ?? []).filter((event) => event.status !== 'cancelled').map((event) => calendarRecord(event, workspaceId, syncedAt));
  const sources = [...emailData.map((item) => item.source), ...calendarData.map((item) => item.source)];
  const inbox = emailData.map((item) => item.inbox);
  const meetings = calendarData.map((item) => item.meeting);
  const people = uniquePeople(calendarData.flatMap((item) => item.people), workspaceId);
  const outcomes = makeOutcomes(inbox, meetings, workspaceId);
  const keepOtherProvider = <T extends { workspaceId: WorkspaceId; connectorProvider?: string }>(items: T[]) => items.filter((item) => item.workspaceId !== workspaceId || item.connectorProvider !== 'GOOGLE');
  const mergedInbox = [...keepOtherProvider(state.inbox), ...inbox];
  const mergedMeetings = [...keepOtherProvider(state.meetings), ...meetings];
  const mergedOutcomes = [...keepOtherProvider(state.outcomes), ...outcomes];
  const workspaceOutcomes = mergedOutcomes.filter((item) => item.workspaceId === workspaceId).sort((a, b) => b.priority - a.priority);
  const workspace = state.workspaces.find((item) => item.id === workspaceId)!;
  const ruling = workspaceOutcomes[0]?.title ?? 'No consequential ask is visible in the current sync window.';
  const brief = {
    workspaceId,
    ruling,
    rationale: outcomes.length
      ? 'This is the highest-consequence item found in your authorized Gmail and Calendar evidence. Review the source before treating it as a commitment or decision.'
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
      id: `audit-sync-${Date.now()}`,
      workspaceId,
      timestamp: 'Just now',
      actor: 'Connector',
      action: 'Synced Google evidence',
      detail: `Imported ${emailData.length} Gmail threads and ${calendarData.length} Calendar events into ${workspace.name}. No candidate was promoted and no external write occurred.`,
      riskTier: 'R0',
      outcome: 'SUCCEEDED',
    }, ...state.audit],
  };
  await env.DB.prepare(`UPDATE connector_accounts SET last_synced_at = ?, updated_at = ?
    WHERE owner_id = ? AND workspace_id = ? AND provider = 'GOOGLE'`)
    .bind(syncedAt.toISOString(), syncedAt.toISOString(), ownerId, workspaceId).run();
  return { state: next, imported: sources.length };
}

export async function executeGoogleApproval(ownerId: string, approval: Approval) {
  await ensureSchema();
  const scopedKey = await digest(`${ownerId}\u0000${approval.workspaceId}\u0000GOOGLE\u0000${approval.idempotencyKey}`);
  const existing = await env.DB.prepare(`SELECT provider_id FROM connector_executions
    WHERE idempotency_key = ? AND owner_id = ? AND workspace_id = ? AND provider = 'GOOGLE'`)
    .bind(scopedKey, ownerId, approval.workspaceId).first<{ provider_id: string }>();
  if (existing) return { providerId: existing.provider_id, duplicate: true };
  if (approval.status !== 'PENDING' || approval.riskTier !== 'R2') throw new GoogleConnectorError('Only a pending R2 approval may execute.');
  const accessToken = await accessTokenFor(ownerId, approval.workspaceId);
  let providerId: string;
  if (approval.actionType === 'CREATE_GMAIL_DRAFT') {
    if (!approval.payload.to || !approval.payload.subject || !approval.payload.body) throw new GoogleConnectorError('The approved Gmail payload is incomplete.');
    const raw = encodeBase64Url(`To: ${sanitizeHeader(approval.payload.to)}\r\nSubject: ${sanitizeHeader(approval.payload.subject)}\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n${approval.payload.body}`);
    const result = await googleJson<{ id: string }>('https://gmail.googleapis.com/gmail/v1/users/me/drafts', {
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
    }, { method: 'POST', body: JSON.stringify({ message: { raw } }) });
    providerId = result.id;
  } else {
    if (!approval.payload.subject || !approval.payload.start || !approval.payload.end) throw new GoogleConnectorError('The approved Calendar payload is incomplete.');
    if (!isRfc3339(approval.payload.start) || !isRfc3339(approval.payload.end)) throw new GoogleConnectorError('Calendar approval times must include an RFC3339 time-zone offset.');
    const result = await googleJson<{ id: string }>('https://www.googleapis.com/calendar/v3/calendars/primary/events?sendUpdates=none', {
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
    }, { method: 'POST', body: JSON.stringify({ summary: approval.payload.subject, description: approval.payload.body ?? '', start: { dateTime: approval.payload.start }, end: { dateTime: approval.payload.end }, attendees: [] }) });
    providerId = result.id;
  }
  await env.DB.prepare(`INSERT INTO connector_executions
    (idempotency_key, owner_id, workspace_id, provider, action_type, provider_id, created_at)
    VALUES (?, ?, ?, 'GOOGLE', ?, ?, ?)`)
    .bind(scopedKey, ownerId, approval.workspaceId, approval.actionType, providerId, new Date().toISOString()).run();
  return { providerId, duplicate: false };
}

async function getAccount(ownerId: string, workspaceId: WorkspaceId) {
  await ensureSchema();
  return env.DB.prepare(`SELECT * FROM connector_accounts WHERE owner_id = ? AND workspace_id = ? AND provider = 'GOOGLE'`)
    .bind(ownerId, workspaceId).first<AccountRow>();
}

async function accessTokenFor(ownerId: string, workspaceId: WorkspaceId) {
  const config = requireConfig();
  const account = await getAccount(ownerId, workspaceId);
  if (!account || account.status !== 'CONNECTED') throw new GoogleConnectorError('Connect the Google account mapped to this workspace first.');
  if (account.expires_at > Date.now() + 60_000) return decrypt(account.access_token_cipher);
  if (!account.refresh_token_cipher) throw new GoogleConnectorError('Google authorization must be renewed.');
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret, refresh_token: await decrypt(account.refresh_token_cipher), grant_type: 'refresh_token' }),
  });
  if (!response.ok) {
    await env.DB.prepare(`UPDATE connector_accounts SET status = 'REAUTH_REQUIRED', updated_at = ? WHERE id = ?`).bind(new Date().toISOString(), account.id).run();
    throw new GoogleConnectorError('Google authorization expired. Reconnect the account.');
  }
  const tokens = await response.json() as { access_token: string; expires_in: number };
  await env.DB.prepare(`UPDATE connector_accounts SET access_token_cipher = ?, expires_at = ?, updated_at = ? WHERE id = ?`)
    .bind(await encrypt(tokens.access_token), Date.now() + tokens.expires_in * 1000, new Date().toISOString(), account.id).run();
  return tokens.access_token;
}

async function googleJson<T>(url: string, headers: Record<string, string>, init: RequestInit = {}) {
  const response = await fetch(url, { ...init, headers: { ...headers, ...(init.headers ?? {}) }, signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new GoogleConnectorError(`Google API request failed with status ${response.status}.`);
  return response.json() as Promise<T>;
}

type GmailThread = { id: string; snippet?: string; messages?: Array<{ internalDate?: string; payload?: { headers?: Array<{ name: string; value: string }> } }> };
type GoogleEvent = { id: string; status?: string; summary?: string; description?: string; location?: string; start?: { dateTime?: string; date?: string }; end?: { dateTime?: string; date?: string }; attendees?: Array<{ email?: string; displayName?: string; self?: boolean }> };

function emailRecord(thread: GmailThread, workspaceId: WorkspaceId, syncedAt: Date): { source: SourceItem; inbox: InboxThread } {
  const message = thread.messages?.at(-1);
  const headers = Object.fromEntries((message?.payload?.headers ?? []).map((header) => [header.name.toLowerCase(), header.value]));
  const excerpt = sanitizeUntrustedContent((thread.snippet ?? '').slice(0, 1_500));
  const subject = headers.subject ?? '(No subject)';
  const sender = headers.from ?? 'Unknown sender';
  const timestamp = message?.internalDate ? new Date(Number(message.internalDate)) : new Date(headers.date ?? syncedAt);
  const sourceId = `${workspaceId}:google:gmail:${thread.id}`;
  const hasAsk = /\?|\b(please|can you|could you|need you|by (today|tomorrow|monday|tuesday|wednesday|thursday|friday))\b/i.test(excerpt.text);
  return {
    source: { id: sourceId, workspaceId, type: 'Email', title: subject, author: sender, timestamp: formatDateTime(timestamp), ingestedAt: formatDateTime(syncedAt), excerpt: excerpt.text || 'No message preview was available.', truthState: 'OBSERVED', connector: 'Gmail · Live', connectorProvider: 'GOOGLE', freshness: `Synced ${formatDateTime(syncedAt)}`, suspicious: excerpt.suspicious },
    inbox: { id: `${workspaceId}:google:inbox:${thread.id}`, workspaceId, sender, subject, summary: excerpt.text || 'No preview available.', exactAsk: excerpt.suspicious ? 'Instruction-like content detected. Review manually.' : hasAsk ? 'This thread appears to contain a direct ask. Open the source and verify it.' : 'No explicit ask detected.', classification: excerpt.suspicious ? 'SENSITIVE' : hasAsk ? 'REPLY' : 'INFORM', received: formatShortTime(timestamp), sourceId, suspicious: excerpt.suspicious, connectorProvider: 'GOOGLE' },
  };
}

function calendarRecord(event: GoogleEvent, workspaceId: WorkspaceId, syncedAt: Date): { source: SourceItem; meeting: Meeting; people: Person[] } {
  const startValue = event.start?.dateTime ?? event.start?.date ?? syncedAt.toISOString();
  const endValue = event.end?.dateTime ?? event.end?.date ?? startValue;
  const start = new Date(startValue);
  const end = new Date(endValue);
  const title = event.summary ?? '(Untitled event)';
  const description = sanitizeUntrustedContent((event.description ?? '').slice(0, 2_000));
  const sourceId = `${workspaceId}:google:calendar:${event.id}`;
  const people = (event.attendees ?? []).filter((attendee) => !attendee.self && attendee.email).map((attendee) => {
    const name = attendee.displayName ?? attendee.email!;
    return { id: `${workspaceId}:google:person:${stableId(attendee.email!)}`, workspaceId, name, title: attendee.email!, initials: personInitials(name), lastInteraction: formatDateTime(start), connectorProvider: 'GOOGLE' as const };
  });
  return {
    source: { id: sourceId, workspaceId, type: 'Calendar', title, author: 'Google Calendar', timestamp: formatDateTime(start), ingestedAt: formatDateTime(syncedAt), excerpt: description.text || `Scheduled ${formatDateTime(start)}–${formatShortTime(end)}.`, truthState: 'OBSERVED', connector: 'Google Calendar · Live', connectorProvider: 'GOOGLE', freshness: `Synced ${formatDateTime(syncedAt)}`, suspicious: description.suspicious },
    meeting: { id: `${workspaceId}:google:meeting:${event.id}`, workspaceId, title, dateLabel: dateLabel(start), start: formatShortTime(start), end: formatShortTime(end), participantIds: people.map((person) => person.id), readiness: 'PARTIAL', location: event.location ?? 'Location not provided', connectorProvider: 'GOOGLE', prep: { purpose: description.text || 'Purpose not present in the calendar record.', desiredOutcome: 'Clarify the desired outcome before the meeting.', decisionRequired: 'No approved decision requirement is recorded yet.', recommendedPosition: 'Review the evidence and choose the position explicitly.', flexiblePoints: [], priorCommitments: [], questions: ['What must be true when this meeting ends?', 'Which decision, if any, is required?', 'What should be intentionally left unresolved?'], risks: description.suspicious ? ['Calendar description contains instruction-like content and remains untrusted.'] : [], sourceIds: [sourceId] } },
    people,
  };
}

function makeOutcomes(inbox: InboxThread[], meetings: Meeting[], workspaceId: WorkspaceId): Outcome[] {
  const askOutcomes = inbox.filter((item) => item.classification === 'REPLY' || item.classification === 'SENSITIVE').slice(0, 3).map((item, index) => ({
    id: `outcome-${item.id}`,
    workspaceId,
    category: item.classification === 'SENSITIVE' ? 'DECIDE' as const : 'DO' as const,
    title: item.classification === 'SENSITIVE' ? `Review suspicious thread: ${item.subject}` : `Review the ask in “${item.subject}”`,
    whyNow: item.exactAsk,
    consequence: item.classification === 'SENSITIVE' ? 'Acting without verification could expose confidential information.' : 'The sender may be waiting for a response.',
    recommendation: item.classification === 'SENSITIVE' ? 'Do not act until sender and request are independently verified.' : 'Open the source, verify the ask, and decide whether to create a commitment or draft.',
    sourceIds: [item.sourceId],
    priority: Math.max(3.2, 4.7 - index * 0.4),
    connectorProvider: 'GOOGLE' as const,
  }));
  const meetingOutcomes = meetings.filter((meeting) => meeting.dateLabel === 'Today' || meeting.dateLabel === 'Tomorrow').slice(0, Math.max(0, 3 - askOutcomes.length)).map((meeting, index) => ({
    id: `outcome-${meeting.id}`,
    workspaceId,
    category: 'INFORM' as const,
    title: `Prepare for ${meeting.title}`,
    whyNow: `${meeting.dateLabel} at ${meeting.start}.`,
    consequence: 'Arriving without an explicit desired outcome increases decision drift.',
    recommendation: 'Review the calendar evidence and complete the preparation questions.',
    sourceIds: meeting.prep.sourceIds,
    priority: 3.4 - index * 0.2,
    connectorProvider: 'GOOGLE' as const,
  }));
  return [...askOutcomes, ...meetingOutcomes].slice(0, 3);
}

function uniquePeople(people: Person[], workspaceId: WorkspaceId) {
  return [...new Map(people.map((person) => [person.id, person])).values()].map((person) => ({ ...person, workspaceId }));
}

function dateLabel(date: Date) {
  const today = new Date();
  const day = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const base = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  if (day === base) return 'Today';
  if (day === base + 86_400_000) return 'Tomorrow';
  return new Intl.DateTimeFormat('en-IE', { weekday: 'short', day: 'numeric', month: 'short' }).format(date);
}
function formatDateTime(date: Date) { return new Intl.DateTimeFormat('en-IE', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Europe/Dublin' }).format(date); }
function formatShortTime(date: Date) { return new Intl.DateTimeFormat('en-IE', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Europe/Dublin' }).format(date); }
function personInitials(name: string) { return name.split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'P'; }
function stableId(value: string) { let hash = 0; for (const char of value) hash = ((hash << 5) - hash + char.charCodeAt(0)) | 0; return Math.abs(hash).toString(36); }
function sanitizeHeader(value: string) { return value.replace(/[\r\n]+/g, ' ').trim(); }
function isRfc3339(value: string) { return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value) && !Number.isNaN(Date.parse(value)); }
function randomToken(bytes: number) { const value = crypto.getRandomValues(new Uint8Array(bytes)); return encodeBase64Url(value); }
function constantTimeEqual(a: string, b: string) { if (a.length !== b.length) return false; let diff = 0; for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i); return diff === 0; }
function encodeBase64Url(value: string | Uint8Array) { const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value; let binary = ''; for (const byte of bytes) binary += String.fromCharCode(byte); return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
function decodeBase64Url(value: string) { const base64 = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '='); const binary = atob(base64); return Uint8Array.from(binary, (char) => char.charCodeAt(0)); }
async function digest(value: string) { return encodeBase64Url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))); }
async function encryptionKey() { const secret = process.env.TOKEN_ENCRYPTION_KEY; if (!secret) throw new GoogleConnectorError('Token encryption is not configured.'); const digestValue = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret)); return crypto.subtle.importKey('raw', digestValue, 'AES-GCM', false, ['encrypt', 'decrypt']); }
async function encrypt(value: string) { const iv = crypto.getRandomValues(new Uint8Array(12)); const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await encryptionKey(), new TextEncoder().encode(value)); return `v1.${encodeBase64Url(iv)}.${encodeBase64Url(new Uint8Array(cipher))}`; }
async function decrypt(value: string) { const [version, iv, cipher] = value.split('.'); if (version !== 'v1' || !iv || !cipher) throw new GoogleConnectorError('Stored Google authorization is unreadable.'); const clear = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: decodeBase64Url(iv) }, await encryptionKey(), decodeBase64Url(cipher)); return new TextDecoder().decode(clear); }

export class GoogleConnectorError extends Error {}
