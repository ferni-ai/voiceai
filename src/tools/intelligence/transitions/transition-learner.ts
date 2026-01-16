/**
 * Transition Learner
 *
 * Records tool transitions from active sessions and learns patterns.
 * Integrates with turn-handler and session lifecycle.
 *
 * @module tools/intelligence/transitions/transition-learner
 */

import { createLogger } from '../../../utils/safe-logger.js';
import { getTransitionMatrix, type TransitionMatrix } from './transition-matrix.js';
import type { ToolSequence, SequenceContext, TimeOfDay } from './types.js';
import { getTimeOfDay } from './types.js';

const log = createLogger({ module: 'transition-learner' });

// ============================================================================
// TYPES
// ============================================================================

interface ToolCall {
  toolId: string;
  timestamp: Date;
  success: boolean;
  durationMs?: number;
}

interface SessionBuffer {
  userId: string;
  sessionId: string;
  personaId: string;
  emotion?: string;
  toolCalls: ToolCall[];
  startTime: Date;
}

// ============================================================================
// TRANSITION LEARNER
// ============================================================================

export class TransitionLearner {
  private matrix: TransitionMatrix;

  /** Active session buffers */
  private sessionBuffers = new Map<string, SessionBuffer>();

  /** Recently completed sequences for analysis */
  private recentSequences: ToolSequence[] = [];
  private readonly MAX_RECENT_SEQUENCES = 100;

  constructor(matrix?: TransitionMatrix) {
    this.matrix = matrix || getTransitionMatrix();
  }

  // ==========================================================================
  // SESSION LIFECYCLE
  // ==========================================================================

  /**
   * Start tracking a session
   */
  startSession(userId: string, sessionId: string, personaId: string): void {
    this.sessionBuffers.set(sessionId, {
      userId,
      sessionId,
      personaId,
      toolCalls: [],
      startTime: new Date(),
    });

    log.debug({ sessionId, personaId }, 'Started transition tracking');
  }

  /**
   * End a session and commit the sequence
   */
  endSession(sessionId: string): ToolSequence | null {
    const buffer = this.sessionBuffers.get(sessionId);
    if (!buffer) {
      return null;
    }

    // Remove from active buffers
    this.sessionBuffers.delete(sessionId);

    // Skip if no tool calls
    if (buffer.toolCalls.length < 2) {
      log.debug(
        { sessionId, toolCount: buffer.toolCalls.length },
        'Session too short for transition learning'
      );
      return null;
    }

    // Build sequence
    const sequence: ToolSequence = {
      id: `seq_${sessionId}_${Date.now()}`,
      userId: buffer.userId,
      sessionId: buffer.sessionId,
      sequence: buffer.toolCalls.map((tc) => tc.toolId),
      timestamps: buffer.toolCalls.map((tc) => tc.timestamp),
      success: buffer.toolCalls.map((tc) => tc.success),
      context: {
        personaId: buffer.personaId,
        timeOfDay: getTimeOfDay(buffer.startTime),
        emotion: buffer.emotion,
      },
      createdAt: new Date(),
    };

    // Record transitions
    this.matrix.recordSequence(sequence.sequence, sequence.timestamps, {
      personaId: buffer.personaId,
      emotion: buffer.emotion,
      success: sequence.success,
    });

    // Store in recent sequences
    this.recentSequences.push(sequence);
    if (this.recentSequences.length > this.MAX_RECENT_SEQUENCES) {
      this.recentSequences.shift();
    }

    log.info(
      {
        sessionId,
        sequenceLength: sequence.sequence.length,
        tools: sequence.sequence.join(' → '),
      },
      'Session transitions recorded'
    );

    return sequence;
  }

  // ==========================================================================
  // RECORDING EVENTS
  // ==========================================================================

  /**
   * Record a tool call in the current session
   */
  recordToolCall(sessionId: string, toolId: string, success: boolean, durationMs?: number): void {
    const buffer = this.sessionBuffers.get(sessionId);
    if (!buffer) {
      log.warn({ sessionId }, 'Tool call recorded for unknown session');
      return;
    }

    const toolCall: ToolCall = {
      toolId,
      timestamp: new Date(),
      success,
      durationMs,
    };

    buffer.toolCalls.push(toolCall);

    // Record transition immediately if we have a previous call
    if (buffer.toolCalls.length >= 2) {
      const prev = buffer.toolCalls[buffer.toolCalls.length - 2];
      const gapMs = toolCall.timestamp.getTime() - prev.timestamp.getTime();

      this.matrix.recordTransition(prev.toolId, toolCall.toolId, {
        personaId: buffer.personaId,
        timeOfDay: getTimeOfDay(toolCall.timestamp),
        emotion: buffer.emotion,
        gapMs,
        success,
      });
    }

    log.debug({ sessionId, toolId, toolCount: buffer.toolCalls.length }, 'Tool call recorded');
  }

  /**
   * Update session context (e.g., emotion change)
   */
  updateSessionContext(sessionId: string, updates: { personaId?: string; emotion?: string }): void {
    const buffer = this.sessionBuffers.get(sessionId);
    if (!buffer) return;

    if (updates.personaId) buffer.personaId = updates.personaId;
    if (updates.emotion) buffer.emotion = updates.emotion;
  }

  // ==========================================================================
  // ANALYSIS
  // ==========================================================================

  /**
   * Get common patterns from recent sequences
   */
  getCommonPatterns(
    minLength = 2,
    minOccurrences = 2
  ): Array<{
    pattern: string[];
    occurrences: number;
    contexts: string[];
  }> {
    // Extract all subsequences
    const patternCounts = new Map<string, { count: number; contexts: Set<string> }>();

    for (const seq of this.recentSequences) {
      // Generate all subsequences of length >= minLength
      for (let i = 0; i < seq.sequence.length - minLength + 1; i++) {
        for (let len = minLength; len <= Math.min(5, seq.sequence.length - i); len++) {
          const pattern = seq.sequence.slice(i, i + len);
          const key = pattern.join('→');

          if (!patternCounts.has(key)) {
            patternCounts.set(key, { count: 0, contexts: new Set() });
          }

          const data = patternCounts.get(key)!;
          data.count++;
          data.contexts.add(`${seq.context.personaId}:${seq.context.timeOfDay}`);
        }
      }
    }

    // Filter and format results
    const patterns: Array<{
      pattern: string[];
      occurrences: number;
      contexts: string[];
    }> = [];

    for (const [key, data] of patternCounts) {
      if (data.count >= minOccurrences) {
        patterns.push({
          pattern: key.split('→'),
          occurrences: data.count,
          contexts: Array.from(data.contexts),
        });
      }
    }

    // Sort by occurrence count
    patterns.sort((a, b) => b.occurrences - a.occurrences);

    return patterns.slice(0, 20);
  }

  /**
   * Get frequently co-occurring tools
   */
  getToolCooccurrences(): Map<string, string[]> {
    const cooccurrences = new Map<string, Map<string, number>>();

    for (const seq of this.recentSequences) {
      const toolSet = new Set(seq.sequence);

      for (const tool of toolSet) {
        if (!cooccurrences.has(tool)) {
          cooccurrences.set(tool, new Map());
        }

        for (const other of toolSet) {
          if (tool !== other) {
            const counts = cooccurrences.get(tool)!;
            counts.set(other, (counts.get(other) || 0) + 1);
          }
        }
      }
    }

    // Convert to sorted lists
    const result = new Map<string, string[]>();
    for (const [tool, counts] of cooccurrences) {
      const sorted = Array.from(counts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([t]) => t);
      result.set(tool, sorted);
    }

    return result;
  }

  // ==========================================================================
  // STATISTICS
  // ==========================================================================

  /**
   * Get learner statistics
   */
  getStats(): {
    activeSessions: number;
    recentSequences: number;
    avgSequenceLength: number;
    matrixStats: ReturnType<TransitionMatrix['getStats']>;
  } {
    const avgLength =
      this.recentSequences.length > 0
        ? this.recentSequences.reduce((acc, s) => acc + s.sequence.length, 0) /
          this.recentSequences.length
        : 0;

    return {
      activeSessions: this.sessionBuffers.size,
      recentSequences: this.recentSequences.length,
      avgSequenceLength: avgLength,
      matrixStats: this.matrix.getStats(),
    };
  }

  /**
   * Get the underlying transition matrix
   */
  getMatrix(): TransitionMatrix {
    return this.matrix;
  }

  /**
   * Clear all data
   */
  clear(): void {
    this.sessionBuffers.clear();
    this.recentSequences = [];
    this.matrix.clear();
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

let learnerInstance: TransitionLearner | null = null;

export function getTransitionLearner(): TransitionLearner {
  if (!learnerInstance) {
    learnerInstance = new TransitionLearner();
  }
  return learnerInstance;
}

export function resetTransitionLearner(): void {
  learnerInstance = null;
}
