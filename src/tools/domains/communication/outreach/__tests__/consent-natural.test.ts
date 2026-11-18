/**
 * CALL_CONSENT_NATURAL: an owner's natural yes places the read-back call. Each row runs the same
 * call twice, flag off (main) and on, through the real gate (withOutreachConfirmation, its
 * listeners, the consent window and loop); only the consent judge's model call and Ferni's turn
 * classifier are stubbed. Every line here is invented; the owner is the fictional eval user.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** Every info line written through the app logger, so CONSENT_NATURAL_DECISION can be counted. */
const logged = vi.hoisted(() => [] as Array<{ fields: unknown; msg: unknown }>);
vi.mock('../../../../../utils/safe-logger.js', async (real) => {
  const mod = await real<typeof import('../../../../../utils/safe-logger.js')>();
  const getLogger: typeof mod.getLogger = () => ({
    ...mod.getLogger(),
    info: (fields: unknown, msg?: unknown) => logged.push({ fields, msg }),
  });
  return { ...mod, getLogger };
});
import { setConsentAsk, type ConsentAsk } from '../consent-judge.js';
import { setReadBackAsk } from '../consent-readback.js';
import { pendingFor } from '../outreach-confirm.js';
import {
  alwaysReadBack,
  alwaysYes,
  liveCall,
  sends,
  type LiveCall,
} from './consent-call-harness.js';

const READ_BACK = 'A call to Dad at 555-123-0002, right now. Should I go ahead?';
const natural = (on: boolean) => vi.stubEnv('CALL_CONSENT_NATURAL', on ? 'on' : 'off');

/** Stores the read-back (the tool's output reaches the model); `played`: Ferni then speaks it. */
async function readBack(args?: Record<string, unknown>, played = true): Promise<LiveCall> {
  const call = liveCall();
  await call.call('c1', args);
  if (played) {
    call.speaks();
    call.ferni(READ_BACK);
  }
  return call;
}
/** The model calls the tool again: how many calls went out. */
async function placed(call: LiveCall): Promise<number> {
  await call.call('c2');
  return sends.length;
}

beforeEach(() => {
  setReadBackAsk(alwaysReadBack);
  setConsentAsk(alwaysYes); // no test reaches the model
});
afterEach(() => {
  setConsentAsk(undefined);
  setReadBackAsk(undefined);
  vi.unstubAllEnvs();
  sends.length = 0;
  logged.length = 0;
});

describe('1. spoken, not stored: only words begun after the read-back started playing count', () => {
  /** The owner's own words while asking land after the store, before Ferni speaks. */
  async function wordsWhileAsking(on: boolean, text: string) {
    natural(on);
    const call = await readBack(undefined, false);
    call.owner(text);
    const kept = pendingFor(call.session) !== undefined;
    call.speaks();
    call.ferni(READ_BACK);
    call.owner('Yes, call him.');
    return { kept, sent: await placed(call) };
  }

  it('a no said before the read-back plays cancels on main, and is ignored with the flag on', async () => {
    expect(await wordsWhileAsking(false, 'No, his other number.')).toEqual({
      kept: false,
      sent: 0,
    });
    expect(await wordsWhileAsking(true, 'No, his other number.')).toEqual({ kept: true, sent: 1 });
  });

  it('a "later" said while asking does too', async () => {
    expect(await wordsWhileAsking(false, 'Or later is fine.')).toEqual({ kept: false, sent: 0 });
    expect(await wordsWhileAsking(true, 'Or later is fine.')).toEqual({ kept: true, sent: 1 });
  });

  it('words begun before the read-back played, landing during it, are ignored too', async () => {
    natural(true);
    const call = await readBack(undefined, false);
    call.ownerStarts(); // the owner is still finishing their request
    call.speaks(); // the read-back starts playing
    call.ownerOver('Actually, maybe tomorrow.');
    expect(pendingFor(call.session)).toBeDefined();
    call.ferni(READ_BACK);
    call.ownerStarts();
    call.owner('Yes, call him.');
    expect(await placed(call)).toBe(1);
  });

  it('a no or a bare "wait" after the read-back cancels with the flag on', async () => {
    natural(true);
    const no = await readBack();
    no.owner('No.');
    expect(pendingFor(no.session)).toBeUndefined();
    const wait = await readBack();
    wait.owner('Wait.');
    expect(pendingFor(wait.session)).toBeUndefined();
    // Main reads a bare "Wait." as a clarifying question: it stays, and Ferni asks once.
    natural(false);
    const before = await readBack();
    before.owner('Wait.');
    expect(pendingFor(before.session)).toBeDefined();
  });

  it('a crisis line said before the read-back plays still ends it with the flag on', async () => {
    natural(true);
    setConsentAsk(alwaysYes);
    const call = await readBack(undefined, false);
    call.owner('I want to kill myself.');
    call.speaks();
    call.ferni(READ_BACK);
    call.owner('Yes, call him.');
    expect(await placed(call)).toBe(0);
  });
});

describe('2. the judge decides natural answers; a hard no never places', () => {
  async function answer(on: boolean, text: string, judge: ConsentAsk = alwaysYes) {
    natural(on);
    setConsentAsk(judge);
    const call = await readBack();
    call.owner(text);
    return placed(call);
  }

  it.each(['Yeah, do that.', 'Perfect.', 'Please do it right away.'])(
    '"%s": asks once on main, placed on the judge\'s yes with the flag on',
    async (text) => {
      expect(await answer(false, text)).toBe(0);
      sends.length = 0;
      expect(await answer(true, text)).toBe(1);
    }
  );

  it("a hard no anywhere isn't placed on the judge's yes", async () => {
    expect(await answer(true, 'Yeah, no, wait.')).toBe(0);
    expect(await answer(true, 'Sure, hold on a second.')).toBe(0);
  });

  it("the judge's unclear or error stays unclear", async () => {
    const unclear: ConsentAsk = async () => '{"verdict":"unclear","reason":"off_topic"}';
    const broken: ConsentAsk = async () => {
      throw new Error('model down');
    };
    expect(await answer(true, 'Perfect.', unclear)).toBe(0);
    expect(await answer(true, 'Perfect.', broken)).toBe(0);
  });
});

describe('3. "yes, and tell him X" is a yes with a message for the call', () => {
  /** Agrees only when the prompt it is given counts a yes carrying a message as agreement. */
  const promptJudge: ConsentAsk = async (system, input) => {
    const message = /tell him/i.test(input) && /carrying a message for the person/.test(system);
    const condition = /only if/i.test(input);
    if (message && !condition) return '{"verdict":"yes","reason":"agreed"}';
    return '{"verdict":"unclear","reason":"conditional"}';
  };
  const YES_TELL = "Yes, call him and tell him I'm running late.";

  it('confirms with the flag on, and the purpose carries the message', async () => {
    natural(false);
    setConsentAsk(promptJudge);
    const off = await readBack({ contactQuery: 'my dad', purpose: 'check in' });
    off.owner(YES_TELL);
    expect(await placed(off)).toBe(0);

    natural(true);
    const on = await readBack({ contactQuery: 'my dad', purpose: 'check in' });
    on.owner(YES_TELL);
    expect(await placed(on)).toBe(1);
    expect(sends[0].purpose).toBe(`check in, and tell them "I'm running late"`);
  });

  it('the model is told to say it will pass the message on, without its words', async () => {
    natural(true);
    setConsentAsk(promptJudge);
    const call = await readBack({ contactQuery: 'my dad', purpose: 'check in' });
    call.owner(YES_TELL);
    const out = await call.call('c2');
    expect(out).toContain("tell them in a few words you'll pass it on");
    expect(out).not.toContain('running late');
    // A plain yes gets the tool's reply as it is.
    const plain = await readBack({ contactQuery: 'my dad', purpose: 'check in' });
    plain.owner('Yes, call him.');
    expect(await plain.call('c2')).not.toContain('pass it on');
  });

  it('the judge is told a message is agreement, and only a condition on calling is conditional', async () => {
    const told = new Map<boolean, string>();
    const promptWith = async (on: boolean): Promise<void> => {
      natural(on);
      setConsentAsk(async (system) => {
        told.set(on, system);
        return '{"verdict":"unclear","reason":"off_topic"}';
      });
      const call = await readBack();
      call.owner('Perfect.');
      await placed(call);
    };
    await promptWith(false);
    await promptWith(true);
    expect(told.get(false)).toContain('"call him and tell him..."');
    expect(told.get(false)).not.toContain('carrying a message');
    expect(told.get(true)).toContain('a yes carrying a message for the person');
    expect(told.get(true)).toContain("only if he's free");
    expect(told.get(true)).not.toContain('"call him and tell him..."');
  });

  it('a condition on whether to call stays unclear', async () => {
    natural(true);
    setConsentAsk(promptJudge);
    const call = await readBack({ contactQuery: 'my dad', purpose: 'check in' });
    call.owner("Yes, but only if he's free, and tell him I'm running late.");
    expect(await placed(call)).toBe(0);
  });

  it("a message for an action with no purpose to carry it isn't placed", async () => {
    natural(true);
    setConsentAsk(alwaysYes);
    const call = await readBack({ contactQuery: 'my dad' });
    call.owner(YES_TELL);
    expect(await placed(call)).toBe(0);
  });
});

describe('4. only another outbound run voids the window', () => {
  async function toolBetween(on: boolean, name: string) {
    natural(on);
    const call = await readBack();
    call.otherTool('t1', name);
    call.owner('Yes, call him.');
    return placed(call);
  }

  it('a callStatus run between the read-back and the yes voids it on main, keeps it with the flag on', async () => {
    expect(await toolBetween(false, 'callStatus')).toBe(0);
    expect(await toolBetween(true, 'callStatus')).toBe(1);
  });

  it('a text-send run voids it with the flag on', async () => {
    liveCall('sendTextMessage', 'a text'); // the text tool is gated, as at registration
    expect(await toolBetween(true, 'sendTextMessage')).toBe(0);
  });
});

describe('5. red team: with the flag on these never place', () => {
  /** The worst judge: it says yes to everything, so only the window's own rules stand between. */
  async function worstCase(text: string) {
    natural(true);
    setConsentAsk(alwaysYes);
    const call = await readBack();
    call.owner(text);
    return placed(call);
  }
  it.each([
    'Yes but not now.',
    'Yeah, actually call my mom instead.',
    'Call him later.',
    'Wait, what number is that?',
    'No, the other David.',
  ])('"%s", even on the judge\'s yes', async (text) => {
    expect(await worstCase(text)).toBe(0);
  });

  it('a "yes" said before the read-back started never places with the flag on', async () => {
    /** landed: Ferni's read-back text has reached the log (it does as his turn ends). */
    const early = async (on: boolean, landed: boolean) => {
      natural(on);
      const call = await readBack(undefined, false);
      call.owner('Yes.');
      call.speaks();
      if (landed) call.ferni(READ_BACK);
      return placed(call);
    };
    expect(await early(false, false)).toBe(1); // main: the tool called mid-read-back places it
    sends.length = 0;
    expect(await early(true, false)).toBe(0);
    expect(await early(true, true)).toBe(0);
  });

  it("a joke (#3876) isn't placed: the judge is told a joke is off topic, and its unclear stands", async () => {
    natural(true);
    let system = '';
    setConsentAsk(async (s) => {
      system = s;
      return /a joke not meant as a request/.test(s)
        ? '{"verdict":"unclear","reason":"off_topic"}'
        : '{"verdict":"yes","reason":"agreed"}';
    });
    const call = await readBack({ contactQuery: 'my dad', purpose: 'check in' });
    call.owner('Yeah sure, call him and tell him he owes me a million bucks.');
    expect(await placed(call)).toBe(0);
    expect(system).toContain('he owes me a million bucks');
  });
});

describe('6. CONSENT_NATURAL_DECISION counts every decision, in both flag states, without words', () => {
  const decisions = () =>
    logged.filter((l) => l.msg === 'CONSENT_NATURAL_DECISION').map((l) => l.fields);

  it.each([false, true])('flag on: %s', async (on) => {
    natural(on);
    const judged = await readBack();
    judged.owner('Perfect.');
    await placed(judged);
    const plain = await readBack();
    plain.owner('Yes, call him.');
    await placed(plain);
    const no = await readBack();
    no.owner('No.');
    expect(decisions()).toEqual([
      expect.objectContaining({
        natural: on,
        lexical: 'neither',
        judge: 'yes',
        outcome: on ? 'confirmed' : 'unclear',
      }),
      expect.objectContaining({ natural: on, lexical: 'yes', judge: 'yes', outcome: 'confirmed' }),
      expect.objectContaining({
        natural: on,
        lexical: 'no',
        judge: 'skipped',
        outcome: 'declined',
      }),
    ]);
    expect(JSON.stringify(decisions())).not.toMatch(/perfect|call him|"no\./i);
  });
});

describe('7. a second unclear asks once more in plain words; a third cancels', () => {
  const unclear: ConsentAsk = async () => '{"verdict":"unclear","reason":"off_topic"}';
  /** Ferni asks what the tool told him to, and the owner answers. */
  async function answers(call: LiveCall, id: string, text: string): Promise<string> {
    const out = await call.call(id);
    call.speaks();
    call.ferni(/"([^"]+)"/.exec(out)?.[1] ?? out);
    call.owner(text);
    return out;
  }

  it('cancels at the second unclear on main; asks plainly with the flag on, then a yes places', async () => {
    setConsentAsk(unclear);
    natural(false);
    const off = await readBack();
    off.owner('Perfect.');
    await answers(off, 'c2', 'Hmm, okay then.');
    expect(await off.call('c3')).toContain('Nothing was sent');
    expect(pendingFor(off.session)).toBeUndefined();

    natural(true);
    const on = await readBack();
    on.owner('Perfect.');
    await answers(on, 'c2', 'Hmm, okay then.');
    const plainly = await on.call('c3');
    expect(plainly).toContain('Should I call Dad now? Just say yes or no.');
    expect(sends.length).toBe(0);
    setConsentAsk(alwaysYes); // the owner's plain yes to the plain question
    on.speaks();
    on.ferni('Should I call Dad now? Just say yes or no.');
    on.owner('Yes.');
    expect(await on.call('c4')).toBe('Calling Dad now.');
    expect(sends.length).toBe(1);
  });

  it('a third unclear cancels with the flag on', async () => {
    setConsentAsk(unclear);
    natural(true);
    const call = await readBack();
    call.owner('Perfect.');
    await answers(call, 'c2', 'Hmm, okay then.');
    await answers(call, 'c3', 'Whatever works.');
    expect(await call.call('c4')).toContain('Nothing was sent');
    expect(sends.length).toBe(0);
  });
});
