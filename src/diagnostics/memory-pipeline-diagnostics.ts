/**
 * Memory Pipeline Diagnostics
 *
 * Comprehensive logging for debugging the memory/learning pipeline.
 * Instruments all key points to identify where data is being lost.
 *
 * Enable with: MEMORY_DIAGNOSTICS=true
 *
 * @module diagnostics/memory-pipeline-diagnostics
 */

import { getLogger } from '../utils/safe-logger.js';

const log = getLogger().child({ module: 'MemoryDiagnostics' });

// Configuration
const ENABLED = process.env.MEMORY_DIAGNOSTICS === 'true';

// Track diagnostic data
interface DiagnosticSession {
  sessionId: string;
  userId: string;
  startTime: number;
  turnCount: number;
  userTurnCount: number;
  learningCaptured: {
    keyMoments: number;
    emotionalPatterns: number;
    smallDetails: number;
    insights: number;
  };
  humanSignals: {
    dates: number;
    values: number;
    dreams: number;
    fears: number;
    growth: number;
    comfort: number;
  };
  saveAttempted: boolean;
  saveSucceeded: boolean;
  errors: string[];
}

const sessions = new Map<string, DiagnosticSession>();

// ============================================================================
// SESSION LIFECYCLE
// ============================================================================

export function diagnosticSessionStart(sessionId: string, userId: string): void {
  if (!ENABLED) return;

  const session: DiagnosticSession = {
    sessionId,
    userId,
    startTime: Date.now(),
    turnCount: 0,
    userTurnCount: 0,
    learningCaptured: {
      keyMoments: 0,
      emotionalPatterns: 0,
      smallDetails: 0,
      insights: 0,
    },
    humanSignals: {
      dates: 0,
      values: 0,
      dreams: 0,
      fears: 0,
      growth: 0,
      comfort: 0,
    },
    saveAttempted: false,
    saveSucceeded: false,
    errors: [],
  };

  sessions.set(sessionId, session);

  log.info({ sessionId, userId }, '🔬 [DIAG] Memory diagnostics session started');
}

export function diagnosticSessionEnd(sessionId: string): void {
  if (!ENABLED) return;

  const session = sessions.get(sessionId);
  if (!session) {
    log.warn({ sessionId }, '🔬 [DIAG] Session end called but no session found');
    return;
  }

  const durationMs = Date.now() - session.startTime;

  log.info(
    {
      sessionId,
      userId: session.userId,
      durationMs,
      turnCount: session.turnCount,
      userTurnCount: session.userTurnCount,
      learningCaptured: session.learningCaptured,
      humanSignals: session.humanSignals,
      saveAttempted: session.saveAttempted,
      saveSucceeded: session.saveSucceeded,
      errors: session.errors,
    },
    '🔬 [DIAG] Memory diagnostics session summary'
  );

  // Log gaps
  const gaps: string[] = [];
  if (session.userTurnCount > 0) {
    if (session.learningCaptured.keyMoments === 0) gaps.push('No key moments captured');
    if (session.learningCaptured.emotionalPatterns === 0) gaps.push('No emotional patterns');
    if (session.learningCaptured.smallDetails === 0) gaps.push('No small details');
    if (session.humanSignals.dates === 0) gaps.push('No important dates');
    if (session.humanSignals.values === 0) gaps.push('No values detected');
    if (!session.saveAttempted) gaps.push('Profile save never attempted');
    if (session.saveAttempted && !session.saveSucceeded) gaps.push('Profile save failed');
  }

  if (gaps.length > 0) {
    log.warn({ sessionId, gaps }, '🔬 [DIAG] Memory pipeline gaps detected');
  }

  sessions.delete(sessionId);
}

// ============================================================================
// TURN PROCESSING
// ============================================================================

export function diagnosticTurnAdded(
  sessionId: string,
  role: 'user' | 'assistant',
  contentLength: number
): void {
  if (!ENABLED) return;

  const session = sessions.get(sessionId);
  if (!session) return;

  session.turnCount++;
  if (role === 'user') {
    session.userTurnCount++;
  }

  log.debug(
    { sessionId, role, contentLength, turnCount: session.turnCount },
    '🔬 [DIAG] Turn added'
  );
}

export function diagnosticUserTurnAnalyzed(
  sessionId: string,
  analysis: {
    emotion?: { primary: string; intensity: number };
    intent?: { primary: string };
    topics?: string[];
  }
): void {
  if (!ENABLED) return;

  log.debug(
    {
      sessionId,
      emotion: analysis.emotion?.primary,
      intensity: analysis.emotion?.intensity,
      intent: analysis.intent?.primary,
      topics: analysis.topics,
    },
    '🔬 [DIAG] User turn analyzed'
  );
}

// ============================================================================
// LEARNING ENGINE
// ============================================================================

export function diagnosticKeyMomentCaptured(
  sessionId: string,
  moment: { type: string; summary: string }
): void {
  if (!ENABLED) return;

  const session = sessions.get(sessionId);
  if (session) {
    session.learningCaptured.keyMoments++;
  }

  log.info(
    { sessionId, momentType: moment.type, summary: moment.summary },
    '🔬 [DIAG] Key moment captured!'
  );
}

export function diagnosticEmotionalPatternDetected(
  sessionId: string,
  emotion: string,
  intensity: number
): void {
  if (!ENABLED) return;

  const session = sessions.get(sessionId);
  if (session) {
    session.learningCaptured.emotionalPatterns++;
  }

  log.debug({ sessionId, emotion, intensity }, '🔬 [DIAG] Emotional pattern detected');
}

export function diagnosticSmallDetailExtracted(
  sessionId: string,
  detail: { type: string; value: string }
): void {
  if (!ENABLED) return;

  const session = sessions.get(sessionId);
  if (session) {
    session.learningCaptured.smallDetails++;
  }

  log.debug(
    { sessionId, detailType: detail.type, value: detail.value },
    '🔬 [DIAG] Small detail extracted'
  );
}

export function diagnosticLearningFinalized(
  sessionId: string,
  data: {
    keyMomentsCount: number;
    emotionalPatternsCount: number;
    insightsCount: number;
    smallDetailsCount: number;
  }
): void {
  if (!ENABLED) return;

  log.info(
    {
      sessionId,
      keyMoments: data.keyMomentsCount,
      emotionalPatterns: data.emotionalPatternsCount,
      insights: data.insightsCount,
      smallDetails: data.smallDetailsCount,
    },
    '🔬 [DIAG] Learning finalized for session'
  );
}

// ============================================================================
// HUMAN SIGNAL EXTRACTION
// ============================================================================

export function diagnosticHumanSignalsExtracted(
  sessionId: string,
  signals: {
    dates: number;
    values: number;
    dreams: number;
    fears: number;
    growth: number;
    comfort: number;
  }
): void {
  if (!ENABLED) return;

  const session = sessions.get(sessionId);
  if (session) {
    session.humanSignals = signals;
  }

  const totalSignals = Object.values(signals).reduce((a, b) => a + b, 0);

  if (totalSignals > 0) {
    log.info({ sessionId, signals, totalSignals }, '🔬 [DIAG] Human signals extracted!');
  } else {
    log.warn({ sessionId }, '🔬 [DIAG] No human signals extracted from conversation');
  }
}

// ============================================================================
// PROFILE PERSISTENCE
// ============================================================================

export function diagnosticApplyLearningToProfile(
  sessionId: string,
  before: { keyMoments: number; emotionalPatterns: number },
  after: { keyMoments: number; emotionalPatterns: number }
): void {
  if (!ENABLED) return;

  const added = {
    keyMoments: after.keyMoments - before.keyMoments,
    emotionalPatterns: after.emotionalPatterns - before.emotionalPatterns,
  };

  log.info({ sessionId, before, after, added }, '🔬 [DIAG] Learning applied to profile');
}

export function diagnosticProfileSaveAttempt(sessionId: string, profileId: string): void {
  if (!ENABLED) return;

  const session = sessions.get(sessionId);
  if (session) {
    session.saveAttempted = true;
  }

  log.info({ sessionId, profileId }, '🔬 [DIAG] Profile save attempted');
}

export function diagnosticProfileSaveSuccess(sessionId: string, profileId: string): void {
  if (!ENABLED) return;

  const session = sessions.get(sessionId);
  if (session) {
    session.saveSucceeded = true;
  }

  log.info({ sessionId, profileId }, '🔬 [DIAG] Profile save succeeded');
}

export function diagnosticProfileSaveError(sessionId: string, error: string): void {
  if (!ENABLED) return;

  const session = sessions.get(sessionId);
  if (session) {
    session.errors.push(`Save error: ${error}`);
  }

  log.error({ sessionId, error }, '🔬 [DIAG] Profile save FAILED');
}

// ============================================================================
// ERROR TRACKING
// ============================================================================

export function diagnosticError(sessionId: string, component: string, error: string): void {
  if (!ENABLED) return;

  const session = sessions.get(sessionId);
  if (session) {
    session.errors.push(`${component}: ${error}`);
  }

  log.error({ sessionId, component, error }, '🔬 [DIAG] Error in memory pipeline');
}

// ============================================================================
// DIAGNOSTIC API
// ============================================================================

export function getDiagnosticSummary(): {
  enabled: boolean;
  activeSessions: number;
  sessions: DiagnosticSession[];
} {
  return {
    enabled: ENABLED,
    activeSessions: sessions.size,
    sessions: Array.from(sessions.values()),
  };
}

export function isMemoryDiagnosticsEnabled(): boolean {
  return ENABLED;
}
