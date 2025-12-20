/**
 * Outreach Awareness Context Builder
 *
 * Injects proactive outreach opportunities into Ferni's context.
 * This enables Ferni to naturally suggest reaching out to people:
 *
 * "Hey, I noticed your mom's birthday is in 3 days. Want me to send her something?"
 * "You usually talk to Sarah more often. Should we check in on her?"
 *
 * @module intelligence/context-builders/outreach-awareness
 */

import { createLogger } from '../../utils/safe-logger.js';
import type { ContextBuilder, ContextChunk, BuilderParams, ConversationContext } from './types.js';
import {
  buildNudgeContext,
  getTopNudgeForMention,
  formatNudgeAsSuggestion,
  getOverdueFrequentContacts,
} from '../../services/contacts/outreach-nudges.js';

const log = createLogger({ module: 'outreach-awareness-context' });

// ============================================================================
// CONTEXT BUILDER
// ============================================================================

/**
 * Outreach Awareness Context Builder
 *
 * Surfaces upcoming birthdays, anniversaries, and outreach opportunities
 * so Ferni can proactively suggest communication.
 */
export const outreachAwarenessBuilder: ContextBuilder = {
  id: 'outreach-awareness',
  name: 'Outreach Awareness',
  description: 'Proactive outreach nudges for upcoming dates and contact check-ins',
  priority: 65, // High priority but below memory and emotional context
  estimatedTokens: 200,
  category: 'superhuman',

  async build(params: BuilderParams): Promise<ContextChunk[]> {
    const { userId, conversationContext } = params;
    const chunks: ContextChunk[] = [];

    if (!userId) {
      return chunks;
    }

    try {
      const nudgeContext = await buildNudgeContext(userId);

      // Build the outreach awareness section
      let content = '';

      // Upcoming important dates (birthdays, anniversaries)
      if (nudgeContext.upcomingDates.length > 0) {
        content += '## Important Dates Coming Up\n\n';

        for (const date of nudgeContext.upcomingDates.slice(0, 5)) {
          const dayText = date.daysAway === 0
            ? 'TODAY'
            : date.daysAway === 1
              ? 'tomorrow'
              : `in ${date.daysAway} days`;

          content += `- ${date.contactName}'s ${date.dateType} is ${dayText}\n`;
        }

        content += '\n';
      }

      // People who need attention
      if (nudgeContext.needsAttention.length > 0) {
        content += '## Contacts Who Could Use a Check-In\n\n';

        for (const contact of nudgeContext.needsAttention.slice(0, 3)) {
          content += `- ${contact.contactName} (${contact.relationship}): ${contact.daysSinceContact} days since last contact\n`;
        }

        content += '\n';
      }

      // Frequent contacts who are overdue
      const overdueFrequent = await getOverdueFrequentContacts(userId);
      if (overdueFrequent.length > 0) {
        content += '## Usually Frequent Contacts\n\n';

        for (const contact of overdueFrequent.slice(0, 3)) {
          content += `- ${contact.contactName}: Usually connects every ~${contact.avgDaysBetweenContact} days, but it's been ${contact.daysSinceLastContact} days\n`;
        }

        content += '\n';
      }

      // Upcoming holidays
      if (nudgeContext.upcomingHolidays.length > 0) {
        const soonHolidays = nudgeContext.upcomingHolidays.filter((h) => h.daysAway <= 14);
        if (soonHolidays.length > 0) {
          content += '## Upcoming Holidays\n\n';

          for (const holiday of soonHolidays.slice(0, 3)) {
            content += `- ${holiday.name} (${holiday.date}): ${holiday.daysAway} days away\n`;
          }

          content += '\n';
        }
      }

      // Guidelines for Ferni
      content += '## How to Use This Information\n\n';
      content += 'You can naturally weave these into conversation when appropriate:\n';
      content += '- "Hey, your [person]\'s [event] is coming up. Want me to send them something?"\n';
      content += '- "You haven\'t talked to [person] in a while. Should we check in on them?"\n';
      content += '- "With [holiday] coming up, want to send greetings to your [group]?"\n\n';
      content += 'Be subtle and natural. Don\'t force it. Only mention if relevant to the conversation or if it\'s urgent (within 3 days).\n';
      content += 'When suggesting, ask which channel they prefer: email, text, or even a voice message.\n';

      if (content.length > 0) {
        chunks.push({
          id: 'outreach-awareness-main',
          source: 'outreach-awareness',
          category: 'superhuman',
          priority: 65,
          content,
          estimatedTokens: Math.ceil(content.length / 4),
          metadata: {
            upcomingDatesCount: nudgeContext.upcomingDates.length,
            needsAttentionCount: nudgeContext.needsAttention.length,
            holidaysCount: nudgeContext.upcomingHolidays.length,
          },
        });
      }

      log.debug(
        {
          userId,
          upcomingDates: nudgeContext.upcomingDates.length,
          needsAttention: nudgeContext.needsAttention.length,
          holidays: nudgeContext.upcomingHolidays.length,
        },
        'Built outreach awareness context'
      );
    } catch (error) {
      log.warn({ error: String(error), userId }, 'Failed to build outreach awareness context');
    }

    return chunks;
  },

  isRelevant(_context: ConversationContext): boolean {
    // Always relevant - we want Ferni to be aware of outreach opportunities
    return true;
  },
};

// ============================================================================
// TURN-SPECIFIC NUDGE (for inserting into specific turns)
// ============================================================================

/**
 * Get a nudge to potentially insert at the start of a conversation
 * Use this when the user hasn't spoken yet or at natural transition points
 */
export async function getConversationStarterNudge(userId: string): Promise<string | null> {
  try {
    const topNudge = await getTopNudgeForMention(userId);

    if (!topNudge) return null;

    // Only suggest at conversation start if it's truly urgent
    if (topNudge.nudge.priority !== 'high' && topNudge.nudge.daysUntilEvent !== 0) {
      return null;
    }

    return topNudge.suggestion;
  } catch (error) {
    log.warn({ error: String(error) }, 'Failed to get conversation starter nudge');
    return null;
  }
}

/**
 * Get nudge context for use in Alex's communication tools
 */
export async function getOutreachContextForTools(userId: string): Promise<{
  summary: string;
  upcomingDates: Array<{ name: string; type: string; daysAway: number }>;
  needsAttention: string[];
}> {
  const context = await buildNudgeContext(userId);

  return {
    summary: context.summary,
    upcomingDates: context.upcomingDates.map((d) => ({
      name: d.contactName,
      type: d.dateType,
      daysAway: d.daysAway,
    })),
    needsAttention: context.needsAttention.map((c) => c.contactName),
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export { outreachAwarenessBuilder as default };

