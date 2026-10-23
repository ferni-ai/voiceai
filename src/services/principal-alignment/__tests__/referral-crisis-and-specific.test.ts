/**
 * analyzeReferralNeed took its resources from the single highest-confidence
 * trigger. A self-harm, abuse or eating trigger (0.9) outranks a matched
 * crisis-line trigger at 0.85, so "better off dead and he hits me" was
 * immediate but carried no 988, only the DV hotline. Now any immediate
 * (crisis-line) match carries the crisis line AND the best match's own
 * resources; urgency and target are unchanged, and a single trigger reads
 * exactly as before.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { analyzeReferralNeed } from '../human-referral.js';

afterEach(() => {
  vi.unstubAllEnvs();
});
const refer = (line: string) => analyzeReferralNeed(line, { userId: 'u' });
const types = (line: string) => refer(line).resources.map((r) => r.type);
const has988 = (line: string) => refer(line).resources.some((r) => r.phone === '988');

describe('an immediate match keeps 988 AND the specific hotline', () => {
  it('"better off dead and he hits me": 988 and the DV hotline', () => {
    const line = "i'd be better off dead and he hits me";
    expect(refer(line).urgency).toBe('immediate');
    expect(has988(line)).toBe(true);
    expect(types(line)).toContain('domestic_violence_hotline');
  });
  it('purging plus suicidality: 988 and the eating-disorder line', () => {
    const line = "i keep making myself throw up and there's no point anymore";
    expect(refer(line).urgency).toBe('immediate');
    expect(has988(line)).toBe(true);
    expect(types(line)).toContain('eating_disorder_specialist');
  });
  it('the crisis line is listed once, first', () => {
    const t = types('better off dead and he hits me');
    expect(t[0]).toBe('crisis_line');
    expect(new Set(refer('better off dead and he hits me').resources).size).toBe(t.length);
  });
});

describe('a single trigger reads exactly as before', () => {
  it.each([
    ['he hits me', ['domestic_violence_hotline']],
    ["i'm suicidal", ['crisis_line', 'crisis_line']],
    ["i haven't eaten in days", ['eating_disorder_specialist']],
    ['i have chest pain', ['doctor']],
  ])('%j', (line, expected) => {
    expect(types(line)).toEqual(expected);
  });
  it('no 988 without an immediate trigger', () => {
    for (const line of ['he hits me', "i'm cutting myself", "i haven't eaten in days"]) {
      expect(has988(line)).toBe(false);
    }
  });
});

// The displacement regression tests from the #2630 audit, restored here with
// the fix: a crisis phrase plus each co-occurring trigger, in three spacings,
// with the matcher off and on. With the matcher on (SAFETY_WHOLE_WORD_SITES,
// wired by #2630), odd spacings newly match the specific trigger.
describe('a crisis phrase plus another trigger never loses 988 or the specific line', () => {
  const CO: [string, string][] = [
    ['cut my arms', 'therapist'],
    ['he hits me', 'domestic_violence_hotline'],
    ["i'm cutting myself", 'therapist'],
    ['making myself throw up', 'eating_disorder_specialist'],
  ];
  const SPACES = [' ', '  ', ' '];
  it.each(CO)('"better off dead" plus %j, any spacing, off and on', (other, target) => {
    for (const mode of ['off', 'on'] as const) {
      vi.stubEnv('SAFETY_WHOLE_WORD_SITES', mode);
      for (const sp of SPACES) {
        for (const line of [
          `better off dead and ${other.replaceAll(' ', sp)}`,
          `${other.replaceAll(' ', sp)}, no point anymore`,
        ]) {
          const r = refer(line);
          expect(r.urgency).toBe('immediate');
          expect(r.resources.some((x) => x.phone === '988')).toBe(true);
          // Whatever the best match is, its own resources are kept.
          expect(r.resources.some((x) => x.type === r.suggestedTarget)).toBe(true);
          if (sp === ' ') expect(r.resources.map((x) => x.type)).toContain(target);
        }
      }
    }
  });
});
