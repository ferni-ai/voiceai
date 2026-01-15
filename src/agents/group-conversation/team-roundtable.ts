/**
 * Team Roundtable
 *
 * Enables multiple Ferni team members to be active simultaneously
 * in a collaborative conversation with the user.
 *
 * "Let's brainstorm my career with the whole team"
 *
 * @module agents/group-conversation/team-roundtable
 */

import { EventEmitter } from 'events';
import type { JobContext } from '@livekit/agents';
import type { Room, RemoteParticipant } from '@livekit/rtc-node';
import { getLogger } from '../../utils/safe-logger.js';
import { diag } from '../../services/observability/diagnostic-logger.js';
import {
  GroupConversationManager,
  type GroupConversationConfig,
} from './group-conversation-manager.js';
import { createAgentParticipant } from './participant-registry.js';
import type {
  GroupParticipant,
  RoundtableConfig,
  CollaborationMode,
  AgentMessage,
  AttributedUtterance,
} from './types.js';

const log = getLogger();

// ============================================================================
// TYPES
// ============================================================================

export interface TeamRoundtableConfig {
  /** LiveKit job context */
  ctx: JobContext;

  /** LiveKit room */
  room: Room;

  /** User participant */
  userParticipant: RemoteParticipant;

  /** Session ID */
  sessionId: string;

  /** User ID */
  userId: string;

  /** Roundtable configuration */
  roundtable: RoundtableConfig;

  /** Factory function to create agents */
  createAgent: (personaId: string, context: AgentCreationContext) => Promise<RoundtableAgent>;

  /** Callback when agent should respond */
  onAgentShouldRespond?: (agentId: string, context: ResponseContext) => void;
}

export interface AgentCreationContext {
  room: Room;
  userParticipant: RemoteParticipant;
  isRoundtable: true;
  collaborationMode: CollaborationMode;
  topic?: string;
  otherAgents: string[];
}

export interface RoundtableAgent {
  id: string;
  personaId: string;
  say: (text: string, options?: { allowInterruptions?: boolean }) => void;
  setMuted: (muted: boolean) => void;
  cleanup: () => Promise<void>;
  generateResponse: (context: ResponseContext) => Promise<string>;
}

export interface ResponseContext {
  /** Recent transcript */
  transcript: string;

  /** Last speaker */
  lastSpeaker: string;

  /** What was just said */
  lastUtterance: string;

  /** Collaboration mode */
  collaborationMode: CollaborationMode;

  /** Conversation topic */
  topic?: string;

  /** Other agents in the roundtable */
  otherAgents: Array<{ personaId: string; name: string }>;

  /** Whether this agent was directly addressed */
  wasAddressed: boolean;

  /** Suggested response type */
  suggestedResponseType?: AgentMessage['type'];
}

export interface TeamRoundtableResult {
  /** The team roundtable instance */
  roundtable: TeamRoundtable;

  /** Cleanup function */
  cleanup: () => Promise<void>;
}

// ============================================================================
// PERSONA NAME MAPPING
// ============================================================================

const PERSONA_NAMES: Record<string, string> = {
  ferni: 'Ferni',
  'peter-john': 'Peter',
  'maya-santos': 'Maya',
  'alex-chen': 'Alex',
  'jordan-taylor': 'Jordan',
  'nayan-patel': 'Nayan',
};

// ============================================================================
// TEAM ROUNDTABLE
// ============================================================================

/**
 * TeamRoundtable
 *
 * Manages a conversation with multiple active Ferni team members.
 * Handles intelligent turn-taking, agent coordination, and natural conversation flow.
 */
export class TeamRoundtable extends EventEmitter {
  private readonly config: TeamRoundtableConfig;
  private readonly manager: GroupConversationManager;
  private readonly agents = new Map<string, RoundtableAgent>();
  private readonly agentParticipants = new Map<string, GroupParticipant>();

  private isActive = false;
  private responseQueue: Array<{ agentId: string; priority: number }> = [];
  private currentResponder: string | null = null;

  constructor(config: TeamRoundtableConfig) {
    super();
    this.config = config;

    // Create the underlying group conversation manager
    this.manager = new GroupConversationManager({
      room: config.room,
      userParticipant: config.userParticipant,
      sessionId: config.sessionId,
      userId: config.userId,
      mode: 'team_roundtable',
      topic: config.roundtable.topic,
      onSpeakerChanged: this.handleSpeakerChanged.bind(this),
      onUtterance: this.handleUtterance.bind(this),
    });

    log.info(
      {
        sessionId: config.sessionId,
        personas: config.roundtable.personas,
        topic: config.roundtable.topic,
        collaborationMode: config.roundtable.collaborationMode,
      },
      '🎭 TeamRoundtable created'
    );
  }

  // ==========================================================================
  // PUBLIC API
  // ==========================================================================

  /**
   * Start the team roundtable
   */
  async start(): Promise<void> {
    if (this.isActive) {
      log.warn({ sessionId: this.config.sessionId }, 'Team roundtable already active');
      return;
    }

    const startTime = Date.now();
    this.isActive = true;

    // Start the conversation manager
    await this.manager.start();

    // Spawn all requested agents
    for (const personaId of this.config.roundtable.personas) {
      await this.spawnAgent(personaId);
    }

    const initMs = Date.now() - startTime;
    diag.entry(`🎭 Team roundtable started with ${this.agents.size} agents (${initMs}ms)`);

    // Have moderator open the session
    await this.moderatorOpens();

    this.emit('roundtable_started', {
      agents: Array.from(this.agents.keys()),
      topic: this.config.roundtable.topic,
    });

    log.info(
      {
        sessionId: this.config.sessionId,
        agentCount: this.agents.size,
        initMs,
      },
      '🎭 Team roundtable started'
    );
  }

  /**
   * Handle user input and decide which agent(s) should respond
   */
  async handleUserInput(utterance: string): Promise<void> {
    // Record the utterance
    const initiator = this.manager.getParticipants().find((p) => p.role === 'initiator');
    if (initiator) {
      this.manager.addUtterance(initiator.id, utterance);
    }

    // Parse if user addressed specific agent(s)
    const addressedAgents = this.parseAddressedAgents(utterance);

    if (addressedAgents.length > 0) {
      // User addressed specific agent(s)
      for (const personaId of addressedAgents) {
        await this.queueAgentResponse(personaId, true);
      }
    } else {
      // General question - use intelligent selection
      const respondingAgents = this.selectRespondingAgents(utterance);
      for (const personaId of respondingAgents) {
        await this.queueAgentResponse(personaId, false);
      }
    }

    // Process response queue
    await this.processResponseQueue(utterance);
  }

  /**
   * Get all active agents
   */
  getActiveAgents(): RoundtableAgent[] {
    return Array.from(this.agents.values());
  }

  /**
   * Get agent by persona ID
   */
  getAgent(personaId: string): RoundtableAgent | undefined {
    return this.agents.get(personaId);
  }

  /**
   * Check if agent should speak now (for turn-taking)
   */
  shouldAgentSpeak(personaId: string): boolean {
    const participant = this.agentParticipants.get(personaId);
    if (!participant) return false;
    return this.manager.shouldAgentSpeak(participant.id);
  }

  /**
   * End the team roundtable
   */
  async end(reason?: string): Promise<void> {
    if (!this.isActive) return;

    this.isActive = false;

    // Have moderator close the session
    await this.moderatorCloses(reason);

    // Cleanup all agents
    for (const agent of this.agents.values()) {
      try {
        await agent.cleanup();
      } catch (err) {
        log.warn({ error: String(err), personaId: agent.personaId }, 'Error cleaning up agent');
      }
    }

    this.agents.clear();
    this.agentParticipants.clear();

    await this.manager.end(reason);

    this.emit('roundtable_ended', { reason });

    log.info({ sessionId: this.config.sessionId, reason }, '🎭 Team roundtable ended');
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    if (this.isActive) {
      await this.end('cleanup');
    }

    await this.manager.cleanup();
    this.removeAllListeners();

    log.debug({ sessionId: this.config.sessionId }, '🎭 TeamRoundtable cleaned up');
  }

  // ==========================================================================
  // PRIVATE METHODS
  // ==========================================================================

  /**
   * Spawn an agent for the roundtable
   */
  private async spawnAgent(personaId: string): Promise<void> {
    const isModerator = personaId === this.config.roundtable.moderator;
    const name = PERSONA_NAMES[personaId] ?? personaId;

    // Create the agent
    const agent = await this.config.createAgent(personaId, {
      room: this.config.room,
      userParticipant: this.config.userParticipant,
      isRoundtable: true,
      collaborationMode: this.config.roundtable.collaborationMode,
      topic: this.config.roundtable.topic,
      otherAgents: this.config.roundtable.personas.filter((p) => p !== personaId),
    });

    this.agents.set(personaId, agent);

    // Add to participant registry
    const participant = createAgentParticipant(
      personaId,
      name,
      isModerator ? 'moderator' : 'expert'
    );
    this.agentParticipants.set(personaId, participant);
    this.manager.addTeamMember(personaId, name, isModerator ? 'moderator' : 'expert');

    log.info({ personaId, name, isModerator }, '🎭 Agent spawned for roundtable');
  }

  /**
   * Parse which agents were directly addressed in the utterance
   */
  private parseAddressedAgents(utterance: string): string[] {
    const addressed: string[] = [];
    const lowerUtterance = utterance.toLowerCase();

    for (const [personaId, name] of Object.entries(PERSONA_NAMES)) {
      if (this.agents.has(personaId) && lowerUtterance.includes(name.toLowerCase())) {
        addressed.push(personaId);
      }
    }

    // Check for "everyone" or "all" or "team"
    if (
      lowerUtterance.includes('everyone') ||
      lowerUtterance.includes('all of you') ||
      lowerUtterance.includes('whole team') ||
      lowerUtterance.includes("everyone's")
    ) {
      return Array.from(this.agents.keys());
    }

    return addressed;
  }

  /**
   * Select which agents should respond to a general query
   */
  private selectRespondingAgents(utterance: string): string[] {
    // Score each agent's relevance
    const scores: Array<{ personaId: string; score: number }> = [];

    for (const personaId of this.agents.keys()) {
      const score = this.calculateRelevance(personaId, utterance);
      scores.push({ personaId, score });
    }

    scores.sort((a, b) => b.score - a.score);

    // In discussion mode, top 1-2 respond initially
    const topAgents = scores.filter((s) => s.score > 0.3).slice(0, 2);

    // If no one is relevant, moderator responds
    if (topAgents.length === 0) {
      return [this.config.roundtable.moderator];
    }

    return topAgents.map((s) => s.personaId);
  }

  /**
   * Calculate how relevant an agent is to an utterance
   */
  private calculateRelevance(personaId: string, utterance: string): number {
    const lowerUtterance = utterance.toLowerCase();
    let score = 0;

    // Domain-specific keywords
    const domainKeywords: Record<string, string[]> = {
      ferni: ['feeling', 'think', 'support', 'help', 'life', 'overall'],
      'peter-john': ['research', 'data', 'market', 'analysis', 'numbers', 'facts', 'study'],
      'maya-santos': ['habit', 'routine', 'morning', 'exercise', 'sleep', 'energy', 'wellness'],
      'alex-chen': ['communicate', 'email', 'meeting', 'schedule', 'organize', 'plan'],
      'jordan-taylor': ['event', 'party', 'celebration', 'birthday', 'wedding', 'trip'],
      'nayan-patel': ['meaning', 'philosophy', 'wisdom', 'purpose', 'values', 'legacy'],
    };

    const keywords = domainKeywords[personaId] ?? [];
    for (const keyword of keywords) {
      if (lowerUtterance.includes(keyword)) {
        score += 0.2;
      }
    }

    // Boost for moderator on general questions
    if (personaId === this.config.roundtable.moderator) {
      if (lowerUtterance.includes('?') && !lowerUtterance.match(/who|what|how|why|when|where/i)) {
        score += 0.1;
      }
    }

    return Math.min(score, 1);
  }

  /**
   * Queue an agent to respond
   */
  private async queueAgentResponse(personaId: string, wasAddressed: boolean): Promise<void> {
    const priority = wasAddressed ? 10 : this.calculateRelevance(personaId, '');
    this.responseQueue.push({ agentId: personaId, priority });
    this.responseQueue.sort((a, b) => b.priority - a.priority);
  }

  /**
   * Process the response queue - have agents respond in order
   */
  private async processResponseQueue(lastUtterance: string): Promise<void> {
    while (this.responseQueue.length > 0) {
      const next = this.responseQueue.shift();
      if (!next) break;

      const agent = this.agents.get(next.agentId);
      if (!agent) continue;

      // Check turn-taking
      const participant = this.agentParticipants.get(next.agentId);
      if (participant && !this.manager.shouldAgentSpeak(participant.id)) {
        // Wait for turn
        await this.waitForTurn(participant.id);
      }

      // Generate and speak response
      this.currentResponder = next.agentId;

      const context = this.buildResponseContext(next.agentId, lastUtterance, next.priority >= 10);
      const response = await agent.generateResponse(context);

      // Record utterance
      if (participant) {
        this.manager.addUtterance(participant.id, response, this.estimateSpeechDuration(response));
        this.manager.onSpeakingStart(participant.id);
      }

      // Speak
      agent.say(response, { allowInterruptions: true });

      // Wait for speech to complete
      await this.waitForSpeechComplete(response);

      if (participant) {
        this.manager.onSpeakingEnd(participant.id);
      }

      this.currentResponder = null;

      // Small pause between agents
      if (this.responseQueue.length > 0) {
        await this.sleep(300);
      }
    }
  }

  /**
   * Build context for an agent's response
   */
  private buildResponseContext(
    personaId: string,
    lastUtterance: string,
    wasAddressed: boolean
  ): ResponseContext {
    const otherAgents = Array.from(this.agentParticipants.entries())
      .filter(([id]) => id !== personaId)
      .map(([id, p]) => ({ personaId: id, name: p.name }));

    return {
      transcript: this.manager.getRecentTranscript(10),
      lastSpeaker: 'user',
      lastUtterance,
      collaborationMode: this.config.roundtable.collaborationMode,
      topic: this.config.roundtable.topic,
      otherAgents,
      wasAddressed,
    };
  }

  /**
   * Wait for turn (with timeout)
   */
  private async waitForTurn(participantId: string, timeoutMs = 5000): Promise<void> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      if (this.manager.shouldAgentSpeak(participantId)) {
        return;
      }
      await this.sleep(100);
    }

    log.warn({ participantId }, 'Turn-taking timeout, proceeding anyway');
  }

  /**
   * Wait for speech to complete
   */
  private async waitForSpeechComplete(text: string): Promise<void> {
    const durationMs = this.estimateSpeechDuration(text);
    await this.sleep(durationMs);
  }

  /**
   * Estimate speech duration
   */
  private estimateSpeechDuration(text: string): number {
    const cleanText = text.replace(/<[^>]+>/g, '').trim();
    const wordCount = cleanText.split(/\s+/).filter(Boolean).length;
    return wordCount * 300 + 200; // 300ms per word + buffer
  }

  /**
   * Sleep utility
   */
  private async sleep(ms: number): Promise<void> {
    return new Promise<void>((resolve) => {
      setTimeout(resolve, ms);
    });
  }

  /**
   * Handle speaker changes
   */
  private handleSpeakerChanged(speakerId: string | null): void {
    this.emit('speaker_changed', { speakerId });
  }

  /**
   * Handle new utterances
   */
  private handleUtterance(utterance: AttributedUtterance): void {
    this.emit('utterance', { utterance });
  }

  /**
   * Have the moderator open the session with a warm welcome
   */
  private async moderatorOpens(): Promise<void> {
    const moderator = this.agents.get(this.config.roundtable.moderator);
    if (!moderator) return;

    const otherNames = Array.from(this.agentParticipants.entries())
      .filter(([id]) => id !== this.config.roundtable.moderator)
      .map(([, p]) => p.name);

    const greeting = this.generateOpeningGreeting(otherNames);

    const participant = this.agentParticipants.get(this.config.roundtable.moderator);
    if (participant) {
      this.manager.addUtterance(participant.id, greeting, this.estimateSpeechDuration(greeting));
      this.manager.onSpeakingStart(participant.id);
    }

    moderator.say(greeting, { allowInterruptions: true });
    await this.waitForSpeechComplete(greeting);

    if (participant) {
      this.manager.onSpeakingEnd(participant.id);
    }
  }

  /**
   * Generate opening greeting
   */
  private generateOpeningGreeting(otherNames: string[]): string {
    const { topic } = this.config.roundtable;
    const names = otherNames.join(' and ');

    if (topic) {
      return `Great, I've got ${names} here with us. We're all here to help you think through ${topic}. Who wants to start?`;
    } else {
      return `Alright, ${names} and I are all here. What's on your mind?`;
    }
  }

  /**
   * Have the moderator close the session
   */
  private async moderatorCloses(reason?: string): Promise<void> {
    const moderator = this.agents.get(this.config.roundtable.moderator);
    if (!moderator) return;

    const closing = "Thanks for bringing us all together. We're here whenever you need us.";

    moderator.say(closing, { allowInterruptions: false });
    await this.waitForSpeechComplete(closing);
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

/**
 * Create and start a team roundtable
 */
export async function createTeamRoundtable(
  config: TeamRoundtableConfig
): Promise<TeamRoundtableResult> {
  const roundtable = new TeamRoundtable(config);
  await roundtable.start();

  return {
    roundtable,
    cleanup: async () => roundtable.cleanup(),
  };
}
