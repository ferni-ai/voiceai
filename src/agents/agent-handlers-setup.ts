/**
 * Agent Handlers Setup
 *
 * Handles setting up all the event handlers for voice agent sessions including:
 * - Music handler
 * - Data channel handler
 * - Transcript handler
 * - Session state handlers
 * - Tool tracking handler
 * - Handoff event handler
 * - Cameo handlers
 * - Frontend publisher
 * - Bundle runtime
 *
 * @module agents/agent-handlers-setup
 */

import type { PersonaConfig } from '../personas/types.js';
import type { CleanupHandler } from './agent-lifecycle.js';
import type { VoiceAgentRef } from './agent-session-creator.js';

// ============================================================================
// MUSIC HANDLER
// ============================================================================

export interface MusicHandlerConfig {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  room: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  services: any;
  sessionPersona: PersonaConfig;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  conversationManager: any;
  sessionId: string;
  userId: string | null | undefined;
}

/**
 * Sets up the music handler for DJ/music playback during sessions.
 */
export async function setupMusicHandlerAsync(
  config: MusicHandlerConfig
): Promise<{ cleanup: CleanupHandler }> {
  const { setupMusicHandler } = await import('./voice-agent/music-handler.js');
  return setupMusicHandler({
    room: config.room,
    services: config.services,
    sessionPersona: config.sessionPersona,
    conversationManager: config.conversationManager,
    sessionId: config.sessionId,
    userId: config.userId ?? undefined,
  });
}

// ============================================================================
// DATA CHANNEL HANDLER
// ============================================================================

export interface DataChannelHandlerConfig {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  room: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ctx: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  session: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  services: any;
  sessionPersona: PersonaConfig;
  userId: string | null;
  sessionId: string;
  voiceAgentRef: VoiceAgentRef;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tts: any;
}

/**
 * Sets up the data channel handler for frontend communication.
 */
export async function setupDataChannelHandlerAsync(
  config: DataChannelHandlerConfig
): Promise<{ cleanup: CleanupHandler }> {
  const { setupDataChannelHandler } = await import('./voice-agent/data-channel-handler.js');
  return setupDataChannelHandler({
    room: config.room,
    ctx: config.ctx,
    session: config.session,
    services: config.services,
    sessionPersona: config.sessionPersona,
    userId: config.userId ?? undefined,
    sessionId: config.sessionId,
    voiceAgentRef: config.voiceAgentRef,
    tts: config.tts,
  });
}

// ============================================================================
// SESSION STATE HANDLERS
// ============================================================================

export interface SessionStateConfig {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  session: any;
  sessionPersona: PersonaConfig;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  conversationManager: any;
  userData: Record<string, unknown>;
  sessionId: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  room: any;
  onIdleTimeout: () => void;
}

/**
 * Sets up session state handlers including silence detection and engagement tracking.
 */
export async function setupSessionStateHandlersAsync(
  config: SessionStateConfig
): Promise<{ silenceContext: unknown }> {
  const { setupSessionStateHandlers } = await import('./voice-agent/session-state-handler.js');
  return setupSessionStateHandlers({
    session: config.session,
    sessionPersona: config.sessionPersona,
    conversationManager: config.conversationManager,
    userData: config.userData,
    sessionId: config.sessionId,
    room: config.room,
    onIdleTimeout: config.onIdleTimeout,
  });
}

// ============================================================================
// TOOL TRACKING HANDLER
// ============================================================================

export interface ToolTrackingConfig {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  session: any;
  userData: Record<string, unknown>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  services: any;
  sessionPersona: PersonaConfig;
  sessionId: string;
  debugEnabled: boolean;
  sendDataMessage: (type: string, payload: Record<string, unknown>) => Promise<void>;
}

/**
 * Sets up tool tracking handler for monitoring tool usage.
 */
export async function setupToolTrackingHandlerAsync(config: ToolTrackingConfig): Promise<void> {
  const { setupToolTrackingHandler } = await import('./voice-agent/tool-tracking-handler.js');
  setupToolTrackingHandler({
    session: config.session,
    userData: config.userData,
    services: config.services,
    sessionPersona: config.sessionPersona,
    sessionId: config.sessionId,
    debugEnabled: config.debugEnabled,
    sendDataMessage: config.sendDataMessage,
  });
}

// ============================================================================
// HANDOFF EVENT HANDLER
// ============================================================================

export interface EventHandlerConfig {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ctx: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  session: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tts: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  services: any;
  userData: Record<string, unknown>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getVoiceAgentRef: () => any;
  sessionId: string;
  initialAgent: string;
}

/**
 * Creates the handoff event handler for persona switching.
 */
export async function createEventHandlerAsync(
  config: EventHandlerConfig
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<{ cleanup: CleanupHandler; handler: any }> {
  const { createEventHandler } = await import('./shared/handoff/event-handler.js');
  return createEventHandler({
    ctx: config.ctx,
    session: config.session,
    tts: config.tts,
    services: config.services,
    userData: config.userData,
    getVoiceAgentRef: config.getVoiceAgentRef,
    sessionId: config.sessionId,
    initialAgent: config.initialAgent,
  });
}

// ============================================================================
// CAMEO HANDLERS
// ============================================================================

export interface CameoHandlerConfig {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ctx: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  session: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tts: any;
  hostPersonaId: string;
  hostVoiceId: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getVoiceAgentRef: () => any;
  hostPersona: PersonaConfig;
}

/**
 * Registers cameo handlers for team member pop-ins.
 */
export async function registerCameoHandlersAsync(
  config: CameoHandlerConfig
): Promise<CleanupHandler | null> {
  try {
    const { registerCameoHandlers } = await import('./shared/cameo-handler.js');
    const cleanupCameoHandlers = await registerCameoHandlers({
      ctx: config.ctx,
      session: config.session,
      tts: config.tts,
      hostPersonaId: config.hostPersonaId,
      hostVoiceId: config.hostVoiceId,
      getVoiceAgentRef: config.getVoiceAgentRef,
      hostPersona: config.hostPersona,
    });
    return cleanupCameoHandlers ?? null;
  } catch (cameoErr) {
    process.stderr.write(`[agent-handlers-setup] Cameo handlers failed (non-fatal): ${cameoErr}\n`);
    return null;
  }
}

// ============================================================================
// FRONTEND PUBLISHER
// ============================================================================

/**
 * Initializes the frontend publisher for real-time UI updates.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function initializeFrontendPublisherAsync(room: any): Promise<void> {
  try {
    const { initializeFrontendPublisher, getFrontendPublisher } =
      await import('./realtime/index.js');
    initializeFrontendPublisher(room);

    const { initFrontendSignal } = await import('../services/frontend-signal.js');
    initFrontendSignal(async (type, data) => {
      const publisher = getFrontendPublisher();
      if (publisher.isConnected()) {
        await publisher.sendData(type, data ?? {});
      }
    });
  } catch {
    /* non-critical */
  }
}

// ============================================================================
// BUNDLE RUNTIME
// ============================================================================

/**
 * Creates a bundle runtime for rich persona content.
 */
export async function createBundleRuntimeAsync(
  personaId: string
): Promise<import('../personas/bundles/index.js').BundleRuntimeEngine | undefined> {
  try {
    const { createBundleRuntime } = await import('../personas/bundles/index.js');
    const { loadBundleById } = await import('../personas/bundles/loader.js');
    const bundle = await loadBundleById(personaId);
    if (bundle) {
      return await createBundleRuntime(bundle);
    }
    return undefined;
  } catch {
    /* non-critical */
    return undefined;
  }
}

// ============================================================================
// TRANSCRIPT HANDLER SETUP
// ============================================================================

export interface TranscriptHandlerConfig {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  room: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  session: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  services: any;
  sessionPersona: PersonaConfig;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  conversationManager: any;
  userData: Record<string, unknown>;
  userId: string | null;
  sessionId: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  silenceContext: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  agent: any;
}

/**
 * Creates the transcript handler for processing user speech.
 */
export async function createTranscriptHandlerAsync(
  config: TranscriptHandlerConfig
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<{ handler: (event: any) => void }> {
  const { createTranscriptHandler } = await import('./voice-agent/transcript-handler.js');
  const { autoOptimizer } = await import('../tools/optimization/auto-optimizer.js');
  const { dynamicToolLoader } = await import('../tools/dynamic-loader.js');

  await dynamicToolLoader.initialize({
    userId: config.userId || 'anonymous',
    agentId: config.sessionPersona.id,
    agentDisplayName:
      (config.sessionPersona as { displayName?: string }).displayName || config.sessionPersona.id,
    sessionId: config.sessionId,
    services: undefined,
  });

  return createTranscriptHandler({
    room: config.room,
    session: config.session,
    services: config.services,
    sessionPersona: config.sessionPersona,
    conversationManager: config.conversationManager,
    voiceHumanization: null,
    userData: config.userData,
    userId: config.userId ?? undefined,
    sessionId: config.sessionId,
    silenceContext: config.silenceContext,
    dynamicToolLoader,
    autoOptimizer,
    agent: config.agent,
  });
}

// ============================================================================
// SEND DATA MESSAGE HELPER
// ============================================================================

/**
 * Creates a helper function for sending data messages to the frontend.
 */
export function createDataMessageSender(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  room: any
): (type: string, payload: Record<string, unknown>) => Promise<void> {
  return async (type: string, payload: Record<string, unknown>): Promise<void> => {
    try {
      const message = JSON.stringify({ type, ...payload });
      const data = new TextEncoder().encode(message);
      await room.localParticipant?.publishData(data, { reliable: true });
    } catch {
      /* ignore */
    }
  };
}

// ============================================================================
// IDLE TIMEOUT HANDLER
// ============================================================================

/**
 * Creates the idle timeout handler for disconnecting inactive sessions.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createIdleTimeoutHandler(room: any): () => void {
  return () => {
    void (async () => {
      try {
        const { sendFrontendSignal } = await import('../services/frontend-signal.js');
        await sendFrontendSignal('conversation_end', {
          reason: 'idle_timeout',
          disconnectDelay: 0,
          timestamp: Date.now(),
        });
      } catch {
        /* ignore */
      }
      try {
        if (room.isConnected) {
          await room.disconnect();
        }
      } catch {
        /* ignore */
      }
    })();
  };
}
