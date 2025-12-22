/**
 * Handoff Coordinator Adapter
 *
 * Bridges the new HandoffCoordinator with the existing voice agent infrastructure.
 * This adapter provides:
 * - LLM-driven banter (soft open + arriving welcome)
 * - Voice switching via VoiceManager
 * - LLM instruction updates
 * - Data channel notifications to frontend
 *
 * Usage:
 *   const adapter = createCoordinatorAdapter(config);
 *   const result = await adapter.executeHandoff('peter-john', 'User requested via UI');
 *
 * @module agents/shared/handoff/coordinator-adapter
 */

import type { JobContext, voice } from '@livekit/agents';
import type { Room } from '@livekit/rtc-node';
import type { SessionServices } from '../../../services/types.js';
import type { UserData } from '../types.js';
import { getLogger } from '../../../utils/safe-logger.js';
import { diag } from '../../../services/diagnostic-logger.js';

// New coordinator system
import {
  HandoffCoordinator,
  createHandoffCoordinator,
  type BanterContext,
  type CoordinatorConfig,
} from '../../../tools/handoff/handoff-coordinator.js';
import { resolveVoiceId } from '../../../tools/handoff/voice-id-resolver.js';

// Existing banter system
import {
  getLLMDrivenBanter,
  getHandoffBanter,
  getArrivingBanter,
  buildBanterContext,
} from '../../../services/engagement/team-engagement.js';

// Cached module accessors
import { getVoiceManagerCached, getPersonaAsyncCached } from './cached-modules.js';
import { getNextMessageSeq } from './session-state.js';

// Safe LLM generation
import { safeGenerateReply } from '../safe-generate-reply.js';

const log = getLogger();

// ============================================================================
// TYPES
// ============================================================================

/**
 * Configuration for the coordinator adapter.
 */
export interface CoordinatorAdapterConfig {
  /** LiveKit job context */
  ctx: JobContext;
  /** Voice session */
  session: voice.AgentSession<UserData>;
  /** Session services */
  services: SessionServices;
  /** Room for data channel */
  room: Room;
  /** Voice agent reference for persona updates */
  getVoiceAgentRef: () => {
    setPersona: (personaId: string, instructions: string) => void;
  } | null;
  /** CRITICAL: Initial agent for the session. Must match sessionPersona.id! */
  initialAgent?: string;
}

/**
 * Result of a handoff execution.
 */
export interface AdapterHandoffResult {
  success: boolean;
  targetAgent?: string;
  error?: string;
  traceId: string;
  durationMs?: number;
}

// ============================================================================
// BANTER TIMEOUT
// ============================================================================

const BANTER_TIMEOUT_MS = 5000; // 5 seconds max for banter

// ============================================================================
// COORDINATOR ADAPTER CLASS
// ============================================================================

/**
 * Coordinator Adapter
 *
 * Wraps the HandoffCoordinator with voice agent specific functionality.
 */
export class CoordinatorAdapter {
  private readonly coordinator: HandoffCoordinator;
  private readonly session: voice.AgentSession<UserData>;
  private readonly services: SessionServices;
  private readonly room: Room;
  private readonly getVoiceAgentRef: () => { setPersona: (personaId: string, instructions: string) => void } | null;
  private readonly sessionId: string;

  constructor(config: CoordinatorAdapterConfig) {
    const { ctx, session, services, room, getVoiceAgentRef, initialAgent } = config;
    this.session = session;
    this.services = services;
    this.room = room;
    this.getVoiceAgentRef = getVoiceAgentRef;
    this.sessionId = ctx.room?.name || `adapter-${Date.now()}`;

    // Create the coordinator with our callbacks
    // CRITICAL: Pass initialAgent so state manager knows the starting persona
    this.coordinator = createHandoffCoordinator({
      sessionId: this.sessionId,
      initialAgent: initialAgent || 'ferni', // Default to ferni if not provided
      onVoiceSwitch: this.handleVoiceSwitch.bind(this),
      onLLMUpdate: this.handleLLMUpdate.bind(this),
      onUINotify: this.handleUINotify.bind(this),
      onBeforeVoiceSwitch: this.handleSoftOpen.bind(this),
      onAfterVoiceSwitch: this.handleArrivingWelcome.bind(this),
    });

    log.info({ sessionId: this.sessionId, initialAgent }, '🔌 CoordinatorAdapter created');
  }

  // ========================================================================
  // PUBLIC API
  // ========================================================================

  /**
   * Execute a handoff to a target persona.
   */
  async executeHandoff(
    targetAgent: string,
    reason: string,
    options?: {
      userProfile?: unknown;
      subscriptionTier?: 'free' | 'friend' | 'partner';
    }
  ): Promise<AdapterHandoffResult> {
    log.info({ targetAgent, reason }, '🚀 CoordinatorAdapter executing handoff');

    const result = await this.coordinator.execute({
      targetAgent,
      reason,
      userProfile: options?.userProfile as Parameters<typeof this.coordinator.execute>[0]['userProfile'],
      subscriptionTier: options?.subscriptionTier,
      source: 'user',
      recentMessages: this.getRecentMessages(),
      cognitiveContext: this.getCognitiveContext(),
    });

    return {
      success: result.success,
      targetAgent: result.targetPersonaId,
      error: result.error,
      traceId: result.traceId,
      durationMs: result.durationMs,
    };
  }

  /**
   * Cancel current handoff.
   */
  async cancel(reason: string = 'User cancelled'): Promise<void> {
    await this.coordinator.cancel(reason);
  }

  /**
   * Get current agent.
   */
  getCurrentAgent(): string {
    return this.coordinator.getCurrentAgent();
  }

  /**
   * Check if handoff is in progress.
   */
  isInProgress(): boolean {
    return this.coordinator.isInProgress();
  }

  /**
   * Dispose the adapter.
   */
  dispose(): void {
    this.coordinator.dispose();
    log.info({ sessionId: this.sessionId }, '🗑️ CoordinatorAdapter disposed');
  }

  // ========================================================================
  // COORDINATOR CALLBACKS
  // ========================================================================

  /**
   * Handle voice switch - called by coordinator.
   * 
   * CRITICAL FIX: VoiceManager.switchVoice() expects an agent ID (like 'peter-john'),
   * NOT a voice UUID. The coordinator passes voiceId for reference but we use personaId.
   */
  private async handleVoiceSwitch(voiceId: string, personaId: string): Promise<void> {
    log.debug({ voiceId, personaId }, '🎤 Switching voice');

    const voiceManager = await getVoiceManagerCached(this.sessionId);
    if (!voiceManager) {
      throw new Error('VoiceManager not available');
    }

    // Small delay to prevent race conditions
    await new Promise((resolve) => setTimeout(resolve, 150));

    // FIX BUG: Use personaId (agent ID like 'peter-john'), NOT voiceId (UUID)!
    // VoiceManager.switchVoice() looks up the voice ID from VOICES[agentId].id
    voiceManager.switchVoice(personaId);

    log.info({ voiceId, personaId, usedAgentId: personaId }, '✅ Voice switched');
  }

  /**
   * Handle LLM update - called by coordinator.
   */
  private async handleLLMUpdate(personaId: string, instructions: string): Promise<void> {
    log.debug({ personaId, instructionLength: instructions.length }, '📝 Updating LLM');

    const voiceAgentRef = this.getVoiceAgentRef();
    if (!voiceAgentRef) {
      log.warn('VoiceAgentRef not available for LLM update');
      return;
    }

    voiceAgentRef.setPersona(personaId, instructions);

    // Also update session-scoped state
    if (this.services.handoffState) {
      (this.services.handoffState as { currentAgent: string }).currentAgent = personaId;
    }

    log.info({ personaId }, '✅ LLM updated');
  }

  /**
   * Handle UI notification - called by coordinator.
   */
  private handleUINotify(event: unknown): void {
    // Send to frontend via data channel
    const eventData = event as { type: string; data?: Record<string, unknown> };

    try {
      const message = JSON.stringify({
        ...eventData.data,
        type: eventData.type,
        seq: getNextMessageSeq(this.sessionId),
        timestamp: Date.now(),
      });

      if (this.room.localParticipant) {
        this.room.localParticipant.publishData(
          new TextEncoder().encode(message),
          { reliable: true }
        ).catch((err) => {
          log.warn({ error: String(err) }, 'Failed to publish UI event');
        });
      }
    } catch (err) {
      log.warn({ error: String(err) }, 'Failed to send UI notification');
    }
  }

  /**
   * Handle soft open (departing persona's goodbye) - called BEFORE voice switch.
   */
  private async handleSoftOpen(
    fromPersonaId: string,
    toPersonaId: string,
    context: BanterContext
  ): Promise<void> {
    log.debug({ from: fromPersonaId, to: toPersonaId }, '🎭 Generating soft open banter');

    try {
      // Build banter context from services
      const banterCtx = this.buildBanterContextFromServices(context.reason);

      // Get LLM-driven banter
      const llmBanter = getLLMDrivenBanter(fromPersonaId, toPersonaId, banterCtx);
      const softOpenInstructions = llmBanter.softOpen;
      const fallbackBanter = getHandoffBanter(fromPersonaId, toPersonaId);

      // Use safeGenerateReply for LLM-driven banter with fallback
      const result = await safeGenerateReply(this.session, {
        instructions: softOpenInstructions.instructions,
        allowInterruptions: false,
        fallbackMessage: fallbackBanter ?? undefined,
        timeoutMs: BANTER_TIMEOUT_MS,
        context: 'handoff-soft-open',
      });

      if (result.success) {
        diag.entry('🎭 Soft open banter complete');
      } else if (result.usedFallback) {
        diag.entry('🎭 Soft open used fallback banter');
      } else {
        log.warn('🎭 Soft open failed - continuing');
      }
    } catch (err) {
      log.warn({ error: String(err) }, '🎭 Soft open error - skipping');
      // Non-critical - continue with handoff
    }
  }

  /**
   * Handle arriving welcome (new persona's greeting) - called AFTER voice switch.
   */
  private async handleArrivingWelcome(
    toPersonaId: string,
    context: BanterContext
  ): Promise<void> {
    log.debug({ to: toPersonaId }, '🎭 Generating arriving welcome');

    try {
      // Build banter context
      const banterCtx = this.buildBanterContextFromServices(context.reason);

      // Get LLM-driven arriving banter
      const fromPersonaId = (this.services.handoffState as { previousAgent?: string })?.previousAgent || 'ferni';
      const llmBanter = getLLMDrivenBanter(fromPersonaId, toPersonaId, banterCtx);
      const arrivingInstructions = llmBanter.arriving;
      const fallbackBanter = getArrivingBanter(toPersonaId, fromPersonaId);

      // Use safeGenerateReply
      const result = await safeGenerateReply(this.session, {
        instructions: arrivingInstructions.instructions,
        allowInterruptions: false,
        fallbackMessage: fallbackBanter ?? undefined,
        timeoutMs: BANTER_TIMEOUT_MS,
        context: 'handoff-arriving-welcome',
      });

      if (result.success) {
        diag.entry('🎭 Arriving welcome complete');
      } else if (result.usedFallback) {
        diag.entry('🎭 Arriving welcome used fallback');
      } else {
        log.warn('🎭 Arriving welcome failed - continuing');
      }
    } catch (err) {
      log.warn({ error: String(err) }, '🎭 Arriving welcome error - skipping');
      // Non-critical - continue with handoff
    }
  }

  // ========================================================================
  // HELPER METHODS
  // ========================================================================

  /**
   * Build banter context from session services.
   */
  private buildBanterContextFromServices(reason?: string) {
    const history = this.services.historyTracker?.getSessionHistory?.();
    const handoffCount = this.services.handoffState?.handoffHistory?.length || 0;
    const relationshipContext = this.services.sessionPriming?.relationshipContext;

    return buildBanterContext({
      historyTopics: history?.metadata?.topicsDiscussed,
      detectedEmotion: this.services.sessionPriming?.emotionalContext?.lastEmotion,
      handoffCount,
      isFirstTimeUser: (this.services.userProfile?.totalConversations || 0) <= 1,
      userName: this.services.userProfile?.name,
      handoffReason: reason,
      totalSessions: this.services.userProfile?.totalConversations,
      relationshipStage: relationshipContext?.stage,
    });
  }

  /**
   * Get recent messages for context continuation.
   */
  private getRecentMessages(): string[] {
    try {
      // Try different methods that might be available
      const historyTracker = this.services.historyTracker as {
        getRecentHistory?: (count: number) => Array<{ role: string; content: string }>;
        getSessionHistory?: () => { entries?: Array<{ role: string; content: string }> };
      };

      if (historyTracker?.getRecentHistory) {
        const history = historyTracker.getRecentHistory(5);
        return history.map((entry) => `${entry.role}: ${entry.content}`);
      }

      if (historyTracker?.getSessionHistory) {
        const sessionHistory = historyTracker.getSessionHistory();
        const entries = sessionHistory?.entries?.slice(-5) || [];
        return entries.map((entry) => `${entry.role}: ${entry.content}`);
      }

      return [];
    } catch {
      return [];
    }
  }

  /**
   * Get cognitive context for the new persona.
   */
  private getCognitiveContext(): string | undefined {
    try {
      // cognitiveStyle might be nested or have different shapes
      const sessionPriming = this.services.sessionPriming as {
        cognitiveStyle?: { style?: string; pace?: string };
        userStyle?: string;
      };

      if (sessionPriming?.cognitiveStyle) {
        const cognitive = sessionPriming.cognitiveStyle;
        return `User communication style: ${cognitive.style || 'conversational'}. 
Preferred pace: ${cognitive.pace || 'moderate'}.`;
      }

      if (sessionPriming?.userStyle) {
        return `User style: ${sessionPriming.userStyle}`;
      }

      return undefined;
    } catch {
      return undefined;
    }
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

/**
 * Create a coordinator adapter for a session.
 */
export function createCoordinatorAdapter(config: CoordinatorAdapterConfig): CoordinatorAdapter {
  return new CoordinatorAdapter(config);
}

// ============================================================================
// SESSION MANAGEMENT
// ============================================================================

const adapters = new Map<string, CoordinatorAdapter>();

/**
 * Get or create adapter for a session.
 */
export function getSessionAdapter(
  sessionId: string,
  config?: CoordinatorAdapterConfig
): CoordinatorAdapter | null {
  let adapter = adapters.get(sessionId);

  if (!adapter && config) {
    adapter = createCoordinatorAdapter(config);
    adapters.set(sessionId, adapter);
  }

  return adapter || null;
}

/**
 * Remove adapter for a session.
 */
export function removeSessionAdapter(sessionId: string): void {
  const adapter = adapters.get(sessionId);
  if (adapter) {
    adapter.dispose();
    adapters.delete(sessionId);
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export default CoordinatorAdapter;

