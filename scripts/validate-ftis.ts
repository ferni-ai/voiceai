#!/usr/bin/env npx ts-node
/**
 * FTIS Local E2E Validation Script
 *
 * Validates that the Ferni Tool Intelligence System is working correctly.
 * Run before deployment to catch issues early.
 *
 * Usage:
 *   npx ts-node scripts/validate-ftis.ts
 *   pnpm ftis:validate
 */

import { createLogger } from '../src/utils/safe-logger.js';

// Import FTIS components
import { ComplexityClassifier } from '../src/tools/intelligence/planning/complexity-classifier.js';
import { SequencePredictor } from '../src/tools/intelligence/planning/sequence-predictor.js';
import { MCTSPlanner } from '../src/tools/intelligence/planning/mcts/planner.js';
import { TransitionMatrix } from '../src/tools/intelligence/transitions/transition-matrix.js';
import { TransitionLearner } from '../src/tools/intelligence/transitions/transition-learner.js';
import { IntelligentExecutor } from '../src/tools/intelligence/execution/intelligent-executor.js';
import { OutcomeTracker } from '../src/tools/intelligence/learning/outcome-tracker.js';
import { ABTestingManager } from '../src/tools/intelligence/learning/ab-testing.js';
import { LearningPipeline } from '../src/tools/intelligence/learning/learning-pipeline.js';
import type { RouterOutput } from '../src/tools/intelligence/router/inference/types.js';

const log = createLogger({ module: 'ftis:validate' });

// ============================================================================
// VALIDATION TYPES
// ============================================================================

interface ValidationResult {
  name: string;
  passed: boolean;
  duration: number;
  error?: string;
  details?: Record<string, unknown>;
}

interface ValidationSuite {
  results: ValidationResult[];
  totalPassed: number;
  totalFailed: number;
  duration: number;
}

// ============================================================================
// VALIDATORS
// ============================================================================

async function validateComplexityClassifier(): Promise<ValidationResult> {
  const start = Date.now();
  try {
    const classifier = new ComplexityClassifier();

    // Test simple query
    const simple = classifier.classify({ query: 'weather' });
    if (simple.complexity !== 'simple' && simple.confidence < 0.5) {
      throw new Error('Failed to classify simple query correctly');
    }

    // Test complex query
    const complex = classifier.classify({
      query: 'help me analyze and compare multiple strategies for improving productivity this week',
    });
    if (complex.complexity === 'simple') {
      throw new Error('Failed to classify complex query correctly');
    }

    // Test with router output
    const withRouter = classifier.classify({
      query: 'test',
      routerOutput: {
        predictions: [{ toolId: 'test', confidence: 0.95, rank: 1 }],
        topConfidence: 0.95,
        skipLLM: true,
        latencyMs: 10,
        modelVersion: 'test',
      },
    });

    return {
      name: 'ComplexityClassifier',
      passed: true,
      duration: Date.now() - start,
      details: {
        simpleResult: simple.complexity,
        complexResult: complex.complexity,
        withRouterResult: withRouter.complexity,
      },
    };
  } catch (error) {
    return {
      name: 'ComplexityClassifier',
      passed: false,
      duration: Date.now() - start,
      error: String(error),
    };
  }
}

async function validateSequencePredictor(): Promise<ValidationResult> {
  const start = Date.now();
  try {
    const matrix = new TransitionMatrix();
    const predictor = new SequencePredictor();

    // Seed transitions
    matrix.recordTransition('weather', 'calendar', { personaId: 'ferni' });
    matrix.recordTransition('calendar', 'tasks', { personaId: 'ferni' });
    predictor.setTransitionMatrix(matrix);

    const routerOutput: RouterOutput = {
      predictions: [{ toolId: 'weather', confidence: 0.8, rank: 1 }],
      topConfidence: 0.8,
      skipLLM: false,
      latencyMs: 10,
      modelVersion: 'test',
    };

    const sequence = predictor.predict(routerOutput, {
      personaId: 'ferni',
      timeOfDay: 'morning',
    });

    if (sequence.steps.length === 0) {
      throw new Error('Sequence prediction returned empty');
    }

    if (sequence.steps[0].toolId !== 'weather') {
      throw new Error('First step should be weather');
    }

    return {
      name: 'SequencePredictor',
      passed: true,
      duration: Date.now() - start,
      details: {
        stepCount: sequence.steps.length,
        firstTool: sequence.steps[0].toolId,
        confidence: sequence.confidence,
      },
    };
  } catch (error) {
    return {
      name: 'SequencePredictor',
      passed: false,
      duration: Date.now() - start,
      error: String(error),
    };
  }
}

async function validateMCTSPlanner(): Promise<ValidationResult> {
  const start = Date.now();
  try {
    const planner = new MCTSPlanner({
      maxSimulations: 20,
      timeoutMs: 200,
    });

    const plan = planner.plan({
      query: 'plan my morning',
      availableTools: ['weather', 'calendar', 'habits'],
      personaId: 'ferni',
    });

    if (plan.simulationCount === 0) {
      throw new Error('No simulations were run');
    }

    const stats = planner.getStats();
    if (stats.nodeCount === 0) {
      throw new Error('No nodes were created');
    }

    return {
      name: 'MCTSPlanner',
      passed: true,
      duration: Date.now() - start,
      details: {
        simulationCount: plan.simulationCount,
        toolsPlanned: plan.tools.length,
        nodeCount: stats.nodeCount,
      },
    };
  } catch (error) {
    return {
      name: 'MCTSPlanner',
      passed: false,
      duration: Date.now() - start,
      error: String(error),
    };
  }
}

async function validateTransitionMatrix(): Promise<ValidationResult> {
  const start = Date.now();
  try {
    const matrix = new TransitionMatrix();

    // Record transitions
    matrix.recordTransition('a', 'b', { personaId: 'ferni' });
    matrix.recordTransition('a', 'b', { personaId: 'ferni' });
    matrix.recordTransition('a', 'c', { personaId: 'ferni' });

    // Get predictions
    const predictions = matrix.getPredictions('a');
    if (predictions.length === 0) {
      throw new Error('No predictions returned');
    }

    // Verify probabilities
    const bPrediction = predictions.find((p) => p.toolId === 'b');
    if (!bPrediction || bPrediction.probability <= 0) {
      throw new Error('B prediction missing or invalid');
    }

    // Test export/import
    const exported = matrix.export();
    const newMatrix = new TransitionMatrix();
    newMatrix.import(exported);
    const reimported = newMatrix.getPredictions('a');
    if (reimported.length !== predictions.length) {
      throw new Error('Export/import mismatch');
    }

    return {
      name: 'TransitionMatrix',
      passed: true,
      duration: Date.now() - start,
      details: {
        predictionCount: predictions.length,
        topPrediction: predictions[0],
        exportSize: exported.transitions.length,
      },
    };
  } catch (error) {
    return {
      name: 'TransitionMatrix',
      passed: false,
      duration: Date.now() - start,
      error: String(error),
    };
  }
}

async function validateExecutor(): Promise<ValidationResult> {
  const start = Date.now();
  try {
    const mockExecutor = async (toolId: string, args: Record<string, unknown>) => {
      return { success: true, data: { toolId, args } };
    };

    const executor = new IntelligentExecutor(mockExecutor);

    // Test single tool
    const single = await executor.executeTool('test_tool', { param: 'value' });
    if (!single.success) {
      throw new Error('Single tool execution failed');
    }

    // Test multiple tools
    const multi = await executor.executeTools(['a', 'b', 'c']);
    if (!multi.success || multi.results.length !== 3) {
      throw new Error('Multi tool execution failed');
    }

    // Test parallel execution
    const parallel = await executor.executeTools(['x', 'y', 'z'], { parallel: true });
    if (!parallel.success) {
      throw new Error('Parallel execution failed');
    }

    const stats = executor.getStats();

    return {
      name: 'IntelligentExecutor',
      passed: true,
      duration: Date.now() - start,
      details: {
        singleToolSuccess: single.success,
        multiToolCount: multi.results.length,
        totalExecutions: stats.totalExecutions,
      },
    };
  } catch (error) {
    return {
      name: 'IntelligentExecutor',
      passed: false,
      duration: Date.now() - start,
      error: String(error),
    };
  }
}

async function validateLearningComponents(): Promise<ValidationResult> {
  const start = Date.now();
  try {
    // Outcome tracker
    const tracker = new OutcomeTracker();
    tracker.track({
      sessionId: 'test',
      turnId: 'turn-1',
      toolId: 'weather',
      query: 'test',
      selectedBy: 'router',
      confidence: 0.9,
      wasExecuted: true,
      executionSuccess: true,
      executionLatencyMs: 50,
      userContinued: true,
      followUpTools: [],
      personaId: 'ferni',
    });

    const trackerStats = tracker.getStats();
    if (trackerStats.totalTracked !== 1) {
      throw new Error('Tracker did not record outcome');
    }

    // A/B testing
    const abManager = new ABTestingManager();
    abManager.createExperiment({
      id: 'test-exp',
      name: 'Test',
      description: '',
      variants: [
        { id: 'control', name: 'Control', trafficPercent: 50, config: {}, isControl: true },
        { id: 'treatment', name: 'Treatment', trafficPercent: 50, config: {}, isControl: false },
      ],
      startDate: new Date(),
      endDate: null,
      minSampleSize: 10,
      primaryMetric: 'success',
      secondaryMetrics: [],
    });

    const variant = abManager.getVariant('user-1', 'test-exp');
    if (!variant) {
      throw new Error('A/B testing did not assign variant');
    }

    // Learning pipeline
    const pipeline = new LearningPipeline();
    const state = pipeline.getState();
    if (!state) {
      throw new Error('Pipeline state not available');
    }

    return {
      name: 'LearningComponents',
      passed: true,
      duration: Date.now() - start,
      details: {
        trackerWorking: trackerStats.totalTracked === 1,
        abTestingWorking: !!variant,
        pipelineState: state.currentModelVersion,
      },
    };
  } catch (error) {
    return {
      name: 'LearningComponents',
      passed: false,
      duration: Date.now() - start,
      error: String(error),
    };
  }
}

// ============================================================================
// MAIN RUNNER
// ============================================================================

async function runValidation(): Promise<ValidationSuite> {
  const start = Date.now();
  const results: ValidationResult[] = [];

  console.log('\n' + '='.repeat(60));
  console.log('FTIS E2E VALIDATION');
  console.log('='.repeat(60) + '\n');

  // Run all validators
  const validators = [
    validateComplexityClassifier,
    validateSequencePredictor,
    validateMCTSPlanner,
    validateTransitionMatrix,
    validateExecutor,
    validateLearningComponents,
  ];

  for (const validator of validators) {
    const result = await validator();
    results.push(result);

    const status = result.passed ? '✅' : '❌';
    console.log(`${status} ${result.name} (${result.duration}ms)`);
    if (!result.passed) {
      console.log(`   Error: ${result.error}`);
    }
  }

  const totalPassed = results.filter((r) => r.passed).length;
  const totalFailed = results.filter((r) => !r.passed).length;
  const duration = Date.now() - start;

  console.log('\n' + '='.repeat(60));
  console.log(`RESULT: ${totalPassed}/${results.length} validations passed`);
  console.log(`Total duration: ${duration}ms`);
  console.log('='.repeat(60) + '\n');

  return {
    results,
    totalPassed,
    totalFailed,
    duration,
  };
}

// CLI entry point
runValidation()
  .then((suite) => {
    if (suite.totalFailed > 0) {
      process.exit(1);
    }
    process.exit(0);
  })
  .catch((error) => {
    console.error('Validation failed:', error);
    process.exit(1);
  });
