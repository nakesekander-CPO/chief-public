import type { NextRequest } from 'next/server';

export function validMutation(request: NextRequest) {
  const token = request.cookies.get('chief_csrf')?.value;
  const headerToken = request.headers.get('x-chief-csrf');
  const origin = request.headers.get('origin');
  const sameOrigin = !origin || origin === new URL(request.url).origin;
  const fetchSite = request.headers.get('sec-fetch-site');
  return Boolean(token && token === headerToken && sameOrigin && (!fetchSite || fetchSite === 'same-origin'));
}
