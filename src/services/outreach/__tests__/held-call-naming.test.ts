/**
 * With a call already held, a call to someone else names each contact, so the
 * model can't take one for the other. Owner call 2026-10-18 (paraphrased):
 * asked to call his sister, Ferni said "I already have that call scheduled for
 * nine", which was the held call to his mom.
 *
 * The real deferred-calls code over an in-memory deferred_calls collection.
 */
import { describe, expect, it, vi } from 'vitest';

const docs = vi.hoisted(() => [] as Array<{ id: string; data: () => Record<string, unknown> }>);
vi.mock('../../superhuman/firestore-utils.js', () => ({
  getFirestoreDb: () => ({
    collection: () => ({
      doc: () => ({
        collection: () => ({
          where: () => ({ get: async () => ({ docs }) }),
          doc: () => ({ set: async () => undefined }),
        }),
      }),
    }),
  }),
}));

import { alreadySetReply, pendingCallTo, placeOrHold } from '../deferred-calls.js';
import type { OnBehalfCallRequest } from '../../../tools/domains/telephony/types.js';

const NOW = new Date('2026-10-18T14:42:00Z'); // 8:42 AM in Denver
const NINE = new Date('2026-10-18T15:00:00Z');
docs.push({
  id: 'deferred_mom',
  data: () => ({
    kind: 'on_behalf',
    status: 'pending',
    scheduledFor: NINE.toISOString(),
    timezone: 'America/Denver',
    request: { contactQuery: 'my mom', resolvedContact: { name: 'Mom', phone: '+13035550100' } },
  }),
});
const sister = (phone: string) =>
  ({
    userId: 'u1',
    contactQuery: 'my sister',
    purpose: 'say hi',
    resolvedContact: { name: 'Sister', phone },
  }) as unknown as OnBehalfCallRequest;
const MOM_LATER = /the call to Mom later today at 9:00\sAM \(their time\)/;

describe('a call to someone else while one is held', () => {
  it('placed now: the reply also names the held call, by its contact', async () => {
    const place = vi.fn(async () => 'call_1');
    const { held, others } = await placeOrHold(sister('+13035550199'), place, NOW);
    expect(place).toHaveBeenCalledTimes(1);
    expect(held).toBeUndefined();
    expect(others).toMatch(/^ Separately, still set and unchanged: /);
    expect(others).toMatch(MOM_LATER);
  });

  it('held too: both calls are named', async () => {
    const { held } = await placeOrHold(sister('+13035550199'), async () => 'deferred_2', NOW);
    expect(held).toMatch(/^Nothing was dialed yet: it's not a good hour to call Sister/);
    expect(held).toMatch(MOM_LATER);
  });

  it("the held call's number asked for under another name: says whose call is set", async () => {
    const place = vi.fn(async () => 'call_1');
    const { held } = await placeOrHold(sister('303-555-0100'), place, NOW);
    expect(place).not.toHaveBeenCalled();
    expect(held).toMatch(
      /^Nothing was dialed yet: that number already has a call set, the call to Mom later today at 9:00\sAM their time, so nothing new was set up for Sister\. Check the number with the caller\.$/
    );
  });

  it('the same person again: their call is already set, as before', async () => {
    const waiting = await pendingCallTo('u1', '+13035550100', NOW);
    expect(waiting?.contactName).toBe('Mom');
    expect(alreadySetReply('Mom', waiting!, NOW)).toMatch(
      /^Nothing was dialed yet: a call to Mom is already set for later today at 9:00\sAM their time/
    );
  });
});
