import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getChatGPTUser } from '@/app/chatgpt-auth';
import { getMicrosoftConnectionStatus, MicrosoftConnectorError, syncMicrosoft } from '@/lib/microsoft';
import { validMutation } from '@/lib/http-security';
import { loadState, saveState, StateConflictError } from '@/lib/store';
import { ownsWorkspace } from '@/lib/workspaces';

export const dynamic = 'force-dynamic';
const schema = z.object({ workspaceId: z.string().min(2).max(64) });

export async function POST(request: NextRequest) {
  if (!validMutation(request)) return NextResponse.json({ title: 'Request rejected', detail: 'CSRF validation failed.', status: 403 }, { status: 403 });
  const user = await getChatGPTUser();
  if (!user) return NextResponse.json({ title: 'Sign in required', status: 401 }, { status: 401 });
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ title: 'Invalid workspace', status: 422 }, { status: 422 });
  try {
    const current = await loadState(user.userId, { name: user.displayName, email: user.email });
    if (!ownsWorkspace(current, parsed.data.workspaceId)) return NextResponse.json({ title: 'Workspace denied', status: 403 }, { status: 403 });
    const synced = await syncMicrosoft(user.userId, parsed.data.workspaceId, current);
    const state = await saveState(user.userId, synced.state, current.version);
    const connection = await getMicrosoftConnectionStatus(user.userId, parsed.data.workspaceId);
    return NextResponse.json({ state, connection, imported: synced.imported }, { headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    if (error instanceof StateConflictError) return NextResponse.json({ title: 'Version conflict', detail: error.message, status: 409 }, { status: 409 });
    const detail = error instanceof MicrosoftConnectorError ? error.message : 'Microsoft 365 sync failed safely.';
    return NextResponse.json({ title: 'Sync failed', detail, status: 502 }, { status: 502 });
  }
}
