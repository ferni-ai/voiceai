/**
 * Offline banner + connection quality as status-island states (overlay plan item o).
 *
 * @vitest-environment jsdom
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const offline = vi.hoisted(() => ({
  value: false,
  listeners: new Set<(o: boolean) => void>(),
}));
vi.mock('@/services/offline.service.js', () => ({
  isOffline: () => offline.value,
  onOfflineChange: (cb: (o: boolean) => void) => {
    offline.listeners.add(cb);
    return () => offline.listeners.delete(cb);
  },
}));

import { OVERLAY_HOST_STORAGE_KEY } from '@/ui/overlay/overlay-flag.js';
import { TOAST_REGION_STORAGE_KEY } from '@/ui/overlay/toast-flag.js';
import {
  BACK_ONLINE_MS,
  WEAK_AFTER_MS,
  handleIslandConnectionState,
  initStatusIslandConnection,
  islandConnectionState,
  resetStatusIslandConnection,
  setIslandOffline,
  setIslandPoorQuality,
} from '@/ui/status-island-connection.js';
import { disposeOfflineBanner, initOfflineBanner } from '@/ui/offline-banner.ui.js';
import * as quality from '@/ui/connection-quality.ui.js';

const ISLAND_HTML =
  '<div class="status-island" id="statusIsland">' +
  '<div id="transcriptContainer" class="status-pill visible"><p id="transcriptText">so I was thinking</p></div>' +
  '</div>';

const pill = (): HTMLElement => document.querySelector('.status-island__connection') as HTMLElement;
const island = (): HTMLElement => document.getElementById('statusIsland') as HTMLElement;
const goOffline = (value: boolean): void => {
  offline.value = value;
  offline.listeners.forEach((cb) => cb(value));
};

function setFlag(on: boolean): void {
  localStorage.setItem(OVERLAY_HOST_STORAGE_KEY, on ? 'true' : 'false');
  // Off means the old corner pill too: the toast-region kill switch (toast-flag.ts)
  localStorage.setItem(TOAST_REGION_STORAGE_KEY, on ? 'on' : 'off');
}

beforeEach(() => {
  vi.useFakeTimers();
  document.body.innerHTML = ISLAND_HTML;
  offline.value = false;
  offline.listeners.clear();
});

afterEach(() => {
  disposeOfflineBanner();
  quality.disposeConnectionQuality();
  resetStatusIslandConnection();
  document.head.querySelectorAll('style').forEach((s) => s.remove());
  localStorage.clear();
  vi.useRealTimers();
});

describe('state priority', () => {
  it('offline beats a weak connection, which comes back after "back online"', () => {
    initStatusIslandConnection();
    handleIslandConnectionState('connected');
    setIslandPoorQuality(true);
    vi.advanceTimersByTime(WEAK_AFTER_MS);
    expect(pill().dataset.state).toBe('weak');

    setIslandOffline(true);
    expect(islandConnectionState()).toBe('offline');
    expect(pill().dataset.state).toBe('offline');

    setIslandOffline(false);
    expect(pill().dataset.state).toBe('back-online');
    vi.advanceTimersByTime(BACK_ONLINE_MS);
    expect(pill().dataset.state).toBe('weak');
  });

  it('offline beats reconnecting; a reconnected call says back online, then idles', () => {
    initStatusIslandConnection();
    window.dispatchEvent(new CustomEvent('ferni:connection-state', { detail: { state: 'reconnecting' } }));
    expect(pill().dataset.state).toBe('reconnecting');
    setIslandOffline(true);
    expect(pill().dataset.state).toBe('offline');
    setIslandOffline(false);
    vi.advanceTimersByTime(BACK_ONLINE_MS);
    expect(pill().dataset.state).toBe('reconnecting');

    window.dispatchEvent(new CustomEvent('ferni:connection-state', { detail: { state: 'connected' } }));
    expect(pill().dataset.state).toBe('back-online');
    vi.advanceTimersByTime(BACK_ONLINE_MS);
    expect(pill().dataset.state).toBe('idle');
  });
});

describe('weak connection debounce', () => {
  it('waits 3 s of poor quality, and a good reading in between restarts the wait', () => {
    initStatusIslandConnection();
    handleIslandConnectionState('connected');
    setIslandPoorQuality(true);
    vi.advanceTimersByTime(WEAK_AFTER_MS - 1);
    expect(pill().dataset.state).toBe('idle');

    setIslandPoorQuality(false);
    setIslandPoorQuality(true);
    vi.advanceTimersByTime(WEAK_AFTER_MS - 1);
    expect(pill().dataset.state).toBe('idle');
    vi.advanceTimersByTime(1);
    expect(pill().dataset.state).toBe('weak');

    setIslandPoorQuality(false);
    expect(pill().dataset.state).toBe('idle');
  });

  it('shows only during a call', () => {
    initStatusIslandConnection();
    setIslandPoorQuality(true);
    vi.advanceTimersByTime(WEAK_AFTER_MS);
    expect(pill().dataset.state).toBe('idle');
  });
});

describe('existing island content', () => {
  it('is hidden while offline and restored as it was afterwards', () => {
    initStatusIslandConnection();
    const transcript = document.getElementById('transcriptContainer') as HTMLElement;
    expect(getComputedStyle(transcript).display).not.toBe('none');

    setIslandOffline(true);
    expect(island().dataset.connectionState).toBe('offline');
    expect(getComputedStyle(transcript).display).toBe('none');

    setIslandOffline(false);
    vi.advanceTimersByTime(BACK_ONLINE_MS);
    expect(island().hasAttribute('data-connection-state')).toBe(false);
    expect(getComputedStyle(transcript).display).not.toBe('none');
    expect(transcript.classList.contains('visible')).toBe(true);
    expect(transcript.textContent).toBe('so I was thinking');
  });
});

describe('roles', () => {
  it('alerts only for offline; everything else is a polite status; focus never moves', () => {
    initStatusIslandConnection();
    const focused = document.activeElement;
    expect(pill().getAttribute('role')).toBe('status');

    handleIslandConnectionState('reconnecting');
    expect(pill().getAttribute('role')).toBe('status');
    setIslandOffline(true);
    expect(pill().getAttribute('role')).toBe('alert');
    setIslandOffline(false);
    vi.advanceTimersByTime(BACK_ONLINE_MS);
    expect(pill().dataset.state).toBe('reconnecting');
    expect(pill().getAttribute('role')).toBe('status');
    handleIslandConnectionState('connected');
    expect(pill().dataset.state).toBe('back-online');
    expect(pill().getAttribute('role')).toBe('status');
    vi.advanceTimersByTime(BACK_ONLINE_MS);
    setIslandPoorQuality(true);
    vi.advanceTimersByTime(WEAK_AFTER_MS);
    expect(pill().dataset.state).toBe('weak');
    expect(pill().getAttribute('role')).toBe('status');
    expect(document.activeElement).toBe(focused);
  });
});

describe('offline banner wiring', () => {
  it('flag off: keeps the legacy banner, below the safe area and on tokens', () => {
    setFlag(false);
    initOfflineBanner();
    goOffline(true);
    const banner = document.querySelector('.offline-banner');
    expect(banner?.classList.contains('visible')).toBe(true);
    expect(document.querySelector('.status-island__connection')).toBeNull();

    const css = document.getElementById('offline-banner-styles')?.textContent ?? '';
    const rule = /\.offline-banner \{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(rule).toMatch(/padding:[^;]*env\(safe-area-inset-top/);
    expect(css).not.toMatch(/#[0-9a-f]{3,6}\b/i);
    expect(css).not.toContain('--color-semantic-warning-bg');
  });

  it('flag on: offline is an island state and no banner is created', () => {
    setFlag(true);
    initOfflineBanner();
    expect(document.querySelector('.offline-banner')).toBeNull();
    goOffline(true);
    expect(pill().dataset.state).toBe('offline');
    goOffline(false);
    expect(pill().dataset.state).toBe('back-online');
  });
});

describe('connection quality wiring', () => {
  it('flag on: a poor call shows the island state and keeps the corner pill hidden', () => {
    setFlag(true);
    quality.initConnectionQuality();
    handleIslandConnectionState('connected');
    quality.setQuality('poor');
    quality.show();
    vi.advanceTimersByTime(WEAK_AFTER_MS);
    expect(pill().dataset.state).toBe('weak');
    expect(document.querySelector('.connection-quality--visible')).toBeNull();
  });

  it('flag off: keeps the corner pill and leaves the island alone', () => {
    setFlag(false);
    quality.initConnectionQuality();
    quality.setQuality('poor');
    vi.advanceTimersByTime(WEAK_AFTER_MS);
    expect(document.querySelector('.connection-quality--visible')).not.toBeNull();
    expect(document.querySelector('.status-island__connection')).toBeNull();
  });
});
