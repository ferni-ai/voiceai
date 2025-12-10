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

import { createLogger } from '../../utils/safe-logger.js';
import {
  hasCalendarConnected,
  generateAnticipationInsights,
  generateSuperhumanMoment,
  getUpcomingEvents,
  getCurrentLocation,
} from '../../services/context-awareness/location-calendar.js';
import {
  registerContextBuilder,
  type ContextBuilder,
  type ContextBuilderInput,
  type ContextInjection,
} from './index.js';

const log = createLogger({ module: 'context:anticipation' });

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
    const { services, userData } = input;
    const userId = services.userId;

    if (!userId) return [];

    // Check if user has calendar connected
    if (!hasCalendarConnected(userId)) {
      return [];
    }

    const injections: ContextInjection[] = [];

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
