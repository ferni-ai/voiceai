/**
 * Therapeutic Frameworks Context Builder
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Integrates evidence-based therapeutic frameworks (ACT, DBT, MI)
 * into the voice agent's context pipeline.
 *
 * PHILOSOPHY:
 * These frameworks represent decades of research on what helps people.
 * We adapt them for conversational coaching—not replacing therapy,
 * but making research-backed support accessible in everyday moments.
 *
 * @module ContextBuilders/TherapeuticFrameworks
 */

import {
  registerContextBuilder,
  type ContextBuilderInput,
  type ContextInjection,
  createHintInjection,
  createStandardInjection,
} from './index.js';

import {
  buildTherapeuticContext,
  type TherapeuticContextResult,
} from '../../services/therapeutic-frameworks/index.js';

import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'TherapeuticFrameworksBuilder' });

// ============================================================================
// CONTEXT BUILDER
// ============================================================================

/**
 * Build therapeutic framework context for the current turn.
 */
async function buildTherapeuticFrameworksContext(
  input: ContextBuilderInput
): Promise<ContextInjection[]> {
  const { userText, services, analysis, userProfile } = input;
  const userId = services?.userId;

  if (!userId || !userText) {
    return [];
  }

  const injections: ContextInjection[] = [];

  // Determine relationship stage
  let relationshipStage: 'new' | 'building' | 'established' | 'deep' = 'new';
  if (userProfile) {
    const convos = userProfile.totalConversations || 0;
    if (convos >= 50) relationshipStage = 'deep';
    else if (convos >= 20) relationshipStage = 'established';
    else if (convos >= 5) relationshipStage = 'building';
  }

  // Build therapeutic context
  const result = buildTherapeuticContext(userId, userText, {
    topic: analysis?.topics?.primary || undefined,
    emotion: analysis?.emotion?.primary,
    emotionIntensity: analysis?.emotion?.intensity,
    relationshipStage,
  });

  // If no context, return empty
  if (!result.hasContext) {
    return [];
  }

  // Create injections from context parts
  for (const part of result.contextParts) {
    // Determine priority based on what we found
    const isHighPriority =
      result.primaryRecommendation === 'dbt_skill' ||
      (analysis?.emotion?.intensity || 0) > 0.7;

    const injection = isHighPriority
      ? createStandardInjection('therapeutic_framework', part)
      : createHintInjection('therapeutic_framework', part, { category: 'therapeutic' });

    injections.push(injection);
  }

  log.debug(
    {
      userId,
      frameworks: result.frameworks,
      primary: result.primaryRecommendation,
      injectionCount: injections.length,
    },
    '🎓 Therapeutic frameworks context injected'
  );

  return injections;
}

// ============================================================================
// REGISTER BUILDER
// ============================================================================

registerContextBuilder({
  name: 'therapeutic-frameworks',
  priority: 75, // After cognitive distortions, before general coaching
  description: 'Integrate ACT, DBT, and MI frameworks into conversation',
  build: buildTherapeuticFrameworksContext,
});

// ============================================================================
// EXPORTS
// ============================================================================

export { buildTherapeuticFrameworksContext };

export default {
  buildTherapeuticFrameworksContext,
};

