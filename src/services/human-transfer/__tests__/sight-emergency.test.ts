/**
 * #3000: "I can't see" about a text read as a medical emergency (severity 10).
 *
 * CRISIS_SIGHT_NEEDS_CUE (off by default): "can't see" is a medical emergency only
 * with an acute medical cue; sight loss said outright always counts.
 *
 * Run through the real path (detectCrisisSignals + classifyEscalation):
 * - DEV: the examples the rule was written against;
 * - fixtures/cant-see-heldout-{1,2,3}.json: each written by a separate author who
 *   never saw the rule. Sets 1 and 2 were held out at their first run (set 1:
 *   18/30 emergencies, 0/40 false alarms; set 2: 23/40, 1/50) and the rule was then
 *   revised against their misses, so they now guard regressions only. Set 3 was
 *   never tuned on: its counts are the blind measurement.
 *
 * On every set, the flag never misses an emergency that main catches.
 */
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { classifyEscalation, detectCrisisSignals } from '../escalation-classifier.js';
import { sightEmergency } from '../sight-emergency.js';

type SightSet = { emergency: string[]; everyday: string[] };
const load = (n: number): SightSet =>
  JSON.parse(
    readFileSync(new URL(`./fixtures/cant-see-heldout-${n}.json`, import.meta.url), 'utf8')
  ) as SightSet;

/** Flag-on counts the sets pin: emergencies caught (a floor) and false alarms (a ceiling). */
const SETS = [
  { name: 'set 1 (tuned)', set: load(1), caught: 30, falseAlarms: 0 },
  { name: 'set 2 (tuned)', set: load(2), caught: 40, falseAlarms: 0 },
  { name: 'set 3 (blind)', set: load(3), caught: 32, falseAlarms: 2 },
];

const DEV_EMERGENCY = [
  "i suddenly can't see anything",
  "I can't see out of my right eye",
  'i lost my vision in one eye just now',
  "my face feels numb and i can't see properly",
  "I hit my head and now I can't see",
  "everything went black and i can't see",
  "i can't see, help me",
  "i think i'm having a stroke, i can't see",
  "i got bleach in my eyes and i can't see",
  'my vision went blurry and my arm is numb',
];

const DEV_EVERYDAY = [
  "I can't see.",
  "i can't see your text, it hasn't come through",
  "i can't see the screen",
  "i can't see what you mean",
  "the power went out and everything went dark, i can't see",
  "i can't see why that matters",
  "i can't see the menu without my glasses",
  "i can't see you on the video",
  "I can't see it in my inbox",
  "i can't see the point of the meeting",
];

const flag = (v: 'on' | 'off') => vi.stubEnv('CRISIS_SIGHT_NEEDS_CUE', v);
const isMedicalEmergency = (words: string) => detectCrisisSignals(words).medicalEmergency;

afterEach(() => vi.unstubAllEnvs());

describe('the prod line: "I can\'t see." about a text', () => {
  it('flag off (main): a medical emergency at severity 10, read as crisis_immediate', () => {
    flag('off');
    const signals = detectCrisisSignals("I can't see.");
    expect(signals.medicalEmergency).toBe(true);
    expect(signals.severity).toBe(10);
    expect(classifyEscalation(signals).type).toBe('crisis_immediate');
  });

  it('flag on: no signal at all, so no crisis is logged and no 911 note is built', () => {
    flag('on');
    const signals = detectCrisisSignals("I can't see.");
    expect(signals.medicalEmergency).toBe(false);
    expect(signals.severity).toBe(0);
    expect(classifyEscalation(signals).type).toBe('none');
  });
});

describe('flag on: the dev set', () => {
  it.each(DEV_EMERGENCY)('emergency: %s', (words) => {
    flag('on');
    expect(isMedicalEmergency(words)).toBe(true);
    expect(classifyEscalation(detectCrisisSignals(words)).type).toBe('crisis_immediate');
  });

  it.each(DEV_EVERYDAY)('everyday: %s', (words) => {
    flag('on');
    expect(isMedicalEmergency(words)).toBe(false);
  });
});

describe('the other medical reads are unchanged by the flag', () => {
  it.each([
    "i can't breathe",
    "i can't feel my left arm",
    "i'm having a stroke",
    "i'm having chest pain",
    "i'm bleeding",
  ])('%s', (words) => {
    for (const v of ['off', 'on'] as const) {
      flag(v);
      expect(isMedicalEmergency(words)).toBe(true);
    }
  });
});

describe.each(SETS)('held-out $name', ({ set, caught, falseAlarms }) => {
  const fired = (v: 'on' | 'off', lines: string[]) => {
    flag(v);
    return lines.filter(isMedicalEmergency);
  };

  it('flag on misses no emergency that main (flag off) catches', () => {
    const before = fired('off', set.emergency);
    const after = new Set(fired('on', set.emergency));
    expect(before.filter((line) => !after.has(line))).toEqual([]);
  });

  it('flag on: emergencies caught and false alarms stay at their measured counts', () => {
    expect(fired('on', set.emergency).length).toBeGreaterThanOrEqual(caught);
    expect(fired('on', set.everyday).length).toBeLessThanOrEqual(falseAlarms);
    // main fired on most everyday lines: the false alarms the flag removes
    expect(fired('off', set.everyday).length).toBeGreaterThan(falseAlarms);
  });
});

describe('sightEmergency reads lower-cased words', () => {
  it('a dark room is not sight loss; the same words with a stroke sign are', () => {
    expect(sightEmergency("the lights went out and everything went dark, i can't see")).toBe(false);
    expect(sightEmergency("everything went dark and my face is drooping, i can't see")).toBe(true);
  });
});
