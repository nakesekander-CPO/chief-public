import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getChatGPTUser } from '@/app/chatgpt-auth';
import { disconnectMicrosoft } from '@/lib/microsoft';
import { validMutation } from '@/lib/http-security';
import { loadState } from '@/lib/store';
import { ownsWorkspace } from '@/lib/workspaces';

export const dynamic = 'force-dynamic';
const schema = z.object({ workspaceId: z.string().min(2).max(64), confirmation: z.literal('DISCONNECT MICROSOFT') });

export async function POST(request: NextRequest) {
  if (!validMutation(request)) return NextResponse.json({ title: 'Request rejected', status: 403 }, { status: 403 });
  const user = await getChatGPTUser();
  if (!user) return NextResponse.json({ title: 'Sign in required', status: 401 }, { status: 401 });
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ title: 'Confirmation required', status: 422 }, { status: 422 });
  const state = await loadState(user.userId, { name: user.displayName, email: user.email });
  if (!ownsWorkspace(state, parsed.data.workspaceId)) return NextResponse.json({ title: 'Workspace denied', status: 403 }, { status: 403 });
  await disconnectMicrosoft(user.userId, parsed.data.workspaceId);
  return NextResponse.json({ disconnected: true });
}
