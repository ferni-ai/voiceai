/**
 * Every "connect account" navigation first asks POST /auth/oauth/start (with
 * the user's token) and then goes to the URL the server returns. They used to
 * navigate straight to /auth/google/login?user_id=… (and /auth/microsoft,
 * /auth/google/calendar?userId=…, /wearables/<p>/login?user_id=…), and the
 * server linked the provider account to whatever id the URL named.
 *
 * Server side: src/servers/api/__tests__/oauth-connect-identity.test.ts
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/utils/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

const api = vi.hoisted(() => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  apiDelete: vi.fn(),
  getUserId: vi.fn(() => 'device-1'),
}));
vi.mock('../../src/utils/api.js', () => api);

const toast = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  warning: vi.fn(),
}));
vi.mock('../../src/ui/whisper.ui.js', () => ({ toast, toastInfo: vi.fn() }));

const mockLocation = { href: 'http://localhost:3004/' };
Object.defineProperty(window, 'location', { value: mockLocation, writable: true });

const START = '/auth/oauth/start';

function serverReturns(url: string) {
  api.apiPost.mockResolvedValueOnce({ ok: true, status: 200, data: { url } });
}

function expectStarted(provider: string, url: string) {
  expect(api.apiPost).toHaveBeenCalledWith(START, { provider, returnUrl: '/' }, { maxRetries: 0 });
  expect(mockLocation.href).toBe(url);
  expect(mockLocation.href).not.toMatch(/user_?id/i);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockLocation.href = 'http://localhost:3004/';
});

describe('startOAuthConnect', () => {
  it('navigates only after the server returns a login URL', async () => {
    const { startOAuthConnect } = await import('../../src/services/oauth-connect.service.js');
    serverReturns('/auth/google/login?state=s1');
    expect(await startOAuthConnect('google_calendar')).toEqual({ success: true });
    expectStarted('google_calendar', '/auth/google/login?state=s1');
  });

  it('does not navigate when the server refuses (not signed in)', async () => {
    const { startOAuthConnect } = await import('../../src/services/oauth-connect.service.js');
    api.apiPost.mockResolvedValueOnce({ ok: false, status: 401, error: 'Sign in required' });
    const result = await startOAuthConnect('oura');
    expect(result).toEqual({ success: false, error: 'Sign in first, then connect' });
    expect(mockLocation.href).toBe('http://localhost:3004/');
  });

  it('never follows an off-site URL', async () => {
    const { startOAuthConnect } = await import('../../src/services/oauth-connect.service.js');
    for (const url of ['https://evil.example/x', '//evil.example/x']) {
      serverReturns(url);
      expect((await startOAuthConnect('google_calendar')).success).toBe(false);
    }
    expect(mockLocation.href).toBe('http://localhost:3004/');
  });
});

describe('calendar connect buttons', () => {
  it('calendar view: Google and Outlook go through the start endpoint', async () => {
    const { calendarViewUI } = await import('../../src/ui/calendar-view.ui.js');
    const view = calendarViewUI as unknown as { startConnect(p: string): Promise<void> };

    serverReturns('/auth/google/login?state=g');
    await view.startConnect('google_calendar');
    expectStarted('google_calendar', '/auth/google/login?state=g');

    serverReturns('/auth/microsoft/login?state=m');
    await view.startConnect('microsoft_calendar');
    expectStarted('microsoft_calendar', '/auth/microsoft/login?state=m');
  });

  it('calendar view: a refused start shows an error and stays put', async () => {
    const { calendarViewUI } = await import('../../src/ui/calendar-view.ui.js');
    const view = calendarViewUI as unknown as { startConnect(p: string): Promise<void> };
    api.apiPost.mockResolvedValueOnce({ ok: false, status: 500 });
    await view.startConnect('google_calendar');
    expect(toast.error).toHaveBeenCalledWith("Couldn't connect. Try again?");
    expect(mockLocation.href).toBe('http://localhost:3004/');
  });

  it('calendar settings: Google and Outlook go through the start endpoint', async () => {
    const { getCalendarSettingsUI } = await import('../../src/ui/calendar-settings.ui.js');
    const settings = getCalendarSettingsUI() as unknown as {
      connectGoogle(): Promise<void>;
      connectOutlook(): Promise<void>;
    };

    serverReturns('/auth/google/login?state=g2');
    await settings.connectGoogle();
    expectStarted('google_calendar', '/auth/google/login?state=g2');

    serverReturns('/auth/microsoft/login?state=m2');
    await settings.connectOutlook();
    expectStarted('microsoft_calendar', '/auth/microsoft/login?state=m2');
  });
});

describe('Spotify link button', () => {
  // The button used to navigate to /spotify/login?device_id=…, and the server
  // saved the Spotify tokens under whatever device_id the URL named.
  // Server side: src/servers/api/__tests__/spotify-link-identity.test.ts
  it('starts through the start endpoint, not /spotify/login?device_id=…', async () => {
    vi.doMock('../../src/state/app.state.js', () => ({ getDeviceId: () => 'device-1' }));
    const { triggerSpotifyLinkToggle } = await import('../../src/ui/spotify.ui.js');
    Object.assign(mockLocation, { pathname: '/music' });

    serverReturns('/spotify/login?state=sp');
    await triggerSpotifyLinkToggle();

    expect(api.apiPost).toHaveBeenCalledWith(
      START,
      { provider: 'spotify', returnUrl: '/music' },
      { maxRetries: 0 }
    );
    expect(mockLocation.href).toBe('/spotify/login?state=sp');
    expect(mockLocation.href).not.toMatch(/device_id/);
  });
});
