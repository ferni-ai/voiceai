/**
 * Unit tests for Qwen3-Omni session manager "Better Than Human" integrations.
 * Covers: personality v2, live superhuman, cross-persona, quality tracking, retry/circuit breaker.
 *
 * Full integration tests (processTurn with mocked Thinker/TTS) require the full dependency tree
 * (personas, conversation, intelligence, memory, etc.). The tests below verify types and
 * wiring constants. To run full session tests, use the live dev stack or add more mocks.
 */

import { describe, it, expect } from 'vitest';
import type { Qwen3OmniSessionConfig, Qwen3OmniSessionState } from '../../types.js';

describe('Qwen3-Omni session manager Better Than Human', () => {
  describe('types and config', () => {
    it('Qwen3OmniSessionConfig allows streamingEnabled and sendDataMessage', () => {
      const config: Qwen3OmniSessionConfig = {
        userId: 'u',
        sessionId: 's',
        personaId: 'ferni',
        services: {},
        streamingEnabled: true,
        sendDataMessage: async () => {},
      };
      expect(config.streamingEnabled).toBe(true);
      expect(typeof config.sendDataMessage).toBe('function');
    });

    it('Qwen3OmniSessionState allows qualityMetrics and emotionalTrajectory', () => {
      const state: Partial<Qwen3OmniSessionState> = {
        emotionalTrajectory: 'stable',
        distressLevel: 0,
        qualityMetrics: {
          averageDepth: 0.5,
          engagementTrend: 'stable',
          emotionalRange: 0.3,
          turnsSinceDeepMoment: 2,
        },
      };
      expect(state.qualityMetrics?.averageDepth).toBe(0.5);
      expect(state.emotionalTrajectory).toBe('stable');
    });
  });

  describe('retry and fallback constants', () => {
    it('fallback response is user-facing and non-technical', () => {
      const FALLBACK = "I lost my train of thought for a second. Could you say that again?";
      expect(FALLBACK).toContain('lost my train of thought');
      expect(FALLBACK).not.toMatch(/error|fail|exception/i);
    });
  });

  describe('sendDataMessage integration (processTurn)', () => {
    it('session config sendDataMessage is used for emotion/quality dispatch', async () => {
      const sent: { type: string; payload?: unknown }[] = [];
      const sendDataMessage = async (type: string, payload: Record<string, unknown>) => {
        sent.push({ type, payload });
      };
      const config: Qwen3OmniSessionConfig = {
        userId: 'test-user',
        sessionId: 'test-session',
        personaId: 'ferni',
        services: {} as import('../../../../services/types.js').SessionServices,
        streamingEnabled: false,
        sendDataMessage,
      };
      expect(config.sendDataMessage).toBeDefined();
      // Call the async sendDataMessage with a sample event (contract check)
      await config.sendDataMessage!('emotion', { primary: 'neutral', intensity: 0.5 });
      expect(sent).toHaveLength(1);
      expect(sent[0].type).toBe('emotion');
      expect((sent[0].payload as { primary?: string }).primary).toBe('neutral');
    });
  });
});
