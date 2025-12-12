import { beforeEach, describe, expect, it } from 'vitest';

import { evaluateConversationQuality } from '../eval/conversation-quality.js';
import {
  getConversationOrchestrator,
  resetAllMetrics,
  resetAllOrchestrators,
  resetConfigAdapter,
  resetPerformanceOptimizations,
} from '../orchestrator/index.js';

describe('Conversation Quality Evaluator', () => {
  it('should score within 0..1 and detect SSML leakage', () => {
    const score = evaluateConversationQuality({
      userMessage: "I'm not doing great.",
      responseText: '<prosody rate="95%">I hear you.</prosody>',
      userEmotion: 'sad',
      wasPersonalSharing: true,
      turnNumber: 2,
    });

    expect(score.overall).toBeGreaterThanOrEqual(0);
    expect(score.overall).toBeLessThanOrEqual(1);
    expect(score.diagnostics.responseHasSsml).toBe(true);
    expect(score.notes.length).toBeGreaterThan(0);
  });

  describe('Orchestrator output invariants', () => {
    const sessionId = 'quality-eval-session';
    const personaId = 'ferni';
    const userId = 'quality-eval-user';

    beforeEach(() => {
      resetAllOrchestrators();
      resetConfigAdapter();
      resetAllMetrics();
      resetPerformanceOptimizations();
    });

    it('should keep output.text plain (no SSML tags)', async () => {
      const orchestrator = getConversationOrchestrator(sessionId);
      orchestrator.setPersona(personaId);

      const result = await orchestrator.orchestrate({
        personaId,
        sessionId,
        userId,
        turnNumber: 7,
        sessionMinutes: 12,
        userMessage: "I've been feeling overwhelmed lately.",
        userEmotion: 'overwhelmed',
        rawResponse:
          "I'm really sorry. That sounds heavy, and you're not alone in it. What feels hardest right now?",
        wasPersonalSharing: true,
        isSeriousContext: true,
      });

      // Hard invariant: text must not contain SSML tags.
      expect(result.text).not.toMatch(/<\s*(prosody|break|emphasis|say-as|phoneme|audio|voice)\b/i);

      const score = evaluateConversationQuality({
        userMessage: "I've been feeling overwhelmed lately.",
        responseText: result.text,
        userEmotion: 'overwhelmed',
        wasPersonalSharing: true,
        turnNumber: 7,
      });

      expect(score.diagnostics.responseHasSsml).toBe(false);
      expect(score.overall).toBeGreaterThanOrEqual(0);
      expect(score.overall).toBeLessThanOrEqual(1);
    });
  });
});
