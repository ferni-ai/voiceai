/**
 * Cognitive Quirks Unit Tests
 *
 * Tests the cognitive quirks system that makes each persona
 * more human through:
 * - Unique thinking patterns
 * - Context-triggered quirks
 * - Transition phrases
 * - Cognitive mannerisms
 *
 * @module personas/__tests__/cognitive-quirks.test
 */

import { describe, expect, it } from 'vitest';
import {
  getCognitiveQuirks,
  getActiveQuirk,
  getTransitionPhrase,
  personaCognitiveQuirks,
  ferniQuirks,
  peterQuirks,
  alexQuirks,
  mayaQuirks,
  jordanQuirks,
  nayanQuirks,
} from '../cognitive-quirks.js';

describe('Cognitive Quirks', () => {
  describe('Quirks Loading', () => {
    it('should return quirks for all 6 personas', () => {
      const personaIds = [
        'ferni',
        'peter-john',
        'alex-chen',
        'maya-santos',
        'jordan-taylor',
        'nayan-patel',
      ];

      for (const personaId of personaIds) {
        const quirks = getCognitiveQuirks(personaId);
        expect(quirks, `Missing quirks for ${personaId}`).toBeDefined();
        expect(quirks?.quirks).toBeInstanceOf(Array);
      }
    });

    it('should return undefined for unknown persona', () => {
      const quirks = getCognitiveQuirks('unknown-persona');
      expect(quirks).toBeUndefined();
    });
  });

  describe('Quirk Structure Validation', () => {
    const allQuirks = [
      { name: 'Ferni', quirks: ferniQuirks },
      { name: 'Peter', quirks: peterQuirks },
      { name: 'Alex', quirks: alexQuirks },
      { name: 'Maya', quirks: mayaQuirks },
      { name: 'Jordan', quirks: jordanQuirks },
      { name: 'Nayan', quirks: nayanQuirks },
    ];

    it.each(allQuirks)('$name should have quirks array', ({ quirks }) => {
      expect(quirks.quirks).toBeInstanceOf(Array);
      expect(quirks.quirks.length).toBeGreaterThan(0);
    });

    it.each(allQuirks)('$name quirks should have required fields', ({ quirks }) => {
      for (const quirk of quirks.quirks) {
        expect(quirk.name).toBeDefined();
        expect(quirk.description).toBeDefined();
        expect(quirk.triggers).toBeInstanceOf(Array);
        expect(typeof quirk.frequency).toBe('number');
        expect(quirk.frequency).toBeGreaterThanOrEqual(0);
        expect(quirk.frequency).toBeLessThanOrEqual(1);
      }
    });

    it.each(allQuirks)('$name should have transition phrases', ({ quirks }) => {
      expect(quirks.transitionPhrases).toBeInstanceOf(Array);
      expect(quirks.transitionPhrases.length).toBeGreaterThan(0);
    });
  });

  describe('Active Quirk Detection', () => {
    it('should detect quirk when trigger word is present', () => {
      // Ferni has quirks triggered by certain words
      const ferniQuirkList = ferniQuirks.quirks;
      if (ferniQuirkList.length > 0) {
        const firstQuirk = ferniQuirkList[0];
        if (firstQuirk.triggers.length > 0) {
          const trigger = firstQuirk.triggers[0];
          // Note: getActiveQuirk has randomness, so we test multiple times
          let found = false;
          for (let i = 0; i < 20; i++) {
            const activeQuirk = getActiveQuirk('ferni', `This is about ${trigger}`);
            if (activeQuirk) {
              found = true;
              break;
            }
          }
          // With frequency < 1, we may not always get a quirk, but over 20 tries
          // we should see one if the trigger is valid
          expect(found || firstQuirk.frequency < 0.1).toBe(true);
        }
      }
    });

    it('should return null for text without triggers', () => {
      // Use completely unrelated text
      const quirk = getActiveQuirk('ferni', 'xyzzy foobar completely random nonsense');
      // Should be null most of the time (no triggers match)
      // We run this multiple times since there's randomness
      let nullCount = 0;
      for (let i = 0; i < 10; i++) {
        if (getActiveQuirk('ferni', 'xyzzy foobar random') === null) {
          nullCount++;
        }
      }
      expect(nullCount).toBeGreaterThan(5); // Most should be null
    });

    it('should return null for unknown persona', () => {
      const quirk = getActiveQuirk('unknown', 'any text');
      expect(quirk).toBeNull();
    });
  });

  describe('Transition Phrases', () => {
    it('should return transition phrase for all personas', () => {
      const personaIds = [
        'ferni',
        'peter-john',
        'alex-chen',
        'maya-santos',
        'jordan-taylor',
        'nayan-patel',
      ];

      for (const personaId of personaIds) {
        // getTransitionPhrase has randomness, try multiple times
        let found = false;
        for (let i = 0; i < 10; i++) {
          const phrase = getTransitionPhrase(personaId);
          if (phrase) {
            found = true;
            expect(typeof phrase).toBe('string');
            expect(phrase.length).toBeGreaterThan(0);
            break;
          }
        }
        // Should find at least one phrase
        expect(found).toBe(true);
      }
    });

    it('should return null for unknown persona', () => {
      const phrase = getTransitionPhrase('unknown');
      expect(phrase).toBeNull();
    });

    it('different personas should have different transition phrases', () => {
      // Collect phrases from each persona
      const ferniPhrases = new Set<string>();
      const peterPhrases = new Set<string>();

      for (let i = 0; i < 20; i++) {
        const ferniPhrase = getTransitionPhrase('ferni');
        const peterPhrase = getTransitionPhrase('peter-john');
        if (ferniPhrase) ferniPhrases.add(ferniPhrase);
        if (peterPhrase) peterPhrases.add(peterPhrase);
      }

      // Should have collected some phrases
      expect(ferniPhrases.size).toBeGreaterThan(0);
      expect(peterPhrases.size).toBeGreaterThan(0);

      // Phrases should be different (not all overlap)
      const overlap = [...ferniPhrases].filter((p) => peterPhrases.has(p));
      expect(overlap.length).toBeLessThan(ferniPhrases.size);
    });
  });

  describe('Quirk Uniqueness', () => {
    it('each persona should have unique quirks', () => {
      // Collect all quirk names per persona
      const ferniNames = new Set(ferniQuirks.quirks.map((q) => q.name));
      const peterNames = new Set(peterQuirks.quirks.map((q) => q.name));

      // Names should be unique within each persona
      expect(ferniNames.size).toBe(ferniQuirks.quirks.length);
      expect(peterNames.size).toBe(peterQuirks.quirks.length);

      // Names should be different between personas (at least some)
      const overlap = [...ferniNames].filter((name) => peterNames.has(name));
      expect(overlap.length).toBeLessThan(ferniNames.size);
    });
  });

  describe('Registry', () => {
    it('should have all 6 personas in registry', () => {
      expect(Object.keys(personaCognitiveQuirks)).toContain('ferni');
      expect(Object.keys(personaCognitiveQuirks)).toContain('peter-john');
      expect(Object.keys(personaCognitiveQuirks)).toContain('alex-chen');
      expect(Object.keys(personaCognitiveQuirks)).toContain('maya-santos');
      expect(Object.keys(personaCognitiveQuirks)).toContain('jordan-taylor');
      expect(Object.keys(personaCognitiveQuirks)).toContain('nayan-patel');
    });
  });
});
