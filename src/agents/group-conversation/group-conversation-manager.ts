/**
 * Group Conversation Manager
 *
 * The central orchestrator for multi-participant conversations.
 * Coordinates Team Roundtables (multiple agents) and Conference Calls (external people).
 *
 * "What if Ferni could be in your real conversations?"
 *
 * @module agents/group-conversation/group-conversation-manager
 */

import { EventEmitter } from 'events';
import type { Room, RemoteParticipant } from '@livekit/rtc-node';
import { getLogger } from '../../utils/safe-logger.js';
import { diag } from '../../services/diagnostic-logger.js';
import {
  ParticipantRegistry,
  createParticipantRegistry,
  createUserParticipant,
  createAgentParticipant,
} from './participant-registry.js';
import {
  TurnTakingEngine,
  createTurnTakingEngine,
  DEFAULT_TURN_TAKING_CONFIG,
} from './turn-taking.js';
import type {
  GroupConversation,
  GroupParticipant,
  ConversationMode,
  TurnTakingConfig,
  AttributedUtterance,
  GroupConversationSummary,
  GroupConversationEvent,
  RoundtableConfig,
  AddParticipantRequest,
  AddParticipantResult,
  CollaborationMode,
} from './types.js';

const log = getLogger();

// ============================================================================
// TYPES
// ============================================================================

export interface GroupConversationConfig {
  /** LiveKit room */
  room: Room;

  /** User participant info */
  userParticipant: RemoteParticipant;

  /** Session ID for logging */
  sessionId: string;

  /** User ID */
  userId: string;

  /** Conversation mode */
  mode: ConversationMode;

  /** Turn-taking configuration */
  turnTakingConfig?: Partial<TurnTakingConfig>;

  /** Topic for the conversation */
  topic?: string;

  /** Callback when speaker changes */
  onSpeakerChanged?: (speakerId: string | null) => void;

  /** Callback when participant joins/leaves */
  onParticipantChanged?: (event: GroupConversationEvent) => void;

  /** Callback when utterance is added */
  onUtterance?: (utterance: AttributedUtterance) => void;
}

export interface GroupConversationManagerResult {
  /** The group conversation instance */
  conversation: GroupConversation;

  /** Cleanup function */
  cleanup: () => Promise<void>;
}

// ============================================================================
// GROUP CONVERSATION MANAGER
// ============================================================================

/**
 * GroupConversationManager
 *
 * Orchestrates multi-participant conversations with intelligent turn-taking,
 * speaker attribution, and natural conversation flow.
 */
export class GroupConversationManager extends EventEmitter {
  private readonly config: GroupConversationConfig;
  private readonly registry: ParticipantRegistry;
  private readonly turnEngine: TurnTakingEngine;
  private readonly conversation: GroupConversation;

  private utteranceCounter = 0;
  private isActive = false;

  constructor(config: GroupConversationConfig) {
    super();
    this.config = config;

    // Initialize conversation
    this.conversation = {
      roomId: config.room.name ?? `room_${Date.now()}`,
      sessionId: config.sessionId,
      mode: config.mode,
      participants: new Map(),
      initiatorId: '',
      topic: config.topic,
      turnTaking: { ...DEFAULT_TURN_TAKING_CONFIG, ...config.turnTakingConfig },
      transcript: [],
      startedAt: new Date(),
    };

    // Initialize participant registry
    this.registry = createParticipantRegistry(config.sessionId);

    // Initialize turn-taking engine
    this.turnEngine = createTurnTakingEngine(this.conversation, config.turnTakingConfig);

    // Wire up events
    this.setupEventHandlers();

    log.info(
      { sessionId: config.sessionId, mode: config.mode, topic: config.topic },
      '🎙️ GroupConversationManager created'
    );
  }

  // ==========================================================================
  // PUBLIC API
  // ==========================================================================

  /**
   * Start the group conversation
   */
  async start(): Promise<void> {
    if (this.isActive) {
      log.warn({ sessionId: this.config.sessionId }, 'Group conversation already active');
      return;
    }

    this.isActive = true;

    // Add the user as initiator
    const user = createUserParticipant(
      this.config.userParticipant.identity,
      this.config.userParticipant.name ?? undefined
    );
    this.addParticipant(user);
    this.conversation.initiatorId = user.id;

    diag.entry(`🎙️ Group conversation started: ${this.config.mode}`);
    this.emit('session_started', { conversation: this.conversation });

    log.info(
      {
        sessionId: this.config.sessionId,
        mode: this.config.mode,
        initiatorId: user.id,
      },
      '🎙️ Group conversation started'
    );
  }

  /**
   * Add a Ferni team member to the conversation
   */
  addTeamMember(
    personaId: string,
    name: string,
    role: 'moderator' | 'expert' = 'expert'
  ): GroupParticipant {
    const participant = createAgentParticipant(personaId, name, role);
    this.addParticipant(participant);

    log.info(
      { personaId, name, role, sessionId: this.config.sessionId },
      '🎙️ Team member added to group conversation'
    );

    return participant;
  }

  /**
   * Remove a participant from the conversation
   */
  removeParticipant(participantId: string, reason?: string): boolean {
    const participant = this.registry.get(participantId);
    if (!participant) return false;

    this.registry.remove(participantId, reason);
    this.conversation.participants.delete(participantId);

    this.emit('participant_left', { participantId, reason });
    this.config.onParticipantChanged?.({
      type: 'participant_left',
      participantId,
      reason,
    });

    return true;
  }

  /**
   * Record an utterance with speaker attribution
   */
  addUtterance(
    speakerId: string,
    text: string,
    durationMs: number = 0,
    analysis?: Partial<Pick<AttributedUtterance, 'sentiment' | 'topics' | 'actionItems'>>
  ): AttributedUtterance {
    const participant = this.registry.get(speakerId);
    if (!participant) {
      log.warn({ speakerId }, 'Unknown speaker for utterance');
    }

    const utterance: AttributedUtterance = {
      id: `utt_${++this.utteranceCounter}`,
      speakerId,
      speakerName: participant?.name ?? 'Unknown',
      speakerType: participant?.type ?? 'human',
      text,
      timestamp: new Date(),
      durationMs,
      ...analysis,
    };

    this.conversation.transcript.push(utterance);
    this.emit('utterance_added', { utterance });
    this.config.onUtterance?.(utterance);

    return utterance;
  }

  /**
   * Notify that a participant started speaking
   */
  onSpeakingStart(participantId: string): void {
    this.turnEngine.onSpeakingStart(participantId);
    this.registry.updateSpeakingState(participantId, 'speaking');

    this.config.onSpeakerChanged?.(participantId);
    this.emit('speaker_changed', {
      newSpeakerId: participantId,
      previousSpeakerId: null,
    });
  }

  /**
   * Notify that a participant stopped speaking
   */
  onSpeakingEnd(participantId: string): void {
    this.turnEngine.onSpeakingEnd(participantId);
    this.registry.updateSpeakingState(participantId, 'listening');

    this.config.onSpeakerChanged?.(null);
  }

  /**
   * Check if an agent should speak now
   */
  shouldAgentSpeak(agentParticipantId: string): boolean {
    return this.turnEngine.shouldAgentSpeak(agentParticipantId);
  }

  /**
   * Request to speak (for polite turn-taking)
   */
  requestToSpeak(participantId: string): void {
    this.turnEngine.requestToSpeak(participantId);
  }

  /**
   * Get the current conversation state
   */
  getConversation(): GroupConversation {
    return this.conversation;
  }

  /**
   * Get all participants
   */
  getParticipants(): GroupParticipant[] {
    return this.registry.getAll();
  }

  /**
   * Get participants by type
   */
  getParticipantsByType(type: 'human' | 'agent' | 'external'): GroupParticipant[] {
    return this.registry.getByType(type);
  }

  /**
   * Get the current speaker
   */
  getCurrentSpeaker(): GroupParticipant | null {
    return this.turnEngine.getCurrentSpeaker();
  }

  /**
   * Get recent transcript for context
   */
  getRecentTranscript(lastN: number = 10): string {
    return this.conversation.transcript
      .slice(-lastN)
      .map((u) => `[${u.speakerName}]: ${u.text}`)
      .join('\n');
  }

  /**
   * Get conversation summary (for handoffs, context, etc.)
   */
  async getSummary(): Promise<GroupConversationSummary> {
    // TODO: Use LLM to generate intelligent summary
    const participantSummaries = new Map<
      string,
      { utteranceCount: number; speakingTimeMs: number; mainContributions: string[] }
    >();

    for (const participant of this.registry.getAll()) {
      const utterances = this.conversation.transcript.filter((u) => u.speakerId === participant.id);
      participantSummaries.set(participant.id, {
        utteranceCount: utterances.length,
        speakingTimeMs: utterances.reduce((sum, u) => sum + u.durationMs, 0),
        mainContributions: utterances.slice(0, 3).map((u) => u.text.slice(0, 100)),
      });
    }

    return {
      keyPoints: [], // TODO: Extract via LLM
      actionItems: [], // TODO: Extract via LLM
      decisions: [], // TODO: Extract via LLM
      participantSummaries,
    };
  }

  /**
   * Get turn-taking statistics
   */
  getTurnStats() {
    return this.turnEngine.getTurnStats();
  }

  /**
   * End the group conversation
   */
  async end(reason?: string): Promise<GroupConversationSummary> {
    if (!this.isActive) {
      log.warn({ sessionId: this.config.sessionId }, 'Group conversation already ended');
      return this.getSummary();
    }

    this.isActive = false;
    this.conversation.endedAt = new Date();

    const summary = await this.getSummary();

    diag.entry(`🎙️ Group conversation ended: ${reason ?? 'normal'}`);
    this.emit('session_ended', { summary, reason });

    log.info(
      {
        sessionId: this.config.sessionId,
        duration: this.conversation.endedAt.getTime() - this.conversation.startedAt.getTime(),
        participantCount: this.registry.count,
        utteranceCount: this.conversation.transcript.length,
      },
      '🎙️ Group conversation ended'
    );

    return summary;
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    if (this.isActive) {
      await this.end('cleanup');
    }

    this.turnEngine.destroy();
    this.registry.destroy();
    this.removeAllListeners();

    log.debug({ sessionId: this.config.sessionId }, '🎙️ GroupConversationManager cleaned up');
  }

  // ==========================================================================
  // PRIVATE METHODS
  // ==========================================================================

  /**
   * Add a participant to both registry and conversation
   */
  private addParticipant(participant: GroupParticipant): void {
    this.registry.add(participant);
    this.conversation.participants.set(participant.id, participant);

    this.emit('participant_joined', { participant });
    this.config.onParticipantChanged?.({
      type: 'participant_joined',
      participant,
    });
  }

  /**
   * Set up event handlers
   */
  private setupEventHandlers(): void {
    // Forward registry events
    this.registry.on('participant_joined', (data) => {
      this.emit('participant_joined', data);
    });

    this.registry.on('participant_left', (data) => {
      this.emit('participant_left', data);
    });

    // Forward turn-taking events
    this.turnEngine.on('speaker_changed', (data) => {
      this.config.onSpeakerChanged?.(data.speakerId);
    });

    this.turnEngine.on('silence', (data) => {
      this.emit('silence', data);
    });
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

/**
 * Create and start a group conversation
 */
export async function createGroupConversation(
  config: GroupConversationConfig
): Promise<GroupConversationManagerResult> {
  const manager = new GroupConversationManager(config);
  await manager.start();

  return {
    conversation: manager.getConversation(),
    cleanup: () => manager.cleanup(),
  };
}
