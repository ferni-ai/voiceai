/**
 * Memory-Aware Tool Executor
 *
 * Wraps tool execution with memory context and auto-capture.
 *
 * @module tools/memory-aware/executor
 */

import { createLogger } from '../../utils/safe-logger.js';
import type { StoredMemory } from '../../memory/unified-store/types.js';
import type {
  MemoryAwareToolContext,
  MemoryAwareToolConfig,
  MemoryAwareToolExecution,
} from './types.js';
import { DEFAULT_MEMORY_AWARE_CONFIG } from './types.js';

const log = createLogger({ module: 'MemoryAwareExecutor' });

// ============================================================================
// TYPES
// ============================================================================

/**
 * Tool definition with memory awareness
 */
export interface MemoryAwareTool<TInput = unknown, TOutput = unknown> {
  /** Tool name */
  name: string;

  /** Tool description */
  description: string;

  /** Topics this tool relates to */
  relatedTopics: string[];

  /** Execute the tool */
  execute(input: TInput, context: MemoryAwareToolContext): Promise<TOutput>;

  /** Should this execution be captured as a memory? */
  shouldCapture?(input: TInput, output: TOutput): boolean;

  /** Generate memory content from execution */
  generateMemoryContent?(input: TInput, output: TOutput): string;

  /** Get memory type for capture */
  memoryType?: StoredMemory['type'];

  /** Get importance for captured memory */
  getImportance?(input: TInput, output: TOutput): number;
}

// ============================================================================
// EXECUTOR
// ============================================================================

/**
 * Execute a tool with memory context
 */
export async function executeWithMemory<TInput, TOutput>(
  tool: MemoryAwareTool<TInput, TOutput>,
  input: TInput,
  context: MemoryAwareToolContext,
  config: Partial<MemoryAwareToolConfig> = {}
): Promise<MemoryAwareToolExecution<TInput, TOutput>> {
  const fullConfig = { ...DEFAULT_MEMORY_AWARE_CONFIG, ...config };
  const startTime = Date.now();

  // Surface relevant memories if enabled
  let surfacedMemories: StoredMemory[] = [];
  if (fullConfig.surfaceRelevantMemories) {
    surfacedMemories = await surfaceRelevantMemories(tool, input, context, fullConfig);
  }

  // Execute the tool
  const output = await tool.execute(input, context);

  // Capture execution as memory if enabled
  let capturedMemoryId: string | undefined;
  if (fullConfig.autoCaptureUsage) {
    capturedMemoryId = await captureExecution(tool, input, output, context);
  }

  const durationMs = Date.now() - startTime;

  log.debug({
    toolName: tool.name,
    surfacedCount: surfacedMemories.length,
    captured: !!capturedMemoryId,
    durationMs,
  }, 'Tool execution complete');

  return {
    toolName: tool.name,
    input,
    output,
    surfacedMemories,
    capturedMemoryId,
    durationMs,
  };
}

/**
 * Surface relevant memories for tool execution
 */
async function surfaceRelevantMemories<TInput>(
  tool: MemoryAwareTool<TInput, unknown>,
  input: TInput,
  context: MemoryAwareToolContext,
  config: MemoryAwareToolConfig
): Promise<StoredMemory[]> {
  try {
    // Query by tool's related topics
    const result = await context.memory.recall({
      topics: tool.relatedTopics,
      limit: config.maxSurfacedMemories * 2, // Get more, then filter by relevance
    });

    // For now, just return top N by access count (relevance proxy)
    // In production, this would use semantic similarity
    const sorted = result.memories.sort((a, b) => {
      // Score by: importance, recency, access frequency
      const scoreA = a.importance * 0.4 + (1 / Math.log2(daysSince(a.lastAccessedAt) + 2)) * 0.3 + Math.log2(a.accessCount + 1) * 0.1 * 0.3;
      const scoreB = b.importance * 0.4 + (1 / Math.log2(daysSince(b.lastAccessedAt) + 2)) * 0.3 + Math.log2(b.accessCount + 1) * 0.1 * 0.3;
      return scoreB - scoreA;
    });

    return sorted.slice(0, config.maxSurfacedMemories);
  } catch (error) {
    log.error({ error, toolName: tool.name }, 'Failed to surface memories');
    return [];
  }
}

/**
 * Capture tool execution as memory
 */
async function captureExecution<TInput, TOutput>(
  tool: MemoryAwareTool<TInput, TOutput>,
  input: TInput,
  output: TOutput,
  context: MemoryAwareToolContext
): Promise<string | undefined> {
  try {
    // Check if tool wants to be captured
    if (tool.shouldCapture && !tool.shouldCapture(input, output)) {
      return undefined;
    }

    // Generate content
    const content = tool.generateMemoryContent
      ? tool.generateMemoryContent(input, output)
      : `Used ${tool.name} tool`;

    // Get importance
    const importance = tool.getImportance
      ? tool.getImportance(input, output)
      : 0.4; // Default low importance for tool usage

    const memoryId = await context.memory.capture({
      content,
      type: tool.memoryType || 'entity',
      topics: tool.relatedTopics,
      importance,
      emotionalWeight: 0.2, // Tool usage is typically low emotional
    });

    return memoryId;
  } catch (error) {
    log.error({ error, toolName: tool.name }, 'Failed to capture tool execution');
    return undefined;
  }
}

/**
 * Calculate days since a date
 */
function daysSince(date: Date): number {
  return (Date.now() - date.getTime()) / (1000 * 60 * 60 * 24);
}

// ============================================================================
// HELPER: CREATE MEMORY-AWARE TOOL
// ============================================================================

/**
 * Create a memory-aware tool from a simple function
 */
export function createMemoryAwareTool<TInput, TOutput>(config: {
  name: string;
  description: string;
  relatedTopics: string[];
  execute: (input: TInput, context: MemoryAwareToolContext) => Promise<TOutput>;
  shouldCapture?: (input: TInput, output: TOutput) => boolean;
  generateMemoryContent?: (input: TInput, output: TOutput) => string;
  memoryType?: StoredMemory['type'];
  getImportance?: (input: TInput, output: TOutput) => number;
}): MemoryAwareTool<TInput, TOutput> {
  return {
    name: config.name,
    description: config.description,
    relatedTopics: config.relatedTopics,
    execute: config.execute,
    shouldCapture: config.shouldCapture,
    generateMemoryContent: config.generateMemoryContent,
    memoryType: config.memoryType,
    getImportance: config.getImportance,
  };
}

// ============================================================================
// EXAMPLE: COMMITMENT TOOL (MEMORY-AWARE)
// ============================================================================

/**
 * Example: Memory-aware commitment tracking tool
 */
export const createCommitmentTool = createMemoryAwareTool<
  { commitment: string; targetDate?: string; person?: string },
  { commitmentId: string; message: string }
>({
  name: 'track_commitment',
  description: 'Track a commitment the user has made',
  relatedTopics: ['commitments', 'goals', 'accountability'],

  async execute(input, context) {
    // Capture as a high-importance memory
    const commitmentId = await context.memory.capture({
      content: input.commitment,
      type: 'commitment',
      topics: ['commitments'],
      people: input.person ? [input.person] : undefined,
      importance: 0.8,
      emotionalWeight: 0.6,
      isCommitment: true,
      protect: true, // Protect from decay
    });

    // Check for related past commitments
    const pastCommitments = await context.memory.getCommitments(false);
    const relatedCount = pastCommitments.filter(
      (m) => m.content.toLowerCase().includes(input.commitment.toLowerCase().split(' ')[0])
    ).length;

    let message = `Got it! I'll remember your commitment: "${input.commitment}"`;
    if (relatedCount > 0) {
      message += ` I notice you've made ${relatedCount} similar commitment(s) before.`;
    }

    return { commitmentId, message };
  },

  // Don't double-capture (we already captured in execute)
  shouldCapture: () => false,
});

/**
 * Example: Memory-aware person recall tool
 */
export const createPersonRecallTool = createMemoryAwareTool<
  { personName: string },
  { memories: Array<{ content: string; date: string }>; summary: string }
>({
  name: 'recall_person',
  description: 'Recall what we know about a person',
  relatedTopics: ['relationships', 'people'],

  async execute(input, context) {
    const memories = await context.memory.getMemoriesAboutPerson(input.personName);

    // Reinforce accessed memories
    for (const memory of memories.slice(0, 5)) {
      await context.memory.reinforceMemory(memory.id);
    }

    const formattedMemories = memories.map((m) => ({
      content: m.content,
      date: m.createdAt.toISOString().split('T')[0],
    }));

    let summary = `I found ${memories.length} memory/memories about ${input.personName}.`;
    if (memories.length === 0) {
      summary = `I don't have any memories about ${input.personName} yet.`;
    }

    return { memories: formattedMemories.slice(0, 10), summary };
  },

  // Capture that we looked up this person
  shouldCapture: (input, output) => output.memories.length > 0,
  generateMemoryContent: (input) => `Recalled memories about ${input.personName}`,
  memoryType: 'entity',
  getImportance: () => 0.2, // Low importance for recall action
});
