import { NextRequest, NextResponse } from 'next/server';
import { getChatGPTUser } from '@/app/chatgpt-auth';
import { completeGoogleOAuth, GoogleConnectorError } from '@/lib/google';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const user = await getChatGPTUser();
  if (!user) return NextResponse.redirect(new URL('/?google=signin-required', request.url));
  const state = request.nextUrl.searchParams.get('state') ?? '';
  const code = request.nextUrl.searchParams.get('code') ?? '';
  const cookieState = request.cookies.get('chief_google_oauth')?.value ?? '';
  const providerError = request.nextUrl.searchParams.get('error');
  if (providerError || !code) return NextResponse.redirect(new URL(`/?google=${encodeURIComponent(providerError ?? 'authorization-cancelled')}`, request.url));
  try {
    const result = await completeGoogleOAuth(user.userId, state, cookieState, code);
    const response = NextResponse.redirect(new URL(`/?google=connected&workspace=${result.workspaceId}`, request.url));
    response.cookies.delete('chief_google_oauth');
    return response;
  } catch (error) {
    const codeValue = error instanceof GoogleConnectorError ? 'connection-failed' : 'unexpected-error';
    const response = NextResponse.redirect(new URL(`/?google=${codeValue}`, request.url));
    response.cookies.delete('chief_google_oauth');
    return response;
  }
}
