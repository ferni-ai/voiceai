/**
 * Trigger Outcome Handler
 *
 * Wires up Phase 4 effectiveness learning to the turn processor.
 * Records trigger outcomes (engagement/deflection) for adaptive personalization.
 *
 * Flow:
 * 1. On turn N: Triggers fire during context building → stored in userData.lastFiredTriggers
 * 2. On turn N+1: User's response is analyzed for engagement/deflection signals
 * 3. Outcomes are recorded via recordTriggerOutcome for effectiveness learning
 *
 * "Better than Human" - We learn which triggers actually help each user,
 * not just which ones match text patterns.
 *
 * @module TriggerOutcomeHandler
 */

import type { UserData } from '../shared/types.js';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'TriggerOutcomeHandler' });

// ============================================================================
// TYPES
// ============================================================================

export interface FiredTrigger {
  name: string;
  category: string;
  timestamp: number;
}

export interface TriggerOutcomeContext {
  sessionId: string;
  userResponse: string;
  averageResponseLength: number;
  previousTopic?: string;
  currentTopic?: string;
  sessionEndedWithin?: number; // minutes
}

type TriggerOutcome = 'engaged' | 'deflected' | 'neutral';

// ============================================================================
// TRIGGER STORAGE (for current turn)
// ============================================================================

/**
 * Store a fired trigger for outcome recording on next turn.
 * Call this from context builders when triggers fire.
 */
export function recordFiredTriggerForOutcome(
  userData: UserData,
  triggerName: string,
  category: string
): void {
  if (!userData.lastFiredTriggers) {
    userData.lastFiredTriggers = [];
  }

  userData.lastFiredTriggers.push({
    name: triggerName,
    category,
    timestamp: Date.now(),
  });

  log.debug({ triggerName, category }, 'Recorded fired trigger for outcome tracking');
}

/**
 * Clear fired triggers after processing outcomes.
 */
export function clearFiredTriggers(userData: UserData): void {
  userData.lastFiredTriggers = [];
}

// ============================================================================
// OUTCOME DETECTION
// ============================================================================

/**
 * Detect engagement signals from user response.
 * Returns signals that indicate the user connected with the trigger.
 */
function detectEngagementSignals(
  userResponse: string,
  averageResponseLength: number,
  previousTopics: string[],
  currentTopic?: string
): string[] {
  const signals: string[] = [];
  const responseLower = userResponse.toLowerCase();

  // Longer response (engagement indicator)
  if (userResponse.length > averageResponseLength * 1.5) {
    signals.push('longer_response');
  }

  // Deeper topic (topic wasn't in previous topics)
  if (currentTopic && !previousTopics.includes(currentTopic)) {
    const deeperIndicators = [
      'because',
      'i feel',
      'i think',
      'actually',
      'to be honest',
      'the truth is',
      "i've been",
      'i realized',
      'it made me',
    ];
    if (deeperIndicators.some((ind) => responseLower.includes(ind))) {
      signals.push('deeper_topic');
    }
  }

  // Emotional expression
  const emotionalIndicators = [
    'i feel',
    'makes me',
    "i'm feeling",
    'i was feeling',
    "i'm so",
    "i've been so",
    'it hurts',
    'i love',
    'i hate',
    "i'm scared",
    "i'm worried",
    "i'm excited",
    "i'm happy",
  ];
  if (emotionalIndicators.some((ind) => responseLower.includes(ind))) {
    signals.push('emotional_expression');
  }

  // Question asked
  if (userResponse.includes('?')) {
    signals.push('question_asked');
  }

  // Gratitude expressed
  const gratitudeIndicators = [
    'thank you',
    'thanks',
    'appreciate',
    'grateful',
    'that helps',
    'that means a lot',
    'i needed that',
  ];
  if (gratitudeIndicators.some((ind) => responseLower.includes(ind))) {
    signals.push('gratitude_expressed');
  }

  // Vulnerability shared
  const vulnerabilityIndicators = [
    "i haven't told",
    'nobody knows',
    "i've never",
    'secret',
    'ashamed',
    'embarrassed',
    'scared to admit',
    'hard to say',
  ];
  if (vulnerabilityIndicators.some((ind) => responseLower.includes(ind))) {
    signals.push('vulnerability_shared');
  }

  // Continuation requested
  const continuationIndicators = [
    'tell me more',
    'go on',
    'and then',
    'what else',
    'keep going',
    'continue',
    "i'd like to",
  ];
  if (continuationIndicators.some((ind) => responseLower.includes(ind))) {
    signals.push('continuation_requested');
  }

  return signals;
}

/**
 * Detect deflection signals from user response.
 * Returns signals that indicate the user pulled back from the trigger.
 */
function detectDeflectionSignals(
  userResponse: string,
  averageResponseLength: number,
  previousTopic?: string,
  currentTopic?: string,
  sessionEndedWithin?: number
): string[] {
  const signals: string[] = [];
  const responseLower = userResponse.toLowerCase();

  // Topic change
  if (previousTopic && currentTopic && previousTopic !== currentTopic) {
    signals.push('topic_change');
  }

  // Short response
  if (userResponse.length < averageResponseLength * 0.5) {
    signals.push('short_response');
  }

  // Minimization
  const minimizationPhrases = [
    "it's fine",
    "i'm fine",
    'no big deal',
    "it's nothing",
    "doesn't matter",
    "i'm okay",
    "i'm good",
    'not a big deal',
  ];
  if (minimizationPhrases.some((phrase) => responseLower.includes(phrase))) {
    signals.push('minimization');
  }

  // Deflection phrases
  const deflectionPhrases = [
    'anyway',
    'moving on',
    'nevermind',
    'never mind',
    'forget it',
    "let's talk about",
    "it doesn't matter",
  ];
  if (deflectionPhrases.some((phrase) => responseLower.includes(phrase))) {
    signals.push('deflection_phrase');
  }

  // Session ended shortly after
  if (sessionEndedWithin !== undefined && sessionEndedWithin <= 2) {
    signals.push('session_ended');
  }

  return signals;
}

/**
 * Determine overall outcome from engagement and deflection signals.
 */
function determineOutcome(
  engagementSignals: string[],
  deflectionSignals: string[]
): TriggerOutcome {
  // Weight signals
  const engagementScore = engagementSignals.length;
  const deflectionScore = deflectionSignals.length;

  if (engagementScore > deflectionScore + 1) {
    return 'engaged';
  } else if (deflectionScore > engagementScore) {
    return 'deflected';
  }
  return 'neutral';
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

/**
 * Process trigger outcomes for the previous turn.
 * Call this at the start of each turn to record how user responded to triggers.
 */
export async function processTriggerOutcomes(
  userData: UserData,
  ctx: TriggerOutcomeContext
): Promise<void> {
  const { sessionId, userResponse, averageResponseLength, previousTopic, currentTopic } = ctx;

  const firedTriggers = userData.lastFiredTriggers || [];

  if (firedTriggers.length === 0) {
    return; // No triggers to process
  }

  log.debug(
    { triggerCount: firedTriggers.length, sessionId },
    'Processing trigger outcomes from previous turn'
  );

  // Detect signals
  const previousTopics = userData.recentTopics || [];
  const engagementSignals = detectEngagementSignals(
    userResponse,
    averageResponseLength,
    previousTopics,
    currentTopic
  );
  const deflectionSignals = detectDeflectionSignals(
    userResponse,
    averageResponseLength,
    previousTopic,
    currentTopic
  );

  const outcome = determineOutcome(engagementSignals, deflectionSignals);

  // Record outcomes for each trigger
  try {
    const { recordTriggerOutcome } =
      await import('../../intelligence/triggers/voice-agent-integration.js');

    for (const trigger of firedTriggers) {
      recordTriggerOutcome(sessionId, trigger.name, trigger.category, outcome);
      log.debug(
        {
          triggerName: trigger.name,
          category: trigger.category,
          outcome,
          engagementSignals,
          deflectionSignals,
        },
        'Recorded trigger outcome'
      );
    }
  } catch (error) {
    log.warn({ error: String(error) }, 'Failed to record trigger outcomes (non-fatal)');
  }

  // Clear processed triggers
  clearFiredTriggers(userData);
}

/**
 * Export for use in context builders
 */
export { recordFiredTriggerForOutcome as trackTriggerFired };
