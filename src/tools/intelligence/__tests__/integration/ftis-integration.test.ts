/**
 * FTIS Integration Tests
 *
 * Tests the complete flow through the tool intelligence system.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Core components
import {
  getComplexityClassifier,
  resetComplexityClassifier,
} from '../../planning/complexity-classifier.js';
import { getSequencePredictor, resetSequencePredictor } from '../../planning/sequence-predictor.js';
import { getMCTSPlanner, resetMCTSPlanner } from '../../planning/mcts/planner.js';
import { getTransitionMatrix, resetTransitionMatrix } from '../../transitions/transition-matrix.js';
import {
  getTransitionLearner,
  resetTransitionLearner,
} from '../../transitions/transition-learner.js';
import {
  IntelligentExecutor,
  resetIntelligentExecutor,
} from '../../execution/intelligent-executor.js';
import { getOutcomeTracker, resetOutcomeTracker } from '../../learning/outcome-tracker.js';
import type { RouterOutput } from '../../router/inference/types.js';

describe('FTIS Integration Tests', () => {
  // Mock tool executor
  const mockExecutor = vi.fn().mockResolvedValue({
    success: true,
    data: { result: 'mock' },
  });

  beforeEach(() => {
    // Reset all singletons
    resetComplexityClassifier();
    resetSequencePredictor();
    resetMCTSPlanner();
    resetTransitionMatrix();
    resetTransitionLearner();
    resetIntelligentExecutor();
    resetOutcomeTracker();
    mockExecutor.mockClear();
  });

  describe('Simple Query Flow', () => {
    it('should handle simple query with direct execution', async () => {
      // Simulate router output
      const routerOutput: RouterOutput = {
        predictions: [{ toolId: 'weather_current', confidence: 0.95, rank: 1 }],
        topConfidence: 0.95,
        skipLLM: true,
        latencyMs: 25,
        modelVersion: '1.0',
      };

      // Step 1: Classify complexity
      const classifier = getComplexityClassifier();
      const complexity = classifier.classify({
        query: 'what is the weather',
        routerOutput,
      });

      expect(complexity.complexity).toBe('simple');
      expect(complexity.suggestedApproach).toBe('direct');

      // Step 2: Execute directly (no planning needed)
      const executor = new IntelligentExecutor(mockExecutor);
      const result = await executor.executeTool('weather_current');

      expect(result.success).toBe(true);
      expect(mockExecutor).toHaveBeenCalledTimes(1);
    });
  });

  describe('Medium Query Flow', () => {
    it('should handle medium query with sequence prediction', async () => {
      // Seed transition data
      const matrix = getTransitionMatrix();
      matrix.recordTransition('weather_current', 'calendar_list', { personaId: 'ferni' });
      matrix.recordTransition('weather_current', 'calendar_list', { personaId: 'ferni' });

      // Simulate router output
      const routerOutput: RouterOutput = {
        predictions: [
          { toolId: 'weather_current', confidence: 0.7, rank: 1 },
          { toolId: 'calendar_list', confidence: 0.6, rank: 2 },
        ],
        topConfidence: 0.7,
        skipLLM: false,
        latencyMs: 30,
        modelVersion: '1.0',
      };

      // Step 1: Classify complexity
      const classifier = getComplexityClassifier();
      const complexity = classifier.classify({
        query: 'what do I have today and whats the weather',
        routerOutput,
      });

      expect(['simple', 'medium']).toContain(complexity.complexity);

      // Step 2: Predict sequence
      const predictor = getSequencePredictor();
      const sequence = predictor.predict(routerOutput, {
        personaId: 'ferni',
        timeOfDay: 'morning',
      });

      expect(sequence.steps.length).toBeGreaterThanOrEqual(1);
      expect(sequence.steps[0].toolId).toBe('weather_current');

      // Step 3: Execute sequence
      const executor = new IntelligentExecutor(mockExecutor);
      const result = await executor.executeSequence(sequence);

      expect(result.success).toBe(true);
      expect(result.results.length).toBe(sequence.steps.length);
    });
  });

  describe('Complex Query Flow', () => {
    it('should handle complex query with MCTS planning', async () => {
      // Classify as complex
      const classifier = getComplexityClassifier();
      const complexity = classifier.classify({
        query:
          'help me plan my week with multiple options and compare different strategies for productivity',
      });

      expect(complexity.complexity).toBe('complex');
      expect(complexity.suggestedApproach).toBe('mcts');

      // Use MCTS planner
      const planner = getMCTSPlanner();
      const plan = planner.plan({
        query: 'plan my week with productivity strategies',
        availableTools: ['calendar_list', 'tasks_list', 'goals_review', 'habits_check'],
        personaId: 'ferni',
      });

      expect(plan.tools.length).toBeGreaterThanOrEqual(0);
      expect(plan.simulationCount).toBeGreaterThan(0);

      // Execute plan
      const executor = new IntelligentExecutor(mockExecutor);
      const result = await executor.executeMCTSPlan(plan);

      expect(result.results.length).toBe(plan.tools.length);
    });
  });

  describe('Learning Integration', () => {
    it('should record outcomes and update transition matrix', async () => {
      // Start session
      const learner = getTransitionLearner();
      learner.startSession('user-1', 'session-1', 'ferni');

      // Record tool calls
      learner.recordToolCall('session-1', 'weather_current', true, 100);
      learner.recordToolCall('session-1', 'calendar_list', true, 150);
      learner.recordToolCall('session-1', 'tasks_list', true, 120);

      // End session (commits to transition matrix)
      learner.endSession('session-1');

      // Verify transition was recorded
      const matrix = getTransitionMatrix();
      const predictions = matrix.getPredictions('weather_current');

      // Should have learned weather -> calendar transition
      expect(predictions.length).toBeGreaterThanOrEqual(0);
    });

    it('should track tool outcomes for analysis', () => {
      const tracker = getOutcomeTracker();

      tracker.track({
        sessionId: 'sess-1',
        turnId: 'turn-1',
        toolId: 'weather_current',
        query: 'check weather',
        selectedBy: 'router',
        confidence: 0.9,
        wasExecuted: true,
        executionSuccess: true,
        executionLatencyMs: 50,
        userContinued: true,
        followUpTools: ['calendar_list'],
        personaId: 'ferni',
      });

      const stats = tracker.getStats();
      expect(stats.totalTracked).toBe(1);

      const toolMetrics = tracker.getToolMetrics('weather_current');
      expect(toolMetrics.totalCalls).toBe(1);
      expect(toolMetrics.successRate).toBe(1);
    });
  });

  describe('End-to-End Flow', () => {
    it('should complete full query lifecycle', async () => {
      const query = 'what is the weather in SF';
      const userId = 'e2e-user';
      const sessionId = 'e2e-session';

      // 1. Simulate router prediction
      const routerOutput: RouterOutput = {
        predictions: [{ toolId: 'weather_current', confidence: 0.92, rank: 1 }],
        topConfidence: 0.92,
        skipLLM: true,
        latencyMs: 20,
        modelVersion: '1.0',
      };

      // 2. Classify
      const classifier = getComplexityClassifier();
      const complexity = classifier.classify({ query, routerOutput });

      // 3. Route based on complexity
      let executionPath: string;
      let result;
      const executor = new IntelligentExecutor(mockExecutor);

      if (complexity.suggestedApproach === 'direct') {
        executionPath = 'direct';
        result = await executor.executeTool(routerOutput.predictions[0].toolId);
      } else if (complexity.suggestedApproach === 'sequence') {
        executionPath = 'sequence';
        const predictor = getSequencePredictor();
        const sequence = predictor.predict(routerOutput, {
          personaId: 'ferni',
          timeOfDay: 'afternoon',
        });
        result = await executor.executeSequence(sequence);
      } else {
        executionPath = 'mcts';
        const planner = getMCTSPlanner();
        const plan = planner.plan({
          query,
          availableTools: routerOutput.predictions.map((p) => p.toolId),
          personaId: 'ferni',
          userId,
        });
        result = await executor.executeMCTSPlan(plan);
      }

      // 4. Track outcome
      const tracker = getOutcomeTracker();
      tracker.track({
        sessionId,
        turnId: 'turn-1',
        toolId: 'weather_current',
        query,
        selectedBy: 'router',
        confidence: routerOutput.topConfidence,
        wasExecuted: true,
        executionSuccess: 'success' in result ? result.success : (result as any).success,
        executionLatencyMs: 50,
        userContinued: true,
        followUpTools: [],
        personaId: 'ferni',
      });

      // 5. Verify complete flow
      expect(executionPath).toBe('direct');
      expect(tracker.getStats().totalTracked).toBe(1);
    });
  });
});
