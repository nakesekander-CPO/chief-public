import { env } from 'cloudflare:workers';
import { freshPersonalState, isLegacyDemoState } from './personal';
import type { AppState } from './types';

let initialized = false;

async function ensureRuntimeSchema() {
  if (initialized) return;
  const db = env.DB;
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS app_snapshots (
      owner_id TEXT PRIMARY KEY NOT NULL,
      version INTEGER NOT NULL,
      state_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_app_snapshots_updated_at ON app_snapshots(updated_at)'),
  ]);
  initialized = true;
}

export async function loadState(ownerId: string, profile?: { name: string; email?: string }): Promise<AppState> {
  await ensureRuntimeSchema();
  const row = await env.DB.prepare('SELECT state_json FROM app_snapshots WHERE owner_id = ?')
    .bind(ownerId)
    .first<{ state_json: string }>();
  if (!row) {
    const state = freshPersonalState(profile?.name, profile?.email);
    await saveState(ownerId, state, null);
    return state;
  }
  const state = JSON.parse(row.state_json) as AppState;
  if (isLegacyDemoState(state)) {
    const personal = freshPersonalState(profile?.name, profile?.email);
    await saveState(ownerId, personal, null);
    return personal;
  }
  return state;
}

export async function saveState(ownerId: string, incoming: AppState, expectedVersion: number | null): Promise<AppState> {
  await ensureRuntimeSchema();
  if (expectedVersion !== null) {
    const current = await env.DB.prepare('SELECT version FROM app_snapshots WHERE owner_id = ?')
      .bind(ownerId)
      .first<{ version: number }>();
    if (current && current.version !== expectedVersion) throw new StateConflictError(current.version);
  }
  const next = { ...incoming, version: (expectedVersion ?? 0) + 1 };
  await env.DB.prepare(`INSERT INTO app_snapshots (owner_id, version, state_json, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(owner_id) DO UPDATE SET version = excluded.version, state_json = excluded.state_json, updated_at = excluded.updated_at`)
    .bind(ownerId, next.version, JSON.stringify(next), new Date().toISOString())
    .run();
  return next;
}

export async function resetState(ownerId: string, profile?: { name: string; email?: string }): Promise<AppState> {
  await ensureRuntimeSchema();
  const state = freshPersonalState(profile?.name, profile?.email);
  await env.DB.prepare('DELETE FROM app_snapshots WHERE owner_id = ?').bind(ownerId).run();
  return saveState(ownerId, state, null);
}

export class StateConflictError extends Error {
  constructor(public readonly currentVersion: number) {
    super('The workspace changed in another session. Reload before saving.');
  }
}
