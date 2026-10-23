/**
 * The agreement gate's broad risk list (hasRiskContent) keeps a turn's crisis
 * escalation. A crisis eval found 'plan\w*' matching "plane", "planet" and
 * "plants", and "dying" missing ('di(e|es|ed|ing)' spells "diing").
 * EARLY_WARNING_STT_FORMS=on fixes both; off is today's list.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { agreementOutcome, hasRiskContent } from '../crisis-agreement.js';

afterEach(() => vi.unstubAllEnvs());
const flag = (v: 'on' | 'off') => vi.stubEnv('EARLY_WARNING_STT_FORMS', v);

const PLANE = [
  "I'm going on a plane tomorrow",
  'the planes were late',
  'what planet is that',
  'plants on the balcony',
];
const PLANS = ['I made a plan', 'I have plans', 'I planned it out', "I've been planning it"];
const DYING = ['I think about dying', 'I feel like dying'];

describe('hasRiskContent', () => {
  it('off: today, plane words count and dying does not', () => {
    flag('off');
    for (const line of PLANE) expect(hasRiskContent(line), line).toBe(true);
    for (const line of DYING) expect(hasRiskContent(line), line).toBe(false);
  });

  it('on: plane words do not count; plans and dying do', () => {
    flag('on');
    for (const line of PLANE) expect(hasRiskContent(line), line).toBe(false);
    for (const line of [...PLANS, ...DYING]) expect(hasRiskContent(line), line).toBe(true);
  });

  it('on: the rest of the list is unchanged', () => {
    flag('on');
    for (const line of ['I took the pills', 'tonight', 'I want to die', 'goodbye']) {
      expect(hasRiskContent(line), line).toBe(true);
    }
  });
});

describe('agreementOutcome on a lone crisis read of a question back', () => {
  const outcome = (latest: string, companion: string) =>
    agreementOutcome({
      pattern: 'none',
      verdicts: [{ risk: 'crisis' } as never],
      latest,
      companion,
    });

  it('on: "dying" in the caller words keeps the escalation', () => {
    const companion = 'Some days I think about dying, honestly.';
    flag('off');
    expect(outcome('What about dying?', companion)).toBe('soft');
    flag('on');
    expect(outcome('What about dying?', companion)).toBe('escalate');
  });
});
