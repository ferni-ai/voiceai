/**
 * Cross-Session Threading Context Builder
 *
 * Surfaces open threads from previous conversations:
 * - Interrupted topics that need follow-up
 * - Promised follow-ups that weren't delivered
 * - Emotional continuity from last session
 * - "Where were we?" conversational memory
 *
 * This makes conversations feel continuous across sessions.
 */

import { getLogger } from '../../utils/safe-logger.js';
import {
  registerContextBuilder,
  createStandardInjection,
  createHintInjection,
  type ContextBuilderInput,
  type ContextInjection,
} from './index.js';
import {
  getCrossSessionThreader,
  type OpenThread,
} from '../cross-session-threader.js';

// ============================================================================
// CONTEXT BUILDER
// ============================================================================

function buildCrossSessionThreadingContext(input: ContextBuilderInput): ContextInjection[] {
  const { userProfile, userData, analysis } = input;
  const injections: ContextInjection[] = [];
  const turnCount = userData.turnCount || 0;

  // Only relevant for returning users
  if (!userData.isReturningUser || !userProfile) {
    return injections;
  }

  const userId = userProfile.id;

  try {
    const threader = getCrossSessionThreader(userId);
    const openThreads = threader.getOpenThreads();
    const pendingFollowUps = threader.getUndeliveredFollowUps();

    // -----------------------------------------------
    // FIRST TURN: Suggest conversation starter
    // -----------------------------------------------
    if (turnCount === 0 || turnCount === 1) {
      const conversationStarter = threader.getConversationStarter();

      if (conversationStarter) {
        injections.push(
          createStandardInjection(
            'cross_session_starter',
            `[CONVERSATION CONTINUITY]
You have unfinished business from last time. Consider starting with:
"${conversationStarter}"

This shows you remember and care about the ongoing relationship.
Only use if it feels natural - don't force it if user has something urgent.`,
            { category: 'memory' }
          )
        );
      }
    }

    // -----------------------------------------------
    // OPEN THREADS: High priority items
    // -----------------------------------------------
    if (openThreads.length > 0 && turnCount >= 2 && turnCount <= 6) {
      const topThread = openThreads[0];

      // Only surface high-priority or emotionally heavy threads
      if (topThread.priority === 'high' || topThread.emotionalWeight === 'heavy') {
        injections.push(
          createStandardInjection(
            'open_thread',
            `[OPEN THREAD FROM LAST SESSION]
Topic: ${topThread.topic}
Reason open: ${formatThreadReason(topThread.reason)}
${topThread.reasonDetail ? `Detail: ${topThread.reasonDetail}` : ''}
Emotional weight: ${topThread.emotionalWeight}

Suggested approach: "${topThread.suggestedResumption}"

${topThread.questionsToAnswer.length > 0 ? `Unanswered questions:\n${topThread.questionsToAnswer.map((q) => `- ${q}`).join('\n')}` : ''}

Handle this with care - the user trusted you with this.`,
            { category: 'memory' }
          )
        );
      } else if (openThreads.length > 1) {
        // Lower priority threads get a hint
        injections.push(
          createHintInjection(
            'open_threads_hint',
            `[You have ${openThreads.length} open threads from previous sessions. ` +
              `Main topic: "${topThread.topic}". Consider circling back naturally.]`,
            { category: 'memory' }
          )
        );
      }
    }

    // -----------------------------------------------
    // PROMISED FOLLOW-UPS: Things you said you'd do
    // -----------------------------------------------
    if (pendingFollowUps.length > 0 && turnCount >= 3) {
      const topFollowUp = pendingFollowUps[0];

      injections.push(
        createHintInjection(
          'promised_followup',
          `[PROMISED FOLLOW-UP]
You promised: "${topFollowUp.description}"
Type: ${topFollowUp.type}
${topFollowUp.targetTimeframe ? `When: ${topFollowUp.targetTimeframe}` : ''}

Deliver on this promise when natural. Breaking promises damages trust.`,
          { category: 'memory' }
        )
      );
    }

    // -----------------------------------------------
    // EMOTIONAL CONTINUITY: Check-ins on heavy topics
    // -----------------------------------------------
    const heavyThreads = openThreads.filter((t) => t.emotionalWeight === 'heavy');
    if (heavyThreads.length > 0 && turnCount >= 4 && turnCount <= 8) {
      // Check if user's current emotion suggests they might want to revisit
      const userEmotion = analysis.emotion?.primary;
      const shouldCheckIn =
        userEmotion === 'neutral' || userEmotion === 'trust' || userEmotion === 'anticipation';

      if (shouldCheckIn) {
        injections.push(
          createHintInjection(
            'emotional_checkin',
            `[EMOTIONAL CHECK-IN OPPORTUNITY]
Last time there was a heavy topic: "${heavyThreads[0].topic}"
The user might appreciate a gentle check-in if the conversation allows.
Example: "I've been thinking about what you shared last time..."`,
            { category: 'emotional' }
          )
        );
      }
    }

    if (injections.length > 0) {
      getLogger().debug(
        {
          userId,
          openThreads: openThreads.length,
          pendingFollowUps: pendingFollowUps.length,
          injectionCount: injections.length,
        },
        'Cross-session threading context injected'
      );
    }
  } catch (error) {
    getLogger().warn({ error }, 'Failed to build cross-session threading context');
  }

  return injections;
}

// ============================================================================
// HELPERS
// ============================================================================

function formatThreadReason(reason: string): string {
  const reasonMap: Record<string, string> = {
    interrupted: 'Conversation was interrupted (call dropped or user had to go)',
    time_constraint: 'User ran out of time',
    topic_shifted: 'Discussion moved to something else before finishing',
    promised_followup: 'You promised to continue this',
    user_requested: 'User asked to discuss later',
    incomplete_advice: 'Advice was started but not finished',
    emotional_pause: 'Heavy topic that needed a break',
    unanswered_question: 'User asked but didnt get full answer',
  };
  return reasonMap[reason] || reason;
}

// ============================================================================
// REGISTER BUILDER
// ============================================================================

registerContextBuilder({
  name: 'cross_session_threading',
  description: 'Surfaces open threads and promises from previous sessions',
  priority: 75, // High priority - memory continuity is important
  build: async (input) => buildCrossSessionThreadingContext(input),
});

export { buildCrossSessionThreadingContext };

