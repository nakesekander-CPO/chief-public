import { NextRequest, NextResponse } from 'next/server';
import { getChatGPTUser } from '@/app/chatgpt-auth';
import { beginMicrosoftOAuth, MicrosoftConnectorError } from '@/lib/microsoft';
import { loadState } from '@/lib/store';
import { isWorkspaceId, ownsWorkspace } from '@/lib/workspaces';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const user = await getChatGPTUser();
  if (!user) return NextResponse.json({ title: 'Sign in required', status: 401 }, { status: 401 });
  const workspaceId = request.nextUrl.searchParams.get('workspaceId');
  if (!isWorkspaceId(workspaceId)) return NextResponse.json({ title: 'Invalid workspace', status: 422 }, { status: 422 });
  const state = await loadState(user.userId, { name: user.displayName, email: user.email });
  if (!ownsWorkspace(state, workspaceId)) return NextResponse.json({ title: 'Workspace denied', status: 403 }, { status: 403 });
  try {
    const authorization = await beginMicrosoftOAuth(user.userId, workspaceId);
    const response = NextResponse.redirect(authorization.url);
    response.cookies.set('chief_microsoft_oauth', authorization.state, {
      httpOnly: true,
      sameSite: 'lax',
      secure: request.nextUrl.protocol === 'https:',
      path: '/api/connections/microsoft/callback',
      maxAge: 10 * 60,
    });
    return response;
  } catch (error) {
    const detail = error instanceof MicrosoftConnectorError ? error.message : 'Microsoft 365 connection could not start.';
    return NextResponse.json({ title: 'Microsoft 365 connection unavailable', detail, status: 503 }, { status: 503 });
  }
}
