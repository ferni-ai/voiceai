/**
 * Crisis-lane flags that change which model answers a turn. The rule: a flag may change which
 * model answers non-crisis turns only; every crisis-guided, verdict-pending, risk-noted, unmarked
 * or throwing request is answered by control. The six readers and SHOWN_ON place calls on one
 * model and never see which one answered. This home is open only to a flag whose named rows
 * drive the real llmNode, gatedReply and the flag's model router, flag on, for each of those five
 * cases and assert today's model answered, plus a row where an ordinary turn reaches the other
 * model, so the rows can't pass by never routing.
 *
 * The census (crisis-all-flags-never-lower.test.ts) checks that each named file exists and
 * holds each title as an it() or test() call, as for MEMORY_ONLY. What a row asserts is a
 * reviewer's check.
 */

import type { MemoryOnlyRow } from './crisis-flag-homes.js';

export const MODEL_ROUTING_SHOWN_ON: Readonly<Record<string, readonly MemoryOnlyRow[]>> = {
  CASCADE_TRIAL_MODEL: [
    {
      file: 'src/agents/personas/__tests__/crisis-trial-lane.test.ts',
      rows: [
        'T1 a pattern-guided turn goes to today’s model',
        'T2 every later turn on that call goes to today’s model, a chat line included',
        'T3 a turn on a call with risk noted goes to today’s model',
        'T4 a read that escalates sends the guided reply to today’s model',
        'T5 a call with no session id never reaches the trial model',
        'T8 fail-closed on: an ordinary turn reaches the trial model, and its clean read lets it out',
        'T15 across 24 calls, the gate’s clearance lets an ordinary turn reach the trial model on some calls and today’s on the rest',
        'T9 fail-closed off: a turn held on its own pending verdict goes to today’s model',
        'T10 a read that fails: the held trial reply is dropped and today’s model answers',
        'T11 a read that times out: the held trial reply is dropped and today’s model answers',
        'T12 an earlier turn’s read still in flight: the next turn goes to today’s model',
        'T13 a turn the gate never read (guard off): today’s model answers',
        'T14 a crisis check that throws: today’s model answers',
      ],
    },
  ],
};
