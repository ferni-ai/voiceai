/**
 * Jordan Taylor Persona E2E Tests
 *
 * Comprehensive tests to validate:
 * 1. All behavior files load correctly
 * 2. 200% superhuman behaviors exist and have content
 * 3. Jordan's unique personality is captured (17 moves, Sam, joy journal)
 * 4. Trust phrases are Jordan-voiced (not generic)
 * 5. Event planning/transition-specific content is present
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { loadBundle, clearBundleCache } from '../personas/bundles/loader.js';
import type { LoadedPersonaBundle, BundleBehaviors } from '../personas/bundles/types.js';
import { join } from 'path';

describe('Jordan Taylor Persona E2E Tests', () => {
  let bundle: LoadedPersonaBundle;
  let behaviors: BundleBehaviors;

  const JORDAN_BUNDLE_PATH = join(process.cwd(), 'src/personas/bundles/jordan-taylor');

  beforeAll(async () => {
    clearBundleCache();
    bundle = await loadBundle(JORDAN_BUNDLE_PATH, { preloadContent: true });
    behaviors = await bundle.getBehaviors();
  });

  afterAll(() => {
    clearBundleCache();
  });

  // ==========================================================================
  // MANIFEST & IDENTITY TESTS
  // ==========================================================================

  describe('Manifest & Identity', () => {
    it('should load Jordan Taylor manifest correctly', () => {
      expect(bundle.manifest).toBeDefined();
      expect(bundle.manifest.identity.id).toBe('jordan-taylor');
      expect(bundle.manifest.identity.name).toBe('Jordan Taylor');
    });

    it('should have correct role domains', () => {
      const { domains } = bundle.manifest.role;
      expect(domains).toContain('event-planning');
      expect(domains).toContain('life-transitions');
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

    it('should load cultural moments (military brat)', () => {
      expect(behaviors.cultural_moments).toBeDefined();
    });
  });

  // ==========================================================================
  // 200% SUPERHUMAN BEHAVIORS TESTS
  // ==========================================================================

  describe('200% Superhuman Behaviors', () => {
    it('should load superhuman-insights.json', () => {
      expect(behaviors.superhuman_insights).toBeDefined();
    });

    it('should have pattern surfacing for life transitions', () => {
      const insights = behaviors.superhuman_insights as any;
      expect(insights?.pattern_surfacing).toBeDefined();
    });

    it('should have transition-specific the mirror', () => {
      const insights = behaviors.superhuman_insights as any;
      expect(insights?.the_mirror).toBeDefined();
    });

    it('should have predictive care for milestones', () => {
      const insights = behaviors.superhuman_insights as any;
      expect(insights?.predictive_care).toBeDefined();
    });

    it('should load trust-phrases.json', () => {
      expect(behaviors.trust_phrases).toBeDefined();
    });

    it('should have Jordan-voiced trust phrases (not generic)', () => {
      const trustPhrases = behaviors.trust_phrases as any;
      expect(
        trustPhrases?.reading_between_lines || trustPhrases?.transition_acknowledgment
      ).toBeDefined();

      // Verify Jordan's voice (transitions, milestones, joy)
      const trustJson = JSON.stringify(trustPhrases);
      const hasJordanVoice =
        trustJson.toLowerCase().includes('transition') ||
        trustJson.toLowerCase().includes('milestone') ||
        trustJson.toLowerCase().includes('joy') ||
        trustJson.toLowerCase().includes('celebration');
      expect(hasJordanVoice).toBe(true);
    });

    it('should load i-notice-power.json', () => {
      expect(behaviors.i_notice_power).toBeDefined();
    });

    it('should have transition-specific i-notice patterns', () => {
      const iNotice = behaviors.i_notice_power as any;
      expect(iNotice?.surfacing_phrases).toBeDefined();
      expect(iNotice?.surfacing_phrases?.transition_patterns).toBeDefined();
      expect(iNotice?.surfacing_phrases?.transition_patterns?.length).toBeGreaterThan(0);

      // Should mention transitions or life changes
      const patternsJson = JSON.stringify(iNotice?.surfacing_phrases);
      const hasTransitionContent =
        patternsJson.toLowerCase().includes('transition') ||
        patternsJson.toLowerCase().includes('beginning') ||
        patternsJson.toLowerCase().includes('ending') ||
        patternsJson.toLowerCase().includes('stability');
      expect(hasTransitionContent).toBe(true);
    });

    it('should load late-night-presence.json', () => {
      expect(behaviors.late_night_presence).toBeDefined();
    });

    it('should have planning-focused late night content', () => {
      const lateNight = behaviors.late_night_presence as any;
      expect(lateNight?.late_night_greetings).toBeDefined();

      // Should have military brat or transition patterns
      const lateNightJson = JSON.stringify(lateNight);
      const hasTransitionContent =
        lateNightJson.toLowerCase().includes('military') ||
        lateNightJson.toLowerCase().includes('move') ||
        lateNightJson.toLowerCase().includes('transition') ||
        lateNightJson.toLowerCase().includes('plan');
      expect(hasTransitionContent).toBe(true);
    });

    it('should load thinking-of-you.json', () => {
      expect(behaviors.thinking_of_you).toBeDefined();
    });

    it('should load self-doubt.json', () => {
      expect(behaviors.self_doubt).toBeDefined();
    });

    it('should have planning-related self-doubt content', () => {
      const selfDoubt = behaviors.self_doubt as any;
      expect(selfDoubt?.questioning_own_advice).toBeDefined();

      // Jordan should doubt her own planning vs. living her life
      const selfDoubtJson = JSON.stringify(selfDoubt);
      const hasPlanningDoubt =
        selfDoubtJson.toLowerCase().includes('plan') ||
        selfDoubtJson.toLowerCase().includes('celebration') ||
        selfDoubtJson.toLowerCase().includes('miss') ||
        selfDoubtJson.toLowerCase().includes('own');
      expect(hasPlanningDoubt).toBe(true);
    });

    it('should load secret-fears.json', () => {
      expect(behaviors.secret_fears).toBeDefined();
    });

    it('should have roots vs. movement fears', () => {
      const fears = behaviors.secret_fears as any;
      expect(fears?.personal_fears).toBeDefined();

      // Jordan should fear never putting down roots
      const fearsJson = JSON.stringify(fears?.personal_fears);
      const hasRootsFear =
        fearsJson.toLowerCase().includes('roots') ||
        fearsJson.toLowerCase().includes('stay') ||
        fearsJson.toLowerCase().includes('move') ||
        fearsJson.toLowerCase().includes('sam');
      expect(hasRootsFear).toBe(true);
    });

    it('should load mortality-awareness.json', () => {
      expect(behaviors.mortality_awareness).toBeDefined();
    });

    it('should have milestone/joy legacy awareness', () => {
      const mortality = behaviors.mortality_awareness as any;
      expect(mortality?.legacy_reflections).toBeDefined();

      // Jordan's legacy should be about milestones and celebrations
      const legacyJson = JSON.stringify(mortality?.legacy_reflections);
      const hasMilestoneLegacy =
        legacyJson.toLowerCase().includes('milestone') ||
        legacyJson.toLowerCase().includes('joy') ||
        legacyJson.toLowerCase().includes('memory') ||
        legacyJson.toLowerCase().includes('celebration');
      expect(hasMilestoneLegacy).toBe(true);
    });
  });

  // ==========================================================================
  // PERSONA CONSISTENCY TESTS
  // ==========================================================================

  describe('Persona Consistency', () => {
    it('should reference 17 moves or military brat background', () => {
      const allBehaviors = JSON.stringify(behaviors);
      const hasMilitaryBrat =
        allBehaviors.toLowerCase().includes('17') ||
        allBehaviors.toLowerCase().includes('seventeen') ||
        allBehaviors.toLowerCase().includes('military') ||
        allBehaviors.toLowerCase().includes('move');
      expect(hasMilitaryBrat).toBe(true);
    });

    it('should reference Sam (partner)', () => {
      const allBehaviors = JSON.stringify(behaviors);
      const hasSam = allBehaviors.toLowerCase().includes('sam');
      expect(hasSam).toBe(true);
    });

    it('should reference joy journal or Compass (dog)', () => {
      const allBehaviors = JSON.stringify(behaviors);
      const hasJoyOrCompass =
        allBehaviors.toLowerCase().includes('joy journal') ||
        allBehaviors.toLowerCase().includes('compass');
      expect(hasJoyOrCompass).toBe(true);
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

    it('should have transition-related story triggers', async () => {
      const allStories = await bundle.getAllStories();
      const allTriggers = allStories.flatMap((s) => s.triggers || []);
      const hasTransitionTriggers = allTriggers.some(
        (t) =>
          t.toLowerCase().includes('transition') ||
          t.toLowerCase().includes('move') ||
          t.toLowerCase().includes('change') ||
          t.toLowerCase().includes('celebration')
      );
      expect(hasTransitionTriggers).toBe(true);
    });
  });
});
