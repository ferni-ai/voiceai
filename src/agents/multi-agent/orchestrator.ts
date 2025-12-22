/**
 * Multi-Agent Orchestrator
 *
 * Manages multiple persona agents in a single LiveKit room.
 * Enables natural handoffs where both agents speak with their real voices.
 *
 * Architecture:
 * - Each persona runs as its own agent with its own Gemini session
 * - Only one agent is "active" (listening/speaking) at a time
 * - Handoffs spawn a new agent, allow natural banter, then remove old agent
 *
 * Benefits over single-agent persona switching:
 * - No prompt leakage (each agent has clean system prompt)
 * - Real voices (each agent has its own TTS voice)
 * - Natural banter (both can speak during handoff)
 *
 * @module agents/multi-agent/orchestrator
 */

import type { JobContext } from '@livekit/agents';
import type { Room, RemoteParticipant } from '@livekit/rtc-node';
import { getLogger } from '../../utils/safe-logger.js';
import { diag } from '../../services/diagnostic-logger.js';

const log = getLogger();

// ============================================================================
// TYPES
// ============================================================================

export interface PersonaAgent {
  /** Unique ID for this agent instance */
  id: string;
  /** Persona ID (e.g., 'ferni', 'peter-john') */
  personaId: string;
  /** Whether this agent is currently active (listening/speaking) */
  isActive: boolean;
  /** The agent's session (Gemini + TTS) */
  session: unknown;
  /** Cleanup function to dispose the agent */
  cleanup: () => Promise<void>;
  /** Function to make the agent speak */
  say: (text: string, options?: { allowInterruptions?: boolean }) => void;
  /** Function to mute/unmute the agent */
  setMuted: (muted: boolean) => void;
  /** Function to interrupt any ongoing speech/generation */
  interrupt: () => void;
}

export interface HandoffRequest {
  /** Target persona to handoff to */
  targetPersonaId: string;
  /** Reason for handoff */
  reason: string;
  /** Conversation context to pass to new agent */
  conversationSummary?: string;
  /** Recent messages for context */
  recentMessages?: string[];
  /** User's name if known */
  userName?: string;
  /** User's emotional state */
  userEmotion?: string;
}

export interface HandoffResult {
  success: boolean;
  newAgentId?: string;
  error?: string;
  /** Time taken for the handoff in ms */
  durationMs?: number;
}

export interface OrchestratorConfig {
  /** LiveKit job context */
  ctx: JobContext;
  /** LiveKit room */
  room: Room;
  /** User participant */
  userParticipant: RemoteParticipant;
  /** Factory function to create a new persona agent */
  createPersonaAgent: (personaId: string, context: AgentCreationContext) => Promise<PersonaAgent>;
  /** Callback when handoff completes */
  onHandoffComplete?: (fromPersona: string, toPersona: string) => void;
  /** Session ID for logging */
  sessionId: string;
}

export interface AgentCreationContext {
  /** Room to join */
  room: Room;
  /** User participant to listen to */
  userParticipant: RemoteParticipant;
  /** Conversation context from previous agent */
  conversationSummary?: string;
  /** Recent messages */
  recentMessages?: string[];
  /** User profile info */
  userName?: string;
  /** Is this a handoff (vs initial join)? */
  isHandoff: boolean;
  /** Previous persona (for handoff context) */
  previousPersonaId?: string;
}

// ============================================================================
// ORCHESTRATOR CLASS
// ============================================================================

/**
 * Multi-Agent Orchestrator
 *
 * Manages the lifecycle of multiple persona agents in a room.
 */
export class AgentOrchestrator {
  private readonly ctx: JobContext;
  private readonly room: Room;
  private readonly userParticipant: RemoteParticipant;
  private readonly createPersonaAgent: OrchestratorConfig['createPersonaAgent'];
  private readonly onHandoffComplete?: OrchestratorConfig['onHandoffComplete'];
  private readonly sessionId: string;

  /** All agents currently in the room */
  private agents: Map<string, PersonaAgent> = new Map();

  /** Currently active agent */
  private activeAgentId: string | null = null;

  /** Handoff in progress */
  private handoffInProgress = false;

  constructor(config: OrchestratorConfig) {
    this.ctx = config.ctx;
    this.room = config.room;
    this.userParticipant = config.userParticipant;
    this.createPersonaAgent = config.createPersonaAgent;
    this.onHandoffComplete = config.onHandoffComplete;
    this.sessionId = config.sessionId;

    log.info({ sessionId: this.sessionId }, '🎭 AgentOrchestrator created');
  }

  // ==========================================================================
  // PUBLIC API
  // ==========================================================================

  /**
   * Start the orchestrator with an initial persona.
   */
  async start(initialPersonaId: string): Promise<PersonaAgent> {
    log.info({ personaId: initialPersonaId }, '🎭 Starting orchestrator with initial persona');

    const agent = await this.spawnAgent(initialPersonaId, {
      room: this.room,
      userParticipant: this.userParticipant,
      isHandoff: false,
    });

    this.setActiveAgent(agent.id);
    return agent;
  }

  /**
   * Execute a handoff to a new persona.
   *
   * Flow:
   * 1. Current agent says goodbye (in their voice)
   * 2. Spawn new agent
   * 3. New agent greets (in their voice)
   * 4. Old agent is removed
   */
  async handoff(request: HandoffRequest): Promise<HandoffResult> {
    const startTime = Date.now();

    if (this.handoffInProgress) {
      return { success: false, error: 'Handoff already in progress' };
    }

    const currentAgent = this.getActiveAgent();
    if (!currentAgent) {
      return { success: false, error: 'No active agent to handoff from' };
    }

    if (currentAgent.personaId === request.targetPersonaId) {
      return { success: false, error: `Already with ${request.targetPersonaId}` };
    }

    this.handoffInProgress = true;
    const previousPersonaId = currentAgent.personaId;
    diag.entry(`🎭 Handoff starting: ${previousPersonaId} → ${request.targetPersonaId}`);

    try {
      // Step 1: INTERRUPT + MUTE old agent - stop any ongoing generation immediately
      // This prevents backchannels, mid-response audio, and any LLM-generated content
      currentAgent.interrupt();
      currentAgent.setMuted(true);
      diag.entry(`🎭 Old agent interrupted and muted: ${previousPersonaId}`);

      // Small delay to ensure interrupt takes effect
      await this.waitForSpeechComplete(100);

      // Step 2: Current agent says goodbye (controlled banter only)
      await this.agentSaysGoodbye(currentAgent, request.targetPersonaId);

      // Step 3: Interrupt again after goodbye to clear any auto-responses
      currentAgent.interrupt();

      // Step 4: CRITICAL - Close old agent BEFORE spawning new one
      // This prevents two Gemini sessions from both listening and responding!
      diag.entry(`🎭 Closing old agent session: ${previousPersonaId}`);
      await this.removeAgent(currentAgent.id);

      // Step 5: Spawn new agent (it will join the room)
      // Now there's only ONE Gemini session listening
      const newAgent = await this.spawnAgent(request.targetPersonaId, {
        room: this.room,
        userParticipant: this.userParticipant,
        conversationSummary: request.conversationSummary,
        recentMessages: request.recentMessages,
        userName: request.userName,
        isHandoff: true,
        previousPersonaId,
      });

      // Step 6: IMMEDIATELY mute and interrupt new agent
      // This prevents any auto-generated LLM responses before our greeting
      newAgent.setMuted(true);
      newAgent.interrupt();

      // Step 7: Switch active agent
      this.setActiveAgent(newAgent.id);

      // Step 8: New agent greets (controlled banter only)
      await this.agentGreets(newAgent, previousPersonaId, request);

      // Step 9: Interrupt again to clear any queued auto-responses
      newAgent.interrupt();
      await this.waitForSpeechComplete(50);

      // Step 10: UNMUTE - Now the new agent can respond normally
      newAgent.setMuted(false);
      diag.entry(`🎭 New agent unmuted and ready: ${request.targetPersonaId}`);

      const durationMs = Date.now() - startTime;
      diag.entry(`🎭 Handoff complete: ${previousPersonaId} → ${request.targetPersonaId} (${durationMs}ms)`);

      // Notify callback
      this.onHandoffComplete?.(previousPersonaId, request.targetPersonaId);

      return {
        success: true,
        newAgentId: newAgent.id,
        durationMs,
      };
    } catch (error) {
      log.error({ error: String(error) }, '🎭 Handoff failed');
      return {
        success: false,
        error: String(error),
        durationMs: Date.now() - startTime,
      };
    } finally {
      this.handoffInProgress = false;
    }
  }

  /**
   * Get the currently active agent.
   */
  getActiveAgent(): PersonaAgent | null {
    if (!this.activeAgentId) return null;
    return this.agents.get(this.activeAgentId) || null;
  }

  /**
   * Get current persona ID.
   */
  getCurrentPersonaId(): string | null {
    return this.getActiveAgent()?.personaId || null;
  }

  /**
   * Check if a handoff is in progress.
   */
  isHandoffInProgress(): boolean {
    return this.handoffInProgress;
  }

  /**
   * Cleanup all agents and shutdown.
   */
  async shutdown(): Promise<void> {
    log.info({ sessionId: this.sessionId }, '🎭 Orchestrator shutting down');

    for (const agent of this.agents.values()) {
      try {
        await agent.cleanup();
      } catch (err) {
        log.warn({ error: String(err), agentId: agent.id }, 'Error cleaning up agent');
      }
    }

    this.agents.clear();
    this.activeAgentId = null;
  }

  // ==========================================================================
  // PRIVATE METHODS
  // ==========================================================================

  /**
   * Spawn a new persona agent.
   */
  private async spawnAgent(
    personaId: string,
    context: AgentCreationContext
  ): Promise<PersonaAgent> {
    log.info({ personaId, isHandoff: context.isHandoff }, '🎭 Spawning new agent');

    const agent = await this.createPersonaAgent(personaId, context);
    this.agents.set(agent.id, agent);

    diag.entry(`🎭 Agent spawned: ${personaId} (${agent.id})`);
    return agent;
  }

  /**
   * Set the active agent (the one that listens/speaks).
   */
  private setActiveAgent(agentId: string): void {
    // Mute previous active agent
    if (this.activeAgentId && this.activeAgentId !== agentId) {
      const prevAgent = this.agents.get(this.activeAgentId);
      if (prevAgent) {
        prevAgent.isActive = false;
        prevAgent.setMuted(true);
      }
    }

    // Activate new agent
    const newAgent = this.agents.get(agentId);
    if (newAgent) {
      newAgent.isActive = true;
      newAgent.setMuted(false);
      this.activeAgentId = agentId;
      log.info({ personaId: newAgent.personaId }, '🎭 Active agent changed');
    }
  }

  /**
   * Remove an agent from the room.
   */
  private async removeAgent(agentId: string): Promise<void> {
    const agent = this.agents.get(agentId);
    if (!agent) return;

    log.info({ personaId: agent.personaId, agentId }, '🎭 Removing agent');

    try {
      await agent.cleanup();
    } catch (err) {
      log.warn({ error: String(err) }, 'Error during agent cleanup');
    }

    this.agents.delete(agentId);
  }

  /**
   * Make the current agent say goodbye.
   * Note: Agent should be muted except for this banter.
   */
  private async agentSaysGoodbye(
    agent: PersonaAgent,
    targetPersonaId: string
  ): Promise<void> {
    const goodbye = this.getGoodbyePhrase(agent.personaId, targetPersonaId);

    if (goodbye) {
      diag.entry(`🎭 ${agent.personaId} saying goodbye: "${goodbye.slice(0, 50)}..."`);
      
      // Temporarily unmute for the goodbye banter only
      agent.setMuted(false);
      agent.say(goodbye, { allowInterruptions: false });

      // Wait for goodbye to complete, then re-mute
      await this.waitForSpeechComplete(1500);
      agent.setMuted(true);
    }
  }

  /**
   * Make the new agent greet the user.
   * Note: Agent should be muted except for this banter.
   */
  private async agentGreets(
    agent: PersonaAgent,
    previousPersonaId: string,
    request: HandoffRequest
  ): Promise<void> {
    const greeting = this.getGreetingPhrase(agent.personaId, previousPersonaId, request);

    if (greeting) {
      diag.entry(`🎭 ${agent.personaId} greeting: "${greeting.slice(0, 50)}..."`);
      
      // Temporarily unmute for the greeting banter only
      agent.setMuted(false);
      agent.say(greeting, { allowInterruptions: false });

      // Wait for greeting to complete
      await this.waitForSpeechComplete(2000);
      // Note: Agent will be unmuted after this in the main handoff flow
    }
  }

  /**
   * Wait for speech to complete (simple timeout-based).
   */
  private waitForSpeechComplete(estimatedMs: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, estimatedMs));
  }

  /**
   * Get a goodbye phrase for the departing agent.
   */
  private getGoodbyePhrase(fromPersonaId: string, toPersonaId: string): string | null {
    try {
      // Import dynamically to avoid circular deps
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { getHandoffBanter } = require('../../services/engagement/team-engagement.js');
      return getHandoffBanter(fromPersonaId, toPersonaId);
    } catch {
      // Fallback if module not available (e.g., in tests)
      return `Let me hand you off to ${toPersonaId}.`;
    }
  }

  /**
   * Get a greeting phrase for the arriving agent.
   */
  private getGreetingPhrase(
    toPersonaId: string,
    fromPersonaId: string,
    _request: HandoffRequest
  ): string | null {
    try {
      // Import dynamically to avoid circular deps
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { getArrivingBanter } = require('../../services/engagement/team-engagement.js');
      return getArrivingBanter(toPersonaId, fromPersonaId);
    } catch {
      // Fallback if module not available (e.g., in tests)
      return "Hey! What's up?";
    }
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

/**
 * Create a new AgentOrchestrator.
 */
export function createAgentOrchestrator(config: OrchestratorConfig): AgentOrchestrator {
  return new AgentOrchestrator(config);
}

