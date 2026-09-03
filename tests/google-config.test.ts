import { afterEach, describe, expect, it } from 'vitest';
import { GOOGLE_SCOPES, googleConfigured } from '../lib/google-config';

const keys = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REDIRECT_URI', 'TOKEN_ENCRYPTION_KEY'] as const;
const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));

afterEach(() => {
  for (const key of keys) {
    const value = previous[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe('Google production configuration', () => {
  it('fails closed until every server-side credential is present', () => {
    for (const key of keys) delete process.env[key];
    expect(googleConfigured()).toBe(false);
    for (const key of keys) process.env[key] = `test-${key}`;
    expect(googleConfigured()).toBe(true);
  });

  it('requests read, draft, and owned-event scopes without send or delete', () => {
    expect(GOOGLE_SCOPES).toContain('https://www.googleapis.com/auth/gmail.readonly');
    expect(GOOGLE_SCOPES).toContain('https://www.googleapis.com/auth/gmail.compose');
    expect(GOOGLE_SCOPES).toContain('https://www.googleapis.com/auth/calendar.events.owned');
    expect(GOOGLE_SCOPES.join(' ')).not.toMatch(/gmail\.send|mail\.google\.com|drive|delete/i);
  });
});
