/**
 * Conversation Rhythm Tracker
 *
 * Tracks the user's communication patterns and adapts Ferni's responses to match.
 * Real humans unconsciously mirror each other's communication rhythms:
 *
 * - Turn length: Short bursts vs. longer explanations
 * - Pacing: Rapid-fire vs. contemplative
 * - Pause patterns: Frequent pauses vs. flowing speech
 * - Energy trends: Rising excitement vs. winding down
 *
 * This creates "conversational attunement" - the feeling that
 * someone is really on your wavelength.
 *
 * @module @ferni/conversation-rhythm
 */

import { humanizationSignalEmitter } from '../services/humanization/humanization-signal-emitter.js';
import { createLogger } from '../utils/safe-logger.js';

const logger = createLogger({ module: 'ConversationRhythm' });

// ============================================================================
// TYPES
// ============================================================================

export type UserPacing = 'rapid' | 'moderate' | 'slow' | 'contemplative';
export type PausePattern = 'frequent_short' | 'occasional_long' | 'flowing' | 'hesitant';
export type EnergyTrend = 'rising' | 'stable' | 'falling' | 'oscillating';

export interface RhythmSnapshot {
  pacing: UserPacing;
  avgTurnLength: number;
  pausePattern: PausePattern;
  energyTrend: EnergyTrend;
  turnCount: number;
  timestamp: number;
}

export interface RhythmGuidance {
  /** Suggested response length multiplier (0.5 = half, 2 = double) */
  lengthMultiplier: number;
  /** Suggested speech rate adjustment (0.8 = slower, 1.2 = faster) */
  rateMultiplier: number;
  /** Suggested pause frequency multiplier */
  pauseMultiplier: number;
  /** Energy level to match */
  energyLevel: 'low' | 'medium' | 'high';
  /** Any specific guidance text */
  guidance: string;
}

interface TurnRecord {
  wordCount: number;
  durationMs: number;
  pauseCount: number;
  avgPauseDuration: number;
  emotionIntensity: number;
  timestamp: number;
}

// ============================================================================
// RHYTHM TRACKER
// ============================================================================

export class ConversationRhythmTracker {
  private userTurns: TurnRecord[] = [];
  private agentTurns: TurnRecord[] = [];
  private currentTurn = 0;

  // Rolling windows for analysis
  private readonly ANALYSIS_WINDOW = 5; // Number of turns to analyze

  // Rhythm state
  private currentPacing: UserPacing = 'moderate';
  private currentPausePattern: PausePattern = 'flowing';
  private energyHistory: number[] = [];

  constructor() {
    logger.debug('ConversationRhythmTracker initialized');
  }

  /**
   * Record a user turn and analyze rhythm
   */
  recordUserTurn(context: {
    text: string;
    durationMs?: number;
    pauseCount?: number;
    avgPauseDuration?: number;
    emotionIntensity?: number;
  }): RhythmSnapshot {
    this.currentTurn++;

    const wordCount = this.countWords(context.text);
    const durationMs = context.durationMs ?? wordCount * 300; // Estimate if not provided

    const turn: TurnRecord = {
      wordCount,
      durationMs,
      pauseCount: context.pauseCount ?? 0,
      avgPauseDuration: context.avgPauseDuration ?? 0,
      emotionIntensity: context.emotionIntensity ?? 0.5,
      timestamp: Date.now(),
    };

    this.userTurns.push(turn);

    // Keep only recent turns
    if (this.userTurns.length > this.ANALYSIS_WINDOW * 2) {
      this.userTurns = this.userTurns.slice(-this.ANALYSIS_WINDOW * 2);
    }

    // Track energy history
    this.energyHistory.push(context.emotionIntensity ?? 0.5);
    if (this.energyHistory.length > 10) {
      this.energyHistory.shift();
    }

    // Analyze rhythm
    return this.analyzeRhythm();
  }

  /**
   * Record an agent turn for balance tracking
   */
  recordAgentTurn(context: { text: string; durationMs?: number }): void {
    const wordCount = this.countWords(context.text);
    const durationMs = context.durationMs ?? wordCount * 250; // Agent speaks faster

    this.agentTurns.push({
      wordCount,
      durationMs,
      pauseCount: 0,
      avgPauseDuration: 0,
      emotionIntensity: 0.5,
      timestamp: Date.now(),
    });

    // Keep only recent turns
    if (this.agentTurns.length > this.ANALYSIS_WINDOW * 2) {
      this.agentTurns = this.agentTurns.slice(-this.ANALYSIS_WINDOW * 2);
    }
  }

  /**
   * Get rhythm guidance for next response
   */
  getRhythmGuidance(): RhythmGuidance {
    const snapshot = this.analyzeRhythm();

    // Base guidance on user's rhythm
    const guidance: RhythmGuidance = {
      lengthMultiplier: 1.0,
      rateMultiplier: 1.0,
      pauseMultiplier: 1.0,
      energyLevel: 'medium',
      guidance: '',
    };

    // Adjust length based on user's turn length
    // NOTE: We intentionally DON'T shorten responses when users send short messages.
    // Ferni's core value is warmth and presence - short user messages don't mean
    // they want less from us. They often mean they need MORE engagement and warmth.
    const avgUserWords = this.getAverageUserTurnLength();
    if (avgUserWords > 60) {
      // User gives long responses - we can expand to match their depth
      guidance.lengthMultiplier = 1.3;
      guidance.guidance = 'User is expansive - feel free to elaborate and explore deeply.';
    }
    // Short user messages: keep normal length, stay warm and engaged

    // Adjust rate based on pacing
    switch (snapshot.pacing) {
      case 'rapid':
        guidance.rateMultiplier = 1.1;
        guidance.energyLevel = 'high';
        guidance.guidance += ' High energy conversation - match their tempo.';
        break;
      case 'contemplative':
        guidance.rateMultiplier = 0.85;
        guidance.pauseMultiplier = 1.4;
        guidance.energyLevel = 'low';
        guidance.guidance += ' User is contemplative - slow down and give space.';
        break;
      case 'slow':
        guidance.rateMultiplier = 0.9;
        guidance.pauseMultiplier = 1.2;
        guidance.energyLevel = 'low';
        break;
    }

    // Adjust pauses based on their pattern
    switch (snapshot.pausePattern) {
      case 'frequent_short':
        guidance.pauseMultiplier = 1.2;
        break;
      case 'occasional_long':
        guidance.pauseMultiplier = 1.3;
        break;
      case 'hesitant':
        guidance.pauseMultiplier = 1.4;
        guidance.guidance += ' User seems hesitant - use encouraging tone.';
        break;
    }

    // Adjust energy based on trend
    switch (snapshot.energyTrend) {
      case 'rising':
        guidance.energyLevel = 'high';
        guidance.rateMultiplier *= 1.05;
        break;
      case 'falling':
        guidance.energyLevel = 'low';
        guidance.rateMultiplier *= 0.95;
        break;
    }

    logger.debug({ guidance, snapshot }, 'Generated rhythm guidance');

    return guidance;
  }

  /**
   * Get current rhythm snapshot
   */
  getCurrentRhythm(): RhythmSnapshot {
    return this.analyzeRhythm();
  }

  /**
   * Check if user's rhythm has shifted significantly
   */
  hasRhythmShifted(): boolean {
    if (this.userTurns.length < 3) return false;

    const recentSnapshot = this.analyzeRhythm();

    // Compare pacing to what we had before
    if (this.currentPacing !== recentSnapshot.pacing) {
      this.currentPacing = recentSnapshot.pacing;
      return true;
    }

    return false;
  }

  /**
   * Get conversation balance (are we talking too much?)
   */
  getConversationBalance(): {
    userWordRatio: number;
    agentWordRatio: number;
    isBalanced: boolean;
    guidance: string;
  } {
    const userWords = this.userTurns.reduce((sum, t) => sum + t.wordCount, 0);
    const agentWords = this.agentTurns.reduce((sum, t) => sum + t.wordCount, 0);
    const totalWords = userWords + agentWords;

    if (totalWords === 0) {
      return {
        userWordRatio: 0.5,
        agentWordRatio: 0.5,
        isBalanced: true,
        guidance: '',
      };
    }

    const userRatio = userWords / totalWords;
    const agentRatio = agentWords / totalWords;

    // Ideal is roughly 50/50 or slightly more user
    const isBalanced = userRatio >= 0.4 && userRatio <= 0.7;

    let guidance = '';
    if (agentRatio > 0.6) {
      guidance = "We're talking too much. Ask more questions, give shorter responses.";
    } else if (agentRatio < 0.3) {
      guidance = "User is doing most of the talking. That's good - keep listening.";
    }

    return {
      userWordRatio: userRatio,
      agentWordRatio: agentRatio,
      isBalanced,
      guidance,
    };
  }

  /**
   * Reset for new conversation
   */
  reset(): void {
    this.userTurns = [];
    this.agentTurns = [];
    this.currentTurn = 0;
    this.currentPacing = 'moderate';
    this.currentPausePattern = 'flowing';
    this.energyHistory = [];
    logger.debug('ConversationRhythmTracker reset');
  }

  // ============================================================================
  // PRIVATE HELPERS
  // ============================================================================

  private countWords(text: string): number {
    return text.split(/\s+/).filter((w) => w.length > 0).length;
  }

  private getAverageUserTurnLength(): number {
    if (this.userTurns.length === 0) return 30;

    const recentTurns = this.userTurns.slice(-this.ANALYSIS_WINDOW);
    const avgWords = recentTurns.reduce((sum, t) => sum + t.wordCount, 0) / recentTurns.length;

    return avgWords;
  }

  private analyzeRhythm(): RhythmSnapshot {
    if (this.userTurns.length === 0) {
      return {
        pacing: 'moderate',
        avgTurnLength: 30,
        pausePattern: 'flowing',
        energyTrend: 'stable',
        turnCount: 0,
        timestamp: Date.now(),
      };
    }

    const recentTurns = this.userTurns.slice(-this.ANALYSIS_WINDOW);

    // Calculate average turn metrics
    const avgWordCount = recentTurns.reduce((sum, t) => sum + t.wordCount, 0) / recentTurns.length;
    const avgDuration = recentTurns.reduce((sum, t) => sum + t.durationMs, 0) / recentTurns.length;
    const avgPauseCount =
      recentTurns.reduce((sum, t) => sum + t.pauseCount, 0) / recentTurns.length;
    const avgPauseDuration =
      recentTurns.reduce((sum, t) => sum + t.avgPauseDuration, 0) / recentTurns.length;

    // Determine pacing
    const wordsPerSecond = avgWordCount / (avgDuration / 1000);
    let pacing: UserPacing = 'moderate';

    if (wordsPerSecond > 3) {
      pacing = 'rapid';
    } else if (wordsPerSecond < 1.5) {
      pacing = 'contemplative';
    } else if (wordsPerSecond < 2) {
      pacing = 'slow';
    }

    // Determine pause pattern
    let pausePattern: PausePattern = 'flowing';

    if (avgPauseCount > 3) {
      pausePattern = avgPauseDuration < 500 ? 'frequent_short' : 'hesitant';
    } else if (avgPauseCount > 0 && avgPauseDuration > 1000) {
      pausePattern = 'occasional_long';
    }

    // Determine energy trend
    const energyTrend = this.calculateEnergyTrend();

    const snapshot: RhythmSnapshot = {
      pacing,
      avgTurnLength: avgWordCount,
      pausePattern,
      energyTrend,
      turnCount: this.currentTurn,
      timestamp: Date.now(),
    };

    // Update internal state
    this.currentPacing = pacing;
    this.currentPausePattern = pausePattern;

    // Emit rhythm update to frontend
    if (this.currentTurn > 0 && this.currentTurn % 3 === 0) {
      void humanizationSignalEmitter.emitRhythm({
        userPacing: pacing,
        avgTurnLength: avgWordCount,
        pausePattern,
        energyTrend,
      });
    }

    return snapshot;
  }

  private calculateEnergyTrend(): EnergyTrend {
    if (this.energyHistory.length < 3) return 'stable';

    const recent = this.energyHistory.slice(-5);
    const firstHalf = recent.slice(0, Math.floor(recent.length / 2));
    const secondHalf = recent.slice(Math.floor(recent.length / 2));

    const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;

    const diff = secondAvg - firstAvg;

    // Check for oscillation
    let oscillations = 0;
    for (let i = 1; i < recent.length; i++) {
      if (Math.abs(recent[i] - recent[i - 1]) > 0.3) {
        oscillations++;
      }
    }

    if (oscillations >= 2) {
      return 'oscillating';
    }

    if (diff > 0.15) {
      return 'rising';
    } else if (diff < -0.15) {
      return 'falling';
    }

    return 'stable';
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let instance: ConversationRhythmTracker | null = null;

export function getConversationRhythmTracker(): ConversationRhythmTracker {
  if (!instance) {
    instance = new ConversationRhythmTracker();
  }
  return instance;
}

export function resetConversationRhythmTracker(): void {
  if (instance) {
    instance.reset();
  }
  instance = null;
}

export default ConversationRhythmTracker;
