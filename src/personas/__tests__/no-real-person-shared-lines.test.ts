/**
 * No real person in shared persona lines.
 *
 * The personas have fictional lives (Peter's wife is Diane, Nayan's is Leela,
 * the index elder is Henry Caldwell, the economist is Nate Holloway). Shared
 * line banks outside the bundles used to make them speak as real people
 * (Carolyn, Magellan, Isha, "Bogle's Folly"...). This walks the real exported
 * data and fails if any of those identifiers come back.
 */

import { describe, expect, it } from 'vitest';

import { GENTLE_HUMOR, GENTLE_OBSERVATIONS, MICRO_STORIES } from '../meaningful-silence/content.js';
import { HANDOFF_WARMTH, TEAM_MENTIONS, TEAM_OPINIONS } from '../shared/team-dynamics.js';
import { PERSONA_BUILDING_BLOCKS } from '../shared/persona-building-blocks.js';
import { cognitiveProfiles } from '../cognitive-profiles.js';
import { personaCognitiveQuirks } from '../cognitive-quirks.js';
import { PETER_MOMENTS } from '../../personality/moments/peter-moments.js';
import { PERSONA_EVOLUTION_STORIES } from '../../services/team-engagement/evolution-stories.js';
import { personaFingerprints } from '../../services/evalops/persona-fingerprints.js';

const REAL_PERSON =
  /Carolyn|Magellan|Sadhguru|\bIsha\b|Chamundi|Adiyogi|Kailash|Mysore|motorcycle|Royal Enfield|Bogle|Dickson|Lynch|Wellington|Dunkin|Taco Bell|I founded Vanguard|at Vanguard|\bVanguard\b/i;

/** Collect every string value (and RegExp source) reachable from `value`. */
function collectStrings(value: unknown, out: string[] = [], seen = new Set<unknown>()): string[] {
  if (typeof value === 'string') {
    out.push(value);
  } else if (value instanceof RegExp) {
    out.push(value.source);
  } else if (value && typeof value === 'object' && !seen.has(value)) {
    seen.add(value);
    for (const v of Object.values(value)) collectStrings(v, out, seen);
  }
  return out;
}

const MODULES: Record<string, unknown> = {
  'meaningful-silence/content': { GENTLE_OBSERVATIONS, MICRO_STORIES, GENTLE_HUMOR },
  'shared/team-dynamics': { TEAM_OPINIONS, HANDOFF_WARMTH, TEAM_MENTIONS },
  'shared/persona-building-blocks': PERSONA_BUILDING_BLOCKS,
  'cognitive-profiles': cognitiveProfiles,
  'cognitive-quirks': personaCognitiveQuirks,
  'personality/moments/peter-moments': PETER_MOMENTS,
  'team-engagement/evolution-stories': PERSONA_EVOLUTION_STORIES,
  'evalops/persona-fingerprints': personaFingerprints,
};

describe('shared persona lines carry no real-person identity', () => {
  for (const [name, data] of Object.entries(MODULES)) {
    it(`${name} has no real-person identifiers`, () => {
      const strings = collectStrings(data);
      // Guard against a vacuous pass: the walker must actually reach content.
      expect(strings.length).toBeGreaterThan(10);
      const hits = strings.filter((s) => REAL_PERSON.test(s));
      expect(hits).toEqual([]);
    });
  }

  it('reads canon content, not empty stubs', () => {
    const all = collectStrings(MODULES).join('\n');
    expect(all).toMatch(/Diane/);
    expect(all).toMatch(/Nayan/);
    expect(all).toMatch(/grandmother/);
  });

  it('the denylist would catch the old lines', () => {
    expect(REAL_PERSON.test("Carolyn says I'm extra today.")).toBe(true);
    expect(REAL_PERSON.test("They called it 'Bogle's Folly.'")).toBe(true);
    expect(REAL_PERSON.test('I sat for seven years before founding Isha.')).toBe(true);
  });
});
