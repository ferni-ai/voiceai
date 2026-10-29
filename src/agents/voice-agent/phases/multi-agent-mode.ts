/**
 * Multi-Agent Mode Phase
 *
 * When enabled, each persona runs as a separate agent with its own LLM session.
 * This provides natural handoffs with real voices and no prompt leakage.
 *
 * Key features:
 * - Orchestrator-based persona coordination
 * - Promise-based handoff locking (prevents race conditions)
 * - Both UI-triggered and LLM-triggered handoffs
 * - Group conversation integration (Team Roundtables, Conference Calls)
 *
 * @module voice-agent/phases/multi-agent-mode
 */

import type { JobContext } from '@livekit/agents';
import type { RemoteParticipant, Room } from '@livekit/rtc-node';
import type { SessionServices } from '../../../services/types.js';
import type { Persona } from '../../../personas/types.js';
import type { UserData } from '../types.js';
import { startInCallChannels } from '../../multi-agent/live-data-context.js';
import type { CallerChecks } from '../data-sender.js';
import { startResumeLookup } from '../../multi-agent/resume-after-drop.js';
import { waitForSessionEnd, type WatchedRoom } from './session-end-watch.js';
import { demoCallCap, startDemoCallCap } from './demo-call-cap.js';
import { isLiveCustomAgent } from '../../shared/custom-agent-live.js';

// ============================================================================
// TYPES
// ============================================================================

export interface MultiAgentModeConfig {
  /** LiveKit job context */
  ctx: JobContext;
  /** Connected room */
  room: Room;
  /** User participant */
  participant: RemoteParticipant;
  /** Initial persona for the session */
  sessionPersona: Persona;
  /** Session services container */
  services: SessionServices;
  /** User data for the session */
  userData: UserData;
  /** Session ID */
  sessionId: string;
  /** User ID */
  userId: string | undefined;
  /** Session cleanup tracker */
  unregisterSession: (sessionId: string, reason: string) => void;
  /** Who is on the call (caller-recognition.ts), for the in-call data channel */
  callerChecks?: CallerChecks;
}

export interface MultiAgentModeResult {
  /** Whether multi-agent mode was activated */
  activated: boolean;
  /** Cleanup function (if activated) */
  cleanup?: () => Promise<void>;
  /** Error message if activation failed */
  error?: string;
  /** Why the session wait ended (e.g. 'empty_room', 'room.disconnected', 'timeout') */
  endReason?: string;
}

// ============================================================================
// HANDOFF LOCK (Promise-based mutex pattern)
// ============================================================================

export interface HandoffLock {
  acquire: () => Promise<boolean>;
  release: () => void;
  /** A handoff holds the lock now (HANDOFF_EARLY_GOODBYE: no goodbye then) */
  held: () => boolean;
}

/**
 * Creates a promise-based mutex for handoff synchronization.
 * Prevents concurrent handoff requests from racing.
 */
export function createHandoffLock(): HandoffLock {
  let handoffInProgress = false;
  let handoffPromise: Promise<void> = Promise.resolve();
  let releaseHandoffLock: (() => void) | null = null;

  return {
    /**
     * Acquires the handoff lock. Returns true if acquired, false if already locked.
     * Uses promise chaining to ensure proper async synchronization.
     */
    acquire: async (): Promise<boolean> => {
      // Wait for any previous handoff to complete
      await handoffPromise;
      // Double-check after await (prevents race where two waiters both proceed)
      if (handoffInProgress) {
        return false;
      }
      handoffInProgress = true;
      // Create new promise for waiters
      handoffPromise = new Promise<void>((resolve) => {
        releaseHandoffLock = resolve;
      });
      return true;
    },

    /**
     * Releases the handoff lock, allowing next waiter to proceed.
     */
    release: (): void => {
      handoffInProgress = false;
      if (releaseHandoffLock) {
        releaseHandoffLock();
        releaseHandoffLock = null;
      }
    },

    held: (): boolean => handoffInProgress,
  };
}

// ============================================================================
// DATA CHANNEL HELPERS
// ============================================================================

/**
 * Publishes a JSON message to the room's data channel.
 */
async function publishDataMessage(
  room: Room | undefined,
  message: Record<string, unknown>
): Promise<void> {
  if (!room?.localParticipant) return;
  const encoder = new TextEncoder();
  await room.localParticipant.publishData(encoder.encode(JSON.stringify(message)), {
    reliable: true,
  });
}

// ============================================================================
// MAIN FUNCTION
// ============================================================================

/**
 * Attempts to run the session in multi-agent mode.
 *
 * If multi-agent mode is enabled (MULTI_AGENT_MODE env var), this sets up:
 * - Multi-agent orchestrator with persona coordination
 * - Handoff locking to prevent race conditions
 * - Data channel handlers for UI-triggered handoffs
 * - voiceSwitch event handlers for LLM-triggered handoffs
 * - Group conversation integration
 *
 * @returns Result indicating whether multi-agent mode was activated
 */
export async function runMultiAgentMode(
  config: MultiAgentModeConfig
): Promise<MultiAgentModeResult> {
  const {
    ctx,
    room,
    participant,
    sessionPersona,
    services,
    userData,
    sessionId,
    userId,
    unregisterSession,
    callerChecks,
  } = config;

  // Check if multi-agent mode is enabled (default: true, set MULTI_AGENT_MODE=false to disable)
  const MULTI_AGENT_MODE = process.env.MULTI_AGENT_MODE !== 'false';
  // CUSTOM_AGENT_LIVE: the orchestrator builds bundled personas only, so a loaded custom
  // agent runs as the single-agent session (custom-agent-live.ts)
  if (!MULTI_AGENT_MODE || isLiveCustomAgent(sessionPersona)) {
    return { activated: false };
  }

  process.stderr.write(`[multi-agent-mode] 🎭 Starting multi-agent session\n`);

  try {
    // Import dependencies
    const { initializeMultiAgentSession, handleHandoffFromDataChannel } =
      await import('../../multi-agent/multi-agent-entry.js');
    const { createGroupVoiceIntegration } =
      await import('../../group-conversation/voice-integration.js');
    const { roundtableAgentsForCall } =
      await import('../../group-conversation/session-roundtable-agents.js');
    const { handoffEvents } = await import('../../../handoff/index.js');
    const handoffMsgs = await import('../../multi-agent/handoff-messages.js');
    const { llmHandoffHandler } = await import('../../multi-agent/llm-handoff.js');
    const { startEarlyGoodbye } = await import('../../multi-agent/early-goodbye-call.js');

    // RESUME_AFTER_DROP: look for a call that dropped moments ago while the agent builds
    startResumeLookup(sessionId, userId, services.realtimeConversationId);

    // Initialize multi-agent session
    const multiAgentResult = await initializeMultiAgentSession({
      ctx,
      room,
      userParticipant: participant,
      initialPersonaId: sessionPersona.id,
      services,
      userData,
      sessionId,
      userId,
      // ⚡ FAST-AGENT-JOIN: Defer handler wiring until after greeting starts
      deferHandlers: true,
      onHandoffComplete: (from: string, to: string) => {
        process.stderr.write(`[multi-agent-mode] 🎭 Handoff complete: ${from} → ${to}\n`);
        void publishDataMessage(ctx.room, {
          type: 'handoff_complete',
          from,
          target: to,
          timestamp: Date.now(),
        });
      },
    });

    // Verify orchestrator has an active agent
    const activePersona = multiAgentResult.orchestrator.getCurrentPersonaId();
    if (!activePersona) {
      await publishDataMessage(ctx.room, {
        type: 'multi_agent_unavailable',
        reason: 'Orchestrator has no active agent after initialization',
        fallbackMode: 'single-agent',
        timestamp: Date.now(),
      });
      throw new Error(
        'Multi-agent orchestrator has no active agent after initialization - falling back to single-agent'
      );
    }
    process.stderr.write(
      `[multi-agent-mode] 🎭 Multi-agent orchestrator ready with active persona: ${activePersona}\n`
    );

    // Initialize group conversation integration
    type GroupVoiceIntegration = Awaited<ReturnType<typeof createGroupVoiceIntegration>>;
    let groupConversationIntegration: GroupVoiceIntegration | null = null;
    if (ctx.room && participant) {
      groupConversationIntegration = createGroupVoiceIntegration({
        ctx,
        room: ctx.room,
        userParticipant: participant,
        sessionId,
        userId,
        webhookBaseUrl: process.env.WEBHOOK_BASE_URL ?? 'https://api.ferni.ai',
        createRoundtableAgent: roundtableAgentsForCall(
          () => multiAgentResult.orchestrator.getActiveAgent()?.session as never
        ),
      });
      process.stderr.write(`[multi-agent-mode] 🎙️ Group conversation integration initialized\n`);
    }

    // Create handoff lock for synchronization
    const handoffLock = createHandoffLock();

    // Data channel handler for UI-triggered handoffs
    const dataHandler = (data: Uint8Array, _participant?: { identity: string }): void => {
      void (async () => {
        try {
          const decoder = new TextDecoder();
          const rawMessage = decoder.decode(data);
          process.stderr.write(
            `[multi-agent-mode] 📨 Data received: ${rawMessage.slice(0, 200)}\n`
          );
          const message = JSON.parse(rawMessage) as {
            type?: string;
            target?: string;
            reason?: string;
          };

          // Handle group conversation messages
          if (message.type?.startsWith('group_') && groupConversationIntegration) {
            await groupConversationIntegration.handleDataChannelMessage(
              message as Parameters<typeof groupConversationIntegration.handleDataChannelMessage>[0]
            );
            return;
          }

          if (message.type === 'handoff_request') {
            const acquired = await handoffLock.acquire();
            if (!acquired) {
              process.stderr.write(
                `[multi-agent-mode] 🔒 Handoff already in progress, ignoring request for ${message.target}\n`
              );
              return;
            }

            try {
              process.stderr.write(
                `[multi-agent-mode] 🎭 Multi-agent handoff request: ${message.target}\n`
              );

              const currentPersonaId = multiAgentResult.orchestrator.getCurrentPersonaId();

              const target = handoffMsgs.knownHandoffTarget(message.target); // known personas only
              if (!target) {
                const failed = handoffMsgs.unknownTargetFailedMessage(currentPersonaId);
                await publishDataMessage(ctx.room, failed);
                return;
              }

              // handoff_acknowledged, then handoff_started and handoff_progress
              for (const m of handoffMsgs.handoffStartMessages(target, currentPersonaId, true)) {
                await publishDataMessage(ctx.room, m);
              }

              const result = await handleHandoffFromDataChannel(
                multiAgentResult.orchestrator,
                target,
                'User requested via UI',
                services
              );

              if (!result.success) {
                process.stderr.write(`[multi-agent-mode] 🎭 Handoff failed: ${result.error}\n`);
                const failed = handoffMsgs.handoffFailedMessage(target, result, currentPersonaId);
                await publishDataMessage(ctx.room, failed.message);
                // A locked teammate: the agent on the call says the decline out loud too
                if (failed.say) multiAgentResult.orchestrator.getActiveAgent()?.say(failed.say);
              }
            } finally {
              handoffLock.release();
            }
          }
        } catch {
          // Ignore non-JSON messages
        }
      })();
    };

    // Register data channel handler
    if (ctx.room) {
      ctx.room.on('dataReceived', dataHandler);
      process.stderr.write(
        `[multi-agent-mode] 📡 Data channel handler registered on room: ${ctx.room.name}\n`
      );
    } else {
      process.stderr.write(
        `[multi-agent-mode] ⚠️ WARNING: ctx.room is null, data channel won't work!\n`
      );
    }

    // Handoffs the LLM asks for: its handoff tool emits voiceSwitch (llm-handoff.ts)
    const voiceSwitchHandler = llmHandoffHandler({
      orchestrator: multiAgentResult.orchestrator,
      services,
      lock: handoffLock,
      publish: (m) => publishDataMessage(ctx.room, m),
      runHandoff: handleHandoffFromDataChannel,
    });

    handoffEvents.on('voiceSwitch', voiceSwitchHandler);
    // HANDOFF_EARLY_GOODBYE: the handoff tool says the goodbye once its checks pass
    const stopEarlyGoodbye = startEarlyGoodbye(multiAgentResult.orchestrator, config, handoffLock);
    // In-call controls and Ferni's teammate introductions, for the agent speaking now
    const callParts = { room: ctx.room, ctx, services, userId, sessionId, sessionPersona, callerChecks };
    const stopInCallChannels = startInCallChannels(callParts, multiAgentResult.orchestrator);
    process.stderr.write(
      `[multi-agent-mode] 🎭 voiceSwitch handler registered for LLM-triggered handoffs\n`
    );

    // Until the room disconnects or empties, or the call goes idle (session-end-watch.ts)
    // DEMO_CALL_CAP=on: a demo room ends at its session_duration_minutes (demo-call-cap.ts)
    const demoLimitMs = demoCallCap(ctx.room?.metadata || ctx.job.room?.metadata);
    const demoCap =
      demoLimitMs === null
        ? null
        : startDemoCallCap(demoLimitMs, (text) =>
            multiAgentResult.orchestrator.getActiveAgent()?.say(text, { allowInterruptions: false })
          );
    let endReason: Awaited<ReturnType<typeof waitForSessionEnd>>;
    try {
      endReason = await waitForSessionEnd(ctx.room as unknown as WatchedRoom, demoCap?.endOptions);
    } finally {
      demoCap?.stop();
    }
    process.stderr.write(`[multi-agent-mode] 🎭 Ending session wait (${endReason})\n`);

    // Cleanup
    handoffEvents.off('voiceSwitch', voiceSwitchHandler);
    stopEarlyGoodbye();
    stopInCallChannels();
    ctx.room?.off('dataReceived', dataHandler);
    if (groupConversationIntegration) {
      await groupConversationIntegration.cleanup();
      process.stderr.write(`[multi-agent-mode] 🎙️ Group conversation cleaned up\n`);
    }
    await multiAgentResult.cleanup();
    process.stderr.write(`[multi-agent-mode] 🎭 Multi-agent session ended\n`);

    // Stop auto-save interval
    if (userId) {
      try {
        const { stopAutoSave } = await import('../../../services/intelligence-persistence.js');
        stopAutoSave(userId);
        process.stderr.write(`[multi-agent-mode] 🛑 Stopped auto-save for user ${userId}\n`);
      } catch (autoSaveErr) {
        process.stderr.write(`[multi-agent-mode] ⚠️ Failed to stop auto-save: ${autoSaveErr}\n`);
      }
    }

    // Unregister session
    unregisterSession(sessionId, 'multi_agent_clean_exit');

    return { activated: true, endReason };
  } catch (err) {
    process.stderr.write(
      `[multi-agent-mode] 🎭 Multi-agent mode failed, falling back to single-agent: ${err}\n`
    );

    // Notify frontend
    try {
      await publishDataMessage(ctx.room, {
        type: 'multi_agent_unavailable',
        reason: String(err),
        fallbackMode: 'single-agent',
        timestamp: Date.now(),
      });
    } catch {
      // Ignore - room may not be available
    }

    return {
      activated: false,
      error: String(err),
    };
  }
}
