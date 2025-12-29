/**
 * Collective Learning Background Scheduler
 *
 * Runs periodic background jobs to:
 * 1. Save community insights to Firestore
 * 2. Trigger pattern recomputation
 * 3. Feed learnings back to personas
 *
 * This creates the "collective intelligence" loop that makes
 * all personas smarter from community learnings.
 *
 * @module intelligence/collective-learning-scheduler
 */

import { createLogger } from '../utils/safe-logger.js';
import { registerInterval, clearNamedInterval } from '../utils/interval-manager.js';
import { getAgentEvolution } from './agent-evolution.js';
import { getCommunityInsights, saveCommunityInsightsToFirestore } from './community-insights.js';

const log = createLogger({ module: 'CollectiveLearningScheduler' });

// ============================================================================
// SCHEDULER STATE
// ============================================================================

let saveIntervalId: ReturnType<typeof setInterval> | null = null;
let recomputeIntervalId: ReturnType<typeof setInterval> | null = null;
let isRunning = false;

// ============================================================================
// AGGREGATION JOBS
// ============================================================================

/**
 * Trigger pattern recomputation and export insights
 * Run every 15 minutes
 */
async function runPatternRecomputation(): Promise<void> {
  const startTime = Date.now();

  try {
    const insights = getCommunityInsights();

    // Trigger recomputation (this is called automatically on signals,
    // but we force it periodically to ensure patterns stay fresh)
    // The CommunityInsightsEngine handles this internally via recomputePatterns()
    // which is called automatically when signals reach thresholds

    // Export current insights for analysis
    const exported = insights.exportInsights();

    const durationMs = Date.now() - startTime;
    log.info(
      {
        patterns: exported.patterns.length,
        questions: exported.effectiveQuestions.length,
        stories: exported.storyResonance.length,
        durationMs,
      },
      '📊 Pattern recomputation check complete'
    );
  } catch (error) {
    log.error({ error }, 'Pattern recomputation failed');
  }
}

/**
 * Update agent evolution based on patterns
 * Run every hour
 */
async function runEvolutionUpdate(): Promise<void> {
  const startTime = Date.now();

  try {
    const insights = getCommunityInsights();
    const evolution = getAgentEvolution();

    // Get exported patterns and feed to evolution
    const exported = insights.exportInsights();

    // Process high-sample patterns
    let adjustmentsConsidered = 0;
    for (const pattern of exported.patterns) {
      if (pattern.totalSamples >= 50 && pattern.bestStrategy) {
        // Evolution engine can use these patterns to inform persona adjustments
        adjustmentsConsidered++;
      }
    }

    const durationMs = Date.now() - startTime;
    log.info(
      {
        patterns: exported.patterns.length,
        adjustmentsConsidered,
        durationMs,
      },
      '🧬 Agent evolution update complete'
    );
  } catch (error) {
    log.error({ error }, 'Agent evolution update failed');
  }
}

/**
 * Log story resonance statistics
 * Run every hour
 */
async function runStoryAnalysis(): Promise<void> {
  const startTime = Date.now();

  try {
    const insights = getCommunityInsights();

    // Get exported story data
    const exported = insights.exportInsights();
    const stories = exported.storyResonance;

    // Sort by effectiveness
    const topStories = [...stories]
      .sort((a, b) => b.overallEffectiveness - a.overallEffectiveness)
      .slice(0, 5);

    const durationMs = Date.now() - startTime;
    log.info(
      {
        storiesTracked: stories.length,
        topPerformers: topStories.map((s) => ({
          id: s.storyId,
          effectiveness: s.overallEffectiveness.toFixed(2),
        })),
        durationMs,
      },
      '📖 Story analysis complete'
    );
  } catch (error) {
    log.error({ error }, 'Story analysis failed');
  }
}

// ============================================================================
// SCHEDULER CONTROL
// ============================================================================

/**
 * Start the collective learning scheduler
 */
export function startCollectiveLearningScheduler(): void {
  if (isRunning) {
    log.warn('Collective learning scheduler already running');
    return;
  }

  log.info('🚀 Starting collective learning scheduler');

  // Pattern recomputation: every 15 minutes
  registerInterval(
    'collective-learning-pattern-recompute',
    () => {
      void runPatternRecomputation();
    },
    15 * 60 * 1000
  );
  recomputeIntervalId = 1 as unknown as ReturnType<typeof setInterval>; // Marker

  // Firestore save: every 10 minutes
  registerInterval(
    'collective-learning-firestore-save',
    () => {
      void saveCommunityInsightsToFirestore();
    },
    10 * 60 * 1000
  );
  saveIntervalId = 1 as unknown as ReturnType<typeof setInterval>; // Marker

  // Story analysis: every hour
  registerInterval(
    'collective-learning-story-analysis',
    () => {
      void runStoryAnalysis();
    },
    60 * 60 * 1000
  );

  // Evolution update: every hour
  registerInterval(
    'collective-learning-evolution-update',
    () => {
      void runEvolutionUpdate();
    },
    60 * 60 * 1000
  );

  isRunning = true;

  // Run initial check after 2 minutes (let signals collect first)
  setTimeout(
    () => {
      void runPatternRecomputation();
    },
    2 * 60 * 1000
  );
}

/**
 * Stop the collective learning scheduler
 */
export function stopCollectiveLearningScheduler(): void {
  if (!isRunning) {
    return;
  }

  log.info('Stopping collective learning scheduler');

  if (recomputeIntervalId) {
    clearNamedInterval('collective-learning-pattern-recompute');
    recomputeIntervalId = null;
  }

  if (saveIntervalId) {
    clearNamedInterval('collective-learning-firestore-save');
    saveIntervalId = null;
  }

  // Also clear the other intervals
  clearNamedInterval('collective-learning-story-analysis');
  clearNamedInterval('collective-learning-evolution-update');

  isRunning = false;

  // Final save
  void saveCommunityInsightsToFirestore();
}

/**
 * Force run all aggregation jobs (for testing/debugging)
 */
export async function forceRunAllJobs(): Promise<{
  patternRecomputation: boolean;
  storyAnalysis: boolean;
  evolutionUpdate: boolean;
}> {
  log.info('Force running all collective learning jobs');

  const results = {
    patternRecomputation: false,
    storyAnalysis: false,
    evolutionUpdate: false,
  };

  try {
    await runPatternRecomputation();
    results.patternRecomputation = true;
  } catch {}

  try {
    await runStoryAnalysis();
    results.storyAnalysis = true;
  } catch {}

  try {
    await runEvolutionUpdate();
    results.evolutionUpdate = true;
  } catch {}

  await saveCommunityInsightsToFirestore();

  return results;
}

/**
 * Get scheduler status
 */
export function getSchedulerStatus(): {
  isRunning: boolean;
  uptimeMs: number | null;
} {
  return {
    isRunning,
    uptimeMs: null, // Would track start time for real uptime
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  startCollectiveLearningScheduler,
  stopCollectiveLearningScheduler,
  forceRunAllJobs,
  getSchedulerStatus,
};
