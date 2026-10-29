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
import { REMEMBERED, REMEMBERED_THIS_CALL } from './remember-results.js';
import {
  isKept,
  keepFact,
  memoryToolsHonestOn,
  notKeptReply,
  rememberReply,
} from './honest-memory.js';
import { predictUserNeedUnifiedDef } from './predict-user-need.js';

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

        // Store in session for awareness tools (backward compat)
        (userData.keyMoments ??= []).push(`[${category}] ${fact}`);

        const sessionId = getSessionId({ ctx: toolCtx });
        if (memoryToolsHonestOn()) {
          // Written only where recall reads it, and answered from that write (honest-memory.ts)
          const kept = await keepFact(userId, sessionId, fact, category);
          if (kept.kind === 'kept' && userId) {
            void announceRemembered({ userId, sessionId, fact, category });
            void announceMemorySaved({ sessionId, userId, id: kept.id, fact, category });
          }
          return rememberReply(kept);
        }
        // MINOR_CARE=on: nothing kept past this call for a caller under 18 (minor-care.ts)
        if (!userId || writeHeld(userId, sessionId)) {
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

/** rememberImportantFact's memories write (flag off); the memory id when it was stored. */
async function writeImportantMemory(
  memoryService: ReturnType<typeof getUnifiedMemoryService>,
  userId: string,
  fact: string,
  type: string,
  emotionalWeight: string
): Promise<string | undefined> {
  const memoryType =
    type === 'life_event' || type === 'milestone'
      ? 'milestone'
      : type === 'concern'
        ? 'emotion'
        : type === 'decision'
          ? 'commitment'
          : 'event';
  const result = await memoryService.write({
    userId,
    content: fact,
    type: memoryType,
    importance:
      emotionalWeight === 'heavy' ? 'critical' : emotionalWeight === 'medium' ? 'high' : 'medium',
    metadata: { type, emotionalWeight, source: 'explicit_important' },
  });
  if (!result.success) return undefined;
  log.debug({ memoryId: result.memoryId }, 'Important fact written');
  return result.memoryId;
}

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

        const honest = memoryToolsHonestOn();
        const sessionId = getSessionId({ ctx: toolCtx }); // memory_saved, CLIENT_SIGNALS_V2
        if (!userId || writeHeld(userId, sessionId)) {
          log.warn('No memory write: no userId, or MINOR_CARE holds this call');
          return honest ? REMEMBERED_THIS_CALL : "I'll remember that.";
        }

        // "Decided to talk to Jordan" is a teammate on this call, not their life (teammate-talk.ts)
        if (flagOn('TEAMMATE_TALK_FILTER') && isTeammateTalk(fact)) {
          return honest ? REMEMBERED_THIS_CALL : "I'll remember that.";
        }

        // Store in session
        (userData.keyMoments ??= []).push(`[${type}/${emotionalWeight}] ${fact}`);

        // MEMORY_TOOLS_HONEST: one copy, where recall reads it, and answered from that write
        const kept = honest ? await keepFact(userId, sessionId, fact, type) : null;
        if (kept && !isKept(kept)) return notKeptReply(kept);
        const savedId = kept
          ? kept.kind === 'kept'
            ? kept.id
            : undefined
          : await writeImportantMemory(memoryService, userId, fact, type, emotionalWeight);
        if (savedId) {
          void announceMemorySaved({ sessionId, userId, id: savedId, fact, category: type });
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
          { agentId: ctx.agentId, context, connectionReason },
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
