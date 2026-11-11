/**
 * The guided-reply variants (guided-reply.ts): built from production strings
 * only, the 988 paragraph kept in every one, some ending in a direct safety
 * check-in, and a stable pick per turn.
 */
import { describe, expect, it } from 'vitest';

import { applyClassifierVerdict, detectCrisis } from '../../../src/agents/safety/crisis-guard.js';
import { SCREEN_QUESTION } from '../../../src/services/safety/crisis-grounded-screen.js';
import { guidedReplyFor, guidedVariants } from '../guided-reply.js';

const guided =
  applyClassifierVerdict(detectCrisis('okay'), { risk: 'crisis', subject: 'self' })
    .suggestedResponse ?? '';

describe('guidedVariants', () => {
  it('keeps the guard text first and the 988 paragraph in every variant', () => {
    const variants = guidedVariants(guided);
    expect(variants[0]).toBe(guided);
    expect(variants.length).toBeGreaterThanOrEqual(4);
    for (const v of variants) expect(v).toMatch(/988/);
  });

  it('ends variants in the production safety check-ins and the screen question', () => {
    const endings = guidedVariants(guided).map((v) => v.split('\n\n').at(-1));
    expect(endings).toContain('Are you somewhere safe right now?');
    expect(endings).toContain(SCREEN_QUESTION);
  });
});

describe('guidedReplyFor', () => {
  it('picks the same variant for the same turn, and more than one across turns', () => {
    expect(guidedReplyFor(guided, 'call-1#2')).toBe(guidedReplyFor(guided, 'call-1#2'));
    const picks = new Set(Array.from({ length: 20 }, (_, i) => guidedReplyFor(guided, `c#${i}`)));
    expect(picks.size).toBeGreaterThan(1);
  });
});
