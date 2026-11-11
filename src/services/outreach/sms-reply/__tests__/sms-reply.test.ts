/**
 * SMS_REPLY: what a member's text gets back. The crisis read, consent, the messaging policy,
 * the minor-care hold and the budget decide in that order; the model and every data read are
 * fakes behind SmsReplyReads, and the policy (decide) is real. Fictional people only.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const gate = vi.hoisted(() => ({
  read: { action: 'pass' } as
    | { action: 'pass' }
    | { action: 'replace'; reply: string }
    | { action: 'guide'; guidanceNote: string },
  calls: 0,
}));
vi.mock('../../../../agents/personas/crisis-gate-text.js', () => ({
  readTypedMessageForCrisis: async (message: string) => {
    gate.calls++;
    return { message, ...gate.read };
  },
}));
const logged = vi.hoisted(() => [] as unknown[]);
vi.mock('../../../../utils/safe-logger.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../utils/safe-logger.js')>()),
  createLogger: () => ({
    info: (...args: unknown[]) => logged.push(args),
    warn: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  }),
}));

import { MINOR_CARE_NOTE } from '../../../../utils/minor-care.js';
import { SOFT_CRISIS_CHECK } from '../../../safety/crisis-agreement.js';
import { GROUNDED_LIGHT_TOUCH } from '../../../safety/crisis-grounded-release.js';
import { buildCrisisGuidance } from '../../../safety/crisis-guard.js';
import { SMS_CRISIS_REPLY } from '../../sms-crisis-screen.js';
import { smsMemberReply, type RoutedText, type SmsReplyAsk } from '../sms-reply.js';
import type { SmsReplyReads } from '../sms-reply-reads.js';
import {
  SMS_AFTER_CRISIS_REPLY,
  SMS_AI_REMINDER,
  SMS_LIFELINE,
  SMS_REPLY_MAX_CHARS,
  smsReplyPrompt,
  smsReplyText,
} from '../sms-reply-text.js';

const MODEL_SAYS = 'Ha, Biscuit sounds like a handful. How did the walk go?';
const DAY = 86_400_000;
const neverAnswers = (): void => {
  // a model that never answers
};

let n = 0;
let reads: SmsReplyReads & { [K in keyof SmsReplyReads]: ReturnType<typeof vi.fn> };
let recordReply: ReturnType<typeof vi.fn<(text: string) => Promise<void>>>;

function fakeReads(over: Partial<SmsReplyReads> = {}): typeof reads {
  return {
    refusal: vi.fn(async () => null),
    lastCrisisAt: vi.fn(async () => undefined),
    recall: vi.fn(async () => ({ note: '[WHAT YOU REMEMBER] Biscuit is their dog', count: 1 })),
    identity: vi.fn(async () => 'You are Ferni.'),
    generate: vi.fn(async () => MODEL_SAYS),
    ...over,
  } as typeof reads;
}

/** A fresh member per test: the reply rate and reminder state are per member. */
function ask(over: Partial<SmsReplyAsk> = {}): SmsReplyAsk {
  return {
    userId: `uid-sam-${n}`,
    phone: '+15555550142',
    text: 'walked Biscuit in the rain lol',
    held: false,
    skip: false,
    ...over,
  };
}
function routed(over: Partial<RoutedText> = {}): RoutedText {
  return {
    routeDecision: { agentId: 'ferni' },
    earlierTexts: async () => [],
    recordReply,
    ...over,
  };
}
const prompt = () => reads.generate.mock.calls[0] as [string, string, AbortSignal];

beforeEach(() => {
  n++;
  gate.read = { action: 'pass' };
  gate.calls = 0;
  logged.length = 0;
  reads = fakeReads();
  recordReply = vi.fn(async (_text: string) => undefined);
  vi.stubEnv('SMS_REPLY', 'on');
  vi.stubEnv('SMS_CRISIS_SCREEN', 'on');
  vi.stubEnv('MINOR_CARE', 'on');
  vi.stubEnv('MINOR_CARE_SHARED_HOLD', 'on');
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe('the sent text (smsReplyText)', () => {
  const LONG = Array.from({ length: 30 }, (_, i) => `Sentence number ${i} is here.`).join(' ');

  it('two segments at most, cut after a whole sentence; nothing written means no reply', () => {
    const sent = smsReplyText(LONG)!;
    expect(sent.length).toBeLessThanOrEqual(SMS_REPLY_MAX_CHARS);
    expect(sent.endsWith('here.')).toBe(true);
    expect(smsReplyText('   \n ')).toBeNull();
  });

  it("with guidance, 988 is always sent: the lifeline when the model's own 988 was cut or never there", () => {
    expect(smsReplyText(`${LONG} Call or text 988.`, { lifeline: true })).toContain(SMS_LIFELINE);
    expect(smsReplyText('', { lifeline: true })).toBe(SMS_LIFELINE);
    expect(smsReplyText('You can call or text 988.', { lifeline: true })).toBe(
      'You can call or text 988.'
    );
  });

  it('against the LONGEST guidance the gate gives: it ends the prompt, and 988 survives the cap', () => {
    const self = {
      isCrisis: true,
      severity: 0.9,
      subject: 'self' as const,
      language: 'es' as const,
    };
    const guidance = [
      SOFT_CRISIS_CHECK,
      GROUNDED_LIGHT_TOUCH,
      buildCrisisGuidance({ ...self, indicators: ['joking_frame', 'crisis_history', 'plan'] }),
      buildCrisisGuidance({ ...self, subject: 'third_party', indicators: ['third_party'] }),
    ].sort((a, b) => b.length - a.length)[0]!;
    const note = `(${guidance})`;
    const parts = { identity: 'x', minorCare: true, recall: null, earlier: [], message: 'hey' };
    const p = smsReplyPrompt({ ...parts, guidanceNote: note });
    expect(p.contents.endsWith(note)).toBe(true);
    // A model that parrots the whole guidance back, with a held minor's reminder too.
    const sent = smsReplyText(`${guidance} ${LONG}`.replace(/988/g, 'nine'), {
      lifeline: true,
      reminder: true,
    })!;
    expect(sent.length).toBeLessThanOrEqual(SMS_REPLY_MAX_CHARS);
    expect(sent).toContain('988');
    expect(sent.endsWith(`${SMS_LIFELINE} ${SMS_AI_REMINDER}`)).toBe(true);
  });
});

describe('smsMemberReply', () => {
  it("a member's text gets the routed persona's reply, kept in the thread", async () => {
    const route = routed({ routeDecision: { agentId: 'maya-santos' } });
    await expect(smsMemberReply(route, ask(), reads)).resolves.toEqual({ reply: MODEL_SAYS });
    expect(reads.identity).toHaveBeenCalledWith('maya-santos');
    expect(prompt()[0]).toContain('Biscuit is their dog');
    expect(recordReply).toHaveBeenCalledWith(MODEL_SAYS);
  });

  it.each([
    ['the flag off', () => vi.stubEnv('SMS_REPLY', 'off'), {}],
    ['a crisis screened or a maybe-stop text', () => undefined, { skip: true }],
    ['the crisis screen not on', () => vi.stubEnv('SMS_CRISIS_SCREEN', 'shadow'), {}],
    ['the shared minor-care hold off', () => vi.stubEnv('MINOR_CARE_SHARED_HOLD', 'off'), {}],
  ])('%s: no reply, and nothing read', async (_case, setUp, over) => {
    setUp();
    await expect(smsMemberReply(routed(), ask(over), reads)).resolves.toBeNull();
    expect(gate.calls).toBe(0);
    for (const read of Object.values(reads)) expect(read).not.toHaveBeenCalled();
  });

  it("the crisis read's 'replace': SMS_CRISIS_REPLY, before any read of their data", async () => {
    gate.read = { action: 'replace', reply: 'the voice script' };
    const sent = await smsMemberReply(routed(), ask(), reads);
    expect(sent).toEqual({ reply: SMS_CRISIS_REPLY, crisis: true });
    for (const read of Object.values(reads)) expect(read).not.toHaveBeenCalled();
  });

  it("'guide': the guidance ends the prompt and the sent text carries 988", async () => {
    gate.read = { action: 'guide', guidanceNote: `(${SOFT_CRISIS_CHECK})` };
    const sent = await smsMemberReply(routed(), ask(), reads);
    expect(prompt()[1].endsWith(`(${SOFT_CRISIS_CHECK})`)).toBe(true);
    expect(sent?.reply).toBe(`${MODEL_SAYS} ${SMS_LIFELINE}`);
  });

  it.each(['opted-out', 'paused', 'consent-unknown'] as const)(
    '%s: silent, and no model call',
    async (refusal) => {
      reads = fakeReads({ refusal: vi.fn(async () => refusal) });
      await expect(smsMemberReply(routed(), ask(), reads)).resolves.toBeNull();
      expect(reads.generate).not.toHaveBeenCalled();
    }
  );

  it.each([
    ['3 days after a crisis', 3 * DAY],
    ['crisis signals unreadable (read as now)', 0],
  ])('%s: the fixed warm reply, no recall and no model', async (_case, ago) => {
    reads = fakeReads({ lastCrisisAt: vi.fn(async () => new Date(Date.now() - ago)) });
    const sent = await smsMemberReply(routed(), ask(), reads);
    expect(sent).toEqual({ reply: SMS_AFTER_CRISIS_REPLY });
    expect(reads.recall).not.toHaveBeenCalled();
    expect(reads.generate).not.toHaveBeenCalled();
  });

  it('15 days after a crisis: the usual reply', async () => {
    reads = fakeReads({ lastCrisisAt: vi.fn(async () => new Date(Date.now() - 15 * DAY)) });
    await expect(smsMemberReply(routed(), ask(), reads)).resolves.toEqual({ reply: MODEL_SAYS });
  });

  it('the 21st reply in an hour: silent (the policy reply rate)', async () => {
    const one = ask();
    const start = new Date('2026-11-12T18:00:00Z').getTime();
    vi.useFakeTimers({ toFake: ['Date'], now: start });
    for (let i = 0; i < 20; i++) {
      vi.setSystemTime(start + i * 60_000); // one text a minute
      // eslint-disable-next-line no-await-in-loop
      expect(await smsMemberReply(routed(), one, reads)).not.toBeNull();
    }
    await expect(smsMemberReply(routed(), one, reads)).resolves.toBeNull();
  });

  it('quiet hours: a live reply still goes (3 a.m. on both coasts)', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-11-12T10:00:00Z') });
    await expect(smsMemberReply(routed(), ask(), reads)).resolves.toEqual({ reply: MODEL_SAYS });
  });

  it('a held minor: the care note, no recall read, nothing kept, the AI reminder on the first reply', async () => {
    const route = routed({ recordReply: undefined });
    const sent = await smsMemberReply(route, ask({ held: true }), reads);
    expect(reads.recall).not.toHaveBeenCalled();
    expect(prompt()[0]).toContain(MINOR_CARE_NOTE);
    expect(sent?.reply).toBe(`${MODEL_SAYS} ${SMS_AI_REMINDER}`);
    expect(recordReply).not.toHaveBeenCalled();
  });

  it("a held minor's reminder: not 2 h later, back 3 h after the last one; an adult never gets it", async () => {
    const start = new Date('2026-11-12T18:00:00Z').getTime();
    vi.useFakeTimers({ toFake: ['Date'], now: start });
    const mia = ask({ held: true });
    const at = async (hours: number, who = mia) => {
      vi.setSystemTime(start + hours * 3_600_000);
      return (await smsMemberReply(routed(), who, reads))?.reply;
    };
    expect(await at(0)).toContain(SMS_AI_REMINDER);
    expect(await at(2)).toBe(MODEL_SAYS);
    expect(await at(3)).toContain(SMS_AI_REMINDER);
    expect(await at(3.5, ask({ userId: `uid-alex-${n}` }))).toBe(MODEL_SAYS);
  });

  it('past the budget: no reply, nothing kept, one counts-only log line', async () => {
    reads = fakeReads({ generate: vi.fn(async () => new Promise<string>(neverAnswers)) });
    await expect(smsMemberReply(routed(), ask(), reads, 30)).resolves.toBeNull();
    expect(recordReply).not.toHaveBeenCalled();
    expect(logged).toHaveLength(1);
    const counts = { event: 'SMS_REPLY', outcome: 'timeout', recall: 0, chars: 0 };
    expect(logged[0]).toEqual([{ ...counts, ms: expect.any(Number) }, 'SMS reply']);
  });

  it('every outcome logs one line with no words, number or id', async () => {
    const a = ask();
    await smsMemberReply(routed(), a, reads);
    gate.read = { action: 'replace', reply: 'x' };
    await smsMemberReply(routed(), a, reads);
    const text = JSON.stringify(logged);
    expect(logged).toHaveLength(2);
    for (const secret of [a.text, MODEL_SAYS, a.userId, '0142', SMS_CRISIS_REPLY]) {
      expect(text).not.toContain(secret);
    }
  });
});
