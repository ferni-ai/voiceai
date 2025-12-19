/**
 * Speech Orchestrator Tests
 *
 * Tests for the unified speech orchestration layer.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  SpeechOrchestrator,
  getOrchestrator,
  resetOrchestrator,
  resetAllOrchestrators,
  getActiveOrchestratorCount,
} from '../orchestrator/index.js';

describe('SpeechOrchestrator', () => {
  const sessionId = 'test-session-456';
  const personaId = 'ferni';

  afterEach(() => {
    resetAllOrchestrators();
  });

  describe('session management', () => {
    it('should create and retrieve orchestrator for session', () => {
      const orchestrator = getOrchestrator(sessionId, personaId);
      expect(orchestrator).toBeInstanceOf(SpeechOrchestrator);

      // Should return same instance
      const orchestrator2 = getOrchestrator(sessionId, personaId);
      expect(orchestrator2).toBe(orchestrator);
    });

    it('should track active orchestrators', () => {
      expect(getActiveOrchestratorCount()).toBe(0);

      getOrchestrator('session-1', personaId);
      expect(getActiveOrchestratorCount()).toBe(1);

      getOrchestrator('session-2', personaId);
      expect(getActiveOrchestratorCount()).toBe(2);

      resetOrchestrator('session-1');
      expect(getActiveOrchestratorCount()).toBe(1);
    });

    it('should reset orchestrator for session', () => {
      getOrchestrator(sessionId, personaId);
      expect(getActiveOrchestratorCount()).toBe(1);

      resetOrchestrator(sessionId);
      expect(getActiveOrchestratorCount()).toBe(0);
    });

    it('should reset all orchestrators', () => {
      getOrchestrator('session-1', personaId);
      getOrchestrator('session-2', personaId);
      getOrchestrator('session-3', personaId);

      expect(getActiveOrchestratorCount()).toBe(3);

      resetAllOrchestrators();
      expect(getActiveOrchestratorCount()).toBe(0);
    });
  });

  describe('turn tracking', () => {
    it('should track turn numbers', () => {
      const orchestrator = getOrchestrator(sessionId, personaId);

      expect(orchestrator.getTurnNumber()).toBe(0);

      orchestrator.newTurn();
      expect(orchestrator.getTurnNumber()).toBe(1);

      orchestrator.newTurn();
      expect(orchestrator.getTurnNumber()).toBe(2);
    });
  });

  describe('humanize()', () => {
    it('should return humanized response', async () => {
      const orchestrator = getOrchestrator(sessionId, personaId);
      await orchestrator.initialize();

      const result = await orchestrator.humanize('Hello, how can I help you today?', {
        topicWeight: 'medium',
      });

      expect(result).toBeDefined();
      expect(result.ssml).toBeDefined();
      expect(result.originalText).toBe('Hello, how can I help you today?');
      expect(result.appliedFeatures).toBeInstanceOf(Array);
      expect(result.metadata).toBeDefined();
      expect(result.metadata.processingTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('should include metadata about applied features', async () => {
      const orchestrator = getOrchestrator(sessionId, personaId);
      await orchestrator.initialize();

      const result = await orchestrator.humanize('That sounds really difficult.', {
        topicWeight: 'heavy',
        isEmotionalMoment: true,
      });

      expect(result.metadata).toBeDefined();
      expect(result.metadata.speedMultiplier).toBeGreaterThan(0);
      expect(result.metadata.pauseMultiplier).toBeGreaterThan(0);
    });

    it('should respect topic weight', async () => {
      const orchestrator = getOrchestrator(sessionId, personaId);
      await orchestrator.initialize();

      // Heavy topic should get slower pacing
      const heavyResult = await orchestrator.humanize('I understand this is difficult.', {
        topicWeight: 'heavy',
      });

      // Light topic can be faster
      const lightResult = await orchestrator.humanize('That sounds fun!', {
        topicWeight: 'light',
      });

      // Both should be valid
      expect(heavyResult.ssml).toBeDefined();
      expect(lightResult.ssml).toBeDefined();
    });
  });

  describe('analyzeQuick()', () => {
    it('should analyze user text quickly', () => {
      const orchestrator = getOrchestrator(sessionId, personaId);

      const result = orchestrator.analyzeQuick("I'm feeling really stressed about work");

      expect(result).toBeDefined();
      expect(result.emotionalUndercurrent).toBeDefined();
      expect(result.agentGuidance).toBeDefined();
      expect(result.ssmlSuggestions).toBeDefined();
      expect(result.processingTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('should provide guidance for emotional content', () => {
      const orchestrator = getOrchestrator(sessionId, personaId);

      const result = orchestrator.analyzeQuick("I don't know what to do anymore, I'm so lost");

      expect(result.agentGuidance.shouldSlowDown).toBeDefined();
      expect(result.agentGuidance.shouldSoften).toBeDefined();
    });
  });

  describe('getBackchannel()', () => {
    it('should return backchannel decision', () => {
      const orchestrator = getOrchestrator(sessionId, personaId);

      const result = orchestrator.getBackchannel({
        sessionId,
        personaId,
        userSpeechDuration: 5000,
        currentPauseDuration: 1000,
        userEmotion: {
          primary: 'neutral',
          confidence: 0.8,
          intensity: 0.5,
          distressLevel: 0,
          valence: 'neutral' as const,
          markers: [],
          suggestedTone: 'friendly' as const,
        },
        topicWeight: 'medium',
        turnNumber: 3,
      });

      expect(result).toBeDefined();
      expect(typeof result.shouldEmit).toBe('boolean');
      expect(result.reason).toBeDefined();
    });
  });

  describe('getThinkingFiller()', () => {
    it('should return a thinking filler', () => {
      const orchestrator = getOrchestrator(sessionId, personaId);

      const filler = orchestrator.getThinkingFiller();

      expect(filler).toBeDefined();
      expect(typeof filler).toBe('string');
      expect(filler.length).toBeGreaterThan(0);
    });
  });

  describe('switchPersona()', () => {
    it('should switch to a different persona', async () => {
      const orchestrator = getOrchestrator(sessionId, 'ferni');
      await orchestrator.initialize();

      await orchestrator.switchPersona('maya-santos');

      // Should work without error
      const result = await orchestrator.humanize('Hello!', {});
      expect(result).toBeDefined();
    });
  });
});

