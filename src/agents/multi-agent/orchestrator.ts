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
import type { UserData } from '../shared/types.js';
import { getPersonaDisplayName } from '../../personas/voice-registry.js';

// Predictive handoff - pre-briefings for specialist personas
import { getPreBriefing, markBriefingUsed } from '../../services/automation/predictive-handoff.js';
import type { PreBriefing } from '../../services/automation/predictive-handoff.js';

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
  /**
   * ⚡ FAST-AGENT-JOIN: Wire handlers after greeting.
   * Only present when deferHandlers=true. Called automatically after greeting.
   */
  wireHandlers?: () => Promise<void>;
  /**
   * User data - needed for greeting awareness (so LLM knows what was said)
   */
  userData?: UserData;
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
  /** User ID for predictive handoff pre-briefings */
  userId?: string;
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
  private readonly userId?: string;

  /** All agents currently in the room */
  private agents = new Map<string, PersonaAgent>();

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
    this.userId = config.userId;

    // CRITICAL: Increase MaxListeners to prevent warnings during multi-agent handoffs
    // Each AgentSession adds listeners to the Room (trackPublished, localTrackPublished, etc.)
    // With 6 possible personas and concurrent handoffs, we can have up to 20+ listeners
    // Default is 10 which causes MaxListenersExceededWarning
    if (this.room && typeof (this.room as any).setMaxListeners === 'function') {
      (this.room as any).setMaxListeners(30);
      log.debug({ sessionId: this.sessionId }, '🎭 Room MaxListeners set to 30 for multi-agent mode');
    }

    log.info({ sessionId: this.sessionId, userId: this.userId }, '🎭 AgentOrchestrator created');
  }

  // ==========================================================================
  // PUBLIC API
  // ==========================================================================

  /**
   * Start the orchestrator with an initial persona.
   *
   * This spawns the initial agent AND generates an initial greeting
   * so the user doesn't wait in silence.
   */
  async start(initialPersonaId: string): Promise<PersonaAgent> {
    log.info({ personaId: initialPersonaId }, '🎭 Starting orchestrator with initial persona');

    const agent = await this.spawnAgent(initialPersonaId, {
      room: this.room,
      userParticipant: this.userParticipant,
      isHandoff: false,
    });

    log.info(
      { personaId: initialPersonaId, agentId: agent.id, agentsMapSize: this.agents.size },
      '🎭 Agent spawned, setting as active'
    );

    this.setActiveAgent(agent.id);

    // Verify the agent is now active
    const verifyActive = this.getActiveAgent();
    if (!verifyActive) {
      log.error(
        { personaId: initialPersonaId, agentId: agent.id, activeAgentId: this.activeAgentId },
        '🎭 CRITICAL: Agent was not set as active after spawn!'
      );
      throw new Error(`Failed to set active agent: ${agent.id}`);
    }
    log.info(
      { personaId: verifyActive.personaId, activeAgentId: this.activeAgentId },
      '🎭 Agent confirmed active'
    );

    // Trigger initial greeting - the model will respond based on its system prompt
    // NOTE: We use minimal instructions to avoid conflicting with function-calling format
    void this.generateInitialGreeting(agent);

    return agent;
  }

  /**
   * Generate the initial greeting for a freshly spawned agent.
   * This runs in background so start() returns quickly.
   *
   * SIMPLIFIED: Uses warm-greeting.ts directly with agent.say() wrapper.
   * No LLM call, no timeouts, no failures - just speaks immediately.
   *
   * ⚡ FAST-AGENT-JOIN: If handlers were deferred, wire them after greeting starts.
   * This reduces critical path by ~500ms (handlers wire in parallel with speech).
   *
   * FIX: Stores greeting text in userData so LLM knows what was said (greeting awareness).
   */
  private async generateInitialGreeting(agent: PersonaAgent): Promise<void> {
    try {
      // OPTIMIZATION: Removed 100ms delay - session is ready by the time this is called
      // The delay was causing noticeable lag before Ferni speaks

      // Import the warm greeting generator (already has per-persona, time-aware, randomized greetings)
      const { generateWarmGreeting } = await import('../shared/warm-greeting.js');

      // Build context for "Better than Human" greetings
      const ctx = {
        hour: new Date().getHours(),
        isReturningUser: false, // Initial greeting = new session
        relationshipStage: 'friend' as const, // Default for multi-agent
      };

      // Generate context-aware, persona-specific greeting with SSML
      const greeting = generateWarmGreeting(agent.personaId, ctx);

      // ================================================================
      // GREETING AWARENESS: Store greeting so LLM knows what it said
      // This prevents the LLM from repeating greetings or being confused
      // The turn-handler injects this on turn 0 as system context
      // ================================================================
      if (agent.userData) {
        agent.userData.greetingText = greeting;
        agent.userData.greetingInjected = false;
        log.info(
          { personaId: agent.personaId, greetingPreview: greeting.slice(0, 50) },
          '📝 Greeting stored for LLM awareness'
        );
      }

      // Speak via agent.say wrapper (uses coordinated speech)
      // FIX: Disable interruptions for initial greeting - iOS background noise was cutting it off
      diag.entry(`🎭 ${agent.personaId} greeting: "${greeting.slice(0, 50)}..."`);
      agent.say(greeting, { allowInterruptions: false });

      // ⚡ FAST-AGENT-JOIN: Wire deferred handlers in background after greeting starts
      // Handlers run in parallel with speech - user hears greeting while handlers wire
      if (agent.wireHandlers) {
        agent
          .wireHandlers()
          .then(() => {
            log.info({ personaId: agent.personaId }, '⚡ Deferred handlers wired after greeting');
          })
          .catch((err) => {
            // 🐛 FIX: Don't swallow errors! Music handler won't work if this fails.
            log.error(
              { error: String(err), personaId: agent.personaId },
              '🚨 CRITICAL: Deferred handler wiring FAILED! Music/tools may not work.'
            );
          });
      }
    } catch (err) {
      log.warn({ error: String(err), personaId: agent.personaId }, '🎭 Initial greeting failed');
    }
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

    // Pre-flight state validation with detailed diagnostics
    log.info(
      {
        targetPersonaId: request.targetPersonaId,
        reason: request.reason,
        currentState: {
          activeAgentId: this.activeAgentId,
          agentsMapSize: this.agents.size,
          agentIds: Array.from(this.agents.keys()),
          handoffInProgress: this.handoffInProgress,
        },
      },
      '🎭 Handoff requested - validating state'
    );

    if (this.handoffInProgress) {
      log.warn({ targetPersonaId: request.targetPersonaId }, '🎭 Handoff already in progress');
      return { success: false, error: 'Handoff already in progress' };
    }

    // CRITICAL: Set flag IMMEDIATELY after check to prevent TOCTOU race condition
    // This ensures concurrent calls can't both pass the above check
    this.handoffInProgress = true;

    const currentAgent = this.getActiveAgent();
    if (!currentAgent) {
      // Reset flag since we're not proceeding with handoff
      this.handoffInProgress = false;
      // Detailed diagnostic logging to understand the failure
      log.error(
        {
          activeAgentId: this.activeAgentId,
          agentsMapSize: this.agents.size,
          agentIds: Array.from(this.agents.keys()),
          targetPersona: request.targetPersonaId,
          // Check if activeAgentId exists but agent was removed
          activeAgentInMap: this.activeAgentId ? this.agents.has(this.activeAgentId) : 'n/a',
        },
        '🎭 CRITICAL: No active agent to handoff from - this indicates initialization failure or agent was removed'
      );
      return {
        success: false,
        error: `No active agent to handoff from (activeAgentId: ${this.activeAgentId}, agents: ${this.agents.size})`,
      };
    }

    if (currentAgent.personaId === request.targetPersonaId) {
      // Reset flag since we're not proceeding with handoff
      this.handoffInProgress = false;
      log.debug({ personaId: currentAgent.personaId }, '🎭 Already with target persona');
      return { success: false, error: `Already with ${request.targetPersonaId}` };
    }
    const previousPersonaId = currentAgent.personaId;
    diag.entry(`🎭 Handoff starting: ${previousPersonaId} → ${request.targetPersonaId}`);

    try {
      // ================================================================
      // STEP 1: Let old agent say goodbye naturally
      // ================================================================
      const step1Start = Date.now();
      log.info(
        { from: previousPersonaId, to: request.targetPersonaId },
        '🎭 [HANDOFF STEP 1/5] Starting goodbye speech...'
      );
      await this.agentSaysGoodbye(currentAgent, request.targetPersonaId);
      log.info(
        { from: previousPersonaId, durationMs: Date.now() - step1Start },
        '🎭 [HANDOFF STEP 1/5] ✅ Goodbye complete'
      );

      // ================================================================
      // STEP 2: Close old agent
      // ================================================================
      const step2Start = Date.now();
      log.info(
        { agentId: currentAgent.id, personaId: previousPersonaId },
        '🎭 [HANDOFF STEP 2/5] Closing old agent...'
      );
      diag.entry(`🎭 Closing ${previousPersonaId}`);
      await this.removeAgent(currentAgent.id);
      log.info(
        { personaId: previousPersonaId, durationMs: Date.now() - step2Start },
        '🎭 [HANDOFF STEP 2/5] ✅ Old agent closed'
      );

      // ================================================================
      // STEP 3: Spawn new agent (with predictive pre-briefing if available)
      // ================================================================
      const step3Start = Date.now();
      log.info(
        { targetPersonaId: request.targetPersonaId, isHandoff: true },
        '🎭 [HANDOFF STEP 3/5] Spawning new agent...'
      );

      // 🧠 PREDICTIVE HANDOFF: Fetch pre-briefing for the specialist
      let preBriefing: PreBriefing | null = null;
      let enhancedSummary = request.conversationSummary;
      if (this.userId) {
        try {
          preBriefing = await getPreBriefing(this.userId, request.targetPersonaId as Parameters<typeof getPreBriefing>[1]);
          if (preBriefing) {
            // Enhance the conversation summary with pre-briefing context
            const briefingContext = [
              `[PRE-BRIEFING FROM FERNI TEAM]`,
              preBriefing.context,
              preBriefing.suggestedApproach ? `Suggested approach: ${preBriefing.suggestedApproach}` : '',
              preBriefing.relevantHistory.length > 0 ? `Relevant history: ${preBriefing.relevantHistory.join('; ')}` : '',
            ].filter(Boolean).join('\n');

            enhancedSummary = enhancedSummary
              ? `${briefingContext}\n\n${enhancedSummary}`
              : briefingContext;

            log.info(
              { userId: this.userId, targetPersona: request.targetPersonaId, briefingId: preBriefing.id },
              '🧠 [PREDICTIVE] Pre-briefing applied to handoff context'
            );
          }
        } catch (err) {
          // Non-critical - continue without pre-briefing
          log.debug({ error: String(err) }, 'Pre-briefing fetch skipped');
        }
      }

      const newAgent = await this.spawnAgent(request.targetPersonaId, {
        room: this.room,
        userParticipant: this.userParticipant,
        conversationSummary: enhancedSummary,
        recentMessages: request.recentMessages,
        userName: request.userName,
        isHandoff: true,
        previousPersonaId,
      });
      log.info(
        {
          newAgentId: newAgent.id,
          personaId: request.targetPersonaId,
          durationMs: Date.now() - step3Start,
          hadPreBriefing: !!preBriefing,
        },
        '🎭 [HANDOFF STEP 3/5] ✅ New agent spawned'
      );

      // ================================================================
      // STEP 4: Switch active agent
      // ================================================================
      const step4Start = Date.now();
      log.info({ newAgentId: newAgent.id }, '🎭 [HANDOFF STEP 4/5] Setting new agent as active...');
      this.setActiveAgent(newAgent.id);
      log.info(
        { activeAgentId: this.activeAgentId, durationMs: Date.now() - step4Start },
        '🎭 [HANDOFF STEP 4/5] ✅ Active agent switched'
      );

      // ================================================================
      // STEP 5: New agent greets naturally
      // ================================================================
      const step5Start = Date.now();
      log.info(
        { personaId: request.targetPersonaId },
        '🎭 [HANDOFF STEP 5/5] New agent greeting...'
      );
      await this.agentGreets(newAgent, previousPersonaId, request);
      log.info(
        { personaId: request.targetPersonaId, durationMs: Date.now() - step5Start },
        '🎭 [HANDOFF STEP 5/5] ✅ Greeting complete'
      );

      diag.entry(`🎭 ${request.targetPersonaId} ready`);

      const durationMs = Date.now() - startTime;
      log.info(
        {
          from: previousPersonaId,
          to: request.targetPersonaId,
          durationMs,
          stepTimes: {
            goodbye: Date.now() - step1Start,
            close: step2Start - step1Start,
            spawn: step3Start - step2Start,
            activate: step4Start - step3Start,
            greet: step5Start - step4Start,
          },
        },
        '🎭 [HANDOFF] ✅✅✅ HANDOFF COMPLETE ✅✅✅'
      );
      diag.entry(
        `🎭 Handoff complete: ${previousPersonaId} → ${request.targetPersonaId} (${durationMs}ms)`
      );

      // Notify callback
      this.onHandoffComplete?.(previousPersonaId, request.targetPersonaId);

      // 🧠 PREDICTIVE HANDOFF: Mark pre-briefing as used (non-blocking)
      if (preBriefing && this.userId) {
        markBriefingUsed(this.userId, preBriefing.id).catch((err) => {
          log.debug({ error: String(err) }, 'Failed to mark briefing as used');
        });
      }

      return {
        success: true,
        newAgentId: newAgent.id,
        durationMs,
      };
    } catch (error) {
      const durationMs = Date.now() - startTime;
      log.error(
        {
          error: String(error),
          stack: error instanceof Error ? error.stack : undefined,
          from: previousPersonaId,
          to: request.targetPersonaId,
          durationMs,
          agentsMapSize: this.agents.size,
          agentIds: Array.from(this.agents.keys()),
        },
        '🎭 [HANDOFF] ❌❌❌ HANDOFF FAILED ❌❌❌'
      );
      return {
        success: false,
        error: String(error),
        durationMs,
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
    const startTime = Date.now();
    log.info(
      {
        personaId,
        isHandoff: context.isHandoff,
        previousPersonaId: context.previousPersonaId,
        hasConversationSummary: !!context.conversationSummary,
        recentMessageCount: context.recentMessages?.length || 0,
      },
      '🎭 [spawnAgent] Starting agent creation...'
    );

    log.debug({ personaId }, '🎭 [spawnAgent] Calling createPersonaAgent factory...');
    const factoryStart = Date.now();
    const agent = await this.createPersonaAgent(personaId, context);
    log.info(
      { personaId, factoryDurationMs: Date.now() - factoryStart },
      '🎭 [spawnAgent] ✅ Factory returned agent'
    );

    // Validate the agent was created with a valid ID
    if (!agent.id) {
      log.error(
        { personaId, agentKeys: Object.keys(agent) },
        '🎭 [spawnAgent] ❌ CRITICAL: Agent created without ID'
      );
      throw new Error(`Agent created for ${personaId} has no ID`);
    }

    log.debug({ personaId, agentId: agent.id }, '🎭 [spawnAgent] Adding agent to map...');

    // Add to map and verify
    this.agents.set(agent.id, agent);
    const verifyAdded = this.agents.get(agent.id);
    if (!verifyAdded) {
      log.error(
        { personaId, agentId: agent.id, mapSize: this.agents.size },
        '🎭 [spawnAgent] ❌ CRITICAL: Agent was set but cannot be retrieved from map'
      );
      throw new Error(`Failed to add agent ${agent.id} to map`);
    }

    log.info(
      {
        personaId,
        agentId: agent.id,
        agentsMapSize: this.agents.size,
        agentIds: Array.from(this.agents.keys()),
        totalSpawnDurationMs: Date.now() - startTime,
      },
      '🎭 [spawnAgent] ✅ Agent spawned and added to map'
    );

    diag.entry(`🎭 Agent spawned: ${personaId} (${agent.id})`);
    return agent;
  }

  /**
   * Set the active agent (the one that listens/speaks).
   * @throws Error if agent with given ID is not found in the agents map
   */
  private setActiveAgent(agentId: string): void {
    // Validate the agent exists before doing anything
    const newAgent = this.agents.get(agentId);
    if (!newAgent) {
      log.error(
        {
          agentId,
          agentsMapSize: this.agents.size,
          knownAgentIds: Array.from(this.agents.keys()),
        },
        '🎭 CRITICAL: setActiveAgent called with unknown agent ID'
      );
      throw new Error(`Cannot set active agent: agent ${agentId} not found in agents map`);
    }

    // Mute previous active agent
    if (this.activeAgentId && this.activeAgentId !== agentId) {
      const prevAgent = this.agents.get(this.activeAgentId);
      if (prevAgent) {
        prevAgent.isActive = false;
        prevAgent.setMuted(true);
        log.debug({ prevPersonaId: prevAgent.personaId }, '🎭 Previous agent muted');
      }
    }

    // Activate new agent
    newAgent.isActive = true;
    newAgent.setMuted(false);
    this.activeAgentId = agentId;
    log.info(
      { personaId: newAgent.personaId, agentId, agentsMapSize: this.agents.size },
      '🎭 Active agent set successfully'
    );
  }

  /**
   * Remove an agent from the room.
   */
  private async removeAgent(agentId: string): Promise<void> {
    const agent = this.agents.get(agentId);
    if (!agent) {
      log.warn({ agentId, agentsMapSize: this.agents.size }, '🎭 [removeAgent] Agent not found');
      return;
    }

    const startTime = Date.now();
    log.info(
      { personaId: agent.personaId, agentId, agentsMapSize: this.agents.size },
      '🎭 [removeAgent] Starting cleanup...'
    );

    try {
      const cleanupStart = Date.now();
      log.debug({ personaId: agent.personaId }, '🎭 [removeAgent] Calling agent.cleanup()...');
      await agent.cleanup();
      log.info(
        { personaId: agent.personaId, cleanupDurationMs: Date.now() - cleanupStart },
        '🎭 [removeAgent] ✅ agent.cleanup() completed'
      );
    } catch (err) {
      log.warn(
        { error: String(err), stack: err instanceof Error ? err.stack : undefined },
        '🎭 [removeAgent] ⚠️ Error during agent cleanup'
      );
    }

    this.agents.delete(agentId);
    log.info(
      {
        personaId: agent.personaId,
        agentId,
        newAgentsMapSize: this.agents.size,
        remainingAgentIds: Array.from(this.agents.keys()),
        totalDurationMs: Date.now() - startTime,
      },
      '🎭 [removeAgent] ✅ Agent removed from map'
    );
  }

  /**
   * Make the current agent say goodbye naturally.
   *
   * HANDOFF FIX: Added retry and direct session fallback to ensure goodbye plays
   * even if the coordinated speech system has issues (matching agentGreets pattern).
   */
  private async agentSaysGoodbye(agent: PersonaAgent, targetPersonaId: string): Promise<void> {
    const goodbye = this.getGoodbyePhrase(agent.personaId, targetPersonaId);
    const displayName = getPersonaDisplayName(targetPersonaId);
    const textToSpeak = goodbye || `Let me get ${displayName} for you.`;

    log.info(
      {
        from: agent.personaId,
        to: targetPersonaId,
        hasGoodbye: !!goodbye,
        goodbyePreview: textToSpeak?.slice(0, 60),
      },
      '🎭 [GOODBYE] Preparing goodbye speech...'
    );

    const duration = this.estimateSpeechDuration(textToSpeak);
    diag.entry(`🎭 ${agent.personaId} goodbye: "${textToSpeak.slice(0, 50)}..."`);
    log.info(
      { personaId: agent.personaId, estimatedDurationMs: duration },
      '🎭 [GOODBYE] Speaking...'
    );

    // HANDOFF FIX: Try coordinated speech first, fall back to direct session.say
    // This ensures the goodbye plays even if speech coordination has issues.
    try {
      agent.say(textToSpeak, { allowInterruptions: false });
    } catch (sayError) {
      log.warn(
        { personaId: agent.personaId, error: String(sayError) },
        '🎭 [GOODBYE] Coordinated say failed, trying direct session speak...'
      );

      // Fallback: Try direct session.say if coordinated speech fails
      try {
        const session = agent.session as { say?: (text: string, opts?: unknown) => void };
        if (session?.say) {
          session.say(textToSpeak, { allowInterruptions: false });
          log.info({ personaId: agent.personaId }, '🎭 [GOODBYE] Direct session speak succeeded');
        }
      } catch (directError) {
        log.error(
          { personaId: agent.personaId, error: String(directError) },
          '🎭 [GOODBYE] ❌ Both coordinated and direct speech failed!'
        );
        // Don't throw - handoff should still complete even without goodbye
      }
    }

    await this.waitForSpeechComplete(duration);
    log.info({ personaId: agent.personaId }, '🎭 [GOODBYE] Wait complete');
  }

  /**
   * Make the new agent greet the user warmly.
   *
   * HANDOFF FIX: Added retry and direct session fallback to ensure greeting plays
   * even if the coordinated speech system has issues.
   */
  private async agentGreets(
    agent: PersonaAgent,
    previousPersonaId: string,
    request: HandoffRequest
  ): Promise<void> {
    const greeting = this.getGreetingPhrase(agent.personaId, previousPersonaId, request);
    const textToSpeak = greeting || "Hey! What's up?";

    log.info(
      {
        to: agent.personaId,
        from: previousPersonaId,
        hasGreeting: !!greeting,
        greetingPreview: textToSpeak?.slice(0, 60),
      },
      '🎭 [GREETING] Preparing greeting speech...'
    );

    const duration = this.estimateSpeechDuration(textToSpeak);
    diag.entry(`🎭 ${agent.personaId} greeting: "${textToSpeak.slice(0, 50)}..."`);
    log.info(
      { personaId: agent.personaId, estimatedDurationMs: duration },
      '🎭 [GREETING] Speaking...'
    );

    // HANDOFF FIX: Try coordinated speech first, fall back to direct session.say
    // This ensures the greeting plays even if speech coordination has issues.
    try {
      agent.say(textToSpeak, { allowInterruptions: false });
    } catch (sayError) {
      log.warn(
        { personaId: agent.personaId, error: String(sayError) },
        '🎭 [GREETING] Coordinated say failed, trying direct session speak...'
      );

      // Fallback: Try direct session.say if coordinated speech fails
      try {
        const session = agent.session as { say?: (text: string, opts?: unknown) => void };
        if (session?.say) {
          session.say(textToSpeak, { allowInterruptions: false });
          log.info({ personaId: agent.personaId }, '🎭 [GREETING] Direct session speak succeeded');
        }
      } catch (directError) {
        log.error(
          { personaId: agent.personaId, error: String(directError) },
          '🎭 [GREETING] ❌ Both coordinated and direct speech failed!'
        );
        // Don't throw - handoff should still complete even without greeting
      }
    }

    // ⚡ FAST-AGENT-JOIN: Wire deferred handlers in background after greeting starts
    // Handlers run in parallel with speech - user hears greeting while handlers wire
    // BUG FIX: This was missing for handoff agents! Without it, transcript/tools don't work.
    if (agent.wireHandlers) {
      agent
        .wireHandlers()
        .then(() => {
          log.info({ personaId: agent.personaId }, '⚡ Deferred handlers wired after handoff greeting');
        })
        .catch((err) => {
          log.error(
            { error: String(err), personaId: agent.personaId },
            '🚨 CRITICAL: Deferred handler wiring FAILED after handoff! Tools may not work.'
          );
        });
    }

    await this.waitForSpeechComplete(duration);
    log.info({ personaId: agent.personaId }, '🎭 [GREETING] Wait complete');
  }

  /**
   * Wait for speech to complete (simple timeout-based).
   */
  private async waitForSpeechComplete(estimatedMs: number): Promise<void> {
    return new Promise<void>((resolve) => {
      setTimeout(resolve, estimatedMs);
    });
  }

  /**
   * Estimate speech duration based on text content.
   * Uses fast conversational pace for snappy handoffs.
   */
  private estimateSpeechDuration(text: string): number {
    // Extract and sum SSML break times (e.g., <break time='200ms'/>)
    const breakMatches = text.match(/<break\s+time=['"](\d+)ms['"]\s*\/>/g) || [];
    const breakTimeMs = breakMatches.reduce((total, match) => {
      const ms = parseInt(match.match(/(\d+)ms/)?.[1] || '0', 10);
      return total + ms;
    }, 0);

    // Remove SSML tags to count actual words
    const cleanText = text.replace(/<[^>]+>/g, '').trim();
    const wordCount = cleanText.split(/\s+/).filter(Boolean).length;

    // Fast conversational pace: ~200 words per minute = 300ms per word
    const speakingTimeMs = wordCount * 300;

    // Minimal buffer - TTS is fast
    const buffer = 100;

    return speakingTimeMs + breakTimeMs + buffer;
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
      // BUG FIX: Use display name instead of persona ID for natural speech
      const displayName = getPersonaDisplayName(toPersonaId);
      return `Let me hand you off to ${displayName}.`;
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
