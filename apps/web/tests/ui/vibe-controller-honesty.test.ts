/**
 * The vibe controller reports only what the server or the voice agent confirms:
 * - no "vibe set!" when nothing in the room changed;
 * - play/pause go to the agent over the data channel, and "Playing" only shows
 *   once the agent reports music_state;
 * - no fake "Hue lights connected!" or Home Assistant/Nest options with no
 *   working connect flow.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/config/animation-constants.js', () => ({
  DURATION: { FAST: 150, NORMAL: 200, SLOW: 300 },
  EASING: {
    EXPO_OUT: 'ease-out',
    SPRING: 'ease-out',
    STANDARD: 'ease',
    EASE_IN_OUT: 'ease-in-out',
  },
}));
vi.mock('../../src/utils/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));
vi.mock('../../src/state/app.state.js', () => ({ getDeviceId: () => 'device-1' }));

const toast = { info: vi.fn(), success: vi.fn(), warning: vi.fn(), error: vi.fn() };
vi.mock('../../src/ui/whisper.ui.js', () => ({ toast }));

const mockApiGet = vi.fn();
const mockApiPost = vi.fn();
vi.mock('../../src/utils/api.js', () => ({ apiGet: mockApiGet, apiPost: mockApiPost }));

const mockGetRoom = vi.fn();
vi.mock('../../src/services/connection.service.js', () => ({
  connectionService: { getRoom: mockGetRoom },
}));

const showSmartHomeSettings = vi.fn(async () => undefined);
vi.mock('../../src/ui/smart-home-settings.ui.js', () => ({ showSmartHomeSettings }));

function serveStatus(): void {
  mockApiGet.mockImplementation(async (path: string) => {
    if (path === '/spotify/status') return { ok: true, status: 200, data: { linked: true } };
    if (path === '/api/vibe/lights/status')
      return { ok: true, status: 200, data: { connected: false, brightness: 50, colorTemp: 4000 } };
    if (path === '/api/ecobee/status') return { ok: true, status: 200, data: { connected: false } };
    return { ok: false, status: 404 };
  });
}

function musicStatusText(): string {
  const header = [...document.querySelectorAll('.vibe-section')].find((s) =>
    s.textContent?.includes('Music')
  );
  return header?.querySelector('.vibe-section__status')?.textContent ?? '';
}

function click(el: Element | null | undefined): void {
  expect(el).toBeTruthy();
  (el as HTMLElement).click();
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('vibe controller honesty', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    document.body.innerHTML = '';
    serveStatus();
    mockGetRoom.mockReturnValue(null);
  });

  it('does not say "vibe set" when the server applied nothing', async () => {
    mockApiPost.mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: {
        success: true,
        message: 'Focus vibe ready! Connect your devices in Settings → Your Home to activate.',
        applied: { music: false, lights: false, temperature: false },
      },
    });
    const vibe = await import('../../src/ui/vibe-controller.ui.js');
    await vibe.show();

    click(document.querySelector('[data-preset="focus"]'));
    await flush();
    await flush();

    expect(mockApiPost).toHaveBeenCalledWith('/api/vibe/activate', { presetId: 'focus' });
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.info).toHaveBeenLastCalledWith(
      'Focus vibe ready! Connect your devices in Settings → Your Home to activate.'
    );
  });

  it('play outside a call does not pretend to play or call a missing /api/spotify route', async () => {
    const vibe = await import('../../src/ui/vibe-controller.ui.js');
    await vibe.show();

    click(document.querySelector('.vibe-music__btn'));
    await flush();

    expect(mockApiPost).not.toHaveBeenCalled();
    expect(mockApiGet.mock.calls.map((c) => c[0])).not.toContain('/api/spotify/status');
    expect(musicStatusText()).toBe('Paused');
    expect(toast.info).toHaveBeenCalledWith('Music controls work during a conversation');
  });

  it('play in a call asks the agent and waits for music_state before showing Playing', async () => {
    const publishData = vi.fn(async () => undefined);
    mockGetRoom.mockReturnValue({ localParticipant: { publishData } });
    const vibe = await import('../../src/ui/vibe-controller.ui.js');
    await vibe.show();

    click(document.querySelector('.vibe-music__btn'));
    await flush();

    expect(publishData).toHaveBeenCalledTimes(1);
    const sent = JSON.parse(new TextDecoder().decode(publishData.mock.calls[0][0] as Uint8Array));
    expect(sent).toEqual({ type: 'music_control', action: 'resume' });
    expect(musicStatusText()).toBe('Paused');

    const { getMusicStateManager } = await import('../../src/services/music-state-manager.js');
    getMusicStateManager().handleStateChange({
      state: 'playing',
      trackName: 'Blue in Green',
      artistName: 'Miles Davis',
    } as never);
    await flush();

    expect(musicStatusText()).toBe('Playing');
  });

  it('lights setup offers only a real flow and never fakes a Hue connection', async () => {
    const vibe = await import('../../src/ui/vibe-controller.ui.js');
    await vibe.show();

    click(document.querySelector('.vibe-not-connected__btn'));
    const options = [...document.querySelectorAll('.vibe-setup__option-name')].map(
      (o) => o.textContent
    );
    expect(options).toEqual(['Philips Hue or LIFX']);

    click(document.querySelector('.vibe-setup__option'));
    await flush();
    await flush();

    expect(showSmartHomeSettings).toHaveBeenCalledTimes(1);
    expect(toast.success).not.toHaveBeenCalled();
    expect(mockApiPost).not.toHaveBeenCalled();
  });

  it('thermostat setup offers only Ecobee (Nest/Home Assistant have no working connect flow)', async () => {
    const vibe = await import('../../src/ui/vibe-controller.ui.js');
    await vibe.show();

    const buttons = [...document.querySelectorAll('.vibe-not-connected__btn')];
    click(buttons[buttons.length - 1]);
    const options = [...document.querySelectorAll('.vibe-setup__option-name')].map(
      (o) => o.textContent
    );

    expect(options).toEqual(['Ecobee']);
  });
});
