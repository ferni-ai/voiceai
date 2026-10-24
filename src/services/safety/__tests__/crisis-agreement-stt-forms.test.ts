/**
 * The agreement gate's broad risk list (hasRiskContent) keeps a turn's crisis
 * escalation. "dying" was missing ('di(e|es|ed|ing)' spells "diing").
 * SAFETY_WHOLE_WORD_SITES=on adds "dying" and "dyin" and changes nothing else:
 * 'plan\w*' stays as main has it. Narrowing it to drop plane and plants lost
 * real risk in the eval verify ("I'm going to crash this plane", "boarding a
 * plane, never coming back"), so the plane and plant false alarms are accepted.
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

// Plane and plant false alarms: risk off and on, accepted.
const EVERYDAY = [
  "I'm going on a plane tomorrow",
  'the planes were late',
  'plants on the balcony',
  'I planted tomatoes',
];
// Real risk the narrowed plane patterns dropped (eval verify, #2491 split round 1).
const PLANE_RISK = [
  "I'm going to crash this plane",
  'the plane crash would be quick',
  'boarding a plane, never coming back',
  "I've got everything planted for tomorrow",
  'eating the oleander plants in my yard',
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

  it('on: every plane and plant line still counts, as off', () => {
    for (const line of [...PLANE_RISK, ...EVERYDAY]) {
      flag('off');
      expect(hasRiskContent(line), line).toBe(true);
      flag('on');
      expect(hasRiskContent(line), line).toBe(true);
    }
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
    expect(shadow).toHaveBeenCalledTimes(1);
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

  // The verify's cases: an earlier risk line, then a short question back.
  const PLANE_CASES: Array<[string, string, string]> = [
    ["I'm going to crash this plane", "what's that?", 'that sounds like a lot to carry.'],
    ['the plane crash would be quick', 'why?', "I'm here with you."],
    ['eating the oleander plants in my yard', 'what do you mean?', 'tell me more about your yard.'],
    ["I've got everything planted for tomorrow", "what's that?", 'tomorrow sounds busy.'],
    ['boarding a plane, never coming back', 'why is that?', 'that is a big trip.'],
  ];
  it.each(PLANE_CASES)('on: after %j, %j still escalates, as off', (earlier, latest, companion) => {
    const read = () =>
      agreementOutcome({
        pattern: 'none',
        verdicts: [{ risk: 'crisis' } as never],
        latest,
        earlier: [earlier],
        companion,
      });
    flag('off');
    const off = read();
    flag('on');
    expect(off).toBe('escalate');
    expect(read()).toBe(off);
  });

  it('on: "dying" in the caller words keeps the escalation', () => {
    const companion = 'Some days I think about dying, honestly.';
    flag('off');
    expect(outcome('What about dying?', companion)).toBe('soft');
    flag('on');
    expect(outcome('What about dying?', companion)).toBe('escalate');
  });
});
