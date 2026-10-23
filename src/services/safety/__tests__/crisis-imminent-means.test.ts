/**
 * Imminent means in hand or an attempt underway, on the patterns alone (#2697).
 *
 * "i have the pills right here and i'm taking them now" scored no risk on the
 * patterns: only the classifier caught it, so a classifier timeout (and every
 * synchronous site that never asks it, like assessSafety) gave no crisis
 * response. These lines must get the imminent script with the classifier
 * timed out, through the real guard, the turn pipeline and assessSafety.
 */
import { describe, expect, it, vi } from 'vitest';

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
  'i already took them',
  'i just took all the pills',
  'i already swallowed the whole bottle',
  'i swallowed them',
  'i swallowed a handful of pills',
  'just took them all',
  "i've taken them, it's done",
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
 * an ordinary purpose. (Medication talk that ends the same way, "i'm taking my
 * pills now", does read imminent: that cost is accepted toward recall.)
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

describe('benign look-alikes stay as on main', () => {
  it.each(BENIGN_LOOKALIKES)('"%s" is not an imminent read', (text) => {
    expect(detectCrisis(text).indicators).not.toContain('imminent_danger');
    expect(assessSafety(text).level).toBe('safe');
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
