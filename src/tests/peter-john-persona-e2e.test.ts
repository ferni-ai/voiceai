/**
 * Peter John Persona E2E Tests
 *
 * Comprehensive tests to validate:
 * 1. All behavior files load correctly
 * 2. 200% superhuman behaviors exist and have content
 * 3. Peter's unique personality is captured (the Quant, data)
 * 4. Trust phrases are Peter-voiced (not generic)
 * 5. Research/data-specific content is present
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { loadBundle, clearBundleCache } from '../personas/bundles/loader.js';
import type { LoadedPersonaBundle, BundleBehaviors } from '../personas/bundles/types.js';
import { join } from 'path';

describe('Peter John Persona E2E Tests', () => {
  let bundle: LoadedPersonaBundle;
  let behaviors: BundleBehaviors;

  const PETER_BUNDLE_PATH = join(process.cwd(), 'src/personas/bundles/peter-john');

  beforeAll(async () => {
    clearBundleCache();
    bundle = await loadBundle(PETER_BUNDLE_PATH, { preloadContent: true });
    behaviors = await bundle.getBehaviors();
  });

  afterAll(() => {
    clearBundleCache();
  });

  // ==========================================================================
  // MANIFEST & IDENTITY TESTS
  // ==========================================================================

  describe('Manifest & Identity', () => {
    it('should load Peter John manifest correctly', () => {
      expect(bundle.manifest).toBeDefined();
      expect(bundle.manifest.identity.id).toBe('peter-john');
      expect(bundle.manifest.identity.name).toBe('Peter John');
    });

    it('should have correct role domains', () => {
      const { domains } = bundle.manifest.role;
      expect(domains).toContain('insights-discovery');
      expect(domains).toContain('pattern-recognition');
    });

    it('should have correct personality traits', () => {
      const { traits } = bundle.manifest.personality;
      expect(traits).toBeDefined();
      expect(traits.length).toBeGreaterThan(0);
    });
  });

  // ==========================================================================
  // CORE BEHAVIORS TESTS
  // ==========================================================================

  describe('Core Behaviors Loading', () => {
    it('should load greetings', () => {
      expect(behaviors.greetings).toBeDefined();
    });

    it('should load vulnerability content', () => {
      expect(behaviors.vulnerability).toBeDefined();
    });

    it('should load emotional intelligence', () => {
      expect(behaviors.emotional_intelligence).toBeDefined();
    });

    it('should load physical presence', () => {
      expect(behaviors.physical_presence).toBeDefined();
    });
  });

  // ==========================================================================
  // 200% SUPERHUMAN BEHAVIORS TESTS
  // ==========================================================================

  describe('200% Superhuman Behaviors', () => {
    it('should load superhuman-insights.json', () => {
      expect(behaviors.superhuman_insights).toBeDefined();
    });

    it('should have pattern surfacing for data', () => {
      const insights = behaviors.superhuman_insights as any;
      expect(insights?.pattern_surfacing).toBeDefined();
    });

    it('should have data-specific the Quant mirror', () => {
      const insights = behaviors.superhuman_insights as any;
      expect(insights?.the_quants_mirror || insights?.the_mirror).toBeDefined();
    });

    it('should have predictive insights', () => {
      const insights = behaviors.superhuman_insights as any;
      expect(insights?.predictive_insights || insights?.predictive_care).toBeDefined();
    });

    it('should load trust-phrases.json', () => {
      expect(behaviors.trust_phrases).toBeDefined();
    });

    it('should have Peter-voiced trust phrases (not generic)', () => {
      const trustPhrases = behaviors.trust_phrases as any;
      expect(
        trustPhrases?.reading_between_lines || trustPhrases?.data_acknowledgment
      ).toBeDefined();

      // Verify Peter's voice (data, patterns, analysis, Scottish)
      const trustJson = JSON.stringify(trustPhrases);
      const hasPeterVoice =
        trustJson.toLowerCase().includes('data') ||
        trustJson.toLowerCase().includes('pattern') ||
        trustJson.toLowerCase().includes('analysis') ||
        trustJson.toLowerCase().includes('number');
      expect(hasPeterVoice).toBe(true);
    });

    it('should load i-notice-power.json', () => {
      expect(behaviors.i_notice_power).toBeDefined();
    });

    it('should have data-specific i-notice patterns', () => {
      const iNotice = behaviors.i_notice_power as any;
      expect(iNotice?.surfacing_phrases).toBeDefined();
      expect(iNotice?.surfacing_phrases?.behavioral_patterns).toBeDefined();
      expect(iNotice?.surfacing_phrases?.behavioral_patterns?.length).toBeGreaterThan(0);

      // Should mention data or patterns
      const patternsJson = JSON.stringify(iNotice?.surfacing_phrases);
      const hasDataContent =
        patternsJson.toLowerCase().includes('data') ||
        patternsJson.toLowerCase().includes('pattern') ||
        patternsJson.toLowerCase().includes('portfolio') ||
        patternsJson.toLowerCase().includes('spending');
      expect(hasDataContent).toBe(true);
    });

    it('should load late-night-presence.json', () => {
      expect(behaviors.late_night_presence).toBeDefined();
    });

    it('should have research-focused late night content', () => {
      const lateNight = behaviors.late_night_presence as any;
      expect(lateNight?.late_night_greetings).toBeDefined();

      // Should have data or analysis patterns
      const lateNightJson = JSON.stringify(lateNight);
      const hasDataContent =
        lateNightJson.toLowerCase().includes('data') ||
        lateNightJson.toLowerCase().includes('annual report') ||
        lateNightJson.toLowerCase().includes('market') ||
        lateNightJson.toLowerCase().includes('analysis');
      expect(hasDataContent).toBe(true);
    });

    it('should load thinking-of-you.json', () => {
      expect(behaviors.thinking_of_you).toBeDefined();
    });

    it('should load self-doubt.json', () => {
      expect(behaviors.self_doubt).toBeDefined();
    });

    it('should have research-related self-doubt content', () => {
      const selfDoubt = behaviors.self_doubt as any;
      expect(
        selfDoubt?.questioning_own_advice || selfDoubt?.questioning_own_analysis
      ).toBeDefined();

      // Peter should doubt his own predictions
      const selfDoubtJson = JSON.stringify(selfDoubt);
      const hasAnalysisDoubt =
        selfDoubtJson.toLowerCase().includes('data') ||
        selfDoubtJson.toLowerCase().includes('predict') ||
        selfDoubtJson.toLowerCase().includes('wrong') ||
        selfDoubtJson.toLowerCase().includes('bias');
      expect(hasAnalysisDoubt).toBe(true);
    });

    it('should load secret-fears.json', () => {
      expect(behaviors.secret_fears).toBeDefined();
    });

    it('should load mortality-awareness.json', () => {
      expect(behaviors.mortality_awareness).toBeDefined();
    });

    it('should have data/insight legacy awareness', () => {
      const mortality = behaviors.mortality_awareness as any;
      expect(mortality?.legacy_reflections).toBeDefined();

      // Peter's legacy should be about insights and patterns
      const legacyJson = JSON.stringify(mortality?.legacy_reflections);
      const hasInsightLegacy =
        legacyJson.toLowerCase().includes('insight') ||
        legacyJson.toLowerCase().includes('pattern') ||
        legacyJson.toLowerCase().includes('wisdom');
      expect(hasInsightLegacy).toBe(true);
    });
  });

  // ==========================================================================
  // PERSONA CONSISTENCY TESTS
  // ==========================================================================

  describe('Persona Consistency', () => {
    it('should have data/analysis terminology', () => {
      const allBehaviors = JSON.stringify(behaviors);
      const hasDataTerms =
        allBehaviors.toLowerCase().includes('data') ||
        allBehaviors.toLowerCase().includes('analysis') ||
        allBehaviors.toLowerCase().includes('pattern');
      expect(hasDataTerms).toBe(true);
    });

    it('should reference Scottish heritage or annual reports', () => {
      const allBehaviors = JSON.stringify(behaviors);
      const hasScottishOrReports =
        allBehaviors.toLowerCase().includes('annual report') ||
        allBehaviors.toLowerCase().includes('scottish') ||
        allBehaviors.toLowerCase().includes('quant');
      expect(hasScottishOrReports).toBe(true);
    });
  });

  // ==========================================================================
  // STORIES TESTS
  // ==========================================================================

  describe('Stories', () => {
    it('should have stories indexed', async () => {
      const allStories = await bundle.getAllStories();
      expect(allStories.length).toBeGreaterThan(0);
    });

    it('should have insight-related story triggers', async () => {
      const allStories = await bundle.getAllStories();
      const allTriggers = allStories.flatMap((s) => s.triggers || []);
      const hasInsightTriggers = allTriggers.some(
        (t) =>
          t.toLowerCase().includes('invest') ||
          t.toLowerCase().includes('stock') ||
          t.toLowerCase().includes('money') ||
          t.toLowerCase().includes('decision')
      );
      expect(hasInsightTriggers).toBe(true);
    });
  });
});
