/**
 * Moments pill (overlay-host flag off, the path prod uses): time on screen
 * under Reduce Motion, live-region roles, duplicate messages and wrapping.
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('@/services/haptics.service.js', () => ({
  getHapticsService: () => ({ play: vi.fn() }),
}));

import { MOMENT_DURATIONS } from '@/ui/moments/constants.js';
import { getMomentsManager, resetMomentsManager } from '@/ui/moments/manager.js';

const REDUCE = '(prefers-reduced-motion: reduce)';
const LIVE = '[role="status"], [role="alert"], [aria-live]';

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

const pillTexts = (): string[] =>
  [...document.querySelectorAll('.moment-whisper, .moment-notice')].map(
    (el) => el.textContent?.trim() ?? ''
  );

// The old per-surface toasts: the kill-switch path of src/ui/overlay/toast-flag.ts.
beforeEach(() => vi.stubEnv('VITE_TOAST_REGION', 'off'));
afterEach(() => vi.unstubAllEnvs());

describe('Moments pill', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = '';
    localStorage.clear();
    resetMomentsManager();
    mediaMatches();
  });

  afterEach(() => {
    resetMomentsManager();
    vi.useRealTimers();
  });

  describe('under Reduce Motion', () => {
    beforeEach(() => mediaMatches(REDUCE));

    it('keeps a whisper on screen for its full time', () => {
      getMomentsManager().whisper('Saved', { type: 'success' });
      vi.advanceTimersByTime(MOMENT_DURATIONS.whisper.default - 100);
      expect(pillTexts()).toEqual(['Saved']);

      vi.advanceTimersByTime(1000);
      expect(pillTexts()).toEqual([]);
    });

    it('keeps a notice on screen for its full time', () => {
      getMomentsManager().notice('Your reminder is set', { type: 'info' });
      vi.advanceTimersByTime(MOMENT_DURATIONS.notice.default - 100);
      expect(pillTexts()).toEqual(['Your reminder is set']);
    });
  });

  describe('live regions', () => {
    it('puts info and success in one polite region, and nests no live region in another', () => {
      getMomentsManager().whisper('Saved', { type: 'success' });
      const pill = document.querySelector('.moment-whisper');

      expect(pill?.hasAttribute('role')).toBe(false);
      expect(pill?.closest(LIVE)?.getAttribute('role')).toBe('status');
      const nested = [...document.querySelectorAll(LIVE)].filter((el) =>
        el.parentElement?.closest(LIVE)
      );
      expect(nested).toEqual([]);
    });

    it('announces errors through role=alert, outside the polite region', () => {
      getMomentsManager().whisper('Could not save', { type: 'error' });
      const region = document.querySelector('.moment-whisper')?.closest(LIVE);

      expect(region?.getAttribute('role')).toBe('alert');
      expect(region?.parentElement?.closest(LIVE)).toBeNull();
    });
  });

  describe('duplicates', () => {
    it('drops the same message while it is showing', () => {
      const manager = getMomentsManager();
      const first = manager.whisper('Saved');
      const second = manager.whisper('Saved');

      expect(second).toBe(first);
      vi.advanceTimersByTime(10_000);
      expect(pillTexts()).toEqual([]);
    });

    it('drops the same message while it is queued', () => {
      const manager = getMomentsManager();
      manager.whisper('Saved');
      manager.whisper('Copied');
      manager.whisper('Copied');

      vi.advanceTimersByTime(MOMENT_DURATIONS.whisper.default + 300);
      expect(pillTexts()).toEqual(['Copied']);
      vi.advanceTimersByTime(MOMENT_DURATIONS.whisper.default + 300);
      expect(pillTexts()).toEqual([]);
    });

    it('keeps messages whose text differs', () => {
      const manager = getMomentsManager();
      const a = manager.notice('for checking in', { type: 'seeds', amount: 5 });
      const b = manager.notice('for checking in', { type: 'seeds', amount: 10 });
      expect(b).not.toBe(a);
    });

    it('shows the same message again once the first is leaving', () => {
      const manager = getMomentsManager();
      const first = manager.whisper('Saved');
      manager.dismiss(first);
      expect(manager.whisper('Saved')).not.toBe(first);
    });
  });

  it('wraps a long whisper to two lines instead of cutting it to one', () => {
    getMomentsManager().whisper('Your morning check-in is moved to eight thirty tomorrow');
    const css = document.getElementById('ferni-moments-styles')?.textContent ?? '';
    const rule = (selector: string): string =>
      css.match(new RegExp(`\\n${selector.replace('.', '\\.')} \\{([^}]*)\\}`))?.[1] ?? '';

    expect(document.querySelector('.moment-whisper .moment-whisper__text')).not.toBeNull();
    expect(rule('.moment-whisper__text')).toContain('-webkit-line-clamp: 2');
    expect(rule('.moment-whisper')).toContain('max-width');
    expect(rule('.moment-whisper')).not.toContain('nowrap');
  });
});
