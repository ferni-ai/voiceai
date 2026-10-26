/**
 * SMS_CRISIS_SCREEN (sms-crisis-screen.ts): a text that reads as a crisis gets
 * 988. The pattern guard and the classifier are the real ones; only the
 * classifier's model call is faked (it returns the JSON the model would).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

// Every log call the module makes, to prove the words never reach a log line.
const logged = vi.hoisted(() => [] as unknown[][]);
vi.mock('../../../utils/safe-logger.js', () => ({
  createLogger: () => ({
    info: (...args: unknown[]) => logged.push(args),
    warn: (...args: unknown[]) => logged.push(args),
    error: (...args: unknown[]) => logged.push(args),
    debug: (...args: unknown[]) => logged.push(args),
  }),
}));
import type { CrisisGenerateFn } from '../../safety/crisis-classifier.js';
import { detectCrisis } from '../../safety/crisis-guard.js';
import { inboundKeyword, isExactKeyword, keywordReply } from '../../messaging/sms-keywords.js';
import {
  readSmsCrisis,
  SMS_CLASSIFIER_TIMEOUT_MS,
  SMS_CRISIS_REPLY,
  SMS_MAX_CHARS,
  smsCrisisReply,
  smsReplyTwiml,
  withCrisisReply,
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

describe('Twilio keywords (verify of 5ee374736)', () => {
  it.each([
    'HELP',
    'help',
    'help?',
    'Help!',
    'STOP',
    'stop.',
    'START',
    'info',
    'Unsubscribe',
    // EXACT_STOP phrases (re-verify of 4399998fd: "opt out" got 988 after its confirmation)
    'opt out',
    'opt out.',
    'opt  out',
    'Stop all',
    'please stop',
    'yes stop',
  ])('a bare keyword: %s', (text) => expect(isExactKeyword(text)).toBe(true));

  it.each(['help me', 'i need help', 'stop texting me. i want to die', 'I want to kill myself'])(
    'not a bare keyword: %s',
    (text) => expect(isExactKeyword(text)).toBe(false)
  );

  it('a bare stop or start keyword read as crisis by the classifier alone gets no 988 over its notice', async () => {
    vi.stubEnv('SMS_CRISIS_SCREEN', 'on');
    const classifierOnly = vi.fn(async (): Promise<SmsCrisisRead> => ({
      crisis: true,
      pattern: false,
      risk: 'crisis',
    }));
    for (const text of ['STOP', 'stop.', 'opt out', 'opt out.', 'stop all', 'START']) {
      expect(await smsCrisisReply(text, classifierOnly)).toBeNull();
    }
  });

  it('"help" is never gated: someone in crisis texts just "help" (sethford-ee, 2026-10-25)', async () => {
    vi.stubEnv('SMS_CRISIS_SCREEN', 'on');
    const classifierOnly = vi.fn(async (): Promise<SmsCrisisRead> => ({
      crisis: true,
      pattern: false,
      risk: 'crisis',
    }));
    for (const text of ['HELP', 'help', 'help?', 'Help!', 'info', 'help me', 'i need help']) {
      expect(await smsCrisisReply(text, classifierOnly)).toBe(SMS_CRISIS_REPLY);
    }
  });

  it('an opt-out that reads as crisis keeps its confirmation, then 988', () => {
    const body = 'stop texting me. i want to die';
    const confirmation = keywordReply(inboundKeyword(body));
    expect(confirmation).toMatch(/unsubscribed/); // the app owes this one
    const handler = smsReplyTwiml(confirmation ?? '');
    const sent = withCrisisReply(handler, SMS_CRISIS_REPLY, body);
    expect(sent.match(/<Message>/g)).toHaveLength(2);
    expect(sent.indexOf('unsubscribed')).toBeLessThan(sent.indexOf('988'));
  });

  it('any other reply is replaced by 988', () => {
    const handler = smsReplyTwiml("I'd love to talk. Open Ferni whenever you're ready.");
    const sent = withCrisisReply(handler, SMS_CRISIS_REPLY, 'I want to die, call me');
    expect(sent.match(/<Message>/g)).toHaveLength(1);
    expect(sent).toContain('988');
    expect(sent).not.toContain('Open Ferni');
  });
});

describe('what the screen logs and how long it waits', () => {
  it('never logs the words of the text', async () => {
    vi.stubEnv('SMS_CRISIS_SCREEN', 'on');
    logged.length = 0;
    const words = 'my secret plan is the bridge on fifth street';
    await smsCrisisReply(words, async () => ({ crisis: true, pattern: true, risk: 'imminent' }));
    await smsCrisisReply(words, async () => {
      throw new Error('boom');
    });
    expect(logged.length).toBeGreaterThan(0);
    expect(JSON.stringify(logged)).not.toContain('bridge');
  });

  it('gives up on a hung classifier after 4 s, so the reply is never held longer', async () => {
    vi.useFakeTimers();
    try {
      const hung: CrisisGenerateFn = () => new Promise<string>(() => {});
      let settled: SmsCrisisRead | undefined;
      void readSmsCrisis('see you at 6', hung).then((r) => (settled = r));
      await vi.advanceTimersByTimeAsync(3_999);
      expect(settled).toBeUndefined();
      await vi.advanceTimersByTimeAsync(1);
      expect(settled).toEqual({ crisis: false, pattern: false, risk: null });
      expect(SMS_CLASSIFIER_TIMEOUT_MS).toBeLessThanOrEqual(4_000);
    } finally {
      vi.useRealTimers();
    }
  });
});
