/**
 * Apple Music connect feedback used to go out as a `ferni:toast` event nothing
 * listened for, so the user saw nothing. It shows the app's real toast now.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

const apiGet = vi.fn();
const apiPost = vi.fn();
vi.mock('../src/utils/api.js', () => ({ apiGet, apiPost, apiPut: vi.fn(), apiDelete: vi.fn() }));
const toast = { info: vi.fn(), success: vi.fn(), error: vi.fn(), warning: vi.fn() };
vi.mock('../src/ui/whisper.ui.js', () => ({ toast }));

const { musicDashboard } = await import('../src/ui/music-dashboard.ui.js');
const { t } = await import('../src/i18n/index.js');

const connectAppleMusic = () =>
  (musicDashboard as unknown as { connectAppleMusic(): Promise<void> }).connectAppleMusic();

afterEach(() => {
  vi.clearAllMocks();
  delete (window as { MusicKit?: unknown }).MusicKit;
});

describe('Apple Music connect toasts', () => {
  it('says so when the server has no Apple Music', async () => {
    const stray = vi.fn();
    window.addEventListener('ferni:toast', stray);
    apiGet.mockResolvedValue({ ok: true, status: 200, data: { success: false } });

    await connectAppleMusic();

    expect(toast.info).toHaveBeenCalledWith(t('musicDashboard.appleMusic.notAvailable'));
    expect(stray).not.toHaveBeenCalled();
    window.removeEventListener('ferni:toast', stray);
  });

  it('says what is required when MusicKit is not loaded', async () => {
    apiGet.mockResolvedValue({ ok: true, status: 200, data: { success: true, developerToken: 'dev' } });

    await connectAppleMusic();

    expect(toast.info).toHaveBeenCalledWith(t('musicDashboard.appleMusic.requirement'));
  });

  it('reports a failed connect as an error', async () => {
    apiGet.mockRejectedValue(new Error('network'));

    await connectAppleMusic();

    expect(toast.error).toHaveBeenCalledWith(t('musicDashboard.appleMusic.connectFailed'));
  });

  it('confirms a successful connect', async () => {
    apiGet.mockResolvedValue({ ok: true, status: 200, data: { success: true, developerToken: 'dev' } });
    apiPost.mockResolvedValue({ ok: true, status: 200, data: { success: true } });
    const instance = { authorize: vi.fn().mockResolvedValue('user-token') };
    (window as unknown as { MusicKit: unknown }).MusicKit = {
      configure: vi.fn().mockResolvedValue(undefined),
      getInstance: () => instance,
    };
    const show = vi.spyOn(musicDashboard, 'show').mockImplementation(() => undefined);

    await connectAppleMusic();

    expect(toast.success).toHaveBeenCalledWith(t('musicDashboard.appleMusic.connected'));
    show.mockRestore();
  });
});
