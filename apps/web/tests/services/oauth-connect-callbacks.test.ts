/**
 * The remaining "connect account" navigations (calendar view callback,
 * integrations panel calendar + wearables) go through POST /auth/oauth/start,
 * and the wearable return (?<provider>_linked / _error) is reported to the user
 * only after the server's status confirms it.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/utils/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

const api = vi.hoisted(() => ({ apiGet: vi.fn(), apiPost: vi.fn(), apiDelete: vi.fn() }));
vi.mock('../../src/utils/api.js', () => api);

const toast = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  warning: vi.fn(),
}));
vi.mock('../../src/ui/whisper.ui.js', () => ({ toast, toastInfo: vi.fn() }));

const calendarView = vi.hoisted(() => ({
  callbacks: {} as { onConnectCalendar?: () => void },
}));
vi.mock('../../src/ui/calendar-view.ui.js', () => ({
  setCalendarViewCallbacks: (c: { onConnectCalendar?: () => void }) => {
    calendarView.callbacks = c;
  },
  showCalendarView: vi.fn(),
}));
vi.mock('../../src/ui/integrations-settings.ui.js', () => ({
  getIntegrationsSettingsUI: () => ({ show: vi.fn() }),
}));
const messageUI = vi.hoisted(() => ({ show: vi.fn() }));
vi.mock('../../src/ui/message.ui.js', () => ({ messageUI }));
vi.mock('../../src/services/linkedin.service.js', () => ({
  connectLinkedIn: vi.fn(),
  disconnectLinkedIn: vi.fn(),
  handleLinkedInCallback: vi.fn(),
}));

const mockLocation = { href: 'http://localhost:3004/' };
Object.defineProperty(window, 'location', { value: mockLocation, writable: true });

const START = '/auth/oauth/start';
const wearables = (ouraLinked: boolean) => ({
  ok: true,
  status: 200,
  data: {
    providers: [
      { provider: 'oura', configured: true, linked: ouraLinked },
      { provider: 'whoop', configured: false, linked: false },
    ],
  },
});

beforeEach(() => {
  vi.clearAllMocks();
  mockLocation.href = 'http://localhost:3004/';
});

describe('connect navigations', () => {
  it('calendar view (lazy screen) starts Google through the start endpoint', async () => {
    const { openCalendarView } = await import('../../src/ui/lazy-screens.js');
    await openCalendarView();
    api.apiPost.mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: { url: '/auth/google/login?state=v' },
    });
    calendarView.callbacks.onConnectCalendar?.();
    await vi.waitFor(() => expect(mockLocation.href).toBe('/auth/google/login?state=v'));
    expect(api.apiPost).toHaveBeenCalledWith(
      START,
      { provider: 'google_calendar', returnUrl: '/' },
      { maxRetries: 0 }
    );
  });

  it('integrations panel: calendar and wearable connect go through the start endpoint', async () => {
    const { createIntegrationsCallbacks } = await import('../../src/app/integrations-callbacks.js');
    const callbacks = createIntegrationsCallbacks();

    api.apiPost.mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: { url: '/auth/google/login?state=i' },
    });
    callbacks.onConnectCalendar?.();
    await vi.waitFor(() => expect(mockLocation.href).toBe('/auth/google/login?state=i'));

    api.apiGet.mockResolvedValueOnce(wearables(false));
    api.apiPost.mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: { url: '/wearables/oura/login?state=w' },
    });
    await callbacks.onConnectBiometrics?.('oura');
    expect(api.apiGet).toHaveBeenCalledWith('/wearables/status');
    expect(api.apiPost).toHaveBeenLastCalledWith(
      START,
      { provider: 'oura', returnUrl: '/' },
      { maxRetries: 0 }
    );
    expect(mockLocation.href).toBe('/wearables/oura/login?state=w');
  });

  it('integrations panel: a refused calendar start shows an error, no navigation', async () => {
    const { createIntegrationsCallbacks } = await import('../../src/app/integrations-callbacks.js');
    api.apiPost.mockResolvedValueOnce({ ok: false, status: 401 });
    createIntegrationsCallbacks().onConnectCalendar?.();
    await vi.waitFor(() =>
      expect(messageUI.show).toHaveBeenCalledWith('Sign in first, then connect', 'error', 4000)
    );
    expect(mockLocation.href).toBe('http://localhost:3004/');
  });
});

describe('wearable OAuth return', () => {
  it('confirms with the server, then says connected and cleans the URL', async () => {
    const { handleWearableOAuthReturn } = await import('../../src/app/oauth-return.js');
    const replaceState = vi.spyOn(window.history, 'replaceState').mockImplementation(() => {});
    mockLocation.href = 'http://localhost:3004/?oura_linked=true';
    api.apiGet.mockResolvedValueOnce(wearables(true));
    await handleWearableOAuthReturn();
    expect(api.apiGet).toHaveBeenCalledWith('/wearables/status');
    expect(toast.success).toHaveBeenCalledWith('Oura Ring connected!');
    expect(replaceState).toHaveBeenCalledWith({}, '', '/');
  });

  it('does not claim success when the server does not show the link', async () => {
    const { handleWearableOAuthReturn } = await import('../../src/app/oauth-return.js');
    mockLocation.href = 'http://localhost:3004/?oura_linked=true';
    api.apiGet.mockResolvedValueOnce(wearables(false));
    await handleWearableOAuthReturn();
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith("Couldn't confirm Oura Ring. Try again?");
  });

  it('reports a provider error', async () => {
    const { handleWearableOAuthReturn } = await import('../../src/app/oauth-return.js');
    mockLocation.href = 'http://localhost:3004/?whoop_error=invalid_state';
    await handleWearableOAuthReturn();
    expect(toast.error).toHaveBeenCalledWith("Couldn't connect WHOOP. Try again?");
    expect(api.apiGet).not.toHaveBeenCalled();
  });

  it('does nothing on an ordinary page load', async () => {
    const { handleWearableOAuthReturn } = await import('../../src/app/oauth-return.js');
    await handleWearableOAuthReturn();
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });
});
