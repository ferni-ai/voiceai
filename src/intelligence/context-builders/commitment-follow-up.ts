/**
 * Commitment Follow-Up Context Builder
 *
 * "Better Than Human" - We remember what you said you'd do, and we follow up.
 *
 * This builder:
 * - Surfaces commitments that are due for follow-up
 * - Celebrates progress without judgment
 * - Handles setbacks with empathy
 * - Knows when to back off
 *
 * @module CommitmentFollowUpContext
 */

import {
  type ContextBuilderInput,
  type ContextInjection,
  createStandardInjection,
  createHighInjection,
  registerContextBuilder,
} from './index.js';
import { BuilderCategory } from './categories.js';
import { createLogger } from '../../utils/safe-logger.js';
import {
  processCommitments,
  generateFollowUpPhrase,
  recordFollowUp,
  type Commitment,
} from '../../services/trust-systems/commitment-tracking.js';

const log = createLogger({ module: 'CommitmentFollowUp' });

// ============================================================================
// CONFIGURATION
// ============================================================================

/** Don't surface follow-ups before turn 2 */
const MIN_TURN_FOR_FOLLOWUP = 2;

/** Max follow-ups to surface per session */
const MAX_FOLLOWUPS_PER_SESSION = 2;

/** In-memory tracking per session */
const sessionFollowUps = new Map<string, number>(); // sessionId -> followUp count

// ============================================================================
// BUILDER
// ============================================================================

async function buildCommitmentFollowUpContext(
  input: ContextBuilderInput
): Promise<ContextInjection[]> {
  const { userText, userData, services, analysis } = input;
  const userId = services?.userId;
  const sessionId = services?.sessionId || userId;
  const turnCount = userData?.turnCount || 0;

  if (!userId) return [];

  // Process user's message for new commitments and progress
  const { newCommitments, progressUpdates, followUpsDue } = await processCommitments(
    userId,
    userText,
    {
      recentTopics: userData?.recentTopics,
      emotion: analysis?.emotion?.primary,
    }
  );

  const injections: ContextInjection[] = [];

  // 1. If user made a new commitment, acknowledge it internally
  if (newCommitments.length > 0) {
    const commitment = newCommitments[0];
    injections.push(
      createStandardInjection(
        'commitment_detected',
        `[USER COMMITMENT] They just committed to: "${commitment.content}". You're now tracking this. Don't make a big deal of it, but acknowledge naturally in your response. Something like "I'll remember that" or "That's a meaningful commitment."`,
        { category: 'trust' }
      )
    );

    log.info(
      { userId, commitment: commitment.content.slice(0, 50) },
      '💫 BETTER-THAN-HUMAN: New commitment tracked'
    );
  }

  // 2. If progress was detected, celebrate it
  if (progressUpdates.length > 0) {
    const update = progressUpdates[0];
    const celebration =
      update.type === 'completed'
        ? `[CELEBRATION MOMENT] They just completed something they committed to! This is huge. Celebrate genuinely - "You actually did it. That's real." Don't be over the top.`
        : update.type === 'setback'
          ? `[EMPATHY MOMENT] They mentioned not following through on a commitment. NO judgment. Acknowledge with care: "That's okay. What got in the way?" or "Sometimes life happens. What would help?"`
          : `[PROGRESS NOTED] They're making progress on a commitment. Notice it gently.`;

    injections.push(createHighInjection('commitment_progress', celebration, { category: 'trust' }));

    log.info(
      { userId, type: update.type },
      '📊 BETTER-THAN-HUMAN: Commitment progress detected'
    );
  }

  // 3. If there are follow-ups due and it's the right time
  if (
    followUpsDue.length > 0 &&
    turnCount >= MIN_TURN_FOR_FOLLOWUP &&
    (sessionFollowUps.get(sessionId || '') || 0) < MAX_FOLLOWUPS_PER_SESSION
  ) {
    // Pick the most important follow-up
    const followUp = prioritizeFollowUp(followUpsDue);

    if (followUp) {
      const phrase = generateFollowUpPhrase(followUp);

      injections.push(
        createStandardInjection(
          'commitment_follow_up',
          `[FOLLOW-UP OPPORTUNITY] You've been tracking that they said they'd "${followUp.content}". Consider naturally checking in with something like: "${phrase}" - but only if it fits the conversation. If they seem stressed or the topic doesn't fit, skip it. They haven't mentioned it in a while.`,
          { category: 'trust', confidence: 0.7 }
        )
      );

      // Track that we surfaced this
      sessionFollowUps.set(sessionId || '', (sessionFollowUps.get(sessionId || '') || 0) + 1);

      // Record the follow-up attempt (will be updated based on their response)
      void recordFollowUp(userId, followUp.id, 'neutral');

      log.info(
        { userId, commitment: followUp.content.slice(0, 50), daysOld: getAgeInDays(followUp.createdAt) },
        '🔔 BETTER-THAN-HUMAN: Surfacing commitment follow-up'
      );
    }
  }

  return injections;
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Prioritize which follow-up to surface
 */
function prioritizeFollowUp(commitments: Commitment[]): Commitment | null {
  if (commitments.length === 0) return null;

  // Sort by: importance, then explicit over implicit, then oldest
  return commitments.sort((a, b) => {
    // High importance first
    if (a.importance !== b.importance) {
      const importanceOrder = { high: 0, medium: 1, low: 2 };
      return importanceOrder[a.importance] - importanceOrder[b.importance];
    }

    // Explicit over implicit
    if (a.type !== b.type) {
      const typeOrder = { explicit: 0, promise: 1, habit: 2, task: 3, implicit: 4, goal: 5 };
      return (typeOrder[a.type] || 5) - (typeOrder[b.type] || 5);
    }

    // Oldest first (they've been waiting longer)
    return a.createdAt.getTime() - b.createdAt.getTime();
  })[0];
}

/**
 * Get age in days
 */
function getAgeInDays(date: Date): number {
  return Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24));
}

// ============================================================================
// REGISTRATION
// ============================================================================

registerContextBuilder({
  name: 'commitment-follow-up',
  description: 'Tracks user commitments and surfaces gentle follow-ups (Better Than Human)',
  priority: 40, // After safety, trust context
  category: BuilderCategory.HUMANIZING,
  build: buildCommitmentFollowUpContext,
});

export { buildCommitmentFollowUpContext };

