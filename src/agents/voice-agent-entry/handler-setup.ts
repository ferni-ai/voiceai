/**
 * Handler registration — sets up all event handlers, publishers, and greeting.
 *
 * Registers: music, data channel, transcript, session state, tool tracking,
 * handoff, cameo, frontend publisher, and non-critical services.
 *
 * @module agents/voice-agent-entry/handler-setup
 */

import type { JobContext } from '@livekit/agents';
import type { PersonaConfig } from '../../personas/types.js';
import type { VoiceHumanizationCleanup } from './types.js';
import type { AudioRouter } from '../../integrations/qwen3-omni/director/audio-router.js';
import { TOOL_HEALTH_CHECK_INTERVAL, MULTI_AGENT_MODE } from './constants.js';
import { coordinatedSay } from '../../speech/coordination/index.js';
import { isPipelineSwitchingEnabled, selectPipeline, type PipelineSwitchContext } from '../shared/performance/pipeline-switcher.js';
import { computeDynamicVADDuration } from '../shared/performance/adaptive-timing.js';
import { finops } from '../../services/observability/finops.js';

/** Inputs for handler setup */
export interface HandlerSetupInput {
  ctx: JobContext;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  session: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  agent: any;
  voiceAgentRef: import('../shared/handoff/types.js').VoiceAgentRef;
  sessionPersona: PersonaConfig;
  userId: string | null;
  sessionId: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  services: any;
  userData: Record<string, unknown>;
  isReturningUser: boolean;
  userName: string | null;
  cleanupHandlers: Array<() => void | Promise<void>>;
  cleanupTracker: {
    register: (type: 'event' | 'timer' | 'subscription' | 'resource', description: string, cleanup: () => void | Promise<void>) => () => void;
  };
  directorAudioRouter: AudioRouter | undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sessionTools: Record<string, any>;
  toolCount: number;
  voiceHumanization: VoiceHumanizationCleanup | null;
  modelBaseInstructions: string;
  subscriptionTier: 'free' | 'friend' | 'partner';
  stopPeriodicSync?: () => void;
  /** Skip multi-agent takeover (already attempted on early path). */
  skipMultiAgentAttempt?: boolean;
}

/** Result from handler setup */
export interface HandlerSetupResult {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handoffHandler: any;
  dataChannelCleanup: () => void | Promise<void>;
  musicCleanup: () => void | Promise<void>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  patternAnalyzer: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  autoOptimizer: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  feedbackCollector: any;
}

/**
 * Register all event handlers and services for the session.
 */
export async function setupAllHandlers(input: HandlerSetupInput): Promise<HandlerSetupResult> {
  const {
    ctx, session, agent, voiceAgentRef, sessionPersona, userId, sessionId,
    services, userData, isReturningUser, userName, cleanupHandlers, cleanupTracker,
    directorAudioRouter, toolCount: _toolCount, voiceHumanization: _voiceHumanization,
  } = input;

  // Import all handlers in parallel
  const [
    { setupMusicHandler },
    { setupDataChannelHandler },
    { createTranscriptHandler },
    { setupSessionStateHandlers },
    { setupToolTrackingHandler },
    { createEventHandler },
    { registerCameoHandlers },
    { generateAndSpeakGreeting },
    { handleSessionCleanup: _handleSessionCleanup },
    { getConversationManager },
    { voice },
  ] = await Promise.all([
    import('../voice-agent/music-handler.js'),
    import('../voice-agent/data-channel-handler.js'),
    import('../voice-agent/transcript-handler.js'),
    import('../voice-agent/session-state-handler.js'),
    import('../voice-agent/tool-tracking-handler.js'),
    import('../shared/handoff/event-handler.js'),
    import('../shared/cameo-handler.js'),
    import('../voice-agent/greeting-handler.js'),
    import('../voice-agent/cleanup-handler.js'),
    import('../../services/conversation-manager.js'),
    import('../voice-agent/phases/index.js').then((m) => ({ voice: m.getCachedVoiceDeps()?.voice })),
  ]);

  const conversationManager = getConversationManager();
  conversationManager.setPersonaId(sessionPersona.id);
  conversationManager.setInsightCallback((type: string, key: string, value: unknown, confidence: number) => {
    services.captureInsight(type, key, value, confidence);
  });

  // Voice humanization
  const { setupVoiceHumanization } = await import('../voice-agent/phases/index.js');
  const voiceHumanizationResult = await setupVoiceHumanization({
    sessionId,
    personaId: sessionPersona.id,
    session,
  });
  const actualVoiceHumanization = voiceHumanizationResult.cleanup
    ? { cleanup: voiceHumanizationResult.cleanup }
    : null;

  // Extensibility session hook
  try {
    const { onSessionStart } = await import('../../personas/bundles/extensibility-integration.js');
    const extensibilitySessionPrompt = await onSessionStart({
      personaId: sessionPersona.id,
      userId: userId ?? undefined,
      sessionId,
    });
    if (extensibilitySessionPrompt) {
      process.stderr.write(`[voice-agent-entry] 🔌 Extensibility hook executed\n`);
      userData.extensibilitySessionPrompt = extensibilitySessionPrompt;
    }
  } catch {
    // Non-critical
  }

  // Pre-session briefing (non-blocking)
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const timeStr = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  userData.preSessionBriefing = `[YOUR AWARENESS - ${dateStr}]\nIt's ${timeStr}.\nUse this awareness naturally - don't announce it, just BE present in the moment.`;

  void (async () => {
    try {
      const { generatePreSessionBriefing } = await import('../../services/pre-session-briefing.js');
      const briefing = await generatePreSessionBriefing(userId ?? undefined, {
        name: (userData.userName as string) || (userData.name as string),
        lastConversation: userData.lastConversationDate ? new Date(userData.lastConversationDate as string) : undefined,
      });
      userData.preSessionBriefing = briefing.formatted;
      process.stderr.write(
        `[voice-agent-entry] 📋 Pre-session briefing generated (${briefing.temporal.timeOfDay}, ${briefing.cultural.season})\n`
      );
    } catch (briefingErr) {
      process.stderr.write(`[voice-agent-entry] Pre-session briefing failed, using fallback datetime: ${String(briefingErr)}\n`);
    }
  })();

  // Wait for participant
  const participantTimeout = MULTI_AGENT_MODE ? 10000 : 2000;
  process.stderr.write(
    `[voice-agent-entry] 👤 Waiting for participant (${participantTimeout}ms timeout, MULTI_AGENT_MODE=${MULTI_AGENT_MODE})...\n`
  );
  const participant = await Promise.race([
    ctx.waitForParticipant(),
    new Promise<null>((resolve) => {
      setTimeout(() => {
        process.stderr.write(`[voice-agent-entry] 👤 Participant wait timed out after ${participantTimeout}ms\n`);
        resolve(null);
      }, participantTimeout);
    }),
  ]);
  if (participant) {
    process.stderr.write(`[voice-agent-entry] 👤 Participant joined: ${participant.identity}\n`);
  }

  // Multi-agent mode (skipped when entry already tried early path)
  if (MULTI_AGENT_MODE && participant && !input.skipMultiAgentAttempt) {
    const { runMultiAgentMode } = await import('../voice-agent/phases/index.js');
    const { unregisterSession } = await import('../shared/crash-analytics.js');
    const multiAgentModeResult = await runMultiAgentMode({
      ctx, room: ctx.room!, participant, sessionPersona, services, userData, sessionId, userId: userId ?? undefined,
      unregisterSession,
    });
    if (multiAgentModeResult.activated) {
      // Return a sentinel — caller should check and return early
      return null as unknown as HandlerSetupResult;
    }
    if (multiAgentModeResult.error) {
      process.stderr.write(
        `[voice-agent-entry] 🎭 Multi-agent mode failed, continuing with single-agent: ${multiAgentModeResult.error}\n`
      );
    }
  }

  // MUSIC HANDLER
  const musicResult = await setupMusicHandler({
    room: ctx.room, services, sessionPersona, conversationManager, sessionId,
    userId: userData.userId as string,
  });
  cleanupHandlers.push(musicResult.cleanup);
  process.stderr.write(`[voice-agent-entry] 🎵 Music handler initialized\n`);

  // Connection type detection + noise cancellation
  const { detectConnectionType, setupNoiseCancellation } = await import('../voice-agent/phases/index.js');
  const { isPhoneCall, isWebConnection } = detectConnectionType(ctx, participant);
  const { inputOptions } = await setupNoiseCancellation({ isPhoneCall });

  await session.start({ agent, room: ctx.room, inputOptions });
  process.stderr.write(
    `[voice-agent-entry] Session started! (isPhone: ${isPhoneCall}, isWeb: ${isWebConnection})\n`
  );

  // Register session for gateway access
  const { registerSessionForReconnection, prewarmSessionAsync } =
    await import('../shared/generate-reply-gateway.js');
  registerSessionForReconnection(sessionId, session);

  // Prewarm if needed
  const { getModelProvider: getMP } = await import('../model-provider/index.js');
  const modelProvider = getMP();
  if (modelProvider.needsPrewarm()) {
    process.stderr.write(`[voice-agent-entry] 🔥 Starting prewarm via gateway (${modelProvider.id})...\n`);
    prewarmSessionAsync(session, sessionId);
  }

  // Speech coordination
  const { initializeSpeechCoordination, cleanupSpeechCoordination } =
    await import('../../speech/coordination/index.js');
  try {
    initializeSpeechCoordination({ session, sessionId, personaId: sessionPersona.id, userId: userId || undefined });
    process.stderr.write(`[voice-agent-entry] 🎤 Speech coordination initialized\n`);
    cleanupHandlers.push(() => { cleanupSpeechCoordination(sessionId); });
  } catch (coordErr) {
    process.stderr.write(`[voice-agent-entry] ⚠️ Speech coordination init failed (non-critical): ${coordErr}\n`);
  }

  // TTS cache warming (fire-and-forget)
  const { warmSessionCache } = await import('../shared/performance/cache-aware-tts.js');
  warmSessionCache(sessionPersona.id, userData.emotionalState as string | undefined).catch(
    (err: unknown) => process.stderr.write(`[voice-agent-entry] ⚠️ TTS cache warming failed (non-critical): ${err}\n`)
  );

  // Register initial tools with session
  const registeredToolCount = (agent as { _tools?: Record<string, unknown> })?._tools
    ? Object.keys((agent as { _tools?: Record<string, unknown> })._tools!).length
    : 0;
  process.stderr.write(`[voice-agent-entry] ✅ Agent registered with ${registeredToolCount} tools\n`);

  try {
    const { registerInitialTools, hasNativeToolUpdates } = await import('../shared/tool-updater.js');
    if (hasNativeToolUpdates() && registeredToolCount > 0) {
      const registered = await registerInitialTools(agent);
      if (registered) {
        process.stderr.write(`[voice-agent-entry] 🔧 Initial tools sent to session (${registeredToolCount} tools for native FC)\n`);
      }
    }
  } catch (toolRegErr) {
    process.stderr.write(`[voice-agent-entry] ⚠️ Failed to register initial tools: ${toolRegErr}\n`);
  }

  // Native FC logging handler
  let nativeFCCallCount = 0;
  let lastNativeFCCallAt = 0;
  const nativeFnCallsHandler = (event: unknown) => {
    const eventData = event as { calls?: Array<{ name: string; arguments?: unknown }> };
    const calls = eventData?.calls || [];
    nativeFCCallCount++;
    const timeSinceLast = lastNativeFCCallAt ? Date.now() - lastNativeFCCallAt : 0;
    lastNativeFCCallAt = Date.now();
    const agentToolsObj = (agent as { _tools?: Record<string, unknown> })?._tools;
    const currentToolCount = agentToolsObj ? Object.keys(agentToolsObj).length : 0;
    if (calls.length === 0) {
      process.stderr.write(`\n🔧 [NATIVE FC] function_calls_collected (empty) at ${new Date().toISOString()}\n`);
      return;
    }
    process.stderr.write(`\n${'='.repeat(60)}\n`);
    process.stderr.write(`🔧 [NATIVE FC] TOOL CALLS COLLECTED at ${new Date().toISOString()}\n`);
    process.stderr.write(`   📊 Call #${nativeFCCallCount} | Turn ${userData.turnCount || 0} | Tools: ${currentToolCount}\n`);
    if (timeSinceLast > 0) {
      process.stderr.write(`   ⏱️ Time since last FC: ${(timeSinceLast / 1000).toFixed(1)}s\n`);
    }
    process.stderr.write(`${'='.repeat(60)}\n`);
    for (let i = 0; i < calls.length; i++) {
      process.stderr.write(`\n📞 Call ${i + 1}/${calls.length}:\n   Tool Name: ${calls[i].name}\n   Arguments: ${JSON.stringify(calls[i].arguments, null, 2).replace(/\n/g, '\n   ')}\n`);
    }
    process.stderr.write(`\n${'='.repeat(60)}\n\n`);
  };
  session.on('function_calls_collected' as Parameters<typeof session.on>[0], nativeFnCallsHandler);
  cleanupTracker.register('event', 'native_function_calls handler', () => {
    session.off?.('function_calls_collected', nativeFnCallsHandler);
  });

  // Tool tracking
  const sendDataMessage = async (type: string, payload: Record<string, unknown>) => {
    try {
      const message = JSON.stringify({ type, ...payload });
      const data = new TextEncoder().encode(message);
      await ctx.room.localParticipant?.publishData(data, { reliable: true });
    } catch { /* Non-critical */ }
  };

  // =========================================================================
  // 🎤 AUDIO PROCESSOR: Prosody analysis, voice biomarkers, emotion detection
  // processAudioStream() runs in parallel with STT, analyzing user audio for
  // Better Than Human features (voice biomarkers, protective instinct,
  // somatic presence, audio-native LLM context, voice-memory weighting).
  // =========================================================================
  try {
    const { processAudioStream } = await import('../voice-agent/audio-processor.js');
    const { AudioStream, TrackKind } = await import('@livekit/rtc-node');

    let audioProcessorStarted = false;

    const startAudioProcessing = (track: import('@livekit/rtc-node').RemoteTrack) => {
      if (audioProcessorStarted) return;
      if (track.kind !== TrackKind.KIND_AUDIO) return;
      audioProcessorStarted = true;

      const audioStream = new AudioStream(track, { sampleRate: 16000, numChannels: 1 });
      process.stderr.write(
        `[voice-agent-entry] 🎤 Audio processor wired — prosody, biomarkers, and emotion analysis active\n`
      );

      // AudioStream extends ReadableStream<AudioFrame> but needs cast for node:stream/web compat
      void processAudioStream(audioStream as unknown as import('node:stream/web').ReadableStream<import('@livekit/rtc-node').AudioFrame>, {
        sessionId,
        userId: userId ?? undefined,
        userData: userData as import('../shared/types.js').UserData,
        sendDataMessage,
      }).catch((err) => {
        process.stderr.write(
          `[voice-agent-entry] ⚠️ Audio processor ended: ${err}\n`
        );
      });
    };

    // Check already-subscribed tracks (participant may have joined before this point)
    for (const [, remoteParticipant] of ctx.room.remoteParticipants) {
      for (const [, publication] of remoteParticipant.trackPublications) {
        if (publication.track) {
          startAudioProcessing(publication.track as import('@livekit/rtc-node').RemoteTrack);
        }
      }
    }

    // Listen for new track subscriptions
    const audioTrackSubHandler = (
      track: import('@livekit/rtc-node').RemoteTrack,
      _publication: import('@livekit/rtc-node').RemoteTrackPublication,
      _participant: import('@livekit/rtc-node').RemoteParticipant,
    ) => {
      startAudioProcessing(track);
    };
    ctx.room.on('trackSubscribed', audioTrackSubHandler);
    cleanupTracker.register('event', 'audio-processor-track-sub', () => {
      ctx.room.off('trackSubscribed', audioTrackSubHandler);
    });

    process.stderr.write(`[voice-agent-entry] 🎤 Audio processor listener registered\n`);
  } catch (audioProcessorErr) {
    process.stderr.write(
      `[voice-agent-entry] ⚠️ Audio processor wiring failed (non-critical): ${audioProcessorErr}\n`
    );
  }

  setupToolTrackingHandler({
    session, userData, services, sessionPersona, sessionId, debugEnabled: true, sendDataMessage,
  });

  // Tool health monitor
  const toolHealthCheckInterval = setInterval(
    () => void (async () => {
      const agentToolsObj = (agent as { _tools?: Record<string, unknown> })?._tools;
      const tc = agentToolsObj ? Object.keys(agentToolsObj).length : 0;
      const turnsSinceLastFC = ((userData.turnCount as number) || 0) - nativeFCCallCount;
      process.stderr.write(`\n🏥 [TOOL HEALTH] Turn ${userData.turnCount || 0} | Tools: ${tc} | FC calls: ${nativeFCCallCount} | Turns without FC: ${turnsSinceLastFC}\n`);
      if (turnsSinceLastFC > 3 && tc > 0) {
        process.stderr.write(`⚠️ [TOOL HEALTH] ${turnsSinceLastFC} turns without function calls - attempting tool re-registration\n`);
        try {
          const { registerInitialTools: reReg, hasNativeToolUpdates: hasNTU } = await import('../shared/tool-updater.js');
          if (hasNTU()) {
            const reregistered = await reReg(agent);
            process.stderr.write(`🔧 [TOOL HEALTH] Re-registration ${reregistered ? 'succeeded' : 'failed'}\n`);
          }
        } catch (reregErr) {
          process.stderr.write(`❌ [TOOL HEALTH] Re-registration error: ${reregErr}\n`);
        }
      }
    })(),
    TOOL_HEALTH_CHECK_INTERVAL
  );
  cleanupTracker.register('timer', 'tool-health-check', () => { clearInterval(toolHealthCheckInterval); });

  // Session state handlers
  const { silenceContext } = setupSessionStateHandlers({
    session, sessionPersona, conversationManager, userData, sessionId,
    room: ctx.room,
    onIdleTimeout: () => {
      void (async () => {
        process.stderr.write(`[voice-agent-entry] ⏰ Idle timeout - disconnecting session ${sessionId}\n`);
        try {
          const { sendFrontendSignal } = await import('../../services/frontend-signal.js');
          await sendFrontendSignal('conversation_end', { reason: 'idle_timeout', disconnectDelay: 0, timestamp: Date.now() });
        } catch { /* Non-critical */ }
        try { if (ctx.room.isConnected) await ctx.room.disconnect(); }
        catch (disconnectErr) { process.stderr.write(`[voice-agent-entry] ⚠️ Error disconnecting: ${disconnectErr}\n`); }
      })();
    },
  });

  // Transcript handler
  const { autoOptimizer } = await import('../../tools/optimization/auto-optimizer.js');
  const { patternAnalyzer } = await import('../../tools/optimization/pattern-analyzer.js');
  const { feedbackCollector } = await import('../../tools/optimization/feedback-collector.js');
  const { dynamicToolLoader } = await import('../../tools/dynamic-loader.js');

  await dynamicToolLoader.initialize({
    userId: userId || 'anonymous',
    agentId: sessionPersona.id,
    agentDisplayName: sessionPersona.displayName || sessionPersona.id,
    sessionId,
    services: undefined,
  });

  // Update agent with essential tools if safe
  try {
    const { updateAgentTools, supportsToolUpdates, isMidSessionToolUpdateSafe } = await import('../shared/tool-updater.js');
    if (supportsToolUpdates() && isMidSessionToolUpdateSafe()) {
      const essentialTools = dynamicToolLoader.getCurrentTools();
      const essentialDomains = dynamicToolLoader.getLoadedDomains();
      if (Object.keys(essentialTools).length > 0) {
        const updated = await updateAgentTools(agent, essentialTools, { domains: essentialDomains });
        if (updated) {
          process.stderr.write(`\n🔧 Essential tools registered with agent (${Object.keys(essentialTools).length} tools)\n`);
        }
      }
    }
  } catch (toolUpdateError) {
    process.stderr.write(`\n⚠️ Failed to update agent with essential tools: ${toolUpdateError}\n`);
  }

  const transcriptHandler = createTranscriptHandler({
    room: ctx.room, session, services, sessionPersona, conversationManager,
    voiceHumanization: null, userData, userId: userId ?? undefined, sessionId, silenceContext,
    dynamicToolLoader, autoOptimizer, agent,
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const voiceMod = await import('../voice-agent/phases/index.js');
  const cachedDeps = voiceMod.getCachedVoiceDeps();

  const userInputTranscribedHandler = (event: unknown) => {
    const evt = event as { transcript?: string; isFinal?: boolean };
    if (evt.isFinal) {
      userData.turnCount = ((userData.turnCount as number) || 0) + 1;
      if (isPipelineSwitchingEnabled()) {
        const switchCtx: PipelineSwitchContext = {
          emotion: (userData.lastEmotionAnalysis as { primary?: string })?.primary,
          stressLevel: (userData.lastEmotionAnalysis as { distressLevel?: number })?.distressLevel,
          wasInterrupted: userData.wasInterrupted as boolean | undefined,
          turnCount: (userData.turnCount as number) ?? 0,
          userTranscriptLength: evt.transcript?.length ?? 0,
          isFirstResponse: ((userData.turnCount as number) ?? 0) === 1,
          isQuestion: evt.transcript?.includes('?'),
        };
        const pipelineResult = selectPipeline(switchCtx);
        process.stderr.write(`🔀 [TURN ${userData.turnCount}] Pipeline: ${pipelineResult.mode} (${pipelineResult.reason}, confidence=${pipelineResult.confidence})\n`);
      }
      const transcript = evt.transcript || '';
      process.stderr.write(`\n📝 [TURN ${userData.turnCount}] FINAL: "${transcript}"\n`);
      if (transcript) {
        const wordCount = transcript.split(/\s+/).filter((w: string) => w.length > 0).length;
        const estimatedDurationSeconds = (wordCount / 150) * 60;
        finops.recordSTTCost({ durationSeconds: Math.max(1, estimatedDurationSeconds), userId: userId ?? undefined, sessionId });
        const dynamicVAD = computeDynamicVADDuration(sessionId, transcript, undefined, userData.emotionalState as string | undefined);
        process.stderr.write(`[VAD] semantic=${dynamicVAD}ms for turn ${userData.turnCount}\n`);
      }
    }
    transcriptHandler.handler(event as import('../voice-agent/transcript-handler.js').TranscriptEvent);
  };

  if (cachedDeps?.voice) {
    session.on(cachedDeps.voice.AgentSessionEventTypes.UserInputTranscribed, userInputTranscribedHandler);
    cleanupHandlers.push(() => {
      try { session.off(cachedDeps.voice.AgentSessionEventTypes.UserInputTranscribed, userInputTranscribedHandler); }
      catch { /* Session may already be disposed */ }
    });
  }

  // Handoff handler
  const eventHandlerResult = createEventHandler({
    ctx, session,
    tts: session.tts as { switchVoice?: (name: string, id: string) => void },
    services, userData,
    getVoiceAgentRef: () => voiceAgentRef as { setPersona: (personaId: string, instructions: string) => void } | null,
    sessionId,
    initialAgent: sessionPersona.id,
  });
  cleanupTracker.register('event', 'handoffEvents.voiceSwitch', eventHandlerResult.cleanup);

  // Cameo handlers
  try {
    const cleanupCameoHandlers = await registerCameoHandlers({
      ctx, session,
      tts: session.tts as { switchVoice?: (name: string, id: string) => void },
      hostPersonaId: sessionPersona.id, hostVoiceId: sessionPersona.voice.voiceId,
      getVoiceAgentRef: () => voiceAgentRef as unknown as import('../shared/cameo-handler.js').CameoVoiceAgentRef,
      hostPersona: sessionPersona,
    });
    if (cleanupCameoHandlers) cleanupHandlers.push(cleanupCameoHandlers);
    process.stderr.write(`[voice-agent-entry] 🎬 Cameo handlers registered\n`);
  } catch (cameoErr) {
    process.stderr.write(`[voice-agent-entry] Cameo handlers failed (non-fatal): ${cameoErr}\n`);
  }

  // Data channel handler
  const dataChannelResult = setupDataChannelHandler({
    room: ctx.room, ctx, session, services, sessionPersona, userId: userId ?? undefined, sessionId, voiceAgentRef,
    tts: session.tts as { switchVoice?: (name: string, voiceId: string, accent?: string) => void },
    ...(directorAudioRouter ? { audioRouter: directorAudioRouter } : {}),
  });
  cleanupHandlers.push(dataChannelResult.cleanup);
  process.stderr.write(`[voice-agent-entry] 📡 Data channel handler set up\n`);

  // Frontend publisher + signals
  await setupFrontendPublisher(ctx, sessionPersona, sessionId);

  // Async events, prosody bridge, bundle runtime, humanization
  await setupNonCriticalServices(ctx, sessionPersona, sessionId, userId, services, userData);

  // Greeting
  await speakGreeting(session, sessionPersona, services, userData, sessionId, userId, userName, isReturningUser);

  return {
    handoffHandler: eventHandlerResult.handler,
    dataChannelCleanup: dataChannelResult.cleanup,
    musicCleanup: musicResult.cleanup,
    patternAnalyzer,
    autoOptimizer,
    feedbackCollector,
  };
}

// =========================================================================
// INTERNAL HELPERS
// =========================================================================

async function setupFrontendPublisher(
  ctx: JobContext,
  sessionPersona: PersonaConfig,
  sessionId: string
): Promise<void> {
  try {
    const { initializeFrontendPublisher, getFrontendPublisher } = await import('../realtime/index.js');
    initializeFrontendPublisher(ctx.room);

    const { initFrontendSignal } = await import('../../services/frontend-signal.js');
    initFrontendSignal(async (type, data) => {
      const publisher = getFrontendPublisher();
      if (publisher.isConnected()) await publisher.sendData(type, data ?? {});
    });
    process.stderr.write(`[voice-agent-entry] 📤 Frontend publisher initialized\n`);

    try {
      const { initHumanizationSignalEmitter } = await import('../../services/humanization/humanization-signal-emitter.js');
      initHumanizationSignalEmitter(async (type, payload) => {
        const publisher = getFrontendPublisher();
        if (publisher.isConnected()) await publisher.sendData(type, payload);
      });
      process.stderr.write(`[voice-agent-entry] 🌉 Humanization signal emitter initialized\n`);
    } catch { /* Non-critical */ }

    try {
      const { setSignalEmitter } = await import('../../services/trust-systems/trust-signal-emitter.js');
      setSignalEmitter((signal) => {
        const publisher = getFrontendPublisher();
        if (publisher.isConnected()) {
          void publisher.sendData('trust_signal', {
            signalType: signal.type, title: signal.title, message: signal.message,
            personaId: signal.personaId || sessionPersona.id, timing: signal.timing, metadata: signal.metadata,
          });
        }
      });
      process.stderr.write(`[voice-agent-entry] 💚 Trust signal emitter initialized\n`);
    } catch { /* Non-critical */ }
  } catch (pubErr) {
    process.stderr.write(`[voice-agent-entry] Frontend publisher failed (non-fatal): ${pubErr}\n`);
  }
}

async function setupNonCriticalServices(
  ctx: JobContext,
  sessionPersona: PersonaConfig,
  sessionId: string,
  userId: string | null,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  services: any,
  userData: Record<string, unknown>
): Promise<void> {
  // Async events
  try {
    const { emitConversationStart } = await import('../../services/async-events/index.js');
    emitConversationStart({ sessionId, userId: userId || 'anonymous', personaId: sessionPersona.id, isReturning: userData.isReturningUser as boolean });
    process.stderr.write(`[voice-agent-entry] 📤 conversation:start emitted\n`);
  } catch { /* Non-critical */ }

  // Prosody bridge
  try {
    const { initProsodyBridge } = await import('../../conversation/humanization/index.js');
    initProsodyBridge(sessionId, userId || 'anonymous');
    process.stderr.write(`[voice-agent-entry] 🌉 Prosody bridge initialized\n`);
  } catch { /* Non-critical */ }

  // Bundle runtime
  try {
    const { createBundleRuntime } = await import('../../personas/bundles/index.js');
    const { loadBundleById } = await import('../../personas/bundles/loader.js');
    const bundle = await loadBundleById(sessionPersona.id);
    if (bundle) {
      const bundleRuntime = await createBundleRuntime(bundle);
      if (userData.bundleRuntimeState) {
        bundleRuntime.updateState({
          relationshipTurns: (userData.bundleRuntimeState as { relationshipTurns?: number }).relationshipTurns,
          sessionCount: services.userProfile?.totalConversations || 0,
          userName: userData.name as string,
        });
      }
      userData._bundleRuntime = bundleRuntime;
      process.stderr.write(`[voice-agent-entry] 📦 Bundle runtime initialized (stage: ${bundleRuntime.getRelationshipStageName()})\n`);
    }
  } catch (bundleErr) {
    process.stderr.write(`[voice-agent-entry] Bundle runtime (non-fatal): ${bundleErr}\n`);
  }

  // Unified conversation humanization
  try {
    const { initConversationSession } = await import('../integrations/conversation-session-integration.js');
    await initConversationSession({
      sessionId, userId: userId || 'anonymous', personaId: sessionPersona.id,
      sessionCount: services.userProfile?.totalConversations,
      relationshipStage: services.userProfile?.relationshipStage as 'stranger' | 'acquaintance' | 'friend' | 'trusted_advisor' | undefined,
      userProfile: services.userProfile ? { humanMemory: services.userProfile.humanMemory } : undefined,
    });
    const { initializeFromPersistence } = await import('../../conversation/humanization/persistence.js');
    await initializeFromPersistence(userId || 'anonymous', sessionId);
  } catch (humanizationErr) {
    process.stderr.write(`[voice-agent-entry] Humanization init (non-fatal): ${humanizationErr}\n`);
  }

  // Voice humanization init
  try {
    const { setupVoiceHumanizationInit } = await import('../voice-agent/voice-humanization-init-handler.js');
    setupVoiceHumanizationInit({ sessionId, sessionPersona, userId: userId ?? undefined, userProfile: services.userProfile });
    process.stderr.write(`[voice-agent-entry] 🎤 Voice humanization init complete\n`);
  } catch { /* Non-critical */ }

  // Parallel non-critical services
  await Promise.allSettled([
    (async () => {
      try {
        const mod = await import('../../services/engagement-data-sender.js');
        const engagementDataSender = mod.getEngagementDataSender();
        engagementDataSender.setRoom(ctx.room as Parameters<typeof engagementDataSender.setRoom>[0]);
        if (userId) await engagementDataSender.sendEngagementData(userId);
      } catch { /* Non-critical */ }
    })(),
    (async () => {
      try {
        const { onCognitiveSessionStart } = await import('../../services/cognitive-session-hooks.js');
        await onCognitiveSessionStart({ userId: userId || 'anonymous', personaId: sessionPersona.id, userProfile: services.userProfile, sessionId });
      } catch { /* Non-critical */ }
    })(),
    (async () => {
      try {
        const { getSessionGameEngine } = await import('../../services/games/index.js');
        const engine = getSessionGameEngine(sessionId, sessionPersona.id);
        if (userId) await engine.initializeForUser(userId);
      } catch { /* Non-critical */ }
    })(),
  ]);
}

async function speakGreeting(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  session: any,
  sessionPersona: PersonaConfig,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  services: any,
  userData: Record<string, unknown>,
  sessionId: string,
  userId: string | null,
  userName: string | null,
  isReturningUser: boolean
): Promise<void> {
  process.stderr.write(`[voice-agent-entry] 🎤 Speaking greeting...\n`);
  const { generateAndSpeakGreeting } = await import('../voice-agent/greeting-handler.js');

  try {
    const greetingResult = await generateAndSpeakGreeting({
      sessionPersona, services, userData, sessionId, userId: userId ?? undefined, userName: userName ?? undefined, isReturningUser,
      bundleRuntime: userData._bundleRuntime as import('../../personas/bundles/index.js').BundleRuntimeEngine | undefined,
      utilitiesProactiveOpener: undefined, session,
      tagGreeting: (text: string) => text,
    });
    if (greetingResult.greeting) {
      userData.greetingText = greetingResult.greeting;
      userData.greetingInjected = false;
    }
  } catch (greetingErr) {
    process.stderr.write(`[voice-agent-entry] Greeting handler failed, using fallback: ${greetingErr}\n`);
    const fallbackGreeting = `Hey there! I'm ${sessionPersona.name}. How can I help you today?`;
    coordinatedSay(sessionId, fallbackGreeting, { allowInterruptions: false });
    userData.greetingText = fallbackGreeting;
    userData.greetingInjected = false;
  }
}
