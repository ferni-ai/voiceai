/**
 * Short-Term Memory (STM) Buffer
 *
 * L1 memory layer - in-memory buffer for immediate session context.
 * Provides O(1) access to recent turns, entity mentions, and topic continuity.
 *
 * Features:
 * - Per-session buffers (isolated)
 * - Last N turns storage
 * - Entity mention frequency tracking
 * - Topic continuity detection
 * - Auto-expiry on session end
 *
 * Design:
 * - In-memory only (no persistence)
 * - Fixed size with FIFO eviction
 * - Session-scoped cleanup
 *
 * @module memory/dynamic/stm-buffer
 */

import { createLogger } from '../../utils/safe-logger.js';
import type { EntityMention, EmotionSignal, FastCaptureResult } from './fast-capture.js';
import { recordSTMTurn } from './metrics.js';

const log = createLogger({ module: 'STMBuffer' });

// ============================================================================
// CONFIGURATION
// ============================================================================

interface STMConfig {
  /** Maximum turns to keep per session */
  maxTurns: number;
  /** Maximum entities to track per session */
  maxEntities: number;
  /** Session timeout (auto-cleanup) in ms */
  sessionTimeoutMs: number;
}

const DEFAULT_CONFIG: STMConfig = {
  maxTurns: 10,
  maxEntities: 50,
  sessionTimeoutMs: 2 * 60 * 60 * 1000, // 2 hours
};

let config = { ...DEFAULT_CONFIG };

export function configureSTMBuffer(newConfig: Partial<STMConfig>): void {
  config = { ...config, ...newConfig };
}

// ============================================================================
// TYPES
// ============================================================================

/** Voice-derived emotion snapshot (from prosody analysis) */
export interface VoiceEmotionSnapshot {
  primary: string;
  confidence: number;
  stressLevel: number;
  valence: number;
  arousal: number;
}

export interface TurnMemory {
  turnNumber: number;
  transcript: string;
  timestamp: Date;
  entities: EntityMention[];
  emotions: EmotionSignal[];
  topics: string[];
  personaId?: string;
  /** Voice-derived emotion (from prosody), distinct from keyword-based emotions */
  voiceEmotion?: VoiceEmotionSnapshot;
}

export interface EntityFrequency {
  name: string;
  type: EntityMention['type'];
  mentionCount: number;
  lastMentioned: Date;
  contexts: string[];
}

export interface SessionSTM {
  sessionId: string;
  userId: string;
  turns: TurnMemory[];
  entityFrequency: Map<string, EntityFrequency>;
  topicHistory: string[];
  createdAt: Date;
  lastAccessedAt: Date;
}

// ============================================================================
// STORAGE
// ============================================================================

const sessionBuffers = new Map<string, SessionSTM>();

// Session cleanup timers
const cleanupTimers = new Map<string, NodeJS.Timeout>();

// Global cleanup interval (sweeps for expired sessions periodically)
let globalCleanupInterval: NodeJS.Timeout | null = null;
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

// ============================================================================
// CORE FUNCTIONS
// ============================================================================

/**
 * Get or create STM buffer for a session
 */
export function getSTMBuffer(sessionId: string, userId: string): SessionSTM {
  let buffer = sessionBuffers.get(sessionId);

  if (!buffer) {
    // Start the global cleanup interval on first session
    if (!globalCleanupInterval && sessionBuffers.size === 0) {
      startSTMCleanup();
    }

    buffer = {
      sessionId,
      userId,
      turns: [],
      entityFrequency: new Map(),
      topicHistory: [],
      createdAt: new Date(),
      lastAccessedAt: new Date(),
    };
    sessionBuffers.set(sessionId, buffer);

    // Set cleanup timer
    const timer = setTimeout(() => {
      cleanupSession(sessionId);
    }, config.sessionTimeoutMs);
    cleanupTimers.set(sessionId, timer);

    log.debug({ sessionId, userId }, 'Created new STM buffer');
  }

  buffer.lastAccessedAt = new Date();
  return buffer;
}

/**
 * Record a turn in STM
 *
 * @param voiceEmotion - Optional voice-derived emotion from prosody analysis.
 *                       Distinct from keyword-based emotionSignals in captureResult.
 */
export function recordTurn(
  sessionId: string,
  userId: string,
  captureResult: FastCaptureResult,
  transcript: string,
  turnNumber: number,
  personaId?: string,
  voiceEmotion?: VoiceEmotionSnapshot
): void {
  // 🧠 MEMORY AUDIT: Log every turn recording
  log.info(
    {
      sessionId,
      userId,
      turnNumber,
      entityCount: captureResult.mentionedEntities.length,
      transcriptLen: transcript.length,
    },
    '🧠 [MEMORY-AUDIT] recordTurn START'
  );

  const buffer = getSTMBuffer(sessionId, userId);

  // Create turn memory
  const turn: TurnMemory = {
    turnNumber,
    transcript,
    timestamp: new Date(),
    entities: captureResult.mentionedEntities,
    emotions: captureResult.emotionSignals,
    topics: captureResult.topicHints,
    personaId,
    ...(voiceEmotion && { voiceEmotion }),
  };

  // Add turn (FIFO eviction if full)
  buffer.turns.push(turn);
  if (buffer.turns.length > config.maxTurns) {
    buffer.turns.shift();
  }

  // Update entity frequency
  for (const entity of captureResult.mentionedEntities) {
    const key = entity.name.toLowerCase();
    const existing = buffer.entityFrequency.get(key);

    if (existing) {
      existing.mentionCount++;
      existing.lastMentioned = new Date();
      existing.contexts.push(entity.context);
      // Keep last 5 contexts
      if (existing.contexts.length > 5) {
        existing.contexts.shift();
      }
    } else {
      buffer.entityFrequency.set(key, {
        name: entity.name,
        type: entity.type,
        mentionCount: 1,
        lastMentioned: new Date(),
        contexts: [entity.context],
      });
    }

    // Evict least-frequent entities if over limit
    if (buffer.entityFrequency.size > config.maxEntities) {
      const sorted = Array.from(buffer.entityFrequency.entries()).sort(
        (a, b) => a[1].mentionCount - b[1].mentionCount
      );
      buffer.entityFrequency.delete(sorted[0][0]);
    }
  }

  // Update topic history
  for (const topic of captureResult.topicHints) {
    // Move to front if already present
    const idx = buffer.topicHistory.indexOf(topic);
    if (idx !== -1) {
      buffer.topicHistory.splice(idx, 1);
    }
    buffer.topicHistory.unshift(topic);
    // Keep last 10 topics
    if (buffer.topicHistory.length > 10) {
      buffer.topicHistory.pop();
    }
  }

  // 🧠 MEMORY AUDIT: Confirm turn recorded (upgraded to INFO)
  log.info(
    {
      sessionId,
      userId,
      turnNumber,
      totalTurns: buffer.turns.length,
      totalEntities: buffer.entityFrequency.size,
      entityCount: captureResult.mentionedEntities.length,
      topicCount: captureResult.topicHints.length,
    },
    '🧠 [MEMORY-AUDIT] recordTurn COMPLETE - STM updated'
  );

  // Record metrics
  recordSTMTurn(captureResult.mentionedEntities.length);
}

// ============================================================================
// QUERY FUNCTIONS
// ============================================================================

/**
 * Get recent turns from STM
 */
export function getRecentTurns(sessionId: string, limit?: number): TurnMemory[] {
  const buffer = sessionBuffers.get(sessionId);
  if (!buffer) return [];

  const turns = buffer.turns.slice(-(limit || config.maxTurns));
  return turns;
}

/**
 * Get frequently mentioned entities
 */
export function getFrequentEntities(sessionId: string, limit: number = 10): EntityFrequency[] {
  const buffer = sessionBuffers.get(sessionId);
  if (!buffer) return [];

  return Array.from(buffer.entityFrequency.values())
    .sort((a, b) => b.mentionCount - a.mentionCount)
    .slice(0, limit);
}

/**
 * Get recent topics (for continuity)
 */
export function getRecentTopics(sessionId: string): string[] {
  const buffer = sessionBuffers.get(sessionId);
  if (!buffer) return [];

  return buffer.topicHistory;
}

/**
 * Check if an entity was mentioned recently
 */
export function wasEntityMentioned(sessionId: string, entityName: string): boolean {
  const buffer = sessionBuffers.get(sessionId);
  if (!buffer) return false;

  return buffer.entityFrequency.has(entityName.toLowerCase());
}

/**
 * Get entity mention info
 */
export function getEntityMentionInfo(
  sessionId: string,
  entityName: string
): EntityFrequency | null {
  const buffer = sessionBuffers.get(sessionId);
  if (!buffer) return null;

  return buffer.entityFrequency.get(entityName.toLowerCase()) || null;
}

/**
 * Check topic continuity (is a topic ongoing?)
 */
export function isTopicContinuing(sessionId: string, topic: string): boolean {
  const buffer = sessionBuffers.get(sessionId);
  if (!buffer) return false;

  // Topic is continuing if it was mentioned in recent topics
  return buffer.topicHistory.includes(topic);
}

/**
 * Get emotional trajectory across recent turns (text/keyword-based)
 */
export function getEmotionalTrajectory(sessionId: string): EmotionSignal[][] {
  const buffer = sessionBuffers.get(sessionId);
  if (!buffer) return [];

  return buffer.turns.map((t) => t.emotions);
}

/**
 * Get voice-derived emotion trajectory across recent turns
 */
export function getVoiceEmotionTrajectory(
  sessionId: string
): Array<VoiceEmotionSnapshot & { turnNumber: number }> {
  const buffer = sessionBuffers.get(sessionId);
  if (!buffer) return [];

  return buffer.turns
    .filter((t): t is TurnMemory & { voiceEmotion: VoiceEmotionSnapshot } => !!t.voiceEmotion)
    .map((t) => ({ ...t.voiceEmotion!, turnNumber: t.turnNumber }));
}

// ============================================================================
// CONTEXT BUILDING
// ============================================================================

/**
 * Build STM context for LLM injection
 * Returns a formatted string summarizing recent context
 */
export function buildSTMContext(sessionId: string): string | null {
  const buffer = sessionBuffers.get(sessionId);
  if (!buffer || buffer.turns.length === 0) return null;

  const lines: string[] = [];

  // Recent topics
  const topics = buffer.topicHistory.slice(0, 3);
  if (topics.length > 0) {
    lines.push(`**Recent topics**: ${topics.join(', ')}`);
  }

  // Frequently mentioned people
  const people = getFrequentEntities(sessionId, 5).filter((e) => e.type === 'person');
  if (people.length > 0) {
    const peopleStr = people.map((p) => `${p.name} (${p.mentionCount}x)`).join(', ');
    lines.push(`**People mentioned this session**: ${peopleStr}`);
  }

  // Recent emotional state
  const recentEmotions = buffer.turns
    .slice(-3)
    .flatMap((t) => t.emotions)
    .filter((e) => e.intensity !== 'low');
  if (recentEmotions.length > 0) {
    const emotionSet = new Set(recentEmotions.map((e) => e.emotion));
    lines.push(`**Emotional signals**: ${Array.from(emotionSet).join(', ')}`);
  }

  if (lines.length === 0) return null;

  return `## Session Context (Short-Term Memory)\n${lines.join('\n')}`;
}

// ============================================================================
// CLEANUP
// ============================================================================

/**
 * Cleanup a specific session
 * Note: Timer cleanup must happen BEFORE buffer deletion to avoid race condition
 * where the timer callback tries to access a deleted buffer
 */
export function cleanupSession(sessionId: string): void {
  // IMPORTANT: Clear timer FIRST to prevent race condition
  // If we delete the buffer first, the timer callback might fire
  // and try to access the deleted buffer
  const timer = cleanupTimers.get(sessionId);
  if (timer) {
    clearTimeout(timer);
    cleanupTimers.delete(sessionId);
  }

  const buffer = sessionBuffers.get(sessionId);
  if (buffer) {
    log.debug(
      {
        sessionId,
        turnCount: buffer.turns.length,
        entityCount: buffer.entityFrequency.size,
        durationMs: Date.now() - buffer.createdAt.getTime(),
      },
      'Cleaning up STM buffer'
    );
    sessionBuffers.delete(sessionId);
  }
}

/**
 * Cleanup all expired sessions
 */
export function cleanupExpiredSessions(): void {
  const now = Date.now();
  const toDelete: string[] = [];

  for (const [sessionId, buffer] of sessionBuffers) {
    const age = now - buffer.lastAccessedAt.getTime();
    if (age > config.sessionTimeoutMs) {
      toDelete.push(sessionId);
    }
  }

  for (const sessionId of toDelete) {
    cleanupSession(sessionId);
  }

  if (toDelete.length > 0) {
    log.info({ cleanedUp: toDelete.length }, 'Cleaned up expired STM buffers');
  }
}

/**
 * Start the global cleanup interval
 * Called automatically on first session creation, but can be called explicitly
 */
export function startSTMCleanup(): void {
  if (globalCleanupInterval) return; // Already running

  globalCleanupInterval = setInterval(() => {
    cleanupExpiredSessions();
  }, CLEANUP_INTERVAL_MS);

  // Prevent the interval from keeping Node.js alive
  if (globalCleanupInterval.unref) {
    globalCleanupInterval.unref();
  }

  log.debug({ intervalMs: CLEANUP_INTERVAL_MS }, 'Started STM cleanup interval');
}

/**
 * Stop the global cleanup interval
 * Should be called on graceful shutdown
 */
export function stopSTMCleanup(): void {
  if (globalCleanupInterval) {
    clearInterval(globalCleanupInterval);
    globalCleanupInterval = null;
    log.debug({}, 'Stopped STM cleanup interval');
  }
}

/**
 * Clear all sessions and stop cleanup (for testing or shutdown)
 */
export function clearAllSTMBuffers(): void {
  // Stop the cleanup interval
  stopSTMCleanup();

  // Clear all timers
  for (const timer of cleanupTimers.values()) {
    clearTimeout(timer);
  }
  cleanupTimers.clear();

  // Clear all buffers
  const count = sessionBuffers.size;
  sessionBuffers.clear();

  log.debug({ clearedSessions: count }, 'Cleared all STM buffers');
}

/**
 * Get stats about STM usage
 */
export function getSTMStats(): {
  activeSessions: number;
  totalTurns: number;
  totalEntities: number;
} {
  let totalTurns = 0;
  let totalEntities = 0;

  for (const buffer of sessionBuffers.values()) {
    totalTurns += buffer.turns.length;
    totalEntities += buffer.entityFrequency.size;
  }

  return {
    activeSessions: sessionBuffers.size,
    totalTurns,
    totalEntities,
  };
}
