/**
 * Toast region (overlay host, PR b)
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('@/services/haptics.service.js', () => ({
  getHapticsService: () => ({ play: vi.fn() }),
}));

vi.mock('@/utils/tracked-timeout.js', () => ({
  createTimeoutTracker: () => ({
    trackedTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms),
    clearAll: vi.fn(),
  }),
}));

import { getMomentsManager, resetMomentsManager } from '@/ui/moments/manager.js';
import { OVERLAY_HOST_STORAGE_KEY, isOverlayHostEnabled } from '@/ui/overlay/overlay-flag.js';
import {
  dismissToast,
  maxVisibleToasts,
  resetToastRegion,
  showToast,
  toastDuration,
  visibleToastIds,
} from '@/ui/overlay/toast-region.js';

/** Make matchMedia answer `matches` for the given queries only. */
function mediaMatches(...queries: string[]): void {
  window.matchMedia = ((query: string) => ({
    matches: queries.includes(query),
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

const PHONE = '(max-width: 768px)';
const REDUCE = '(prefers-reduced-motion: reduce)';

describe('toastDuration', () => {
  it('scales with text length between 3 s and 8 s', () => {
    expect(toastDuration({ message: 'Saved' })).toBe(3000);
    expect(toastDuration({ message: 'x'.repeat(60) })).toBe(1500 + 60 * 60);
    expect(toastDuration({ message: 'x'.repeat(400) })).toBe(8000);
  });

  it('gives errors and toasts with an action at least 6 s', () => {
    expect(toastDuration({ message: 'Nope', tone: 'error' })).toBe(6000);
    expect(toastDuration({ message: 'Hi', action: { label: 'View', callback: () => undefined } })).toBe(6000);
  });

  it('lets callers extend the time but never shorten it', () => {
    expect(toastDuration({ message: 'Saved', duration: 20_000 })).toBe(20_000);
    expect(toastDuration({ message: 'Saved', duration: 100 })).toBe(3000);
  });
});

describe('toast region', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = '';
    resetToastRegion();
    mediaMatches();
  });

  afterEach(() => {
    resetToastRegion();
    vi.useRealTimers();
  });

  it('renders in one top-layer popover region with a neutral, toned toast', () => {
    const shown = vi.fn();
    HTMLElement.prototype.showPopover = shown;
    showToast({ message: "Couldn't reach Ferni. Try again?", tone: 'error' });

    const region = document.querySelectorAll('.ferni-toast-region');
    expect(region).toHaveLength(1);
    expect(region[0]?.getAttribute('popover')).toBe('manual');
    expect(shown).toHaveBeenCalled();
    const toast = document.querySelector('.ferni-toast');
    expect(toast?.classList.contains('ferni-toast--error')).toBe(true);
    expect(toast?.textContent).toContain("Couldn't reach Ferni");
    delete (HTMLElement.prototype as Partial<HTMLElement>).showPopover;
  });

  it('shows 1 toast on a phone and queues the rest', () => {
    mediaMatches(PHONE);
    expect(maxVisibleToasts()).toBe(1);
    const first = showToast({ message: 'One' });
    const second = showToast({ message: 'Two' });
    expect(visibleToastIds()).toEqual([first]);

    dismissToast(first);
    expect(visibleToastIds()).toEqual([second]);
  });

  it('shows 2 toasts on desktop and queues the third', () => {
    expect(maxVisibleToasts()).toBe(2);
    const ids = ['One', 'Two', 'Three'].map((message) => showToast({ message }));
    expect(visibleToastIds()).toEqual(ids.slice(0, 2));
  });

  it('puts a queued error ahead of queued info', () => {
    mediaMatches(PHONE);
    showToast({ message: 'Visible' });
    showToast({ message: 'Queued info' });
    const error = showToast({ message: 'Queued error', tone: 'error' });
    dismissToast(visibleToastIds()[0] ?? '');
    expect(visibleToastIds()).toEqual([error]);
  });

  it('merges an identical message instead of stacking it', () => {
    const a = showToast({ message: 'Saved' });
    const b = showToast({ message: 'Saved' });
    expect(b).toBe(a);
    expect(document.querySelectorAll('.ferni-toast')).toHaveLength(1);
  });

  it('dismisses on its own after the reading time', () => {
    const id = showToast({ message: 'Saved' });
    vi.advanceTimersByTime(2999);
    expect(visibleToastIds()).toEqual([id]);
    vi.advanceTimersByTime(1);
    expect(visibleToastIds()).toEqual([]);
  });

  it('pauses while the pointer is over the region', () => {
    const id = showToast({ message: 'Saved' });
    document.querySelector('.ferni-toast-region')?.dispatchEvent(new Event('pointerenter'));
    vi.advanceTimersByTime(10_000);
    expect(visibleToastIds()).toEqual([id]);
    document.querySelector('.ferni-toast-region')?.dispatchEvent(new Event('pointerleave'));
    vi.advanceTimersByTime(3000);
    expect(visibleToastIds()).toEqual([]);
  });
});

describe('Moments routing behind the overlay-host flag', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = '';
    localStorage.clear();
    resetToastRegion();
    resetMomentsManager();
    mediaMatches();
  });

  afterEach(() => {
    localStorage.clear();
    resetMomentsManager();
    resetToastRegion();
    vi.useRealTimers();
  });

  it('is off by default', () => {
    expect(isOverlayHostEnabled()).toBe(false);
  });

  it('keeps the Moments pill when the flag is off', () => {
    getMomentsManager().whisper('Saved', { type: 'success' });
    expect(document.querySelector('.moment-whisper')).not.toBeNull();
    expect(document.querySelector('.ferni-toast')).toBeNull();
  });

  it('renders whispers and notices in the toast region when the flag is on', () => {
    localStorage.setItem(OVERLAY_HOST_STORAGE_KEY, 'true');
    const manager = getMomentsManager();
    manager.whisper('Saved', { type: 'success' });
    manager.notice('a little something', { type: 'seeds', amount: 5 });

    expect(document.querySelector('.moment-whisper')).toBeNull();
    const toasts = [...document.querySelectorAll('.ferni-toast')].map((t) => t.textContent);
    expect(toasts).toEqual(['Saved', '+5 a little something']);
  });

  it('keeps a toast on screen for its full time under Reduce Motion', () => {
    // The region never shortens display time under Reduce Motion (Moments used to cut it to 100 ms).
    mediaMatches(REDUCE);
    localStorage.setItem(OVERLAY_HOST_STORAGE_KEY, 'true');
    getMomentsManager().whisper('Saved', { type: 'success' });
    vi.advanceTimersByTime(2900);
    expect(document.querySelector('.ferni-toast')).not.toBeNull();
  });

  it('dismisses region toasts through moments.dismiss and dismissAll', () => {
    localStorage.setItem(OVERLAY_HOST_STORAGE_KEY, 'true');
    const manager = getMomentsManager();
    const id = manager.whisper('One');
    manager.dismiss(id);
    expect(visibleToastIds()).toEqual([]);
    manager.whisper('Two');
    manager.dismissAll();
    expect(visibleToastIds()).toEqual([]);
  });
});
