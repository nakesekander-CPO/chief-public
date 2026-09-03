import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getChatGPTUser } from '@/app/chatgpt-auth';
import { validMutation } from '@/lib/http-security';
import { loadState, saveState, StateConflictError } from '@/lib/store';
import { createWorkspaceState, WorkspaceBoundaryError } from '@/lib/workspaces';

export const dynamic = 'force-dynamic';

const schema = z.object({
  name: z.string().trim().min(2).max(60),
  type: z.string().trim().min(2).max(80).default('Professional'),
  classification: z.enum(['Confidential', 'Private']).default('Confidential'),
});

export async function POST(request: NextRequest) {
  if (!validMutation(request)) return NextResponse.json({ title: 'Request rejected', status: 403 }, { status: 403 });
  const user = await getChatGPTUser();
  if (!user) return NextResponse.json({ title: 'Sign in required', status: 401 }, { status: 401 });
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ title: 'Invalid workspace', detail: 'Choose a short, distinct workspace name.', status: 422 }, { status: 422 });
  try {
    const current = await loadState(user.userId, { name: user.displayName, email: user.email });
    const created = createWorkspaceState(current, parsed.data);
    const state = await saveState(user.userId, created.state, current.version);
    return NextResponse.json({ state, workspace: created.workspace }, { status: 201, headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    if (error instanceof StateConflictError) return NextResponse.json({ title: 'Version conflict', detail: error.message, status: 409 }, { status: 409 });
    if (error instanceof WorkspaceBoundaryError) return NextResponse.json({ title: 'Workspace not created', detail: error.message, status: 422 }, { status: 422 });
    throw error;
  }
}
