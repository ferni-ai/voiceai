/**
 * Memory-Aware Tool Types
 *
 * Types for memory-aware tool execution context.
 *
 * @module tools/memory-aware/types
 */

import type { StoredMemory, RecallQuery } from '../../memory/unified-store/types.js';

// ============================================================================
// MEMORY ACCESS FOR TOOLS
// ============================================================================

/**
 * Memory query interface for tools
 */
export interface MemoryQuery {
  /** Natural language query */
  query?: string;

  /** Topics to filter by */
  topics?: string[];

  /** People to filter by */
  people?: string[];

  /** Maximum results */
  limit?: number;

  /** Include emotional context */
  includeEmotional?: boolean;

  /** Only active commitments */
  activeCommitmentsOnly?: boolean;

  /** Time range filter */
  timeRange?: {
    start: Date;
    end: Date;
  };
}

/**
 * Memory result for tools
 */
export interface MemoryResult {
  /** Retrieved memories */
  memories: StoredMemory[];

  /** Total available */
  totalAvailable: number;

  /** Query that was executed */
  query: MemoryQuery;

  /** Retrieval duration (ms) */
  durationMs: number;
}

/**
 * Memory capture request
 */
export interface MemoryCaptureRequest {
  /** Content to capture */
  content: string;

  /** Memory type */
  type: StoredMemory['type'];

  /** Topics */
  topics?: string[];

  /** People mentioned */
  people?: string[];

  /** Importance (0-1) */
  importance?: number;

  /** Emotional weight (0-1) */
  emotionalWeight?: number;

  /** Is this an active commitment? */
  isCommitment?: boolean;

  /** Should be protected from decay? */
  protect?: boolean;
}

/**
 * Memory context available to tools
 */
export interface ToolMemoryContext {
  /** User ID */
  userId: string;

  /** Session ID */
  sessionId: string;

  /** Current persona */
  personaId: string;

  /** Recall memories */
  recall(query: MemoryQuery): Promise<MemoryResult>;

  /** Capture new memory */
  capture(request: MemoryCaptureRequest): Promise<string>;

  /** Get recent memories from current session */
  getSessionMemories(): Promise<StoredMemory[]>;

  /** Get commitments */
  getCommitments(activeOnly?: boolean): Promise<StoredMemory[]>;

  /** Get memories about a person */
  getMemoriesAboutPerson(personName: string): Promise<StoredMemory[]>;

  /** Get memories about a topic */
  getMemoriesAboutTopic(topic: string): Promise<StoredMemory[]>;

  /** Link two memories */
  linkMemories(memoryId1: string, memoryId2: string, linkType: string): Promise<void>;

  /** Reinforce a memory (prevent decay) */
  reinforceMemory(memoryId: string): Promise<void>;
}

// ============================================================================
// MEMORY-AWARE TOOL CONTEXT
// ============================================================================

/**
 * Full memory-aware tool context
 */
export interface MemoryAwareToolContext {
  /** Memory access */
  memory: ToolMemoryContext;

  /** User context summary (for quick reference) */
  userSummary: UserContextSummary;

  /** Active conversation topics */
  activeTopics: string[];

  /** Recent people mentioned */
  recentPeople: string[];

  /** Current emotional state (if detected) */
  emotionalState?: {
    valence: number; // -1 to 1
    arousal: number; // 0 to 1
    primaryEmotion?: string;
  };

  /** Session depth (how long they've been talking) */
  sessionDepth: 'shallow' | 'moderate' | 'deep';
}

/**
 * User context summary for quick tool decisions
 */
export interface UserContextSummary {
  /** Active commitments count */
  activeCommitments: number;

  /** Key topics the user cares about */
  keyTopics: string[];

  /** Important people in their life */
  importantPeople: string[];

  /** Overall memory health */
  memoryHealth: 'healthy' | 'moderate' | 'sparse';

  /** Trust level (if known) */
  trustLevel?: 'new' | 'developing' | 'established' | 'deep';
}

// ============================================================================
// TOOL MEMORY INTEGRATION
// ============================================================================

/**
 * Configuration for memory-aware tools
 */
export interface MemoryAwareToolConfig {
  /** Whether to auto-capture tool usage as memories */
  autoCaptureUsage: boolean;

  /** Whether to surface relevant memories before tool execution */
  surfaceRelevantMemories: boolean;

  /** Maximum memories to surface */
  maxSurfacedMemories: number;

  /** Minimum relevance score to surface */
  minRelevanceScore: number;
}

/**
 * Default memory-aware tool config
 */
export const DEFAULT_MEMORY_AWARE_CONFIG: MemoryAwareToolConfig = {
  autoCaptureUsage: true,
  surfaceRelevantMemories: true,
  maxSurfacedMemories: 3,
  minRelevanceScore: 0.6,
};

/**
 * Tool execution with memory context
 */
export interface MemoryAwareToolExecution<TInput, TOutput> {
  /** Tool name */
  toolName: string;

  /** Tool input */
  input: TInput;

  /** Tool output */
  output: TOutput;

  /** Relevant memories surfaced */
  surfacedMemories: StoredMemory[];

  /** Memory captured from execution */
  capturedMemoryId?: string;

  /** Execution duration (ms) */
  durationMs: number;
}
