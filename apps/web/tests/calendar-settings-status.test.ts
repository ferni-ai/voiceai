/**
 * The calendar settings panel shows Google Calendar as connected when
 * GET /api/calendar/status says so.
 *
 * The server answers flat: { connected, configured, lastSynced, ... }
 * (src/api/calendar-routes/status-handlers.ts handleStatus). The panel read a
 * { success, status } envelope that never comes, so every connected user saw
 * "Connect" again right after connecting.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/utils/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

const api = vi.hoisted(() => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  apiDelete: vi.fn(),
  getUserId: vi.fn(() => 'device-1'),
}));
vi.mock('../src/utils/api.js', () => api);

/** The two status endpoints, answering exactly as the server does. */
function serverSays(googleConnected: boolean): void {
  api.apiGet.mockImplementation(async (path: string) => {
    if (path === '/api/calendar/status') {
      return {
        ok: true,
        status: 200,
        data: googleConnected
          ? { connected: true, configured: true, lastSynced: '2026-10-18T09:00:00.000Z' }
          : { connected: false, configured: true },
      };
    }
    if (path === '/api/calendar/providers/status') {
      return {
        ok: true,
        status: 200,
        data: {
          success: true,
          providers: {
            google: { provider: 'google', connected: googleConnected, configured: true },
            apple: { provider: 'apple', connected: false, configured: true },
            outlook: { provider: 'outlook', connected: false, configured: false },
          },
          outlookConfigured: false,
        },
      };
    }
    return { ok: false, status: 404, error: 'not found' };
  });
}

function googleCard(): Element {
  const cards = [...document.querySelectorAll('.calendar-settings__provider')];
  const google = cards.find((c) => c.querySelector('[data-action="sync"], [data-action="connect"]'));
  if (!google) throw new Error('Google Calendar card not rendered');
  return google;
}

beforeEach(() => {
  vi.clearAllMocks();
  // The panel is a module singleton and the test setup empties document.body
  // between tests: start each test with a fresh module (and a fresh panel).
  vi.resetModules();
});

describe('calendar settings: Google Calendar status', () => {
  it('a connected status renders Google as connected', async () => {
    serverSays(true);
    const { getCalendarSettingsUI } = await import('../src/ui/calendar-settings.ui.js');
    await getCalendarSettingsUI().show();

    const card = googleCard();
    expect(card.classList).toContain('calendar-settings__provider--connected');
    expect(card.querySelector('[data-action="disconnect"]')).not.toBeNull();
    expect(card.querySelector('[data-action="connect"]')).toBeNull();
  });

  it('a not-connected status offers Connect', async () => {
    serverSays(false);
    const { getCalendarSettingsUI } = await import('../src/ui/calendar-settings.ui.js');
    await getCalendarSettingsUI().show();

    const card = googleCard();
    expect(card.querySelector('[data-action="connect"]')).not.toBeNull();
    expect(card.querySelector('[data-action="disconnect"]')).toBeNull();
  });
});
