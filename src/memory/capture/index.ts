/**
 * Unified Capture Pipeline (Clean Architecture)
 *
 * Single entry point for all memory capture operations.
 * Routes through appropriate subsystems based on context:
 *
 * 1. FAST PATH (< 50ms, inline):
 *    - Regex-based entity detection
 *    - Emotion signals
 *    - Topic hints
 *    - Queues async deep extraction
 *
 * 2. DEEP PATH (async, 1-3s):
 *    - LLM-powered entity extraction
 *    - Fact extraction
 *    - Relationship extraction
 *    - Routes to entity-store for persistence
 *
 * Architecture:
 * ```
 * User Speech
 *     │
 *     ▼
 * captureTurn() ─────────────────────────┐
 *     │                                   │
 *     ├─→ fastCapture() [inline]          │
 *     │       └─→ STM Buffer (L1)         │
 *     │                                   │
 *     └─→ AsyncEvents.emit() [fire&forget]│
 *             │                           │
 *             ▼                           │
 *         DeepExtractionWorker            │
 *             │                           │
 *             ▼                           │
 *         Entity Store (L2)               │
 *             │                           │
 *             ▼                           │
 *         Spanner Graph (L3) [background] │
 * ```
 *
 * @module memory/capture
 */

import { createLogger } from '../../utils/safe-logger.js';
import {
  fastCapture,
  type FastCaptureInput,
  type FastCaptureResult,
} from '../dynamic/fast-capture.js';
import { recordTurn } from '../dynamic/stm-buffer.js';
import { isEntityStoreReady, capturePersonEntity } from '../entity-store/integration.js';
import type { CaptureContext, CaptureResult as EntityCaptureResult } from '../entity-store/types.js';

const log = createLogger({ module: 'CaptureService' });

// ============================================================================
// TYPES
// ============================================================================

/**
 * Input for unified capture
 */
export interface CaptureInput {
  userId: string;
  sessionId: string;
  turnNumber: number;
  transcript: string;
  timestamp?: Date;
  personaId?: string;
  emotion?: {
    primary?: string;
    intensity?: number;
    voiceEmotion?: string;
  };
  topic?: string;
}

/**
 * Result of unified capture
 */
export interface CaptureResultUnified {
  /** Fast capture results (always available) */
  fast: FastCaptureResult;

  /** STM recorded */
  stmRecorded: boolean;

  /** Entity captures (if entity store is ready) */
  entities: {
    captured: number;
    results: EntityCaptureResult[];
  };

  /** Async job ID for deep extraction (if queued) */
  asyncJobId: string | null;

  /** Total processing time */
  captureTimeMs: number;
}

// ============================================================================
// UNIFIED CAPTURE
// ============================================================================

/**
 * Capture memory from a conversation turn.
 *
 * This is the SINGLE ENTRY POINT for all memory capture.
 * Replaces direct calls to:
 * - fastCapture()
 * - captureTurn() (knowledge-graph)
 * - capturePersonEntity() (entity-store)
 *
 * @param input - Capture input
 * @returns Unified capture result
 */
export async function captureTurnUnified(input: CaptureInput): Promise<CaptureResultUnified> {
  const startTime = Date.now();

  // 1. FAST PATH: Inline regex extraction
  const fastResult = await fastCapture({
    userId: input.userId,
    sessionId: input.sessionId,
    turnNumber: input.turnNumber,
    transcript: input.transcript,
    timestamp: input.timestamp,
    voiceEmotion: input.emotion?.voiceEmotion,
    personaId: input.personaId,
  });

  // 2. Record to STM (Short-Term Memory buffer)
  let stmRecorded = false;
  try {
    recordTurn(
      input.sessionId,
      input.userId,
      fastResult,
      input.transcript,
      input.turnNumber
    );
    stmRecorded = true;
  } catch (error) {
    log.warn({ error: String(error) }, 'Failed to record turn to STM');
  }

  // 3. Capture person entities to entity store (if mentioned)
  const entityResults: EntityCaptureResult[] = [];
  if (isEntityStoreReady() && fastResult.mentionedEntities.length > 0) {
    const personMentions = fastResult.mentionedEntities.filter(
      (e) => e.type === 'person'
    );

    const context: CaptureContext = {
      conversationId: input.sessionId,
      sessionId: input.sessionId,
      personaId: input.personaId || 'ferni',
      transcript: input.transcript,
      emotion: input.emotion
        ? {
            primary: input.emotion.primary || 'neutral',
            intensity: input.emotion.intensity || 0.5,
          }
        : undefined,
    };

    for (const mention of personMentions) {
      try {
        const result = await capturePersonEntity(
          input.userId,
          {
            name: mention.name,
            context: mention.context,
          },
          context
        );
        entityResults.push(result);
      } catch (error) {
        log.debug(
          { error: String(error), mention: mention.name },
          'Failed to capture person entity'
        );
      }
    }
  }

  return {
    fast: fastResult,
    stmRecorded,
    entities: {
      captured: entityResults.length,
      results: entityResults,
    },
    asyncJobId: fastResult.asyncJobId,
    captureTimeMs: Date.now() - startTime,
  };
}

/**
 * Capture from a batch of turns (for post-session processing)
 */
export async function captureBatchUnified(
  userId: string,
  sessionId: string,
  turns: Array<{ transcript: string; turnNumber: number; timestamp?: Date }>
): Promise<CaptureResultUnified[]> {
  const results: CaptureResultUnified[] = [];

  for (const turn of turns) {
    const result = await captureTurnUnified({
      userId,
      sessionId,
      turnNumber: turn.turnNumber,
      transcript: turn.transcript,
      timestamp: turn.timestamp,
    });
    results.push(result);
  }

  return results;
}

// ============================================================================
// RE-EXPORTS FOR CONVENIENCE
// ============================================================================

// Fast capture components
export {
  fastCapture,
  detectEntityMentions,
  detectEmotionSignals,
  detectTopicHints,
  detectDateSignals,
  detectRelationshipSignals,
  type FastCaptureInput,
  type FastCaptureResult,
  type EntityMention,
  type EmotionSignal,
  type DateSignal,
  type RelationshipSignal,
} from '../dynamic/fast-capture.js';

// STM Buffer
export {
  recordTurn,
  getSTMBuffer,
  wasEntityMentioned,
  buildSTMContext,
  getRecentTurns,
  getFrequentEntities,
  getRecentTopics,
  getEmotionalTrajectory,
  cleanupSession,
  type TurnMemory,
  type SessionSTM,
  type EntityFrequency,
} from '../dynamic/stm-buffer.js';

// Entity capture
export {
  capturePersonEntity,
  captureMultiplePeople,
  isEntityStoreReady,
} from '../entity-store/integration.js';
