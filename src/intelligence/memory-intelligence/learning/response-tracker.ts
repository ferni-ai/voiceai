/**
 * Response Tracker
 *
 * Tracks how users respond to surfaced memories.
 * This data feeds into the learning system to improve timing decisions.
 *
 * @module intelligence/memory-intelligence/learning/response-tracker
 */

import { createLogger } from '../../../utils/safe-logger.js';
import type { UserResponseSignal, UserResponseType, MemorySurfacedEvent, MemoryResponseEvent } from '../types.js';

const log = createLogger({ module: 'ResponseTracker' });

// ============================================================================
// TYPES
// ============================================================================

/**
 * Record of a memory being surfaced
 */
export interface SurfacedMemoryRecord {
  memoryId: string;
  userId: string;
  sessionId: string;
  surfacedAt: Date;
  trigger: string;
  style: string;
  persona: string;
  contextSnapshot: {
    turnCount: number;
    emotionalIntensity: number;
    topics: string[];
  };
  response?: {
    type: UserResponseType;
    intensity: number;
    timestamp: Date;
    turnsUntilResponse: number;
  };
}

/**
 * Session tracking state
 */
interface SessionState {
  userId: string;
  sessionId: string;
  surfacedMemories: Map<string, SurfacedMemoryRecord>;
  currentTurn: number;
  lastSurfacedTurn: number;
}

// ============================================================================
// RESPONSE TRACKER
// ============================================================================

/**
 * Response Tracker
 *
 * Tracks memory surfacing events and user responses for learning.
 */
export class ResponseTracker {
  private sessions: Map<string, SessionState> = new Map();
  private eventHistory: Array<MemorySurfacedEvent | MemoryResponseEvent> = [];
  private initialized = false;

  // In-memory history limit
  private readonly maxHistorySize = 1000;

  async initialize(): Promise<void> {
    this.initialized = true;
    log.debug('ResponseTracker initialized');
  }

  /**
   * Start tracking a session
   */
  startSession(userId: string, sessionId: string): void {
    this.sessions.set(sessionId, {
      userId,
      sessionId,
      surfacedMemories: new Map(),
      currentTurn: 0,
      lastSurfacedTurn: -10, // Allow immediate surfacing
    });
    log.debug({ userId, sessionId }, 'Started tracking session');
  }

  /**
   * End a session and flush data to Firestore
   */
  async endSession(sessionId: string): Promise<SurfacedMemoryRecord[]> {
    const session = this.sessions.get(sessionId);
    if (!session) return [];

    const records = Array.from(session.surfacedMemories.values());
    this.sessions.delete(sessionId);

    // Persist records to Firestore for cross-session learning
    if (records.length > 0) {
      try {
        const { saveRecords } = await import('./persistence.js');
        await saveRecords(records);
        log.debug({ sessionId, recordCount: records.length }, 'Persisted surfacing records');
      } catch (error) {
        log.warn({ error: String(error), sessionId }, 'Failed to persist surfacing records');
      }
    }

    log.debug({ sessionId, recordCount: records.length }, 'Ended tracking session');
    return records;
  }

  /**
   * Increment turn counter for a session
   */
  incrementTurn(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.currentTurn++;
    }
  }

  /**
   * Record that a memory was surfaced
   */
  recordSurfaced(event: MemorySurfacedEvent): void {
    const session = this.sessions.get(event.sessionId);
    if (!session) {
      log.warn({ sessionId: event.sessionId }, 'No session found for surfaced memory');
      return;
    }

    const record: SurfacedMemoryRecord = {
      memoryId: event.memoryId,
      userId: event.userId,
      sessionId: event.sessionId,
      surfacedAt: event.timestamp,
      trigger: event.trigger,
      style: event.style,
      persona: event.persona,
      contextSnapshot: {
        turnCount: session.currentTurn,
        emotionalIntensity: 0, // Would be set from context
        topics: [],
      },
    };

    session.surfacedMemories.set(event.memoryId, record);
    session.lastSurfacedTurn = session.currentTurn;

    // Add to history
    this.addToHistory(event);

    log.debug({
      memoryId: event.memoryId,
      trigger: event.trigger,
      turn: session.currentTurn,
    }, 'Recorded surfaced memory');
  }

  /**
   * Record user's response to a surfaced memory
   */
  recordResponse(
    sessionId: string,
    memoryIds: string[],
    response: UserResponseSignal
  ): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      log.warn({ sessionId }, 'No session found for response');
      return;
    }

    for (const memoryId of memoryIds) {
      const record = session.surfacedMemories.get(memoryId);
      if (record && !record.response) {
        record.response = {
          type: response.type,
          intensity: response.intensity,
          timestamp: response.timestamp,
          turnsUntilResponse: session.currentTurn - record.contextSnapshot.turnCount,
        };

        // Create response event
        const responseEvent: MemoryResponseEvent = {
          userId: session.userId,
          sessionId,
          memoryId,
          responseType: response.type,
          responseIntensity: response.intensity,
          timestamp: response.timestamp,
        };
        this.addToHistory(responseEvent);

        log.debug({
          memoryId,
          responseType: response.type,
          turnsUntilResponse: record.response.turnsUntilResponse,
        }, 'Recorded response to memory');
      }
    }
  }

  /**
   * Analyze user's text to detect response type
   */
  analyzeResponseFromText(
    text: string,
    previousMemoryContent: string
  ): UserResponseSignal {
    const textLower = text.toLowerCase();

    // Check for engagement signals
    const engagementPatterns = [
      /yes.*(remember|that|right)/i,
      /exactly/i,
      /that's (right|true|it)/i,
      /you're right/i,
      /i (was|did|have|had)/i,
    ];

    const deflectionPatterns = [
      /anyway/i,
      /but.*(now|today)/i,
      /let's talk about/i,
      /moving on/i,
      /different topic/i,
      /not.*right now/i,
    ];

    const emotionalPositivePatterns = [
      /!+$/,
      /thank you/i,
      /that means/i,
      /appreciate/i,
      /love that/i,
    ];

    const emotionalNegativePatterns = [
      /don't want to/i,
      /please stop/i,
      /uncomfortable/i,
      /rather not/i,
    ];

    const correctionPatterns = [
      /actually.*no/i,
      /that's not/i,
      /i didn't/i,
      /wasn't like that/i,
      /not exactly/i,
    ];

    const requestMorePatterns = [
      /tell me more/i,
      /what (else|happened)/i,
      /and then/i,
      /go on/i,
    ];

    // Determine type
    let type: UserResponseType = 'acknowledged';
    let intensity = 0.5;

    if (engagementPatterns.some((p) => p.test(text))) {
      type = 'engaged';
      intensity = 0.7;
    } else if (deflectionPatterns.some((p) => p.test(text))) {
      type = 'deflected';
      intensity = 0.6;
    } else if (emotionalPositivePatterns.some((p) => p.test(text))) {
      type = 'emotional_positive';
      intensity = 0.8;
    } else if (emotionalNegativePatterns.some((p) => p.test(text))) {
      type = 'emotional_negative';
      intensity = 0.7;
    } else if (correctionPatterns.some((p) => p.test(text))) {
      type = 'corrected';
      intensity = 0.6;
    } else if (requestMorePatterns.some((p) => p.test(text))) {
      type = 'requested_more';
      intensity = 0.9;
    }

    // Check for content overlap (indicates engagement)
    const memoryWords = previousMemoryContent.toLowerCase().split(/\s+/).filter((w) => w.length > 4);
    const responseWords = textLower.split(/\s+/);
    const overlap = memoryWords.filter((w) => responseWords.includes(w)).length;

    if (overlap >= 2 && type === 'acknowledged') {
      type = 'engaged';
      intensity = 0.6;
    }

    // Check if response is very short (might be ignored)
    if (text.length < 10 && !engagementPatterns.some((p) => p.test(text))) {
      type = 'ignored';
      intensity = 0.3;
    }

    return {
      type,
      intensity,
      timestamp: new Date(),
    };
  }

  /**
   * Get statistics for a user
   */
  getUserStats(userId: string): {
    totalSurfaced: number;
    responseRate: number;
    engagementRate: number;
    deflectionRate: number;
    averageResponseTurns: number;
  } {
    // Analyze history for this user
    const surfacedEvents = this.eventHistory.filter(
      (e): e is MemorySurfacedEvent =>
        'trigger' in e && e.userId === userId
    );

    const responseEvents = this.eventHistory.filter(
      (e): e is MemoryResponseEvent =>
        'responseType' in e && e.userId === userId
    );

    const totalSurfaced = surfacedEvents.length;
    const totalResponses = responseEvents.length;
    const engaged = responseEvents.filter((e) =>
      ['engaged', 'emotional_positive', 'requested_more'].includes(e.responseType)
    ).length;
    const deflected = responseEvents.filter((e) => e.responseType === 'deflected').length;

    return {
      totalSurfaced,
      responseRate: totalSurfaced > 0 ? totalResponses / totalSurfaced : 0,
      engagementRate: totalResponses > 0 ? engaged / totalResponses : 0,
      deflectionRate: totalResponses > 0 ? deflected / totalResponses : 0,
      averageResponseTurns: 1.5, // Would calculate from records
    };
  }

  /**
   * Get turns since last memory surfaced
   */
  getTurnsSinceLastSurfaced(sessionId: string): number {
    const session = this.sessions.get(sessionId);
    if (!session) return 999;
    return session.currentTurn - session.lastSurfacedTurn;
  }

  /**
   * Get memories surfaced this session
   */
  getSessionSurfacedMemories(sessionId: string): string[] {
    const session = this.sessions.get(sessionId);
    if (!session) return [];
    return Array.from(session.surfacedMemories.keys());
  }

  /**
   * Add event to history
   */
  private addToHistory(event: MemorySurfacedEvent | MemoryResponseEvent): void {
    this.eventHistory.push(event);

    // Trim history if needed
    if (this.eventHistory.length > this.maxHistorySize) {
      this.eventHistory = this.eventHistory.slice(-this.maxHistorySize / 2);
    }
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let trackerInstance: ResponseTracker | null = null;

export function getResponseTracker(): ResponseTracker {
  if (!trackerInstance) {
    trackerInstance = new ResponseTracker();
  }
  return trackerInstance;
}

export function resetResponseTracker(): void {
  trackerInstance = null;
}
