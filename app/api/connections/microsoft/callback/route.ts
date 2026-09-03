import { NextRequest, NextResponse } from 'next/server';
import { getChatGPTUser } from '@/app/chatgpt-auth';
import { completeMicrosoftOAuth, MicrosoftConnectorError } from '@/lib/microsoft';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const user = await getChatGPTUser();
  if (!user) return NextResponse.redirect(new URL('/?microsoft=signin-required', request.url));
  const state = request.nextUrl.searchParams.get('state') ?? '';
  const code = request.nextUrl.searchParams.get('code') ?? '';
  const cookieState = request.cookies.get('chief_microsoft_oauth')?.value ?? '';
  const providerError = request.nextUrl.searchParams.get('error');
  if (providerError || !code) return NextResponse.redirect(new URL(`/?microsoft=${encodeURIComponent(providerError ?? 'authorization-cancelled')}`, request.url));
  try {
    const result = await completeMicrosoftOAuth(user.userId, state, cookieState, code);
    const response = NextResponse.redirect(new URL(`/?microsoft=connected&workspace=${encodeURIComponent(result.workspaceId)}`, request.url));
    response.cookies.delete('chief_microsoft_oauth');
    return response;
  } catch (error) {
    const codeValue = error instanceof MicrosoftConnectorError ? 'connection-failed' : 'unexpected-error';
    const response = NextResponse.redirect(new URL(`/?microsoft=${codeValue}`, request.url));
    response.cookies.delete('chief_microsoft_oauth');
    return response;
  }
}
