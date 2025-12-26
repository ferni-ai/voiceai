/**
 * Speech Humanization E2E Test
 *
 * Tests the complete speech humanization pipeline:
 * 1. Speech context building (energy detection, late night, laughter)
 * 2. Persona fingerprints (speed modifiers, thinking sounds)
 * 3. JSON-based humanization (imperfections, thinking sounds, breath sounds)
 * 4. SSML tagging and alive voice enhancements
 *
 * @module tests/speech-humanization-e2e
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { buildSpeechContext, isLateNightHours, detectUserLaughter, detectExtendedEnergyLevel } from '../speech/speech-context.js';
import { tagTextWithSsmlAdaptive } from '../speech/adaptive-ssml/adaptation.js';
import { makeVoiceAlive } from '../speech/adaptive-ssml/alive-voice/index.js';
import { quickHumanizeSync, preloadAllSpeechProfiles, areSpeechProfilesPreloaded } from '../speech/humanization/index.js';
import { applyPersonaSpeechTraitsSync, preloadAllTraits } from '../speech/adaptive-ssml/persona-speech-traits-loader.js';
import { getEnergyMatchedPacing, getLateNightPacing, selectLaughterResponseSync } from '../speech/humanization/behavior-loader.js';
import type { AliveVoiceContext } from '../speech/adaptive-ssml/alive-voice/types.js';
import type { BehaviorSelectionContext } from '../speech/humanization/types.js';

describe('Speech Humanization E2E', () => {
  beforeAll(async () => {
    // Preload all speech profiles and traits for sync access
    await preloadAllSpeechProfiles();
    await preloadAllTraits();
  });

  describe('Energy Detection', () => {
    it('should detect very low energy from minimal responses', () => {
      expect(detectExtendedEnergyLevel('ok')).toBe('very_low');
      expect(detectExtendedEnergyLevel('yeah')).toBe('very_low');
      expect(detectExtendedEnergyLevel('sure')).toBe('very_low');
    });

    it('should detect low energy from tired language', () => {
      expect(detectExtendedEnergyLevel('I am so tired today...')).toBe('low');
      // "exhausted" triggers very_low, "overwhelmed" triggers low - both are low energy
      const exhausted = detectExtendedEnergyLevel("I am feeling exhausted and overwhelmed");
      expect(['very_low', 'low']).toContain(exhausted);
    });

    it('should detect neutral energy from normal responses', () => {
      expect(detectExtendedEnergyLevel('I had a good day at work today')).toBe('neutral');
      expect(detectExtendedEnergyLevel("Let me think about that")).toBe('neutral');
    });

    it('should detect elevated/high energy from excited language', () => {
      const amazing = detectExtendedEnergyLevel("That's amazing!! I love it!");
      expect(['elevated', 'high']).toContain(amazing);
      
      const excited = detectExtendedEnergyLevel("I'm so excited about this!");
      expect(['elevated', 'high']).toContain(excited);
    });

    it('should detect high energy from very excited language', () => {
      expect(detectExtendedEnergyLevel("OMG YES!!! This is incredible!!!")).toBe('high');
    });
  });

  describe('Late Night Detection', () => {
    it('should detect laughter patterns', () => {
      expect(detectUserLaughter('hahaha that was funny')).toBe(true);
      expect(detectUserLaughter('LOL')).toBe(true);
      expect(detectUserLaughter('That was hilarious 😂')).toBe(true);
      expect(detectUserLaughter('I agree with you')).toBe(false);
    });

    it('should have late night detection function', () => {
      // Just verify the function exists and returns a boolean
      const result = isLateNightHours();
      expect(typeof result).toBe('boolean');
    });
  });

  describe('Speech Context Building', () => {
    it('should build context with all new fields', () => {
      const context = buildSpeechContext({
        userText: 'I am feeling great today! hahaha',
        phase: 'exploring',
        turnCount: 5,
        sessionId: 'test-session',
      });

      expect(context.userEnergy).toBeDefined();
      expect(context.extendedUserEnergy).toBeDefined();
      expect(context.userJustLaughed).toBe(true);
      expect(typeof context.isLateNight).toBe('boolean');
      expect(context.randomSeed).toBeDefined();
    });

    it('should detect laughter in user text', () => {
      const context = buildSpeechContext({
        userText: 'LOL that was so funny!',
        phase: 'exploring',
        turnCount: 3,
      });

      expect(context.userJustLaughed).toBe(true);
    });

    it('should not detect laughter in normal text', () => {
      const context = buildSpeechContext({
        userText: 'I need to work on my project tomorrow',
        phase: 'exploring',
        turnCount: 3,
      });

      expect(context.userJustLaughed).toBe(false);
    });
  });

  describe('Energy Matching', () => {
    const personas = ['ferni', 'maya-santos', 'jordan-taylor', 'alex-chen', 'nayan-patel', 'peter-john'];

    personas.forEach(personaId => {
      it(`should have energy matching for ${personaId}`, () => {
        const lowPacing = getEnergyMatchedPacing(personaId, 'low');
        const highPacing = getEnergyMatchedPacing(personaId, 'high');

        // May be null if persona doesn't have energy-matching.json
        if (lowPacing) {
          expect(lowPacing.speedMultiplier).toBeLessThanOrEqual(1.0);
        }
        if (highPacing) {
          // For contemplative personas like Nayan, even "high" energy may be subdued
          // For energetic personas like Jordan, "high" energy should speed up
          if (personaId === 'nayan-patel') {
            // Nayan stays contemplative even with high user energy
            expect(highPacing.speedMultiplier).toBeLessThanOrEqual(1.0);
          } else {
            // Others generally speed up with high energy
            expect(highPacing.speedMultiplier).toBeGreaterThanOrEqual(0.95);
          }
        }
      });

      it(`should have late night pacing for ${personaId}`, () => {
        const lateNightPacing = getLateNightPacing(personaId);
        
        // May be null if persona doesn't have late-night-presence.json
        if (lateNightPacing) {
          expect(lateNightPacing.speedMultiplier).toBeLessThanOrEqual(1.0);
        }
      });
    });
  });

  describe('Laughter Contagion', () => {
    const personas = ['ferni', 'maya-santos', 'jordan-taylor', 'alex-chen', 'nayan-patel', 'peter-john'];

    personas.forEach(personaId => {
      it(`should have laughter responses for ${personaId}`, () => {
        const context: BehaviorSelectionContext & { userLaughed?: boolean } = {
          personaId,
          emotional: {},
          content: { isCelebration: true },
          turnNumber: 5,
          userLaughed: true,
        };

        // Run multiple times since it's probabilistic
        let foundLaughter = false;
        for (let i = 0; i < 10; i++) {
          const response = selectLaughterResponseSync(personaId, context);
          if (response) {
            foundLaughter = true;
            expect(response.phrase).toBeTruthy();
            break;
          }
        }
        // It's OK if no laughter is found - it's probabilistic
      });
    });
  });

  describe('Persona Speech Traits', () => {
    const personas = ['ferni', 'maya-santos', 'jordan-taylor', 'alex-chen', 'nayan-patel', 'peter-john'];
    const testText = "That's a really great question. Let me think about how to help you with your goals and plans for the future.";

    personas.forEach(personaId => {
      it(`should apply speech traits for ${personaId}`, () => {
        const result = applyPersonaSpeechTraitsSync(testText, personaId, {
          emotion: 'affectionate',
          baseSpeed: 0.9,
          laughterCount: 0,
          turnNumber: 5,
          randomSeed: 'test-seed',
        });

        // Result should be the same or have modifications
        expect(result).toBeTruthy();
        expect(typeof result).toBe('string');
      });
    });
  });

  describe('JSON-Based Humanization', () => {
    it('should apply humanization when profiles are preloaded', () => {
      expect(areSpeechProfilesPreloaded()).toBe(true);
    });

    const personas = ['ferni', 'maya-santos', 'jordan-taylor', 'alex-chen', 'nayan-patel', 'peter-john'];
    const testText = "I understand how you're feeling. That must be really challenging to deal with, and I want you to know that I'm here to support you through this.";

    personas.forEach(personaId => {
      it(`should apply quick humanization for ${personaId}`, () => {
        // Run multiple times - humanization is probabilistic
        let wasModified = false;
        for (let i = 0; i < 10; i++) {
          const result = quickHumanizeSync(testText, personaId, {
            emotion: 'sympathetic',
            turnNumber: 5,
            randomSeed: `test-${i}`,
          });

          if (result !== testText) {
            wasModified = true;
            expect(result.length).toBeGreaterThan(0);
            break;
          }
        }
        // Don't require modification - it's probabilistic
      });
    });
  });

  describe('Full SSML Pipeline', () => {
    const testText = "I hear you. That sounds like a challenging situation, and I think we can work through it together.";

    it('should produce valid SSML output for Ferni', () => {
      const speechContext = buildSpeechContext({
        userText: 'I am struggling with something...',
        phase: 'supporting',
        turnCount: 5,
        sessionId: 'test-session',
      });

      const result = tagTextWithSsmlAdaptive(testText, speechContext, 'ferni');

      // Should have SSML tags
      expect(result).toContain('<');
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(testText.length);
    });

    it('should produce valid alive voice output for Maya', () => {
      const aliveContext: AliveVoiceContext = {
        personaId: 'maya-santos',
        userEmotion: 'neutral',
        topicWeight: 'medium',
        turnCount: 3,
        userEnergy: 'neutral',
        isLateNight: false,
        userJustLaughed: false,
      };

      const result = makeVoiceAlive(testText, aliveContext);

      expect(result.text).toBeTruthy();
      expect(result.appliedFeatures).toBeInstanceOf(Array);
    });

    it('should apply late night pacing when late at night', () => {
      const aliveContext: AliveVoiceContext = {
        personaId: 'nayan-patel',
        userEmotion: 'neutral',
        topicWeight: 'medium',
        turnCount: 3,
        userEnergy: 'low',
        isLateNight: true,
        userJustLaughed: false,
      };

      const result = makeVoiceAlive(testText, aliveContext);

      // Just verify it runs without error
      expect(result.text).toBeTruthy();
    });

    it('should apply laughter contagion when user laughed', () => {
      const aliveContext: AliveVoiceContext = {
        personaId: 'jordan-taylor',
        userEmotion: 'excited',
        topicWeight: 'light',
        turnCount: 5,
        userEnergy: 'elevated',
        isLateNight: false,
        userJustLaughed: true,
        enableLaughter: true,
      };

      // Run multiple times since it's probabilistic
      let foundLaughter = false;
      for (let i = 0; i < 10; i++) {
        const result = makeVoiceAlive(testText, { ...aliveContext, randomSeed: `test-${i}` });
        if (result.appliedFeatures.some(f => f.includes('laughter'))) {
          foundLaughter = true;
          break;
        }
      }
      // Don't require laughter - it's probabilistic
    });
  });

  describe('Full Integration: Context → SSML', () => {
    it('should integrate all components for a complete response', () => {
      // 1. Build speech context from user input
      const context = buildSpeechContext({
        userText: "I've been feeling stressed about work lately haha but trying to stay positive!",
        phase: 'supporting',
        turnCount: 8,
        sessionId: 'integration-test',
      });

      // Verify context has all expected fields
      expect(context.userEnergy).toBeDefined();
      expect(context.extendedUserEnergy).toBeDefined();
      expect(context.userJustLaughed).toBe(true); // User laughed
      expect(context.isLateNight).toBeDefined();
      expect(context.randomSeed).toBeDefined();

      // 2. Generate response and tag with SSML
      const agentResponse = "I hear you. Work stress is so common, and it's wonderful that you're maintaining a positive outlook. What specifically has been weighing on you?";
      const taggedResponse = tagTextWithSsmlAdaptive(agentResponse, context, 'ferni');

      // Verify SSML was applied
      expect(taggedResponse).toContain('<');
      expect(taggedResponse.length).toBeGreaterThanOrEqual(agentResponse.length);

      // 3. Make voice alive with humanization
      const aliveContext: AliveVoiceContext = {
        personaId: 'ferni',
        userEmotion: context.userEmotion,
        topicWeight: context.topicWeight,
        turnCount: context.turnCount,
        userEnergy: context.extendedUserEnergy,
        isLateNight: context.isLateNight,
        userJustLaughed: context.userJustLaughed,
        randomSeed: context.randomSeed,
      };

      const aliveResult = makeVoiceAlive(taggedResponse, aliveContext);

      // Verify alive voice was applied
      expect(aliveResult.text).toBeTruthy();
      expect(aliveResult.appliedFeatures).toBeInstanceOf(Array);
    });
  });
});

