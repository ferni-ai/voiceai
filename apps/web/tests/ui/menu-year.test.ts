/**
 * "This Year Together": a failed load says so. The panel used to turn any
 * failed request into the "your year is just beginning" empty state, so a
 * server error looked like a year with no conversations.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { apiGet, getUserId } = vi.hoisted(() => ({
  apiGet: vi.fn(),
  getUserId: vi.fn<() => string | null>(() => 'firebase-uid-123'),
}));

vi.mock('../../src/utils/api.js', () => ({ apiGet, getUserId }));
vi.mock('../../src/utils/logger.js', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

import {
  closeYourYearWithFerni,
  openYourYearWithFerni,
} from '../../src/ui/your-year-with-ferni.ui.js';

async function settle<T>(promise: Promise<T>): Promise<T> {
  await vi.runAllTimersAsync();
  return promise;
}

describe('This Year Together: load states', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    Element.prototype.animate = vi.fn() as unknown as Element['animate'];
    apiGet.mockReset();
  });

  afterEach(async () => {
    await settle(closeYourYearWithFerni());
    vi.useRealTimers();
    document.body.replaceChildren();
  });

  it('a server error shows the error state, never the empty state', async () => {
    apiGet.mockResolvedValueOnce({ ok: false, status: 500, error: 'boom' });

    await settle(openYourYearWithFerni());

    expect(document.querySelector('.your-year-error')).not.toBeNull();
    expect(document.querySelector('.ferni-empty-state')).toBeNull();
  });

  it('a network failure shows the error state too', async () => {
    apiGet.mockRejectedValueOnce(new Error('offline'));

    await settle(openYourYearWithFerni());

    expect(document.querySelector('.your-year-error')).not.toBeNull();
    expect(document.querySelector('.ferni-empty-state')).toBeNull();
  });

  it('a year with no conversations is still the empty state', async () => {
    apiGet.mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: { startDate: new Date().toISOString(), stats: { totalConversations: 0 } },
    });

    await settle(openYourYearWithFerni());

    expect(document.querySelector('.ferni-empty-state')).not.toBeNull();
    expect(document.querySelector('.your-year-error')).toBeNull();
  });

  // 2026-10-18 UI audit: both states were blank. The box holding them was styled
  // opacity: 0 / scale(0.9) for an entrance animation that only ever ran on the modal.
  it('the empty and error box is not left hidden by an animation that never runs', async () => {
    apiGet.mockResolvedValueOnce({ ok: true, status: 200, data: { stats: { totalConversations: 0 } } });
    await settle(openYourYearWithFerni());
    const css = [...document.querySelectorAll('style')].map((el) => el.textContent ?? '').join('\n');
    const rule = css.match(/\.your-year-modal--empty \.your-year-content\s*\{([^}]*)\}/)?.[1] ?? '';
    expect(rule).toContain('background');
    expect(rule).not.toMatch(/opacity:\s*0/);
    expect(rule).not.toMatch(/scale\(/);
  });

  it('the error state is warm and offers Try again, which loads the year again', async () => {
    apiGet.mockResolvedValueOnce({ ok: false, status: 500, error: 'boom' });
    await settle(openYourYearWithFerni());
    const error = document.querySelector<HTMLElement>('.your-year-error');
    expect(error?.getAttribute('role')).toBe('alert');
    expect(error?.querySelector('.your-year-error__title')?.textContent).toBeTruthy();
    expect(error?.querySelector('.your-year-error__body')?.textContent).toBeTruthy();
    const retry = error?.querySelector<HTMLButtonElement>('.your-year-error__retry');
    expect(retry?.textContent).toBeTruthy();

    apiGet.mockResolvedValueOnce({ ok: true, status: 200, data: { stats: { totalConversations: 0 } } });
    retry?.click();
    await settle(Promise.resolve());
    expect(apiGet).toHaveBeenCalledTimes(2);
    expect(document.querySelector('.your-year-error')).toBeNull();
    expect(document.querySelector('.ferni-empty-state')).not.toBeNull();
    expect(document.querySelectorAll('.your-year-overlay')).toHaveLength(1);
  });
});
