import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export function GET() {
  return NextResponse.json({
    status: 'ok',
    service: 'chief',
    mode: 'personal',
    capabilities: {
      openai: Boolean(process.env.OPENAI_API_KEY),
      google: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REDIRECT_URI && process.env.TOKEN_ENCRYPTION_KEY),
      microsoft: Boolean(process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET && process.env.MICROSOFT_TENANT_ID && process.env.MICROSOFT_REDIRECT_URI && process.env.TOKEN_ENCRYPTION_KEY),
    },
    timestamp: new Date().toISOString(),
  }, { headers: { 'cache-control': 'no-store' } });
}
