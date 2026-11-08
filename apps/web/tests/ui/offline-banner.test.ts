/**
 * The offline banner's Retry reloads the page. During a call that would hang
 * up on the person, so while a call is up it re-checks the network instead.
 *
 * @vitest-environment jsdom
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const offline = vi.hoisted(() => ({
  recheck: vi.fn(() => Promise.resolve()),
}));
vi.mock('@/services/offline.service.js', () => ({
  isOffline: () => true,
  onOfflineChange: () => () => {},
  verifyConnectivity: offline.recheck,
}));

import { OVERLAY_HOST_STORAGE_KEY } from '@/ui/overlay/overlay-flag.js';
import { disposeOfflineBanner, initOfflineBanner } from '@/ui/offline-banner.ui.js';
import { appState } from '@/state/app.state.js';
import type { ConnectionState } from '@/types/events.js';

const realLocation = window.location;
const reload = vi.fn();

const retry = (): HTMLButtonElement =>
  document.querySelector('.offline-banner__retry') as HTMLButtonElement;

beforeEach(() => {
  localStorage.setItem(OVERLAY_HOST_STORAGE_KEY, 'false'); // the banner, not the status island
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { ...realLocation, reload },
  });
  reload.mockClear();
  offline.recheck.mockClear();
  initOfflineBanner();
});

afterEach(() => {
  disposeOfflineBanner();
  appState.set('connection', 'disconnected');
  Object.defineProperty(window, 'location', { configurable: true, value: realLocation });
  localStorage.removeItem(OVERLAY_HOST_STORAGE_KEY);
});

describe('offline banner Retry', () => {
  it.each<ConnectionState>(['connected', 'reconnecting'])(
    'during a %s call, re-checks the network and does not reload',
    (state) => {
      appState.set('connection', state);
      retry().click();
      expect(offline.recheck).toHaveBeenCalledOnce();
      expect(reload).not.toHaveBeenCalled();
    }
  );

  it.each<ConnectionState>(['disconnected', 'error'])('with no call up (%s), reloads', (state) => {
    appState.set('connection', state);
    retry().click();
    expect(reload).toHaveBeenCalledOnce();
    expect(offline.recheck).not.toHaveBeenCalled();
  });
});
