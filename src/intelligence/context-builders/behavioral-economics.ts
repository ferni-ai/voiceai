/**
 * Behavioral Economics Context Builder
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Integrates behavioral economics techniques into the voice agent's
 * context pipeline to help bridge intention-action gaps.
 *
 * PHILOSOPHY:
 * People know what they should do. The gap between knowing and doing
 * is where behavioral economics shines. These tools work with human
 * nature, not against it.
 *
 * @module ContextBuilders/BehavioralEconomics
 */

import {
  registerContextBuilder,
  type ContextBuilderInput,
  type ContextInjection,
  createHintInjection,
} from './index.js';

import {
  buildBehavioralEconomicsContext,
  getImplementationIntentions,
  getActiveCommitments,
} from '../../services/behavioral-economics/index.js';

import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'BehavioralEconomicsBuilder' });

// ============================================================================
// GOAL DETECTION
// ============================================================================

/**
 * Detect if user is talking about a goal or intention.
 */
function detectGoalDiscussion(text: string): {
  isGoalDiscussion: boolean;
  goal?: string;
  barrier?: string;
} {
  const lowerText = text.toLowerCase();

  // Goal indicators
  const goalPatterns = [
    /i want to (\w+(?:\s+\w+){0,5})/i,
    /i need to (\w+(?:\s+\w+){0,5})/i,
    /i should (\w+(?:\s+\w+){0,5})/i,
    /i'm trying to (\w+(?:\s+\w+){0,5})/i,
    /i've been meaning to (\w+(?:\s+\w+){0,5})/i,
    /my goal is to (\w+(?:\s+\w+){0,5})/i,
  ];

  // Barrier indicators
  const barrierPatterns = [
    /but i can't (\w+(?:\s+\w+){0,5})/i,
    /but it's hard to (\w+(?:\s+\w+){0,5})/i,
    /the problem is (\w+(?:\s+\w+){0,5})/i,
    /what stops me is (\w+(?:\s+\w+){0,5})/i,
    /i keep (\w+(?:\s+\w+){0,5})/i,
  ];

  let goal: string | undefined;
  let barrier: string | undefined;

  // Check for goals
  for (const pattern of goalPatterns) {
    const match = pattern.exec(text);
    if (match) {
      goal = match[1];
      break;
    }
  }

  // Check for barriers
  for (const pattern of barrierPatterns) {
    const match = pattern.exec(text);
    if (match) {
      barrier = match[1];
      break;
    }
  }

  return {
    isGoalDiscussion: !!goal,
    goal,
    barrier,
  };
}

// ============================================================================
// CONTEXT BUILDER
// ============================================================================

/**
 * Build behavioral economics context for the current turn.
 */
async function buildBehavioralEconContext(input: ContextBuilderInput): Promise<ContextInjection[]> {
  const { userText, services, userProfile } = input;
  const userId = services?.userId;

  if (!userId || !userText) {
    return [];
  }

  const injections: ContextInjection[] = [];

  // Detect goal discussion
  const goalDetection = detectGoalDiscussion(userText);

  if (!goalDetection.isGoalDiscussion) {
    return [];
  }

  // Check existing behavioral economics artifacts
  const intentions = getImplementationIntentions(userId);
  const commitments = getActiveCommitments(userId);

  // Build context
  const beContext = buildBehavioralEconomicsContext(userId, {
    goal: goalDetection.goal,
    barrier: goalDetection.barrier,
    hasIntention: intentions.some(
      (i) => goalDetection.goal && i.goal.toLowerCase().includes(goalDetection.goal.toLowerCase())
    ),
    hasCommitment: commitments.some(
      (c) =>
        goalDetection.goal && c.commitment.toLowerCase().includes(goalDetection.goal.toLowerCase())
    ),
  });

  if (beContext) {
    injections.push(
      createHintInjection('behavioral_economics', beContext, { category: 'coaching' })
    );

    log.debug(
      {
        userId,
        goal: goalDetection.goal,
        hasBarrier: !!goalDetection.barrier,
      },
      '🧠 Behavioral economics context injected'
    );
  }

  return injections;
}

// ============================================================================
// REGISTER BUILDER
// ============================================================================

registerContextBuilder({
  name: 'behavioral-economics',
  priority: 70, // After therapeutic frameworks
  description: 'Help bridge intention-action gaps with behavioral economics',
  build: buildBehavioralEconContext,
});

// ============================================================================
// EXPORTS
// ============================================================================

export { buildBehavioralEconContext };

export default {
  buildBehavioralEconContext,
};
