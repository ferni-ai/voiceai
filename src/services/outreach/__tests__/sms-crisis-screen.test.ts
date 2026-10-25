/**
 * SMS_CRISIS_SCREEN (sms-crisis-screen.ts): a text that reads as a crisis gets
 * 988. The pattern guard and the classifier are the real ones; only the
 * classifier's model call is faked (it returns the JSON the model would).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CrisisGenerateFn } from '../../safety/crisis-classifier.js';
import { detectCrisis } from '../../safety/crisis-guard.js';
import {
  readSmsCrisis,
  SMS_CRISIS_REPLY,
  SMS_MAX_CHARS,
  smsCrisisReply,
  smsReplyTwiml,
  type SmsCrisisRead,
} from '../sms-crisis-screen.js';

const says = (risk: string): CrisisGenerateFn => vi.fn(async () => `{"risk":"${risk}"}`);
const silent: CrisisGenerateFn = vi.fn(async () => {
  throw new Error('model down');
});
const read = (crisis: boolean): (() => Promise<SmsCrisisRead>) =>
  vi.fn(async () => ({ crisis, pattern: crisis, risk: null }));

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('readSmsCrisis: either read is enough, none is lowered', () => {
  it('a pattern hit stays a crisis when the classifier says none', async () => {
    const r = await readSmsCrisis('I want to kill myself', says('none'));
    expect(r).toMatchObject({ crisis: true, pattern: true, risk: 'none' });
  });

  it('a classifier crisis or imminent read counts when no pattern matched', async () => {
    const text = 'the cabinet is open and I have counted them out';
    expect(detectCrisis(text).isCrisis).toBe(false); // so the classifier alone decides below
    expect((await readSmsCrisis(text, says('imminent'))).crisis).toBe(true);
    expect((await readSmsCrisis(text, says('crisis'))).crisis).toBe(true);
  });

  it('nothing from either read: not a crisis', async () => {
    const r = await readSmsCrisis('running late, see you at 6', says('none'));
    expect(r).toEqual({ crisis: false, pattern: false, risk: 'none' });
  });

  it('the classifier failing leaves the pattern read in charge', async () => {
    expect(await readSmsCrisis('I want to kill myself', silent)).toMatchObject({
      crisis: true,
      risk: null,
    });
    expect((await readSmsCrisis('see you at 6', silent)).crisis).toBe(false);
  });
});

describe('smsCrisisReply: the flag', () => {
  it('off (the default): no read, no reply', async () => {
    const r = read(true);
    expect(await smsCrisisReply('I want to kill myself', r)).toBeNull();
    expect(r).not.toHaveBeenCalled();
  });

  it('shadow: reads, never changes the reply', async () => {
    vi.stubEnv('SMS_CRISIS_SCREEN', 'shadow');
    const r = read(true);
    expect(await smsCrisisReply('I want to kill myself', r)).toBeNull();
    expect(r).toHaveBeenCalledTimes(1);
  });

  it('on: a crisis read gets the 988 reply; anything else gets null', async () => {
    vi.stubEnv('SMS_CRISIS_SCREEN', 'on');
    expect(await smsCrisisReply('x', read(true))).toBe(SMS_CRISIS_REPLY);
    expect(await smsCrisisReply('x', read(false))).toBeNull();
    expect(await smsCrisisReply('   ', read(true))).toBeNull();
  });

  it('on: a read that throws falls back to the pattern guard, never to silence', async () => {
    vi.stubEnv('SMS_CRISIS_SCREEN', 'on');
    const boom = vi.fn(async (): Promise<SmsCrisisRead> => {
      throw new Error('boom');
    });
    expect(await smsCrisisReply('I want to kill myself', boom)).toBe(SMS_CRISIS_REPLY);
    expect(await smsCrisisReply('see you at 6', boom)).toBeNull();
  });
});

describe('smsCrisisReply: input size', () => {
  it('reads at most SMS_MAX_CHARS of a body (a forged or oversized one costs no more)', async () => {
    vi.stubEnv('SMS_CRISIS_SCREEN', 'on');
    const r = vi.fn(async (_text: string): Promise<SmsCrisisRead> => ({
      crisis: false,
      pattern: false,
      risk: null,
    }));
    await smsCrisisReply('a'.repeat(SMS_MAX_CHARS * 10), r);
    expect(r.mock.calls[0]?.[0]).toHaveLength(SMS_MAX_CHARS);
  });
});

describe('the reply', () => {
  it('gives 988, 741741 and 911, and is escaped into one TwiML message', () => {
    for (const line of ['988', '741741', '911']) expect(SMS_CRISIS_REPLY).toContain(line);
    const twiml = smsReplyTwiml(SMS_CRISIS_REPLY);
    expect(twiml).toContain('<Message>I&apos;m really glad you told me');
    expect(twiml.match(/<Message>/g)).toHaveLength(1);
  });
});
