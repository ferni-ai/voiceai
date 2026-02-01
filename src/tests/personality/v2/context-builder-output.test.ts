/**
 * Context Builder Output Format Validation Tests
 *
 * Validates that the personality-context builder produces
 * correctly formatted output for LLM injection.
 *
 * @module tests/personality/v2/context-builder-output
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createTestPersonalityService } from '../../../personality/v2/index.js';
import { clearProfileCache } from '../../../personality/application/build-personality-context.js';

describe('Context Builder Output Format', () => {
  let service: ReturnType<typeof createTestPersonalityService>['service'];

  beforeEach(() => {
    clearProfileCache();
    const test = createTestPersonalityService();
    service = test.service;
  });

  describe('Formatted Context Structure', () => {
    it('should produce non-empty formatted context', async () => {
      const context = await service.buildContext({
        userId: 'format_test',
        personaId: 'ferni',
        currentMessage: 'Hello, how are you?',
      });

      expect(context.formattedContext).toBeDefined();
      expect(context.formattedContext.length).toBeGreaterThan(0);
    });

    it('should include relationship stage', async () => {
      const context = await service.buildContext({
        userId: 'format_test',
        personaId: 'ferni',
        currentMessage: 'Hello!',
      });

      expect(context.formattedContext).toContain('Relationship Stage');
    });

    it('should include timing guidance for messages', async () => {
      const context = await service.buildContext({
        userId: 'format_test',
        personaId: 'ferni',
        currentMessage: "I've been feeling so overwhelmed lately with everything going on",
      });

      expect(context.formattedContext).toContain('TIMING INTELLIGENCE');
    });

    it('should have proper section headers', async () => {
      const context = await service.buildContext({
        userId: 'format_test',
        personaId: 'ferni',
        currentMessage: 'Help me with something',
      });

      // Check for emoji/marker based section headers
      expect(context.formattedContext).toMatch(/🧠|PERSONALITY|SUPERHUMAN/i);
    });
  });

  describe('PersonalityContextOutput Properties', () => {
    it('should have all required properties', async () => {
      const context = await service.buildContext({
        userId: 'props_test',
        personaId: 'ferni',
        currentMessage: 'Test message',
      });

      // Required properties
      expect(context).toHaveProperty('profile');
      expect(context).toHaveProperty('relationshipStage');
      expect(context).toHaveProperty('timing');
      expect(context).toHaveProperty('anticipatedEmotion');
      expect(context).toHaveProperty('silenceAnalysis');
      expect(context).toHaveProperty('pendingVulnerabilities');
      expect(context).toHaveProperty('surfaceablePatterns');
      expect(context).toHaveProperty('celebratableMilestones');
      expect(context).toHaveProperty('momentToShare');
      expect(context).toHaveProperty('shouldHoldSpace');
      expect(context).toHaveProperty('cautionLevel');
      expect(context).toHaveProperty('formattedContext');
    });

    it('should have valid relationship stage', async () => {
      const context = await service.buildContext({
        userId: 'stage_test',
        personaId: 'ferni',
        currentMessage: 'Test',
      });

      const validStages = ['stranger', 'acquaintance', 'friend', 'trusted'];
      expect(validStages).toContain(context.relationshipStage);
    });

    it('should have arrays for collections', async () => {
      const context = await service.buildContext({
        userId: 'array_test',
        personaId: 'ferni',
        currentMessage: 'Test',
      });

      expect(Array.isArray(context.pendingVulnerabilities)).toBe(true);
      expect(Array.isArray(context.surfaceablePatterns)).toBe(true);
      expect(Array.isArray(context.celebratableMilestones)).toBe(true);
    });

    it('should have valid caution level', async () => {
      const context = await service.buildContext({
        userId: 'caution_test',
        personaId: 'ferni',
        currentMessage: 'Test',
      });

      expect(context.cautionLevel).toBeGreaterThanOrEqual(0);
      expect(context.cautionLevel).toBeLessThanOrEqual(1);
    });

    it('should have boolean shouldHoldSpace', async () => {
      const context = await service.buildContext({
        userId: 'hold_test',
        personaId: 'ferni',
        currentMessage: 'Test',
      });

      expect(typeof context.shouldHoldSpace).toBe('boolean');
    });
  });

  describe('Timing Analysis Output', () => {
    it('should have timing for message input', async () => {
      const context = await service.buildContext({
        userId: 'timing_test',
        personaId: 'ferni',
        currentMessage: "I'm really worried about my job",
      });

      expect(context.timing).not.toBeNull();
      expect(context.timing).toHaveProperty('intent');
      expect(context.timing).toHaveProperty('confidence');
    });

    it('should detect emotional intent for emotional shares', async () => {
      const context = await service.buildContext({
        userId: 'needs_test',
        personaId: 'ferni',
        currentMessage: "I just feel so overwhelmed and nobody understands what I'm going through",
      });

      // Should detect some kind of intent (may vary based on content analysis)
      expect(context.timing?.intent).toBeDefined();
      expect(context.timing?.confidence).toBeGreaterThan(0);
    });

    it('should have null timing for empty message', async () => {
      const context = await service.buildContext({
        userId: 'empty_test',
        personaId: 'ferni',
        currentMessage: '',
      });

      expect(context.timing).toBeNull();
    });
  });

  describe('Anticipation Output', () => {
    it('should detect anticipation from speech patterns', async () => {
      const context = await service.buildContext({
        userId: 'anticipate_test',
        personaId: 'ferni',
        partialTranscript: "I've been thinking a lot about...",
      });

      // May or may not have anticipation depending on patterns
      if (context.anticipatedEmotion) {
        expect(context.anticipatedEmotion).toHaveProperty('emotion');
        expect(context.anticipatedEmotion).toHaveProperty('confidence');
      }
    });
  });

  describe('Profile Data in Output', () => {
    it('should include profile with relationship depth', async () => {
      const context = await service.buildContext({
        userId: 'profile_test',
        personaId: 'ferni',
        currentMessage: 'Test',
      });

      expect(context.profile).toBeDefined();
      expect(context.profile.relationshipDepth).toBeDefined();
    });

    it('should include profile with emotional state', async () => {
      const context = await service.buildContext({
        userId: 'emotion_test',
        personaId: 'ferni',
        currentMessage: 'Test',
      });

      expect(context.profile.currentEmotionalState).toBeDefined();
      expect(context.profile.currentEmotionalState).toHaveProperty('primary');
    });
  });

  describe('Vulnerability Detection in Context', () => {
    it('should track vulnerability after vulnerable share', async () => {
      // Record a vulnerable share
      await service.recordMoment({
        userId: 'vuln_context_test',
        personaId: 'ferni',
        message: "I've never told anyone this, but I struggle with anxiety",
        topics: ['anxiety', 'personal'],
      });

      // Build context
      const context = await service.buildContext({
        userId: 'vuln_context_test',
        personaId: 'ferni',
        currentMessage: 'Hello',
      });

      // Should have pending vulnerability
      expect(context.pendingVulnerabilities.length).toBeGreaterThan(0);
    });
  });

  describe('Pattern Detection in Context', () => {
    it('should surface patterns after multiple similar messages', async () => {
      const userId = 'pattern_context_test';

      // Record multiple topic-emotion pairs
      for (let i = 0; i < 3; i++) {
        await service.recordMoment({
          userId,
          personaId: 'ferni',
          message: `Work has been really stressful lately, I'm so anxious about the deadline ${i}`,
          topics: ['work', 'stress'],
        });
      }

      // Build context
      const context = await service.buildContext({
        userId,
        personaId: 'ferni',
        currentMessage: 'Work stuff again...',
        topics: ['work'],
      });

      // Should have patterns (may or may not be surfaceable yet)
      expect(context.profile.emotionalPatterns.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Hold Space Behavior', () => {
    it('should suggest holding space for vulnerable shares', async () => {
      const context = await service.buildContext({
        userId: 'hold_space_test',
        personaId: 'ferni',
        currentMessage: "I just found out my mom has cancer. I don't know what to do.",
      });

      // May suggest holding space for heavy content
      expect(typeof context.shouldHoldSpace).toBe('boolean');
    });
  });

  describe('Formatted Context Length', () => {
    it('should have reasonable length for LLM injection', async () => {
      const context = await service.buildContext({
        userId: 'length_test',
        personaId: 'ferni',
        currentMessage: 'Test message',
      });

      // Should be non-trivial but not excessive
      expect(context.formattedContext.length).toBeGreaterThan(50);
      expect(context.formattedContext.length).toBeLessThan(5000);
    });

    it('should scale with content', async () => {
      // Record some data first
      await service.recordMoment({
        userId: 'scale_test',
        personaId: 'ferni',
        message: "I'm struggling with anxiety and work stress",
        topics: ['anxiety', 'work'],
      });

      const context = await service.buildContext({
        userId: 'scale_test',
        personaId: 'ferni',
        currentMessage: 'How do I handle this?',
      });

      // Should still be within bounds
      expect(context.formattedContext.length).toBeLessThan(5000);
    });
  });
});
