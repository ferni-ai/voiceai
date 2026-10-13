/**
 * A friend's referral code is kept from first load, before the sign-in gate and
 * the waitlist check, and keeping it can never stop the app loading.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/utils/api.js', () => ({ apiGet: vi.fn(), apiPost: vi.fn() }));
vi.mock('../../src/services/cosmetics.service.js', () => ({ addSeeds: vi.fn() }));

const { checkReferralFromUrl } = await import('../../src/services/referral.service.js');
const { getPendingReferral, rememberReferral } =
  await import('../../src/services/referral-pending.js');

beforeEach(() => {
  localStorage.clear();
  window.history.replaceState({}, '', '/');
});
afterEach(() => vi.restoreAllMocks());

describe('referral code capture', () => {
  it('app.ts keeps the code before the sign-in gate and the waitlist check', () => {
    const app = readFileSync(join(__dirname, '..', '..', 'src', 'app.ts'), 'utf8');
    const capture = app.indexOf('checkReferralFromUrl();');
    const gate = app.indexOf('await initializeAuth();');

    expect(capture).toBeGreaterThan(-1);
    expect(gate).toBeGreaterThan(-1);
    expect(capture).toBeLessThan(gate);
  });

  it('keeps a /grow/ code and tidies the URL', () => {
    window.history.replaceState({}, '', '/grow/k3j9x2-meadow');

    expect(checkReferralFromUrl()).toBe('k3j9x2-meadow');
    expect(getPendingReferral()).toBe('k3j9x2-meadow');
    expect(window.location.pathname).toBe('/');
  });

  it('blocked storage does not stop the first load', () => {
    const blocked = () => {
      throw new DOMException('blocked', 'SecurityError');
    };
    window.history.replaceState({}, '', '/?ref=k3j9x2-meadow');
    // The shared setup's localStorage is a plain object of mocks: swap them, then put them back
    const { getItem, setItem } = localStorage;
    const tried = vi.fn(blocked);
    Object.assign(localStorage, { getItem: blocked, setItem: tried });
    try {
      expect(checkReferralFromUrl()).toBe('k3j9x2-meadow');
      expect(tried).toHaveBeenCalled(); // it tried, and survived the throw
    } finally {
      Object.assign(localStorage, { getItem, setItem });
    }
  });

  it('a URL that cannot be tidied does not stop the first load', () => {
    window.history.replaceState({}, '', '/grow/k3j9x2-meadow');
    vi.spyOn(window.history, 'replaceState').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });

    expect(checkReferralFromUrl()).toBe('k3j9x2-meadow');
    expect(getPendingReferral()).toBe('k3j9x2-meadow');
  });

  it('only a code in the server shape is kept, and the first one wins', () => {
    expect(rememberReferral('<script>')).toBe(false);
    expect(rememberReferral('k3j9x2-meadow')).toBe(true);
    expect(rememberReferral('aaaaaa-oak')).toBe(false);
    expect(getPendingReferral()).toBe('k3j9x2-meadow');
  });
});
