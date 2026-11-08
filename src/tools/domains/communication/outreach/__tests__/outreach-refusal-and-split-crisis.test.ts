/**
 * OUTREACH_NO_ANSWERS_READBACK follow-up, through the real call gate (consent-call-harness.ts):
 * - A refusal that doesn't open with a no ("Forget it, the store is closed.") gets main's one
 *   "Just to be sure" ask with the flag on, as with it off; a second refusal cancels; it never loops.
 * - A crisis line split by speech-to-text so that only the joined turns read as crisis: with the
 *   flag on it ends the pending call at A, B and C. With it off the outcome is main's, unchanged.
 * A is right after the read-back, B after the owner's own question was answered, C after Ferni
 * asked something else. All text is fictional.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { detectCrisis } from '../../../../../services/safety/index.js';
import { setConsentAsk } from '../consent-judge.js';
import { setReadBackAsk } from '../consent-readback.js';
import { pendingFor } from '../outreach-confirm.js';
import { alwaysReadBack, fairJudge, liveCall, sends } from './consent-call-harness.js';

const READ = "I'm ready to dial Dad at the number ending 0002. Should I go ahead and call him now?";
const ASK = 'Just to be sure: call Dad now?';
// main's replies, word for word (consent-loop.ts): the one ask, the cancel on the tool's next call,
// and the closed reply once the gate has already cancelled it as the owner spoke.
const ASK_REPLY =
  `NOT SENT YET: the caller's answer wasn't a clear yes. Ask exactly this, once, and nothing ` +
  `else about it: "${ASK}" Call callOnBehalf again only after they answer.`;
const CANCEL_REPLY =
  `Nothing was sent. Tell the caller, in a few words: "Okay, I won't call Dad." Don't read it ` +
  `back or ask again unless they ask for it in their own words.`;
const CLOSED_REPLY =
  `Nothing was sent, and don't read it back again: the caller hasn't said yes to it. Tell them ` +
  `in a few words: "Okay, I won't call Dad." Only if they ask for it again, in their own words, try again.`;

type Step = ['owner' | 'ferni', string];
const PLACES: Array<[string, Step[]]> = [
  ['A, right after the read-back', []],
  [
    'B, after the talk moved on',
    [
      ['owner', 'Is it going to rain?'],
      ['ferni', 'No rain, just clouds.'],
    ],
  ],
  [
    "C, to Ferni's other question",
    [
      ['owner', 'Hmm.'],
      ['ferni', 'Are you doing anything fun this weekend?'],
    ],
  ],
];
const FLAGS = ['on', 'off'] as const;

/** Read-back, then `steps`; the model calls the tool again. Returns the call and that reply. */
async function play(steps: Step[]) {
  const call = liveCall();
  await call.call('c1');
  call.ferni(READ);
  for (const [who, text] of steps) (who === 'owner' ? call.owner : call.ferni)(text);
  return { call, reply: await call.call('c2') };
}
const owner = (turns: string[]): Step[] => turns.map((t): Step => ['owner', t]);

beforeEach(() => {
  setReadBackAsk(alwaysReadBack);
  setConsentAsk(fairJudge);
});
afterEach(() => {
  setConsentAsk(undefined);
  setReadBackAsk(undefined);
  vi.unstubAllEnvs();
  sends.length = 0;
});

describe('a refusal that does not open with a no asks once, flag on or off', () => {
  // The two from the #3612 verify, then two more.
  const OPENERS = [
    'Forget it, the store is closed.',
    'I changed my mind about the movie.',
    'Forget it, the game already started.',
    'I changed my mind, the weather is too nice.',
  ];
  const rows = FLAGS.flatMap((flag) =>
    OPENERS.flatMap((line) =>
      PLACES.map(([where, steps]): [string, string, string, Step[]] => [flag, line, where, steps])
    )
  );

  /** The opener, main's one ask, the same refusal again, and one more call of the tool. */
  async function refuseTwice(flag: string, line: string, steps: Step[]) {
    vi.stubEnv('OUTREACH_NO_ANSWERS_READBACK', flag);
    const { call, reply } = await play([...steps, ['owner', line]]);
    const waiting = pendingFor(call.session) !== undefined;
    call.ferni(ASK);
    call.owner(line);
    const second = await call.call('c3');
    const ended = pendingFor(call.session) === undefined;
    const third = await call.call('c4');
    return { reply, waiting, second, ended, third, sent: sends.length };
  }

  it.each(rows)('flag %s: %j %s asks once, then a second refusal cancels', async (f, l, _w, s) => {
    const got = await refuseTwice(f, l, s);
    expect(got.reply).toBe(ASK_REPLY);
    expect(got.waiting).toBe(true);
    expect(got.second).toBe(CANCEL_REPLY);
    expect(got.ended).toBe(true);
    // Never a loop: after the cancel the tool neither asks again nor sends.
    expect(got.third).not.toContain(ASK);
    expect(got.sent).toBe(0);
  });

  it.each(OPENERS.flatMap((line) => PLACES.map(([where, steps]) => [line, where, steps] as const)))(
    'flag on equals flag off, reply for reply: %j %s',
    async (line, _where, steps) => {
      const on = await refuseTwice('on', line, [...steps]);
      sends.length = 0;
      const off = await refuseTwice('off', line, [...steps]);
      expect(on).toEqual(off);
    }
  );
});

describe('a crisis line only the joined turns read as crisis', () => {
  const SPLITS = [
    ['I want to', 'kill', 'myself.'],
    ['I just want to', 'die.'],
    ['thinking about', 'suicide'],
  ];
  // The rows prove themselves joined-only: no single turn reads as crisis, the joined text does.
  it.each(SPLITS.map((turns) => [turns.join(' | '), turns] as const))(
    '%s is joined-only for the crisis reader',
    (_n, turns) => {
      expect(turns.map((t) => detectCrisis(t).detected)).toEqual(turns.map(() => false));
      expect(detectCrisis(turns.join(' ')).detected).toBe(true);
    }
  );

  const rows = SPLITS.flatMap((turns) =>
    PLACES.map(([where, steps]): [string, string, Step[]] => [
      turns.join(' | '),
      where,
      [...steps, ...owner(turns)],
    ])
  );
  it.each(rows)('flag on: %s %s ends it, with no ask and nothing sent', async (_t, _w, steps) => {
    vi.stubEnv('OUTREACH_NO_ANSWERS_READBACK', 'on');
    const { call, reply } = await play(steps);
    expect(pendingFor(call.session)).toBeUndefined();
    expect(reply).toBe(CLOSED_REPLY);
    expect(sends).toHaveLength(0);
  });
  // Flag off is main, unchanged: the joined read is not made, so it asks once. Nothing is sent.
  it.each(rows)('flag off: %s %s is main, unchanged: asks once', async (_t, _w, steps) => {
    vi.stubEnv('OUTREACH_NO_ANSWERS_READBACK', 'off');
    const { call, reply } = await play(steps);
    expect(pendingFor(call.session)).toBeDefined();
    expect(reply).toBe(ASK_REPLY);
    expect(sends).toHaveLength(0);
  });
});

describe('a crisis line said in one turn is unchanged', () => {
  const LINES = ['I want to kill myself.', 'I want to die.'];
  const rows = LINES.flatMap((line) =>
    PLACES.map(([where, steps]): [string, string, Step[]] => [line, where, steps])
  );
  it.each(rows)('flag on: %j %s ends it', async (line, _w, steps) => {
    vi.stubEnv('OUTREACH_NO_ANSWERS_READBACK', 'on');
    const { call, reply } = await play([...steps, ['owner', line]]);
    expect(pendingFor(call.session)).toBeUndefined();
    expect(reply).toBe(CLOSED_REPLY);
    expect(sends).toHaveLength(0);
  });
  it.each(rows)('flag off: %j %s is main, unchanged: asks once', async (line, _w, steps) => {
    vi.stubEnv('OUTREACH_NO_ANSWERS_READBACK', 'off');
    const { call, reply } = await play([...steps, ['owner', line]]);
    expect(pendingFor(call.session)).toBeDefined();
    expect(reply).toBe(ASK_REPLY);
    expect(sends).toHaveLength(0);
  });
});
