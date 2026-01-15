/**
 * Relationship Health Tool
 *
 * Check on the health of family relationships based on call history.
 * "How's my relationship with mom going?"
 *
 * @module tools/domains/family/relationship-health-tool
 */

import { z } from 'zod';
import { createLogger } from '../../../utils/safe-logger.js';

const log = createLogger({ module: 'relationship-health-tool' });

// ============================================================================
// SCHEMAS
// ============================================================================

export const checkRelationshipHealthSchema = z.object({
  contactName: z
    .string()
    .optional()
    .describe('Check health of a specific relationship, or leave empty for all'),
});

// ============================================================================
// TOOL IMPLEMENTATION
// ============================================================================

/**
 * Check relationship health
 */
export async function checkRelationshipHealth(
  params: z.infer<typeof checkRelationshipHealthSchema>,
  ctx: { userId: string }
): Promise<string> {
  const { contactName } = params;

  try {
    const { getAllRelationshipHealth, getRelationshipHealth } = await import(
      '../../../services/outreach/relationship-health-tracker.js'
    );

    // If specific contact, get their health
    if (contactName) {
      // First, resolve contact phone
      let contactPhone: string | undefined;
      try {
        const { findContactForTelephony, isEntityStoreReady } = await import(
          '../../../memory/entity-store/integration.js'
        );
        if (isEntityStoreReady()) {
          const contact = await findContactForTelephony(ctx.userId, contactName);
          contactPhone = contact?.phone;
        }
      } catch {
        // Continue without phone resolution
      }

      if (!contactPhone) {
        return (
          `I don't have enough call history with ${contactName} to assess our relationship health yet. ` +
          `Want me to give them a call?`
        );
      }

      const health = await getRelationshipHealth(ctx.userId, contactPhone);
      if (!health) {
        return (
          `I haven't made any calls to ${contactName} yet, so I can't assess the relationship health. ` +
          `Would you like me to start checking in with them?`
        );
      }

      return formatSingleRelationshipHealth(health, contactName);
    }

    // Otherwise, get overview of all relationships
    const allHealth = await getAllRelationshipHealth(ctx.userId);

    if (allHealth.length === 0) {
      return (
        "I don't have enough call history yet to assess relationship health. " +
        "As I make more calls on your behalf, I'll track how your conversations are going " +
        "and let you know if anything needs attention."
      );
    }

    return formatAllRelationshipHealth(allHealth);
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to check relationship health');
    return "I had trouble checking relationship health. Let me try again later.";
  }
}

// ============================================================================
// FORMATTING
// ============================================================================

function formatSingleRelationshipHealth(
  health: {
    healthScore: number;
    trend: string;
    totalCalls: number;
    recentSentiments: Array<{ sentiment: string }>;
    sentimentTrend: string;
    patterns: string[];
    concerns: string[];
    celebrations: string[];
    recommendations: string[];
  },
  contactName: string
): string {
  const parts: string[] = [];

  // Overall assessment
  const healthEmoji = health.healthScore >= 70 ? '💚' : health.healthScore >= 40 ? '💛' : '🧡';
  const healthDescription = 
    health.healthScore >= 80 ? 'strong and healthy' :
    health.healthScore >= 60 ? 'good' :
    health.healthScore >= 40 ? 'okay, but could use some attention' :
    'needing some care';

  parts.push(
    `${healthEmoji} Your relationship with ${contactName} is ${healthDescription}. ` +
    `Based on ${health.totalCalls} call${health.totalCalls !== 1 ? 's' : ''}, ` +
    `here's what I'm noticing:`
  );

  // Trend
  const trendEmoji = health.trend === 'improving' ? '📈' : health.trend === 'declining' ? '📉' : '➡️';
  const trendText = health.trend === 'improving' ? 'getting stronger' :
                   health.trend === 'declining' ? 'could use more attention' :
                   'staying steady';
  parts.push(`\n${trendEmoji} **Trend:** Things are ${trendText}.`);

  // Sentiment
  if (health.sentimentTrend === 'warming') {
    parts.push('🌡️ Conversations have been getting warmer and more positive.');
  } else if (health.sentimentTrend === 'cooling') {
    parts.push('🌡️ Recent conversations have felt a bit cooler - might be worth checking in.');
  }

  // Celebrations
  if (health.celebrations.length > 0) {
    parts.push(`\n✨ **Highlights:** ${health.celebrations[0]}`);
  }

  // Concerns
  if (health.concerns.length > 0) {
    parts.push(`\n⚠️ **Watch for:** ${health.concerns[0]}`);
  }

  // Patterns
  if (health.patterns.length > 0) {
    parts.push(`\n📊 **Patterns:** ${health.patterns.join('. ')}`);
  }

  // Recommendations
  if (health.recommendations.length > 0) {
    parts.push(`\n💡 **Suggestion:** ${health.recommendations[0]}`);
  }

  return parts.join('\n');
}

function formatAllRelationshipHealth(
  allHealth: Array<{
    contactName: string;
    relationship: string;
    healthScore: number;
    trend: string;
    totalCalls: number;
    concerns: string[];
    recommendations: string[];
  }>
): string {
  const parts: string[] = [];

  // Summary
  const healthy = allHealth.filter((h) => h.healthScore >= 70);
  const needsAttention = allHealth.filter((h) => h.healthScore < 40);
  const middle = allHealth.filter((h) => h.healthScore >= 40 && h.healthScore < 70);

  parts.push("Here's how your family relationships are doing based on our calls:\n");

  // Needs attention (show first)
  if (needsAttention.length > 0) {
    parts.push('**🧡 Needs attention:**');
    for (const health of needsAttention) {
      const name = health.contactName || 'Contact';
      const concern = health.concerns[0] ? ` - ${health.concerns[0]}` : '';
      parts.push(`- ${name}: Score ${health.healthScore}/100${concern}`);
    }
    parts.push('');
  }

  // Middle ground
  if (middle.length > 0) {
    parts.push('**💛 Doing okay:**');
    for (const health of middle) {
      const name = health.contactName || 'Contact';
      const trendArrow = health.trend === 'improving' ? '↑' : health.trend === 'declining' ? '↓' : '→';
      parts.push(`- ${name}: Score ${health.healthScore}/100 ${trendArrow}`);
    }
    parts.push('');
  }

  // Healthy
  if (healthy.length > 0) {
    parts.push('**💚 Going strong:**');
    for (const health of healthy) {
      const name = health.contactName || 'Contact';
      parts.push(`- ${name}: Score ${health.healthScore}/100 ✓`);
    }
    parts.push('');
  }

  // Overall recommendation
  if (needsAttention.length > 0) {
    const priority = needsAttention[0];
    parts.push(`\n💡 **Suggestion:** ${priority.contactName} could use some extra attention. Want me to call them?`);
  } else if (healthy.length === allHealth.length) {
    parts.push('\n✨ All your relationships are in great shape! Keep up the regular check-ins.');
  }

  return parts.join('\n');
}

// ============================================================================
// EXPORTS
// ============================================================================

export const relationshipHealthTool = {
  name: 'checkRelationshipHealth',
  description:
    'Check the health of family relationships based on call history. "How\'s my relationship with mom?"',
  schema: checkRelationshipHealthSchema,
  execute: checkRelationshipHealth,
};

export default relationshipHealthTool;
