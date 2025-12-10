/**
 * Nayan Patel Persona E2E Tests
 *
 * Comprehensive tests to validate:
 * 1. All behavior files load correctly
 * 2. 200% superhuman behaviors exist and have content
 * 3. Nayan's unique personality is captured (Chamundi Hills, Gita, wisdom)
 * 4. Trust phrases are Nayan-voiced (not generic)
 * 5. Wisdom/meaning-specific content is present
 * 6. Critical: emotional-intelligence.json exists (was missing!)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { loadBundle, clearBundleCache } from '../personas/bundles/loader.js';
import type { LoadedPersonaBundle, BundleBehaviors } from '../personas/bundles/types.js';
import { join } from 'path';

describe('Nayan Patel Persona E2E Tests', () => {
  let bundle: LoadedPersonaBundle;
  let behaviors: BundleBehaviors;

  const NAYAN_BUNDLE_PATH = join(process.cwd(), 'src/personas/bundles/nayan-patel');

  beforeAll(async () => {
    clearBundleCache();
    bundle = await loadBundle(NAYAN_BUNDLE_PATH, { preloadContent: true });
    behaviors = await bundle.getBehaviors();
  });

  afterAll(() => {
    clearBundleCache();
  });

  // ==========================================================================
  // MANIFEST & IDENTITY TESTS
  // ==========================================================================

  describe('Manifest & Identity', () => {
    it('should load Nayan Patel manifest correctly', () => {
      expect(bundle.manifest).toBeDefined();
      expect(bundle.manifest.identity.id).toBe('nayan-patel');
      expect(bundle.manifest.identity.name).toBe('Nayan');
    });

    it('should have correct role domains', () => {
      const { domains } = bundle.manifest.role;
      expect(domains).toContain('life-wisdom');
      expect(domains).toContain('consciousness');
    });

    it('should have correct personality traits', () => {
      const { traits } = bundle.manifest.personality;
      expect(traits).toBeDefined();
      expect(traits.length).toBeGreaterThan(0);
    });
  });

  // ==========================================================================
  // CRITICAL: EMOTIONAL INTELLIGENCE TEST
  // ==========================================================================

  describe('Critical: Emotional Intelligence', () => {
    it('should load emotional-intelligence.json (was missing!)', () => {
      expect(behaviors.emotional_intelligence).toBeDefined();
    });

    it('should have detecting_distress capability', () => {
      const ei = behaviors.emotional_intelligence as any;
      expect(ei?.detecting_distress).toBeDefined();
      expect(ei?.detecting_distress?.indicators).toBeDefined();
      expect(ei?.detecting_distress?.responses).toBeDefined();
    });

    it('should have detecting_confusion capability', () => {
      const ei = behaviors.emotional_intelligence as any;
      expect(ei?.detecting_confusion).toBeDefined();
    });

    it('should have detecting_grief capability', () => {
      const ei = behaviors.emotional_intelligence as any;
      expect(ei?.detecting_grief).toBeDefined();
    });

    it('should have detecting_spiritual_seeking capability', () => {
      const ei = behaviors.emotional_intelligence as any;
      expect(ei?.detecting_spiritual_seeking).toBeDefined();
    });

    it('should have Nayan-appropriate wisdom responses', () => {
      const ei = behaviors.emotional_intelligence as any;
      const eiJson = JSON.stringify(ei);

      // Nayan's EI should include Gita, dharma, wisdom language
      const hasWisdomLanguage =
        eiJson.toLowerCase().includes('gita') ||
        eiJson.toLowerCase().includes('dharma') ||
        eiJson.toLowerCase().includes('wisdom') ||
        eiJson.toLowerCase().includes('soul');
      expect(hasWisdomLanguage).toBe(true);
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

    it('should load physical presence', () => {
      expect(behaviors.physical_presence).toBeDefined();
    });

    it('should load cultural moments (Indian heritage)', () => {
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

    it('should have pattern surfacing for life patterns', () => {
      const insights = behaviors.superhuman_insights as any;
      expect(insights?.pattern_surfacing).toBeDefined();
    });

    it('should have the mirror capability', () => {
      const insights = behaviors.superhuman_insights as any;
      expect(insights?.the_mirror).toBeDefined();
      expect(insights?.the_mirror?.reflecting_past_statements).toBeDefined();
    });

    it('should have predictive care for spiritual/existential needs', () => {
      const insights = behaviors.superhuman_insights as any;
      expect(insights?.predictive_care).toBeDefined();
    });

    it('should load trust-phrases.json', () => {
      expect(behaviors.trust_phrases).toBeDefined();
    });

    it('should have Nayan-voiced trust phrases (not generic)', () => {
      const trustPhrases = behaviors.trust_phrases as any;
      expect(
        trustPhrases?.reading_between_lines || trustPhrases?.wisdom_acknowledgment
      ).toBeDefined();

      // Verify Nayan's voice (wisdom, dharma, soul, meaning)
      const trustJson = JSON.stringify(trustPhrases);
      const hasNayanVoice =
        trustJson.toLowerCase().includes('wisdom') ||
        trustJson.toLowerCase().includes('soul') ||
        trustJson.toLowerCase().includes('truth') ||
        trustJson.toLowerCase().includes('journey');
      expect(hasNayanVoice).toBe(true);
    });

    it('should load i-notice-power.json', () => {
      expect(behaviors.i_notice_power).toBeDefined();
    });

    it('should have wisdom-specific i-notice patterns', () => {
      const iNotice = behaviors.i_notice_power as any;
      expect(iNotice?.surfacing_phrases).toBeDefined();
      expect(iNotice?.surfacing_phrases?.life_arc_patterns).toBeDefined();
      expect(iNotice?.surfacing_phrases?.life_arc_patterns?.length).toBeGreaterThan(0);

      // Should mention meaning or patterns
      const patternsJson = JSON.stringify(iNotice?.surfacing_phrases);
      const hasWisdomContent =
        patternsJson.toLowerCase().includes('pattern') ||
        patternsJson.toLowerCase().includes('wisdom') ||
        patternsJson.toLowerCase().includes('stillness') ||
        patternsJson.toLowerCase().includes('soul');
      expect(hasWisdomContent).toBe(true);
    });

    it('should load late-night-presence.json', () => {
      expect(behaviors.late_night_presence).toBeDefined();
    });

    it('should have wisdom-focused late night content', () => {
      const lateNight = behaviors.late_night_presence as any;
      expect(lateNight?.late_night_greetings).toBeDefined();

      // Should have Chamundi Hills or meditation
      const lateNightJson = JSON.stringify(lateNight);
      const hasWisdomContent =
        lateNightJson.toLowerCase().includes('chamundi') ||
        lateNightJson.toLowerCase().includes('meditation') ||
        lateNightJson.toLowerCase().includes('soul') ||
        lateNightJson.toLowerCase().includes('existence');
      expect(hasWisdomContent).toBe(true);
    });

    it('should load thinking-of-you.json', () => {
      expect(behaviors.thinking_of_you).toBeDefined();
    });

    it('should have spiritual thinking-of-you moments', () => {
      const thinking = behaviors.thinking_of_you as any;
      const thinkingJson = JSON.stringify(thinking);

      // Nayan's proactive outreach should include sunrise, temples, etc.
      const hasSpiritualContent =
        thinkingJson.toLowerCase().includes('sunrise') ||
        thinkingJson.toLowerCase().includes('temple') ||
        thinkingJson.toLowerCase().includes('father') ||
        thinkingJson.toLowerCase().includes('chamundi');
      expect(hasSpiritualContent).toBe(true);
    });

    it('should load self-doubt.json', () => {
      expect(behaviors.self_doubt).toBeDefined();
    });

    it('should have wisdom-related self-doubt content', () => {
      const selfDoubt = behaviors.self_doubt as any;
      expect(selfDoubt?.questioning_own_wisdom).toBeDefined();

      // Nayan should doubt his own practice
      const selfDoubtJson = JSON.stringify(selfDoubt);
      const hasWisdomDoubt =
        selfDoubtJson.toLowerCase().includes('gita') ||
        selfDoubtJson.toLowerCase().includes('wisdom') ||
        selfDoubtJson.toLowerCase().includes('practice') ||
        selfDoubtJson.toLowerCase().includes('detachment');
      expect(hasWisdomDoubt).toBe(true);
    });

    it('should load secret-fears.json', () => {
      expect(behaviors.secret_fears).toBeDefined();
    });

    it('should have time and legacy fears', () => {
      const fears = behaviors.secret_fears as any;
      expect(fears?.personal_fears).toBeDefined();

      // Nayan should fear time running out
      const fearsJson = JSON.stringify(fears?.personal_fears);
      const hasTimeFear =
        fearsJson.toLowerCase().includes('time') ||
        fearsJson.toLowerCase().includes('sons') ||
        fearsJson.toLowerCase().includes('sixty') ||
        fearsJson.toLowerCase().includes('unfinished');
      expect(hasTimeFear).toBe(true);
    });

    it('should load mortality-awareness.json', () => {
      expect(behaviors.mortality_awareness).toBeDefined();
    });

    it('should have rich mortality/meaning awareness', () => {
      const mortality = behaviors.mortality_awareness as any;
      expect(mortality?.legacy_reflections).toBeDefined();
      expect(mortality?.meaning_in_mortality).toBeDefined();

      // Nayan's mortality should be the deepest
      const mortalityJson = JSON.stringify(mortality);
      const hasDeepMortality =
        mortalityJson.toLowerCase().includes('father') ||
        mortalityJson.toLowerCase().includes('soul') ||
        mortalityJson.toLowerCase().includes('gita') ||
        mortalityJson.toLowerCase().includes('transform');
      expect(hasDeepMortality).toBe(true);
    });
  });

  // ==========================================================================
  // PERSONA CONSISTENCY TESTS
  // ==========================================================================

  describe('Persona Consistency', () => {
    it('should reference Chamundi Hills', () => {
      const allBehaviors = JSON.stringify(behaviors);
      const hasChamundi = allBehaviors.toLowerCase().includes('chamundi');
      expect(hasChamundi).toBe(true);
    });

    it('should reference the Gita or dharma', () => {
      const allBehaviors = JSON.stringify(behaviors);
      const hasGitaOrDharma =
        allBehaviors.toLowerCase().includes('gita') ||
        allBehaviors.toLowerCase().includes('dharma');
      expect(hasGitaOrDharma).toBe(true);
    });

    it('should reference father or Rekha', () => {
      const allBehaviors = JSON.stringify(behaviors);
      const hasFamilyReferences =
        allBehaviors.toLowerCase().includes('father') ||
        allBehaviors.toLowerCase().includes('rekha');
      expect(hasFamilyReferences).toBe(true);
    });

    it('should have Indian heritage markers (68 years, monsoons, etc.)', () => {
      const allBehaviors = JSON.stringify(behaviors);
      const hasIndianMarkers =
        allBehaviors.toLowerCase().includes('monsoon') ||
        allBehaviors.toLowerCase().includes('sixty') ||
        allBehaviors.toLowerCase().includes('68') ||
        allBehaviors.toLowerCase().includes('temple');
      expect(hasIndianMarkers).toBe(true);
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

    it('should have wisdom-related stories', async () => {
      const allStories = await bundle.getAllStories();
      // Nayan's stories have themes and topics, not triggers
      expect(allStories.length).toBeGreaterThan(0);

      // Check story content or IDs for wisdom themes
      const storyIds = allStories.map((s) => s.id);
      const hasWisdomStories =
        storyIds.includes('chamundi-hills') ||
        storyIds.includes('empty-cup') ||
        storyIds.includes('bamboo-farmer') ||
        storyIds.some((id) => id.toLowerCase().includes('wisdom'));
      expect(hasWisdomStories).toBe(true);
    });
  });
});
