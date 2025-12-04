/**
 * Turn-Taking Monitor
 *
 * Tracks speaking balance between agent and user to ensure
 * natural conversation flow where neither party dominates.
 *
 * Key behaviors:
 * - Track duration of each speaker's turns
 * - Calculate speaking ratio (agent vs user)
 * - Signal when agent should invite user to speak
 * - Signal when agent should keep responses brief
 */

import { log } from '@livekit/agents';

const getLogger = () => log();

// ============================================================================
// TYPES
// ============================================================================

export interface TurnRecord {
  speaker: 'agent' | 'user';
  durationMs: number;
  timestamp: number;
}

export interface TurnTakingStats {
  agentTotalMs: number;
  userTotalMs: number;
  turnCount: number;
  agentTurnCount: number;
  userTurnCount: number;
  averageAgentTurnMs: number;
  averageUserTurnMs: number;
  speakingRatio: number; // agent / total
  recentBalance: 'agent_heavy' | 'balanced' | 'user_heavy';
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  // If agent speaks > this ratio, should invite user to speak
  inviteThreshold: 0.65,

  // If agent speaks > this ratio, keep responses brief
  briefThreshold: 0.55,

  // Only consider recent turns for balance calculation
  recentTurnWindow: 10,

  // Minimum turns before making recommendations
  minimumTurnsForAnalysis: 3,
};

// ============================================================================
// TURN-TAKING MONITOR
// ============================================================================

export class TurnTakingMonitor {
  private turns: TurnRecord[] = [];
  private invitationPhrases = [
    'What do you think?',
    "I'd love to hear your thoughts.",
    'Does that make sense?',
    'What questions do you have?',
    "How does that land for you?",
    'What are your thoughts on that?',
  ];

  constructor() {
    getLogger().debug('TurnTakingMonitor initialized');
  }

  /**
   * Record a speaking turn
   */
  recordTurn(speaker: 'agent' | 'user' | 'jack', durationMs: number): void {
    // Normalize 'jack' to 'agent' for consistency
    const normalizedSpeaker = speaker === 'jack' ? 'agent' : speaker;

    this.turns.push({
      speaker: normalizedSpeaker,
      durationMs,
      timestamp: Date.now(),
    });

    // Keep only recent turns
    if (this.turns.length > 50) {
      this.turns = this.turns.slice(-50);
    }

    getLogger().debug('Turn recorded', {
      speaker: normalizedSpeaker,
      durationMs,
      totalTurns: this.turns.length,
    });
  }

  /**
   * Get speaking ratio (agent time / total time)
   */
  getSpeakingRatio(): number {
    const recentTurns = this.getRecentTurns();
    if (recentTurns.length === 0) return 0.5;

    const agentMs = recentTurns
      .filter((t) => t.speaker === 'agent')
      .reduce((sum, t) => sum + t.durationMs, 0);

    const userMs = recentTurns
      .filter((t) => t.speaker === 'user')
      .reduce((sum, t) => sum + t.durationMs, 0);

    const total = agentMs + userMs;
    return total > 0 ? agentMs / total : 0.5;
  }

  /**
   * Should the agent invite the user to speak?
   */
  shouldInviteUserToSpeak(): boolean {
    if (this.turns.length < CONFIG.minimumTurnsForAnalysis) {
      return false;
    }

    const ratio = this.getSpeakingRatio();
    return ratio > CONFIG.inviteThreshold;
  }

  /**
   * Should the agent keep response brief?
   */
  shouldKeepResponseBrief(): boolean {
    if (this.turns.length < CONFIG.minimumTurnsForAnalysis) {
      return false;
    }

    const ratio = this.getSpeakingRatio();
    return ratio > CONFIG.briefThreshold;
  }

  /**
   * Get an invitation phrase to encourage user participation
   */
  getInvitation(): string {
    const index = Math.floor(Math.random() * this.invitationPhrases.length);
    return this.invitationPhrases[index];
  }

  /**
   * Get comprehensive stats
   */
  getStats(): TurnTakingStats {
    const agentTurns = this.turns.filter((t) => t.speaker === 'agent');
    const userTurns = this.turns.filter((t) => t.speaker === 'user');

    const agentTotalMs = agentTurns.reduce((sum, t) => sum + t.durationMs, 0);
    const userTotalMs = userTurns.reduce((sum, t) => sum + t.durationMs, 0);
    const totalMs = agentTotalMs + userTotalMs;

    const speakingRatio = totalMs > 0 ? agentTotalMs / totalMs : 0.5;

    let recentBalance: 'agent_heavy' | 'balanced' | 'user_heavy';
    if (speakingRatio > 0.6) {
      recentBalance = 'agent_heavy';
    } else if (speakingRatio < 0.4) {
      recentBalance = 'user_heavy';
    } else {
      recentBalance = 'balanced';
    }

    return {
      agentTotalMs,
      userTotalMs,
      turnCount: this.turns.length,
      agentTurnCount: agentTurns.length,
      userTurnCount: userTurns.length,
      averageAgentTurnMs: agentTurns.length > 0 ? agentTotalMs / agentTurns.length : 0,
      averageUserTurnMs: userTurns.length > 0 ? userTotalMs / userTurns.length : 0,
      speakingRatio,
      recentBalance,
    };
  }

  /**
   * Reset for new session
   */
  reset(): void {
    this.turns = [];
    getLogger().debug('TurnTakingMonitor reset');
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  private getRecentTurns(): TurnRecord[] {
    return this.turns.slice(-CONFIG.recentTurnWindow);
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let defaultMonitor: TurnTakingMonitor | null = null;

/**
 * Get global turn-taking monitor
 */
export function getTurnTakingMonitor(): TurnTakingMonitor {
  if (!defaultMonitor) {
    defaultMonitor = new TurnTakingMonitor();
  }
  return defaultMonitor;
}

/**
 * Reset global turn-taking monitor
 */
export function resetTurnTakingMonitor(): void {
  if (defaultMonitor) {
    defaultMonitor.reset();
  }
  defaultMonitor = null;
}

