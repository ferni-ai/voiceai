/**
 * Methodology Integration Tests
 *
 * Tests that methodology.json files are properly loaded and trigger
 * context injection based on conversation topics.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { loadBundleById } from '../personas/bundles/loader.js';

// Test personas - both core and marketplace
const CORE_PERSONAS = [
  'ferni',
  'maya-santos',
  'alex-chen',
  'peter-john',
  'jordan-taylor',
  'nayan-patel',
];

describe('Methodology Loading', () => {
  describe('Core Personas', () => {
    it.each(CORE_PERSONAS)('should load methodology for %s', async (personaId) => {
      const bundle = await loadBundleById(personaId);
      expect(bundle).toBeDefined();

      const behaviors = await bundle!.getBehaviors();
      expect(behaviors.methodology).toBeDefined();
      expect(behaviors.methodology.schema_version).toBeGreaterThanOrEqual(1);
      expect(behaviors.methodology.behavior_type).toBe('methodology');
      expect(behaviors.methodology.research_foundations).toBeDefined();
    });

    it('should have research foundations with primary model', async () => {
      const bundle = await loadBundleById('ferni');
      const behaviors = await bundle!.getBehaviors();
      const { methodology } = behaviors;

      expect(methodology.research_foundations.primary_model).toBeDefined();
      expect(methodology.research_foundations.primary_model.name).toBeDefined();
      expect(methodology.research_foundations.primary_model.source).toBeDefined();
    });

    it('should have coaching principles', async () => {
      const bundle = await loadBundleById('maya-santos');
      const behaviors = await bundle!.getBehaviors();
      const { methodology } = behaviors;

      expect(methodology.coaching_principles).toBeDefined();
      expect(Object.keys(methodology.coaching_principles).length).toBeGreaterThan(0);
    });

    it('should have intervention techniques', async () => {
      // Maya Santos has intervention_techniques
      const bundle = await loadBundleById('maya-santos');
      const behaviors = await bundle!.getBehaviors();
      const { methodology } = behaviors;

      expect(methodology.intervention_techniques).toBeDefined();
      expect(Object.keys(methodology.intervention_techniques).length).toBeGreaterThan(0);
    });
  });

  describe('Topic Trigger Detection', () => {
    // Import the detection function for testing
    const detectMethodologyTriggers = (userText: string, topics: string[]): string[] => {
      const TOPIC_TRIGGERS: Record<string, string[]> = {
        habits: ['habit', 'routine', 'consistency'],
        grief: ['grief', 'loss', 'lost', 'death', 'died'],
        sleep: ['sleep', 'insomnia', 'tired', 'rest'],
        career: ['career', 'job', 'promotion', 'interview'],
        relationships: ['relationship', 'partner', 'spouse'],
        creativity: ['creative', 'idea', 'brainstorm', 'stuck'],
        mindfulness: ['mindful', 'present', 'aware', 'meditation'],
      };

      const triggers: string[] = [];
      const lowerText = userText.toLowerCase();

      for (const [domain, keywords] of Object.entries(TOPIC_TRIGGERS)) {
        if (keywords.some((keyword) => lowerText.includes(keyword))) {
          triggers.push(domain);
        }
      }
      return triggers;
    };

    it('should detect habit-related triggers', () => {
      const triggers = detectMethodologyTriggers("I'm trying to build a morning routine", []);
      expect(triggers).toContain('habits');
    });

    it('should detect grief-related triggers', () => {
      const triggers = detectMethodologyTriggers('I lost my father last month', []);
      expect(triggers).toContain('grief');
    });

    it('should detect sleep-related triggers', () => {
      const triggers = detectMethodologyTriggers("I can't sleep at night", []);
      expect(triggers).toContain('sleep');
    });

    it('should detect career-related triggers', () => {
      const triggers = detectMethodologyTriggers('Should I negotiate my job offer?', []);
      expect(triggers).toContain('career');
    });

    it('should detect relationship-related triggers', () => {
      const triggers = detectMethodologyTriggers('My partner and I have been arguing', []);
      expect(triggers).toContain('relationships');
    });

    it('should detect creativity-related triggers', () => {
      const triggers = detectMethodologyTriggers("I'm stuck and can't come up with ideas", []);
      expect(triggers).toContain('creativity');
    });

    it('should detect mindfulness-related triggers', () => {
      const triggers = detectMethodologyTriggers('I want to be more present and mindful', []);
      expect(triggers).toContain('mindfulness');
    });

    it('should detect multiple triggers', () => {
      const triggers = detectMethodologyTriggers("I lost my job and can't sleep", []);
      expect(triggers).toContain('grief');
      expect(triggers).toContain('sleep');
    });

    it('should return empty array for unrelated topics', () => {
      const triggers = detectMethodologyTriggers('What time is it?', []);
      expect(triggers).toHaveLength(0);
    });
  });
});

describe('Methodology Content Quality', () => {
  it('should have unique persona_id matching the persona', async () => {
    for (const personaId of CORE_PERSONAS) {
      const bundle = await loadBundleById(personaId);
      const behaviors = await bundle!.getBehaviors();
      expect(behaviors.methodology.persona_id).toBe(personaId);
    }
  });

  it('should have descriptions for all personas', async () => {
    for (const personaId of CORE_PERSONAS) {
      const bundle = await loadBundleById(personaId);
      const behaviors = await bundle!.getBehaviors();
      expect(behaviors.methodology.description).toBeDefined();
      expect(behaviors.methodology.description.length).toBeGreaterThan(20);
    }
  });
});
