/**
 * assessSafety added 988 (CRISIS_RESOURCES.general) only for the suicidal and
 * self-harm lists, and for 3+ concerning words without a crisis phrase. A
 * crisis phrase from the violence, abuse or eating lists carried none. With
 * SAFETY_WHOLE_WORD_SITES=on, spoken spellings ("wanna hurt", "hitsme") are
 * caught, so a line main read as urgent WITH 988 became crisis WITHOUT it.
 * Now every crisis-level or 3+-concern assessment includes 988, whatever the
 * category; that fixes main for the listed spellings too.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  CRISIS_RESOURCES,
  assessSafety,
  getCrisisResponse,
} from '../../../tools/domains/life-coaching-shared/safety-guards.js';

afterEach(() => {
  vi.unstubAllEnvs();
});
const flag = (v: 'on' | 'off' | 'shadow') => vi.stubEnv('SAFETY_WHOLE_WORD_SITES', v);
const has988 = (line: string) => {
  const a = assessSafety(line);
  return (
    (a.resources ?? []).includes(CRISIS_RESOURCES.general) && getCrisisResponse(a).includes('988')
  );
};

const REPROS = [
  'im hopeless and trapped and numb, wanna hurt',
  'im hopeless and trapped and numb, he hitsme',
];

describe('spoken spellings that only flag-on reads as crisis keep 988', () => {
  it.each(REPROS)('off: %j is urgent with 988, as on main', (line) => {
    flag('off');
    expect(assessSafety(line).level).toBe('urgent');
    expect(has988(line)).toBe(true);
  });
  it.each(REPROS)('on: %j is crisis, and still has 988', (line) => {
    flag('on');
    expect(assessSafety(line).level).toBe('crisis');
    expect(has988(line)).toBe(true);
  });
  it('shadow: decides as off where on differs', () => {
    flag('shadow');
    for (const line of REPROS) expect(assessSafety(line).level).toBe('urgent');
  });
});

describe('every crisis-level assessment carries 988, whatever the category', () => {
  it.each([
    ['violence', 'i want to hurt them'],
    ['abuse', 'he hits me when he drinks'],
    ['eating', "i haven't eaten in days"],
    ['eating', 'laxatives again tonight'],
    ['suicidal', 'i want to die'],
  ])('%s: %j', (_category, line) => {
    for (const mode of ['off', 'on'] as const) {
      flag(mode);
      expect(assessSafety(line).level).toBe('crisis');
      expect(has988(line)).toBe(true);
    }
  });
  it('the category resource stays and 988 is not added twice', () => {
    flag('on');
    const resources = assessSafety('i want to die and he hits me').resources ?? [];
    expect(resources).toContain(CRISIS_RESOURCES.domesticViolence);
    expect(resources.filter((r) => r === CRISIS_RESOURCES.general)).toHaveLength(1);
  });
  it('fewer than 3 concerns and no crisis phrase: no 988 (check-in only)', () => {
    flag('on');
    expect(assessSafety('feeling numb and empty').resources).toEqual([]);
  });
});
