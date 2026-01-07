/**
 * Wellbeing Context Builder
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Integrates continuous wellbeing tracking into the context pipeline.
 * Detects wellbeing signals from conversation and surfaces alerts
 * when patterns indicate concern.
 *
 * PHILOSOPHY:
 * A great coach notices patterns over time—not just what you're saying
 * today, but how it compares to last week. This builder tracks wellbeing
 * signals across conversations and alerts when something seems off.
 *
 * @module ContextBuilders/WellbeingContext
 */

import {
  processForWellbeing,
  type WellbeingProcessResult,
} from '../../../services/wellbeing-tracking/index.js';
import { createLogger } from '../../../utils/safe-logger.js';
import { BuilderCategory } from './categories.js';
import {
  createCriticalInjection,
  createHintInjection,
  createStandardInjection,
  registerContextBuilder,
  type ContextBuilderInput,
  type ContextInjection,
} from '../index.js';

const log = createLogger({ module: 'context:wellbeing' });

// ============================================================================
// CONTEXT BUILDER
// ============================================================================

/**
 * Build wellbeing awareness context for the current turn.
 */
async function buildWellbeingContext(input: ContextBuilderInput): Promise<ContextInjection[]> {
  const { userText, services, analysis, userData } = input;
  const userId = services?.userId;

  if (!userId || !userText) {
    return [];
  }

  const injections: ContextInjection[] = [];

  // Process the message for wellbeing signals
  const result = processForWellbeing(userId, userText, {
    topic: analysis?.topics?.primary || undefined,
    emotion: analysis?.emotion?.primary,
    emotionIntensity: analysis?.emotion?.intensity,
    turnCount: userData?.turnCount,
  });

  // If we have LLM context to inject, add it
  if (result.llmContext) {
    const injection = determineInjectionPriority(result);
    injections.push(injection);

    log.debug(
      {
        userId,
        signalCount: result.signals.length,
        alertCount: result.alerts.length,
        trend: result.summary?.trend,
      },
      '📊 Wellbeing context injected'
    );
  }

  return injections;
}

/**
 * Determine the injection priority based on wellbeing state.
 */
function determineInjectionPriority(result: WellbeingProcessResult): ContextInjection {
  // Check for urgent alerts
  const hasUrgent = result.alerts.some((a) => a.severity === 'urgent');
  if (hasUrgent) {
    return createCriticalInjection('wellbeing_urgent', result.llmContext!);
  }

  // Check for declining trend
  if (result.summary?.trend === 'declining') {
    return createStandardInjection('wellbeing_concern', result.llmContext!);
  }

  // Default to hint
  return createHintInjection('wellbeing_insight', result.llmContext!, { category: 'wellbeing' });
}

// ============================================================================
// REGISTER BUILDER
// ============================================================================

registerContextBuilder({
  name: 'wellbeing-context',
  description: 'Track wellbeing signals and surface alerts when patterns indicate concern',
  priority: 15, // High priority - SAFETY category (0-20)
  category: BuilderCategory.SAFETY,
  build: buildWellbeingContext,
});

// ============================================================================
// EXPORTS
// ============================================================================

export { buildWellbeingContext };

export default {
  buildWellbeingContext,
};
