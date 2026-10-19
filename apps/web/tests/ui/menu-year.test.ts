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
});
