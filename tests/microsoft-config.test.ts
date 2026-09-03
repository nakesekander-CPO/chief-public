import { afterEach, describe, expect, it } from 'vitest';
import { MICROSOFT_SCOPES, microsoftConfigured } from '../lib/microsoft-config';

const keys = ['MICROSOFT_CLIENT_ID', 'MICROSOFT_CLIENT_SECRET', 'MICROSOFT_TENANT_ID', 'MICROSOFT_REDIRECT_URI', 'TOKEN_ENCRYPTION_KEY'] as const;
const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));

afterEach(() => {
  for (const key of keys) {
    const value = previous[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe('Microsoft 365 production configuration', () => {
  it('fails closed until every server-side credential is present', () => {
    for (const key of keys) delete process.env[key];
    expect(microsoftConfigured()).toBe(false);
    for (const key of keys) process.env[key] = `test-${key}`;
    expect(microsoftConfigured()).toBe(true);
  });

  it('requests mail and calendar access without mail send', () => {
    expect(MICROSOFT_SCOPES).toContain('Mail.ReadWrite');
    expect(MICROSOFT_SCOPES).toContain('Calendars.ReadWrite');
    expect(MICROSOFT_SCOPES).toContain('offline_access');
    expect(MICROSOFT_SCOPES.join(' ')).not.toMatch(/Mail\.Send|Files\.|Contacts\.|Directory\.|Chat\.|Sites\./i);
  });
});
