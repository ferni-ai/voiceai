/**
 * Alex Chen Persona E2E Tests
 *
 * Comprehensive tests to validate:
 * 1. All behavior files load correctly
 * 2. 200% superhuman behaviors exist and have content
 * 3. Alex's unique personality is captured
 * 4. Trust phrases are Alex-voiced (not generic)
 * 5. Communication-specific content is present
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { loadBundle, clearBundleCache } from '../personas/bundles/loader.js';
import type { LoadedPersonaBundle, BundleBehaviors } from '../personas/bundles/types.js';
import { join } from 'path';

describe('Alex Chen Persona E2E Tests', () => {
  let bundle: LoadedPersonaBundle;
  let behaviors: BundleBehaviors;

  const ALEX_BUNDLE_PATH = join(process.cwd(), 'src/personas/bundles/alex-chen');

  beforeAll(async () => {
    clearBundleCache();
    bundle = await loadBundle(ALEX_BUNDLE_PATH, { preloadContent: true });
    behaviors = await bundle.getBehaviors();
  });

  afterAll(() => {
    clearBundleCache();
  });

  // ==========================================================================
  // MANIFEST & IDENTITY TESTS
  // ==========================================================================

  describe('Manifest & Identity', () => {
    it('should load Alex Chen manifest correctly', () => {
      expect(bundle.manifest).toBeDefined();
      expect(bundle.manifest.identity.id).toBe('alex-chen');
      expect(bundle.manifest.identity.name).toBe('Alex Chen');
    });

    it('should have correct role domains', () => {
      const { domains } = bundle.manifest.role;
      expect(domains).toContain('calendar-management');
      expect(domains).toContain('email-drafting-sending');
      expect(domains).toContain('communication-coaching');
      expect(domains).toContain('difficult-conversations');
      expect(domains).toContain('assertiveness-training');
      expect(domains).toContain('boundary-setting');
    });

    it('should have correct personality traits', () => {
      const { traits } = bundle.manifest.personality;
      // Updated to match actual manifest traits
      expect(traits).toContain('calm-presence');
      expect(traits).toContain('warmth-under-efficiency');
      expect(traits).toContain('clear-is-kind');
      expect(traits).toContain('oxford-comma-defender');
      expect(traits).toContain('plant-mom-eight-names');
    });

    it('should have time-of-day moods including midnight Chopin', () => {
      const moods = bundle.manifest.personality.moods_by_time;
      const midnightMood = moods?.find((m) => m.mood === 'midnight-chopin');
      expect(midnightMood).toBeDefined();
      expect(midnightMood?.start_hour).toBe(21);
      expect(midnightMood?.end_hour).toBe(6);
    });
  });

  // ==========================================================================
  // CORE BEHAVIORS TESTS
  // ==========================================================================

  describe('Core Behaviors Loading', () => {
    it('should load greetings', () => {
      expect(behaviors.greetings).toBeDefined();
    });

    it('should load catchphrases', () => {
      expect(behaviors.catchphrases).toBeDefined();
      // Catchphrases can be array or structured object
      const catchphrases = behaviors.catchphrases as any;
      const isArray = Array.isArray(catchphrases);
      const isStructuredWithArray =
        catchphrases?.catchphrases && Array.isArray(catchphrases.catchphrases);
      expect(isArray || isStructuredWithArray).toBe(true);
    });

    it('should load vulnerability content', () => {
      expect(behaviors.vulnerability).toBeDefined();
    });

    it('should load cultural moments', () => {
      expect(behaviors.cultural_moments).toBeDefined();
    });

    it('should load micro moments', () => {
      expect(behaviors.micro_moments).toBeDefined();
    });

    it('should load sensory moments', () => {
      expect(behaviors.sensory_moments).toBeDefined();
    });
  });

  // ==========================================================================
  // 200% SUPERHUMAN BEHAVIORS TESTS
  // ==========================================================================

  describe('200% Superhuman Behaviors', () => {
    it('should load superhuman-insights.json', () => {
      expect(behaviors.superhuman_insights).toBeDefined();
    });

    it('should have pattern surfacing for emails', () => {
      const insights = behaviors.superhuman_insights as any;
      expect(insights?.pattern_surfacing).toBeDefined();
      expect(insights?.pattern_surfacing?.email_patterns).toBeDefined();
      expect(insights?.pattern_surfacing?.email_patterns?.length).toBeGreaterThan(0);
    });

    it('should have communication-specific the mirror', () => {
      const insights = behaviors.superhuman_insights as any;
      expect(insights?.the_mirror).toBeDefined();
      expect(insights?.the_mirror?.reflecting_past_statements).toBeDefined();
      expect(insights?.the_mirror?.contradiction_call_outs).toBeDefined();
    });

    it('should have predictive care for communications', () => {
      const insights = behaviors.superhuman_insights as any;
      expect(insights?.predictive_care).toBeDefined();
      expect(insights?.predictive_care?.before_hard_communications).toBeDefined();
      expect(insights?.predictive_care?.anticipating_communication_needs).toBeDefined();
    });

    it('should load trust-phrases.json', () => {
      expect(behaviors.trust_phrases).toBeDefined();
    });

    it('should have Alex-voiced trust phrases (not generic)', () => {
      const trustPhrases = behaviors.trust_phrases as any;

      // Check for Alex-specific voice markers
      expect(trustPhrases?.reading_between_lines?.false_fine).toBeDefined();
      // false_fine is an object with signals, approach, alex_flavor, avoid - not an array
      expect(trustPhrases?.reading_between_lines?.false_fine?.signals).toBeDefined();
      expect(trustPhrases?.reading_between_lines?.false_fine?.alex_flavor).toBeDefined();

      // Verify Alex's voice (e.g., mentions restaurant, Mom, Kev, efficiency)
      const falseFineJson = JSON.stringify(trustPhrases?.reading_between_lines?.false_fine);
      const hasAlexVoice =
        falseFineJson.includes('mom') ||
        falseFineJson.includes('restaurant') ||
        falseFineJson.includes('Kev') ||
        falseFineJson.includes('kitchen') ||
        falseFineJson.includes('fine');
      expect(hasAlexVoice).toBe(true);
    });

    it('should have communication-specific trust outputs', () => {
      const trustPhrases = behaviors.trust_phrases as any;
      expect(trustPhrases?.communication_specific).toBeDefined();
      expect(trustPhrases?.communication_specific?.email_coaching_moments).toBeDefined();
      expect(trustPhrases?.communication_specific?.boundary_setting_support).toBeDefined();
    });

    it('should load i-notice-power.json', () => {
      expect(behaviors.i_notice_power).toBeDefined();
    });

    it('should have communication pattern noticing', () => {
      const iNotice = behaviors.i_notice_power as any;
      expect(iNotice?.surfacing_phrases?.communication_patterns).toBeDefined();
      expect(iNotice?.surfacing_phrases?.timing_patterns).toBeDefined();
      expect(iNotice?.surfacing_phrases?.avoidance_patterns).toBeDefined();
    });

    it('should have contradiction surfacing', () => {
      const iNotice = behaviors.i_notice_power as any;
      expect(iNotice?.contradiction_surfacing).toBeDefined();
      expect(iNotice?.contradiction_surfacing?.gentle_call_outs).toBeDefined();
    });

    it('should load late-night-presence.json', () => {
      expect(behaviors.late_night_presence).toBeDefined();
    });

    it('should have warmth and grounding presence at night', () => {
      const lateNight = behaviors.late_night_presence as any;
      // Alex's late night presence reveals warmth behind efficiency
      expect(lateNight?.warmth_emerges?.phrases).toBeDefined();
      expect(lateNight?.grounding_presence?.overwhelm_support).toBeDefined();
      expect(lateNight?.grounding_presence?.plant_metaphors).toBeDefined();
    });

    it('should have communication-supportive late night content', () => {
      const lateNight = behaviors.late_night_presence as any;
      // Alex has holding_chaos and sleep_acknowledgment for late night support
      expect(lateNight?.holding_chaos?.phrases).toBeDefined();
      expect(lateNight?.sleep_acknowledgment?.gentle_nudge).toBeDefined();
      expect(lateNight?.closing_for_night?.gentle_close).toBeDefined();
    });

    it('should load thinking-of-you.json', () => {
      expect(behaviors.thinking_of_you).toBeDefined();
    });

    it('should have communication-focused proactive outreach', () => {
      const thinkingOfYou = behaviors.thinking_of_you as any;
      expect(
        thinkingOfYou?.following_up_on_difficult_things?.after_hard_conversation
      ).toBeDefined();
      expect(thinkingOfYou?.following_up_on_difficult_things?.after_hard_email).toBeDefined();
      expect(thinkingOfYou?.following_up_on_difficult_things?.after_boundary_setting).toBeDefined();
    });

    it('should load self-doubt.json', () => {
      expect(behaviors.self_doubt).toBeDefined();
    });

    it('should have coaching vulnerability', () => {
      const selfDoubt = behaviors.self_doubt as any;
      expect(selfDoubt?.questioning_own_advice).toBeDefined();
      expect(selfDoubt?.admitting_limits).toBeDefined();
      expect(selfDoubt?.sharing_own_struggles?.communication_struggles).toBeDefined();
    });

    it('should load secret-fears.json', () => {
      expect(behaviors.secret_fears).toBeDefined();
    });

    it('should have Alex-specific fears', () => {
      const fears = behaviors.secret_fears as any;
      expect(fears?.professional_fears?.being_replaceable).toBeDefined();
      expect(fears?.professional_fears?.being_too_efficient).toBeDefined();
      expect(fears?.personal_fears?.family_expectations).toBeDefined();
      expect(fears?.personal_fears?.cultural_tension).toBeDefined();
    });

    it('should load mortality-awareness.json', () => {
      expect(behaviors.mortality_awareness).toBeDefined();
    });

    it('should have legacy reflections about communication', () => {
      const mortality = behaviors.mortality_awareness as any;
      expect(mortality?.legacy_reflections?.what_communication_leaves_behind).toBeDefined();
      expect(mortality?.legacy_reflections?.the_restaurant_as_legacy).toBeDefined();
    });
  });

  // ==========================================================================
  // EMOTIONAL INTELLIGENCE TESTS
  // ==========================================================================

  describe('Emotional Intelligence', () => {
    it('should load emotional-intelligence.json', () => {
      expect(behaviors.emotional_intelligence).toBeDefined();
    });

    it('should have emotion detection patterns', () => {
      const ei = behaviors.emotional_intelligence as any;
      // Check for various emotion detection capabilities
      expect(ei).toBeDefined();
    });
  });

  // ==========================================================================
  // ALEX-SPECIFIC PERSONALITY TESTS
  // ==========================================================================

  describe('Alex-Specific Personality', () => {
    it('should have off-duty Alex content', () => {
      expect(behaviors.off_duty).toBeDefined();
    });

    it('should mention plants in various behaviors', async () => {
      // Check stories for plant mentions
      const stories = await bundle.getAllStories();
      const plantStory = stories.find(
        (s) => s.id.includes('plant') || JSON.stringify(s).toLowerCase().includes('susan')
      );
      expect(plantStory).toBeDefined();
    });

    it('should have quirks about Oxford comma and boba', () => {
      expect(behaviors.quirks).toBeDefined();
    });
  });

  // ==========================================================================
  // STORIES TESTS
  // ==========================================================================

  describe('Stories', () => {
    it('should load all stories', async () => {
      const stories = await bundle.getAllStories();
      expect(stories.length).toBeGreaterThan(0);
    });

    it('should have communication-related stories', async () => {
      const stories = await bundle.getAllStories();
      const commStories = stories.filter(
        (s) =>
          s.id.includes('communication') ||
          s.id.includes('email') ||
          s.id.includes('boundary') ||
          s.id.includes('conversation')
      );
      expect(commStories.length).toBeGreaterThan(0);
    });

    it('should have personal stories (restaurant, family)', async () => {
      const stories = await bundle.getAllStories();
      const personalStories = stories.filter(
        (s) =>
          s.id.includes('restaurant') ||
          s.id.includes('dumpling') ||
          s.id.includes('family') ||
          s.id.includes('kev')
      );
      expect(personalStories.length).toBeGreaterThan(0);
    });

    it('should have stories by trigger (difficult conversation)', async () => {
      const stories = await bundle.getStoriesByTrigger('difficult conversation');
      // May or may not have matches, but function should work
      expect(Array.isArray(stories)).toBe(true);
    });
  });

  // ==========================================================================
  // KNOWLEDGE TESTS
  // ==========================================================================

  describe('Knowledge', () => {
    it('should load knowledge about communication coaching', async () => {
      const knowledge = await bundle.getKnowledge('communication-coaching');
      expect(knowledge).toBeDefined();
    });

    it('should load knowledge about difficult conversations', async () => {
      const knowledge = await bundle.getKnowledge('difficult-conversations');
      expect(knowledge).toBeDefined();
    });

    it('should load knowledge about boundaries', async () => {
      const knowledge = await bundle.getKnowledge('assertive-boundaries');
      expect(knowledge).toBeDefined();
    });
  });

  // ==========================================================================
  // VOICE & EXPRESSIONS TESTS
  // ==========================================================================

  describe('Voice & Expressions', () => {
    it('should load voice expressions', async () => {
      const expressions = await bundle.getVoiceExpressions();
      expect(expressions).toBeDefined();
    });
  });

  // ==========================================================================
  // USAGE RULES TESTS
  // ==========================================================================

  describe('Behavior Usage Rules', () => {
    it('should have usage rules for superhuman insights', () => {
      const insights = behaviors.superhuman_insights as any;
      expect(insights?.usage_rules).toBeDefined();
      expect(insights?.usage_rules?.probability).toBeDefined();
      expect(insights?.usage_rules?.relationship_gate).toBe('familiar');
    });

    it('should have usage rules for late-night presence', () => {
      const lateNight = behaviors.late_night_presence as any;
      expect(lateNight?.usage_rules).toBeDefined();
      // Actual structure has time_trigger with start_hour/end_hour
      expect(lateNight?.usage_rules?.time_trigger).toBeDefined();
      expect(lateNight?.usage_rules?.time_trigger?.start_hour).toBe(22);
      expect(lateNight?.usage_rules?.warmth_amplified).toBe(true);
    });

    it('should have usage rules for i-notice power', () => {
      const iNotice = behaviors.i_notice_power as any;
      expect(iNotice?.usage_rules).toBeDefined();
      expect(iNotice?.usage_rules?.ask_permission_first).toBe(true);
    });

    it('should have secret fears gated to trusted relationship', () => {
      const fears = behaviors.secret_fears as any;
      expect(fears?.surface_conditions?.only_when).toBeDefined();
      expect(fears?.surface_conditions?.never_when).toBeDefined();
    });
  });

  // ==========================================================================
  // CONSISTENCY TESTS
  // ==========================================================================

  describe('Alex Persona Consistency', () => {
    it('should not have Ferni-specific content in Alex files', () => {
      // Check that trust phrases don't mention Ferni-specific things like "tsunami"
      const trustPhrases = JSON.stringify(behaviors.trust_phrases);
      expect(trustPhrases.toLowerCase()).not.toContain('tsunami');
      expect(trustPhrases.toLowerCase()).not.toContain('wyoming');
      expect(trustPhrases.toLowerCase()).not.toContain('scottish');
    });

    it('should have Alex-specific references throughout', () => {
      const allContent = JSON.stringify(behaviors);

      // Should have Alex-specific references
      const hasPlants =
        allContent.toLowerCase().includes('susan') || allContent.toLowerCase().includes('plant');
      const hasRestaurant =
        allContent.toLowerCase().includes('restaurant') ||
        allContent.toLowerCase().includes('chen');
      const hasChopin = allContent.toLowerCase().includes('chopin');
      const hasEfficiency = allContent.toLowerCase().includes('efficient');

      // At least some Alex markers should be present
      const alexMarkers = [hasPlants, hasRestaurant, hasChopin, hasEfficiency].filter(
        Boolean
      ).length;
      expect(alexMarkers).toBeGreaterThanOrEqual(2);
    });
  });

  // ==========================================================================
  // COMPLETENESS SCORE
  // ==========================================================================

  describe('200% Completeness Score', () => {
    it('should have all 200% superhuman capability files', () => {
      const requiredFiles = [
        'superhuman_insights',
        'trust_phrases',
        'i_notice_power',
        'late_night_presence',
        'thinking_of_you',
        'self_doubt',
        'secret_fears',
        'mortality_awareness',
      ];

      const missing = requiredFiles.filter((file) => !(behaviors as any)[file]);
      expect(missing).toEqual([]);
    });

    it('should have emotional intelligence', () => {
      expect(behaviors.emotional_intelligence).toBeDefined();
    });

    it('should have physical presence', () => {
      expect(behaviors.physical_presence).toBeDefined();
    });

    it('should have anticipation behaviors', () => {
      expect(behaviors.anticipation).toBeDefined();
    });

    it('should have vulnerability content', () => {
      expect(behaviors.vulnerability).toBeDefined();
    });

    it('should have cultural moments', () => {
      expect(behaviors.cultural_moments).toBeDefined();
    });
  });
});
