/**
 * Memory Domain - Unified Tool Implementations
 *
 * REFACTORED to use UnifiedMemoryService as the SINGLE entry point.
 * All memory operations flow through the unified service for:
 * - Consistent timing intelligence
 * - Learning feedback loop
 * - Proper context enrichment
 *
 * @module tools/domains/memory/tools-unified
 */

import { llm } from '@livekit/agents';
import { z } from 'zod';
import { getUnifiedMemoryService } from '../../../services/unified-memory-service.js';
import { getLogger } from '../../../utils/safe-logger.js';
import type { Tool, ToolContext, ToolDefinition } from '../../registry/types.js';
import { getToolDescription } from '../../utils/tool-descriptions.js';

const log = getLogger();

// ============================================================================
// TYPES
// ============================================================================

interface UserData {
  name?: string;
  userId?: string;
  keyMoments?: string[];
  topics?: string[];
}

// ============================================================================
// RECALL FROM MEMORY (Unified)
// ============================================================================

export const recallFromMemoryUnifiedDef: ToolDefinition = {
  id: 'recallFromMemory',
  name: 'Recall From Memory',
  description: 'Try to recall something from previous conversations with this user',
  domain: 'memory',
  tags: ['memory', 'recall', 'history', 'unified'],

  create: (ctx: ToolContext): Tool => {
    const memoryService = getUnifiedMemoryService();

    return llm.tool({
      description: getToolDescription('recallFromMemory'),
      parameters: z.object({
        topic: z
          .string()
          .describe(
            'What you\'re trying to recall (e.g., "their retirement goals", "family situation")'
          ),
      }),
      execute: async ({ topic }, { ctx: toolCtx }) => {
        log.info({ agentId: ctx.agentId, topic }, '🧠 [UNIFIED] Recall from memory');

        const userData = toolCtx.userData as UserData;
        const userId = userData.userId || ctx.userId;

        if (!userId) {
          return `I don't have specific memories about that yet. What's on your mind?`;
        }

        // Use unified memory service for search
        const result = await memoryService.search({
          query: topic,
          userId,
          limit: 3,
          minScore: 0.4,
        });

        if (result) {
          // Record feedback that we surfaced this memory
          memoryService.recordFeedback({
            memoryId: `recall_${Date.now()}`,
            userId,
            action: 'surfaced',
            context: { personaId: ctx.agentId },
          });

          return `I found something relevant: ${result}`;
        }

        // Check session memory as fallback
        if (userData.keyMoments && userData.keyMoments.length > 0) {
          return `From our conversation today: ${userData.keyMoments.join('; ')}`;
        }

        return `I don't have specific memories about that yet. What's on your mind?`;
      },
    });
  },
};

// ============================================================================
// RECALL PREVIOUS CONVERSATION (Unified)
// ============================================================================

export const recallPreviousConversationUnifiedDef: ToolDefinition = {
  id: 'recallPreviousConversation',
  name: 'Recall Previous Conversation',
  description: 'Search memory for relevant past conversations based on a topic or theme',
  domain: 'memory',
  tags: ['memory', 'semantic-search', 'history', 'unified'],

  create: (ctx: ToolContext): Tool => {
    const memoryService = getUnifiedMemoryService();

    return llm.tool({
      description: getToolDescription('recallPreviousConversation'),
      parameters: z.object({
        query: z
          .string()
          .describe(
            'What to search for in past conversations (e.g., "retirement planning", "market concerns")'
          ),
      }),
      execute: async ({ query }, { ctx: toolCtx }) => {
        log.info({ agentId: ctx.agentId, query }, '🧠 [UNIFIED] Semantic recall');

        const userData = toolCtx.userData as UserData;
        const userId = userData.userId || ctx.userId;

        if (!userId) {
          return `I don't have specific memories about "${query}" yet. Would you like to tell me more?`;
        }

        // Use unified memory service
        const result = await memoryService.search({
          query,
          userId,
          limit: 5,
          minScore: 0.35,
        });

        if (result) {
          memoryService.recordFeedback({
            memoryId: `semantic_${Date.now()}`,
            userId,
            action: 'surfaced',
            context: { personaId: ctx.agentId },
          });

          return `I found something relevant in my memory: ${result}`;
        }

        return `I don't have specific memories about "${query}" from our past conversations. Would you like to tell me more about it?`;
      },
    });
  },
};

// ============================================================================
// REMEMBER ABOUT USER (Unified)
// ============================================================================

export const rememberAboutUserUnifiedDef: ToolDefinition = {
  id: 'rememberAboutUser',
  name: 'Remember About User',
  description: 'Store an important fact about the user for future recall across conversations',
  domain: 'memory',
  tags: ['memory', 'storage', 'facts', 'unified'],

  create: (ctx: ToolContext): Tool => {
    const memoryService = getUnifiedMemoryService();

    return llm.tool({
      description: getToolDescription('rememberAboutUser'),
      parameters: z.object({
        fact: z
          .string()
          .describe('The important fact to remember (e.g., "has two kids", "retiring next year")'),
        category: z
          .enum(['personal', 'financial', 'emotional', 'goal', 'preference'])
          .describe('Category of the fact'),
        importance: z.enum(['low', 'medium', 'high']).describe('How important is this to remember'),
      }),
      execute: async ({ fact, category, importance }, { ctx: toolCtx }) => {
        log.info(
          { agentId: ctx.agentId, fact, category, importance },
          '🧠 [UNIFIED] Remember about user'
        );

        const userData = toolCtx.userData as UserData;
        const userId = userData.userId || ctx.userId;

        if (!userId) {
          log.warn('No userId available for memory write');
          return '';
        }

        // Store in session for awareness tools (backward compat)
        if (!userData.keyMoments) {
          userData.keyMoments = [];
        }
        userData.keyMoments.push(`[${category}] ${fact}`);

        // Write to unified memory service
        const result = await memoryService.write({
          userId,
          content: fact,
          type: category === 'goal' ? 'commitment' : 'fact',
          importance: importance as 'low' | 'medium' | 'high',
          metadata: { category, source: 'explicit_memory' },
        });

        if (result.success) {
          log.debug({ memoryId: result.memoryId }, 'Memory written successfully');
        }

        // Return empty - agent should continue naturally
        return '';
      },
    });
  },
};

// ============================================================================
// REMEMBER IMPORTANT FACT (Unified)
// ============================================================================

export const rememberImportantFactUnifiedDef: ToolDefinition = {
  id: 'rememberImportantFact',
  name: 'Remember Important Fact',
  description: 'Save a critically important fact that should be remembered forever',
  domain: 'memory',
  tags: ['memory', 'storage', 'important', 'milestone', 'unified'],

  create: (ctx: ToolContext): Tool => {
    const memoryService = getUnifiedMemoryService();

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
        log.info(
          { agentId: ctx.agentId, fact, type, emotionalWeight },
          '🧠 [UNIFIED] Remember important fact'
        );

        const userData = toolCtx.userData as UserData;
        const userId = userData.userId || ctx.userId;

        if (!userId) {
          log.warn('No userId available for memory write');
          return "I'll remember that.";
        }

        // Store in session
        if (!userData.keyMoments) {
          userData.keyMoments = [];
        }
        userData.keyMoments.push(`[${type}/${emotionalWeight}] ${fact}`);

        // Map type to memory type
        const memoryType =
          type === 'life_event' || type === 'milestone'
            ? 'milestone'
            : type === 'concern'
              ? 'emotion'
              : type === 'decision'
                ? 'commitment'
                : 'event';

        // Write to unified memory service
        const result = await memoryService.write({
          userId,
          content: fact,
          type: memoryType as
            | 'fact'
            | 'preference'
            | 'event'
            | 'emotion'
            | 'commitment'
            | 'milestone',
          importance:
            emotionalWeight === 'heavy'
              ? 'critical'
              : emotionalWeight === 'medium'
                ? 'high'
                : 'medium',
          metadata: { type, emotionalWeight, source: 'explicit_important' },
        });

        if (result.success) {
          log.debug({ memoryId: result.memoryId }, 'Important fact written');
        }

        // Human responses
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
// SURFACE RELEVANT MEMORY (Better-Than-Human, Unified)
// ============================================================================

export const surfaceRelevantMemoryUnifiedDef: ToolDefinition = {
  id: 'surfaceRelevantMemory',
  name: 'Surface Relevant Memory',
  description:
    'Proactively surface a relevant memory when context connects to something from past conversations.',
  domain: 'memory',
  tags: ['memory', 'proactive', 'better-than-human', 'anticipatory', 'unified'],

  create: (ctx: ToolContext): Tool => {
    const memoryService = getUnifiedMemoryService();

    return llm.tool({
      description: getToolDescription('surfaceRelevantMemory'),
      parameters: z.object({
        context: z.string().describe('Current conversation context that triggered this memory'),
        memoryToSurface: z.string().describe('The relevant memory to bring up'),
        connectionReason: z.string().describe('Why this memory is relevant now'),
      }),
      execute: async ({ context, memoryToSurface, connectionReason }, { ctx: toolCtx }) => {
        log.info(
          { agentId: ctx.agentId, context, connectionReason },
          '🧠 [BETTER-THAN-HUMAN] Surface relevant memory'
        );

        const userData = toolCtx.userData as UserData;
        const userId = userData.userId || ctx.userId;

        if (!userId) {
          return memoryToSurface;
        }

        // Search for the actual memory to verify it exists
        const result = await memoryService.search({
          query: memoryToSurface,
          userId,
          limit: 1,
          minScore: 0.5,
        });

        // Record feedback
        memoryService.recordFeedback({
          memoryId: `surface_${Date.now()}`,
          userId,
          action: 'surfaced',
          context: { personaId: ctx.agentId, emotionalState: connectionReason },
        });

        if (result) {
          return result;
        }

        // Check session memory
        if (userData.keyMoments && userData.keyMoments.length > 0) {
          const relevant = userData.keyMoments.find((m) =>
            m.toLowerCase().includes(memoryToSurface.toLowerCase().split(' ')[0])
          );
          if (relevant) {
            return relevant;
          }
        }

        return memoryToSurface;
      },
    });
  },
};

// ============================================================================
// PREDICT USER NEED (Better-Than-Human, Unified)
// ============================================================================

export const predictUserNeedUnifiedDef: ToolDefinition = {
  id: 'predictUserNeed',
  name: 'Predict User Need',
  description:
    'Anticipate what the user might need based on context, time, patterns, or upcoming events.',
  domain: 'memory',
  tags: ['memory', 'proactive', 'better-than-human', 'anticipatory', 'prediction', 'unified'],

  create: (ctx: ToolContext): Tool => {
    const memoryService = getUnifiedMemoryService();

    return llm.tool({
      description: getToolDescription('predictUserNeed'),
      parameters: z.object({
        context: z.string().describe('What triggered this prediction'),
        prediction: z.string().describe('What you predict they might need'),
        confidence: z
          .enum(['high', 'medium', 'low'])
          .describe('How confident you are in this prediction'),
        suggestedAction: z.string().optional().describe('Optional suggested action to take'),
      }),
      execute: async ({ context, prediction, confidence, suggestedAction }, { ctx: toolCtx }) => {
        log.info(
          { agentId: ctx.agentId, context, prediction, confidence },
          '🔮 [BETTER-THAN-HUMAN] Predict user need'
        );

        const userData = toolCtx.userData as UserData;
        const userId = userData.userId || ctx.userId;

        if (userId) {
          // Record the prediction for learning
          await memoryService.write({
            userId,
            content: `Prediction: ${prediction} (context: ${context})`,
            type: 'event',
            importance: confidence === 'high' ? 'high' : 'medium',
            metadata: {
              type: 'anticipatory_prediction',
              confidence,
              context,
              suggestedAction,
            },
          });

          // Search for relevant context to enhance prediction
          const result = await memoryService.search({
            query: prediction,
            userId,
            limit: 2,
            minScore: 0.4,
          });

          if (result) {
            return `Based on what I know about you: ${prediction}. ${result}`;
          }
        }

        return suggestedAction || prediction;
      },
    });
  },
};

// ============================================================================
// EXPORTS
// ============================================================================

export const unifiedMemoryTools = [
  recallFromMemoryUnifiedDef,
  recallPreviousConversationUnifiedDef,
  rememberAboutUserUnifiedDef,
  rememberImportantFactUnifiedDef,
  surfaceRelevantMemoryUnifiedDef,
  predictUserNeedUnifiedDef,
];

export default unifiedMemoryTools;
