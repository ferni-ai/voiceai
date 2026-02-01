/**
 * Cognitive Profiles Unit Tests
 *
 * Tests the cognitive profile system that defines HOW each persona thinks:
 * - Reasoning styles (narrative, analytical, systematic, etc.)
 * - Attention patterns and blind spots
 * - Theory of mind and comprehension checks
 * - Cognitive biases and self-awareness
 * - Metacognition capabilities
 *
 * @module personas/__tests__/cognitive-profiles.test
 */

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import {
  getCognitiveProfile,
  hasCognitiveProfile,
  registerBundleCognitiveProfile,
  clearBundleCognitiveProfiles,
  convertBundleCognitive,
  cognitiveProfiles,
  ferniCognitiveProfile,
  peterCognitiveProfile,
  alexCognitiveProfile,
  mayaCognitiveProfile,
  jordanCognitiveProfile,
  nayanCognitiveProfile,
} from '../cognitive-profiles.js';
import type { CognitiveProfile } from '../cognitive-types.js';

describe('Cognitive Profiles', () => {
  afterEach(() => {
    clearBundleCognitiveProfiles();
  });

  describe('Profile Loading', () => {
    it('should return profile for all 6 personas', () => {
      const personaIds = [
        'ferni',
        'peter-john',
        'alex-chen',
        'maya-santos',
        'jordan-taylor',
        'nayan-patel',
      ];

      for (const personaId of personaIds) {
        const profile = getCognitiveProfile(personaId);
        expect(profile, `Missing profile for ${personaId}`).toBeDefined();
        expect(profile?.reasoningStyle).toBeDefined();
      }
    });

    it('should return undefined for unknown persona', () => {
      const profile = getCognitiveProfile('unknown-persona');
      expect(profile).toBeUndefined();
    });

    it('should check profile existence correctly', () => {
      expect(hasCognitiveProfile('ferni')).toBe(true);
      expect(hasCognitiveProfile('peter-john')).toBe(true);
      expect(hasCognitiveProfile('nonexistent')).toBe(false);
    });
  });

  describe('Profile Structure Validation', () => {
    const allProfiles = [
      { name: 'Ferni', profile: ferniCognitiveProfile },
      { name: 'Peter', profile: peterCognitiveProfile },
      { name: 'Alex', profile: alexCognitiveProfile },
      { name: 'Maya', profile: mayaCognitiveProfile },
      { name: 'Jordan', profile: jordanCognitiveProfile },
      { name: 'Nayan', profile: nayanCognitiveProfile },
    ];

    it.each(allProfiles)('$name should have valid reasoning style', ({ profile }) => {
      const validStyles = [
        'narrative',
        'analytical',
        'systematic',
        'empathetic',
        'pragmatic',
        'intuitive',
      ];
      expect(validStyles).toContain(profile.reasoningStyle);
    });

    it.each(allProfiles)('$name should have attention configuration', ({ profile }) => {
      expect(profile.attention).toBeDefined();
      expect(profile.attention.primaryFocus).toBeInstanceOf(Array);
      expect(profile.attention.primaryFocus.length).toBeGreaterThan(0);
      expect(profile.attention.blindSpots).toBeInstanceOf(Array);
      expect(profile.attention.curiosityTriggers).toBeInstanceOf(Array);
      expect(typeof profile.attention.focusPersistence).toBe('number');
      expect(profile.attention.focusPersistence).toBeGreaterThanOrEqual(0);
      expect(profile.attention.focusPersistence).toBeLessThanOrEqual(1);
    });

    it.each(allProfiles)('$name should have theory of mind configuration', ({ profile }) => {
      expect(profile.theoryOfMind).toBeDefined();
      expect(typeof profile.theoryOfMind.adaptiveness).toBe('number');
      expect(profile.theoryOfMind.comprehensionChecks).toBeInstanceOf(Array);
      expect(profile.theoryOfMind.comprehensionChecks.length).toBeGreaterThan(0);
    });

    it.each(allProfiles)('$name should have cognitive biases defined', ({ profile }) => {
      expect(profile.biases).toBeDefined();
      expect(profile.biases.primaryBiases).toBeInstanceOf(Array);
      expect(profile.biases.primaryBiases.length).toBeGreaterThan(0);
      expect(typeof profile.biases.biasIntensity).toBe('number');
      expect(typeof profile.biases.selfAwareness).toBe('boolean');
    });

    it.each(allProfiles)('$name should have metacognition configuration', ({ profile }) => {
      expect(profile.metacognition).toBeDefined();
      expect(typeof profile.metacognition.reflectionFrequency).toBe('number');
      expect(profile.metacognition.knownStrengths).toBeInstanceOf(Array);
      expect(profile.metacognition.knownStrengths.length).toBeGreaterThan(0);
    });
  });

  describe('Persona-Specific Reasoning Styles', () => {
    const validReasoningStyles = [
      'narrative',
      'analytical',
      'systematic',
      'empathetic',
      'pragmatic',
      'intuitive',
    ];

    it('Ferni should be narrative-focused', () => {
      expect(ferniCognitiveProfile.reasoningStyle).toBe('narrative');
      expect(validReasoningStyles).toContain(ferniCognitiveProfile.secondaryReasoning);
    });

    it('Peter should be analytical-focused', () => {
      expect(peterCognitiveProfile.reasoningStyle).toBe('analytical');
      expect(validReasoningStyles).toContain(peterCognitiveProfile.secondaryReasoning);
    });

    it('Alex should be systematic-focused', () => {
      expect(alexCognitiveProfile.reasoningStyle).toBe('systematic');
      expect(validReasoningStyles).toContain(alexCognitiveProfile.secondaryReasoning);
    });

    it('Maya should be empathetic-focused', () => {
      expect(mayaCognitiveProfile.reasoningStyle).toBe('empathetic');
      expect(validReasoningStyles).toContain(mayaCognitiveProfile.secondaryReasoning);
    });

    it('Jordan should be pragmatic-focused', () => {
      expect(jordanCognitiveProfile.reasoningStyle).toBe('pragmatic');
      expect(validReasoningStyles).toContain(jordanCognitiveProfile.secondaryReasoning);
    });

    it('Nayan should be intuitive-focused', () => {
      expect(nayanCognitiveProfile.reasoningStyle).toBe('intuitive');
      expect(validReasoningStyles).toContain(nayanCognitiveProfile.secondaryReasoning);
    });
  });

  describe('Attention Pattern Differentiation', () => {
    it('Peter should focus on analytical/data concepts', () => {
      // Peter's focus should include patterns and/or data-oriented terms
      const focus = peterCognitiveProfile.attention.primaryFocus;
      expect(focus).toContain('patterns');
      // Should have details or accuracy related focus
      const hasAnalyticalFocus = focus.some((f) =>
        ['details', 'accuracy', 'evidence', 'data', 'facts'].includes(f)
      );
      expect(hasAnalyticalFocus).toBe(true);
    });

    it('Ferni should focus on meaning and emotions', () => {
      expect(ferniCognitiveProfile.attention.primaryFocus).toContain('meaning');
      expect(ferniCognitiveProfile.attention.primaryFocus).toContain('emotions');
    });

    it('Alex should focus on systems and structure', () => {
      const focus = alexCognitiveProfile.attention.primaryFocus;
      // Alex is systematic - should have systems or structure related focus
      const hasSystematicFocus = focus.some((f) =>
        ['systems', 'structure', 'efficiency', 'process', 'actions'].includes(f)
      );
      expect(hasSystematicFocus).toBe(true);
    });

    it('different personas should have different blind spots', () => {
      const ferniBlindSpots = new Set(ferniCognitiveProfile.attention.blindSpots);
      const peterBlindSpots = new Set(peterCognitiveProfile.attention.blindSpots);

      // They shouldn't be identical
      const overlap = [...ferniBlindSpots].filter((x) => peterBlindSpots.has(x));
      expect(overlap.length).toBeLessThan(ferniBlindSpots.size);
    });
  });

  describe('Bundle Profile Registration', () => {
    it('should register custom cognitive profile from bundle', () => {
      const customProfile: CognitiveProfile = {
        reasoningStyle: 'analytical',
        secondaryReasoning: 'pragmatic',
        uncertaintyResponse: 'explore',
        attention: {
          primaryFocus: ['patterns', 'details'],
          blindSpots: ['emotions'],
          curiosityTriggers: ['trigger'],
          attentionMagnets: ['magnet'],
          focusPersistence: 0.5,
        },
        theoryOfMind: {
          adaptiveness: 0.7,
          defaultExpertiseAssumption: 'novice',
          comprehensionChecks: ['Got it?'],
          expertiseRecognition: ['You know this'],
          simplificationPhrases: ['Simply put'],
          misunderstandingRecovery: ['Let me clarify'],
        },
        biases: {
          primaryBiases: [],
          biasIntensity: 0.3,
          selfAwareness: true,
          biasRecognitionPhrases: [],
        },
        metacognition: {
          reflectionFrequency: 0.7,
          knownStrengths: ['analysis', 'data'],
          knownLimitations: ['emotions'],
          uncertaintyExpressions: [],
          confidenceSignaling: [],
          mindChangeExpressions: [],
        },
        informationProcessing: {
          deliberationLevel: 0.7,
          contextRequirement: 0.5,
          preferredFormat: 'data',
          conflictResolution: 'prioritize',
          thinkingAloudPhrases: [],
        },
        signatureThinkingPhrases: ['Let me analyze that...'],
      };

      registerBundleCognitiveProfile('custom-persona', customProfile);

      const retrieved = getCognitiveProfile('custom-persona');
      expect(retrieved).toBeDefined();
      expect(retrieved?.reasoningStyle).toBe('analytical');
      expect(retrieved?.attention.primaryFocus).toContain('patterns');
    });

    it('should clear bundle profiles', () => {
      const customProfile: CognitiveProfile = {
        reasoningStyle: 'narrative',
        uncertaintyResponse: 'synthesize',
        attention: {
          primaryFocus: ['meaning'],
          blindSpots: [],
          curiosityTriggers: [],
          attentionMagnets: [],
          focusPersistence: 0.5,
        },
        theoryOfMind: {
          adaptiveness: 0.5,
          defaultExpertiseAssumption: 'intermediate',
          comprehensionChecks: [],
          expertiseRecognition: [],
          simplificationPhrases: [],
          misunderstandingRecovery: [],
        },
        biases: {
          primaryBiases: [],
          biasIntensity: 0.3,
          selfAwareness: true,
          biasRecognitionPhrases: [],
        },
        metacognition: {
          reflectionFrequency: 0.5,
          knownStrengths: [],
          knownLimitations: [],
          uncertaintyExpressions: [],
          confidenceSignaling: [],
          mindChangeExpressions: [],
        },
        informationProcessing: {
          deliberationLevel: 0.5,
          contextRequirement: 0.5,
          preferredFormat: 'stories',
          conflictResolution: 'integrate',
          thinkingAloudPhrases: [],
        },
        signatureThinkingPhrases: [],
      };

      registerBundleCognitiveProfile('temp-persona', customProfile);
      expect(hasCognitiveProfile('temp-persona')).toBe(true);

      clearBundleCognitiveProfiles();
      expect(hasCognitiveProfile('temp-persona')).toBe(false);
    });
  });

  describe('Bundle Cognitive Conversion', () => {
    it('should convert bundle cognitive config to CognitiveProfile', () => {
      const bundleCognitive = {
        reasoning_style: 'analytical',
        secondary_reasoning: 'systematic',
        uncertainty_response: 'research',
        attention: {
          primary_focus: ['data', 'patterns'],
          blind_spots: ['emotions'],
          curiosity_triggers: ['research'],
        },
      };

      const profile = convertBundleCognitive(bundleCognitive);

      expect(profile.reasoningStyle).toBe('analytical');
      expect(profile.secondaryReasoning).toBe('systematic');
      expect(profile.uncertaintyResponse).toBe('research');
      expect(profile.attention.primaryFocus).toContain('data');
    });

    it('should handle partial bundle configs with defaults', () => {
      const partialConfig = {
        reasoning_style: 'pragmatic',
      };

      const profile = convertBundleCognitive(partialConfig);

      expect(profile.reasoningStyle).toBe('pragmatic');
      // Should have default attention config
      expect(profile.attention).toBeDefined();
      expect(profile.theoryOfMind).toBeDefined();
      expect(profile.biases).toBeDefined();
      expect(profile.metacognition).toBeDefined();
    });
  });

  describe('Profile Registry', () => {
    it('should have all 6 base personas in registry', () => {
      expect(Object.keys(cognitiveProfiles)).toContain('ferni');
      expect(Object.keys(cognitiveProfiles)).toContain('peter-john');
      expect(Object.keys(cognitiveProfiles)).toContain('alex-chen');
      expect(Object.keys(cognitiveProfiles)).toContain('maya-santos');
      expect(Object.keys(cognitiveProfiles)).toContain('jordan-taylor');
      expect(Object.keys(cognitiveProfiles)).toContain('nayan-patel');
    });
  });
});
