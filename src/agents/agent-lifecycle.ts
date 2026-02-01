/**
 * Agent Lifecycle Management
 *
 * Handles session lifecycle events including:
 * - FinOps cost tracking
 * - Performance optimization initialization
 * - Session data management
 * - Cleanup handlers
 *
 * @module agents/agent-lifecycle
 */

import { finops } from '../services/observability/finops.js';

// ============================================================================
// TYPES
// ============================================================================

export interface SessionContext {
  sessionId: string;
  userId: string | null;
  personaId: string;
  roomName: string;
}

export interface FinOpsConfig {
  sessionId: string;
  userId: string | null | undefined;
  tier: 'free' | 'friend' | 'partner';
}

export interface PerformanceOptConfig {
  userId: string;
  personaId: string;
  sessionId: string;
  enablePubSub: boolean;
  enableSpeculativeTTS: boolean;
  enableBatchedAnalysis: boolean;
  enableParallelMemory: boolean;
  enableContextCache: boolean;
  enableProfiling: boolean;
}

export type CleanupHandler = () => void | Promise<void>;

// ============================================================================
// FINOPS COST TRACKING
// ============================================================================

/**
 * Starts FinOps cost tracking for a session.
 */
export function startFinOpsTracking(config: FinOpsConfig): void {
  finops.startSession({
    sessionId: config.sessionId,
    userId: config.userId ?? undefined,
    tier: config.tier,
  });
  process.stderr.write(`[agent-lifecycle] FinOps tracking started (tier: ${config.tier})\n`);
}

/**
 * Determines FinOps tier from user subscription.
 */
export function determineFinOpsTier(subscriptionTier?: string): 'free' | 'friend' | 'partner' {
  if (subscriptionTier === 'partner') return 'partner';
  if (subscriptionTier === 'friend') return 'friend';
  return 'free';
}

/**
 * Ends FinOps tracking and records final costs.
 */
export function endFinOpsTracking(
  sessionId: string,
  userId: string | null | undefined,
  tier: 'free' | 'friend' | 'partner',
  sessionDurationMs: number
): void {
  const sessionDurationMinutes = sessionDurationMs / 60000;

  finops.recordLiveKitCost({
    durationMinutes: sessionDurationMinutes,
    userId: userId ?? undefined,
    sessionId,
    tier,
  });

  const finopsSession = finops.endSession(sessionId);
  if (finopsSession) {
    process.stderr.write(
      `[agent-lifecycle] 💰 FinOps: Session cost $${finopsSession.totalCost.toFixed(4)} ` +
        `(${sessionDurationMinutes.toFixed(1)} min, tier: ${finopsSession.tier})\n`
    );
  }
}

// ============================================================================
// PERFORMANCE OPTIMIZATION
// ============================================================================

/**
 * Initializes performance optimizations for the session.
 * Returns cleanup handler if successful.
 */
export async function initializePerformanceOptimizations(
  config: PerformanceOptConfig
): Promise<CleanupHandler | null> {
  try {
    const perfModule = await import('./shared/performance/index.js');
    await perfModule.initializePerformanceOptimizations({
      userId: config.userId,
      personaId: config.personaId,
      sessionId: config.sessionId,
      enablePubSub: config.enablePubSub,
      enableSpeculativeTTS: config.enableSpeculativeTTS,
      // NOTE: batchedAnalysis is disabled by default at call sites (voice-agent-entry.ts)
      // because it makes redundant LLM calls that the turn processor already handles.
      enableBatchedAnalysis: config.enableBatchedAnalysis,
      enableParallelMemory: config.enableParallelMemory,
      enableContextCache: config.enableContextCache,
      enableProfiling: config.enableProfiling,
    });

    process.stderr.write(
      `[agent-lifecycle] 🚀 Performance optimizations initialized (pubsub: ${config.enablePubSub})\n`
    );

    // Return cleanup handler
    return async () => {
      try {
        const summary = await perfModule.getPerformanceSummary();
        if (summary) {
          process.stderr.write(
            `[agent-lifecycle] 📊 Performance summary: ${JSON.stringify(summary.turnProfiling || {})}\n`
          );
        }
        perfModule.resetPerformanceOptimizations();
      } catch {
        /* ignore cleanup errors */
      }
    };
  } catch (perfErr) {
    process.stderr.write(
      `[agent-lifecycle] ⚠️ Performance optimizations failed (non-fatal): ${perfErr}\n`
    );
    return null;
  }
}

// ============================================================================
// SESSION DATA MANAGEMENT
// ============================================================================

/**
 * Registers a session with the SessionDataManager for proper cache cleanup.
 * Critical for preventing memory leaks.
 */
export async function registerSessionWithDataManager(userId: string): Promise<void> {
  try {
    const { getSessionDataManager } = await import('../services/session-data-manager.js');
    getSessionDataManager().sessionStarted(userId);
  } catch {
    // SessionDataManager may not be initialized - non-fatal
  }
}

// ============================================================================
// VOICE VERIFICATION SETUP
// ============================================================================

export interface VoiceVerificationConfig {
  sessionId: string;
  userId: string | null | undefined;
  // Use unknown for userProfile to avoid tight coupling with UserProfile type
  userProfile: unknown;
  callerName?: string;
  isKnownCaller: boolean;
}

/**
 * Sets up voice verification for inbound calls when the caller has a voice sketch.
 * Returns cleanup handler if verification was set up.
 */
export async function setupVoiceVerification(
  config: VoiceVerificationConfig
): Promise<CleanupHandler | null> {
  const profile = config.userProfile as { voiceSketch?: { confidence: number } } | null;
  if (!profile?.voiceSketch) {
    return null;
  }

  try {
    const { registerForVoiceVerification, shouldSetupVoiceVerification, cleanupVoiceVerification } =
      await import('../services/voice/inbound-voice-verification.js');

    const verificationCheck = shouldSetupVoiceVerification(
      config.userProfile as Parameters<typeof shouldSetupVoiceVerification>[0],
      true, // isInboundCall
      config.isKnownCaller
    );

    if (verificationCheck.shouldSetup && verificationCheck.voiceSketch) {
      registerForVoiceVerification(
        config.sessionId,
        config.userId || '',
        verificationCheck.userName || config.callerName || 'the caller',
        verificationCheck.voiceSketch
      );

      process.stderr.write(
        `[agent-lifecycle] 🎤 Voice verification registered for inbound call ` +
          `(expected: ${verificationCheck.userName || 'known caller'}, ` +
          `sketch confidence: ${verificationCheck.voiceSketch.confidence.toFixed(2)})\n`
      );

      return () => cleanupVoiceVerification(config.sessionId);
    }

    return null;
  } catch (voiceVerifyErr) {
    process.stderr.write(
      `[agent-lifecycle] ⚠️ Voice verification setup failed (non-fatal): ${String(voiceVerifyErr)}\n`
    );
    return null;
  }
}

// ============================================================================
// CALENDAR AWARENESS
// ============================================================================

export interface CalendarAwarenessConfig {
  userId: string;
  userData: { calendarAwareness?: string };
}

/**
 * Fetches calendar context in background and updates userData.
 * Non-blocking - returns immediately.
 */
export function fetchCalendarAwarenessAsync(config: CalendarAwarenessConfig): void {
  void (async () => {
    try {
      const { getAmbientCalendarContext } =
        await import('../services/calendar/ambient-calendar-awareness.js');
      const calendarContext = await getAmbientCalendarContext(config.userId);

      if (!calendarContext.isCalendarConnected) {
        process.stderr.write(
          `[agent-lifecycle] 📅 Calendar not connected for user ${config.userId}\n`
        );
        return;
      }

      const calendarAwareness: string[] = [];

      // Next meeting awareness
      if (calendarContext.nextMeeting.event && calendarContext.nextMeeting.minutesUntil !== null) {
        const minutes = calendarContext.nextMeeting.minutesUntil;
        const meetingTitle = calendarContext.nextMeeting.event.title;

        if (minutes <= 15) {
          calendarAwareness.push(
            `⏰ They have "${meetingTitle}" in ${minutes} minutes - be mindful of time.`
          );
        } else if (minutes <= 60) {
          calendarAwareness.push(
            `📅 They have "${meetingTitle}" in about ${Math.round(minutes / 15) * 15} minutes.`
          );
        }
      }

      // Just ended meeting (great for follow-up)
      if (
        calendarContext.justEndedMeeting.event &&
        calendarContext.justEndedMeeting.minutesSince !== null
      ) {
        const minutes = calendarContext.justEndedMeeting.minutesSince;
        const meetingTitle = calendarContext.justEndedMeeting.event.title;

        if (minutes <= 15) {
          calendarAwareness.push(
            `💬 They just finished "${meetingTitle}" - could be a natural topic.`
          );
        }
      }

      // Busy day awareness
      if (calendarContext.remainingMeetingsToday >= 4) {
        calendarAwareness.push(
          `📊 They have ${calendarContext.remainingMeetingsToday} more meetings today - busy day.`
        );
      }

      if (calendarAwareness.length > 0) {
        config.userData.calendarAwareness = calendarAwareness.join(' ');
        process.stderr.write(
          `[agent-lifecycle] 📅 BETTER THAN HUMAN - Calendar awareness loaded (${calendarAwareness.length} insights):\n`
        );
        calendarAwareness.forEach((insight, i) => {
          process.stderr.write(`[agent-lifecycle]   ${i + 1}. ${insight}\n`);
        });
      } else {
        process.stderr.write(`[agent-lifecycle] 📅 Calendar connected but no relevant insights\n`);
      }
    } catch (calErr) {
      process.stderr.write(
        `[agent-lifecycle] 📅 Calendar fetch failed (non-critical): ${String(calErr)}\n`
      );
    }
  })();
}

// ============================================================================
// THREAD CONTINUITY
// ============================================================================

export interface ThreadContinuityConfig {
  userId: string;
  sessionId: string;
  personaId: string;
  fromNotification: boolean;
  userData: {
    threadContext?: string;
    threadId?: string;
    isOutreachResponse?: boolean;
  };
  cleanupHandlers: CleanupHandler[];
}

/**
 * Builds thread context for cross-channel continuity.
 * Non-blocking - runs in background.
 */
export function fetchThreadContextAsync(config: ThreadContinuityConfig): void {
  void (async () => {
    try {
      const { buildThreadContext } =
        await import('../intelligence/context-builders/session/thread-context.js');
      const threadContext = await buildThreadContext(
        config.userId,
        config.personaId as import('../personas/types.js').PersonaId,
        {
          sessionId: config.sessionId,
          fromNotification: config.fromNotification,
        }
      );

      if (threadContext) {
        config.userData.threadContext = threadContext.content;
        config.userData.threadId = threadContext.threadId;
        config.userData.isOutreachResponse = threadContext.isOutreachResponse;

        process.stderr.write(
          `[agent-lifecycle] 🧵 THREAD CONTEXT - Cross-channel continuity enabled:\n` +
            `  - threadId: ${threadContext.threadId || 'new'}\n` +
            `  - isOutreachResponse: ${threadContext.isOutreachResponse}\n` +
            `  - priority: ${threadContext.priority}\n`
        );

        // Initialize thread recording
        await initializeThreadRecording(config);
      } else {
        process.stderr.write(`[agent-lifecycle] 🧵 No active thread context for user\n`);
      }
    } catch (threadErr) {
      process.stderr.write(
        `[agent-lifecycle] 🧵 Thread context fetch failed (non-critical): ${String(threadErr)}\n`
      );
    }
  })();
}

async function initializeThreadRecording(config: ThreadContinuityConfig): Promise<void> {
  try {
    const { initializeThreadRecording, cleanupThreadRecording } =
      await import('../services/conversation-thread/thread-recorder.js');
    const threadInit = await initializeThreadRecording(
      config.userId,
      config.sessionId,
      config.personaId as import('../personas/types.js').PersonaId,
      {
        existingThreadId: config.userData.threadId,
        isOutreachResponse: config.userData.isOutreachResponse,
      }
    );

    config.userData.threadId = threadInit.threadId;

    config.cleanupHandlers.push(() => {
      cleanupThreadRecording(config.sessionId);
    });

    process.stderr.write(
      `[agent-lifecycle] 🧵 Thread recording initialized (threadId: ${threadInit.threadId}, isNew: ${threadInit.isNew})\n`
    );
  } catch (threadRecordErr) {
    process.stderr.write(
      `[agent-lifecycle] 🧵 Thread recording init failed (non-critical): ${String(threadRecordErr)}\n`
    );
  }
}

// ============================================================================
// PARALLEL NON-CRITICAL SERVICES
// ============================================================================

export interface ParallelServicesConfig {
  sessionId: string;
  userId: string | null | undefined;
  personaId: string;
  // Use unknown for userProfile to avoid tight coupling with UserProfile type
  userProfile: unknown;
  room: {
    localParticipant?: {
      publishData: (data: Uint8Array, opts: { reliable: boolean }) => Promise<void>;
    };
  };
}

/**
 * Initializes parallel non-critical services.
 * All services are fire-and-forget.
 */
export async function initializeParallelServices(config: ParallelServicesConfig): Promise<void> {
  await Promise.allSettled([
    // Engagement data sender
    (async () => {
      try {
        const mod = await import('../services/engagement-data-sender.js');
        const engagementDataSender = mod.getEngagementDataSender();
        engagementDataSender.setRoom(
          config.room as Parameters<typeof engagementDataSender.setRoom>[0]
        );
        if (config.userId) {
          await engagementDataSender.sendEngagementData(config.userId);
        }
      } catch {
        // Non-critical
      }
    })(),

    // Cognitive session start
    (async () => {
      try {
        const { onCognitiveSessionStart } = await import('../services/cognitive-session-hooks.js');
        await onCognitiveSessionStart({
          userId: config.userId || 'anonymous',
          personaId: config.personaId,
          userProfile: config.userProfile as Parameters<
            typeof onCognitiveSessionStart
          >[0]['userProfile'],
          sessionId: config.sessionId,
        });
      } catch {
        // Non-critical
      }
    })(),

    // Game engine initialization
    (async () => {
      try {
        const { getSessionGameEngine } = await import('../services/games/index.js');
        const engine = getSessionGameEngine(config.sessionId, config.personaId);
        if (config.userId) {
          await engine.initializeForUser(config.userId);
        }
      } catch {
        // Non-critical
      }
    })(),
  ]);
}

// ============================================================================
// CONVERSATION HUMANIZATION INIT
// ============================================================================

export interface HumanizationInitConfig {
  sessionId: string;
  userId: string;
  personaId: string;
  sessionCount?: number;
  relationshipStage?: 'stranger' | 'acquaintance' | 'friend' | 'trusted_advisor';
  userProfile?: { humanMemory?: unknown };
}

/**
 * Initializes unified conversation humanization.
 */
export async function initializeConversationHumanization(
  config: HumanizationInitConfig
): Promise<void> {
  try {
    const { initConversationSession } =
      await import('./integrations/conversation-session-integration.js');
    const conversationSession = await initConversationSession({
      sessionId: config.sessionId,
      userId: config.userId,
      personaId: config.personaId,
      sessionCount: config.sessionCount,
      relationshipStage: config.relationshipStage,
      userProfile: config.userProfile ? { humanMemory: config.userProfile.humanMemory } : undefined,
    });

    if (conversationSession) {
      process.stderr.write(`[agent-lifecycle] 🎭 Unified conversation session initialized\n`);
    }

    // Load persisted humanization data
    const { initializeFromPersistence } =
      await import('../conversation/humanization/persistence.js');
    await initializeFromPersistence(config.userId, config.sessionId);
  } catch (humanizationErr) {
    process.stderr.write(`[agent-lifecycle] Humanization init (non-fatal): ${humanizationErr}\n`);
  }
}
