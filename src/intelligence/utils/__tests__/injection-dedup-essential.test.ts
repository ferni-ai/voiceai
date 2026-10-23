/**
 * At the emergency escalation level the turn carries `safety` (99,
 * "[ESCALATION AWARENESS] ... crisis support NOW") and `crisis_response` (98,
 * "[CRISIS SUPPORT] Validate first ... Resource: 988"). Both say "crisis", so
 * the dedup's keyword clusters called them duplicates and dropped
 * crisis_response: the validation line and the named resource never reached
 * the model. The dedup must never drop an essential category; only identical
 * content may collapse.
 */
import { describe, expect, it } from 'vitest';
import {
  DEDUP_PROTECTED_CATEGORIES,
  deduplicateInjections,
  ESSENTIAL_CATEGORIES,
  filterInjections,
} from '../injection-filter.js';

const SAFETY = {
  category: 'safety',
  priority: 99,
  content:
    '[ESCALATION AWARENESS]\n⚠️ PRIORITY: This person needs crisis support NOW.\n- Provide crisis resources immediately\n- Stay present and connected\n- Do not minimize or redirect',
};
const CRISIS_RESPONSE = {
  category: 'crisis_response',
  priority: 98,
  content:
    '[CRISIS SUPPORT]\nValidate first: "That sounds so heavy."\nResource if appropriate: 988 Suicide & Crisis Lifeline',
};

describe('deduplicateInjections keeps essential categories', () => {
  it('keeps crisis_response beside safety at the emergency level', () => {
    const kept = deduplicateInjections([SAFETY, CRISIS_RESPONSE]);
    expect(kept.map((i) => i.category)).toEqual(['safety', 'crisis_response']);
    expect(kept.map((i) => i.content).join('\n')).toContain('988');
  });

  it('still reaches the prompt through the crisis filter', () => {
    const out = filterInjections(deduplicateInjections([SAFETY, CRISIS_RESPONSE]), {
      mode: 'crisis',
    });
    expect(out.map((i) => i.category)).toContain('crisis_response');
  });

  it('keeps two different injections of one essential category', () => {
    const second = { ...SAFETY, priority: 97, content: '[SAFETY] Ask directly about safety.' };
    expect(deduplicateInjections([SAFETY, second])).toHaveLength(2);
  });

  it('collapses an essential injection only when its content is identical', () => {
    expect(deduplicateInjections([SAFETY, { ...SAFETY, priority: 50 }])).toEqual([SAFETY]);
  });

  it('protects every filter essential and the named crisis categories', () => {
    for (const c of ESSENTIAL_CATEGORIES) expect(DEDUP_PROTECTED_CATEGORIES.has(c)).toBe(true);
    for (const c of ['safety_soft_check', 'emotional_guidance', 'unsaid']) {
      expect(DEDUP_PROTECTED_CATEGORIES.has(c)).toBe(true);
    }
  });

  it('still drops a non-essential near-duplicate', () => {
    const a = { category: 'coaching', priority: 40, content: 'Keep it brief and concise.' };
    const b = { category: 'pacing', priority: 30, content: 'Be brief, short answers.' };
    expect(deduplicateInjections([a, b]).map((i) => i.category)).toEqual(['coaching']);
  });
});
