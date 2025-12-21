/**
 * Memory Domain - Tool Implementations
 *
 * Agent-agnostic memory tools that work with any persona.
 * No agent-specific references - just pure memory functionality.
 */

import { llm } from '@livekit/agents';
import { z } from 'zod';
import { getLogger } from '../../../utils/safe-logger.js';
import type { Tool, ToolContext, ToolDefinition } from '../../registry/types.js';

import { getToolDescription } from '../../utils/tool-descriptions.js';
// ============================================================================
// SERVICE TYPES
// ============================================================================

interface UserProfile {
  name?: string;
  totalConversations: number;
  relationshipStage: string;
  preferredTopics: string[];
  goals: Array<{ name: string; status: string }>;
  lastConversationSummary?: string;
}

interface LearningEngine {
  captureExternalKeyMoment: (moment: {
    id: string;
    timestamp: Date;
    type:
      | 'breakthrough'
      | 'milestone'
      | 'concern'
      | 'celebration'
      | 'decision'
      | 'shared_vulnerability';
    summary: string;
    emotionalWeight: 'light' | 'medium' | 'heavy';
    topics: string[];
  }) => void;
}

interface SessionServices {
  userProfile?: UserProfile;
  learningEngine?: LearningEngine;
  captureInsight?: (type: string, source: string, content: string, confidence: number) => void;
  searchKnowledge?: (query: string) => Promise<string | null>;
}

interface UserData {
  name?: string;
  userId?: string;
  services?: SessionServices;
  keyMoments?: string[];
  topics?: string[];
}

// ============================================================================
// REMEMBER ABOUT USER
// ============================================================================

export const rememberAboutUserDef: ToolDefinition = {
  id: 'rememberAboutUser',
  name: 'Remember About User',
  description: 'Store an important fact about the user for future recall across conversations',
  domain: 'memory',
  tags: ['memory', 'storage', 'facts'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
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
      execute: async ({ fact, category, importance }, { ctx: toolCtx }) => {
        getLogger().info(
          { agentId: ctx.agentId, fact, category, importance },
          'Remembering about user'
        );

        const userData = toolCtx.userData as UserData;

        // Store in keyMoments for this session (for awareness tools)
        if (!userData.keyMoments) {
          userData.keyMoments = [];
        }
        userData.keyMoments.push(`[${category}] ${fact}`);

        // Feed to learning engine for persistence
        const { services } = userData;
        if (services?.captureInsight) {
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

        // Return empty string - agent should continue naturally without reading any acknowledgment
        // The tool executed silently; the agent decides how/if to respond
        return '';
      },
    });
  },
};

// ============================================================================
// RECALL FROM MEMORY
// ============================================================================

export const recallFromMemoryDef: ToolDefinition = {
  id: 'recallFromMemory',
  name: 'Recall From Memory',
  description: 'Try to recall something from previous conversations with this user',
  domain: 'memory',
  tags: ['memory', 'recall', 'history'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('recallFromMemory'),
      parameters: z.object({
        topic: z
          .string()
          .describe(
            'What you\'re trying to recall (e.g., "their retirement goals", "family situation", "what worried them")'
          ),
      }),
      execute: async ({ topic }, { ctx: toolCtx }) => {
        getLogger().info({ agentId: ctx.agentId, topic }, 'Trying to recall');

        const userData = toolCtx.userData as UserData;
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
    });
  },
};

// ============================================================================
// RECALL PREVIOUS CONVERSATION (SEMANTIC)
// ============================================================================

export const recallPreviousConversationDef: ToolDefinition = {
  id: 'recallPreviousConversation',
  name: 'Recall Previous Conversation',
  description: 'Search memory for relevant past conversations based on a topic or theme',
  domain: 'memory',
  tags: ['memory', 'semantic-search', 'history'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('recallPreviousConversation'),
      parameters: z.object({
        query: z
          .string()
          .describe(
            'What to search for in past conversations (e.g., "retirement planning", "market concerns", "family goals")'
          ),
      }),
      execute: async ({ query }, { ctx: toolCtx }) => {
        getLogger().info({ agentId: ctx.agentId, query }, 'Semantic recall');

        const userData = toolCtx.userData as UserData;
        const { services } = userData;

        if (services?.searchKnowledge) {
          try {
            // Use semantic search on conversation history
            const result = await services.searchKnowledge(query);
            if (result) {
              return `I found something relevant in my memory: ${result}`;
            }
          } catch (error) {
            getLogger().warn({ error, query }, 'Semantic recall error');
          }
        }

        return `I don't have specific memories about "${query}" from our past conversations. Would you like to tell me more about it?`;
      },
    });
  },
};

// ============================================================================
// REMEMBER IMPORTANT FACT
// ============================================================================

export const rememberImportantFactDef: ToolDefinition = {
  id: 'rememberImportantFact',
  name: 'Remember Important Fact',
  description: 'Save a critically important fact that should be remembered forever',
  domain: 'memory',
  tags: ['memory', 'storage', 'important', 'milestone'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('rememberImportantFact'),
      parameters: z.object({
        fact: z.string().describe('The critically important fact'),
        type: z
          .enum(['life_event', 'decision', 'breakthrough', 'milestone', 'concern'])
          .describe('Type of fact'),
        emotionalWeight: z.enum(['light', 'medium', 'heavy']).describe('Emotional significance'),
      }),
      execute: async ({ fact, type, emotionalWeight }, { ctx: toolCtx }) => {
        getLogger().info(
          { agentId: ctx.agentId, fact, type, emotionalWeight },
          'Saving important fact'
        );

        const userData = toolCtx.userData as UserData;
        const { services } = userData;

        // Store in session for awareness tools
        if (!userData.keyMoments) {
          userData.keyMoments = [];
        }
        userData.keyMoments.push(`[${type}/${emotionalWeight}] ${fact}`);

        // Capture as key moment to learning engine for persistence
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

        // Generic responses (no agent-specific phrasing)
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
            `That concern is valid. I'll keep this in mind.`,
          ],
          default: [
            `I'll hold onto that. It feels important.`,
            `Thank you for trusting me with that.`,
          ],
        };

        const options = responses[type] || responses.default;
        return options[Math.floor(Math.random() * options.length)];
      },
    });
  },
};

// ============================================================================
// GET RELATIONSHIP SUMMARY
// ============================================================================

export const getRelationshipSummaryDef: ToolDefinition = {
  id: 'getRelationshipSummary',
  name: 'Get Relationship Summary',
  description:
    "Get a summary of the relationship with this user - how long you've known them, key moments, etc.",
  domain: 'memory',
  tags: ['memory', 'relationship', 'summary'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('getRelationshipSummary'),
      parameters: z.object({}),
      execute: async (_, { ctx: toolCtx }) => {
        getLogger().info({ agentId: ctx.agentId }, 'Getting relationship summary');

        const userData = toolCtx.userData as UserData;
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
    });
  },
};

// ============================================================================
// UPDATE MEMORY
// ============================================================================

export const updateMemoryDef: ToolDefinition = {
  id: 'updateMemory',
  name: 'Update Memory',
  description:
    'Update an existing memory with new information when the user corrects or adds to what you remember',
  domain: 'memory',
  tags: ['memory', 'update', 'modification'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('updateMemory'),
      parameters: z.object({
        originalFact: z.string().describe('What you currently remember that needs updating'),
        updatedFact: z.string().describe('The corrected or updated information'),
        reason: z
          .string()
          .optional()
          .describe('Why the update was needed (correction, change, addition)'),
      }),
      execute: async ({ originalFact, updatedFact, reason }, { ctx: toolCtx }) => {
        getLogger().info(
          { agentId: ctx.agentId, originalFact, updatedFact, reason },
          'Updating memory'
        );

        const userData = toolCtx.userData as UserData;
        const { services } = userData;

        // Update in session memory
        if (userData.keyMoments) {
          const index = userData.keyMoments.findIndex((m) =>
            m.toLowerCase().includes(originalFact.toLowerCase())
          );
          if (index !== -1) {
            userData.keyMoments[index] = `[updated] ${updatedFact}`;
          } else {
            userData.keyMoments.push(`[updated] ${updatedFact}`);
          }
        }

        // Capture update as insight for persistence
        if (services?.captureInsight) {
          services.captureInsight(
            'correction',
            'memory_update',
            `Updated: "${originalFact}" → "${updatedFact}"${reason ? ` (${reason})` : ''}`,
            0.9
          );
        }

        // Return empty string - agent should continue naturally without reading any acknowledgment
        return '';
      },
    });
  },
};

// ============================================================================
// FORGET MEMORY
// ============================================================================

export const forgetMemoryDef: ToolDefinition = {
  id: 'forgetMemory',
  name: 'Forget Memory',
  description: 'Remove something from memory when the user asks you to forget it',
  domain: 'memory',
  tags: ['memory', 'delete', 'forget', 'privacy'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('forgetMemory'),
      parameters: z.object({
        whatToForget: z.string().describe('What the user wants you to forget'),
        confirmDeletion: z
          .boolean()
          .describe('Whether the user has confirmed they want this forgotten'),
      }),
      execute: async ({ whatToForget, confirmDeletion }, { ctx: toolCtx }) => {
        getLogger().info(
          { agentId: ctx.agentId, whatToForget, confirmDeletion },
          'Forgetting memory'
        );

        if (!confirmDeletion) {
          return `Just to confirm - you'd like me to forget about "${whatToForget}"? Let me know and I'll remove it.`;
        }

        const userData = toolCtx.userData as UserData;
        const { services } = userData;

        // Remove from session memory
        if (userData.keyMoments) {
          userData.keyMoments = userData.keyMoments.filter(
            (m) => !m.toLowerCase().includes(whatToForget.toLowerCase())
          );
        }

        // Log the deletion for audit purposes (but don't persist the deleted content)
        if (services?.captureInsight) {
          services.captureInsight(
            'user_action',
            'memory_deletion',
            `User requested deletion of memory related to: [redacted]`,
            1.0
          );
        }

        // Return empty string - agent should continue naturally without reading any acknowledgment
        return '';
      },
    });
  },
};
