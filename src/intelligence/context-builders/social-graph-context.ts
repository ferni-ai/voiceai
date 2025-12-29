/**
 * Social Graph Context Builder
 *
 * "Better than Human" - We track who matters in your life and notice patterns
 * that even you might miss.
 *
 * This context builder injects social intelligence into every conversation:
 * - Who you've been talking about (and who you haven't)
 * - How your energy changes when discussing different people
 * - Important dates and relationship milestones
 * - Withdrawal detection (haven't mentioned someone in a while)
 *
 * @module intelligence/context-builders/social-graph-context
 */

import { createLogger } from '../../utils/safe-logger.js';
import type { ContextInjection, ContextBuilderInput } from './core/types.js';
import { registerContextBuilder, createHintInjection, createStandardInjection } from './index.js';

const log = createLogger({ module: 'SocialGraphContext' });

// ============================================================================
// TYPES
// ============================================================================

interface SocialGraphContextParams {
  userId: string;
  currentTopic?: string;
  turnCount: number;
}

// ============================================================================
// MAIN BUILDER
// ============================================================================

/**
 * Build social graph context injections.
 *
 * Surfaces superhuman relationship intelligence:
 * - Withdrawal alerts ("You haven't mentioned Sarah in 2 weeks")
 * - Sentiment patterns ("Mike conversations tend to drain you")
 * - Important dates ("Your mom's birthday is tomorrow")
 * - Relationship insights
 */
export async function buildSocialGraphContext(
  params: SocialGraphContextParams
): Promise<ContextInjection[]> {
  const { userId, turnCount } = params;
  const injections: ContextInjection[] = [];

  // Only run every few turns to avoid noise
  if (turnCount < 3 || turnCount % 3 !== 0) {
    return injections;
  }

  try {
    const { detectWithdrawal, generateSocialInsights, getUpcomingDates, detectSentimentPatterns } =
      await import('../../services/social-graph/index.js');

    // 1. WITHDRAWAL DETECTION
    // "You haven't mentioned Sarah in a while - everything okay?"
    const withdrawals = detectWithdrawal(userId);
    const highPriorityWithdrawal = withdrawals.find((w) => w.significance === 'high');

    if (highPriorityWithdrawal) {
      injections.push(
        createStandardInjection(
          'social_graph_withdrawal',
          `[🔍 SOCIAL INTELLIGENCE - "Better Than Human"]
You noticed: ${highPriorityWithdrawal.personName} hasn't been mentioned in ${highPriorityWithdrawal.daysSinceLastMention} days (they're usually mentioned every ${highPriorityWithdrawal.usualFrequencyDays} days).

If it feels natural, you might gently check in:
"${highPriorityWithdrawal.suggestion}"

Don't force it - only mention if conversation leads there naturally.`
        )
      );
      log.debug({ userId, person: highPriorityWithdrawal.personName }, 'Withdrawal alert injected');
    }

    // 2. UPCOMING IMPORTANT DATES
    // "Your mom's birthday is tomorrow"
    const upcomingDates = getUpcomingDates(userId, 3); // Within 3 days
    const immediateDates = upcomingDates.filter((d) => d.daysUntil <= 1);

    if (immediateDates.length > 0) {
      const dateContext = immediateDates
        .map((d) => {
          const when = d.daysUntil === 0 ? 'Today' : 'Tomorrow';
          return `- ${when}: ${d.personName}'s ${d.type}${d.label ? ` (${d.label})` : ''}`;
        })
        .join('\n');

      injections.push(
        createStandardInjection(
          'social_graph_dates',
          `[📅 IMPORTANT DATES - "Better Than Human"]
${dateContext}

You might acknowledge this naturally if relevant. Example:
"By the way, ${immediateDates[0].personName}'s ${immediateDates[0].type} is ${immediateDates[0].daysUntil === 0 ? 'today' : 'tomorrow'} - how are you feeling about it?"`
        )
      );
      log.debug({ userId, dateCount: immediateDates.length }, 'Important dates injected');
    }

    // 3. SENTIMENT PATTERNS
    // "Conversations about Mike seem to drain your energy"
    const patterns = detectSentimentPatterns(userId);
    const significantPattern = patterns.find((p) => p.confidence > 0.7);

    if (significantPattern && Math.random() < 0.3) {
      // Only surface 30% of the time to avoid being creepy
      injections.push(
        createHintInjection(
          'social_graph_pattern',
          `[💡 RELATIONSHIP PATTERN - "Better Than Human"]
Observation (high confidence): ${significantPattern.description}

You can reference this naturally:
- "${significantPattern.personName} sounds important to you"
- If it's a draining pattern: "How do you feel after conversations with ${significantPattern.personName}?"

Only surface if it adds value to the conversation.`
        )
      );
      log.debug({ userId, pattern: significantPattern.description }, 'Sentiment pattern injected');
    }

    // 4. GENERAL SOCIAL INSIGHTS
    // Run every 10 turns for variety
    if (turnCount % 10 === 0) {
      const insights = generateSocialInsights(userId);
      const topInsight = insights.find((i) => i.urgency !== 'low');

      if (topInsight) {
        injections.push(
          createHintInjection(
            'social_graph_insight',
            `[🌟 SOCIAL INSIGHT - "Better Than Human"]
${topInsight.insight}
${topInsight.suggestion ? `\nSuggestion: "${topInsight.suggestion}"` : ''}`
          )
        );
      }
    }

    return injections;
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to build social graph context');
    return [];
  }
}

// ============================================================================
// REGISTER BUILDER
// ============================================================================

registerContextBuilder('social_graph', async (input: ContextBuilderInput) => {
  const userId = input.services?.userId;
  if (!userId) return [];

  return buildSocialGraphContext({
    userId,
    currentTopic: input.userData?.lastTopic,
    turnCount: input.userData?.turnCount || 0,
  });
});

export { buildSocialGraphContext as buildSocialGraphContextBuilder };
