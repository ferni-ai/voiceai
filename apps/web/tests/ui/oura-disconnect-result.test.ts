/**
 * Oura disconnect used to say "disconnected" even when the API call failed,
 * because the api helpers return { ok: false } instead of throwing.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

const apiGet = vi.fn();
const apiDelete = vi.fn();
vi.mock('../../src/utils/api.js', () => ({ apiGet, apiDelete, apiPost: vi.fn(), apiPut: vi.fn() }));
const toast = { info: vi.fn(), success: vi.fn(), error: vi.fn(), warning: vi.fn() };
vi.mock('../../src/ui/whisper.ui.js', () => ({ toast }));

const { showOuraSettings, hideOuraSettings } = await import('../../src/ui/oura-settings.ui.js');
const { t } = await import('../../src/i18n/index.js');

async function clickDisconnect(): Promise<void> {
  apiGet.mockResolvedValue({ ok: true, status: 200, data: { connected: true } });
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  await showOuraSettings();
  await vi.waitFor(() => {
    expect(document.querySelector('.oura-settings__disconnect')).not.toBeNull();
  });
  document.querySelector<HTMLButtonElement>('.oura-settings__disconnect')?.click();
  await vi.waitFor(() => {
    expect(toast.success.mock.calls.length + toast.error.mock.calls.length).toBeGreaterThan(0);
  });
}

afterEach(() => {
  vi.useFakeTimers();
  hideOuraSettings();
  vi.runAllTimers();
  vi.useRealTimers();
  vi.clearAllMocks();
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('Oura disconnect result', () => {
  it('shows an error, not success, when the disconnect request fails', async () => {
    apiDelete.mockResolvedValue({ ok: false, status: 500, error: 'server error' });

    await clickDisconnect();

    expect(toast.error).toHaveBeenCalledWith(t('toasts.couldNotDisconnect'));
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('confirms when the disconnect request succeeds', async () => {
    apiDelete.mockResolvedValue({ ok: true, status: 200 });

    await clickDisconnect();

    expect(toast.success).toHaveBeenCalledWith(t('toasts.ouraDisconnected'));
    expect(toast.error).not.toHaveBeenCalled();
  });
});
