/**
 * Voice Agent Entry Orchestrator — session lifecycle management.
 *
 * Orchestrates all phases of a voice agent session:
 * 1. Load voice dependencies
 * 2. Parse metadata and build persona
 * 3. Connect to room
 * 4. Initialize session services (identity, calendar, FinOps, etc.)
 * 5. Create agent session (LLM, TTS, VAD, tools)
 * 6. Set up all event handlers and speak greeting
 * 7. Run until disconnect
 * 8. Cleanup
 *
 * @module agents/voice-agent-entry
 */

import type { JobContext } from '@livekit/agents';

// Event cleanup registry for proper memory management
import {
  createSessionCleanupTracker,
  runSessionCleanup,
} from '../session/event-cleanup-registry.js';

// Phase modules
import {
  buildUserAwareness,
  connectToRoom,
  getCachedVoiceDeps,
  loadVoiceDeps as loadVoiceDepsPhase,
  type VoiceDeps,
} from '../voice-agent/phases/index.js';

// FinOps cost tracking
import { finops } from '../../services/observability/finops.js';

// Speech coordination
import {
  cleanupSpeechCoordination,
  coordinatedSay,
  initializeSpeechCoordination,
} from '../../speech/coordination/index.js';

// Action confirmation dispatcher
import { clearActionDispatcher, initActionDispatcher } from '../realtime/action-event-dispatcher.js';

// Generate reply gateway
import {
  generateReply,
  prewarmSessionAsync,
  registerSessionForReconnection,
} from '../shared/generate-reply-gateway.js';

// Architecture violation fix: inject generateReply into semantic router
import { setGenerateReplyFunction } from '../../tools/semantic-router/integration/transcript-integration.js';

// Location preference - set active session for native tool fallback
import {
  clearCurrentActiveSession,
  setCurrentActiveSession,
} from '../../tools/domains/information/location-preference.js';

// Model provider abstraction
import { getModelProvider } from '../model-provider/index.js';

// Inject model provider into personas layer (architecture violation fix)
import { configureModelProvider } from '../../personas/bundles/model-provider-config.js';

// Submodule imports
import { parseJobMetadata, setupCallTypeContexts } from './metadata-parser.js';
import { buildSessionPersona } from './persona-builder.js';
import { createAgentSession } from './session-creator.js';
import { setupAllHandlers } from './handler-setup.js';
import { devStage, MULTI_AGENT_MODE } from './constants.js';
import type { FinOpsTier, SessionPhase } from './types.js';

// ============================================================================
// MODULE-LEVEL SIDE EFFECTS (executed once at import)
// ============================================================================

// Inject generateReply into semantic router at module load
setGenerateReplyFunction(generateReply);

// Inject model provider info into personas layer at module load
configureModelProvider(() => {
  const provider = getModelProvider();
  return {
    id: provider.id,
    logPrefix: provider.getLogPrefix(),
    promptModules: provider.getPromptModules(),
  };
});

// Log LLM provider at module load
const modelProvider = getModelProvider();
process.stderr.write(
  `[voice-agent-entry] ${modelProvider.getLogPrefix()} Using ${modelProvider.displayName}\n`
);

if (MULTI_AGENT_MODE) {
  process.stderr.write(
    `[voice-agent-entry] 🎭 MULTI_AGENT_MODE enabled - Using multi-agent orchestrator\n`
  );
} else {
  process.stderr.write(
    `[voice-agent-entry] ⚠️ MULTI_AGENT_MODE disabled - Handoffs will NOT update LLM persona!\n`
  );
}

// ============================================================================
// MODULE-LEVEL STATE
// ============================================================================

let cachedVoiceDeps: VoiceDeps | null = null;

async function loadVoiceDeps(): Promise<void> {
  if (cachedVoiceDeps) return;
  cachedVoiceDeps = await loadVoiceDepsPhase();
}

function getVoiceDeps(): VoiceDeps {
  if (!cachedVoiceDeps) {
    cachedVoiceDeps = getCachedVoiceDeps();
    if (!cachedVoiceDeps) {
      throw new Error('Voice deps not loaded - call loadVoiceDeps first');
    }
  }
  return cachedVoiceDeps;
}

// ============================================================================
// MAIN ENTRY FUNCTION
// ============================================================================

export async function runFullVoiceAgentEntry(ctx: JobContext): Promise<void> {
  const startTime = Date.now();
  const jobId = ctx.job.id;
  const roomName = ctx.job.room?.name || 'unknown';
  const sessionId = `session-${jobId}-${Date.now()}`;

  // Dynamic imports for on-demand modules
  const e2eDiagnostics = await import('../shared/e2e-diagnostics.js');
  const { e2e } = e2eDiagnostics;

  const lightweightResilience = await import('../shared/lightweight-resilience.js');
  const { withResilience, humanizeError } = lightweightResilience;

  const crashAnalyticsModule = await import('../shared/crash-analytics.js');
  const {
    registerSession,
    updateSessionState,
    unregisterSession,
    recordCrash,
  } = crashAnalyticsModule;

  // Register session immediately for crash tracking
  registerSession(sessionId, {
    sessionId,
    roomName,
    userId: undefined,
    personaId: undefined,
  });

  let currentPhase: SessionPhase = 'deps';
  e2e.childEntry(jobId);
  process.stderr.write(`[voice-agent-entry] Starting session pid=${process.pid}\n`);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let session: any = null;
  const cleanupHandlers: Array<() => void | Promise<void>> = [];
  const cleanupTracker = createSessionCleanupTracker(sessionId);

  // Forward-declared variables used across phases and in cleanup
  let userId: string | null = null;
  let personaId = 'ferni';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let services: any = null;
  let userData: Record<string, unknown> = {};
  let sessionPersona: import('../../personas/types.js').PersonaConfig | null = null;
  let voiceHumanization: { cleanup: (() => void) | undefined } | null = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let patternAnalyzer: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let autoOptimizer: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let feedbackCollector: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let dataChannelCleanup: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let handoffHandler: any;
  let musicCleanup: (() => void | Promise<void>) | undefined;
  let stopPeriodicSync: (() => void) | undefined;
  let isReturningUser = false;
  let finopsTier: FinOpsTier = 'free';
  let modelBaseInstructions = '';
  const sessionStartTime = new Date();

  try {
    // =========================================================================
    // STEP 1: LOAD VOICE DEPENDENCIES
    // =========================================================================
    devStage('voice_deps_loading');
    e2e.resourceLoading('voice-dependencies');
    const depsStart = Date.now();
    await withResilience(async () => loadVoiceDeps(), {
      maxRetries: 2,
      baseDelay: 1000,
      operationName: 'load-voice-deps',
    });
    e2e.resourceLoaded('voice-dependencies', Date.now() - depsStart);

    // =========================================================================
    // STEP 2: PARSE METADATA & BUILD PERSONA
    // =========================================================================
    devStage('persona_loading');
    currentPhase = 'persona';

    const parsed = parseJobMetadata(ctx);
    personaId = parsed.personaId;
    const { publisherId, callType, metadata } = parsed;

    // Set up call type-specific contexts (inbound, on-behalf, proactive)
    await setupCallTypeContexts(metadata, callType, sessionId, ctx.job.room?.name);

    // Build persona with defaults and load prompts
    const personaResult = await buildSessionPersona(personaId, e2e);
    sessionPersona = personaResult.sessionPersona;
    const { systemPrompt } = personaResult;
    modelBaseInstructions = personaResult.modelBaseInstructions;

    // =========================================================================
    // STEP 3 + 4: CONNECT TO ROOM + PRE-LOAD SESSION MODULES (OVERLAPPED)
    // =========================================================================
    // ⚡ OPTIMIZATION: Start importing Step 4 modules DURING room connection.
    // These imports don't need the room — they just load JS modules from disk.
    // This overlaps ~100-200ms of module loading with the ~545ms room connect.
    devStage('room_connecting');
    currentPhase = 'connect';
    e2e.sessionConnecting(roomName, ctx.job.participant?.identity || 'unknown');
    const connectStart = Date.now();

    // Start module imports in parallel with room connection
    const moduleImportsPromise = Promise.all([
      import('../voice-agent/user-identification-handler.js'),
      import('../voice-agent/session-init-handler.js'),
      import('../../tools/handoff/index.js'),
      import('../../services/conversation-manager.js'),
    ]);

    await withResilience(async () => connectToRoom(ctx), {
      maxRetries: 3,
      baseDelay: 500,
      maxDelay: 5000,
      operationName: 'room-connect',
      onBeforeRetry: async () => {
        await ctx.room.disconnect();
      },
    });
    e2e.sessionConnected(
      jobId,
      roomName,
      ctx.room.localParticipant?.identity || 'agent',
      Date.now() - connectStart
    );

    // =========================================================================
    // STEP 4: INITIALIZE SESSION SERVICES
    // =========================================================================
    devStage('session_services', 'context');
    currentPhase = 'services';
    process.stderr.write(`[voice-agent-entry] 📦 Initializing session services...\n`);

    // Await the module imports (likely already resolved during room connect)
    const [
      { identifyUser },
      { initializeSession },
      { initializeHandoffContext, handoffEvents: _handoffEvents },
      { getConversationManager },
    ] = await moduleImportsPromise;

    const { userId: identifiedUserId, userName, userAccent } = await identifyUser({
      jobMetadata: ctx.job.metadata,
      room: ctx.room,
      sessionId,
    });
    userId = identifiedUserId ?? null;

    // Update crash analytics with user context
    updateSessionState(sessionId, { state: 'active' });
    registerSession(sessionId, {
      sessionId,
      roomName,
      userId: userId || undefined,
      personaId: sessionPersona.id,
    });

    // Initialize session services
    const initResult = await initializeSession({
      sessionId,
      userId: userId ?? undefined,
      userName,
      userAccent,
      sessionPersona,
      room: ctx.room,
      publisherId,
    });

    services = initResult.services;
    isReturningUser = initResult.isReturningUser;
    userData = initResult.userData;
    stopPeriodicSync = initResult.stopPeriodicSync ?? undefined;

    if (stopPeriodicSync) {
      cleanupHandlers.push(stopPeriodicSync);
    }

    // CRITICAL FIX: Set personaId on userData for TTS wrapper
    userData.personaId = sessionPersona.id;

    // Initialize handoff context
    const customData = services.userProfile?.customData as Record<string, unknown> | undefined;
    initializeHandoffContext({
      meetingCounts:
        services.userProfile?.humanizingState?.perPersonaMeetingCounts ||
        (customData?.meetingCounts as Record<string, number> | undefined),
      lastTopics:
        services.userProfile?.humanizingState?.perPersonaLastTopic ||
        (customData?.lastTopicsPerPersona as Record<string, string> | undefined),
    });

    // Comprehensive identity diagnostics
    try {
      const { logDiagnostics, generateDiagnostics } =
        await import('../../services/identity/identity-error-handler.js');
      logDiagnostics(userId ?? undefined, services.userProfile ?? null, sessionId);
      const diagnostics = generateDiagnostics(userId ?? undefined, services.userProfile ?? null);
      process.stderr.write(
        `[voice-agent-entry] 📦 Services initialized (userId: ${userId || 'anonymous'}, returning: ${isReturningUser})\n`
      );
      process.stderr.write(
        `[voice-agent-entry] 🔍 IDENTITY DIAGNOSTICS:\n` +
          `  - userId: ${userId || 'MISSING!'}\n` +
          `  - userIdFormat: ${diagnostics.userIdFormat}\n` +
          `  - hasProfile: ${diagnostics.hasProfile ? 'YES' : 'NO!'}\n` +
          `  - hasName: ${diagnostics.hasName ? `YES (${services.userProfile?.name || services.userProfile?.preferredName || userName})` : 'NO!'}\n` +
          `  - hasVoiceSketch: ${diagnostics.hasVoiceSketch ? 'YES (cross-device ready)' : 'NO'}\n` +
          `  - isReturningUser: ${diagnostics.isReturningUser}\n` +
          `  - totalConversations: ${diagnostics.totalConversations}\n` +
          `  - onboardingComplete: ${diagnostics.onboardingComplete}\n` +
          `  - lastConversationSummary: ${services.userProfile?.lastConversationSummary ? `YES (${services.userProfile.lastConversationSummary.slice(0, 40)}...)` : 'NO!'}\n` +
          `  - lastContact: ${services.userProfile?.lastContact || 'NEVER'}\n` +
          `  - issues: ${diagnostics.issues.length > 0 ? diagnostics.issues.join(', ') : 'NONE ✅'}\n`
      );
    } catch {
      process.stderr.write(
        `[voice-agent-entry] 📦 Services initialized (userId: ${userId || 'anonymous'}, returning: ${isReturningUser})\n`
      );
    }

    // User awareness injection
    const userAwarenessResult = buildUserAwareness({
      userProfile: services.userProfile,
      isReturningUser,
      userName,
      sessionStartTime,
    });
    if (userAwarenessResult.facts.length > 0) {
      modelBaseInstructions += userAwarenessResult.instructionsBlock;
      process.stderr.write(
        `[voice-agent-entry] 👤 BETTER THAN HUMAN - User awareness injected (${userAwarenessResult.facts.length} facts):\n`
      );
      userAwarenessResult.facts.forEach((fact: string, i: number) => {
        process.stderr.write(`[voice-agent-entry]   ${i + 1}. ${fact}\n`);
      });
    } else {
      process.stderr.write(
        `[voice-agent-entry] 👤 No user awareness facts available (new user or empty profile)\n`
      );
    }

    // Calendar awareness (non-blocking)
    if (services.userProfile && userId) {
      void (async () => {
        try {
          const { getAmbientCalendarContext } =
            await import('../../services/calendar/ambient-calendar-awareness.js');
          const calendarContext = await getAmbientCalendarContext(userId!);
          if (calendarContext.isCalendarConnected) {
            const calendarAwareness: string[] = [];
            if (calendarContext.nextMeeting.event && calendarContext.nextMeeting.minutesUntil !== null) {
              const minutes = calendarContext.nextMeeting.minutesUntil;
              const meetingTitle = calendarContext.nextMeeting.event.title;
              if (minutes <= 15) {
                calendarAwareness.push(`⏰ They have "${meetingTitle}" in ${minutes} minutes - be mindful of time.`);
              } else if (minutes <= 60) {
                calendarAwareness.push(`📅 They have "${meetingTitle}" in about ${Math.round(minutes / 15) * 15} minutes.`);
              }
            }
            if (calendarContext.justEndedMeeting.event && calendarContext.justEndedMeeting.minutesSince !== null) {
              const minutes = calendarContext.justEndedMeeting.minutesSince;
              if (minutes <= 15) {
                calendarAwareness.push(`💬 They just finished "${calendarContext.justEndedMeeting.event.title}" - could be a natural topic.`);
              }
            }
            if (calendarContext.remainingMeetingsToday >= 4) {
              calendarAwareness.push(`📊 They have ${calendarContext.remainingMeetingsToday} more meetings today - busy day.`);
            }
            if (calendarAwareness.length > 0) {
              userData.calendarAwareness = calendarAwareness.join(' ');
              process.stderr.write(`[voice-agent-entry] 📅 Calendar awareness loaded (${calendarAwareness.length} insights)\n`);
            }
          }
        } catch (calErr) {
          process.stderr.write(`[voice-agent-entry] 📅 Calendar fetch failed (non-critical): ${String(calErr)}\n`);
        }
      })();
    }

    // Voice verification for inbound calls
    if (callType === 'inbound_call' && metadata.isKnownCaller && services.userProfile?.voiceSketch) {
      try {
        const { registerForVoiceVerification, shouldSetupVoiceVerification } =
          await import('../../services/voice/inbound-voice-verification.js');
        const verificationCheck = shouldSetupVoiceVerification(services.userProfile, true, metadata.isKnownCaller as boolean);
        if (verificationCheck.shouldSetup && verificationCheck.voiceSketch) {
          registerForVoiceVerification(sessionId, userId || '', verificationCheck.userName || (metadata.callerName as string) || 'the caller', verificationCheck.voiceSketch);
          const { cleanupVoiceVerification } = await import('../../services/voice/inbound-voice-verification.js');
          cleanupHandlers.push(() => cleanupVoiceVerification(sessionId));
        }
      } catch (voiceVerifyErr) {
        process.stderr.write(`[voice-agent-entry] ⚠️ Voice verification setup failed (non-fatal): ${String(voiceVerifyErr)}\n`);
      }
    }

    // Thread continuity (non-blocking)
    if (userId) {
      void (async () => {
        try {
          const { buildThreadContext } =
            await import('../../intelligence/context-builders/session/thread-context.js');
          const threadContext = await buildThreadContext(
            userId!,
            personaId as import('../../personas/types.js').PersonaId,
            { sessionId, fromNotification: metadata.fromNotification === true }
          );
          if (threadContext) {
            userData.threadContext = threadContext.content;
            userData.threadId = threadContext.threadId;
            userData.isOutreachResponse = threadContext.isOutreachResponse;
            process.stderr.write(`[voice-agent-entry] 🧵 Thread context loaded (threadId: ${threadContext.threadId || 'new'})\n`);
          }
          // Initialize thread recording
          try {
            const { initializeThreadRecording, cleanupThreadRecording } =
              await import('../../services/conversation-thread/thread-recorder.js');
            const threadInit = await initializeThreadRecording(
              userId!,
              sessionId,
              personaId as import('../../personas/types.js').PersonaId,
              { existingThreadId: userData.threadId as string | undefined, isOutreachResponse: userData.isOutreachResponse as boolean | undefined }
            );
            userData.threadId = threadInit.threadId;
            cleanupHandlers.push(() => { cleanupThreadRecording(sessionId); });
          } catch (threadRecordErr) {
            process.stderr.write(`[voice-agent-entry] 🧵 Thread recording init failed (non-critical): ${String(threadRecordErr)}\n`);
          }
        } catch (threadErr) {
          process.stderr.write(`[voice-agent-entry] 🧵 Thread context fetch failed (non-critical): ${String(threadErr)}\n`);
        }
      })();
    }

    // FinOps cost tracking
    const userSubTier = services.userProfile?.subscription?.tier || 'free';
    finopsTier = userSubTier === 'partner' ? 'partner' : userSubTier === 'friend' ? 'friend' : 'free';
    finops.startSession({ sessionId, userId: userId ?? undefined, tier: finopsTier });
    process.stderr.write(`[voice-agent-entry] FinOps tracking started (tier: ${finopsTier})\n`);

    // Register session with SessionDataManager
    if (userId) {
      try {
        const { getSessionDataManager } = await import('../../services/session-data-manager.js');
        getSessionDataManager().sessionStarted(userId);
      } catch { /* non-fatal */ }
    }

    // Performance optimizations
    try {
      const perfModule = await import('../shared/performance/index.js');
      await perfModule.initializePerformanceOptimizations({
        userId: userId || 'anonymous',
        personaId,
        sessionId,
        enablePubSub: process.env.PUBSUB_ENABLED === 'true',
        enableSpeculativeTTS: true,
        enableBatchedAnalysis: false,
        enableParallelMemory: true,
        enableContextCache: true,
        enableProfiling: true,
      });
      cleanupHandlers.push(async () => {
        try {
          const summary = await perfModule.getPerformanceSummary();
          if (summary) {
            process.stderr.write(`[voice-agent-entry] 📊 Performance summary: ${JSON.stringify(summary.turnProfiling || {})}\n`);
          }
          perfModule.resetPerformanceOptimizations();
        } catch { /* ignore */ }
      });
    } catch (perfErr) {
      process.stderr.write(`[voice-agent-entry] ⚠️ Performance optimizations failed (non-fatal): ${perfErr}\n`);
    }

    // =========================================================================
    // STEP 5: CREATE SESSION
    // =========================================================================
    devStage('session_creation');
    currentPhase = 'session';
    e2e.resourceLoading('agent-session');
    const sessionStart = Date.now();

    const voiceDeps = getVoiceDeps();
    const sessionResult = await createAgentSession({
      sessionId,
      sessionPersona,
      systemPrompt,
      modelBaseInstructions,
      userId,
      userAccent,
      userData,
      services,
      voiceDeps,
      roomMetadata: ctx.job.room?.metadata,
      metadata,
      subscriptionTier: finopsTier === 'partner' ? 'partner' : finopsTier === 'friend' ? 'friend' : 'free',
      cleanupHandlers,
    });

    session = sessionResult.session;
    const { agent, voiceAgentRef, directorAudioRouter, toolCount, toolLoadMode } = sessionResult;

    e2e.resourceLoaded('agent-session', Date.now() - sessionStart);
    e2e.sessionStarted(jobId, sessionPersona.id);

    // Speech coordination
    initializeSpeechCoordination({ session, sessionId, personaId: sessionPersona.id, userId: userId ?? undefined });
    cleanupHandlers.push(() => cleanupSpeechCoordination(sessionId));

    // Prewarm session for faster first response
    prewarmSessionAsync(session, sessionId);

    // Register session for reconnection
    registerSessionForReconnection(sessionId, session);

    // Set active session for native tool location fallback
    setCurrentActiveSession(userId || 'anonymous', undefined, sessionId);

    // Action dispatcher
    if (userId && session) {
      try {
        initActionDispatcher({ session, sessionId, userId });
        cleanupHandlers.push(() => {
          try { clearActionDispatcher(sessionId); } catch { /* ignore */ }
        });
      } catch (dispatcherErr) {
        process.stderr.write(`[voice-agent-entry] ⚠️ Action dispatcher failed (non-fatal): ${dispatcherErr}\n`);
      }
    }

    // =========================================================================
    // STEP 6: SET UP ALL HANDLERS
    // =========================================================================
    devStage('handlers_setup');
    currentPhase = 'handlers';
    process.stderr.write(`[voice-agent-entry] 🔌 Setting up handlers...\n`);

    const handlersResult = await setupAllHandlers({
      ctx,
      session,
      agent,
      voiceAgentRef,
      sessionPersona,
      userId,
      sessionId,
      services,
      userData,
      isReturningUser,
      userName: userName ?? null,
      cleanupHandlers,
      cleanupTracker,
      directorAudioRouter,
      sessionTools: sessionResult.sessionTools,
      toolCount,
      voiceHumanization: null,
      modelBaseInstructions,
      subscriptionTier: finopsTier === 'partner' ? 'partner' : finopsTier === 'friend' ? 'friend' : 'free',
      stopPeriodicSync,
    });

    // Check for multi-agent mode activation (null sentinel)
    if (!handlersResult) {
      return; // Multi-agent mode took over
    }

    patternAnalyzer = handlersResult.patternAnalyzer;
    autoOptimizer = handlersResult.autoOptimizer;
    feedbackCollector = handlersResult.feedbackCollector;
    dataChannelCleanup = handlersResult.dataChannelCleanup;
    handoffHandler = handlersResult.handoffHandler;
    musicCleanup = handlersResult.musicCleanup;

    process.stderr.write(
      `[voice-agent-entry] ✅ Session fully initialized in ${Date.now() - startTime}ms!\n`
    );

    // =========================================================================
    // STEP 8: RUN UNTIL DISCONNECT
    // =========================================================================
    devStage('session_running');
    currentPhase = 'running';

    // Monitor connection state
    const connectionStateHandler = (state: unknown) => {
      process.stderr.write(`[voice-agent-entry] 🔌 Connection state: ${state}\n`);
    };
    ctx.room.on('connectionStateChanged', connectionStateHandler);
    cleanupTracker.register('event', 'room.connectionStateChanged', () => {
      ctx.room.off('connectionStateChanged', connectionStateHandler);
    });

    const reconnectingHandler = () => {
      process.stderr.write(`[voice-agent-entry] 🔌 Reconnecting...\n`);
    };
    ctx.room.on('reconnecting', reconnectingHandler);
    cleanupTracker.register('event', 'room.reconnecting', () => {
      ctx.room.off('reconnecting', reconnectingHandler);
    });

    const reconnectedHandler = () => {
      process.stderr.write(`[voice-agent-entry] 🔌 Reconnected!\n`);
    };
    ctx.room.on('reconnected', reconnectedHandler);
    cleanupTracker.register('event', 'room.reconnected', () => {
      ctx.room.off('reconnected', reconnectedHandler);
    });

    // Wait for disconnect
    await new Promise<void>((resolve) => {
      ctx.room.on('disconnected', (reason?: unknown) => {
        const disconnectReason = String(reason || 'unknown');
        const sessionDurationMs = Date.now() - startTime;

        void (async () => {
          try {
            const { logDisconnect, analyzeDisconnect } = await import('../shared/disconnect-diagnostics.js');
            const { recordConnectionDrop } = await import('../shared/crash-analytics.js');
            const participantCount = ctx.room.remoteParticipants?.size ?? 0;
            logDisconnect({
              sessionId, roomName, reason: disconnectReason, durationMs: sessionDurationMs,
              turnCount: session?.turnCount, participantCount: participantCount + 1,
              wasActive: sessionDurationMs > 30000, userId: userId ?? undefined, personaId: sessionPersona?.id,
            });
            const analysis = analyzeDisconnect({ sessionId, roomName, reason: disconnectReason, durationMs: sessionDurationMs });
            recordConnectionDrop(sessionId, disconnectReason, analysis.wasGraceful);
          } catch (e) {
            process.stderr.write(`[voice-agent-entry] 🔌 Disconnected (reason: ${disconnectReason}, duration: ${sessionDurationMs}ms)\n`);
          }
        })();

        resolve();
      });
    });

    e2e.sessionEnded(jobId, 'disconnected', Date.now() - startTime);

    // FinOps end-of-session
    const sessionDurationMs = Date.now() - startTime;
    const sessionDurationMinutes = sessionDurationMs / 60000;
    finops.recordLiveKitCost({ durationMinutes: sessionDurationMinutes, userId: userId ?? undefined, sessionId, tier: finopsTier });
    const finopsSession = finops.endSession(sessionId);
    if (finopsSession) {
      process.stderr.write(
        `[voice-agent-entry] 💰 FinOps: Session cost $${finopsSession.totalCost.toFixed(4)} (${sessionDurationMinutes.toFixed(1)} min, tier: ${finopsSession.tier})\n`
      );
    }

    // Cleanup
    process.stderr.write(`[voice-agent-entry] 🧹 Running event cleanup registry...\n`);
    const registryResult = await runSessionCleanup(sessionId);
    process.stderr.write(
      `[voice-agent-entry] 🧹 Registry cleanup: ${registryResult.cleaned} cleaned, ${registryResult.errors} errors, ${registryResult.totalDurationMs}ms\n`
    );

    clearCurrentActiveSession();

    process.stderr.write(`[voice-agent-entry] 🧹 Running cleanup handlers...\n`);
    const { handleSessionCleanup } = await import('../voice-agent/cleanup-handler.js');
    await handleSessionCleanup({
      sessionId,
      userId: userId ?? undefined,
      services,
      sessionPersona,
      voiceHumanization,
      utilitiesCleanup: undefined,
      patternAnalyzer,
      autoOptimizer,
      feedbackCollector,
      dataChannelCleanup,
      handoffHandler,
      cameoCleanup: undefined,
      musicCleanup,
      userData,
      stopPeriodicSync,
    });

    for (const cleanup of cleanupHandlers) {
      try { await cleanup(); } catch { /* ignore */ }
    }

    process.stderr.write(`[voice-agent-entry] Session ended cleanly.\n`);
    unregisterSession(sessionId, 'clean_exit');
  } catch (error) {
    const errObj = error instanceof Error ? error : new Error(String(error));
    e2e.captureError('SESSION', errObj, { jobId, roomName, phase: currentPhase });
    process.stderr.write(`[voice-agent-entry] ERROR in phase ${currentPhase}: ${error}\n`);

    recordCrash('uncaught_exception', errObj, sessionId, { roomName, connectionState: currentPhase });

    // AI diagnosis (best-effort)
    try {
      const selfHealing = await import('../../services/self-healing/index.js');
      const diagnosis = await selfHealing.analyzeFailure([errObj.message, errObj.stack || ''], {
        jobId,
        stage: currentPhase === 'deps' || currentPhase === 'persona' ? 'entry' : 'session',
        timing: { totalMs: Date.now() - startTime },
        errorType: errObj.name,
        errorMessage: errObj.message,
      });
      e2e.custom('DIAGNOSIS', `AI analysis for session ${jobId}`, {
        phase: currentPhase,
        rootCause: diagnosis.rootCause,
        confidence: diagnosis.confidence,
        autoFixable: diagnosis.autoFixable,
      });
      if (session && ctx.room.isConnected && diagnosis.humanExplanation) {
        const humanized = humanizeError(errObj);
        if (humanized.shouldNotifyUser) {
          try { coordinatedSay(sessionId, humanized.userMessage, { allowInterruptions: true }); } catch { /* can't speak */ }
        }
      }
    } catch { /* diagnosis is best-effort */ }

    // Cleanup on error
    try {
      const registryResult = await runSessionCleanup(sessionId);
      process.stderr.write(`[voice-agent-entry] 🧹 Registry cleanup on error: ${registryResult.cleaned} cleaned\n`);
    } catch { /* ignore */ }

    for (const cleanup of cleanupHandlers) {
      try { await cleanup(); } catch { /* ignore */ }
    }

    // Keep room connected if possible
    try {
      if (!ctx.room.isConnected) await ctx.connect();
      await new Promise<void>((resolve) => {
        ctx.room.on('disconnected', () => resolve());
      });
    } catch { /* ignore */ }

    unregisterSession(sessionId, `crash_in_${currentPhase}`);
  }
}
