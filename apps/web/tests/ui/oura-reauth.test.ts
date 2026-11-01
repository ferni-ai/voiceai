/**
 * When Oura has refused the saved link, the Oura panel asks the person to connect again
 * instead of offering a first-time connect or showing stale numbers.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const apiGet = vi.fn();
vi.mock('../../src/utils/api.js', () => ({
  apiGet,
  apiPost: vi.fn(),
  apiDelete: vi.fn(),
  apiPut: vi.fn(),
}));
vi.mock('../../src/ui/whisper.ui.js', () => ({
  toast: { info: vi.fn(), success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

const { showOuraSettings, hideOuraSettings } = await import('../../src/ui/oura-settings.ui.js');

afterEach(() => {
  vi.useFakeTimers();
  hideOuraSettings();
  vi.runAllTimers();
  vi.useRealTimers();
  vi.clearAllMocks();
  document.body.innerHTML = '';
});

describe('Oura panel when the link needs renewing', () => {
  it('asks to reconnect', async () => {
    apiGet.mockResolvedValue({ ok: true, status: 200, data: { connected: false, needsReauth: true } });
    await showOuraSettings();
    const heading = document.querySelector('.oura-settings__connect h3');
    expect(heading?.textContent).toBe('Reconnect Your Oura Ring');
    expect(document.querySelector('.oura-settings__scores')).toBeNull();
  });

  it('a person who never connected still sees the first-time connect', async () => {
    apiGet.mockResolvedValue({ ok: true, status: 200, data: { connected: false } });
    await showOuraSettings();
    expect(document.querySelector('.oura-settings__connect h3')?.textContent).toBe(
      'Connect Your Oura Ring'
    );
  });
});
