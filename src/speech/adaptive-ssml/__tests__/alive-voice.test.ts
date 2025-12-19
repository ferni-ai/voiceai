/**
 * Alive Voice Tests
 *
 * Tests for the alive voice module that makes agents come alive through:
 * - Sentence-level emotion arcs
 * - Dynamic pause scaling
 * - Speed variation
 * - Pre-response micro-sounds
 * - Persona voice fingerprints
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  addOpeningSound,
  applyDynamicPauses,
  applyEmotionArcs,
  applyPersonaFingerprint,
  applySpeedVariation,
  getNonverbal,
  isNonverbalSupported,
  makeVoiceAlive,
  PERSONA_FINGERPRINTS,
} from '../alive-voice.js';

describe('Alive Voice Module', () => {
  // =========================================================================
  // SENTENCE-LEVEL EMOTION ARCS
  // =========================================================================
  describe('applyEmotionArcs', () => {
    it('should add emotion transition for positive-to-concern pattern', () => {
      const text = "That's great news, but I want to make sure you're taking care of yourself.";
      const result = applyEmotionArcs(text, {});

      expect(result).toContain('<emotion value="happy"/>');
      expect(result).toContain('<emotion value="caring"/>');
      // Verify the emotion transition happens before "but"
      expect(result.indexOf('<emotion value="happy"/>')).toBeLessThan(
        result.indexOf('<emotion value="caring"/>')
      );
    });

    it('should add emotion transition for empathy-to-encouragement pattern', () => {
      const text = "That sounds really hard, but you've got this.";
      const result = applyEmotionArcs(text, {});

      expect(result).toContain('<emotion value="sympathetic"/>');
      expect(result).toContain('<emotion value="affectionate"/>');
    });

    it('should add emotion transition for surprise-to-curiosity pattern', () => {
      // Pattern requires: (wow/oh/really) + 5-30 chars (not including <) + (tell me more/what happened/how did)
      // Using exactly matching text
      const text = 'Oh that is great tell me more';
      const result = applyEmotionArcs(text, {});

      expect(result).toContain('<emotion value="surprised"/>');
      expect(result).toContain('<emotion value="curious"/>');
    });

    it('should skip if text already has emotion arcs', () => {
      const text = '<emotion value="happy"/>Great! <emotion value="curious"/>What else?';
      const result = applyEmotionArcs(text, {});

      expect(result).toBe(text); // Unchanged
    });

    it('should handle thinking-to-realization pattern', () => {
      // Pattern requires: (hmm/well/let me think) + 5-30 chars (without <) + (actually/you know what/I think)
      // Testing with exact pattern that matches
      const text = 'Hmm let me consider actually this works';
      const result = applyEmotionArcs(text, {});

      expect(result).toContain('<emotion value="contemplative"/>');
      expect(result).toContain('<emotion value="curious"/>');
    });
  });

  // =========================================================================
  // DYNAMIC PAUSE SCALING
  // =========================================================================
  describe('applyDynamicPauses', () => {
    it('should scale pauses up for heavy topics', () => {
      const text = '<break time="200ms"/>Hello.';
      const result = applyDynamicPauses(text, { topicWeight: 'heavy' });

      // Heavy topics scale up by 1.5x
      expect(result).toContain('<break time="300ms"/>');
    });

    it('should scale pauses down for light topics', () => {
      const text = '<break time="200ms"/>Hello.';
      const result = applyDynamicPauses(text, { topicWeight: 'light' });

      // Light topics scale down by 0.75x
      expect(result).toContain('<break time="150ms"/>');
    });

    it('should add sentence pauses for heavy topics', () => {
      const text = 'I understand. That must be difficult.';
      const result = applyDynamicPauses(text, { topicWeight: 'heavy' });

      expect(result).toContain('<break time="400ms"/>');
    });

    it('should add emphasis pauses for important words in heavy topics', () => {
      const text = 'This is important.';
      const result = applyDynamicPauses(text, { topicWeight: 'heavy' });

      expect(result).toContain('<break time="250ms"/>important');
    });

    it('should cap pause length at 800ms', () => {
      const text = '<break time="1000ms"/>Hello.';
      const result = applyDynamicPauses(text, { topicWeight: 'heavy' });

      // Should cap at 800ms even with 1.5x scaling
      expect(result).toContain('<break time="800ms"/>');
    });
  });

  // =========================================================================
  // SPEED VARIATION
  // =========================================================================
  describe('applySpeedVariation', () => {
    it('should slow down for emphasis words', () => {
      // Pattern requires: (really/truly/deeply/genuinely/absolutely) + (important/matter/care/love/proud/grateful)
      const text = 'I really care about this deeply.';
      const result = applySpeedVariation(text, { topicWeight: 'medium' });

      expect(result).toContain('<speed ratio="0.88"/>');
      expect(result).toContain('<speed ratio="1.0"/>');
    });

    it('should speed up for parentheticals', () => {
      const text = "The point is (I'll keep this brief) we should proceed.";
      const result = applySpeedVariation(text, { topicWeight: 'medium' });

      expect(result).toContain('<speed ratio="1.08"/>');
    });

    it('should skip speed variation for heavy topics', () => {
      const text = 'This really matters to me.';
      const result = applySpeedVariation(text, { topicWeight: 'heavy' });

      // Should be unchanged for heavy topics
      expect(result).not.toContain('<speed ratio="0.88"/>');
    });

    it('should slow down for deep questions', () => {
      const text = 'What do you think about that?';
      const result = applySpeedVariation(text, { topicWeight: 'medium' });

      expect(result).toContain('<speed ratio="0.90"/>');
    });
  });

  // =========================================================================
  // OPENING SOUNDS
  // =========================================================================
  describe('addOpeningSound', () => {
    beforeEach(() => {
      // Mock Math.random for predictable tests
      vi.spyOn(Math, 'random').mockReturnValue(0.1); // Low value = first option
    });

    it('should add excited opening for good news', () => {
      const text = "That's wonderful!";
      const result = addOpeningSound(text, { isGoodNews: true });

      expect(result).toContain('<emotion value="surprised"/>');
      expect(result).toContain('Oh!');
    });

    it('should add sympathetic opening for bad news', () => {
      const text = "I'm sorry to hear that.";
      const result = addOpeningSound(text, { isBadNews: true });

      expect(result).toContain('<emotion value="sympathetic"/>');
      expect(result).toContain('Oh...');
    });

    it('should add thinking sound for questions', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.35); // Falls into "Hmm..." range
      const text = 'Let me think about that.';
      const result = addOpeningSound(text, { isQuestion: true });

      expect(result).toContain('<emotion value="contemplative"/>');
      expect(result).toContain('Hmm...');
    });

    it('should sometimes add no sound (just emotion)', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.6); // Falls into empty sound range for default
      const text = "Here's what I think.";
      const result = addOpeningSound(text, {});

      // Should have emotion but no sound word
      expect(result).toContain('<emotion value="affectionate"/>');
      expect(result).not.toContain('Oh');
      expect(result).not.toContain('Hmm');
    });
  });

  // =========================================================================
  // PERSONA FINGERPRINTS
  // =========================================================================
  describe('applyPersonaFingerprint', () => {
    beforeEach(() => {
      vi.spyOn(Math, 'random').mockReturnValue(0.5); // Moderate - no thinking sounds
    });

    it('should apply Ferni base speed (0.95)', () => {
      const text = 'Hello there!';
      const result = applyPersonaFingerprint(text, { personaId: 'ferni' });

      expect(result).toContain('<speed ratio="0.95"/>');
      expect(result).toContain('<emotion value="affectionate"/>');
    });

    it('should apply Nayan slower speed (0.85)', () => {
      const text = 'Consider this wisdom.';
      const result = applyPersonaFingerprint(text, { personaId: 'nayan-patel' });

      expect(result).toContain('<speed ratio="0.85"/>');
      expect(result).toContain('<emotion value="contemplative"/>');
    });

    it('should apply Alex base speed (1.0)', () => {
      const text = "Let's get this scheduled!";
      const result = applyPersonaFingerprint(text, { personaId: 'alex-chen' });

      expect(result).toContain('<speed ratio="1.00"/>');
      expect(result).toContain('<emotion value="confident"/>');
    });

    it('should apply Ferni special pattern for Wyoming', () => {
      const text = 'Back in Wyoming, we learned patience.';
      const result = applyPersonaFingerprint(text, { personaId: 'ferni' });

      expect(result).toContain('<break time="200ms"/>');
      expect(result).toContain('<emotion value="wistful"/>');
    });

    it('should apply Peter special pattern for index funds', () => {
      const text = 'The index fund is the best choice.';
      const result = applyPersonaFingerprint(text, { personaId: 'peter-john' });

      // Peter's base speed is 1.05, but index fund pattern slows to 0.95 for emphasis
      expect(result).toContain('<emotion value="enthusiastic"/>');
    });

    it('should apply Jordan special pattern for celebrations', () => {
      const text = "It's your birthday!";
      const result = applyPersonaFingerprint(text, { personaId: 'jordan-taylor' });

      expect(result).toContain('<emotion value="excited"/>');
      // Jordan's base speed is 1.08
      expect(result).toContain('<speed ratio="1.08"/>');
    });

    it('should add thinking sounds for Nayan based on probability', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.1); // Low value triggers thinking sound
      const text = 'This is a thought.';
      const result = applyPersonaFingerprint(text, {
        personaId: 'nayan-patel',
        turnCount: 3, // Not first turn
      });

      // Nayan has 0.25 probability for thinking sounds: "Hmm...", "...", "Consider..."
      // With random=0.1, should add one of these at the start
      expect(result).toMatch(/^(Hmm\.\.\.|\.{3}|Consider\.\.\.) |^<emotion/);
    });

    it('should fall back to Ferni for unknown persona', () => {
      const text = 'Hello there!';
      const result = applyPersonaFingerprint(text, { personaId: 'unknown-persona' });

      expect(result).toContain('<speed ratio="0.95"/>'); // Ferni's speed
    });
  });

  // =========================================================================
  // NONVERBAL SYSTEM
  // =========================================================================
  describe('Nonverbal System', () => {
    it('should return bracket notation for supported nonverbals', () => {
      // Laughter returns [laughter] which is the Cartesia-supported bracket notation
      expect(getNonverbal('laughter')).toBe('[laughter]');
    });

    it('should return fallback for unsupported nonverbals', () => {
      expect(getNonverbal('sigh')).toBe('');
      expect(getNonverbal('thinking')).toBe('Hmm...');
      expect(getNonverbal('gasp')).toBe('Oh!');
    });

    it('should correctly identify supported nonverbals', () => {
      expect(isNonverbalSupported('laughter')).toBe(true);
      expect(isNonverbalSupported('sigh')).toBe(false);
      expect(isNonverbalSupported('thinking')).toBe(false);
    });

    it('should have all personas defined', () => {
      expect(PERSONA_FINGERPRINTS).toHaveProperty('ferni');
      expect(PERSONA_FINGERPRINTS).toHaveProperty('peter-john');
      expect(PERSONA_FINGERPRINTS).toHaveProperty('alex-chen');
      expect(PERSONA_FINGERPRINTS).toHaveProperty('maya-santos');
      expect(PERSONA_FINGERPRINTS).toHaveProperty('jordan-taylor');
      expect(PERSONA_FINGERPRINTS).toHaveProperty('nayan-patel');
    });
  });

  // =========================================================================
  // MAIN ORCHESTRATOR
  // =========================================================================
  describe('makeVoiceAlive', () => {
    beforeEach(() => {
      vi.spyOn(Math, 'random').mockReturnValue(0.5);
    });

    it('should return empty array for empty text', () => {
      const result = makeVoiceAlive('', {});
      expect(result.text).toBe('');
      expect(result.appliedFeatures).toEqual([]);
    });

    it('should apply persona fingerprint when personaId provided', () => {
      const result = makeVoiceAlive('Hello!', { personaId: 'ferni' });

      expect(result.appliedFeatures).toContain('persona_fingerprint');
      expect(result.text).toContain('<speed ratio="0.95"/>');
    });

    it('should detect good news automatically', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.1); // Trigger opening sound
      const result = makeVoiceAlive('Congratulations on your promotion!', {});

      expect(result.debug?.detectedContext).toMatchObject({
        isGoodNews: true,
      });
    });

    it('should detect bad news automatically', () => {
      const result = makeVoiceAlive("I'm sorry for your loss.", {});

      expect(result.debug?.detectedContext).toMatchObject({
        isBadNews: true,
      });
    });

    it('should detect heavy topic weight', () => {
      const result = makeVoiceAlive('Dealing with grief is difficult.', {});

      expect(result.debug?.detectedContext).toMatchObject({
        topicWeight: 'heavy',
      });
    });

    it('should detect light topic weight', () => {
      const result = makeVoiceAlive("Let's play a fun game!", {});

      expect(result.debug?.detectedContext).toMatchObject({
        topicWeight: 'light',
      });
    });

    it('should apply multiple features in one pass', () => {
      const text = "That's wonderful! But I want to make sure you're okay.";
      const result = makeVoiceAlive(text, {
        personaId: 'ferni',
        topicWeight: 'medium',
      });

      // Should apply persona fingerprint and potentially emotion arcs
      expect(result.appliedFeatures.length).toBeGreaterThan(0);
    });

    it('should skip speed variation for heavy topics', () => {
      const text = 'This really matters during grief.';
      const result = makeVoiceAlive(text, { topicWeight: 'heavy' });

      // Speed variation should not be applied
      expect(result.appliedFeatures).not.toContain('speed_variation');
    });
  });
});
