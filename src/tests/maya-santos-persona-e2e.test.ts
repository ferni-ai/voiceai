/**
 * Maya Santos Persona E2E Tests
 *
 * Comprehensive tests to validate:
 * 1. All behavior files load correctly
 * 2. 200% superhuman behaviors exist and have content
 * 3. Maya's unique personality is captured (glidepath, habits)
 * 4. Trust phrases are Maya-voiced (not generic)
 * 5. Habit-specific content is present
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { loadBundle, clearBundleCache } from '../personas/bundles/loader.js';
import type { LoadedPersonaBundle, BundleBehaviors } from '../personas/bundles/types.js';
import { join } from 'path';

describe('Maya Santos Persona E2E Tests', () => {
  let bundle: LoadedPersonaBundle;
  let behaviors: BundleBehaviors;

  const MAYA_BUNDLE_PATH = join(process.cwd(), 'src/personas/bundles/maya-santos');

  beforeAll(async () => {
    clearBundleCache();
    bundle = await loadBundle(MAYA_BUNDLE_PATH, { preloadContent: true });
    behaviors = await bundle.getBehaviors();
  });

  afterAll(() => {
    clearBundleCache();
  });

  // ==========================================================================
  // MANIFEST & IDENTITY TESTS
  // ==========================================================================

  describe('Manifest & Identity', () => {
    it('should load Maya Santos manifest correctly', () => {
      expect(bundle.manifest).toBeDefined();
      expect(bundle.manifest.identity.id).toBe('maya-santos');
      expect(bundle.manifest.identity.name).toBe('Maya Santos');
    });

    it('should have correct role domains', () => {
      const { domains } = bundle.manifest.role;
      expect(domains).toContain('habit-tracking');
      expect(domains).toContain('morning-routines');
      expect(domains).toContain('self-care');
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

    it('should have pattern surfacing for habits', () => {
      const insights = behaviors.superhuman_insights as any;
      expect(insights?.pattern_surfacing).toBeDefined();
      expect(insights?.pattern_surfacing?.habit_patterns).toBeDefined();
      expect(insights?.pattern_surfacing?.habit_patterns?.length).toBeGreaterThan(0);
    });

    it('should have habit-specific the mirror', () => {
      const insights = behaviors.superhuman_insights as any;
      expect(insights?.the_mirror).toBeDefined();
    });

    it('should have predictive care for habit plateaus', () => {
      const insights = behaviors.superhuman_insights as any;
      expect(insights?.predictive_care).toBeDefined();
    });

    it('should load trust-phrases.json', () => {
      expect(behaviors.trust_phrases).toBeDefined();
    });

    it('should have Maya-voiced trust phrases (not generic)', () => {
      const trustPhrases = behaviors.trust_phrases as any;
      expect(trustPhrases?.reading_between_lines).toBeDefined();

      // Verify Maya's voice (glidepath, kindness, habits)
      const trustJson = JSON.stringify(trustPhrases);
      const hasMayaVoice =
        trustJson.includes('glidepath') ||
        trustJson.includes('kindness') ||
        trustJson.includes('habit') ||
        trustJson.includes('routine');
      expect(hasMayaVoice).toBe(true);
    });

    it('should load i-notice-power.json', () => {
      expect(behaviors.i_notice_power).toBeDefined();
    });

    it('should have habit-specific i-notice patterns', () => {
      const iNotice = behaviors.i_notice_power as any;
      expect(iNotice?.surfacing_phrases).toBeDefined();
      expect(iNotice?.surfacing_phrases?.habit_patterns).toBeDefined();
      expect(iNotice?.surfacing_phrases?.habit_patterns?.length).toBeGreaterThan(0);

      // Should mention habits or routines
      const patternsJson = JSON.stringify(iNotice?.surfacing_phrases);
      const hasHabitContent =
        patternsJson.toLowerCase().includes('habit') ||
        patternsJson.toLowerCase().includes('routine') ||
        patternsJson.toLowerCase().includes('consistent') ||
        patternsJson.toLowerCase().includes('skip');
      expect(hasHabitContent).toBe(true);
    });

    it('should load late-night-presence.json', () => {
      expect(behaviors.late_night_presence).toBeDefined();
    });

    it('should have habit-focused late night content', () => {
      const lateNight = behaviors.late_night_presence as any;
      expect(lateNight?.late_night_greetings).toBeDefined();
      expect(lateNight?.cant_sleep_patterns).toBeDefined();

      // Should have habit-guilt or routine patterns
      const lateNightJson = JSON.stringify(lateNight);
      const hasHabitGuildContent =
        lateNightJson.toLowerCase().includes('habit') ||
        lateNightJson.toLowerCase().includes('guilt') ||
        lateNightJson.toLowerCase().includes('glidepath');
      expect(hasHabitGuildContent).toBe(true);
    });

    it('should load thinking-of-you.json', () => {
      expect(behaviors.thinking_of_you).toBeDefined();
    });

    it('should load self-doubt.json', () => {
      expect(behaviors.self_doubt).toBeDefined();
    });

    it('should have habit-related self-doubt content', () => {
      const selfDoubt = behaviors.self_doubt as any;
      expect(selfDoubt?.questioning_own_advice).toBeDefined();

      // Maya should doubt her own habit practices
      const selfDoubtJson = JSON.stringify(selfDoubt);
      const hasHabitDoubt =
        selfDoubtJson.toLowerCase().includes('habit') ||
        selfDoubtJson.toLowerCase().includes('system') ||
        selfDoubtJson.toLowerCase().includes('practice');
      expect(hasHabitDoubt).toBe(true);
    });

    it('should load secret-fears.json', () => {
      expect(behaviors.secret_fears).toBeDefined();
    });

    it('should load mortality-awareness.json', () => {
      expect(behaviors.mortality_awareness).toBeDefined();
    });

    it('should have habit/routine legacy awareness', () => {
      const mortality = behaviors.mortality_awareness as any;
      expect(mortality?.legacy_reflections).toBeDefined();

      // Maya's legacy should be about habits and small changes
      const legacyJson = JSON.stringify(mortality?.legacy_reflections);
      const hasHabitLegacy =
        legacyJson.toLowerCase().includes('habit') ||
        legacyJson.toLowerCase().includes('compound') ||
        legacyJson.toLowerCase().includes('small');
      expect(hasHabitLegacy).toBe(true);
    });
  });

  // ==========================================================================
  // PERSONA CONSISTENCY TESTS
  // ==========================================================================

  describe('Persona Consistency', () => {
    it('should have glidepath references', () => {
      const allBehaviors = JSON.stringify(behaviors);
      const hasGlidepath = allBehaviors.toLowerCase().includes('glidepath');
      expect(hasGlidepath).toBe(true);
    });

    it('should reference habit/routine terminology', () => {
      const allBehaviors = JSON.stringify(behaviors);
      const hasHabitTerms =
        allBehaviors.toLowerCase().includes('habit') ||
        allBehaviors.toLowerCase().includes('routine') ||
        allBehaviors.toLowerCase().includes('streak');
      expect(hasHabitTerms).toBe(true);
    });

    it('should have kindness-focused language', () => {
      const allBehaviors = JSON.stringify(behaviors);
      const hasKindness =
        allBehaviors.toLowerCase().includes('kindness') ||
        allBehaviors.toLowerCase().includes('gentle') ||
        allBehaviors.toLowerCase().includes('compassion');
      expect(hasKindness).toBe(true);
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

    it('should have habit-related story triggers', async () => {
      const allStories = await bundle.getAllStories();
      const allTriggers = allStories.flatMap((s) => s.triggers || []);
      const hasHabitTriggers = allTriggers.some(
        (t) =>
          t.toLowerCase().includes('habit') ||
          t.toLowerCase().includes('routine') ||
          t.toLowerCase().includes('morning')
      );
      expect(hasHabitTriggers).toBe(true);
    });
  });
});
