/**
 * Imminent means in hand or an attempt underway, on the patterns alone (#2697).
 *
 * "i have the pills right here and i'm taking them now" scored no risk on the
 * patterns: only the classifier caught it, so a classifier timeout (and every
 * synchronous site that never asks it, like assessSafety) gave no crisis
 * response. These lines must get the imminent script with the classifier
 * timed out, through the real guard, the turn pipeline and assessSafety.
 *
 * All of it with CRISIS_MEANS_IN_HAND=live; off and shadow are in crisis-means-in-hand.test.ts.
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

/** The caller's own means in hand, or an attempt underway or just made. */
const IMMINENT_MEANS = [
  "i have the pills right here and i'm taking them now",
  'i have the pills right here',
  "i've got the gun in my hand",
  "i'm holding the rope in my hands",
  'the razor is right here in front of me',
  'i have a blade in my hand right now',
  'got the noose right here',
  'the pills are right here',
  "i'm taking them now",
  "i'm taking all of them right now",
  "i'm swallowing the pills now",
  "i'm taking the whole bottle now",
  "i'm about to take them all now",
  'i just took all the pills',
  'i already swallowed the whole bottle',
  'i swallowed a handful of pills',
  'just took them all',
  'i already took all of them',
  "i've taken every last one",
  'i did it, i took the pills',
  'i finally did it. there is blood everywhere',
  'the pills are working, i did it',
  'i went through with it, the rope held',
];

/** Same words, someone else's or softened: never the caller's imminent script. */
const NOT_THE_CALLERS_IMMINENT = [
  'he said he has the pills right here',
  'he already took them',
  "she told me she's holding the gun in her hand",
  "i'm not taking them now",
  "i would never take them all now, don't worry",
  'i already took them years ago, i am in recovery now',
];

/**
 * Look-alikes the forms must not take: each one carries on past the means into
 * an ordinary purpose. (Medication talk that ends the same way with no possessive,
 * "i'm taking them now", does read imminent: that cost is accepted toward recall.)
 */
const BENIGN_LOOKALIKES = [
  'i have the rope right here for the camping trip',
  "i'm holding the rope in my hands at the climbing gym",
  "i'm taking them now like the doctor said",
  'i took them to the park',
  'just took them all to the vet',
  'i just took a handful of chips',
  'i took the whole bottle of cough syrup like the label says',
  'i swallowed everything she said',
  'i did it! i donated blood today',
  'i did it, i passed my gun safety course',
  'yeah i already took them this morning',
];

const imminentScript = (text: string) => {
  const found = detectCrisis(text);
  return {
    found,
    guard: guardFromDetection(found),
  };
};

describe('imminent means in hand: the patterns alone', () => {
  it.each(IMMINENT_MEANS)('"%s" gets the imminent script', (text) => {
    const { found, guard } = imminentScript(text);
    expect(found.subject).toBe('self');
    expect(found.indicators).toContain('imminent_danger');
    expect(guard.shouldBlock).toBe(true);
    expect(guard.replacementResponse).toContain(IN_DANGER_NOW);
  });

  it.each(NOT_THE_CALLERS_IMMINENT)('"%s" is not the caller\'s imminent script', (text) => {
    const { found, guard } = imminentScript(text);
    expect(found.indicators).not.toContain('imminent_danger');
    expect(guard.replacementResponse ?? '').not.toContain(IN_DANGER_NOW);
  });
});

/**
 * Seth's call on #2697: a past dose needs a dose word (all, whole bottle, handful, a number) to
 * read imminent on the patterns. These are how people answer a medication check-in, so they stay
 * as on main; the classifier still reads them when it answers.
 */
const MEDICATION_CHECK_IN = [
  'i already took them',
  'i swallowed them',
  "i've taken them, it's done",
  'i took my meds',
  'i already took my meds',
  'did you take your meds? yes i took them.',
  'i just took them.',
  'i took them, it is fine',
];

describe('a past dose with no dose word is a medication check-in', () => {
  it.each(MEDICATION_CHECK_IN)('"%s" is not an imminent read', (text) => {
    expect(detectCrisis(text).indicators).not.toContain('imminent_danger');
    expect(assessSafety(text).level).toBe('safe');
  });
});

describe('benign look-alikes stay as on main', () => {
  it.each(BENIGN_LOOKALIKES)('"%s" is not an imminent read', (text) => {
    expect(detectCrisis(text).indicators).not.toContain('imminent_danger');
    expect(assessSafety(text).level).toBe('safe');
  });

  it.each([
    'my nail gun is in my hand, fixing the deck',
    'the glue gun is in my hand',
    'water gun in my hands, the kids are winning',
  ])('a tool called a gun is not the means: "%s"', (text) => {
    expect(detectCrisis(text).indicators).not.toContain('imminent_danger');
    expect(assessSafety(text).level).toBe('safe');
  });

  it('a real gun in hand still is', () => {
    expect(detectCrisis('the gun is in my hand').indicators).toContain('imminent_danger');
  });
});

/** Ending words already read as a crisis, with the means at hand: was the 988 script, now 911. */
const ENDING_WORDS_WITH_MEANS = [
  'i want to die and i have the pills right here',
  "I have the pills in my hand right now and I'm going to take all of them",
  'theres a razor next to me and im about to start again, i cant stop',
  "i'm going to kill myself, the gun is loaded",
];

describe('ending words beside the means at hand', () => {
  it.each(ENDING_WORDS_WITH_MEANS)('"%s" leads with 911', (text) => {
    const { found, guard } = imminentScript(text);
    expect(found.subject).toBe('self');
    expect(found.indicators).toContain('imminent_danger');
    expect(guard.replacementResponse).toContain(IN_DANGER_NOW);
  });

  it.each([
    "i don't want to die, the pills are right here for my headache",
    'my sister wants to die and has the pills right here',
    'i want to die of embarrassment, my notes are right here',
  ])('softened, someone else\'s or everyday words do not: "%s"', (text) => {
    expect(detectCrisis(text).indicators).not.toContain('imminent_danger');
  });
});

describe('a softened read of the means is not its own plan', () => {
  // Found by the #2697 verifier: the means words were softened as a joke or the past, then the
  // plan tier escalated on those same words and the new means rule made it imminent.
  it.each([
    "i have the pills right here and i'm taking them now lol",
    "i have the pills right here and i'm taking them now jk",
    'i used to keep pills right here',
    // Round-2 verifier: the means-on-the-body forms added for #2697 name the means too.
    'i have the gun pointed at my head lol',
  ])('"%s" keeps its frame and gets no script', (text) => {
    const found = detectCrisis(text);
    expect(found.indicators).not.toContain('imminent_danger');
    expect(found.indicators).not.toContain('plan_or_means');
    expect(guardFromDetection(found).replacementResponse ?? '').not.toContain(IN_DANGER_NOW);
  });

  it('words softened before #2697 keep the level they had on main, with no 911 lead', () => {
    const found = detectCrisis('i used to have the gun in my hand every night');
    expect(found.severity).toBe(0.9);
    expect(found.indicators).toContain('crisis_history');
    expect(found.indicators).not.toContain('imminent_danger');
  });
});

/** Found by the #2697 verifier: imminent wordings that still scored 0 or missed the 911 lead. */
const VERIFIER_RECALL = [
  "i'm swallowing pills right now",
  "i'm taking these pills right now",
  'im takin them now',
  'i have the pills right here n im taking em now',
  'i took 40 tylenol',
  'i took a whole bottle of tylenol',
  'the gun is pointed at my head',
  "i've got a loaded gun next to me",
  "i'm holding a knife to my wrist",
  'the noose is around my neck',
  "i'm cutting myself right now",
  'i am going to take every pill i have right now',
  // Labelled block in crisis-test-blind.ts; scored 0 on main.
  'i swallowed a bunch of tylenol an hour ago and now im scared but i dont want to go to the er',
];

describe('verifier recall gaps', () => {
  it.each(VERIFIER_RECALL)('"%s" gets the imminent script', (text) => {
    const { found, guard } = imminentScript(text);
    expect(found.subject).toBe('self');
    expect(found.indicators).toContain('imminent_danger');
    expect(guard.replacementResponse).toContain(IN_DANGER_NOW);
  });
});

describe('with the classifier timed out', () => {
  it.each(IMMINENT_MEANS.slice(0, 6))(
    'the turn pipeline still replaces the reply: "%s"',
    async (text) => {
      resetCrisisClassifierCache();
      // The classifier never answers: only its timeout could settle it.
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

  it.each(IMMINENT_MEANS)('assessSafety (never asks the classifier) reads crisis: "%s"', (text) => {
    const assessment = assessSafety(text);
    expect(assessment.level).toBe('crisis');
    expect(assessment.recommendedAction).toBe('immediate_referral');
    expect((assessment.resources ?? []).map((r) => r.phone)).toContain('988');
    expect(getCrisisResponse(assessment)).toContain('911');
  });

  it("assessSafety is unchanged for an ordinary line and for someone else's means", () => {
    expect(assessSafety('what should i cook for dinner').level).toBe('safe');
    expect(assessSafety('he said he has the pills right here').level).toBe('safe');
    // Only the imminent forms are added: a non-imminent guard read keeps assessSafety's own level.
    expect(assessSafety("i'm so tired of everything").level).toBe('safe');
  });
});
