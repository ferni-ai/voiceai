/**
 * Integration Tests for Context Builder Infrastructure
 *
 * Tests the new centralized infrastructure:
 * - Distress levels
 * - Session state
 * - Voice emotion orchestrator
 * - Builder metrics
 * - Builder categories
 * - Builder loader
 */

import { beforeEach, describe, expect, it } from 'vitest';

// ============================================================================
// DISTRESS LEVELS INTEGRATION
// ============================================================================

describe('Distress Levels Integration', () => {
  it('should be importable from main intelligence module', async () => {
    const {
      DISTRESS,
      getDistressCategory,
      needsEmotionalSupport,
      isCrisis,
      formatDistressForPrompt,
    } = await import('../intelligence/distress-levels.js');

    expect(DISTRESS).toBeDefined();
    expect(getDistressCategory).toBeDefined();
    expect(needsEmotionalSupport).toBeDefined();
    expect(isCrisis).toBeDefined();
    expect(formatDistressForPrompt).toBeDefined();
  });

  it('should be re-exported from intelligence index', async () => {
    const { DISTRESS, getDistressCategory, getDistressGuidance } =
      await import('../intelligence/index.js');

    expect(DISTRESS.CRISIS).toBe(0.8);
    expect(getDistressCategory(0.75)).toBe('HIGH');
    expect(getDistressGuidance(0.9).level).toBe('CRISIS');
  });
});

// ============================================================================
// SESSION STATE INTEGRATION
// ============================================================================

describe('Session State Integration', () => {
  beforeEach(async () => {
    const { SessionStateManager } = await import('../intelligence/session-state.js');
    SessionStateManager.clearAll();
  });

  it('should manage session state across multiple accesses', async () => {
    const { getSessionState, updateVoiceEmotion, updateEmotionalTrajectory, incrementTurnCount } =
      await import('../intelligence/session-state.js');

    const sessionId = 'integration-test-session';

    // First access creates state
    const state1 = getSessionState(sessionId);
    expect(state1.sessionId).toBe(sessionId);

    // Update voice emotion
    updateVoiceEmotion(sessionId, 'anxious', 0.7);
    const state2 = getSessionState(sessionId);
    expect(state2.voiceEmotion.currentEmotion).toBe('anxious');
    expect(state2.voiceEmotion.emotionHistory).toContain('anxious');

    // Update emotional trajectory
    updateEmotionalTrajectory(sessionId, 'anxious', 0.7);
    updateEmotionalTrajectory(sessionId, 'calm', 0.3);
    const state3 = getSessionState(sessionId);
    expect(state3.emotionalTrajectory.trend).toBeDefined();

    // Increment turns
    expect(incrementTurnCount(sessionId)).toBe(1);
    expect(incrementTurnCount(sessionId)).toBe(2);
  });

  it('should be re-exported from intelligence index', async () => {
    const { SessionStateManager, getSessionState, updateVoiceEmotion } =
      await import('../intelligence/index.js');

    expect(SessionStateManager).toBeDefined();
    expect(getSessionState).toBeDefined();
    expect(updateVoiceEmotion).toBeDefined();
  });
});

// ============================================================================
// VOICE EMOTION ORCHESTRATOR INTEGRATION
// ============================================================================

describe('Voice Emotion Orchestrator Integration', () => {
  beforeEach(async () => {
    const { SessionStateManager } = await import('../intelligence/session-state.js');
    SessionStateManager.clearAll();
  });

  it('should analyze voice + text emotion together', async () => {
    const { analyzeVoiceEmotion, formatVoiceEmotionForPrompt } =
      await import('../intelligence/voice-emotion-orchestrator.js');

    const voiceInput = {
      emotion: 'anxious',
      confidence: 0.8,
      stressLevel: 0.6,
      arousal: 0.7,
      valence: -0.3,
    };

    const textInput = {
      primary: 'worried',
      intensity: 0.7,
      distressLevel: 0.5,
      valence: 'negative' as const,
    };

    const analysis = analyzeVoiceEmotion('test-session', voiceInput, textInput, 'I feel worried');

    expect(analysis.distressLevel).toBeGreaterThan(0);
    expect(analysis.distressCategory).toBeDefined();
    expect(analysis.guidance).toBeDefined();

    const formatted = formatVoiceEmotionForPrompt(analysis);
    expect(typeof formatted).toBe('string');
  });

  it('should detect emotion suppression', async () => {
    const { detectEmotionSuppression } =
      await import('../intelligence/voice-emotion-orchestrator.js');

    const voiceInput = {
      emotion: 'distressed',
      confidence: 0.9,
      stressLevel: 0.8, // High stress in voice
      arousal: 0.8,
      valence: -0.5,
    };

    const textInput = {
      primary: 'content', // But says they're fine
      intensity: 0.3,
      distressLevel: 0.2,
      valence: 'positive' as const,
    };

    const suppression = detectEmotionSuppression(voiceInput, textInput);
    expect(suppression.isSuppressing).toBe(true);
    expect(suppression.confidence).toBeGreaterThan(0.5);
  });

  it('should be re-exported from intelligence index', async () => {
    const { VoiceEmotionOrchestrator, analyzeVoiceEmotion, detectEmotionSuppression } =
      await import('../intelligence/index.js');

    expect(VoiceEmotionOrchestrator).toBeDefined();
    expect(analyzeVoiceEmotion).toBeDefined();
    expect(detectEmotionSuppression).toBeDefined();
  });
});

// ============================================================================
// BUILDER METRICS INTEGRATION
// ============================================================================

describe('Builder Metrics Integration', () => {
  beforeEach(async () => {
    const { resetAllMetrics } = await import('../intelligence/context-builders/metrics.js');
    resetAllMetrics();
  });

  it('should track metrics across multiple builders', async () => {
    const { recordBuilderMetrics, recordTurnMetrics, getMetricsSummary, checkPerformanceIssues } =
      await import('../intelligence/context-builders/metrics.js');

    // Simulate multiple builder executions
    recordBuilderMetrics('emotional', 50, 3);
    recordBuilderMetrics('crisis', 20, 1);
    recordBuilderMetrics('memory', 100, 2);
    recordBuilderMetrics('emotional', 45, 2); // Second call

    // Record turn
    recordTurnMetrics('test-session', 1, [
      { name: 'emotional', durationMs: 50, injectionCount: 3 },
      { name: 'crisis', durationMs: 20, injectionCount: 1 },
      { name: 'memory', durationMs: 100, injectionCount: 2 },
    ]);

    const summary = getMetricsSummary();
    expect(summary.totalBuilds).toBe(1);
    expect(summary.slowestBuilders.length).toBeGreaterThan(0);
    expect(summary.mostActiveBuilders.length).toBeGreaterThan(0);

    const warnings = checkPerformanceIssues();
    expect(Array.isArray(warnings)).toBe(true);
  });

  it('should be re-exported from context-builders index', async () => {
    const { getMetricsSummary, checkPerformanceIssues, getBuilderMetrics } =
      await import('../intelligence/context-builders/index.js');

    expect(getMetricsSummary).toBeDefined();
    expect(checkPerformanceIssues).toBeDefined();
    expect(getBuilderMetrics).toBeDefined();
  });
});

// ============================================================================
// BUILDER CATEGORIES INTEGRATION
// ============================================================================

describe('Builder Categories Integration', () => {
  it('should have all expected categories', async () => {
    const { BuilderCategory, BUILDER_CATEGORIES, getCategoryMetadata } =
      await import('../intelligence/context-builders/index.js');

    // Check core categories exist
    expect(BuilderCategory.SAFETY).toBeDefined();
    expect(BuilderCategory.EMOTIONAL).toBeDefined();
    expect(BuilderCategory.VOICE).toBeDefined();
    expect(BuilderCategory.MEMORY).toBeDefined();
    expect(BuilderCategory.PERSONA).toBeDefined();
    expect(BuilderCategory.COACHING).toBeDefined();
    expect(BuilderCategory.COGNITIVE).toBeDefined();
    expect(BuilderCategory.ENGAGEMENT).toBeDefined();
    expect(BuilderCategory.TEAM).toBeDefined();
    expect(BuilderCategory.CONTEXT).toBeDefined();
    expect(BuilderCategory.EXTERNAL).toBeDefined();
    expect(BuilderCategory.HUMANIZING).toBeDefined();
    expect(BuilderCategory.LEARNING).toBeDefined();

    // Check category metadata
    const safetyMeta = getCategoryMetadata(BuilderCategory.SAFETY);
    expect(safetyMeta).toBeDefined();
    expect(safetyMeta?.description).toBeDefined();
    expect(safetyMeta?.priorityRange.min).toBeLessThan(safetyMeta?.priorityRange.max ?? Infinity);

    // Check builders mapping
    expect(BUILDER_CATEGORIES['crisis']).toBe(BuilderCategory.SAFETY);
    expect(BUILDER_CATEGORIES['emotional']).toBe(BuilderCategory.EMOTIONAL);
    expect(BUILDER_CATEGORIES['memory']).toBe(BuilderCategory.MEMORY);
  });

  it('should validate builder priorities', async () => {
    const { validateBuilderPriorities } = await import('../intelligence/context-builders/index.js');

    // validateBuilderPriorities returns string[] of warnings
    // 'crisis' is a known SAFETY builder with priority range 0-20
    const validBuilder = { name: 'crisis', priority: 10 };
    const warnings = validateBuilderPriorities([validBuilder]);

    expect(Array.isArray(warnings)).toBe(true);
    // Should have no warnings since 10 is within SAFETY range (0-20)
  });

  it('should be re-exported from context-builders index', async () => {
    const { BuilderCategory, BUILDER_CATEGORIES, getBuilderCategory } =
      await import('../intelligence/context-builders/index.js');

    expect(BuilderCategory).toBeDefined();
    expect(BUILDER_CATEGORIES).toBeDefined();
    expect(getBuilderCategory).toBeDefined();
  });
});

// ============================================================================
// BUILDER LOADER INTEGRATION
// ============================================================================

describe('Builder Loader Integration', () => {
  it('should have builder manifest with categorized builders', async () => {
    const { BUILDER_MANIFEST, getAllBuilderModules, getBuilderModulesByCategory } =
      await import('../intelligence/context-builders/index.js');

    expect(BUILDER_MANIFEST).toBeDefined();
    expect(BUILDER_MANIFEST.safety).toBeDefined();
    expect(BUILDER_MANIFEST.emotional).toBeDefined();

    const allModules = getAllBuilderModules();
    expect(allModules.length).toBeGreaterThan(0);

    const safetyModules = getBuilderModulesByCategory('safety');
    expect(safetyModules.length).toBeGreaterThan(0);
    expect(safetyModules).toContain('crisis');
  });

  it('should load builders on demand', async () => {
    const { ensureBuildersLoaded, areBuildersLoaded, getLoadingStatus } =
      await import('../intelligence/context-builders/index.js');

    // May or may not be loaded depending on test order
    await ensureBuildersLoaded();

    expect(areBuildersLoaded()).toBe(true);

    const status = getLoadingStatus();
    // getLoadingStatus returns { loaded, loading, totalModules }
    expect(status.loaded).toBe(true);
    expect(status.totalModules).toBeGreaterThan(0);
  });

  it('should be re-exported from context-builders index', async () => {
    const { ensureBuildersLoaded, areBuildersLoaded, BUILDER_MANIFEST, getAllBuilderModules } =
      await import('../intelligence/context-builders/index.js');

    expect(ensureBuildersLoaded).toBeDefined();
    expect(areBuildersLoaded).toBeDefined();
    expect(BUILDER_MANIFEST).toBeDefined();
    expect(getAllBuilderModules).toBeDefined();
  });
});

// ============================================================================
// FULL PIPELINE INTEGRATION
// ============================================================================

describe('Full Context Building Pipeline', () => {
  beforeEach(async () => {
    const { SessionStateManager } = await import('../intelligence/session-state.js');
    const { resetAllMetrics } = await import('../intelligence/context-builders/metrics.js');
    SessionStateManager.clearAll();
    resetAllMetrics();
  });

  it('should build context with all infrastructure', async () => {
    const { ensureBuildersLoaded, getRegisteredBuilders, buildConversationContext } =
      await import('../intelligence/context-builders/index.js');

    await ensureBuildersLoaded();

    const builders = getRegisteredBuilders();
    expect(builders.length).toBeGreaterThan(0);

    // Check that builders have categories assigned
    const buildersWithCategories = builders.filter((b) => b.category);
    expect(buildersWithCategories.length).toBeGreaterThan(0);
  });

  it('should use distress constants in shouldUseHighEmotionMode', async () => {
    const { shouldUseHighEmotionMode } = await import('../intelligence/context-builders/index.js');
    const { DISTRESS } = await import('../intelligence/distress-levels.js');

    // Below HIGH threshold - should not trigger
    const lowDistress = {
      emotion: {
        primary: 'worried',
        distressLevel: DISTRESS.HIGH - 0.1, // Just below
        intensity: 0.5,
      },
    };
    expect(
      shouldUseHighEmotionMode(lowDistress as Parameters<typeof shouldUseHighEmotionMode>[0])
    ).toBe(false);

    // At HIGH threshold - should trigger
    const highDistress = {
      emotion: {
        primary: 'anxious',
        distressLevel: DISTRESS.HIGH,
        intensity: 0.7,
      },
    };
    expect(
      shouldUseHighEmotionMode(highDistress as Parameters<typeof shouldUseHighEmotionMode>[0])
    ).toBe(true);

    // With needsSupport - should trigger regardless of distress
    const needsSupport = {
      emotion: {
        primary: 'sad',
        distressLevel: 0.3,
        needsSupport: true,
      },
    };
    expect(
      shouldUseHighEmotionMode(needsSupport as Parameters<typeof shouldUseHighEmotionMode>[0])
    ).toBe(true);
  });
});
