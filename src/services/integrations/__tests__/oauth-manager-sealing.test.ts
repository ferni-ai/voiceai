/**
 * OAuth callback: when the token store refuses to save (no token key), the
 * user is not connected. The callback reports failure and hands back no tokens.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const saveOAuthTokens = vi.fn();

vi.mock('../oauth-token-store.js', () => ({
  saveOAuthTokens: (...args: unknown[]) => saveOAuthTokens(...args),
  getOAuthTokens: vi.fn(),
  updateOAuthTokens: vi.fn(),
  deleteOAuthTokens: vi.fn(),
  getConnectionStatus: vi.fn(),
  getConnectedIntegrations: vi.fn(),
  markConnectionError: vi.fn(),
  needsRefresh: vi.fn(),
}));

const { OAuthManager } = await import('../oauth-manager.js');

// google_calendar: an OAUTH_CONFIGS entry on main (gmail was removed in #3140).
const INTEGRATION = 'google_calendar';
let manager: InstanceType<typeof OAuthManager>;

function stateFrom(authUrl: string): string {
  return new URL(authUrl).searchParams.get('state')!;
}

beforeEach(() => {
  vi.stubEnv('GOOGLE_CALENDAR_CLIENT_ID', 'test-client-id');
  vi.stubEnv('GOOGLE_CALENDAR_CLIENT_SECRET', 'test-client-secret');
  vi.stubEnv(
    'GOOGLE_CALENDAR_REDIRECT_URI',
    'https://app.example.test/api/oauth/callback/google_calendar'
  );
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: true,
      json: async () => ({
        access_token: 'test-access-token',
        refresh_token: 'test-refresh-token',
        expires_in: 3600,
        token_type: 'Bearer',
      }),
    }))
  );
  saveOAuthTokens.mockReset();
  manager = new OAuthManager();
});

afterEach(() => {
  manager.dispose();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('OAuthManager.handleCallback with sealing unavailable', () => {
  it('returns success:false and no tokens when the save is refused', async () => {
    saveOAuthTokens.mockResolvedValue({
      success: false,
      error: 'secure storage is not set up',
      code: 'sealing_unavailable',
    });
    const state = stateFrom(manager.getAuthorizationUrl('u1', INTEGRATION));

    const result = await manager.handleCallback('auth-code', state);

    expect(saveOAuthTokens).toHaveBeenCalledTimes(1);
    expect(result.success).toBe(false);
    expect(result.tokens).toBeUndefined();
    expect(result.error).toBe('secure storage is not set up');
    expect(result).toMatchObject({ userId: 'u1', integrationId: INTEGRATION });
  });

  it('control: a sealed save connects and returns the tokens', async () => {
    saveOAuthTokens.mockResolvedValue({ success: true });
    const state = stateFrom(manager.getAuthorizationUrl('u1', INTEGRATION));

    const result = await manager.handleCallback('auth-code', state);

    expect(result.success).toBe(true);
    expect(result.tokens?.accessToken).toBe('test-access-token');
  });
});
