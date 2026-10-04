/**
 * Connected Life reads link status from routes that exist, in the shapes they send:
 * - /spotify/status needs device_id (without it the server reports SDK config, not the user's link);
 * - /api/calendar/providers/status returns providers keyed by name, not an array.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/config/animation-constants.js', () => ({
  DURATION: { FAST: 150, NORMAL: 200, SLOW: 300 },
  EASING: { EXPO_OUT: 'ease-out', SPRING: 'ease-out', STANDARD: 'ease' },
}));
vi.mock('../../src/utils/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));
vi.mock('../../src/state/app.state.js', () => ({ getDeviceId: () => 'device-1' }));

const mockApiGet = vi.fn();
vi.mock('../../src/utils/api.js', () => ({ apiGet: mockApiGet }));

describe('Connected Life status', () => {
  beforeEach(() => {
    mockApiGet.mockReset();
    document.body.innerHTML = '';
  });

  it('marks Spotify and Calendar connected from the real routes and shapes', async () => {
    mockApiGet.mockImplementation(async (path: string, params?: Record<string, string>) => {
      if (path === '/api/v1/integrations/status') {
        return {
          ok: true,
          status: 200,
          data: { integrations: { calendar: { connected: false } } },
        };
      }
      if (path === '/spotify/status' && params?.device_id === 'device-1') {
        return { ok: true, status: 200, data: { spotify_configured: true, linked: true } };
      }
      if (path === '/api/calendar/providers/status') {
        return {
          ok: true,
          status: 200,
          data: {
            success: true,
            providers: {
              google: { provider: 'google', connected: false, configured: true },
              apple: { provider: 'apple', connected: true, configured: true },
              outlook: { provider: 'outlook', connected: false, configured: false },
            },
          },
        };
      }
      return { ok: false, status: 404 };
    });
    const { showConnectedLife } = await import('../../src/ui/connected-life.ui.js');

    await showConnectedLife();

    const connected = (id: string) =>
      document.querySelector(`[data-integration="${id}"]`)?.classList.contains('connected');
    document.querySelector<HTMLElement>('[data-tab="calendar"]')?.click();
    expect(connected('google-calendar')).toBe(true);

    document.querySelector<HTMLElement>('[data-tab="vibe"]')?.click();
    expect(connected('spotify')).toBe(true);
  });
});
