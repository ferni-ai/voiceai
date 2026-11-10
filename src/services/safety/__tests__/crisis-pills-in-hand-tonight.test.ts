/**
 * CRISIS_MEANS_IN_HAND (#2697): the pills in hand, said bare, and taking them tonight.
 *
 * "pills in hand, taking them tonight" read nothing on main in every mode: means_with_intent needs
 * "right here", "in my hand" or "in front of me" (not bare "in hand") and "i'm taking them" or
 * "doing it tonight" (not bare "taking them tonight"). So a typed message with the classifier
 * timed out passed straight to the model, and the voice turn did not block either.
 *
 * pills_in_hand_tonight is a live form: under live these read 911 first on the typed gate, the
 * voice turn and the guard. Off, shadow and unset read every line exactly as main; shadow and live
 * log the form. Medication check-ins (the caller's own pills, a time, a meal, a doctor, a question)
 * read as main under live. Fictional lines only.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const logged = vi.hoisted(() => ({ info: vi.fn() }));
vi.mock('../../../utils/safe-logger.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../utils/safe-logger.js')>();
  const logger = {
    info: logged.info,
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
    child: () => logger,
  };
  return { ...actual, createLogger: () => logger, getLogger: () => logger, logger };
});

import { readTypedMessageForCrisis } from '../../../agents/personas/crisis-gate-text.js';
import { startTurnCrisis } from '../../../agents/processors/turn-processor/turn-crisis.js';
import { assessSafety } from '../../../tools/domains/life-coaching-shared/safety-guards.js';
import { resetCrisisClassifierCache, type CrisisGenerateFn } from '../crisis-classifier.js';
import { detectCrisis, IN_DANGER_NOW } from '../crisis-guard.js';
import { LIVE_FORMS } from '../crisis-means-in-hand.js';
import { noteMeansInHandShadow } from '../crisis-means-shadow.js';

const live = (text: string) => detectCrisis(text, undefined, { meansInHand: 'live' });
const off = (text: string) => detectCrisis(text, undefined, { meansInHand: 'off' });
const all = (text: string) => detectCrisis(text, undefined, { meansInHand: 'all' });
const imminent = (r: { indicators: string[] }) => r.indicators.includes('imminent_danger');

/** The reported line and its variants: the pills in hand, taking them tonight. */
const PILLS_TONIGHT = [
  'pills in hand, taking them tonight',
  'got the pills in hand, taking them all tonight',
  'pills in my hand, taking em tonight',
  'the pills are in hand and im taking them tonight',
  'i have all my pills in hand. taking every one tonight',
];

/** Medication check-ins and ordinary lines: read as main under live, no form named. */
const EVERYDAY = [
  'i have my pills in hand, taking them with dinner tonight',
  'pills in hand, taking them at 9 like the doctor said',
  'took my meds',
  'taking them tonight before bed as prescribed',
  'got my meds in hand, taking them tonight',
  "my mom's pills in hand, taking them tonight",
  'pills in hand, taking them tonight?',
  'pills in hand, taking them tonight lol',
  'pills in hand, taking them to grandma tonight',
  'pills in hand, taking them back to the pharmacy tonight',
  'pills in hand, taking them tonight with food',
  'pills in hand, taking them tonight, like the doctor said',
  'i have the pills in hand, taking them tonight for my migraine',
  "pills in hand, i'm not taking them tonight",
  "i don't have the pills in hand, so not taking them tonight",
  'what if i had the pills in hand, taking them tonight',
  'she said the pills are in hand and she is taking them tonight',
  'beer in hand, taking them tonight at the bar',
  'tickets in hand, taking them tonight to the show',
  'got the pills in hand, taking them tonight after dinner',
  'pills in hand, taking them tonight at 10',
  'meds in hand, taking them tonight before i forget',
  'pills in hand, should i be taking them tonight',
  'the pills are in hand and he is taking them tonight',
];

/** The classifier never answers within its timeout: the patterns decide alone. */
const timedOut: CrisisGenerateFn = () =>
  new Promise<string>(() => {
    /* never answers */
  });
const classifierEnv = {
  CRISIS_GUARD_MODE: 'live',
  CRISIS_CLASSIFIER_MODE: 'live',
  CRISIS_CLASSIFIER_TIMEOUT_MS: '20',
};

const typed = (text: string) =>
  readTypedMessageForCrisis(text, [], { env: classifierEnv, generate: timedOut });
async function voice(text: string) {
  const turn = startTurnCrisis(
    text,
    { recentTranscripts: [] },
    { env: classifierEnv, generate: timedOut, sessionId: 'pills-tonight-call' }
  );
  return turn.summary();
}

beforeEach(() => {
  resetCrisisClassifierCache();
  logged.info.mockClear();
});
afterEach(() => vi.unstubAllEnvs());

describe('pills_in_hand_tonight is a live form', () => {
  it('is in the live set', () => {
    expect(LIVE_FORMS.has('pills_in_hand_tonight')).toBe(true);
  });
});

describe('live: the pills in hand, taking them tonight, reads 911 first', () => {
  it.each(PILLS_TONIGHT)('the guard: "%s"', (text) => {
    expect(imminent(off(text))).toBe(false);
    expect(imminent(live(text))).toBe(true);
    expect(live(text).subject).toBe('self');
    expect(all(text).indicators).toContain('means_form:pills_in_hand_tonight');
  });

  it.each(PILLS_TONIGHT)('the typed gate, classifier timed out: "%s"', async (text) => {
    vi.stubEnv('CRISIS_MEANS_IN_HAND', 'live');
    const read = await typed(text);
    expect(read.action).toBe('replace');
    expect(read.action === 'replace' && read.reply).toContain(IN_DANGER_NOW);
  });

  it.each(PILLS_TONIGHT)('the voice turn, classifier timed out: "%s"', async (text) => {
    vi.stubEnv('CRISIS_MEANS_IN_HAND', 'live');
    const summary = await voice(text);
    expect(summary.shouldOverrideLLM).toBe(true);
    expect(summary.suggestedResponse).toContain(IN_DANGER_NOW);
  });

  it.each(PILLS_TONIGHT)('assessSafety: "%s"', (text) => {
    vi.stubEnv('CRISIS_MEANS_IN_HAND', 'live');
    expect(assessSafety(text).level).toBe('crisis');
  });
});

describe('off, shadow and unset read every line exactly as main', () => {
  // '' is unset: the default.
  const MODES = ['', 'shadow', 'off'];

  it.each([...PILLS_TONIGHT, ...EVERYDAY])('"%s"', (text) => {
    for (const mode of MODES) {
      vi.stubEnv('CRISIS_MEANS_IN_HAND', mode);
      expect(detectCrisis(text)).toEqual(off(text));
    }
  });

  it.each(PILLS_TONIGHT.flatMap((text) => MODES.map((mode) => [text, mode])))(
    'the typed gate and voice turn pass as on main: "%s" (mode "%s")',
    async (text, mode) => {
      vi.stubEnv('CRISIS_MEANS_IN_HAND', mode);
      expect(await typed(text)).toEqual({ action: 'pass', message: text });
      resetCrisisClassifierCache();
      expect((await voice(text)).shouldOverrideLLM).toBe(false);
    }
  );

  it.each(['', 'live'])('the shadow log names the form, never the words (mode "%s")', (mode) => {
    const text = PILLS_TONIGHT[0];
    const env = { CRISIS_MEANS_IN_HAND: mode };
    const got = noteMeansInHandShadow('call-1', off(text), { text }, env);
    expect(got).toEqual({ tier: 'imminent', form: 'pills_in_hand_tonight' });
    const said = JSON.stringify(logged.info.mock.calls);
    expect(logged.info).toHaveBeenCalledTimes(1);
    for (const words of [text, 'in hand', 'taking them']) expect(said).not.toContain(words);
  });
});

describe('medication check-ins and ordinary lines read as main under live', () => {
  it.each(EVERYDAY)('"%s"', async (text) => {
    expect(live(text)).toEqual(off(text));
    expect(imminent(live(text))).toBe(false);
    expect(all(text).indicators).not.toContain('means_form:pills_in_hand_tonight');
    vi.stubEnv('CRISIS_MEANS_IN_HAND', 'live');
    expect(assessSafety(text).flags).not.toContain('suicidal: imminent means or attempt');
  });
});

// The known cost, Seth's call before live: a bare check-in said in exactly the reported shape (no
// "my", no time or meal after "tonight") reads like the crisis line, so live gives it 911 too.
describe('known cost under live', () => {
  it.each(['meds in hand, taking them tonight', 'got the meds in hand, taking them tonight.'])(
    'live reads "%s" as 911; off and shadow as main',
    (text) => {
      expect(imminent(off(text))).toBe(false);
      expect(imminent(live(text))).toBe(true);
    }
  );
});
