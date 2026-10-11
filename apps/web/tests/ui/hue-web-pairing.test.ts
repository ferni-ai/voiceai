// @vitest-environment-options {"url":"https://app.ferni.ai/"}
/**
 * Hue pairing on the web: the bridge only speaks plain HTTP on the LAN, which
 * an HTTPS page can't call (mixed content). The web flow must not start that
 * doomed local pairing and must say so instead.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/utils/api.js', () => ({
  apiGet: vi.fn(async () => ({ ok: false, status: 404, data: null })),
  apiPost: vi.fn(async () => ({ ok: true, status: 200, data: {} })),
  apiDelete: vi.fn(async () => ({ ok: true, status: 200, data: {} })),
}));
vi.mock('../../src/ui/whisper.ui.js', () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

import { canPairHueLocally } from '../../src/ui/hue-web-pairing.js';
import {
  hideSmartHomeSettings,
  showSmartHomeSettings,
} from '../../src/ui/smart-home-settings.ui.js';

describe('canPairHueLocally', () => {
  it('refuses local pairing from an HTTPS page', () => {
    expect(canPairHueLocally('https:')).toBe(false);
  });

  it('allows local pairing from a plain HTTP page', () => {
    expect(canPairHueLocally('http:')).toBe(true);
  });

  it('reads the current page protocol by default', () => {
    expect(window.location.protocol).toBe('https:');
    expect(canPairHueLocally()).toBe(false);
  });
});

describe('Hue setup on an HTTPS page', () => {
  const fetchSpy = vi.fn(async () => new Response('[]'));

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchSpy);
    fetchSpy.mockClear();
  });

  afterEach(() => {
    vi.useFakeTimers();
    hideSmartHomeSettings();
    vi.runAllTimers();
    vi.useRealTimers();
    document.body.innerHTML = '';
    vi.unstubAllGlobals();
  });

  async function openHueSetup(): Promise<void> {
    await showSmartHomeSettings();
    const cards = Array.from(document.querySelectorAll<HTMLElement>('.smart-home-settings__card'));
    // Cards render in a fixed order: Ecobee, then Philips Hue.
    const hueCard = cards[1];
    expect(hueCard).toBeDefined();
    hueCard?.click();
  }

  it('shows the web-unavailable notice instead of the bridge IP step', async () => {
    await openHueSetup();

    expect(document.querySelector('[data-hue-web-unavailable]')).not.toBeNull();
    expect(document.querySelector('.smart-home-settings__input')).toBeNull();
  });

  it('never calls a bridge over plain HTTP', async () => {
    await openHueSetup();

    const ipInput = document.querySelector<HTMLInputElement>('.smart-home-settings__input');
    if (ipInput) ipInput.value = '192.168.1.100';
    for (const btn of Array.from(
      document.querySelectorAll<HTMLButtonElement>('.smart-home-settings__setup button')
    )) {
      if (!btn.classList.contains('smart-home-settings__back-btn')) btn.click();
    }
    await Promise.resolve();

    const httpCalls = fetchSpy.mock.calls.filter(([url]) => String(url).startsWith('http://'));
    expect(httpCalls).toEqual([]);
  });
});
