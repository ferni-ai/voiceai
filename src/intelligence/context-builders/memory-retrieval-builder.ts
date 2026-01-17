/**
 * Memory Retrieval Context Builder
 *
 * Integrates the "Better Than Human" memory retrieval system into
 * the context builder pipeline. This enables superhuman recall
 * during live conversations.
 *
 * Architecture:
 * ```
 * turn-handler.ts
 *       │
 *       ▼
 * context-builders (existing)
 *       │
 *       ├─→ memory-retrieval-builder.ts (NEW)
 *       │         │
 *       │         ▼
 *       │   turn-memory-retrieval.ts
 *       │         │
 *       │         ▼
 *       │   Hybrid Search + Reranking
 *       │         │
 *       │         ▼
 *       │   MemoryContext
 *       │
 *       ▼
 * LLM Prompt (with memory injections)
 * ```
 *
 * @module intelligence/context-builders/memory-retrieval-builder
 */

import { createLogger } from '../../utils/safe-logger.js';
import {
  retrieveForTurn,
  formatMemoryContextForPrompt,
  formatProactiveMemory,
  type MemoryContext,
  type TurnRetrievalInput,
  type RetrievedMemoryForTurn,
} from '../../memory/retrieval/turn-memory-retrieval.js';
import {
  registerContextBuilder,
  createHighInjection,
  createStandardInjection,
  createHintInjection,
  type ContextBuilderInput,
  type ContextInjection,
} from './index.js';

const log = createLogger({ module: 'MemoryRetrievalBuilder' });

// ============================================================================
// TYPES
// ============================================================================

/**
 * Extended input with memory retrieval context
 */
export interface MemoryRetrievalBuilderInput extends ContextBuilderInput {
  /** Previously surfaced memory IDs this session */
  surfacedMemoryIds?: Set<string>;
}

/**
 * Result from memory retrieval builder
 */
export interface MemoryRetrievalResult {
  /** Context injections for LLM */
  injections: ContextInjection[];
  /** Raw memory context (for downstream use) */
  memoryContext: MemoryContext | null;
  /** IDs of memories that were surfaced */
  surfacedIds: string[];
}

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * Builder configuration
 */
export interface MemoryRetrievalBuilderConfig {
  /** Enable memory retrieval (default: true) */
  enabled: boolean;
  /** Minimum turn number to start retrieval (default: 1) */
  minTurnForRetrieval: number;
  /** Maximum memories to inject per turn (default: 3) */
  maxMemoriesPerTurn: number;
  /** Enable proactive suggestions (default: true) */
  enableProactive: boolean;
  /** Priority for memory injections (default: 'high') */
  injectionPriority: 'critical' | 'high' | 'standard' | 'hint';
}

const DEFAULT_CONFIG: MemoryRetrievalBuilderConfig = {
  enabled: true,
  minTurnForRetrieval: 1,
  maxMemoriesPerTurn: 3,
  enableProactive: true,
  injectionPriority: 'high',
};

let config: MemoryRetrievalBuilderConfig = { ...DEFAULT_CONFIG };

/**
 * Update builder configuration
 */
export function setMemoryRetrievalBuilderConfig(
  newConfig: Partial<MemoryRetrievalBuilderConfig>
): void {
  config = { ...config, ...newConfig };
}

/**
 * Get current configuration
 */
export function getMemoryRetrievalBuilderConfig(): MemoryRetrievalBuilderConfig {
  return { ...config };
}

// ============================================================================
// SESSION STATE
// ============================================================================

/** Track surfaced memories per session */
const surfacedMemoriesBySession = new Map<string, Set<string>>();

/**
 * Get surfaced memory IDs for a session
 */
export function getSurfacedMemoryIds(sessionId: string): Set<string> {
  let surfaced = surfacedMemoriesBySession.get(sessionId);
  if (!surfaced) {
    surfaced = new Set();
    surfacedMemoriesBySession.set(sessionId, surfaced);
  }
  return surfaced;
}

/**
 * Record that memories were surfaced
 */
export function recordSurfacedMemories(sessionId: string, ids: string[]): void {
  const surfaced = getSurfacedMemoryIds(sessionId);
  for (const id of ids) {
    surfaced.add(id);
  }
}

/**
 * Clear session state
 */
export function clearMemoryRetrievalSession(sessionId: string): void {
  surfacedMemoriesBySession.delete(sessionId);
}

// ============================================================================
// MAIN BUILD FUNCTION
// ============================================================================

/**
 * Build memory retrieval context injections.
 *
 * This is called during turn processing to retrieve and inject
 * relevant memories into the LLM context.
 */
export async function buildMemoryRetrievalContext(
  input: MemoryRetrievalBuilderInput
): Promise<MemoryRetrievalResult> {
  const injections: ContextInjection[] = [];
  const surfacedIds: string[] = [];

  // Check if enabled
  if (!config.enabled) {
    return { injections, memoryContext: null, surfacedIds };
  }

  // Check minimum turn
  const turnNumber = input.userData?.turnCount ?? 1;
  if (turnNumber < config.minTurnForRetrieval) {
    return { injections, memoryContext: null, surfacedIds };
  }

  // Get user ID and session ID
  const userId = input.services?.userId;
  const sessionId = input.services?.sessionId;

  if (!userId || !sessionId) {
    log.debug('Missing userId or sessionId, skipping memory retrieval');
    return { injections, memoryContext: null, surfacedIds };
  }

  // Get already surfaced memories for this session
  const alreadySurfaced = input.surfacedMemoryIds ?? getSurfacedMemoryIds(sessionId);

  // Build retrieval input
  const retrievalInput: TurnRetrievalInput = {
    userId,
    sessionId,
    transcript: input.userText || '',
    turnNumber,
    emotion: input.analysis?.emotion?.primary,
    topics: input.analysis?.topics?.detected,
    personaId: input.persona?.identity?.id,
    surfacedMemoryIds: alreadySurfaced,
  };

  try {
    // Retrieve memories
    const memoryContext = await retrieveForTurn(retrievalInput);

    // Skip if no memories
    if (memoryContext.memories.length === 0) {
      return { injections, memoryContext, surfacedIds };
    }

    // Create memory context injection
    const memoryPrompt = formatMemoryContextForPrompt(memoryContext);
    if (memoryPrompt) {
      const injection = createMemoryInjection(memoryPrompt, config.injectionPriority);
      injections.push(injection);
    }

    // Add proactive suggestion if available and enabled
    if (
      config.enableProactive &&
      memoryContext.hasProactiveSuggestion &&
      memoryContext.proactiveMemory
    ) {
      const proactivePrompt = formatProactiveMemory(memoryContext.proactiveMemory);
      injections.push(
        createHintInjection('memory_proactive', proactivePrompt, {
          category: 'memory',
          confidence: memoryContext.proactiveMemory.relevance,
        })
      );
    }

    // Record surfaced IDs
    for (const memory of memoryContext.memories) {
      surfacedIds.push(memory.id);
    }
    recordSurfacedMemories(sessionId, surfacedIds);

    // Log for observability
    log.debug(
      {
        userId,
        sessionId,
        turnNumber,
        memoriesRetrieved: memoryContext.memories.length,
        hasProactive: memoryContext.hasProactiveSuggestion,
        totalMs: memoryContext.metrics.totalTimeMs,
        hybridMs: memoryContext.metrics.hybridSearchMs,
        rerankMs: memoryContext.metrics.rerankMs,
      },
      '🧠 Memory retrieval context built'
    );

    return { injections, memoryContext, surfacedIds };
  } catch (error) {
    log.warn({ userId, sessionId, error: String(error) }, 'Memory retrieval builder failed');
    return { injections, memoryContext: null, surfacedIds };
  }
}

/**
 * Create a memory injection based on priority setting
 */
function createMemoryInjection(content: string, priority: string): ContextInjection {
  switch (priority) {
    case 'critical':
      return {
        id: `memory_${Date.now()}`,
        source: 'memory_retrieval',
        content,
        priority: 'critical',
        category: 'memory',
        confidence: 1.0,
      };
    case 'high':
      return createHighInjection('memory_retrieval', content, {
        category: 'memory',
        confidence: 1.0,
      });
    case 'standard':
      return createStandardInjection('memory_retrieval', content, {
        category: 'memory',
        confidence: 1.0,
      });
    case 'hint':
    default:
      return createHintInjection('memory_retrieval', content, {
        category: 'memory',
        confidence: 1.0,
      });
  }
}

// ============================================================================
// CONTEXT BUILDER REGISTRATION
// ============================================================================

/**
 * Context builder for memory retrieval
 */
const memoryRetrievalBuilder = {
  name: 'memory_retrieval',
  description: 'Retrieves and injects relevant memories from the Better Than Human memory system',
  priority: 85, // High priority - memory context is important
  category: undefined, // Will be auto-detected as MEMORY based on name

  async build(input: ContextBuilderInput): Promise<ContextInjection[]> {
    const result = await buildMemoryRetrievalContext(input as MemoryRetrievalBuilderInput);
    return result.injections;
  },
};

// Register the builder
registerContextBuilder(memoryRetrievalBuilder);

// ============================================================================
// STANDALONE RETRIEVAL (for direct use)
// ============================================================================

/**
 * Retrieve memories for a turn without the full context builder pipeline.
 *
 * Use this when you need direct access to memory retrieval,
 * e.g., for testing or specialized use cases.
 */
export async function retrieveMemoriesForTurn(
  userId: string,
  sessionId: string,
  transcript: string,
  options?: {
    turnNumber?: number;
    emotion?: string;
    topics?: string[];
    personaId?: string;
  }
): Promise<MemoryContext> {
  const input: TurnRetrievalInput = {
    userId,
    sessionId,
    transcript,
    turnNumber: options?.turnNumber ?? 1,
    emotion: options?.emotion,
    topics: options?.topics,
    personaId: options?.personaId,
    surfacedMemoryIds: getSurfacedMemoryIds(sessionId),
  };

  return retrieveForTurn(input);
}

/**
 * Format memories for direct injection into an LLM prompt
 */
export function formatMemoriesForPrompt(memories: RetrievedMemoryForTurn[]): string | null {
  if (memories.length === 0) return null;

  const lines: string[] = ['[RELEVANT MEMORIES]'];

  for (const memory of memories) {
    lines.push(`• ${memory.attribution}: "${memory.content}"`);
  }

  return lines.join('\n');
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
  type MemoryContext,
  type RetrievedMemoryForTurn,
  type TurnRetrievalInput,
} from '../../memory/retrieval/turn-memory-retrieval.js';
