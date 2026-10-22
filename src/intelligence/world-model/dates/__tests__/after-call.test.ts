import { describe, expect, it, vi } from 'vitest';

import {
  registeredAfterCallTasks,
  type AfterCallContext,
} from '../../../../services/session/after-call-tasks.js';
import type { ResolutionPlan } from '../../temporal/resolve.js';
import type { WorldFactStore } from '../../temporal/store.js';
import { isMemberCall } from '../../../../services/outreach/after-call-checkin.js';
import { DATES_TASK, extractDatesAfterCall } from '../after-call.js';

const ON = { DATES_THAT_MATTER: 'on' };

const ctx: AfterCallContext = {
  userId: 'u1',
  sessionId: 's1',
  // 21:00 Sunday in New York is 01:00 Monday UTC: dates resolve against Sunday.
  startedAt: new Date('2026-10-12T01:00:00Z'),
  timezone: 'America/New_York',
  turns: [
    { role: 'assistant', content: 'Hey! How was the weekend?' },
    {
      role: 'user',
      content: "Good. My mom's birthday is tomorrow and Mindy's surgery is Thursday.",
    },
  ],
};

const modelReply = JSON.stringify({
  dates: [
    { who: 'mom', what: 'birthday', kind: 'birthday', when: 'tomorrow', confidence: 0.95, quote: "my mom's birthday is tomorrow" }, // prettier-ignore
    { who: 'Mindy', what: 'surgery', kind: 'medical', when: 'Thursday', confidence: 0.9 },
  ],
});

function store(): WorldFactStore & { plans: ResolutionPlan[] } {
  const plans: ResolutionPlan[] = [];
  return { plans, listOpen: async () => [], apply: async (_u, p) => void plans.push(p) };
}

describe('the dates-that-matter after-call task', () => {
  it('is registered by the after-call registry', async () => {
    await import('../../../../agents/after-call-register.js');
    expect(registeredAfterCallTasks()).toContain(DATES_TASK);
  });

  it.each([
    ['an unrecognised caller', 'anon:5e4001b2-6005-40e8-bd29-abf9bc9ed648'],
    ['the third party on a call placed for someone', 'onbehalf:call-123'],
    ['anonymous', 'anonymous'],
  ])('keeps no dates for %s: no model call, no write', async (_label, userId) => {
    const llm = vi.fn(async (_prompt: string) => modelReply);
    const s = store();
    await extractDatesAfterCall({ ...ctx, userId }, { isMember: isMemberCall, llm, store: s, topics: async () => [], env: ON }); // prettier-ignore
    expect(llm).not.toHaveBeenCalled();
    expect(s.plans).toEqual([]);
  });

  it('does nothing with the flag off: no model call, no write', async () => {
    const llm = vi.fn(async (_prompt: string) => modelReply);
    const s = store();
    await extractDatesAfterCall(ctx, {
      isMember: isMemberCall,
      llm,
      store: s,
      topics: async () => [],
      env: {},
    });
    expect(llm).not.toHaveBeenCalled();
    expect(s.plans).toEqual([]);
  });

  it("reads the flag as the ended call had it, not as the next caller's cohort set it", async () => {
    const cohorts = (on: boolean) => ({
      cohortsFor: async () => [{ id: 'seth', enabled: true, flags: { DATES_THAT_MATTER: on ? 'on' : 'off' } }], // prettier-ignore
      overridesFor: async () => ({}),
    });
    // The next call's caller has it on in the env; this caller's cohort has it off.
    const nextOn = { COHORT_FLAGS: 'on', DATES_THAT_MATTER: 'on' };
    const llm = vi.fn(async (_prompt: string) => modelReply);
    await extractDatesAfterCall(ctx, { isMember: isMemberCall, llm, store: store(), topics: async () => [], env: nextOn, cohorts: cohorts(false) }); // prettier-ignore
    expect(llm).not.toHaveBeenCalled();
    // And the other way round: this caller's cohort has it on, the env is off.
    const s = store();
    await extractDatesAfterCall(ctx, { isMember: isMemberCall, llm, store: s, topics: async () => [], env: { COHORT_FLAGS: 'on' }, cohorts: cohorts(true) }); // prettier-ignore
    expect(llm).toHaveBeenCalledTimes(1);
    expect(s.plans).toHaveLength(1);
  });

  it("stores the call's dates resolved against the caller's own day", async () => {
    const llm = vi.fn(async (_prompt: string) => modelReply);
    const s = store();
    await extractDatesAfterCall(ctx, {
      isMember: isMemberCall,
      llm,
      store: s,
      topics: async () => [],
      env: ON,
    });
    expect(llm.mock.calls[0][0]).toContain('Sunday 2026-10-11');
    expect(s.plans[0].create.map((f) => [f.subject, f.value, f.eventDate])).toEqual([
      ['mom', 'birthday', '2026-10-12'],
      ['Mindy', 'surgery', '2026-10-15'],
    ]);
  });

  it('does not write down what the caller asked Ferni to forget', async () => {
    const s = store();
    await extractDatesAfterCall(ctx, { isMember: isMemberCall, llm: async () => modelReply, store: s, topics: async () => ['mindy surgery'], env: ON }); // prettier-ignore
    expect(s.plans[0].create.map((f) => f.subject)).toEqual(['mom']);
  });

  it('writes nothing, and makes no write call, when the forgotten topics come back unreadable (null)', async () => {
    const s = store();
    const apply = vi.spyOn(s, 'apply');
    await extractDatesAfterCall(ctx, { isMember: isMemberCall, llm: async () => modelReply, store: s, topics: async () => null, env: ON }); // prettier-ignore
    expect(apply).not.toHaveBeenCalled();
    expect(s.plans).toEqual([]);
  });

  it('writes nothing when reading the forgotten topics throws', async () => {
    const s = store();
    const topics = async (): Promise<string[]> => {
      throw new Error('down');
    };
    await expect(
      extractDatesAfterCall(ctx, {
        isMember: isMemberCall,
        llm: async () => modelReply,
        store: s,
        topics,
        env: ON,
      })
    ).rejects.toThrow('down');
    expect(s.plans).toEqual([]);
  });
});
