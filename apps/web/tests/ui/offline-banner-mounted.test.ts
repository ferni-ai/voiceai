/**
 * The "You're offline" alert exists only while offline. It used to stay
 * mounted (inert, slid off-screen) the whole time the app was online, so an
 * alert with "Try again" sat in the page for every visitor (app audit
 * 2026-11-16, item 18).
 *
 * @vitest-environment jsdom
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const net = vi.hoisted(() => ({ offline: false, listener: null as ((offline: boolean) => void) | null }));
vi.mock('@/services/offline.service.js', () => ({
  isOffline: () => net.offline,
  onOfflineChange: (listener: (offline: boolean) => void) => {
    net.listener = listener;
    return () => {
      net.listener = null;
    };
  },
  verifyConnectivity: vi.fn(() => Promise.resolve()),
}));

import { OVERLAY_HOST_STORAGE_KEY } from '@/ui/overlay/overlay-flag.js';
import { disposeOfflineBanner, initOfflineBanner } from '@/ui/offline-banner.ui.js';

const alerts = () => document.querySelectorAll('[role="alert"]');

beforeEach(() => {
  localStorage.setItem(OVERLAY_HOST_STORAGE_KEY, 'false'); // the banner, not the status island
  net.offline = false;
});

afterEach(() => {
  disposeOfflineBanner();
  localStorage.removeItem(OVERLAY_HOST_STORAGE_KEY);
});

describe('offline banner presence', () => {
  it('is not in the page while online', () => {
    initOfflineBanner();
    expect(alerts()).toHaveLength(0);
    expect(document.querySelector('.offline-banner__retry')).toBeNull();
  });

  it('appears when the network drops and leaves when it returns', () => {
    initOfflineBanner();
    net.listener?.(true);
    expect(alerts()).toHaveLength(1);
    expect(alerts()[0]?.textContent).toContain("You're offline");

    net.listener?.(false);
    expect(alerts()).toHaveLength(0);
  });

  it('is shown at once when the app starts offline', () => {
    net.offline = true;
    initOfflineBanner();
    expect(alerts()).toHaveLength(1);
  });
});
