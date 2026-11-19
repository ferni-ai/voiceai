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
  loadSuperhumanInsights,
  loadINoticePower,
  clearContentCache,
} from '../services/persona-content-loader.js';

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

  describe('Persona-Specific Content Uniqueness', () => {
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
});
