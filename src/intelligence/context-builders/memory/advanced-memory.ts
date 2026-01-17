/**
 * Advanced Memory Context Builder
 *
 * "Better than human" memory retrieval that uses semantic understanding,
 * temporal decay, emotional salience, and relationship context.
 *
 * Philosophy: A great friend remembers what matters - not everything, but the
 * things that shaped you, the commitments made, and the context needed to
 * continue where you left off naturally.
 *
 * Features:
 * - Semantic similarity (meaning, not just keywords)
 * - Temporal decay (recent = more relevant, unless emotionally significant)
 * - Emotional salience (heavy moments persist longer)
 * - Commitment tracking (promises made are remembered)
 * - Natural memory callbacks ("Remember when you mentioned...")
 *
 * @module AdvancedMemoryContextBuilder
 */

import {
  registerContextBuilder,
  type ContextBuilderInput,
  type ContextInjection,
  createHintInjection,
} from '../index.js';
import {
  buildMemoryIndex,
  retrieveMemories,
  getConversationPrimingMemories,
  computeMemoryEmbeddings,
  type RetrievedMemory,
} from '../../../memory/advanced-retrieval.js';
import { getLogger } from '../../../utils/safe-logger.js';

const log = getLogger();

// ============================================================================
// CONFIGURATION
// ============================================================================

/** Minimum score for a memory to be included */
const MIN_RELEVANCE_SCORE = 0.35;

/** Maximum memories to include per turn */
const MAX_MEMORIES_PER_TURN = 3;

/** Maximum memories for session priming */
const MAX_PRIMING_MEMORIES = 5;

/** Turn interval for refreshing memory index */
const INDEX_REFRESH_INTERVAL = 10;

// Track when we last built the index per user
const lastIndexBuild = new Map<string, number>();

// ============================================================================
// MEMORY INDEX MANAGEMENT
// ============================================================================

/**
 * Ensure memory index is built/refreshed for user
 */
async function ensureMemoryIndex(
  userId: string,
  profile: ContextBuilderInput['userProfile'],
  turnCount: number
): Promise<boolean> {
  if (!profile) return false;

  const lastBuild = lastIndexBuild.get(userId) || 0;

  // Rebuild if:
  // 1. Never built
  // 2. Turn count crossed refresh interval
  // 3. Profile was updated since last build
  const shouldRebuild = lastBuild === 0 || turnCount - lastBuild >= INDEX_REFRESH_INTERVAL;

  if (shouldRebuild) {
    try {
      const count = await buildMemoryIndex(userId, profile);
      lastIndexBuild.set(userId, turnCount);

      // Compute embeddings in background (fire and forget)
      void computeMemoryEmbeddings(userId).catch((e) =>
        log.debug({ error: e }, 'Background embedding computation failed')
      );

      log.debug({ userId, memoryCount: count }, 'Memory index built');
      return count > 0;
    } catch (error) {
      log.warn({ error, userId }, 'Failed to build memory index');
      return false;
    }
  }

  return true;
}

// ============================================================================
// MEMORY RETRIEVAL
// ============================================================================

/**
 * Retrieve relevant memories for the current conversation turn
 */
async function retrieveRelevantMemories(
  userId: string,
  userText: string,
  input: ContextBuilderInput
): Promise<RetrievedMemory[]> {
  try {
    const memories = await retrieveMemories(userId, {
      query: userText,
      currentTopic: input.analysis?.topics?.primary || undefined,
      currentEmotion: input.analysis?.emotion?.primary,
      personaId: input.persona?.id,
      conversationTurn: input.userData?.turnCount,
      recentTopics: input.userData?.recentTopics,
      userMood: input.analysis?.emotion?.primary,
    });

    return memories.filter((m) => m.score >= MIN_RELEVANCE_SCORE);
  } catch (error) {
    log.debug({ error, userId }, 'Memory retrieval failed');
    return [];
  }
}

/**
 * Get priming memories for session start
 */
async function getPrimingMemories(
  userId: string,
  personaId: string,
  sessionCount: number
): Promise<RetrievedMemory[]> {
  try {
    const memories = await getConversationPrimingMemories(userId, personaId, {
      maxMemories: MAX_PRIMING_MEMORIES,
      includeCommitments: true,
      includeRecentTopics: true,
      sessionCount,
    });

    // Convert to RetrievedMemory format
    return memories.map((m) => ({
      item: m,
      score: m.baseImportance,
      scoreBreakdown: {
        semantic: 0.5,
        temporal: 0.7,
        emotional: m.emotionalWeight,
        contextual: 0.6,
      },
      reason: m.commitment ? 'commitment to follow up' : 'important context',
    }));
  } catch (error) {
    log.debug({ error, userId }, 'Priming memory retrieval failed');
    return [];
  }
}

// ============================================================================
// CONTEXT FORMATTING
// ============================================================================

/**
 * Format retrieved memories for LLM context injection
 */
function formatMemoriesForContext(memories: RetrievedMemory[], isSessionStart: boolean): string {
  if (memories.length === 0) return '';

  const lines: string[] = [];

  if (isSessionStart) {
    lines.push('[🧠 MEMORY PRIMING - Natural Conversation Starters]');
    lines.push('You remember these things about the user that might come up naturally:');
  } else {
    lines.push('[🧠 RELEVANT MEMORIES - For Natural Reference]');
    lines.push('These memories are relevant to what the user just said:');
  }

  for (const memory of memories.slice(0, MAX_MEMORIES_PER_TURN)) {
    const { item, reason } = memory;

    // Format based on memory type
    let prefix = '•';
    if (item.type === 'commitment') {
      prefix = '📌';
    } else if (item.type === 'moment') {
      prefix = '✨';
    } else if (item.type === 'person') {
      prefix = '👤';
    } else if (item.type === 'event') {
      prefix = '📅';
    }

    lines.push(`${prefix} ${item.content} (${reason})`);
  }

  // Add guidance
  lines.push('');
  if (memories.some((m) => m.item.commitment)) {
    lines.push('💡 Commitments should be referenced naturally, not forced.');
    lines.push('   Example: "Hey, I wanted to follow up on that thing we discussed..."');
  } else {
    lines.push("💡 Reference these naturally IF relevant, don't force it.");
    lines.push('   Example: "That reminds me of when you mentioned..."');
  }

  return lines.join('\n');
}

/**
 * Generate natural memory callback suggestions
 */
function generateCallbackSuggestions(memories: RetrievedMemory[]): string[] {
  const suggestions: string[] = [];

  for (const memory of memories) {
    const { item } = memory;

    if (item.type === 'commitment') {
      suggestions.push(`Follow up: "${item.content.slice(0, 100)}..."`);
    } else if (item.personMentioned) {
      suggestions.push(`Reference: "How's ${item.personMentioned} doing?"`);
    } else if (item.type === 'moment') {
      suggestions.push(
        `Callback: "Remember when you told me about ${item.topics?.[0] || 'that'}..."`
      );
    }
  }

  return suggestions.slice(0, 2);
}

// ============================================================================
// CONTEXT BUILDER
// ============================================================================

/**
 * Build advanced memory context for the current turn
 */
async function buildAdvancedMemoryContext(input: ContextBuilderInput): Promise<ContextInjection[]> {
  const { userText, services, userData, userProfile, persona } = input;
  const userId = services?.userId;

  // Skip if no user identification
  if (!userId || !userProfile) {
    return [];
  }

  const turnCount = userData?.turnCount || 0;
  // FIX: Only prime memories on turn 0, not turn 0 AND 1
  // This prevents the LLM from seeing priming memories twice
  const isSessionStart = turnCount === 0;
  const sessionCount = userProfile.totalConversations || 0;

  // Ensure memory index is built
  const hasIndex = await ensureMemoryIndex(userId, userProfile, turnCount);
  if (!hasIndex) {
    return [];
  }

  let memories: RetrievedMemory[];

  if (isSessionStart) {
    // Get priming memories for session start
    memories = await getPrimingMemories(userId, persona?.id || 'ferni', sessionCount);
  } else {
    // Get memories relevant to current user text
    memories = await retrieveRelevantMemories(userId, userText, input);
  }

  // No relevant memories found
  if (memories.length === 0) {
    return [];
  }

  // Format for context
  const contextContent = formatMemoriesForContext(memories, isSessionStart);
  if (!contextContent) {
    return [];
  }

  // Build injection
  const injections: ContextInjection[] = [];

  // Main memory context
  injections.push(createHintInjection('advanced_memory', contextContent, { category: 'memory' }));

  // Add callback suggestions if we have strong matches
  if (memories.some((m) => m.score > 0.6)) {
    const suggestions = generateCallbackSuggestions(memories);
    if (suggestions.length > 0) {
      injections.push(
        createHintInjection(
          'memory_callbacks',
          `[💭 NATURAL CALLBACK OPTIONS]\n${suggestions.join('\n')}`,
          { category: 'memory' }
        )
      );
    }
  }

  // Log for debugging
  log.debug(
    {
      userId,
      turnCount,
      memoriesFound: memories.length,
      topScore: memories[0]?.score?.toFixed(2),
      hasCommitments: memories.some((m) => m.item.commitment),
    },
    '🧠 Advanced memory context built'
  );

  return injections;
}

// ============================================================================
// REGISTER BUILDER
// ============================================================================

registerContextBuilder({
  name: 'advanced-memory',
  priority: 85, // High priority - memory is important for continuity
  description: 'Semantic memory retrieval with temporal decay and emotional salience',
  build: buildAdvancedMemoryContext,
});

// ============================================================================
// EXPORTS
// ============================================================================

export {
  buildAdvancedMemoryContext,
  ensureMemoryIndex,
  retrieveRelevantMemories,
  getPrimingMemories,
  formatMemoriesForContext,
};

export default {
  buildAdvancedMemoryContext,
  ensureMemoryIndex,
  retrieveRelevantMemories,
  getPrimingMemories,
};
