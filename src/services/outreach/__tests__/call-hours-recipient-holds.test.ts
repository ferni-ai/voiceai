/**
 * calleeCallHold asks every callee's hold, even when one of them throws: a contact whose night
 * never ends rejects the call, but the member's hours are still read (round 4 of #3615).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const callQuietHours = vi.hoisted(() => vi.fn());
vi.mock('../quiet-hours.js', async (orig) => ({
  ...(await orig<typeof import('../quiet-hours.js')>()),
  callQuietHours,
}));
vi.mock('../../messaging/policy.js', async (orig) => {
  const real = await orig<typeof import('../../messaging/policy.js')>();
  return {
    ...real,
    decide: (...[, ctx]: Parameters<typeof real.decide>) => ({
      action: 'hold',
      reason: 'quiet-hours',
      holdUntil: new Date(ctx.now.getTime() + 3_600_000), // the contact's night never ends
    }),
  };
});
vi.mock('../user-contact.js', () => ({
  getUserContactInfo: async () => ({ timezone: 'Europe/London' }),
}));

import { calleeCallHold } from '../call-hours-recipient.js';

const SAM = '+12125550142'; // fictional
const NOW = new Date('2026-11-10T17:00:00Z');

beforeEach(() => {
  vi.unstubAllEnvs();
  callQuietHours.mockReset();
  callQuietHours.mockImplementation(async (_id: string, at: Date) => ({ quiet: false, until: at }));
});

describe('calleeCallHold: one hold throws', () => {
  it.each(['off', 'on'])(
    'NIGHT_WINDOW_ALL_PATHS %s: rejects with the contact error, the member is still asked',
    async (allPaths) => {
      vi.stubEnv('NIGHT_WINDOW_ALL_PATHS', allPaths);
      // Their own number reached as a contact: the contact check first (callHoursRecipients).
      const callees = [
        { recipientPhone: SAM },
        { recipientPhone: SAM, recipientUserId: 'owner-1' },
      ];
      await expect(calleeCallHold(callees, NOW)).rejects.toThrow(
        'Contact call: no time both coasts and the callee allow'
      );
      expect(callQuietHours).toHaveBeenCalledTimes(1);
      expect(callQuietHours.mock.calls[0].slice(0, 2)).toEqual(['owner-1', NOW]);
    }
  );
});
