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

import { flagOn } from '../../../config/env-flag.js';
import { isTeammateTalk } from '../../../utils/teammate-talk.js';
import { llm } from '@livekit/agents';
import { z } from 'zod';
import { getUnifiedMemoryService } from '../../../services/unified-memory-service.js';
import {
  NO_EARLIER_CONVERSATION,
  rememberToRecall,
  searchEarlierConversations,
  thisCallOf,
} from '../../../services/memory/index.js';
import { writeHeld } from '../../../utils/minor-care.js';
import { getLogger } from '../../../utils/safe-logger.js';
import type { Tool, ToolContext, ToolDefinition } from '../../registry/types.js';
import { getToolDescription } from '../../utils/tool-descriptions.js';
import { getSessionId } from '../../utils/tool-helpers.js';
import { announceRemembered } from './remember-moment.js';
import { announceMemorySaved } from './memory-saved.js';
import { importantReply, REMEMBERED, REMEMBERED_THIS_CALL } from './remember-results.js';
import * as honest from './honest-memory.js'; // MEMORY_TOOLS_HONEST

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
        log.info(
          { agentId: ctx.agentId, topicChars: topic.length },
          '🧠 [UNIFIED] Recall from memory'
        );

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
        log.info(
          { agentId: ctx.agentId, queryChars: query.length },
          '🧠 [UNIFIED] Semantic recall'
        );

        const userData = toolCtx.userData as UserData;
        const userId = userData.userId || ctx.userId;

        if (!userId) {
          return `I don't have specific memories about "${query}" yet. Would you like to tell me more?`;
        }

        // Only conversations from before this call count as "last time"
        const thisCall = thisCallOf(toolCtx.userData);
        const found = await searchEarlierConversations({ query, userId, thisCall });

        if (found.kind === 'found') {
          memoryService.recordFeedback({
            memoryId: `semantic_${Date.now()}`,
            userId,
            action: 'surfaced',
            context: { personaId: ctx.agentId },
          });

          return `From a conversation before this call: ${found.text}`;
        }
        if (found.kind === 'only_this_call') return NO_EARLIER_CONVERSATION;

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
          .describe(
            'Whose fact, then the fact: "the user has two kids", "the user\'s sister Dana is moving to Denver"'
          ),
        category: z
          .enum(['personal', 'financial', 'emotional', 'goal', 'preference'])
          .describe('Category of the fact'),
        importance: z.enum(['low', 'medium', 'high']).describe('How important is this to remember'),
      }),
      execute: async ({ fact, category, importance }, { ctx: toolCtx }) => {
        log.info(
          { agentId: ctx.agentId, factChars: fact.length, category, importance },
          '🧠 [UNIFIED] Remember about user'
        );

        const userData = toolCtx.userData as UserData;
        const userId = userData.userId || ctx.userId;

        // Store in session for awareness tools (backward compat)
        (userData.keyMoments ??= []).push(`[${category}] ${fact}`);
        if (honest.memoryToolsHonestOn()) {
          return honest.rememberHonestly(toolCtx, userId, fact, category);
        }

        // MINOR_CARE=on: nothing kept past this call for a caller under 18 (minor-care.ts)
        if (!userId || writeHeld(userId, getSessionId({ ctx: toolCtx }))) {
          log.warn('No memory write: no userId, or MINOR_CARE holds this call');
          return REMEMBERED_THIS_CALL;
        }

        const result = await memoryService.write({
          userId,
          content: fact,
          type: category === 'goal' ? 'commitment' : 'fact',
          importance: importance as 'low' | 'medium' | 'high',
          metadata: { category, source: 'explicit_memory' },
        });

        if (result.success) {
          log.debug({ memoryId: result.memoryId }, 'Memory written successfully');
          // "I'll remember: …" in the app (REMEMBER_MOMENT=on); only after a store that succeeded.
          const sessionId = getSessionId({ ctx: toolCtx });
          void announceRemembered({ userId, sessionId, fact, category });
          void announceMemorySaved({ sessionId, userId, id: result.memoryId, fact, category });
          void rememberToRecall(userId, { fact, memoryId: result.memoryId, category, sessionId });
          return REMEMBERED;
        }
        // Never an empty result (tool-output-guard.ts): say whether it was kept
        return REMEMBERED_THIS_CALL;
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
        fact: z
          .string()
          .describe(
            'Whose fact, then the fact: "the user retires next year", "the user\'s mom has cancer"'
          ),
        type: z
          .enum(['life_event', 'decision', 'breakthrough', 'milestone', 'concern'])
          .describe('Type of fact'),
        emotionalWeight: z.enum(['light', 'medium', 'heavy']).describe('Emotional significance'),
      }),
      execute: async ({ fact, type, emotionalWeight }, { ctx: toolCtx }) => {
        log.info(
          { agentId: ctx.agentId, factChars: fact.length, type, emotionalWeight },
          '🧠 [UNIFIED] Remember important fact'
        );

        const userData = toolCtx.userData as UserData;
        const userId = userData.userId || ctx.userId;

        if (!userId || writeHeld(userId, getSessionId({ ctx: toolCtx }))) {
          log.warn('No memory write: no userId, or MINOR_CARE holds this call');
          return honest.notWrittenReply();
        }

        // "Decided to talk to Jordan" is a teammate on this call, not their life (teammate-talk.ts)
        if (flagOn('TEAMMATE_TALK_FILTER') && isTeammateTalk(fact)) return honest.notWrittenReply();

        // Store in session
        (userData.keyMoments ??= []).push(`[${type}/${emotionalWeight}] ${fact}`);
        if (honest.memoryToolsHonestOn()) {
          return honest.rememberImportantHonestly(toolCtx, userId, fact, type);
        }

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
            'fact' | 'preference' | 'event' | 'emotion' | 'commitment' | 'milestone',
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
          const sessionId = getSessionId({ ctx: toolCtx }); // memory_saved, CLIENT_SIGNALS_V2
          void announceMemorySaved({
            sessionId,
            userId,
            id: result.memoryId,
            fact,
            category: type,
          });
        }

        return importantReply(type);
      },
    });
  },
};

// ============================================================================
// SURFACE RELEVANT MEMORY (Better-Than-Human, Unified)
// ============================================================================

const NOTHING_TO_SURFACE = "No stored memory matched; don't present this as remembered.";
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
          { agentId: ctx.agentId, contextChars: context.length },
          '🧠 [BETTER-THAN-HUMAN] Surface relevant memory'
        );

        const userData = toolCtx.userData as UserData;
        const userId = userData.userId || ctx.userId;

        if (!userId) {
          return NOTHING_TO_SURFACE;
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

        return NOTHING_TO_SURFACE;
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
          { agentId: ctx.agentId, confidence, contextChars: context?.length ?? 0 },
          '🔮 [BETTER-THAN-HUMAN] Predict user need'
        );

        const userData = toolCtx.userData as UserData;
        const userId = userData.userId || ctx.userId;
        // A guess is never stored as a memory
        if (honest.memoryToolsHonestOn()) {
          return honest.guessHonestly(userId, prediction, suggestedAction);
        }

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
