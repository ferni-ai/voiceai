/**
 * LinkedIn Awareness Context Builder
 *
 * Injects career milestones and professional context from LinkedIn.
 * "Better than Human" - remember work anniversaries and career transitions.
 *
 * Superhuman Capabilities:
 * - "Your 5-year work anniversary at Acme is coming up next Tuesday!"
 * - "I see you've been in your role for 3 years - how are you feeling about it?"
 * - "Your connection Sarah just started a new position - might be worth reaching out"
 *
 * @module intelligence/context-builders/awareness/linkedin-awareness
 */

import { createLogger } from '../../../utils/safe-logger.js';
import {
  hasLinkedInConnected,
  initializeLinkedIn,
  generateLinkedInInsight,
  getUpcomingMilestones,
  getCurrentPosition,
  getLinkedInProfile,
  syncLinkedInData,
} from '../../../services/linkedin/index.js';
import {
  registerContextBuilder,
  createStandardInjection,
  createHighInjection,
  createHintInjection,
  type ContextBuilder,
  type ContextBuilderInput,
  type ContextInjection,
} from '../index.js';
import { BuilderCategory } from '../core/categories.js';

const log = createLogger({ module: 'context:linkedin-awareness' });

// Track when we last synced for each user
const lastSyncTime = new Map<string, number>();
const SYNC_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

// Track when we last injected to avoid repetition
const lastInjectionTime = new Map<string, number>();
const INJECTION_COOLDOWN_MS = 30 * 60 * 1000; // 30 minutes

// ============================================================================
// CONTEXT BUILDER
// ============================================================================

/**
 * LinkedIn Awareness Context Builder
 *
 * Priority: 50 (middle - after core context, before humanizing)
 */
export const linkedInAwarenessBuilder: ContextBuilder = {
  name: 'linkedin-awareness',
  description: 'Surfaces career milestones and professional context from LinkedIn',
  priority: 50,
  category: BuilderCategory.EXTERNAL,

  build: async (input: ContextBuilderInput): Promise<ContextInjection[]> => {
    const { services, userData, analysis } = input;
    const userId = services?.userId;

    if (!userId) return [];

    const injections: ContextInjection[] = [];

    // Initialize LinkedIn if not already done
    if (!hasLinkedInConnected(userId)) {
      const initialized = await initializeLinkedIn(userId);
      if (!initialized) {
        return []; // No LinkedIn connection
      }
    }

    // Check if we need to refresh data
    const lastSync = lastSyncTime.get(userId) || 0;
    if (Date.now() - lastSync > SYNC_INTERVAL_MS) {
      // Trigger background sync (non-blocking)
      void syncLinkedInData(userId);
      lastSyncTime.set(userId, Date.now());
    }

    // Check injection cooldown
    const lastInjection = lastInjectionTime.get(userId) || 0;
    const canInject = Date.now() - lastInjection > INJECTION_COOLDOWN_MS;

    // Generate insight
    const insight = generateLinkedInInsight(userId);

    if (insight && canInject) {
      if (insight.priority === 'high') {
        injections.push(
          createHighInjection('linkedin_milestone', insight.message, {
            category: 'career-intelligence',
          })
        );
      } else if (insight.priority === 'low') {
        injections.push(
          createHintInjection('linkedin_awareness', insight.message, {
            category: 'career-intelligence',
          })
        );
      } else {
        injections.push(
          createStandardInjection('linkedin_awareness', insight.message, {
            category: 'career-intelligence',
          })
        );
      }

      lastInjectionTime.set(userId, Date.now());

      log.debug(
        {
          userId,
          insightType: insight.type,
          priority: insight.priority,
        },
        'LinkedIn insight injected'
      );
    }

    // If conversation is about career/work, provide additional context
    const userText = input.userText?.toLowerCase() || '';
    const isCareerConversation =
      userText.includes('work') ||
      userText.includes('job') ||
      userText.includes('career') ||
      userText.includes('boss') ||
      userText.includes('coworker') ||
      userText.includes('promotion') ||
      analysis?.topics?.detected?.some((t) =>
        ['career', 'work', 'job', 'professional'].includes(t.toLowerCase())
      );

    if (isCareerConversation && canInject) {
      // Add current position context
      const currentPosition = getCurrentPosition(userId);
      const profile = getLinkedInProfile(userId);

      if (currentPosition) {
        const startDate = currentPosition.startDate;
        const yearsInRole = new Date().getFullYear() - startDate.year;

        if (yearsInRole > 0) {
          injections.push(
            createHintInjection(
              'linkedin_context',
              `[CONTEXT: User has been ${currentPosition.title} at ${currentPosition.companyName} for ~${yearsInRole} year${yearsInRole > 1 ? 's' : ''}. You can reference this naturally if relevant.]`,
              {
                category: 'career-intelligence',
              }
            )
          );
        }
      }

      // Check for upcoming milestones
      const milestones = getUpcomingMilestones(userId);
      if (milestones.length > 0 && !insight) {
        const nextMilestone = milestones[0];
        const daysUntil = Math.ceil(
          (nextMilestone.date.getTime() - Date.now()) / (24 * 60 * 60 * 1000)
        );

        if (daysUntil <= 14) {
          injections.push(
            createStandardInjection(
              'linkedin_upcoming',
              `[MILESTONE: ${nextMilestone.description} coming up in ${daysUntil} days. Could acknowledge if appropriate.]`,
              {
                category: 'career-intelligence',
              }
            )
          );
        }
      }
    }

    return injections;
  },
};

// Register the builder
registerContextBuilder(linkedInAwarenessBuilder);

// ============================================================================
// EXPORTS FOR DIRECT USE
// ============================================================================

export {
  hasLinkedInConnected,
  initializeLinkedIn,
  getUpcomingMilestones,
  getCurrentPosition,
  getLinkedInProfile,
} from '../../../services/linkedin/index.js';
