/**
 * Pipeline Switcher Tests
 *
 * Verifies dynamic inference routing based on emotion and conversation context.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  selectPipeline,
  isPipelineSwitchingEnabled,
  getDefaultPipeline,
  type PipelineSwitchContext,
  type PipelineSwitchResult,
} from '../pipeline-switcher.js';

// ============================================================================
// HELPERS
// ============================================================================

function makeContext(overrides: Partial<PipelineSwitchContext> = {}): PipelineSwitchContext {
  return {
    turnCount: 3,
    userTranscriptLength: 80,
    isFirstResponse: false,
    ...overrides,
  };
}

function assertMode(result: PipelineSwitchResult, mode: string): void {
  expect(result.mode).toBe(mode);
  expect(result.confidence).toBeGreaterThan(0);
  expect(result.confidence).toBeLessThanOrEqual(1);
  expect(result.reason).toBeTruthy();
}

// ============================================================================
// TESTS
// ============================================================================

describe('PipelineSwitcher', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Reset env for each test
    delete process.env.PIPELINE_SWITCHING;
    delete process.env.DEFAULT_PIPELINE;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  // --------------------------------------------------------------------------
  // isPipelineSwitchingEnabled
  // --------------------------------------------------------------------------

  describe('isPipelineSwitchingEnabled', () => {
    it('returns false by default', () => {
      expect(isPipelineSwitchingEnabled()).toBe(false);
    });

    it('returns true when PIPELINE_SWITCHING=true', () => {
      process.env.PIPELINE_SWITCHING = 'true';
      expect(isPipelineSwitchingEnabled()).toBe(true);
    });

    it('returns false for non-true values', () => {
      process.env.PIPELINE_SWITCHING = 'false';
      expect(isPipelineSwitchingEnabled()).toBe(false);

      process.env.PIPELINE_SWITCHING = '1';
      expect(isPipelineSwitchingEnabled()).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // getDefaultPipeline
  // --------------------------------------------------------------------------

  describe('getDefaultPipeline', () => {
    it('returns omni by default', () => {
      expect(getDefaultPipeline()).toBe('omni');
    });

    it('returns configured pipeline mode', () => {
      process.env.DEFAULT_PIPELINE = 'quality';
      expect(getDefaultPipeline()).toBe('quality');

      process.env.DEFAULT_PIPELINE = 'speed';
      expect(getDefaultPipeline()).toBe('speed');

      process.env.DEFAULT_PIPELINE = 'omni';
      expect(getDefaultPipeline()).toBe('omni');
    });

    it('returns omni for invalid values', () => {
      process.env.DEFAULT_PIPELINE = 'invalid';
      expect(getDefaultPipeline()).toBe('omni');

      process.env.DEFAULT_PIPELINE = '';
      expect(getDefaultPipeline()).toBe('omni');
    });
  });

  // --------------------------------------------------------------------------
  // selectPipeline — switching disabled
  // --------------------------------------------------------------------------

  describe('selectPipeline — switching disabled', () => {
    it('returns default pipeline when switching is disabled', () => {
      const result = selectPipeline(makeContext());
      assertMode(result, 'omni');
      expect(result.confidence).toBe(1.0);
      expect(result.reason).toContain('disabled');
    });

    it('respects DEFAULT_PIPELINE env var when switching is disabled', () => {
      process.env.DEFAULT_PIPELINE = 'quality';
      const result = selectPipeline(makeContext());
      assertMode(result, 'quality');
    });

    it('ignores emotion context when switching is disabled', () => {
      const result = selectPipeline(makeContext({ emotion: 'distressed', stressLevel: 0.9 }));
      assertMode(result, 'omni');
    });
  });

  // --------------------------------------------------------------------------
  // selectPipeline — barge-in recovery
  // --------------------------------------------------------------------------

  describe('selectPipeline — barge-in recovery', () => {
    beforeEach(() => {
      process.env.PIPELINE_SWITCHING = 'true';
    });

    it('selects speed on barge-in regardless of emotion', () => {
      const result = selectPipeline(
        makeContext({ wasInterrupted: true, emotion: 'contemplative' })
      );
      assertMode(result, 'speed');
    });

    it('selects speed on barge-in regardless of transcript length', () => {
      const result = selectPipeline(
        makeContext({ wasInterrupted: true, userTranscriptLength: 500, isQuestion: true })
      );
      assertMode(result, 'speed');
    });

    it('has high confidence for barge-in selection', () => {
      const result = selectPipeline(makeContext({ wasInterrupted: true }));
      expect(result.confidence).toBeGreaterThanOrEqual(0.9);
    });
  });

  // --------------------------------------------------------------------------
  // selectPipeline — first response
  // --------------------------------------------------------------------------

  describe('selectPipeline — first response', () => {
    beforeEach(() => {
      process.env.PIPELINE_SWITCHING = 'true';
    });

    it('selects omni for first response', () => {
      const result = selectPipeline(makeContext({ isFirstResponse: true }));
      assertMode(result, 'omni');
      expect(result.reason).toContain('first');
    });

    it('barge-in takes priority over first response', () => {
      const result = selectPipeline(
        makeContext({ isFirstResponse: true, wasInterrupted: true })
      );
      assertMode(result, 'speed');
    });
  });

  // --------------------------------------------------------------------------
  // selectPipeline — emotion-based routing
  // --------------------------------------------------------------------------

  describe('selectPipeline — emotion-based', () => {
    beforeEach(() => {
      process.env.PIPELINE_SWITCHING = 'true';
    });

    it('selects omni for distressed user', () => {
      const result = selectPipeline(makeContext({ emotion: 'distressed' }));
      assertMode(result, 'omni');
    });

    it('selects omni for angry user', () => {
      const result = selectPipeline(makeContext({ emotion: 'angry' }));
      assertMode(result, 'omni');
    });

    it('increases confidence for distressed + high stress', () => {
      const lowStress = selectPipeline(makeContext({ emotion: 'distressed', stressLevel: 0.3 }));
      const highStress = selectPipeline(makeContext({ emotion: 'distressed', stressLevel: 0.9 }));
      expect(highStress.confidence).toBeGreaterThan(lowStress.confidence);
    });

    it('selects quality for contemplative user', () => {
      const result = selectPipeline(makeContext({ emotion: 'contemplative' }));
      assertMode(result, 'quality');
    });

    it('selects quality for sad user', () => {
      const result = selectPipeline(makeContext({ emotion: 'sad' }));
      assertMode(result, 'quality');
    });

    it('falls through for happy user (no strong emotion signal)', () => {
      const result = selectPipeline(makeContext({ emotion: 'happy' }));
      // Happy falls through to context or default — should not be quality
      expect(result.mode).not.toBe('quality');
    });

    it('falls through for neutral user', () => {
      const result = selectPipeline(makeContext({ emotion: 'neutral' }));
      expect(result.mode).not.toBe('quality');
    });
  });

  // --------------------------------------------------------------------------
  // selectPipeline — context-based overrides
  // --------------------------------------------------------------------------

  describe('selectPipeline — context-based', () => {
    beforeEach(() => {
      process.env.PIPELINE_SWITCHING = 'true';
    });

    it('selects quality for long question (>200 chars + question)', () => {
      const result = selectPipeline(
        makeContext({ userTranscriptLength: 250, isQuestion: true })
      );
      assertMode(result, 'quality');
    });

    it('selects speed for short non-question (<30 chars)', () => {
      const result = selectPipeline(
        makeContext({ userTranscriptLength: 15, isQuestion: false })
      );
      assertMode(result, 'speed');
    });

    it('does not select quality for long non-question', () => {
      const result = selectPipeline(
        makeContext({ userTranscriptLength: 250, isQuestion: false })
      );
      // Long non-question falls through to default (omni)
      assertMode(result, 'omni');
    });

    it('does not select speed for short question', () => {
      const result = selectPipeline(
        makeContext({ userTranscriptLength: 15, isQuestion: true })
      );
      // Short question doesn't trigger speed — falls to default
      expect(result.mode).not.toBe('speed');
    });

    it('emotion takes priority over context', () => {
      const result = selectPipeline(
        makeContext({
          emotion: 'contemplative',
          userTranscriptLength: 15,
          isQuestion: false,
        })
      );
      // Contemplative emotion overrides short-ack → quality not speed
      assertMode(result, 'quality');
    });
  });

  // --------------------------------------------------------------------------
  // selectPipeline — edge cases
  // --------------------------------------------------------------------------

  describe('selectPipeline — edge cases', () => {
    beforeEach(() => {
      process.env.PIPELINE_SWITCHING = 'true';
    });

    it('handles missing emotion gracefully', () => {
      const result = selectPipeline(makeContext({ emotion: undefined }));
      // Falls through to context or default
      expect(result.mode).toBeDefined();
      expect(result.confidence).toBeGreaterThan(0);
    });

    it('handles zero-length transcript', () => {
      const result = selectPipeline(makeContext({ userTranscriptLength: 0 }));
      // Zero length is < 30, not a question → speed
      assertMode(result, 'speed');
    });

    it('handles unknown emotion string', () => {
      const result = selectPipeline(makeContext({ emotion: 'confused_and_bored' }));
      // Unknown emotion falls through to context/default
      expect(result.mode).toBeDefined();
    });

    it('handles stressLevel at boundary (exactly 0.7)', () => {
      const result = selectPipeline(
        makeContext({ emotion: 'distressed', stressLevel: 0.7 })
      );
      assertMode(result, 'omni');
      // Exactly 0.7 should count as high stress
      expect(result.confidence).toBeGreaterThanOrEqual(0.9);
    });

    it('handles stressLevel just below boundary', () => {
      const result = selectPipeline(
        makeContext({ emotion: 'distressed', stressLevel: 0.69 })
      );
      assertMode(result, 'omni');
      // Below threshold → lower confidence
      expect(result.confidence).toBeLessThan(0.9);
    });

    it('confidence is always in 0-1 range', () => {
      const contexts: PipelineSwitchContext[] = [
        makeContext(),
        makeContext({ wasInterrupted: true }),
        makeContext({ emotion: 'distressed', stressLevel: 1.0 }),
        makeContext({ emotion: 'contemplative' }),
        makeContext({ isFirstResponse: true }),
        makeContext({ userTranscriptLength: 500, isQuestion: true }),
        makeContext({ userTranscriptLength: 5 }),
      ];

      for (const ctx of contexts) {
        const result = selectPipeline(ctx);
        expect(result.confidence).toBeGreaterThanOrEqual(0);
        expect(result.confidence).toBeLessThanOrEqual(1);
      }
    });

    it('returns default omni for mid-length neutral input', () => {
      const result = selectPipeline(
        makeContext({
          emotion: 'neutral',
          userTranscriptLength: 100,
          isQuestion: false,
        })
      );
      assertMode(result, 'omni');
    });

    it('handles transcript at exact boundary (200 chars)', () => {
      const result = selectPipeline(
        makeContext({ userTranscriptLength: 200, isQuestion: true })
      );
      // Exactly 200 is NOT > 200, so falls through to default
      expect(result.mode).not.toBe('quality');
    });

    it('handles transcript at exact boundary (30 chars)', () => {
      const result = selectPipeline(
        makeContext({ userTranscriptLength: 30, isQuestion: false })
      );
      // Exactly 30 is NOT < 30, so does not trigger speed
      expect(result.mode).not.toBe('speed');
    });
  });

  // --------------------------------------------------------------------------
  // selectPipeline — priority ordering
  // --------------------------------------------------------------------------

  describe('selectPipeline — priority ordering', () => {
    beforeEach(() => {
      process.env.PIPELINE_SWITCHING = 'true';
    });

    it('priority: barge-in > first response > emotion > context > default', () => {
      // All signals present — barge-in wins
      const bargeIn = selectPipeline(
        makeContext({
          wasInterrupted: true,
          isFirstResponse: true,
          emotion: 'contemplative',
          userTranscriptLength: 250,
          isQuestion: true,
        })
      );
      assertMode(bargeIn, 'speed');

      // Remove barge-in — first response wins
      const firstResp = selectPipeline(
        makeContext({
          isFirstResponse: true,
          emotion: 'contemplative',
          userTranscriptLength: 250,
          isQuestion: true,
        })
      );
      assertMode(firstResp, 'omni');

      // Remove first response — emotion wins
      const emotion = selectPipeline(
        makeContext({
          emotion: 'contemplative',
          userTranscriptLength: 250,
          isQuestion: true,
        })
      );
      assertMode(emotion, 'quality');
    });
  });
});
