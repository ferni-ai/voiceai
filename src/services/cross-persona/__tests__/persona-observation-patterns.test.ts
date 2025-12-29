/**
 * Tests for Persona Observation Patterns
 *
 * Verifies that each persona correctly identifies patterns in conversation
 * text based on their domain expertise.
 */

import { describe, it, expect } from 'vitest';
import {
  getPersonaObservationProfile,
  analyzeTextForPersona,
  detectHandoffCues,
  FERNI_PATTERNS,
  PETER_PATTERNS,
  MAYA_PATTERNS,
  JORDAN_PATTERNS,
  ALEX_PATTERNS,
  NAYAN_PATTERNS,
} from '../persona-observation-patterns.js';
import type { PersonaId } from '../team-huddle.js';

describe('PersonaObservationPatterns', () => {
  describe('getPersonaObservationProfile', () => {
    it('should return Ferni profile for ferni persona', () => {
      const profile = getPersonaObservationProfile('ferni');
      expect(profile.personaId).toBe('ferni');
      expect(profile.primaryDomain).toBe('life_coaching');
    });

    it('should return correct profile for each persona', () => {
      const personas: PersonaId[] = ['ferni', 'peter', 'maya', 'jordan', 'alex', 'nayan'];

      for (const personaId of personas) {
        const profile = getPersonaObservationProfile(personaId);
        expect(profile.personaId).toBe(personaId);
        expect(profile.observationPatterns.length).toBeGreaterThan(0);
      }
    });

    it('should fallback to Ferni for unknown persona', () => {
      const profile = getPersonaObservationProfile('unknown' as PersonaId);
      expect(profile.personaId).toBe('ferni');
    });
  });

  describe('analyzeTextForPersona', () => {
    describe('Ferni patterns', () => {
      it('should detect feeling stuck', () => {
        const matches = analyzeTextForPersona('ferni', "I feel so stuck in my career right now");

        expect(matches.length).toBeGreaterThan(0);
        expect(matches[0].pattern.domain).toBe('life_direction');
        expect(matches[0].matchedKeywords).toContain('stuck');
      });

      it('should detect life transitions', () => {
        const matches = analyzeTextForPersona('ferni', "I'm going through a big change in my life");

        expect(matches.length).toBeGreaterThan(0);
        expect(matches.some(m => m.pattern.domain === 'life_transitions')).toBe(true);
      });

      it('should detect support seeking', () => {
        const matches = analyzeTextForPersona('ferni', "I really need some help with this");

        expect(matches.length).toBeGreaterThan(0);
        expect(matches[0].pattern.observationType).toBe('concern');
      });

      it('should detect gratitude', () => {
        const matches = analyzeTextForPersona('ferni', "I'm so grateful for everything");

        expect(matches.length).toBeGreaterThan(0);
        expect(matches[0].pattern.observationType).toBe('opportunity');
      });
    });

    describe('Peter patterns', () => {
      it('should detect work stress', () => {
        const matches = analyzeTextForPersona('peter', "My job is so stressful lately");

        expect(matches.length).toBeGreaterThan(0);
        expect(matches[0].pattern.domain).toBe('work_stress');
      });

      it('should detect financial topics', () => {
        const matches = analyzeTextForPersona('peter', "I need to budget better and save more money");

        expect(matches.length).toBeGreaterThan(0);
        expect(matches.some(m => m.pattern.domain === 'financial')).toBe(true);
      });

      it('should detect research interests', () => {
        const matches = analyzeTextForPersona('peter', "I want to research more about this topic");

        expect(matches.length).toBeGreaterThan(0);
        expect(matches[0].matchedKeywords).toContain('research');
      });
    });

    describe('Maya patterns', () => {
      it('should detect sleep issues', () => {
        const matches = analyzeTextForPersona('maya', "I haven't been sleeping well lately");

        expect(matches.length).toBeGreaterThan(0);
        expect(matches[0].pattern.domain).toBe('sleep_health');
      });

      it('should detect exercise patterns', () => {
        const matches = analyzeTextForPersona('maya', "I should really go to the gym more");

        expect(matches.length).toBeGreaterThan(0);
        expect(matches[0].pattern.domain).toBe('physical_activity');
      });

      it('should detect habit setbacks', () => {
        const matches = analyzeTextForPersona('maya', "I broke my streak and missed my routine");

        expect(matches.length).toBeGreaterThan(0);
        expect(matches[0].pattern.observationType).toBe('concern');
      });

      it('should detect routine discussions', () => {
        const matches = analyzeTextForPersona('maya', "My morning routine has been working well");

        expect(matches.length).toBeGreaterThan(0);
        expect(matches.some(m => m.pattern.domain === 'routine_building')).toBe(true);
      });
    });

    describe('Jordan patterns', () => {
      it('should detect goal discussions', () => {
        const matches = analyzeTextForPersona('jordan', "I want to achieve my fitness goal this month");

        expect(matches.length).toBeGreaterThan(0);
        expect(matches[0].pattern.domain).toBe('goal_setting');
      });

      it('should detect life events', () => {
        const matches = analyzeTextForPersona('jordan', "My birthday is coming up next week");

        expect(matches.length).toBeGreaterThan(0);
        expect(matches[0].pattern.observationType).toBe('milestone');
      });

      it('should detect celebrations', () => {
        const matches = analyzeTextForPersona('jordan', "I finally did it! Time to celebrate!");

        expect(matches.length).toBeGreaterThan(0);
        expect(matches.some(m => m.pattern.domain === 'achievements')).toBe(true);
      });
    });

    describe('Alex patterns', () => {
      it('should detect email needs', () => {
        const matches = analyzeTextForPersona('alex', "I need to reply to this email");

        expect(matches.length).toBeGreaterThan(0);
        expect(matches[0].pattern.domain).toBe('written_communication');
      });

      it('should detect scheduling', () => {
        const matches = analyzeTextForPersona('alex', "I have a meeting scheduled tomorrow");

        expect(matches.length).toBeGreaterThan(0);
        expect(matches[0].pattern.domain).toBe('scheduling');
      });

      it('should detect calendar overload', () => {
        const matches = analyzeTextForPersona('alex', "I'm so busy and overwhelmed with meetings");

        expect(matches.length).toBeGreaterThan(0);
        expect(matches[0].pattern.observationType).toBe('concern');
      });
    });

    describe('Nayan patterns', () => {
      it('should detect meaning questions', () => {
        const matches = analyzeTextForPersona('nayan', "What's the meaning of all this?");

        expect(matches.length).toBeGreaterThan(0);
        expect(matches[0].pattern.domain).toBe('existential');
      });

      it('should detect mortality discussions', () => {
        const matches = analyzeTextForPersona('nayan', "I've been thinking about death lately");

        expect(matches.length).toBeGreaterThan(0);
        expect(matches[0].pattern.observationType).toBe('concern');
      });

      it('should detect legacy reflections', () => {
        const matches = analyzeTextForPersona('nayan', "I want to leave a legacy that matters");

        expect(matches.length).toBeGreaterThan(0);
        expect(matches[0].pattern.domain).toBe('legacy');
      });

      it('should detect values exploration', () => {
        const matches = analyzeTextForPersona('nayan', "What I believe is really important to me");

        expect(matches.length).toBeGreaterThan(0);
        expect(matches.some(m => m.pattern.domain === 'values')).toBe(true);
      });
    });

    describe('confidence adjustment', () => {
      it('should increase confidence with multiple keyword matches', () => {
        const singleMatch = analyzeTextForPersona('ferni', "I feel stuck");
        const multiMatch = analyzeTextForPersona('ferni', "I feel stuck and lost and confused");

        expect(multiMatch[0].adjustedConfidence).toBeGreaterThanOrEqual(singleMatch[0].adjustedConfidence);
      });

      it('should increase confidence with higher emotion intensity', () => {
        const lowEmotion = analyzeTextForPersona('ferni', "I feel stuck", 0.3);
        const highEmotion = analyzeTextForPersona('ferni', "I feel stuck", 0.9);

        expect(highEmotion[0].adjustedConfidence).toBeGreaterThan(lowEmotion[0].adjustedConfidence);
      });

      it('should cap confidence at 0.95', () => {
        const matches = analyzeTextForPersona('ferni', "I feel stuck and lost and confused and need help", 1.0);

        expect(matches[0].adjustedConfidence).toBeLessThanOrEqual(0.95);
      });
    });
  });

  describe('detectHandoffCues', () => {
    it('should detect habit handoff cues from Ferni', () => {
      const cues = detectHandoffCues('ferni', "I need to work on my sleep routine");

      expect(cues.length).toBeGreaterThan(0);
      expect(cues[0].targetPersona).toBe('maya');
    });

    it('should detect research handoff cues from Ferni', () => {
      const cues = detectHandoffCues('ferni', "I want to learn more about investing");

      expect(cues.length).toBeGreaterThan(0);
      expect(cues[0].targetPersona).toBe('peter');
    });

    it('should detect calendar handoff cues from Ferni', () => {
      const cues = detectHandoffCues('ferni', "I have so many meetings to schedule");

      expect(cues.length).toBeGreaterThan(0);
      expect(cues[0].targetPersona).toBe('alex');
    });

    it('should detect goal handoff cues from Ferni', () => {
      const cues = detectHandoffCues('ferni', "I want to celebrate my achievement");

      expect(cues.length).toBeGreaterThan(0);
      expect(cues[0].targetPersona).toBe('jordan');
    });

    it('should detect wisdom handoff cues from Ferni', () => {
      const cues = detectHandoffCues('ferni', "What is my life purpose and legacy?");

      expect(cues.length).toBeGreaterThan(0);
      expect(cues[0].targetPersona).toBe('nayan');
    });

    it('should return matched keywords', () => {
      const cues = detectHandoffCues('ferni', "I need to improve my routine and habits");

      expect(cues.length).toBeGreaterThan(0);
      expect(cues[0].matchedKeywords.length).toBeGreaterThan(0);
    });

    it('should return empty array when no cues detected', () => {
      const cues = detectHandoffCues('ferni', "The weather is nice today");

      expect(cues.length).toBe(0);
    });
  });

  describe('exported pattern profiles', () => {
    it('should export all persona patterns', () => {
      expect(FERNI_PATTERNS).toBeDefined();
      expect(PETER_PATTERNS).toBeDefined();
      expect(MAYA_PATTERNS).toBeDefined();
      expect(JORDAN_PATTERNS).toBeDefined();
      expect(ALEX_PATTERNS).toBeDefined();
      expect(NAYAN_PATTERNS).toBeDefined();
    });

    it('should have unique persona IDs', () => {
      const patterns = [FERNI_PATTERNS, PETER_PATTERNS, MAYA_PATTERNS, JORDAN_PATTERNS, ALEX_PATTERNS, NAYAN_PATTERNS];
      const ids = patterns.map(p => p.personaId);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(patterns.length);
    });

    it('should have non-empty patterns for all personas', () => {
      const patterns = [FERNI_PATTERNS, PETER_PATTERNS, MAYA_PATTERNS, JORDAN_PATTERNS, ALEX_PATTERNS, NAYAN_PATTERNS];

      for (const pattern of patterns) {
        expect(pattern.observationPatterns.length).toBeGreaterThan(0);
        expect(pattern.handoffCues.length).toBeGreaterThan(0);
      }
    });
  });
});
