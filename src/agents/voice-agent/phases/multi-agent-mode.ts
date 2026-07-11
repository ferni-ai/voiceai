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
}

export interface MultiAgentModeResult {
  /** Whether multi-agent mode was activated */
  activated: boolean;
  /** Cleanup function (if activated) */
  cleanup?: () => Promise<void>;
  /** Error message if activation failed */
  error?: string;
}

// ============================================================================
// HANDOFF LOCK (Promise-based mutex pattern)
// ============================================================================

interface HandoffLock {
  acquire: () => Promise<boolean>;
  release: () => void;
}

/**
 * Creates a promise-based mutex for handoff synchronization.
 * Prevents concurrent handoff requests from racing.
 */
function createHandoffLock(): HandoffLock {
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
  } = config;

  // Check if multi-agent mode is enabled (default: true, set MULTI_AGENT_MODE=false to disable)
  const MULTI_AGENT_MODE = process.env.MULTI_AGENT_MODE !== 'false';
  if (!MULTI_AGENT_MODE) {
    return { activated: false };
  }

  process.stderr.write(`[multi-agent-mode] 🎭 Starting multi-agent session\n`);

  try {
    // Import dependencies
    const { initializeMultiAgentSession, handleHandoffFromDataChannel } =
      await import('../../multi-agent/multi-agent-entry.js');
    const { createGroupVoiceIntegration } =
      await import('../../group-conversation/voice-integration.js');
    const { handoffEvents } = await import('../../../handoff/index.js');

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

              // Send handoff_acknowledged
              await publishDataMessage(ctx.room, {
                type: 'handoff_acknowledged',
                target: message.target,
                success: true,
                timestamp: Date.now(),
              });

              // Send handoff_started
              await publishDataMessage(ctx.room, {
                type: 'handoff_started',
                target: message.target,
                newAgent: message.target,
                previousAgent: currentPersonaId,
                timestamp: Date.now(),
              });

              const result = await handleHandoffFromDataChannel(
                multiAgentResult.orchestrator,
                message.target!,
                message.reason || 'User requested via UI',
                services
              );

              if (!result.success) {
                process.stderr.write(`[multi-agent-mode] 🎭 Handoff failed: ${result.error}\n`);
                await publishDataMessage(ctx.room, {
                  type: 'handoff_failed',
                  target: message.target,
                  error: result.error,
                  rollbackTo: currentPersonaId,
                  timestamp: Date.now(),
                });
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

    // Handler for LLM-triggered handoffs via voiceSwitch events
    const voiceSwitchHandler = (event: { persona: { id: string }; previousAgentId?: string }) => {
      void (async () => {
        const targetPersonaId = event.persona?.id;
        if (!targetPersonaId) {
          process.stderr.write(`[multi-agent-mode] 🎭 voiceSwitch event missing persona ID\n`);
          return;
        }

        const acquired = await handoffLock.acquire();
        if (!acquired) {
          process.stderr.write(
            `[multi-agent-mode] 🔒 Handoff already in progress, ignoring LLM request for ${targetPersonaId}\n`
          );
          return;
        }

        try {
          const currentPersonaId =
            event.previousAgentId || multiAgentResult.orchestrator.getCurrentPersonaId();
          process.stderr.write(
            `[multi-agent-mode] 🎭 LLM-triggered handoff via voiceSwitch: ${currentPersonaId || 'unknown'} → ${targetPersonaId}\n`
          );

          // Send handoff_started
          await publishDataMessage(ctx.room, {
            type: 'handoff_started',
            target: targetPersonaId,
            newAgent: targetPersonaId,
            previousAgent: currentPersonaId,
            timestamp: Date.now(),
          });

          const result = await handleHandoffFromDataChannel(
            multiAgentResult.orchestrator,
            targetPersonaId,
            'LLM requested handoff',
            services
          );

          if (!result.success) {
            process.stderr.write(`[multi-agent-mode] 🎭 LLM handoff failed: ${result.error}\n`);
            await publishDataMessage(ctx.room, {
              type: 'handoff_failed',
              target: targetPersonaId,
              error: result.error,
              rollbackTo: currentPersonaId,
              timestamp: Date.now(),
            });
          }

          // Emit handoffHandlerComplete
          handoffEvents.emit('handoffHandlerComplete', {
            targetId: targetPersonaId,
            success: result.success,
            greetingSpoken: result.success,
            instructionsUpdated: result.success,
            error: result.error,
          });
        } finally {
          handoffLock.release();
        }
      })();
    };

    handoffEvents.on('voiceSwitch', voiceSwitchHandler);
    process.stderr.write(
      `[multi-agent-mode] 🎭 voiceSwitch handler registered for LLM-triggered handoffs\n`
    );

    // Wait for disconnect — also end when room empties (agent can stay
    // "connected" after the user leaves / room delete).
    await new Promise<void>((resolve) => {
      let settled = false;
      let emptySinceMs: number | null = null;
      const EMPTY_ROOM_GRACE_MS = 5_000;
      const finish = (reason: string): void => {
        if (settled) return;
        settled = true;
        clearInterval(poll);
        clearTimeout(safety);
        process.stderr.write(`[multi-agent-mode] 🎭 Ending session wait (${reason})\n`);
        resolve();
      };

      ctx.room?.once('disconnected', () => {
        finish('room.disconnected');
      });

      ctx.room?.on('participantDisconnected', () => {
        if ((ctx.room?.remoteParticipants?.size ?? 0) === 0) {
          emptySinceMs = emptySinceMs ?? Date.now();
        }
      });

      const poll = setInterval(() => {
        if (!ctx.room?.isConnected) {
          finish('room.!isConnected');
          return;
        }
        const remoteCount = ctx.room?.remoteParticipants?.size ?? 0;
        if (remoteCount === 0) {
          emptySinceMs = emptySinceMs ?? Date.now();
          if (Date.now() - emptySinceMs >= EMPTY_ROOM_GRACE_MS) {
            finish('empty_room');
          }
        } else {
          emptySinceMs = null;
        }
      }, 1_000);

      const safety = setTimeout(() => finish('timeout'), 10 * 60_000);
    });

    // Cleanup
    handoffEvents.off('voiceSwitch', voiceSwitchHandler);
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

    return { activated: true };
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
