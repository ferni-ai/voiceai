/**
 * Temporal Emotional Intelligence
 *
 * > "You sound lighter today than last week."
 *
 * Compares emotional states across time with perfect recall.
 * Unlike humans, we notice subtle shifts and can articulate them.
 *
 * Key capabilities:
 * - Session emotion tracking
 * - Trajectory analysis
 * - Notable shift detection
 * - Time-comparative observations
 *
 * @module @ferni/superhuman/temporal-emotional
 */

import { createLogger } from '../../utils/safe-logger.js';
import type {
  EmotionalShift,
  SessionEmotionSnapshot,
  TemporalEmotionalProfile,
  TemporalInsight,
} from './types.js';

const logger = createLogger({ module: 'TemporalEmotional' });

// ============================================================================
// CONSTANTS
// ============================================================================

const DEFAULT_PROFILE: TemporalEmotionalProfile = {
  sessionEmotions: [],
  trajectory: 'stable',
  notableShifts: [],
  baseline: {
    energy: 0.5,
    positivity: 0.5,
    openness: 0.5,
  },
};

// ============================================================================
// TEMPORAL INSIGHT PHRASES
// ============================================================================

const TEMPORAL_PHRASES = {
  energy_comparison: {
    higher: [
      'You sound lighter today than last time.',
      "There's more energy in your voice today.",
      "Something's different—in a good way. You seem brighter.",
      'You seem more yourself today.',
    ],
    lower: [
      'You sound more tired today. Everything okay?',
      "Lower energy than usual. What's going on?",
      'Something feels heavier today.',
      'You seem more... subdued. Talk to me.',
    ],
    consistent: ['Steady as always.', "You've got that consistent energy I've come to expect."],
  },
  openness_comparison: {
    more_open: [
      'You seem more open today. I appreciate that.',
      "You're sharing more than usual. Thank you for trusting me.",
      "It feels like you're letting me in more today.",
      "There's something different—you're being more real with me.",
    ],
    less_open: [
      "You seem more guarded today. That's okay. I'm here when you're ready.",
      'Taking things slower today? I respect that.',
      "You're holding back a bit. No pressure—take your time.",
    ],
    consistently_open: [
      "You've always been so open with me. I don't take that for granted.",
      'Your willingness to share never stops impressing me.',
    ],
  },
  mood_shift: {
    improving: [
      "You've been trending up lately. I've noticed.",
      "There's been a shift—you seem better than you were a few weeks ago.",
      "The last few times we've talked, you've seemed lighter.",
      'Something changed. Good changed.',
    ],
    declining: [
      "I've been a little worried about you.",
      "You haven't seemed like yourself lately.",
      "The last few conversations have felt heavier. What's going on?",
      "I'm noticing a pattern. Let's talk about it.",
    ],
    variable: [
      "It's been up and down lately, hasn't it?",
      "Some days better than others. That's real.",
    ],
  },
  growth_observation: [
    'You handle things differently now than you did a month ago.',
    "I've watched you grow. It's been remarkable.",
    "The version of you I'm talking to now? Different. Better.",
    'Remember when this would have sent you spiraling? Look at you now.',
  ],
  openness_growth: [
    'You open up more easily now than when we first started talking.',
    "I've noticed how much more comfortable you are sharing the hard stuff.",
    'The trust you show now compared to our early conversations—that means something.',
  ],
  concern_pattern: [
    "This topic comes up a lot when you're stressed.",
    'I notice you mention this more when things are hard.',
    "There's a pattern here. When you bring up {topic}, something's usually going on.",
  ],
};

// ============================================================================
// TEMPORAL EMOTIONAL INTELLIGENCE ENGINE
// ============================================================================

export class TemporalEmotionalEngine {
  private profile: TemporalEmotionalProfile;
  private userId: string;
  private lastInsightTurn = 0;

  constructor(userId: string, existing?: TemporalEmotionalProfile) {
    this.userId = userId;
    this.profile = existing ? { ...existing } : { ...DEFAULT_PROFILE };
  }

  // ==========================================================================
  // RECORDING
  // ==========================================================================

  /**
   * Record session emotional snapshot
   */
  recordSessionEmotion(snapshot: {
    dominantEmotion: string;
    energyLevel: number;
    positivity: number;
    openness?: number;
    topics: string[];
    concernsDetected: boolean;
  }): void {
    // Calculate openness if not provided - based on vulnerability indicators
    const openness = snapshot.openness ?? this.inferOpenness(snapshot);

    const newSnapshot: SessionEmotionSnapshot = {
      date: new Date(),
      dominantEmotion: snapshot.dominantEmotion,
      energyLevel: snapshot.energyLevel,
      positivity: snapshot.positivity,
      openness,
      topics: snapshot.topics,
      concernsDetected: snapshot.concernsDetected,
    };

    this.profile.sessionEmotions.push(newSnapshot);

    // Keep last 30 sessions
    if (this.profile.sessionEmotions.length > 30) {
      this.profile.sessionEmotions = this.profile.sessionEmotions.slice(-30);
    }

    // Update baseline (running average of last 10)
    this.updateBaseline();

    // Update trajectory
    this.updateTrajectory();

    // Check for notable shifts
    this.detectShifts();

    logger.debug(
      {
        userId: this.userId,
        emotion: snapshot.dominantEmotion,
        energy: snapshot.energyLevel.toFixed(2),
        trajectory: this.profile.trajectory,
      },
      '⏱️ Session emotion recorded'
    );
  }

  // ==========================================================================
  // TEMPORAL INSIGHTS
  // ==========================================================================

  /**
   * Get temporal insight if appropriate
   */
  getTemporalInsight(context: {
    turnCount: number;
    currentEnergy: number;
    currentPositivity: number;
    currentOpenness?: number;
    sessionCount: number;
  }): TemporalInsight {
    // Need enough history
    if (context.sessionCount < 3) {
      return { shouldMention: false };
    }

    // Cooldown - at least 40 turns between temporal observations
    if (context.turnCount - this.lastInsightTurn < 40) {
      return { shouldMention: false };
    }

    // Check for energy comparison opportunity
    const energyInsight = this.checkEnergyComparison(context.currentEnergy);
    if (energyInsight.shouldMention && Math.random() < 0.15) {
      this.lastInsightTurn = context.turnCount;
      return energyInsight;
    }

    // Check for openness comparison (new capability)
    if (context.currentOpenness !== undefined) {
      const opennessInsight = this.checkOpennessComparison(context.currentOpenness);
      if (opennessInsight.shouldMention && Math.random() < 0.12) {
        this.lastInsightTurn = context.turnCount;
        return opennessInsight;
      }
    }

    // Check for mood shift observation
    const moodInsight = this.checkMoodShift();
    if (moodInsight.shouldMention && Math.random() < 0.1) {
      this.lastInsightTurn = context.turnCount;
      return moodInsight;
    }

    // Check for growth observation
    const growthInsight = this.checkGrowthObservation();
    if (growthInsight.shouldMention && Math.random() < 0.08) {
      this.lastInsightTurn = context.turnCount;
      return growthInsight;
    }

    // Check for openness growth over time (different from comparison)
    const opennessGrowthInsight = this.checkOpennessGrowth();
    if (opennessGrowthInsight.shouldMention && Math.random() < 0.06) {
      this.lastInsightTurn = context.turnCount;
      return opennessGrowthInsight;
    }

    return { shouldMention: false };
  }

  /**
   * Get comparative observation about current state vs history
   */
  getComparativeObservation(currentEmotion: string, currentTopic?: string): string | null {
    if (this.profile.sessionEmotions.length < 3) return null;

    // Only 10% chance
    if (Math.random() > 0.1) return null;

    const recent = this.profile.sessionEmotions.slice(-5);
    const recentWithSameEmotion = recent.filter((s) => s.dominantEmotion === currentEmotion);

    // If this emotion is recurring
    if (recentWithSameEmotion.length >= 3) {
      return `You've been ${currentEmotion} a lot lately. What's going on?`;
    }

    // If topic is connected to an emotional pattern
    if (currentTopic) {
      const topicSessions = this.profile.sessionEmotions.filter((s) =>
        s.topics.includes(currentTopic)
      );
      if (topicSessions.length >= 2) {
        const concernRate =
          topicSessions.filter((s) => s.concernsDetected).length / topicSessions.length;
        if (concernRate > 0.5) {
          const phrase = this.selectRandom(TEMPORAL_PHRASES.concern_pattern);
          return phrase.replace('{topic}', currentTopic);
        }
      }
    }

    return null;
  }

  // ==========================================================================
  // ANALYSIS
  // ==========================================================================

  private checkEnergyComparison(currentEnergy: number): TemporalInsight {
    if (this.profile.sessionEmotions.length < 2) {
      return { shouldMention: false };
    }

    const lastSession = this.profile.sessionEmotions[this.profile.sessionEmotions.length - 1];
    const energyDiff = currentEnergy - lastSession.energyLevel;
    const baselineDiff = currentEnergy - this.profile.baseline.energy;

    // Significant higher energy
    if (energyDiff > 0.2 || baselineDiff > 0.25) {
      return {
        shouldMention: true,
        type: 'energy_comparison',
        phrase: this.selectRandom(TEMPORAL_PHRASES.energy_comparison.higher),
      };
    }

    // Significant lower energy
    if (energyDiff < -0.2 || baselineDiff < -0.25) {
      return {
        shouldMention: true,
        type: 'energy_comparison',
        phrase: this.selectRandom(TEMPORAL_PHRASES.energy_comparison.lower),
      };
    }

    return { shouldMention: false };
  }

  private checkMoodShift(): TemporalInsight {
    if (this.profile.notableShifts.length === 0) {
      return { shouldMention: false };
    }

    // Check recent shift
    const recentShift = this.profile.notableShifts[this.profile.notableShifts.length - 1];
    const daysSinceShift = Math.floor(
      (Date.now() - new Date(recentShift.to).getTime()) / (1000 * 60 * 60 * 24)
    );

    // Only mention if shift was recent-ish (within 14 days)
    if (daysSinceShift > 14) {
      return { shouldMention: false };
    }

    const phrases =
      TEMPORAL_PHRASES.mood_shift[recentShift.direction === 'positive' ? 'improving' : 'declining'];

    return {
      shouldMention: true,
      type: 'mood_shift',
      phrase: this.selectRandom(phrases),
    };
  }

  private checkGrowthObservation(): TemporalInsight {
    // Need enough history for growth observation
    if (this.profile.sessionEmotions.length < 10) {
      return { shouldMention: false };
    }

    // Compare early sessions to recent
    const early = this.profile.sessionEmotions.slice(0, 5);
    const recent = this.profile.sessionEmotions.slice(-5);

    const earlyAvgPositivity = early.reduce((sum, s) => sum + s.positivity, 0) / early.length;
    const recentAvgPositivity = recent.reduce((sum, s) => sum + s.positivity, 0) / recent.length;

    const earlyAvgEnergy = early.reduce((sum, s) => sum + s.energyLevel, 0) / early.length;
    const recentAvgEnergy = recent.reduce((sum, s) => sum + s.energyLevel, 0) / recent.length;

    // Significant improvement
    if (
      recentAvgPositivity - earlyAvgPositivity > 0.15 ||
      recentAvgEnergy - earlyAvgEnergy > 0.15
    ) {
      return {
        shouldMention: true,
        type: 'growth_observation',
        phrase: this.selectRandom(TEMPORAL_PHRASES.growth_observation),
      };
    }

    return { shouldMention: false };
  }

  /**
   * Check for openness comparison with recent sessions
   */
  private checkOpennessComparison(currentOpenness: number): TemporalInsight {
    if (this.profile.sessionEmotions.length < 2) {
      return { shouldMention: false };
    }

    const lastSession = this.profile.sessionEmotions[this.profile.sessionEmotions.length - 1];
    const opennessDiff = currentOpenness - lastSession.openness;
    const baselineDiff = currentOpenness - this.profile.baseline.openness;

    // Significantly more open
    if (opennessDiff > 0.25 || baselineDiff > 0.3) {
      return {
        shouldMention: true,
        type: 'openness_comparison',
        phrase: this.selectRandom(TEMPORAL_PHRASES.openness_comparison.more_open),
      };
    }

    // Significantly less open (be gentle)
    if (opennessDiff < -0.25 || baselineDiff < -0.3) {
      return {
        shouldMention: true,
        type: 'openness_comparison',
        phrase: this.selectRandom(TEMPORAL_PHRASES.openness_comparison.less_open),
      };
    }

    // Consistently high openness (acknowledge it)
    if (currentOpenness > 0.7 && this.profile.baseline.openness > 0.65) {
      return {
        shouldMention: true,
        type: 'openness_comparison',
        phrase: this.selectRandom(TEMPORAL_PHRASES.openness_comparison.consistently_open),
      };
    }

    return { shouldMention: false };
  }

  /**
   * Check for openness growth over time (longer-term pattern)
   */
  private checkOpennessGrowth(): TemporalInsight {
    // Need enough history
    if (this.profile.sessionEmotions.length < 10) {
      return { shouldMention: false };
    }

    // Compare early sessions to recent
    const early = this.profile.sessionEmotions.slice(0, 5);
    const recent = this.profile.sessionEmotions.slice(-5);

    const earlyAvgOpenness = early.reduce((sum, s) => sum + s.openness, 0) / early.length;
    const recentAvgOpenness = recent.reduce((sum, s) => sum + s.openness, 0) / recent.length;

    // Significant improvement in openness over time
    if (recentAvgOpenness - earlyAvgOpenness > 0.2) {
      return {
        shouldMention: true,
        type: 'openness_growth',
        phrase: this.selectRandom(TEMPORAL_PHRASES.openness_growth),
      };
    }

    return { shouldMention: false };
  }

  // ==========================================================================
  // PROFILE UPDATES
  // ==========================================================================

  private updateBaseline(): void {
    const recent = this.profile.sessionEmotions.slice(-10);
    if (recent.length < 3) return;

    this.profile.baseline = {
      energy: recent.reduce((sum, s) => sum + s.energyLevel, 0) / recent.length,
      positivity: recent.reduce((sum, s) => sum + s.positivity, 0) / recent.length,
      openness: recent.reduce((sum, s) => sum + s.openness, 0) / recent.length,
    };
  }

  /**
   * Infer openness level from session characteristics
   * Openness reflects how vulnerable/sharing the user was
   */
  private inferOpenness(snapshot: {
    dominantEmotion: string;
    topics: string[];
    concernsDetected: boolean;
  }): number {
    let openness = 0.3; // Base level

    // Vulnerable emotions indicate openness
    const vulnerableEmotions = ['sadness', 'fear', 'anxiety', 'grief', 'shame', 'guilt'];
    if (vulnerableEmotions.includes(snapshot.dominantEmotion.toLowerCase())) {
      openness += 0.3;
    }

    // Discussing personal topics indicates openness
    const personalTopics = [
      'family',
      'relationship',
      'childhood',
      'trauma',
      'fear',
      'dream',
      'regret',
      'insecurity',
    ];
    const hasPersonalTopic = snapshot.topics.some((t) =>
      personalTopics.some((p) => t.toLowerCase().includes(p))
    );
    if (hasPersonalTopic) {
      openness += 0.2;
    }

    // Multiple topics suggest more sharing
    if (snapshot.topics.length >= 3) {
      openness += 0.1;
    }

    // Concerns detected usually means they opened up
    if (snapshot.concernsDetected) {
      openness += 0.15;
    }

    return Math.min(1, openness);
  }

  private updateTrajectory(): void {
    if (this.profile.sessionEmotions.length < 5) {
      this.profile.trajectory = 'stable';
      return;
    }

    const recent = this.profile.sessionEmotions.slice(-5);
    const older = this.profile.sessionEmotions.slice(-10, -5);

    if (older.length < 3) {
      this.profile.trajectory = 'stable';
      return;
    }

    const recentAvg = recent.reduce((sum, s) => sum + s.positivity, 0) / recent.length;
    const olderAvg = older.reduce((sum, s) => sum + s.positivity, 0) / older.length;

    const diff = recentAvg - olderAvg;

    if (diff > 0.1) {
      this.profile.trajectory = 'improving';
    } else if (diff < -0.1) {
      this.profile.trajectory = 'declining';
    } else {
      // Check for variability
      const variance = this.calculateVariance(recent.map((s) => s.positivity));
      this.profile.trajectory = variance > 0.1 ? 'variable' : 'stable';
    }
  }

  private detectShifts(): void {
    if (this.profile.sessionEmotions.length < 3) return;

    const recent = this.profile.sessionEmotions.slice(-3);
    const before = this.profile.sessionEmotions.slice(-6, -3);

    if (before.length < 2) return;

    const recentAvg = recent.reduce((sum, s) => sum + s.positivity, 0) / recent.length;
    const beforeAvg = before.reduce((sum, s) => sum + s.positivity, 0) / before.length;

    const diff = recentAvg - beforeAvg;

    // Detect significant shift
    if (Math.abs(diff) > 0.2) {
      const shift: EmotionalShift = {
        from: new Date(before[0].date),
        to: new Date(recent[recent.length - 1].date),
        description: diff > 0 ? 'Mood improving' : 'Mood declining',
        direction: diff > 0 ? 'positive' : 'negative',
      };

      // Don't add duplicate shifts
      const lastShift = this.profile.notableShifts[this.profile.notableShifts.length - 1];
      if (!lastShift || shift.direction !== lastShift.direction) {
        this.profile.notableShifts.push(shift);

        // Keep last 10 shifts
        if (this.profile.notableShifts.length > 10) {
          this.profile.notableShifts = this.profile.notableShifts.slice(-10);
        }
      }
    }
  }

  private calculateVariance(values: number[]): number {
    const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
    const squaredDiffs = values.map((v) => Math.pow(v - mean, 2));
    return squaredDiffs.reduce((sum, v) => sum + v, 0) / values.length;
  }

  private selectRandom<T>(arr: T[]): T {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  // ==========================================================================
  // STATE ACCESS
  // ==========================================================================

  /**
   * Get trajectory
   */
  getTrajectory(): TemporalEmotionalProfile['trajectory'] {
    return this.profile.trajectory;
  }

  /**
   * Get baseline
   */
  getBaseline(): TemporalEmotionalProfile['baseline'] {
    return { ...this.profile.baseline };
  }

  /**
   * Export for persistence
   */
  export(): TemporalEmotionalProfile {
    return JSON.parse(JSON.stringify(this.profile));
  }

  /**
   * Import from persistence
   */
  import(profile: TemporalEmotionalProfile): void {
    this.profile = {
      ...profile,
      sessionEmotions: profile.sessionEmotions.map((s) => ({
        ...s,
        date: new Date(s.date),
      })),
      notableShifts: profile.notableShifts.map((s) => ({
        ...s,
        from: new Date(s.from),
        to: new Date(s.to),
      })),
    };
  }

  /**
   * Reset
   */
  reset(): void {
    this.profile = { ...DEFAULT_PROFILE };
    this.lastInsightTurn = 0;
  }
}

// ============================================================================
// SINGLETON MANAGEMENT
// ============================================================================

const engines = new Map<string, TemporalEmotionalEngine>();

export function getTemporalEmotional(
  userId: string,
  existing?: TemporalEmotionalProfile
): TemporalEmotionalEngine {
  if (!engines.has(userId)) {
    engines.set(userId, new TemporalEmotionalEngine(userId, existing));
  }
  return engines.get(userId)!;
}

export function clearTemporalEmotional(userId: string): void {
  engines.delete(userId);
}

export default TemporalEmotionalEngine;
