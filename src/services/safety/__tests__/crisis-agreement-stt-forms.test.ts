/**
 * The agreement gate's broad risk list (hasRiskContent) keeps a turn's crisis
 * escalation. A crisis eval found 'plan\w*' matching "plane" and "plants",
 * and "dying" missing ('di(e|es|ed|ing)' spells "diing").
 * SAFETY_WHOLE_WORD_SITES=on drops plane and plants, keeps every plan form,
 * "planet" and the plane method phrases, and adds "dying"; off is today's list.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const shadow = vi.hoisted(() => vi.fn());
vi.mock('../../../utils/safe-logger.js', async (actual) => {
  const real = await actual<typeof import('../../../utils/safe-logger.js')>();
  return {
    ...real,
    createLogger: (b: Record<string, unknown>) =>
      b.module === 'SafetyPhraseShadow'
        ? { info: shadow, warn: shadow, debug: shadow, error: shadow }
        : real.createLogger(b),
  };
});

import { agreementOutcome, hasRiskContent } from '../crisis-agreement.js';

afterEach(() => {
  vi.unstubAllEnvs();
  shadow.mockClear();
});
const flag = (v: 'on' | 'off' | 'shadow') => vi.stubEnv('SAFETY_WHOLE_WORD_SITES', v);

const EVERYDAY = [
  "I'm going on a plane tomorrow",
  'the planes were late',
  'plants on the balcony',
  'I planted tomatoes',
];
const KEPT = [
  'I made a plan',
  'I have plans',
  'I planned it out',
  "I've been planning it",
  "I'm plannin' it",
  'plannin it',
  'the planner',
  "I don't want to be on this planet anymore",
  'I want off this planet',
  'thinking of crashing my plane',
  'fly the plane into a mountain',
];
const DYING = ['I think about dying', 'I feel like dying', "i'm dyin"];

describe('hasRiskContent', () => {
  it('off: today, plane words count and dying does not', () => {
    flag('off');
    for (const line of [...EVERYDAY, ...KEPT]) expect(hasRiskContent(line), line).toBe(true);
    for (const line of DYING) expect(hasRiskContent(line), line).toBe(false);
  });

  it('on: plane and plants do not count', () => {
    flag('on');
    for (const line of EVERYDAY) expect(hasRiskContent(line), line).toBe(false);
  });

  it('on: every plan form, planet, the plane method phrases and dying do', () => {
    flag('on');
    for (const line of [...KEPT, ...DYING]) expect(hasRiskContent(line), line).toBe(true);
  });

  it('on: the rest of the list is unchanged', () => {
    flag('on');
    for (const line of ['I took the pills', 'tonight', 'I want to die', 'goodbye']) {
      expect(hasRiskContent(line), line).toBe(true);
    }
  });

  it('shadow: logs where on would differ, decides as off', () => {
    flag('shadow');
    expect(hasRiskContent('plants on the balcony')).toBe(true);
    expect(hasRiskContent('I think about dying')).toBe(false);
    expect(shadow).toHaveBeenCalledTimes(2);
    expect(shadow).toHaveBeenCalledWith(
      expect.objectContaining({ flag: 'SAFETY_WHOLE_WORD_SITES', site: 'crisis-agreement' }),
      expect.any(String)
    );
  });

  it('the STT forms flag alone leaves the list as it is', () => {
    vi.stubEnv('EARLY_WARNING_STT_FORMS', 'on');
    expect(hasRiskContent('plants on the balcony')).toBe(true);
    expect(hasRiskContent('I think about dying')).toBe(false);
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
