/**
 * #2695 (a): after a reopen with the classifier on, a goodbye pair whose turn
 * got no crisis read holds the end (goodbye-read.ts), and the reopen check-in
 * is skipped while the goodbyes stand: the caller heard 120 s of silence.
 * HELD_GOODBYE_CHECK_IN=on: one gentle check-in after HELD_GOODBYE_CHECK_IN_MS
 * of quiet; the call still ends only by the reopen idle; a call with crisis
 * risk keeps its silence, as before.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

/** The cue of every line the director wrote, and what Ferni then said. */
const director = vi.hoisted(() => ({
  cues: [] as Array<{ moment: string; rejectIf?: (line: string) => boolean }>,
  said: [] as string[],
  gate: Promise.resolve(),
}));
vi.mock('../../../speech/direction/index.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../speech/direction/index.js')>()),
  directedText: async (_id: string, cue: { moment: string }) => {
    director.cues.push(cue);
    await director.gate;
    return { text: cue.moment, source: 'actor', ms: 0 };
  },
}));
vi.mock('../../../speech/coordination/session-integration.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../speech/coordination/session-integration.js')>()),
  coordinatedSay: (_id: string, text: string) => void director.said.push(text),
}));

import { IDLE_AFTER_GOODBYE_MS } from '../call-farewell.js';
import {
  HELD_GOODBYE_CHECK_IN_MS,
  REOPEN_CHECK_IN_MS,
  REOPEN_IDLE_END_MS,
} from '../reopen-idle.js';
import { crisisRiskThisCall } from '../../../services/safety/crisis-call-risk.js';
import {
  call,
  ends,
  ferniSays,
  flush,
  read,
  resetReopenedCalls,
  type Call,
} from './reopened-call-harness.js';

afterEach(() => {
  resetReopenedCalls();
  director.cues.splice(0);
  director.said.splice(0);
  director.gate = Promise.resolve();
});

const ON = { CALL_WRAP_UP: 'on', PHONE_GOODBYE: 'on', HELD_GOODBYE_CHECK_IN: 'on' };
const OFF = { CALL_WRAP_UP: 'on', PHONE_GOODBYE: 'on' };

/**
 * #2605's P1 split: "goodbye cruel world." reopens (the word check misses
 * it), "I gotta go" follows as its own turn with no read, Ferni says "take
 * care". Both goodbyes stand; only the missing read holds the end.
 */
async function heldGoodbye(c: Call) {
  await c.toEnd();
  await c.advance(1_000);
  c.finalWords('goodbye cruel world.');
  await c.advance(300);
  c.say('user', 'goodbye cruel world.');
  expect(c.reopens()).toHaveLength(1);
  await c.advance(2_000);
  c.finalWords('I gotta go');
  await c.advance(300);
  c.say('user', 'I gotta go');
  await ferniSays(c, 'Okay, take care of yourself.');
  await c.advance(IDLE_AFTER_GOODBYE_MS);
  expect(ends(c)).toHaveLength(1); // GOODBYE_END_HELD: no read of the goodbye
}

describe('a held goodbye after a reopen (#2695)', () => {
  it('flag off (before): 120 s of silence, then the idle end', async () => {
    const c = await call({ env: OFF });
    await heldGoodbye(c);
    await c.advance(REOPEN_IDLE_END_MS - IDLE_AFTER_GOODBYE_MS - 1);
    expect(director.cues).toEqual([]);
    expect(director.said).toEqual([]);
    expect(ends(c)).toHaveLength(1);
    await c.advance(1);
    expect(ends(c)).toHaveLength(2);
  });

  it('flag on: one gentle check-in at 20 s, and the call still ends only by the 120 s idle', async () => {
    const c = await call({ env: ON });
    await heldGoodbye(c);
    await c.advance(HELD_GOODBYE_CHECK_IN_MS - IDLE_AFTER_GOODBYE_MS - 1);
    expect(director.said).toEqual([]);
    await c.advance(1);
    expect(director.said).toEqual(['held_goodbye_checkin']);
    // never a goodbye, which would pair with the caller's
    expect(director.cues[0].rejectIf?.('Okay, bye for now')).toBe(true);
    expect(director.cues[0].rejectIf?.('Still there? No rush.')).toBe(false);
    await ferniSays(c, 'Still there? No rush.'); // his check-in starts nothing over
    await c.advance(REOPEN_IDLE_END_MS - HELD_GOODBYE_CHECK_IN_MS - 1);
    expect(ends(c)).toHaveLength(1);
    expect(director.said).toEqual(['held_goodbye_checkin']); // not the 60 s one too
    await c.advance(1);
    expect(ends(c)).toHaveLength(2);
    expect(director.said).toEqual(['held_goodbye_checkin']);
  });

  it.each([
    ['off', OFF],
    ['on', ON],
  ])('flag %s, crisis risk on the call: no check-in and no end, as before', async (_, env) => {
    const c = await call({ env });
    await c.toEnd();
    await c.advance(1_000);
    c.finalWords("I won't be here tomorrow. bye");
    await c.advance(300);
    c.say('user', "I won't be here tomorrow. bye");
    expect(crisisRiskThisCall(c.id)).toBe(true);
    await ferniSays(c, "I'm right here with you. Can we keep talking?");
    c.say('user', 'okay, bye');
    await ferniSays(c, 'Okay. Bye, take care.');
    await c.advance(REOPEN_IDLE_END_MS * 2);
    expect(director.cues).toEqual([]);
    expect(director.said).toEqual([]);
    expect(ends(c)).toHaveLength(1);
    expect(c.appConnected).toBe(true);
  });

  it('flag on, a crisis read in flight: no check-in', async () => {
    const c = await call({ env: ON });
    await heldGoodbye(c);
    read(c.id, 'something else'); // never settled
    await c.advance(REOPEN_IDLE_END_MS);
    expect(director.said).toEqual([]);
  });

  it.each([
    ['none', ['held_goodbye_checkin']],
    ['imminent', []],
  ])(
    'flag on: re-checks the call before speaking (a read found %s meanwhile)',
    async (risk, said) => {
      const c = await call({ env: ON });
      await heldGoodbye(c);
      let write: () => void = () => {};
      director.gate = new Promise<void>((r) => {
        write = r;
      });
      await c.advance(HELD_GOODBYE_CHECK_IN_MS - IDLE_AFTER_GOODBYE_MS);
      expect(director.cues.map((cue) => cue.moment)).toEqual(['held_goodbye_checkin']);
      await read(c.id, 'I gotta go')(risk); // settled while the line was written
      write();
      await flush();
      expect(director.said).toEqual(said);
    }
  );

  it('flag on, a reopen with no goodbye: only the 60 s check-in, as before', async () => {
    const c = await call({ env: ON });
    await c.toEnd();
    await c.advance(1_000);
    c.finalWords('oh wait, one more thing');
    await c.advance(300);
    c.say('user', 'oh wait, one more thing');
    await ferniSays(c, 'Sure, what is it?');
    await c.advance(REOPEN_CHECK_IN_MS - 1);
    expect(director.said).toEqual([]);
    await c.advance(1);
    expect(director.said).toEqual(['reopen_checkin']);
  });
});
