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

const ENV = ['GMAIL_CLIENT_ID', 'GMAIL_CLIENT_SECRET', 'GMAIL_REDIRECT_URI'];
const savedEnv: Record<string, string | undefined> = {};
let manager: InstanceType<typeof OAuthManager>;

function stateFrom(authUrl: string): string {
  return new URL(authUrl).searchParams.get('state')!;
}

beforeEach(() => {
  for (const k of ENV) savedEnv[k] = process.env[k];
  process.env.GMAIL_CLIENT_ID = 'test-client-id';
  process.env.GMAIL_CLIENT_SECRET = 'test-client-secret';
  process.env.GMAIL_REDIRECT_URI = 'https://app.example.test/api/oauth/callback/gmail';
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
  for (const k of ENV) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
});

describe('OAuthManager.handleCallback with sealing unavailable', () => {
  it('returns success:false and no tokens when the save is refused', async () => {
    saveOAuthTokens.mockResolvedValue({
      success: false,
      error: 'secure storage is not set up',
      code: 'sealing_unavailable',
    });
    const state = stateFrom(manager.getAuthorizationUrl('u1', 'gmail'));

    const result = await manager.handleCallback('auth-code', state);

    expect(saveOAuthTokens).toHaveBeenCalledTimes(1);
    expect(result.success).toBe(false);
    expect(result.tokens).toBeUndefined();
    expect(result.error).toBe('secure storage is not set up');
    expect(result).toMatchObject({ userId: 'u1', integrationId: 'gmail' });
  });

  it('control: a sealed save connects and returns the tokens', async () => {
    saveOAuthTokens.mockResolvedValue({ success: true });
    const state = stateFrom(manager.getAuthorizationUrl('u1', 'gmail'));

    const result = await manager.handleCallback('auth-code', state);

    expect(result.success).toBe(true);
    expect(result.tokens?.accessToken).toBe('test-access-token');
  });
});
