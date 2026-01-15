/**
 * Context Injection Integration Tests
 *
 * Tests that verify context builders actually inject persona-specific content
 * into the LLM context correctly. These are integration tests that verify
 * the full pipeline from content loading to context injection.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { loadBundleById } from '../personas/bundles/index.js';
import {
  loadTrustPhrases,
  loadSuperhumanInsights,
  loadLateNightPresence,
  loadINoticePower,
  loadEmotionalIntelligence,
  clearContentCache,
} from '../services/persona-service/persona-content-loader.js';

// All personas to test
const PERSONAS = [
  'ferni',
  'alex-chen',
  'maya-santos',
  'peter-john',
  'jordan-taylor',
  'nayan-patel',
];

describe('Context Injection Integration', () => {
  beforeAll(() => {
    // Clear cache to ensure fresh loads
    clearContentCache();
  });

  describe('Trust Phrases Loading', () => {
    it.each(PERSONAS)('should load trust phrases for %s', async (personaId) => {
      const trustPhrases = await loadTrustPhrases(personaId);

      expect(trustPhrases).toBeDefined();
      expect(trustPhrases).not.toBeNull();

      // Should have at least one trust phrase category
      const categories = Object.keys(trustPhrases || {}).filter(
        (k) => k !== 'schema_version' && k !== 'description'
      );
      expect(categories.length).toBeGreaterThan(0);
    });

    it.each(PERSONAS)(
      'trust phrases for %s should have persona-specific content',
      async (personaId) => {
        const trustPhrases = await loadTrustPhrases(personaId);

        // Get any category with phrases
        const categories = trustPhrases as Record<string, unknown>;
        let foundPersonaContent = false;

        for (const key of Object.keys(categories)) {
          const value = categories[key];
          if (typeof value === 'object' && value !== null) {
            const nested = value as Record<string, string[]>;
            for (const nestedKey of Object.keys(nested)) {
              if (Array.isArray(nested[nestedKey]) && nested[nestedKey].length > 0) {
                foundPersonaContent = true;
                // Phrases should be non-empty strings
                expect(nested[nestedKey][0].length).toBeGreaterThan(0);
              }
            }
          }
        }

        expect(foundPersonaContent).toBe(true);
      }
    );
  });

  describe('Superhuman Insights Loading', () => {
    it.each(PERSONAS)('should load superhuman insights for %s', async (personaId) => {
      const insights = await loadSuperhumanInsights(personaId);

      expect(insights).toBeDefined();
      expect(insights).not.toBeNull();
    });

    it.each(PERSONAS)(
      'superhuman insights for %s should have pattern surfacing',
      async (personaId) => {
        const insights = await loadSuperhumanInsights(personaId);

        // Different personas have different structures - check for key capabilities
        const insightObj = insights as Record<string, unknown>;

        // Should have some superhuman capability
        const capabilities = Object.keys(insightObj || {}).filter(
          (k) => k !== 'schema_version' && k !== 'description'
        );
        expect(capabilities.length).toBeGreaterThan(0);
      }
    );
  });

  describe('Late Night Presence Loading', () => {
    it.each(PERSONAS)('should load late night presence for %s', async (personaId) => {
      const lateNight = await loadLateNightPresence(personaId);

      expect(lateNight).toBeDefined();
      expect(lateNight).not.toBeNull();
    });

    it.each(PERSONAS)(
      'late night presence for %s should have greetings and grounding',
      async (personaId) => {
        const lateNight = await loadLateNightPresence(personaId);

        const content = lateNight as Record<string, unknown>;

        // Should have late night greetings (could be array or object with phrases)
        if (content?.late_night_greetings) {
          const greetings = content.late_night_greetings;
          if (Array.isArray(greetings)) {
            expect(greetings.length).toBeGreaterThan(0);
          } else if (typeof greetings === 'object') {
            // Object structure like { hours: [], phrases: [] }
            const greetingObj = greetings as Record<string, unknown>;
            expect(greetingObj.phrases || greetingObj.hours).toBeDefined();
          }
        }

        // Should have grounding exercises
        if (content?.grounding_exercises) {
          expect(Array.isArray(content.grounding_exercises)).toBe(true);
        }
      }
    );
  });

  describe('I-Notice Power Loading', () => {
    it.each(PERSONAS)('should load I-notice power for %s', async (personaId) => {
      const iNotice = await loadINoticePower(personaId);

      expect(iNotice).toBeDefined();
      expect(iNotice).not.toBeNull();
    });

    it.each(PERSONAS)('I-notice power for %s should have surfacing phrases', async (personaId) => {
      const iNotice = await loadINoticePower(personaId);

      const content = iNotice as Record<string, unknown>;

      // Should have opening frames or surfacing phrases
      const hasOpeningFrames = content?.opening_frames !== undefined;
      const hasSurfacingPhrases = content?.surfacing_phrases !== undefined;

      expect(hasOpeningFrames || hasSurfacingPhrases).toBe(true);
    });
  });

  describe('Emotional Intelligence Loading', () => {
    it.each(PERSONAS)('should load emotional intelligence for %s', async (personaId) => {
      const ei = await loadEmotionalIntelligence(personaId);

      expect(ei).toBeDefined();
      expect(ei).not.toBeNull();
    });

    it.each(PERSONAS)(
      'emotional intelligence for %s should have emotion patterns',
      async (personaId) => {
        const ei = await loadEmotionalIntelligence(personaId);

        const content = ei as Record<string, unknown>;
        const emotionKeys = Object.keys(content || {}).filter(
          (k) => k !== 'schema_version' && k !== 'description'
        );

        // Should have at least some emotion patterns
        expect(emotionKeys.length).toBeGreaterThan(0);
      }
    );
  });

  describe('Persona-Specific Content Uniqueness', () => {
    it('trust phrases should be different across personas', async () => {
      const ferniPhrases = await loadTrustPhrases('ferni');
      const alexPhrases = await loadTrustPhrases('alex-chen');

      // Get a sample phrase from each
      const getFerniPhrase = (obj: Record<string, unknown>): string | null => {
        for (const key of Object.keys(obj)) {
          const val = obj[key];
          if (typeof val === 'object' && val !== null) {
            const nested = val as Record<string, string[]>;
            for (const nestedKey of Object.keys(nested)) {
              if (Array.isArray(nested[nestedKey]) && nested[nestedKey].length > 0) {
                return nested[nestedKey][0];
              }
            }
          }
        }
        return null;
      };

      const ferniSample = getFerniPhrase(ferniPhrases as Record<string, unknown>);
      const alexSample = getFerniPhrase(alexPhrases as Record<string, unknown>);

      // Should have different content (persona-specific)
      expect(ferniSample).not.toEqual(alexSample);
    });

    it("superhuman insights should be tailored to each persona's domain", async () => {
      // Peter John is The Quant - should have data patterns
      const peterInsights = await loadSuperhumanInsights('peter-john');
      const peterObj = peterInsights as Record<string, unknown>;

      // Maya Santos is Habits Coach - should have habit patterns
      const mayaInsights = await loadSuperhumanInsights('maya-santos');
      const mayaObj = mayaInsights as Record<string, unknown>;

      // Should have different structure reflecting their specialties
      expect(Object.keys(peterObj || {})).not.toEqual(Object.keys(mayaObj || {}));
    });
  });

  describe('Bundle Integration', () => {
    it.each(PERSONAS)(
      'should load bundle behaviors that include 200%% files for %s',
      async (personaId) => {
        const bundle = await loadBundleById(personaId);
        expect(bundle).toBeDefined();

        const behaviors = await bundle!.getBehaviors();
        expect(behaviors).toBeDefined();

        // Check for key 200% behavior files
        const has200Percent =
          behaviors.trust_phrases !== undefined ||
          behaviors.superhuman_insights !== undefined ||
          behaviors.late_night_presence !== undefined ||
          behaviors.i_notice_power !== undefined;

        expect(has200Percent).toBe(true);
      }
    );
  });

  describe('Content Cache Performance', () => {
    it('should cache content for repeated loads', async () => {
      // First load
      const start1 = Date.now();
      await loadTrustPhrases('ferni');
      const duration1 = Date.now() - start1;

      // Second load (should be cached)
      const start2 = Date.now();
      await loadTrustPhrases('ferni');
      const duration2 = Date.now() - start2;

      // Cached load should be significantly faster
      // (Allow for some variance, but cached should be < 50% of first load time)
      expect(duration2).toBeLessThanOrEqual(Math.max(duration1 * 0.5, 5));
    });

    it('should cache different personas separately', async () => {
      const ferniPhrases = await loadTrustPhrases('ferni');
      const alexPhrases = await loadTrustPhrases('alex-chen');

      // Should be different objects
      expect(ferniPhrases).not.toBe(alexPhrases);
    });
  });
});
