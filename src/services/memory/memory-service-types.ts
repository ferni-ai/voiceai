/**
 * Unified Memory Service Types
 *
 * Type definitions for the memory service orchestrator.
 *
 * @module services/memory/memory-service-types
 */

import type { OrchestratedMemory } from '../../memory/index.js';

// Re-export RecallContext type for convenience
export type { RecallContext } from '../../memory/index.js';

/**
 * Timing decision for memory surfacing
 */
export interface TimingDecision {
  shouldSurface: boolean;
  reason: 'emotional_state' | 'conversation_flow' | 'low_confidence' | 'cooldown' | 'always';
  confidence: number;
  delay?: 'immediate' | 'next_pause' | 'session_end';
}

/**
 * Phrasing suggestion for natural memory integration
 */
export interface PhrasingSuggestion {
  style: 'callback' | 'anticipatory' | 'natural_weave' | 'direct';
  template?: string;
  personaVoice: boolean;
}

/**
 * Feedback for learning what works
 */
export interface MemoryFeedback {
  memoryId: string;
  userId: string;
  action: 'surfaced' | 'ignored' | 'dismissed' | 'engaged';
  context: {
    emotionalState?: string;
    conversationPhase?: string;
    personaId?: string;
  };
  timestamp: Date;
}

/**
 * Associated memory from spreading activation
 */
export interface AssociatedMemory {
  memoryId: string;
  content: string;
  activation: number; // 0-1, strength of association
  distance: number; // Hops from primary memory
  reason: string; // Why this was activated
  linkTypes: string[]; // Types of links traversed
}

/**
 * Enhanced recall result with timing, phrasing, and associative memories
 */
export interface EnhancedRecallResult extends OrchestratedMemory {
  timing: TimingDecision;
  phrasing: PhrasingSuggestion;
  /** Associated memories from spreading activation (Better Than Human) */
  associatedMemories: AssociatedMemory[];
}

/**
 * Simple search options for tools
 */
export interface ToolSearchOptions {
  query: string;
  userId?: string;
  limit?: number;
  minScore?: number;
}

/**
 * Simplified RecallContext for service API
 * This is a convenience wrapper - internally converts to full RecallContext from memory module
 */
export interface SimpleRecallContext {
  userId: string;
  currentInput: string;
  currentEmotion?: string;
  currentTopic?: string;
  turnNumber?: number;
  sessionId?: string;
  personaId?: string;
  conversationTurn?: number;
}

/**
 * Simple memory write for tools
 */
export interface MemoryWriteInput {
  userId: string;
  content: string;
  type: 'fact' | 'preference' | 'event' | 'emotion' | 'commitment' | 'milestone';
  importance: 'low' | 'medium' | 'high' | 'critical';
  metadata?: Record<string, unknown>;
}
