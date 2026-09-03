import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getChatGPTUser } from '@/app/chatgpt-auth';
import { getGoogleConnectionStatus } from '@/lib/google';
import { getMicrosoftConnectionStatus } from '@/lib/microsoft';
import { validMutation } from '@/lib/http-security';
import { loadState, resetState, saveState, StateConflictError } from '@/lib/store';
import type { AppState } from '@/lib/types';
import { hasValidWorkspaceIsolation } from '@/lib/workspaces';

export const dynamic = 'force-dynamic';

const stateSchema = z.custom<AppState>((value) => {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<AppState>;
  return Number.isInteger(candidate.version) && candidate.mode === 'PERSONAL' && Boolean(candidate.owner?.name && candidate.owner.initials) && [
    candidate.workspaces, candidate.briefs, candidate.outcomes, candidate.sources, candidate.people,
    candidate.meetings, candidate.commitments, candidate.decisions, candidate.candidates,
    candidate.approvals, candidate.audit, candidate.inbox, candidate.captures,
  ].every(Array.isArray) && typeof candidate.editorialStandard === 'string' && hasValidWorkspaceIsolation(candidate as AppState);
}, 'Invalid Chief state payload');

function ownerId(user: NonNullable<Awaited<ReturnType<typeof getChatGPTUser>>>) { return user.userId; }
function ownerProfile(user: NonNullable<Awaited<ReturnType<typeof getChatGPTUser>>>) {
  const name = user.displayName;
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'ME';
  return { name, email: user.email, initials };
}

export async function GET(request: NextRequest) {
  const user = await getChatGPTUser();
  if (!user) return NextResponse.json({ title: 'Sign in required', status: 401 }, { status: 401 });
  const state = await loadState(ownerId(user), { name: user.displayName, email: user.email });
  const connectionPairs = await Promise.all(state.workspaces.flatMap((workspace) => [
    getGoogleConnectionStatus(user.userId, workspace.id).then((status) => ['google', workspace.id, status] as const),
    getMicrosoftConnectionStatus(user.userId, workspace.id).then((status) => ['microsoft', workspace.id, status] as const),
  ]));
  const google = Object.fromEntries(connectionPairs.filter(([provider]) => provider === 'google').map(([, workspaceId, status]) => [workspaceId, status]));
  const microsoft = Object.fromEntries(connectionPairs.filter(([provider]) => provider === 'microsoft').map(([, workspaceId, status]) => [workspaceId, status]));
  const csrfToken = crypto.randomUUID();
  const response = NextResponse.json({
    state,
    csrfToken,
    runtime: {
      authenticated: true,
      modelConfigured: Boolean(process.env.OPENAI_API_KEY),
      owner: state.owner,
      google,
      microsoft,
    },
  });
  response.cookies.set('chief_csrf', csrfToken, { httpOnly: true, sameSite: 'strict', secure: new URL(request.url).protocol === 'https:', path: '/', maxAge: 60 * 60 * 8 });
  response.headers.set('cache-control', 'no-store');
  return response;
}

export async function PUT(request: NextRequest) {
  if (!validMutation(request)) return NextResponse.json({ title: 'Request rejected', detail: 'CSRF validation failed.', status: 403 }, { status: 403 });
  const contentLength = Number(request.headers.get('content-length') ?? 0);
  if (contentLength > 2_000_000) return NextResponse.json({ title: 'Payload too large', status: 413 }, { status: 413 });
  const parsed = stateSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ title: 'Invalid state', detail: 'The submitted workspace state did not match the contract.', status: 422 }, { status: 422 });
  const user = await getChatGPTUser();
  if (!user) return NextResponse.json({ title: 'Sign in required', status: 401 }, { status: 401 });
  try {
    const state = await saveState(ownerId(user), { ...parsed.data, mode: 'PERSONAL', owner: ownerProfile(user) }, parsed.data.version);
    return NextResponse.json({ state });
  } catch (error) {
    if (error instanceof StateConflictError) return NextResponse.json({ title: 'Version conflict', detail: error.message, currentVersion: error.currentVersion, status: 409 }, { status: 409 });
    throw error;
  }
}

export async function DELETE(request: NextRequest) {
  if (!validMutation(request)) return NextResponse.json({ title: 'Request rejected', status: 403 }, { status: 403 });
  if (request.headers.get('x-chief-confirm-reset') !== 'RESET PERSONAL DATA') return NextResponse.json({ title: 'Confirmation required', status: 400 }, { status: 400 });
  const user = await getChatGPTUser();
  if (!user) return NextResponse.json({ title: 'Sign in required', status: 401 }, { status: 401 });
  const state = await resetState(ownerId(user), { name: user.displayName, email: user.email });
  return NextResponse.json({ state });
}
