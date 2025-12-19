/**
 * Memory Tools
 *
 * Memory storage and retrieval tools for AI agents.
 *
 * NOTE: For new code, prefer:
 *   import { getToolDefinitions } from './domains/memory/index.js';
 */

import { llm, log } from '@livekit/agents';
import { z } from 'zod';
// Import directly from types to avoid circular dependency through services/index
import type { SessionServices } from '../services/types.js';
import { getLogger as getLoggerUtil } from './utils/tool-helpers.js';

import { getToolDescription } from './utils/tool-descriptions.js';
const getLogger = () => {
  try {
    return log();
  } catch {
    return getLoggerUtil();
  }
};

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

interface UserData {
  name?: string;
  userId?: string;
  services?: SessionServices;
  keyMoments?: string[];
  topics?: string[];
}

// ============================================================================
// MEMORY TOOLS
// ============================================================================

/**
 * Create all memory-related tools
 */
export function createMemoryTools() {
  return {
    // Remember something important about the user
    rememberAboutUser: llm.tool({
      description: getToolDescription('rememberAboutUser'),
      parameters: z.object({
        fact: z
          .string()
          .describe(
            'The important fact to remember (e.g., "has two kids", "retiring next year", "worried about healthcare costs")'
          ),
        category: z
          .enum(['personal', 'financial', 'emotional', 'goal', 'preference'])
          .describe('Category of the fact'),
        importance: z.enum(['low', 'medium', 'high']).describe('How important is this to remember'),
      }),
      execute: async ({ fact, category, importance }, { ctx }) => {
        getLogger().info(`Remembering about user: ${fact} (${category}, ${importance})`);

        const userData = ctx.userData as UserData;

        // Store in keyMoments for this session (for awareness tools)
        if (!userData.keyMoments) {
          userData.keyMoments = [];
        }
        userData.keyMoments.push(`[${category}] ${fact}`);

        // Feed to learning engine for persistence
        const { services } = userData;
        if (services?.captureInsight) {
          // Map category to insight type
          const typeMap: Record<string, string> = {
            personal: 'relationship',
            financial: 'concern',
            emotional: 'emotional_pattern',
            goal: 'goal',
            preference: 'preference',
          };
          const insightType = typeMap[category] || 'preference';
          const confidence = importance === 'high' ? 0.9 : importance === 'medium' ? 0.7 : 0.5;

          services.captureInsight(insightType, `explicit_memory_${category}`, fact, confidence);
          getLogger().info('Fact captured to learning engine for persistence');
        }

        const acknowledgments = [
          `I'll remember that.`,
          `That's important. I'm keeping that in mind.`,
          `Thank you for sharing that. I won't forget.`,
          `Noted. That helps me understand you better.`,
        ];
        return acknowledgments[Math.floor(Math.random() * acknowledgments.length)];
      },
    }),

    // Recall something from past conversations
    recallFromMemory: llm.tool({
      description: getToolDescription('recallFromMemory'),
      parameters: z.object({
        topic: z
          .string()
          .describe(
            'What you\'re trying to recall (e.g., "their retirement goals", "family situation", "what worried them")'
          ),
      }),
      execute: async ({ topic }, { ctx }) => {
        getLogger().info(`Trying to recall: ${topic}`);

        const userData = ctx.userData as UserData;
        const { services } = userData;

        if (services?.userProfile) {
          const profile = services.userProfile;

          // Check various memory stores
          if (profile.lastConversationSummary) {
            return `From our last conversation, I remember: ${profile.lastConversationSummary}`;
          }

          // Check if they have goals stored
          if (profile.goals && profile.goals.length > 0) {
            const goalSummary = profile.goals.map((g) => g.name).join(', ');
            return `I remember you mentioned these goals: ${goalSummary}`;
          }

          // Check preferred topics
          if (profile.preferredTopics && profile.preferredTopics.length > 0) {
            return `I recall you've been interested in: ${profile.preferredTopics.slice(0, 3).join(', ')}`;
          }
        }

        // Check session memory
        if (userData.keyMoments && userData.keyMoments.length > 0) {
          return `From our conversation today: ${userData.keyMoments.join('; ')}`;
        }

        return `I don't have specific memories about that yet. What's on your mind?`;
      },
    }),

    // Recall previous conversation semantically
    recallPreviousConversation: llm.tool({
      description: getToolDescription('recallPreviousConversation'),
      parameters: z.object({
        query: z
          .string()
          .describe(
            'What to search for in past conversations (e.g., "retirement planning", "market concerns", "family goals")'
          ),
      }),
      execute: async ({ query }, { ctx }) => {
        getLogger().info(`Semantic recall for: ${query}`);

        const userData = ctx.userData as UserData;
        const { services } = userData;

        if (services) {
          try {
            // Use semantic search on conversation history
            const result = await services.searchKnowledge(query);
            if (result) {
              return `I found something relevant in my memory: ${result}`;
            }
          } catch (error) {
            getLogger().warn(`Semantic recall error: ${error}`);
          }
        }

        return `I don't have specific memories about "${query}" from our past conversations. Would you like to tell me more about it?`;
      },
    }),

    // Remember an important fact to save to profile
    rememberImportantFact: llm.tool({
      description: getToolDescription('rememberImportantFact'),
      parameters: z.object({
        fact: z.string().describe('The critically important fact'),
        type: z
          .enum(['life_event', 'decision', 'breakthrough', 'milestone', 'concern'])
          .describe('Type of fact'),
        emotionalWeight: z.enum(['light', 'medium', 'heavy']).describe('Emotional significance'),
      }),
      execute: async ({ fact, type, emotionalWeight }, { ctx }) => {
        getLogger().info(`Saving important fact: ${fact} (${type}, ${emotionalWeight})`);

        const userData = ctx.userData as UserData;
        const { services } = userData;

        // Store in session for awareness tools
        if (!userData.keyMoments) {
          userData.keyMoments = [];
        }
        userData.keyMoments.push(`[${type}/${emotionalWeight}] ${fact}`);

        // Capture as key moment to learning engine for ACTUAL persistence
        if (services?.learningEngine) {
          const keyMomentType =
            type === 'life_event'
              ? 'milestone'
              : type === 'decision'
                ? 'decision'
                : type === 'breakthrough'
                  ? 'breakthrough'
                  : type === 'milestone'
                    ? 'celebration'
                    : 'concern';

          services.learningEngine.captureExternalKeyMoment({
            id: `explicit_${Date.now()}`,
            timestamp: new Date(),
            type: keyMomentType as
              | 'breakthrough'
              | 'milestone'
              | 'concern'
              | 'celebration'
              | 'decision'
              | 'shared_vulnerability',
            summary: fact,
            emotionalWeight: emotionalWeight as 'light' | 'medium' | 'heavy',
            topics: userData.topics || [],
          });
          getLogger().info('Important fact captured as key moment for persistence');
        } else if (services?.captureInsight) {
          // Fallback to insight capture
          services.captureInsight(
            'emotional_pattern',
            `key_${type}`,
            fact,
            emotionalWeight === 'heavy' ? 0.9 : 0.7
          );
        }

        const responses: Record<string, string[]> = {
          life_event: [
            `That's a significant moment in your life. I'll remember this.`,
            `Thank you for trusting me with that. It's important.`,
          ],
          decision: [
            `That's a big decision. I'll keep this in mind.`,
            `I understand the weight of that choice. I won't forget.`,
          ],
          breakthrough: [
            `That's wonderful progress! I'm so glad you shared that.`,
            `What a breakthrough. This is really important.`,
          ],
          milestone: [
            `Congratulations on reaching that milestone. I'll remember this moment.`,
            `That's worth celebrating. I'll keep this in mind.`,
          ],
          concern: [
            `I hear that this is weighing on you. I'll remember.`,
            `That concern is valid. I'll keep this in our conversations.`,
          ],
        };

        const typeResponses = responses[type] || responses.life_event;
        return typeResponses[Math.floor(Math.random() * typeResponses.length)];
      },
    }),

    // Get relationship summary
    getRelationshipSummary: llm.tool({
      description: getToolDescription('getRelationshipSummary'),
      parameters: z.object({}),
      execute: async (_, { ctx }) => {
        getLogger().info('Getting relationship summary');

        const userData = ctx.userData as UserData;
        const { services } = userData;

        if (services?.userProfile) {
          const profile = services.userProfile;
          const sections: string[] = [];

          if (profile.name) {
            sections.push(`I know this person as ${profile.name}.`);
          }

          if (profile.totalConversations > 1) {
            sections.push(`We've had ${profile.totalConversations} conversations together.`);
            sections.push(`Our relationship is in the "${profile.relationshipStage}" stage.`);
          }

          if (profile.preferredTopics.length > 0) {
            sections.push(
              `They tend to discuss: ${profile.preferredTopics.slice(0, 3).join(', ')}.`
            );
          }

          if (profile.goals.length > 0) {
            const activeGoals = profile.goals.filter((g) => g.status === 'active');
            if (activeGoals.length > 0) {
              sections.push(
                `They're working toward: ${activeGoals.map((g) => g.name).join(', ')}.`
              );
            }
          }

          if (profile.lastConversationSummary) {
            sections.push(`Last time: ${profile.lastConversationSummary}`);
          }

          return sections.length > 0
            ? sections.join(' ')
            : "This appears to be a new friend. I'm still getting to know them.";
        }

        // New user
        const { name } = userData;
        return name
          ? `I just met ${name} today. We're still getting to know each other.`
          : `This is a new conversation. I'm still getting to know this person.`;
      },
    }),
  };
}

export default createMemoryTools;
