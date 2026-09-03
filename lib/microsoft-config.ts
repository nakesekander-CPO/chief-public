export const MICROSOFT_SCOPES = [
  'openid',
  'profile',
  'email',
  'offline_access',
  'User.Read',
  'Mail.ReadWrite',
  'Calendars.ReadWrite',
];

export function microsoftConfigured() {
  return Boolean(
    process.env.MICROSOFT_CLIENT_ID
    && process.env.MICROSOFT_CLIENT_SECRET
    && process.env.MICROSOFT_TENANT_ID
    && process.env.MICROSOFT_REDIRECT_URI
    && process.env.TOKEN_ENCRYPTION_KEY,
  );
}
