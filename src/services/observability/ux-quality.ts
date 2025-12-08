/**
 * User Experience Quality Metrics
 *
 * Tracks conversation quality and user experience:
 * - Conversation turns and length
 * - Interruption frequency
 * - Completion vs abandonment rates
 * - Silence gaps
 * - Session quality scores
 */

import { getLogger } from '../../utils/safe-logger.js';

const log = getLogger();

// ============================================================================
// TYPES
// ============================================================================

export type SessionEndReason = 'user_ended' | 'timeout' | 'error' | 'handoff' | 'unknown';

export interface ConversationTurn {
  id: string;
  sessionId: string;
  timestamp: number;
  speaker: 'user' | 'agent';
  wordCount: number;
  durationMs: number;
  wasInterrupted: boolean;
  silenceBeforeMs: number;
}

export interface SessionQuality {
  sessionId: string;
  startTime: number;
  endTime?: number;
  endReason?: SessionEndReason;
  turnCount: number;
  totalDurationMs: number;
  userWordCount: number;
  agentWordCount: number;
  interruptionCount: number;
  silenceGaps: number; // gaps > 3 seconds
  echoEvents: number;
  qualityScore?: number; // 0-100
}

export interface UXQualitySnapshot {
  // Conversation metrics
  avgTurnLength: number; // words
  avgTurnsPerSession: number;
  avgSessionDurationMs: number;

  // Interruptions
  avgInterruptionsPerSession: number;
  interruptionRate: number; // % of turns interrupted

  // Completion
  completionRate: number; // % user-ended
  timeoutRate: number;
  errorEndRate: number;

  // Silence
  avgSilenceGapMs: number;
  longSilenceCount: number; // gaps > 3s
  silenceGapRate: number; // % of turns with long silence

  // Quality
  avgQualityScore: number;
  lowQualitySessions: number;

  // Echo detection
  echoEventsTotal: number;
  sessionsWithEcho: number;

  // Engagement
  avgUserWordsPerSession: number;
  avgAgentWordsPerSession: number;
  userToAgentRatio: number;

  // Sessions
  totalSessions: number;
  activeSessions: number;

  // Time window
  windowStartTime: number;
  windowEndTime: number;
}

// ============================================================================
// UX QUALITY SERVICE
// ============================================================================

class UXQualityService {
  private turns: ConversationTurn[] = [];
  private sessions = new Map<string, SessionQuality>();
  private completedSessions: SessionQuality[] = [];
  private readonly MAX_TURNS = 50000;
  private readonly MAX_COMPLETED_SESSIONS = 1000;

  /**
   * Start tracking a session
   */
  startSession(sessionId: string): void {
    this.sessions.set(sessionId, {
      sessionId,
      startTime: Date.now(),
      turnCount: 0,
      totalDurationMs: 0,
      userWordCount: 0,
      agentWordCount: 0,
      interruptionCount: 0,
      silenceGaps: 0,
      echoEvents: 0,
    });
  }

  /**
   * Record a conversation turn
   */
  recordTurn(turn: Omit<ConversationTurn, 'id' | 'timestamp'>): void {
    const record: ConversationTurn = {
      ...turn,
      id: `turn_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      timestamp: Date.now(),
    };

    this.turns.push(record);

    // Trim old turns
    if (this.turns.length > this.MAX_TURNS) {
      this.turns = this.turns.slice(-this.MAX_TURNS);
    }

    // Update session
    const session = this.sessions.get(turn.sessionId);
    if (session) {
      session.turnCount++;
      session.totalDurationMs = Date.now() - session.startTime;

      if (turn.speaker === 'user') {
        session.userWordCount += turn.wordCount;
      } else {
        session.agentWordCount += turn.wordCount;
      }

      if (turn.wasInterrupted) {
        session.interruptionCount++;
      }

      if (turn.silenceBeforeMs > 3000) {
        session.silenceGaps++;
      }
    }
  }

  /**
   * Record an interruption
   */
  recordInterruption(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.interruptionCount++;
    }
  }

  /**
   * Record an echo event
   */
  recordEchoEvent(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.echoEvents++;
      log.warn({ sessionId }, '🔊 Echo event detected');
    }
  }

  /**
   * End a session
   */
  endSession(sessionId: string, reason: SessionEndReason, qualityScore?: number): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.endTime = Date.now();
      session.endReason = reason;
      session.totalDurationMs = session.endTime - session.startTime;
      session.qualityScore = qualityScore;

      // Archive to completed
      this.completedSessions.push({ ...session });
      if (this.completedSessions.length > this.MAX_COMPLETED_SESSIONS) {
        this.completedSessions = this.completedSessions.slice(-this.MAX_COMPLETED_SESSIONS);
      }

      // Remove from active
      this.sessions.delete(sessionId);

      log.debug(
        {
          sessionId,
          reason,
          turnCount: session.turnCount,
          durationMs: session.totalDurationMs,
          qualityScore,
        },
        '📊 Session ended'
      );
    }
  }

  /**
   * Set quality score for active session
   */
  setQualityScore(sessionId: string, score: number): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.qualityScore = score;
    }
  }

  /**
   * Get snapshot
   */
  getSnapshot(windowMinutes = 60): UXQualitySnapshot {
    const now = Date.now();
    const windowStart = now - windowMinutes * 60 * 1000;

    // Window turns
    const windowTurns = this.turns.filter((t) => t.timestamp >= windowStart);

    // Window sessions (active + recently completed)
    const activeSessions = Array.from(this.sessions.values());
    const recentCompleted = this.completedSessions.filter((s) => (s.endTime ?? 0) >= windowStart);
    const allWindowSessions = [...activeSessions, ...recentCompleted];

    // Turn metrics
    const avgTurnLength =
      windowTurns.length > 0
        ? windowTurns.reduce((sum, t) => sum + t.wordCount, 0) / windowTurns.length
        : 0;

    // Session metrics
    const avgTurns =
      allWindowSessions.length > 0
        ? allWindowSessions.reduce((sum, s) => sum + s.turnCount, 0) / allWindowSessions.length
        : 0;
    const avgDuration =
      allWindowSessions.length > 0
        ? allWindowSessions.reduce((sum, s) => sum + s.totalDurationMs, 0) /
          allWindowSessions.length
        : 0;

    // Interruptions
    const totalInterruptions = allWindowSessions.reduce((sum, s) => sum + s.interruptionCount, 0);
    const avgInterruptions =
      allWindowSessions.length > 0 ? totalInterruptions / allWindowSessions.length : 0;
    const interruptedTurns = windowTurns.filter((t) => t.wasInterrupted).length;
    const interruptionRate =
      windowTurns.length > 0 ? (interruptedTurns / windowTurns.length) * 100 : 0;

    // Completion rates
    const userEnded = recentCompleted.filter((s) => s.endReason === 'user_ended').length;
    const timeouts = recentCompleted.filter((s) => s.endReason === 'timeout').length;
    const errors = recentCompleted.filter((s) => s.endReason === 'error').length;
    const completionRate =
      recentCompleted.length > 0 ? (userEnded / recentCompleted.length) * 100 : 100;
    const timeoutRate = recentCompleted.length > 0 ? (timeouts / recentCompleted.length) * 100 : 0;
    const errorEndRate = recentCompleted.length > 0 ? (errors / recentCompleted.length) * 100 : 0;

    // Silence
    const silences = windowTurns.map((t) => t.silenceBeforeMs).filter((s) => s > 0);
    const avgSilence =
      silences.length > 0 ? silences.reduce((a, b) => a + b, 0) / silences.length : 0;
    const longSilences = silences.filter((s) => s > 3000).length;
    const silenceGapRate = windowTurns.length > 0 ? (longSilences / windowTurns.length) * 100 : 0;

    // Quality
    const scoredSessions = allWindowSessions.filter((s) => s.qualityScore !== undefined);
    const avgQuality =
      scoredSessions.length > 0
        ? scoredSessions.reduce((sum, s) => sum + (s.qualityScore ?? 0), 0) / scoredSessions.length
        : 100;
    const lowQuality = scoredSessions.filter((s) => (s.qualityScore ?? 100) < 70).length;

    // Echo
    const echoTotal = allWindowSessions.reduce((sum, s) => sum + s.echoEvents, 0);
    const sessionsWithEcho = allWindowSessions.filter((s) => s.echoEvents > 0).length;

    // Engagement
    const avgUserWords =
      allWindowSessions.length > 0
        ? allWindowSessions.reduce((sum, s) => sum + s.userWordCount, 0) / allWindowSessions.length
        : 0;
    const avgAgentWords =
      allWindowSessions.length > 0
        ? allWindowSessions.reduce((sum, s) => sum + s.agentWordCount, 0) / allWindowSessions.length
        : 0;
    const ratio = avgAgentWords > 0 ? avgUserWords / avgAgentWords : 1;

    return {
      avgTurnLength,
      avgTurnsPerSession: avgTurns,
      avgSessionDurationMs: avgDuration,
      avgInterruptionsPerSession: avgInterruptions,
      interruptionRate,
      completionRate,
      timeoutRate,
      errorEndRate,
      avgSilenceGapMs: avgSilence,
      longSilenceCount: longSilences,
      silenceGapRate,
      avgQualityScore: avgQuality,
      lowQualitySessions: lowQuality,
      echoEventsTotal: echoTotal,
      sessionsWithEcho,
      avgUserWordsPerSession: avgUserWords,
      avgAgentWordsPerSession: avgAgentWords,
      userToAgentRatio: ratio,
      totalSessions: allWindowSessions.length,
      activeSessions: activeSessions.length,
      windowStartTime: windowStart,
      windowEndTime: now,
    };
  }

  /**
   * Clear metrics
   */
  clear(): void {
    this.turns = [];
    this.sessions.clear();
    this.completedSessions = [];
    log.info('UX quality metrics cleared');
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

export const uxQualityMetrics = new UXQualityService();
