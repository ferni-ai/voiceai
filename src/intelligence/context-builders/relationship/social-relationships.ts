/**
 * Social Relationships Context Builder
 *
 * Injects relationship awareness from the social graph.
 * "Better than Human" - remember everyone important to you.
 *
 * Superhuman Capabilities:
 * - "You haven't mentioned Sarah in 3 weeks - everything okay?"
 * - "You always seem happier after talking to your brother"
 * - "Today's your mom's birthday - how are you feeling about it?"
 *
 * Privacy-First: Only tracks names mentioned IN conversation, never accesses contacts.
 *
 * @module intelligence/context-builders/social-relationships
 */

import { createLogger } from '../../../utils/safe-logger.js';
import {
  recordMention,
  extractNames,
  generateSocialInsights,
  generateSuperhumanMoment,
  getImportantPeople,
} from '../../services/social-graph/index.js';
import {
  registerContextBuilder,
  type ContextBuilder,
  type ContextBuilderInput,
  type ContextInjection,
} from '../index.js';

const log = createLogger({ module: 'context:social-relationships' });

// Track superhuman moments to avoid repetition
const recentMoments = new Map<string, number>();
const MOMENT_COOLDOWN_MS = 20 * 60 * 1000; // 20 minutes for social moments

// Track which people have been mentioned this session to avoid duplicate processing
const sessionMentions = new Map<string, Set<string>>();

/**
 * Social Relationships Context Builder
 *
 * Priority: 55 (after core emotional, before personalization)
 */
export const socialRelationshipsBuilder: ContextBuilder = {
  name: 'social-relationships',
  description: 'Injects relationship awareness from conversation mentions',
  priority: 55,

  build: async (input: ContextBuilderInput): Promise<ContextInjection[]> => {
    const { services, userData, userText, analysis } = input;
    const userId = services.userId;
    const sessionId = services.sessionId;

    if (!userId) return [];

    const injections: ContextInjection[] = [];

    // Initialize session mentions tracking
    if (!sessionMentions.has(sessionId)) {
      sessionMentions.set(sessionId, new Set());
    }
    const mentionedThisSession = sessionMentions.get(sessionId)!;

    // Extract names from user's message and record mentions
    const extractedNames = extractNames(userText);

    for (const { name, context } of extractedNames) {
      // Skip if already processed this session
      if (mentionedThisSession.has(name.toLowerCase())) continue;
      mentionedThisSession.add(name.toLowerCase());

      // Estimate sentiment from conversation analysis
      const sentiment =
        analysis.emotion.primary === 'joy'
          ? 0.5
          : analysis.emotion.primary === 'sadness'
            ? -0.5
            : analysis.emotion.primary === 'anger'
              ? -0.3
              : analysis.emotion.primary === 'anxiety'
                ? -0.2
                : 0;

      // Record the mention
      recordMention(
        userId,
        name,
        context,
        sentiment,
        analysis.topics.detected,
        analysis.emotion.intensity || 0.5
      );

      log.debug({ userId, name, sentiment }, 'Recorded person mention');
    }

    // Generate social insights
    const insights = generateSocialInsights(userId);

    for (const insight of insights) {
      const priority =
        insight.urgency === 'high' ? 'high' : insight.urgency === 'medium' ? 'standard' : 'hint';

      // Format based on insight type
      let content: string;
      switch (insight.type) {
        case 'withdrawal':
          content = `SOCIAL AWARENESS: ${insight.insight}`;
          break;
        case 'date':
          content = `IMPORTANT DATE: ${insight.insight}`;
          break;
        case 'pattern':
          content = `RELATIONSHIP PATTERN: ${insight.insight}`;
          break;
        case 'sentiment':
          content = `RELATIONSHIP INSIGHT: ${insight.insight}`;
          break;
        default:
          content = insight.insight;
      }

      injections.push({
        id: `social-${insight.type}-${insight.personName}`,
        source: 'social-relationships',
        content,
        priority,
        category: `social-${insight.type}`,
      });

      if (insight.suggestion) {
        injections.push({
          id: `social-suggestion-${insight.personName}`,
          source: 'social-relationships',
          content: insight.suggestion,
          priority: 'hint',
          category: 'social-suggestion',
        });
      }
    }

    // Add context about important people if relevant to conversation
    const importantPeople = getImportantPeople(userId);
    const mentionedInMessage = extractedNames.map((n) => n.name.toLowerCase());

    for (const person of importantPeople.slice(0, 3)) {
      if (mentionedInMessage.includes(person.name.toLowerCase())) {
        // User is talking about this person - provide context
        const sentimentDesc =
          person.averageSentiment > 0.3
            ? 'generally positive'
            : person.averageSentiment < -0.3
              ? 'often difficult'
              : 'varied';

        injections.push({
          id: `social-context-${person.id}`,
          source: 'social-relationships',
          content: `User is discussing ${person.name} (${person.relationship}). Conversations about them are ${sentimentDesc}. Last mentioned ${daysSince(person.lastMentioned)} days ago.`,
          priority: 'hint',
          category: 'relationship-context',
        });

        // If there are associated topics, mention them
        if (person.associatedTopics.length > 0) {
          injections.push({
            id: `social-topics-${person.id}`,
            source: 'social-relationships',
            content: `Topics often discussed about ${person.name}: ${person.associatedTopics.slice(0, 3).join(', ')}`,
            priority: 'hint',
            category: 'relationship-context',
          });
        }
      }
    }

    // Check for superhuman moment opportunity
    const lastMoment = recentMoments.get(sessionId) || 0;
    const turnCount = userData.turnCount || 0;

    if (turnCount >= 3 && Date.now() - lastMoment > MOMENT_COOLDOWN_MS) {
      const moment = generateSuperhumanMoment(userId);

      if (moment) {
        injections.push({
          id: 'social-superhuman-moment',
          source: 'social-relationships',
          content: `SUPERHUMAN SOCIAL MOMENT: You could naturally mention: "${moment}"`,
          priority: 'hint',
          category: 'superhuman-awareness',
        });

        recentMoments.set(sessionId, Date.now());
        log.debug({ userId, moment }, 'Superhuman social moment available');
      }
    }

    return injections;
  },
};

/**
 * Calculate days since a date
 */
function daysSince(date: Date): number {
  return Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * Clear session mentions on session end
 */
export function clearSessionMentions(sessionId: string): void {
  sessionMentions.delete(sessionId);
  recentMoments.delete(sessionId);
}

// Register on module load
registerContextBuilder(socialRelationshipsBuilder);

export default socialRelationshipsBuilder;
