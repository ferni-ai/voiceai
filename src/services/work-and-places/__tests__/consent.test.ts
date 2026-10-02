/**
 * Work and places have no consent switch: the sensitive-memory consent
 * service (default off for health/finances/beliefs) must never block them.
 */

import { describe, expect, it, vi } from 'vitest';

const isCategoryEnabled = vi.fn(async () => false);
vi.mock('../../memory-consent/index.js', async (orig) => ({
  ...(await orig<typeof import('../../memory-consent/index.js')>()),
  isCategoryEnabled,
}));

const { isAreaEnabled, setConsentCheckForTests } = await import('../consent.js');

describe('work & places consent gate', () => {
  it('allows work and places even when every sensitive category is off', async () => {
    setConsentCheckForTests(undefined);
    expect(await isAreaEnabled('u1', 'work')).toBe(true);
    expect(await isAreaEnabled('u1', 'places')).toBe(true);
    expect(isCategoryEnabled).not.toHaveBeenCalled();
  });
});
