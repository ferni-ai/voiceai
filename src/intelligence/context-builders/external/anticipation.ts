/**
 * Anticipation Context Builder
 *
 * Injects location and calendar awareness for proactive support.
 * "Better than Human" - know where you're going and prepare you for it.
 *
 * Superhuman Capabilities:
 * - "You're heading to your mom's in 30 mins - want to rehearse?"
 * - "Traffic is bad - you have 20 extra minutes. Grounding exercise?"
 * - "You always seem stressed after Thursday meetings - what happens there?"
 *
 * @module intelligence/context-builders/anticipation
 */

import { createLogger } from '../../../utils/safe-logger.js';
import {
  hasCalendarConnected,
  generateAnticipationInsights,
  generateSuperhumanMoment,
  getUpcomingEvents,
  getCurrentLocation,
} from '../../../services/context-awareness/location-calendar.js';
import {
  registerContextBuilder,
  createHighInjection,
  type ContextBuilder,
  type ContextBuilderInput,
  type ContextInjection,
} from '../index.js';
import { loadPersonaContent } from '../../../services/persona-service/persona-content-loader.js';
import {
  checkDynamicTriggers,
  calculateProbabilityBoost,
  shouldSkipDueToNeverWhen,
  buildTriggerContext,
  type ProactiveTrigger,
} from '../dynamic-trigger-utils.js';

const log = createLogger({ module: 'context:anticipation' });

// ============================================================================
// TYPES FOR ANTICIPATION JSON
// ============================================================================

interface AnticipationContent {
  schema_version?: number;
  description?: string;
  looking_forward_to_topic?: string[];
  session_anticipation?: {
    opening_warmth?: string[];
    between_sessions?: string[];
    returning_after_time?: string[];
  };
  future_looking?: {
    curiosity_about_outcome?: string[];
    planting_seeds?: string[];
    expressing_hope?: string[];
  };
  pending_items?: {
    goal_tracking?: string[];
    person_mentioned?: string[];
    decision_pending?: string[];
  };
  continuity_markers?: {
    referencing_growth?: string[];
    acknowledging_journey?: string[];
  };
  proactive_triggers?: Record<string, ProactiveTrigger>;
  usage_rules?: {
    opening_anticipation_probability?: number;
    topic_callback_probability?: number;
    future_looking_probability?: number;
    requires_previous_session_data?: boolean;
    more_likely_when?: string[];
    never_when?: string[];
  };
}

// Cache for anticipation content per persona
const anticipationCache = new Map<string, AnticipationContent | null>();

/**
 * Load anticipation content for a persona
 */
async function loadAnticipationContent(personaId: string): Promise<AnticipationContent | null> {
  if (anticipationCache.has(personaId)) {
    return anticipationCache.get(personaId) || null;
  }

  try {
    const content = await loadPersonaContent<AnticipationContent>(personaId, 'anticipation');
    anticipationCache.set(personaId, content);
    if (content) {
      log.debug({ personaId }, 'Loaded anticipation content');
    }
    return content;
  } catch (error) {
    log.debug({ personaId, error: String(error) }, 'Could not load anticipation content');
    anticipationCache.set(personaId, null);
    return null;
  }
}

// Track superhuman moments to avoid repetition
const recentMoments = new Map<string, number>();
const MOMENT_COOLDOWN_MS = 15 * 60 * 1000; // 15 minutes

/**
 * Anticipation Context Builder
 *
 * Priority: 40 (after emotional context, before engagement)
 */
export const anticipationBuilder: ContextBuilder = {
  name: 'anticipation',
  description: 'Injects location and calendar awareness for proactive support',
  priority: 40,

  build: async (input: ContextBuilderInput): Promise<ContextInjection[]> => {
    const { services, userData, persona, userText, analysis } = input;
    const userId = services.userId;
    const personaId = persona?.id || 'ferni';

    if (!userId) return [];

    const injections: ContextInjection[] = [];

    // ============================================================================
    // DYNAMIC TRIGGERS - Check proactive_triggers from anticipation.json
    // Better Than Human: Define CONDITIONS for when to act
    // ============================================================================
    const anticipationContent = await loadAnticipationContent(personaId);

    if (anticipationContent?.proactive_triggers) {
      const triggerContext = buildTriggerContext(
        userText || '',
        analysis,
        userData as Record<string, unknown>
      );
      const usageRules = anticipationContent.usage_rules;

      // Check never_when conditions
      if (!shouldSkipDueToNeverWhen(usageRules?.never_when, triggerContext)) {
        const matchedTrigger = checkDynamicTriggers(
          anticipationContent.proactive_triggers,
          triggerContext
        );

        if (matchedTrigger) {
          // Calculate probability boost
          const probabilityBoost = calculateProbabilityBoost(
            usageRules?.more_likely_when,
            triggerContext,
            matchedTrigger
          );

          // Apply probability (base varies by persona, capped at 50%)
          const baseProbability = usageRules?.opening_anticipation_probability ?? 0.3;
          const adjustedProbability = Math.min(baseProbability * probabilityBoost, 0.5);

          if (Math.random() < adjustedProbability) {
            injections.push(
              createHighInjection(
                'anticipation_dynamic_trigger',
                `[🔮 BETTER-THAN-HUMAN ANTICIPATION: ${matchedTrigger.triggerName}]\n\n` +
                  `Condition detected: ${matchedTrigger.trigger}\n\n` +
                  `Suggested behavior: ${matchedTrigger.behavior}\n\n` +
                  `You can see around corners. Use this anticipation naturally.`,
                { category: 'anticipation', confidence: matchedTrigger.confidence }
              )
            );

            log.info(
              {
                userId,
                personaId,
                triggerName: matchedTrigger.triggerName,
                confidence: matchedTrigger.confidence,
              },
              '🔮 BETTER-THAN-HUMAN: Anticipation dynamic trigger activated'
            );
          }
        }
      }
    }

    // Check if user has calendar connected for calendar-based insights
    if (!hasCalendarConnected(userId)) {
      return injections; // Return any dynamic trigger injections even without calendar
    }

    try {
      // Generate anticipation insights
      const insights = await generateAnticipationInsights(userId);

      for (const insight of insights) {
        const priority =
          insight.urgency === 'high' ? 'high' : insight.urgency === 'medium' ? 'standard' : 'hint';

        injections.push({
          id: `anticipation-${insight.type}-${insight.event?.id || 'pattern'}`,
          source: 'anticipation',
          content: insight.insight,
          priority,
          category: `anticipation-${insight.type}`,
        });

        if (insight.suggestion) {
          injections.push({
            id: `anticipation-suggestion-${insight.type}`,
            source: 'anticipation',
            content: `SUGGESTION: ${insight.suggestion}`,
            priority: 'hint',
            category: 'anticipation-suggestion',
          });
        }
      }

      // Current location context
      const location = getCurrentLocation(userId);
      if (location && location.type !== 'unknown') {
        injections.push({
          id: 'anticipation-location',
          source: 'anticipation',
          content: `User is currently at ${location.type}${location.name ? ` (${location.name})` : ''}.`,
          priority: 'hint',
          category: 'location',
        });
      }

      // Check for superhuman moment opportunity
      const sessionId = services.sessionId;
      const lastMoment = recentMoments.get(sessionId) || 0;
      const turnCount = userData.turnCount || 0;

      if (turnCount >= 2 && Date.now() - lastMoment > MOMENT_COOLDOWN_MS) {
        const moment = generateSuperhumanMoment(userId);

        if (moment) {
          injections.push({
            id: 'anticipation-superhuman-moment',
            source: 'anticipation',
            content: `SUPERHUMAN MOMENT: You could naturally mention: "${moment}"`,
            priority: 'hint',
            category: 'superhuman-awareness',
          });

          recentMoments.set(sessionId, Date.now());
          log.debug({ userId, moment }, 'Superhuman anticipation moment available');
        }
      }

      // Upcoming events summary
      const events = getUpcomingEvents(userId);
      const urgentEvents = events.filter((e) => {
        const minutesUntil = (e.startTime.getTime() - Date.now()) / (1000 * 60);
        return minutesUntil > 0 && minutesUntil <= 60;
      });

      if (urgentEvents.length > 0) {
        const event = urgentEvents[0];
        const minutesUntil = Math.round((event.startTime.getTime() - Date.now()) / (1000 * 60));

        injections.push({
          id: 'anticipation-urgent-event',
          source: 'anticipation',
          content: `User has "${event.title}" in ${minutesUntil} minutes${event.location ? ` at ${event.location}` : ''}.`,
          priority: 'standard',
          category: 'upcoming-event',
        });
      }
    } catch (error) {
      log.warn({ error: String(error), userId }, 'Anticipation context generation failed');
    }

    return injections;
  },
};

// Register on module load
registerContextBuilder(anticipationBuilder);

export default anticipationBuilder;
