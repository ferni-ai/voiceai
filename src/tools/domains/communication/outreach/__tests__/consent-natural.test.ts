/**
 * CALL_CONSENT_NATURAL: an owner's natural yes places the read-back call. Each row runs the same
 * call twice, flag off (main) and on, through the real gate (withOutreachConfirmation, its
 * listeners, the consent window and loop); only the consent judge's model call and Ferni's turn
 * classifier are stubbed. Every line here is invented; the owner is the fictional eval user.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
