/**
 * Relationship Health Context Builder
 *
 * Injects relationship health insights into the LLM context.
 *
 * "Better Than Human" capability: Track relationship health over time
 * and proactively surface when relationships need attention.
 *
 * Features:
 * - Relationship health scores
 * - Drift detection (decreasing contact/mentions)
 * - Proactive nudges for neglected relationships
 * - Celebration of relationship milestones
 *
 * @module intelligence/context-builders/superhuman/relationship-health-context
 */

import { createLogger } from '../../../utils/safe-logger.js';
import { BuilderCategory } from '../core/categories.js';
import type { ContextBuilder, ContextBuilderInput, ContextInjection } from '../core/types.js';
import { createStandardInjection, registerContextBuilder } from '../index.js';

const log = createLogger({ module: 'context:relationship-health' });

// ============================================================================
// CONFIGURATION
// ============================================================================

// Minimum turn count before surfacing relationship health
const MIN_TURN_FOR_HEALTH = 2;

// Cache TTL for relationship health (stable data)
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

// Cache to avoid repeated calculations
const healthCache = new Map<string, { data: unknown; timestamp: number }>();

// ============================================================================
// BUILDER
// ============================================================================

export const relationshipHealthBuilder: ContextBuilder = {
  name: 'relationship-health',
  description: 'Injects relationship health insights and drift alerts',
  priority: 50, // After memory, with cognitive
  category: BuilderCategory.COGNITIVE,

  build: async (input: ContextBuilderInput): Promise<ContextInjection[]> => {
    const { services, userData, analysis, userText } = input;
    const userId = services?.userId;

    if (!userId) {
      return [];
    }

    const turnCount = userData?.turnCount || 0;

    // Skip early turns
    if (turnCount < MIN_TURN_FOR_HEALTH) {
      return [];
    }

    // Check if user is talking about a person
    const mentionedPerson = extractPersonMention(userText || '');
    const topics = analysis?.topics?.detected || [];
    const isRelationshipRelevant =
      mentionedPerson ||
      topics.some((t) =>
        ['relationship', 'family', 'friend', 'partner', 'colleague'].includes(t.toLowerCase())
      );

    // Skip if no relationship context
    if (!isRelationshipRelevant) {
      return [];
    }

    try {
      // Check cache first
      const cached = healthCache.get(userId);
      const now = Date.now();

      if (cached && now - cached.timestamp < CACHE_TTL_MS) {
        const formatted = formatHealthForPrompt(cached.data, mentionedPerson);
        if (formatted) {
          return [
            createStandardInjection('relationship_health', formatted, {
              category: 'superhuman',
              confidence: 0.8,
            }),
          ];
        }
        return [];
      }

      // Dynamic import to avoid circular dependencies
      const { getContacts, getContactsNeedingAttention } = await import(
        '../../../services/contacts/contact-relationship-service.js'
      );

      // Get contacts that need attention (drift alerts)
      const needingAttention = await getContactsNeedingAttention(userId);
      const contacts = await getContacts(userId);

      if ((!needingAttention || needingAttention.length === 0) && (!contacts || contacts.length === 0)) {
        return [];
      }

      const dayMs = 24 * 60 * 60 * 1000;

      // Build health data from contacts
      const healthData = {
        driftAlerts: needingAttention?.map((c) => {
          const daysSince = c.lastInteraction ? Math.floor((now - new Date(c.lastInteraction).getTime()) / dayMs) : 0;
          return {
            personName: c.name,
            daysSinceContact: daysSince,
            severity: daysSince > 30 ? 'high' : 'medium',
            suggestion: 'Consider reaching out',
          };
        }) || [],
        priorityRelationships: contacts?.slice(0, 10).map((c) => {
          const daysSince = c.lastInteraction ? Math.floor((now - new Date(c.lastInteraction).getTime()) / dayMs) : 0;
          return {
            name: c.name,
            healthScore: Math.max(0, 100 - daysSince),
            trend: daysSince > 14 ? 'declining' : 'stable',
            suggestedActions: [],
          };
        }) || [],
        mentionedPerson,
      };

      // Cache the result
      healthCache.set(userId, { data: healthData, timestamp: now });

      // Format for LLM
      const formatted = formatHealthForPrompt(healthData, mentionedPerson);

      if (!formatted || formatted.length < 50) {
        return [];
      }

      log.debug(
        {
          userId,
          driftAlertCount: healthData.driftAlerts.length,
          mentionedPerson,
        },
        '💚 Injecting relationship health context'
      );

      return [
        createStandardInjection('relationship_health', formatted, {
          category: 'superhuman',
          confidence: 0.8,
        }),
      ];
    } catch (error) {
      log.debug({ error: String(error), userId }, 'Relationship health fetch failed (non-fatal)');
      return [];
    }
  },
};

// ============================================================================
// HELPERS
// ============================================================================

interface HealthData {
  driftAlerts?: Array<{
    personName: string;
    daysSinceContact: number;
    severity: string;
    suggestion: string;
  }>;
  priorityRelationships?: Array<{
    name: string;
    healthScore: number;
    trend: string;
    suggestedActions?: Array<{ suggestion: string }>;
  }>;
  mentionedPerson?: string;
}

function formatHealthForPrompt(data: unknown, mentionedPerson?: string): string {
  const healthData = data as HealthData;
  if (!healthData) return '';

  const sections: string[] = [];

  // If they mentioned someone specific, surface relevant health data
  if (mentionedPerson && healthData.priorityRelationships) {
    const personHealth = healthData.priorityRelationships.find(
      (r) => r.name.toLowerCase() === mentionedPerson.toLowerCase()
    );
    if (personHealth) {
      sections.push(
        `## Relationship with ${personHealth.name}
Health Score: ${personHealth.healthScore}/100 (${personHealth.trend})
${personHealth.suggestedActions?.[0]?.suggestion ? `Suggestion: ${personHealth.suggestedActions[0].suggestion}` : ''}`
      );
    }
  }

  // Surface drift alerts (relationships needing attention)
  if (healthData.driftAlerts && healthData.driftAlerts.length > 0) {
    const criticalAlerts = healthData.driftAlerts.filter((a) => a.severity === 'high');
    if (criticalAlerts.length > 0) {
      sections.push(
        `## Relationships Needing Attention
${criticalAlerts
  .slice(0, 3)
  .map((a) => `- **${a.personName}**: ${a.daysSinceContact} days since contact - ${a.suggestion}`)
  .join('\n')}

Note: These relationships may be drifting. If appropriate, gently surface this awareness.`
      );
    }
  }

  return sections.join('\n\n');
}

function extractPersonMention(text: string): string | undefined {
  const personPatterns = [
    /my (mom|dad|mother|father|sister|brother|wife|husband|partner|friend|boss|colleague|son|daughter)/i,
    /(?:my friend |my coworker |my partner )(\w+)/i,
    /(\b[A-Z][a-z]+\b)(?:\s+(?:said|told|asked|mentioned))/,
  ];

  for (const pattern of personPatterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      return match[1];
    }
  }
  return undefined;
}

// ============================================================================
// CLEANUP
// ============================================================================

/**
 * Clear the health cache
 */
export function clearHealthCache(userId?: string): void {
  if (userId) {
    healthCache.delete(userId);
  } else {
    healthCache.clear();
  }
}

// ============================================================================
// REGISTRATION
// ============================================================================

registerContextBuilder(relationshipHealthBuilder);

export default relationshipHealthBuilder;
