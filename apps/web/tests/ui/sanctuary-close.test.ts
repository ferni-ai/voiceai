/**
 * Overlapping close() calls on full-screen panels
 *
 * Escape + close-button click (or a double-click on close) fire close() twice.
 * Both calls used to pass the `isOpen && container` guard before awaiting
 * animateOut(), so the second hit `this.container.remove()` after the first
 * had nulled it — a TypeError the CrashReporter logged as a crash.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../src/utils/api.js', () => ({
  apiGet: vi.fn(async () => ({ ok: false, data: null })),
  apiPost: vi.fn(async () => ({ ok: false, data: null })),
}));

vi.mock('../../src/utils/logger.js', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

import { getSanctuaryUI } from '../../src/ui/sanctuary.ui.js';
import { getYourYearWithFerni } from '../../src/ui/your-year-with-ferni.ui.js';

/** Run a panel call to completion, flushing its animation timers. */
async function settle<T>(promise: Promise<T>): Promise<T> {
  await vi.runAllTimersAsync();
  return promise;
}

describe('panel close() under concurrent calls', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // jsdom has no Web Animations API; the panels only fire-and-forget it.
    Element.prototype.animate = vi.fn() as unknown as Element['animate'];
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.replaceChildren();
  });

  it('sanctuary: two overlapping close() calls resolve and remove the overlay', async () => {
    const ui = getSanctuaryUI();
    await settle(ui.open());
    expect(document.querySelectorAll('.sanctuary-overlay')).toHaveLength(1);

    await expect(settle(Promise.all([ui.close(), ui.close()]))).resolves.toBeDefined();
    expect(document.querySelectorAll('.sanctuary-overlay')).toHaveLength(0);

    // A later open() still works after the racing closes.
    await settle(ui.open());
    expect(document.querySelectorAll('.sanctuary-overlay')).toHaveLength(1);
    await settle(ui.close());
    expect(document.querySelectorAll('.sanctuary-overlay')).toHaveLength(0);
  });

  it('your-year: two overlapping close() calls resolve and remove the overlay', async () => {
    const ui = getYourYearWithFerni();
    await settle(ui.open('user-1'));
    expect(document.querySelectorAll('.your-year-overlay')).toHaveLength(1);

    await expect(settle(Promise.all([ui.close(), ui.close()]))).resolves.toBeDefined();
    expect(document.querySelectorAll('.your-year-overlay')).toHaveLength(0);

    await settle(ui.open('user-1'));
    expect(document.querySelectorAll('.your-year-overlay')).toHaveLength(1);
    await settle(ui.close());
    expect(document.querySelectorAll('.your-year-overlay')).toHaveLength(0);
  });
});
