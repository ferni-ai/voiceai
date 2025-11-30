/**
 * Turn-Taking Monitor
 *
 * Tracks speaking time balance between Jack and the user.
 * Prevents Jack from dominating the conversation.
 */

import { log } from '@livekit/agents';

export interface TurnStats {
  jackSpeakingTime: number;
  userSpeakingTime: number;
  jackTurnCount: number;
  userTurnCount: number;
  consecutiveJackTurns: number;
  consecutiveUserTurns: number;
}

export class TurnTakingMonitor {
  private jackSpeakingTime: number = 0;
  private userSpeakingTime: number = 0;
  private jackTurnCount: number = 0;
  private userTurnCount: number = 0;
  private consecutiveJackTurns: number = 0;
  private consecutiveUserTurns: number = 0;
  private lastSpeaker: 'jack' | 'user' | null = null;

  /**
   * Record a speaking turn
   */
  recordTurn(speaker: 'jack' | 'user', durationMs: number): void {
    if (speaker === 'jack') {
      this.jackSpeakingTime += durationMs;
      this.jackTurnCount++;

      if (this.lastSpeaker === 'jack') {
        this.consecutiveJackTurns++;
      } else {
        this.consecutiveJackTurns = 1;
        this.consecutiveUserTurns = 0;
      }
    } else {
      this.userSpeakingTime += durationMs;
      this.userTurnCount++;

      if (this.lastSpeaker === 'user') {
        this.consecutiveUserTurns++;
      } else {
        this.consecutiveUserTurns = 1;
        this.consecutiveJackTurns = 0;
      }
    }

    this.lastSpeaker = speaker;

    log().debug('Turn recorded', {
      speaker,
      durationMs,
      ratio: this.getSpeakingRatio(),
      consecutiveJackTurns: this.consecutiveJackTurns,
    });
  }

  /**
   * Should Jack invite the user to speak?
   */
  shouldInviteUserToSpeak(): boolean {
    const totalTime = this.jackSpeakingTime + this.userSpeakingTime;
    if (totalTime === 0) return false;

    const ratio = this.jackSpeakingTime / totalTime;

    // Jack speaking 70%+ of the time? Too much!
    if (ratio > 0.7) {
      log().info('Jack dominating conversation', { ratio });
      return true;
    }

    // Jack had 3+ turns in a row? Let them talk!
    if (this.consecutiveJackTurns >= 3) {
      log().info('Jack had too many consecutive turns', {
        consecutive: this.consecutiveJackTurns
      });
      return true;
    }

    return false;
  }

  /**
   * Should Jack keep his next response brief?
   */
  shouldKeepResponseBrief(): boolean {
    const totalTime = this.jackSpeakingTime + this.userSpeakingTime;
    if (totalTime === 0) return false;

    const ratio = this.jackSpeakingTime / totalTime;

    // Jack speaking 60%+ of time? Start being brief
    return ratio > 0.6 || this.consecutiveJackTurns >= 2;
  }

  /**
   * Get an invitation phrase for the user to speak
   */
  getInvitation(): string {
    const invitations = [
      "But I've been talking too much. What's on your mind?",
      "Listen to me go on... Tell me what you're thinking.",
      "I want to hear from you. What are your thoughts?",
      "<break time=\"200ms\"/>Sorry, I should let you talk. What do you think?",
      "You know what? I should listen more. Tell me.",
      "But enough from me. What's your take on this?",
      "I'm curious what you think about all this.",
      "Let me stop myself there. What's your perspective?",
    ];
    return invitations[Math.floor(Math.random() * invitations.length)];
  }

  /**
   * Get gentle prompt when user is quiet
   */
  getGentlePrompt(): string {
    const prompts = [
      "What's on your mind?",
      "Tell me what you're thinking.",
      "I'm listening.",
      "What are you thinking about?",
      "Talk to me.",
      "What's going through your head?",
    ];
    return prompts[Math.floor(Math.random() * prompts.length)];
  }

  /**
   * Get speaking time ratio (0 = all user, 1 = all Jack)
   */
  getSpeakingRatio(): number {
    const total = this.jackSpeakingTime + this.userSpeakingTime;
    return total > 0 ? this.jackSpeakingTime / total : 0.5;
  }

  /**
   * Get turn count ratio
   */
  getTurnRatio(): number {
    const total = this.jackTurnCount + this.userTurnCount;
    return total > 0 ? this.jackTurnCount / total : 0.5;
  }

  /**
   * Get statistics
   */
  getStats(): TurnStats {
    return {
      jackSpeakingTime: this.jackSpeakingTime,
      userSpeakingTime: this.userSpeakingTime,
      jackTurnCount: this.jackTurnCount,
      userTurnCount: this.userTurnCount,
      consecutiveJackTurns: this.consecutiveJackTurns,
      consecutiveUserTurns: this.consecutiveUserTurns,
    };
  }

  /**
   * Get guidance for next response
   */
  getGuidance(): string {
    if (this.shouldInviteUserToSpeak()) {
      return "CRITICAL: Invite user to speak. Jack is dominating.";
    }

    if (this.shouldKeepResponseBrief()) {
      return "Keep response brief. Give user more space to talk.";
    }

    const ratio = this.getSpeakingRatio();
    if (ratio < 0.3) {
      return "User is talking a lot. Jack can elaborate more if helpful.";
    }

    if (ratio > 0.5) {
      return "Watch speaking time. Aim for more balanced conversation.";
    }

    return "Balanced conversation. Continue naturally.";
  }

  /**
   * Is the conversation balanced?
   */
  isBalanced(): boolean {
    const ratio = this.getSpeakingRatio();
    // Balanced if Jack speaks 40-60% of the time
    return ratio >= 0.4 && ratio <= 0.6;
  }

  /**
   * Reset for new session
   */
  reset(): void {
    this.jackSpeakingTime = 0;
    this.userSpeakingTime = 0;
    this.jackTurnCount = 0;
    this.userTurnCount = 0;
    this.consecutiveJackTurns = 0;
    this.consecutiveUserTurns = 0;
    this.lastSpeaker = null;
  }
}

// Singleton instance
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
}
