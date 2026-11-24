/**
 * The own-crisis raises as a whole (crisis-own-raises.ts): with every set in the list on, a line
 * that already reads imminent, with 911 first for someone else, keeps that read. A set added to the
 * list is covered here without a new row. All lines are fictional.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { detectCrisis } from '../crisis-guard.js';
import { CALL_911_FOR_THEM, EMERGENCY_FOR_THEM } from '../crisis-guard-replies.js';
import { guideLineOf } from '../crisis-guided-line-floor.js';
import { OWN_RAISES } from '../crisis-own-raises.js';

/** Someone down and not breathing, alone and beside the caller's own words in each language. */
const FOR_THEM_FIRST = [
  'my dad collapsed and he is not breathing',
  'my dad collapsed and he is not breathing. i just took 40 pills',
  'my dad collapsed and he is not breathing. ya me tomé 40 pastillas',
  'my dad collapsed and he is not breathing. estoy en el puente y voy a saltar',
  'my mom passed out and she is not breathing, tengo la pistola en la mano',
];

const paragraphs = (script?: string): string[] => (script ?? '').split('\n\n').filter(Boolean);
/** The staying line forThemFirst gives up when the caller's own reply follows the 911 for them. */
const STAYING = paragraphs(EMERGENCY_FOR_THEM).filter((p) => !CALL_911_FOR_THEM.includes(p));

const every = Object.fromEntries(OWN_RAISES.map((raise) => [raise.flag, 'on']));
const none = Object.fromEntries(OWN_RAISES.map((raise) => [raise.flag, 'off']));
const read = (line: string, env: Record<string, string>) => {
  vi.unstubAllEnvs();
  for (const [flag, value] of Object.entries(env)) vi.stubEnv(flag, value);
  const crisis = detectCrisis(line);
  return { crisis, guide: guideLineOf(crisis, false, line) };
};

afterEach(() => vi.unstubAllEnvs());

describe('every own-crisis raise in the list', () => {
  it('is read behind its own off flag', () => {
    expect(OWN_RAISES.length).toBeGreaterThan(0);
    for (const raise of OWN_RAISES) expect(raise.flag).toMatch(/^CRISIS_[A-Z0-9_]+$/);
  });

  it('raises the lines that carry the caller own words, so the row below is not vacuous', () => {
    const raised = FOR_THEM_FIRST.filter(
      (line) => !read(line, none).crisis.indicators.includes('explicit_crisis_language')
    ).filter((line) => read(line, every).crisis.indicators.includes('explicit_crisis_language'));
    expect(raised.length).toBeGreaterThanOrEqual(3);
  });

  it.each(FOR_THEM_FIRST)(
    '"%s" leads with 911 for them only beside third_party_emergency',
    (line) => {
      // The classifier's someone-down raise refuses a read with this tag, so 911 for them never
      // leads twice (crisis-classifier-verdict.ts readsSomeoneElseInDanger).
      const on = read(line, every).crisis;
      expect(paragraphs(on.suggestedResponse)[0]).toBe(paragraphs(CALL_911_FOR_THEM)[0]);
      expect(on.indicators).toContain('third_party_emergency');
    }
  );

  it.each(FOR_THEM_FIRST)('never lowers "%s", already 911 first for them', (line) => {
    const off = read(line, none);
    expect(off.crisis.indicators).toEqual(
      expect.arrayContaining(['imminent_danger', 'third_party_emergency'])
    );
    expect(off.guide?.urgent).toBe(true);
    const on = read(line, every);
    expect(on.crisis.isCrisis).toBe(true);
    expect(on.crisis.severity).toBeGreaterThanOrEqual(off.crisis.severity);
    expect(on.crisis.indicators).toEqual(expect.arrayContaining(off.crisis.indicators));
    expect(on.guide?.urgent).toBe(true);
    // The 911 for them still leads the reply.
    const forThem = paragraphs(CALL_911_FOR_THEM);
    expect(paragraphs(on.crisis.suggestedResponse).slice(0, forThem.length)).toEqual(forThem);
    // Someone else's read stays someone else's, unless the caller's own words made it theirs too:
    // then the caller's own reply follows the 911 for them in place of the staying line, as the
    // English twin's does (forThemFirst).
    const ownToo = off.crisis.subject !== 'self' && on.crisis.subject === 'self';
    if (!ownToo) expect(on.crisis.subject).toBe(off.crisis.subject);
    for (const part of paragraphs(off.crisis.suggestedResponse)) {
      if (ownToo && STAYING.includes(part)) continue;
      expect(on.crisis.suggestedResponse, line).toContain(part);
    }
  });
});
