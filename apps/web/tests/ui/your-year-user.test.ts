/**
 * "Your Year with Ferni" asks the server for the signed-in user.
 *
 * It used to read `ferni_user_id` and fall back to the literal 'anonymous'.
 * The server only answers for the authenticated user, so a stale or missing
 * local id meant a 403 and an empty panel for someone who had a year to see.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { apiGet, getUserId } = vi.hoisted(() => ({
  apiGet: vi.fn(async () => ({ ok: false, data: null })),
  getUserId: vi.fn<() => string | null>(() => null),
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

describe('Your Year with Ferni: which user it loads', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    Element.prototype.animate = vi.fn() as unknown as Element['animate'];
    apiGet.mockClear();
    localStorage.setItem('ferni_user_id', 'stale-device-id');
  });

  afterEach(async () => {
    await settle(closeYourYearWithFerni());
    vi.useRealTimers();
    localStorage.clear();
    document.body.replaceChildren();
  });

  it('requests the signed-in user, not the locally stored id', async () => {
    getUserId.mockReturnValue('firebase-uid-123');

    await settle(openYourYearWithFerni());

    expect(apiGet).toHaveBeenCalledTimes(1);
    expect(apiGet).toHaveBeenCalledWith('/api/year-in-review/firebase-uid-123');
  });

  it('makes no request when nobody is signed in and shows the empty state', async () => {
    getUserId.mockReturnValue(null);

    await settle(openYourYearWithFerni());

    expect(apiGet).not.toHaveBeenCalled();
    expect(document.querySelector('.your-year-modal--empty')).not.toBeNull();
  });

  it('app.ts lets the panel resolve the user instead of passing a fallback id', () => {
    const appSource = readFileSync(resolve(__dirname, '../../src/app.ts'), 'utf8');
    const calls = appSource.match(/openYourYearWithFerni\([^)]*\)/g) ?? [];

    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) expect(call).toBe('openYourYearWithFerni()');
  });
});
