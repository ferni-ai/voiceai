/**
 * Turn-Taking Engine
 *
 * Manages who speaks when in group conversations.
 * Ensures natural conversation flow without cross-talk.
 *
 * @module agents/group-conversation/turn-taking
 */

import { EventEmitter } from 'events';
import { getLogger } from '../../utils/safe-logger.js';
import type { GroupConversation, GroupParticipant, TurnTakingConfig, TurnState } from './types.js';

const log = getLogger();

// ============================================================================
// DEFAULT CONFIGURATION
// ============================================================================

export const DEFAULT_TURN_TAKING_CONFIG: TurnTakingConfig = {
  strategy: 'intelligent',
  silenceThresholdMs: 800, // Wait 800ms of silence before agent can speak
  humanPauseMs: 1200, // Wait 1.2s after human stops

  priorities: {
    humansFirst: true, // Always let humans speak
    moderatorCanInterrupt: true, // Ferni can redirect
    maxAgentTurnsWithoutHuman: 2, // Don't let agents dominate
  },

  limits: {
    maxAgentSpeakingMs: 15000, // 15s max per agent turn
    targetAgentWords: 50, // Keep it concise
  },
};

// ============================================================================
// TURN-TAKING ENGINE
// ============================================================================

/**
 * Manages turn-taking in group conversations.
 *
 * Ensures:
 * - Humans always have priority
 * - Agents don't talk over each other
 * - Conversation flows naturally
 * - Everyone gets a chance to contribute
 */
export class TurnTakingEngine extends EventEmitter {
  private config: TurnTakingConfig;
  private state: TurnState;
  private conversation: GroupConversation;
  private silenceTimer: ReturnType<typeof setTimeout> | null = null;
  private lastActivity: number = Date.now();

  constructor(conversation: GroupConversation, config?: Partial<TurnTakingConfig>) {
    super();

    this.conversation = conversation;
    this.config = { ...DEFAULT_TURN_TAKING_CONFIG, ...config };

    this.state = {
      currentSpeaker: null,
      speakingQueue: [],
      lastSpoke: new Map(),
      turnCounts: new Map(),
      silenceDurationMs: 0,
    };

    log.debug({ sessionId: conversation.sessionId }, 'TurnTakingEngine initialized');
  }

  // ==========================================================================
  // PUBLIC API
  // ==========================================================================

  /**
   * Called when a participant starts speaking
   */
  onSpeakingStart(participantId: string): void {
    const participant = this.conversation.participants.get(participantId);
    if (!participant) return;

    // Update state
    this.state.currentSpeaker = participantId;
    this.state.silenceDurationMs = 0;
    this.clearSilenceTimer();

    // Update participant
    participant.speakingState = 'speaking';

    log.debug({ participantId, name: participant.name }, 'Speaking started');
    this.emit('speaker_changed', { speakerId: participantId });
  }

  /**
   * Called when a participant stops speaking
   */
  onSpeakingEnd(participantId: string): void {
    const participant = this.conversation.participants.get(participantId);
    if (!participant) return;

    // Update state
    if (this.state.currentSpeaker === participantId) {
      this.state.currentSpeaker = null;
    }
    this.state.lastSpoke.set(participantId, Date.now());
    this.state.turnCounts.set(participantId, (this.state.turnCounts.get(participantId) ?? 0) + 1);

    // Update participant
    participant.speakingState = 'listening';

    // Start silence timer
    this.startSilenceTimer();

    log.debug({ participantId, name: participant.name }, 'Speaking ended');
    this.emit('speaker_changed', { speakerId: null });
  }

  /**
   * Determine if a specific agent should speak now
   */
  shouldAgentSpeak(agentId: string): boolean {
    const agent = this.conversation.participants.get(agentId);
    if (!agent || agent.type !== 'agent') {
      return false;
    }

    // Never interrupt a human or external person
    const currentSpeaker = this.getCurrentSpeaker();
    if (currentSpeaker && (currentSpeaker.type === 'human' || currentSpeaker.type === 'external')) {
      return false;
    }

    // Wait for sufficient silence
    if (this.state.silenceDurationMs < this.config.silenceThresholdMs) {
      return false;
    }

    // Check if too many agent turns without human
    if (this.agentDominanceCheck()) {
      log.debug({ agentId }, 'Agent dominance check failed - waiting for human');
      return false;
    }

    // Check if there's someone in the queue ahead
    if (this.state.speakingQueue.length > 0 && this.state.speakingQueue[0] !== agentId) {
      return false;
    }

    // Use intelligent selection
    const selectedAgent = this.selectNextAgent();
    return selectedAgent === agentId;
  }

  /**
   * Request to speak (join the queue)
   */
  requestToSpeak(participantId: string): void {
    if (!this.state.speakingQueue.includes(participantId)) {
      this.state.speakingQueue.push(participantId);
      log.debug(
        { participantId, queueLength: this.state.speakingQueue.length },
        'Joined speaking queue'
      );
      this.emit('turn_requested', { participantId });
    }
  }

  /**
   * Get the current speaker
   */
  getCurrentSpeaker(): GroupParticipant | null {
    if (!this.state.currentSpeaker) return null;
    return this.conversation.participants.get(this.state.currentSpeaker) ?? null;
  }

  /**
   * Get statistics about turn distribution
   */
  getTurnStats(): {
    turnCounts: Record<string, number>;
    averageTurns: number;
    balance: number; // 0-1, higher is more balanced
  } {
    const counts: Record<string, number> = {};
    let total = 0;

    for (const [id, count] of this.state.turnCounts) {
      counts[id] = count;
      total += count;
    }

    const numParticipants = this.state.turnCounts.size;
    const averageTurns = numParticipants > 0 ? total / numParticipants : 0;

    // Calculate balance (lower std dev = more balanced)
    let sumSquaredDiff = 0;
    for (const count of this.state.turnCounts.values()) {
      sumSquaredDiff += Math.pow(count - averageTurns, 2);
    }
    const stdDev = numParticipants > 0 ? Math.sqrt(sumSquaredDiff / numParticipants) : 0;
    const balance = averageTurns > 0 ? Math.max(0, 1 - stdDev / averageTurns) : 1;

    return { turnCounts: counts, averageTurns, balance };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<TurnTakingConfig>): void {
    this.config = { ...this.config, ...config };
    log.debug({ config: this.config }, 'Turn-taking config updated');
  }

  // ==========================================================================
  // PRIVATE METHODS
  // ==========================================================================

  /**
   * Check if agents have been dominating the conversation
   */
  private agentDominanceCheck(): boolean {
    const recentUtterances = this.conversation.transcript.slice(-5);
    let consecutiveAgentTurns = 0;

    for (let i = recentUtterances.length - 1; i >= 0; i--) {
      const u = recentUtterances[i];
      if (u.speakerType === 'agent') {
        consecutiveAgentTurns++;
      } else {
        break;
      }
    }

    return consecutiveAgentTurns >= this.config.priorities.maxAgentTurnsWithoutHuman;
  }

  /**
   * Select which agent should speak next (intelligent strategy)
   */
  private selectNextAgent(): string | null {
    const agents = Array.from(this.conversation.participants.values()).filter(
      (p) => p.type === 'agent' && p.role !== 'observer'
    );

    if (agents.length === 0) return null;

    // Score each agent
    const scores = agents.map((agent) => ({
      agentId: agent.id,
      score: this.calculateSpeakingScore(agent),
    }));

    scores.sort((a, b) => b.score - a.score);

    log.debug({ scores: scores.slice(0, 3) }, 'Agent speaking scores');
    return scores[0]?.agentId ?? null;
  }

  /**
   * Calculate speaking priority score for an agent
   */
  private calculateSpeakingScore(agent: GroupParticipant): number {
    let score = 0;

    // Higher score if been quiet for a while
    const lastSpokeTime = this.state.lastSpoke.get(agent.id) ?? 0;
    const timeSinceSpoke = Date.now() - lastSpokeTime;
    score += Math.min(timeSinceSpoke / 10000, 5); // Up to 5 points for 50+ seconds

    // Higher score if turn count is low (balance)
    const turnCount = this.state.turnCounts.get(agent.id) ?? 0;
    const avgTurns = this.getAverageTurnCount();
    if (turnCount < avgTurns) {
      score += (avgTurns - turnCount) * 2; // 2 points per turn below average
    }

    // Bonus for moderator when conversation needs direction
    if (agent.role === 'moderator' && this.needsModeration()) {
      score += 10;
    }

    // Bonus if in speaking queue
    const queuePosition = this.state.speakingQueue.indexOf(agent.id);
    if (queuePosition >= 0) {
      score += 5 - queuePosition; // Earlier in queue = higher score
    }

    return score;
  }

  /**
   * Get average turn count across all agents
   */
  private getAverageTurnCount(): number {
    const agentCounts = Array.from(this.conversation.participants.values())
      .filter((p) => p.type === 'agent')
      .map((p) => this.state.turnCounts.get(p.id) ?? 0);

    if (agentCounts.length === 0) return 0;
    return agentCounts.reduce((a, b) => a + b, 0) / agentCounts.length;
  }

  /**
   * Check if conversation needs moderation
   */
  private needsModeration(): boolean {
    // Long silence
    if (this.state.silenceDurationMs > 5000) {
      return true;
    }

    // Very unbalanced participation
    const stats = this.getTurnStats();
    if (stats.balance < 0.5) {
      return true;
    }

    // Conversation going off-topic (would need NLP)
    // For now, return false
    return false;
  }

  /**
   * Start the silence timer
   */
  private startSilenceTimer(): void {
    this.clearSilenceTimer();

    this.silenceTimer = setInterval(() => {
      this.state.silenceDurationMs += 100;

      // Emit silence event every second
      if (this.state.silenceDurationMs % 1000 === 0) {
        this.emit('silence', { durationMs: this.state.silenceDurationMs });
      }
    }, 100);
  }

  /**
   * Clear the silence timer
   */
  private clearSilenceTimer(): void {
    if (this.silenceTimer) {
      clearInterval(this.silenceTimer);
      this.silenceTimer = null;
    }
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    this.clearSilenceTimer();
    this.removeAllListeners();
    log.debug({ sessionId: this.conversation.sessionId }, 'TurnTakingEngine destroyed');
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

/**
 * Create a turn-taking engine for a conversation
 */
export function createTurnTakingEngine(
  conversation: GroupConversation,
  config?: Partial<TurnTakingConfig>
): TurnTakingEngine {
  return new TurnTakingEngine(conversation, config);
}
