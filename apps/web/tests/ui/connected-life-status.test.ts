/**
 * "What We're Connected To" (Connected Life) reads link status from routes that
 * exist, in the shapes they send, and says honestly what it found:
 * - /api/calendar/providers/status returns providers keyed by name, not an array;
 * - while the checks run, the menu's loading shell is up;
 * - a check that fails shows "Couldn't check" with Try again, never "not connected";
 * - a hidden tile's status is never requested (Spotify was polled while hidden).
 *
 * The panel is opened the way the menu opens it (openEverythingConnected).
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
const screens = vi.hoisted(() => ({ openCalendarSettings: vi.fn() }));
vi.mock('../../src/ui/lazy-screens.js', () => screens);
vi.mock('../../src/ui/spotify.ui.js', () => ({ triggerSpotifyLinkToggle: vi.fn() }));

const mockApiGet = vi.fn();
vi.mock('../../src/utils/api.js', () => ({ apiGet: mockApiGet }));

type Answer = { ok: boolean; status: number; data?: unknown; error?: string };
const ok = (data: unknown): Answer => ({ ok: true, status: 200, data });
/** What apiGet returns once a route has answered 500 (after its retries) */
const serverError: Answer = { ok: false, status: 500, error: 'HTTP 500' };

/** Answer each status route; anything else is a 404. */
function routes(v1: Answer, providers: Answer): void {
  mockApiGet.mockImplementation(async (path: string) => {
    if (path === '/api/v1/integrations/status') return v1;
    if (path === '/api/calendar/providers/status') return providers;
    return { ok: false, status: 404 };
  });
}

const providers = (appleConnected: boolean) =>
  ok({
    success: true,
    providers: {
      google: { provider: 'google', connected: false, configured: true },
      apple: { provider: 'apple', connected: appleConnected, configured: true },
    },
  });
const v1 = ok({ integrations: { calendar: { connected: false } } });

const calendarTile = () =>
  document.querySelector<HTMLElement>('[data-integration="google-calendar"]')!;

async function open(): Promise<void> {
  const { openEverythingConnected } = await import('../../src/ui/everything-connected.js');
  await openEverythingConnected();
}

describe('Connected Life status', () => {
  beforeEach(async () => {
    mockApiGet.mockReset();
    screens.openCalendarSettings.mockReset();
    (await import('../../src/ui/connected-life.ui.js')).connectedLifeUI.hide();
    await new Promise((r) => setTimeout(r, 350)); // hide() removes after DURATION.SLOW
    document.body.innerHTML = '';
  });

  it('connected: Calendar shows Connected, and the hidden Spotify tile is never asked', async () => {
    routes(v1, providers(true));
    await open();
    expect(calendarTile().classList.contains('connected')).toBe(true);
    expect(calendarTile().textContent).toContain('Connected');
    expect(mockApiGet.mock.calls.map(([path]) => path)).not.toContain('/spotify/status');
    expect(document.querySelector('[data-integration="spotify"]')).toBeNull();
  });

  it('disconnected: Calendar offers Connect, which opens calendar settings', async () => {
    routes(v1, providers(false));
    await open();
    expect(calendarTile().classList.contains('connected')).toBe(false);
    const button = calendarTile().querySelector<HTMLButtonElement>(
      '[data-connect="google-calendar"]'
    );
    expect(button).not.toBeNull();
    expect(calendarTile().textContent).not.toContain('check');
    button!.click();
    expect(screens.openCalendarSettings).toHaveBeenCalledTimes(1);
  });

  it('500: Calendar says it could not check, not "not connected", and Try again re-checks', async () => {
    routes(v1, serverError);
    await open();
    expect(calendarTile().classList.contains('connected')).toBe(false);
    expect(calendarTile().querySelector('[data-connect]')).toBeNull();
    expect(calendarTile().querySelector('.connected-life-status.error')?.textContent).toContain(
      'check'
    );

    routes(v1, providers(true));
    calendarTile().querySelector<HTMLButtonElement>('[data-retry="google-calendar"]')!.click();
    await vi.waitFor(() => expect(calendarTile().classList.contains('connected')).toBe(true));
  });

  it('shows the loading shell while the checks run, side by side, then the panel', async () => {
    let answer!: () => void;
    const pending = new Promise<void>((r) => (answer = r));
    mockApiGet.mockImplementation(async (path: string) => {
      await pending;
      return path === '/api/v1/integrations/status' ? v1 : providers(true);
    });
    const opening = open();
    await vi.waitFor(() => expect(mockApiGet).toHaveBeenCalledTimes(2)); // both before either answers
    expect(document.querySelector('.panel-loading-shell')).not.toBeNull();
    expect(document.querySelector('.connected-life-overlay')).toBeNull();

    answer();
    await opening;
    expect(document.querySelector('.panel-loading-shell')).toBeNull();
    expect(calendarTile().classList.contains('connected')).toBe(true);
  });
});
