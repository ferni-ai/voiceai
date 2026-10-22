/**
 * Google Calendar OAuth settings are trimmed: a secret stored with a trailing
 * newline must not reach Google as part of the client id, secret or redirect.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  googleCalendarClientId,
  googleCalendarClientSecret,
  googleCalendarRedirectUri,
  isGoogleCalendarOAuthConfigured,
} from '../google-calendar-oauth-env.js';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('google calendar OAuth env', () => {
  it('a value with a trailing newline yields the trimmed value', () => {
    vi.stubEnv('GOOGLE_CALENDAR_CLIENT_ID', 'client-id.apps.googleusercontent.com\n');
    vi.stubEnv('GOOGLE_CALENDAR_CLIENT_SECRET', ' secret-value\r\n');
    vi.stubEnv('GOOGLE_CALENDAR_REDIRECT_URI', 'https://example.test/auth/google/callback\n');

    expect(googleCalendarClientId()).toBe('client-id.apps.googleusercontent.com');
    expect(googleCalendarClientSecret()).toBe('secret-value');
    expect(googleCalendarRedirectUri('https://fallback.test/cb')).toBe(
      'https://example.test/auth/google/callback'
    );
  });

  it('blank values count as unset', () => {
    vi.stubEnv('GOOGLE_CALENDAR_CLIENT_ID', '\n');
    vi.stubEnv('GOOGLE_CALENDAR_CLIENT_SECRET', 'secret');
    vi.stubEnv('GOOGLE_CALENDAR_REDIRECT_URI', '  ');

    expect(isGoogleCalendarOAuthConfigured()).toBe(false);
    expect(googleCalendarRedirectUri('https://fallback.test/cb')).toBe('https://fallback.test/cb');
  });

  it('the Gmail connect URL carries the trimmed client id', async () => {
    vi.stubEnv('GOOGLE_CALENDAR_CLIENT_ID', 'client-id\n');
    vi.stubEnv('GOOGLE_CALENDAR_REDIRECT_URI', 'https://example.test/cb\n');
    const { buildGmailSendAuthUrl } = await import('../../services/identity/gmail-send-as-user.js');

    const url = new URL(buildGmailSendAuthUrl('state-1'));
    expect(url.searchParams.get('client_id')).toBe('client-id');
    expect(url.searchParams.get('redirect_uri')).toBe('https://example.test/cb');
  });
});
