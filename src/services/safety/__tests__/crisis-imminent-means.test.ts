/**
 * Imminent means in hand or an attempt underway, on the patterns alone (#2697), with
 * CRISIS_MEANS_IN_HAND=live: only the live forms act (crisis-means-in-hand.ts LIVE_FORMS).
 *
 * "i have the pills right here and i'm taking them now" scored no risk on the patterns: only the
 * classifier caught it, so a classifier timeout (and every synchronous site that never asks it,
 * like assessSafety) gave no crisis response. These lines must get the imminent script with the
 * classifier timed out, through the real guard, the turn pipeline and assessSafety.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('../../../utils/safe-logger.js', () => {
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), trace: vi.fn() };
  return { createLogger: () => logger, getLogger: () => logger, default: logger, logger };
});

import { detectCrisis, guardFromDetection, IN_DANGER_NOW } from '../crisis-guard.js';
import { resetCrisisClassifierCache } from '../crisis-classifier.js';
import { startTurnCrisis } from '../../../agents/processors/turn-processor/turn-crisis.js';
import {
  assessSafety,
  getCrisisResponse,
} from '../../../tools/domains/life-coaching-shared/safety-guards.js';

beforeAll(() => {
  vi.stubEnv('CRISIS_MEANS_IN_HAND', 'live');
});
afterAll(() => {
  vi.unstubAllEnvs();
});

/** The caller's own means and intent, an attempt underway or just made: the live forms. */
const LIVE_IMMINENT = [
  // means_with_intent
  "i have the pills right here and i'm taking them now",
  "the pills are in my hand and i'm taking them now",
  "the gun is in my hand and i'm doing it tonight",
  "i have the shotgun in my hand and i'm doing it now",
  // Security review round 4: plurals and dose words trigger the form.
  "i have the guns in my hand and i'm doing it now",
  "i have the knives in my hand and i'm doing it now",
  "i have a bottle in my hand and i'm doing it now",
  "i have everything in my hand and i'm doing it now",
  // drug_count, took_dose
  'i took 40 tylenol',
  'i took 15 pills',
  'i took a whole bottle of tylenol',
  'i already swallowed the whole bottle',
  'just took them all',
  'i took everything',
  'i swallowed a bunch of tylenol an hour ago and now im scared but i dont want to go to the er',
  // on_body
  'the gun is pointed at my head',
  "i've got a loaded gun next to me",
  "i'm holding a knife to my wrist",
  'the noose is around my neck',
  // did_it, cutting_now
  'i did it, i took the pills',
  'the pills are working, i did it',
  'i went through with it, the rope held',
  "i'm cutting myself right now",
];

/** Ending words already read as a crisis, with the means at hand: was the 988 script, now 911. */
const ENDING_WORDS_WITH_MEANS = [
  'i want to die and i have the pills right here',
  "i'm going to kill myself, the gun is loaded",
];

const read = (text: string) => {
  const found = detectCrisis(text);
  return { found, guard: guardFromDetection(found) };
};

describe('live forms: the 911 script on the patterns alone', () => {
  it.each([...LIVE_IMMINENT, ...ENDING_WORDS_WITH_MEANS])('"%s"', (text) => {
    const main = detectCrisis(text, undefined, { meansInHand: 'off' });
    expect(main.indicators).not.toContain('imminent_danger');
    const { found, guard } = read(text);
    expect(found.subject).toBe('self');
    expect(found.indicators).toContain('imminent_danger');
    expect(guard.shouldBlock).toBe(true);
    expect(guard.replacementResponse).toContain(IN_DANGER_NOW);
  });
});

/**
 * Seth's call on #2697: a past dose needs a dose word. And a dose strength is not a count (r1
 * blocker 2). These are how people answer a medication check-in, so they stay as on main.
 */
describe('medication check-ins and dose strengths read as on main', () => {
  it.each([
    'i already took them',
    'i took my meds',
    'did you take your meds? yes i took them.',
    "i've taken them, it's done",
    'i took 500 mg of tylenol for my headache',
    'i took 25 units of insulin before dinner',
    'i took 300 mg of lithium like always',
    'i took 20 ml of benadryl syrup',
    'took 1000mg of tylenol',
    "i have my pills right here and i'm taking them now",
  ])('"%s"', (text) => {
    expect(detectCrisis(text)).toEqual(detectCrisis(text, undefined, { meansInHand: 'off' }));
    expect(assessSafety(text).level).toBe('safe');
  });
});

describe('softened live forms read as on main (r1 blocker 3)', () => {
  it.each([
    "i don't have the gun in my hand and i'm not doing it now",
    'what if the noose was around my neck',
    'i dreamed the gun was pointed at my head',
    'lol the noose is around my neck',
    'haha i took them all',
    'years ago i took a whole bottle of pills',
    'my brother said he took a whole bottle of tylenol',
    "i'd never have the pills in my hand and be taking them now",
  ])('"%s"', (text) => {
    expect(detectCrisis(text)).toEqual(detectCrisis(text, undefined, { meansInHand: 'off' }));
  });
});

describe('with the classifier timed out', () => {
  it.each(LIVE_IMMINENT.slice(0, 6))(
    'the turn pipeline still replaces the reply: "%s"',
    async (text) => {
      resetCrisisClassifierCache();
      const never = async (): Promise<string> =>
        new Promise<string>(() => {
          /* never answers */
        });
      const turn = startTurnCrisis(
        text,
        { recentTranscripts: [] },
        {
          env: { CRISIS_CLASSIFIER_MODE: 'live', CRISIS_CLASSIFIER_TIMEOUT_MS: '20' },
          generate: never,
          sessionId: 'timeout-call',
        }
      );
      const summary = await turn.summary();
      expect(summary.shouldOverrideLLM).toBe(true);
      expect(summary.suggestedResponse).toContain(IN_DANGER_NOW);
    }
  );

  it.each(LIVE_IMMINENT)('assessSafety (never asks the classifier) reads crisis: "%s"', (text) => {
    const assessment = assessSafety(text);
    expect(assessment.level).toBe('crisis');
    expect(assessment.recommendedAction).toBe('immediate_referral');
    expect((assessment.resources ?? []).map((r) => r.phone)).toContain('988');
    expect(getCrisisResponse(assessment)).toContain('911');
  });

  it("assessSafety is unchanged for an ordinary line and for someone else's means", () => {
    expect(assessSafety('what should i cook for dinner').level).toBe('safe');
    expect(assessSafety('he said he has the pills right here').level).toBe('safe');
    expect(assessSafety("i'm so tired of everything").level).toBe('safe');
  });
});
