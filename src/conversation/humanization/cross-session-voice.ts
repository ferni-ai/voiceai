/**
 * Cross-Session Voice Memory
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Remember how the user sounded in previous sessions to detect changes
 * and provide continuity. This enables truly personalized awareness:
 * - "You sound more relaxed than last time we talked"
 * - Noticing when someone sounds different
 * - Tracking vocal growth over time
 *
 * **What we remember:**
 * - Session snapshots (start/end voice state)
 * - Notable emotional moments
 * - Patterns across time (morning vs evening, weekday vs weekend)
 * - Trends in energy, mood, comfort
 *
 * @module @ferni/humanization/cross-session-voice
 */

import { createLogger } from '../../utils/safe-logger.js';
import type { VoiceSnapshot } from './voice-print.js';

const logger = createLogger({ module: 'CrossSessionVoice' });

// ============================================================================
// TYPES
// ============================================================================

export interface SessionVoiceSnapshot {
  sessionId: string;
  date: Date;

  /** Voice state at session start */
  startingVoice: VoiceSnapshot;

  /** Voice state at session end */
  endingVoice: VoiceSnapshot | null;

  /** Notable moments during session */
  notableMoments: Array<{
    turn: number;
    description: string;
    voiceState: Partial<VoiceSnapshot>;
    emotion: string;
  }>;

  /** Overall session characteristics */
  overallEnergy: number;
  overallValence: number;
  emotionalRange: number;

  /** Session metadata */
  duration: number; // minutes
  turnCount: number;
}

export interface CrossSessionPatterns {
  /** Time-based patterns */
  morningEnergy: number | null;
  eveningEnergy: number | null;
  weekdayMood: number | null;
  weekendMood: number | null;

  /** Trending */
  energyTrend: 'improving' | 'declining' | 'stable';
  moodTrend: 'improving' | 'declining' | 'stable';
  comfortTrend: 'increasing' | 'stable';

  /** Voice characteristic trends */
  pitchTrend: 'rising' | 'falling' | 'stable';
  tempoTrend: 'faster' | 'slower' | 'stable';
}

export interface SignificantChange {
  type: 'energy' | 'mood' | 'stress' | 'growth' | 'concern';
  description: string;
  magnitude: number; // 0-1
  detected: Date;
  acknowledged: boolean;
  sessionId: string;
}

export interface CrossSessionVoiceMemory {
  userId: string;

  /** Session snapshots (most recent first) */
  sessionSnapshots: SessionVoiceSnapshot[];

  /** Cross-session patterns */
  patterns: CrossSessionPatterns;

  /** Significant changes to acknowledge */
  significantChanges: SignificantChange[];

  /** Voice print reference */
  voicePrintId: string | null;

  /** Metadata */
  totalSessions: number;
  firstSessionDate: Date;
  lastSessionDate: Date;
}

export interface CrossSessionAcknowledgment {
  text: string;
  ssml: string;
  type: 'observation' | 'celebration' | 'concern' | 'trend';
  priority: 'low' | 'medium' | 'high';
  changeId?: string; // If acknowledging a specific change
}

// ============================================================================
// ACKNOWLEDGMENT TEMPLATES
// ============================================================================

const CROSS_SESSION_ACKNOWLEDGMENTS = {
  more_energized: [
    'You sound more energized than last time we talked!',
    "There's more spark in your voice today.",
    'Your energy is up! Something good happening?',
  ],

  less_energized: [
    'You sound a bit different today—everything okay?',
    'I notice your voice is softer than last time. Long week?',
    'You seem a bit tired compared to our last chat.',
  ],

  more_relaxed: [
    'You sound more relaxed than last time we talked.',
    "There's a calmness in your voice today.",
    'Something feels lighter in your voice.',
  ],

  more_stressed: [
    'I notice more tension in your voice than last time. Want to talk about it?',
    "You sound like you're carrying more than usual.",
    "There's something different in your voice today. Everything okay?",
  ],

  positive_trend: [
    "You know, I've noticed over our conversations—you sound more vibrant lately.",
    "There's been a positive shift in your voice over our recent talks.",
    "I'm noticing a lighter quality in your voice these past few sessions.",
  ],

  growth: [
    'Your voice has really changed since we first started talking. In a good way.',
    'I hear more confidence in your voice than when we started.',
    "There's a groundedness in your voice now that I didn't hear at first.",
  ],

  concern: [
    "I've noticed your voice has been different these past few sessions. How are you really doing?",
    "Something's shifted in how you sound recently. Want to talk about it?",
  ],
};

// ============================================================================
// CROSS-SESSION VOICE ENGINE
// ============================================================================

export class CrossSessionVoiceEngine {
  private memory: CrossSessionVoiceMemory;
  private currentSessionId: string | null = null;
  private currentSessionStart: VoiceSnapshot | null = null;
  private sessionMoments: SessionVoiceSnapshot['notableMoments'] = [];
  private sessionTurnCount = 0;

  constructor(userId: string, existingMemory?: CrossSessionVoiceMemory) {
    if (existingMemory) {
      this.memory = existingMemory;
    } else {
      this.memory = this.createInitialMemory(userId);
    }
    logger.debug(
      { userId, sessions: this.memory.totalSessions },
      'CrossSessionVoiceEngine initialized'
    );
  }

  /**
   * Start a new session
   */
  startSession(sessionId: string, startingVoice: VoiceSnapshot): void {
    this.currentSessionId = sessionId;
    this.currentSessionStart = startingVoice;
    this.sessionMoments = [];
    this.sessionTurnCount = 0;

    // Check for cross-session changes
    this.detectChanges(startingVoice);

    logger.debug({ sessionId }, '🎬 Cross-session tracking started');
  }

  /**
   * Record a notable moment in the current session
   */
  recordMoment(
    turn: number,
    description: string,
    voiceState: Partial<VoiceSnapshot>,
    emotion: string
  ): void {
    this.sessionMoments.push({
      turn,
      description,
      voiceState,
      emotion,
    });
    this.sessionTurnCount = Math.max(this.sessionTurnCount, turn);
  }

  /**
   * End the current session
   */
  endSession(endingVoice: VoiceSnapshot): void {
    if (!this.currentSessionId || !this.currentSessionStart) {
      logger.warn('No active session to end');
      return;
    }

    // Calculate session metrics
    const overallEnergy = (this.currentSessionStart.energyMean + endingVoice.energyMean) / 2;
    const overallValence = (this.currentSessionStart.valence + endingVoice.valence) / 2;
    const emotionalRange = Math.abs(this.currentSessionStart.valence - endingVoice.valence);

    // Create snapshot
    const snapshot: SessionVoiceSnapshot = {
      sessionId: this.currentSessionId,
      date: new Date(),
      startingVoice: this.currentSessionStart,
      endingVoice,
      notableMoments: this.sessionMoments,
      overallEnergy,
      overallValence,
      emotionalRange,
      duration: this.calculateSessionDuration(),
      turnCount: this.sessionTurnCount,
    };

    // Add to memory (keep last 20 sessions)
    this.memory.sessionSnapshots.unshift(snapshot);
    if (this.memory.sessionSnapshots.length > 20) {
      this.memory.sessionSnapshots.pop();
    }

    this.memory.totalSessions++;
    this.memory.lastSessionDate = new Date();

    // Update patterns
    this.updatePatterns();

    // Reset session state
    this.currentSessionId = null;
    this.currentSessionStart = null;
    this.sessionMoments = [];
    this.sessionTurnCount = 0;

    logger.debug({ sessionId: snapshot.sessionId }, '🎬 Cross-session tracking ended');
  }

  /**
   * Generate cross-session acknowledgment if appropriate
   */
  generateAcknowledgment(currentVoice: VoiceSnapshot): CrossSessionAcknowledgment | null {
    // Check for unacknowledged significant changes
    const unacknowledged = this.memory.significantChanges.find((c) => !c.acknowledged);
    if (unacknowledged) {
      return this.createAcknowledgmentForChange(unacknowledged);
    }

    // Check if we have enough history
    if (this.memory.sessionSnapshots.length < 2) {
      return null;
    }

    // Compare to last session
    const lastSession = this.memory.sessionSnapshots[0];
    if (!lastSession.startingVoice) {
      return null;
    }

    const energyChange = currentVoice.energyMean - lastSession.startingVoice.energyMean;
    const moodChange = currentVoice.valence - lastSession.startingVoice.valence;

    // Generate contextual acknowledgment
    if (energyChange > 0.2) {
      return this.createAcknowledgment('more_energized', 'observation', 'medium');
    }

    if (energyChange < -0.2) {
      return this.createAcknowledgment('less_energized', 'concern', 'medium');
    }

    if (moodChange > 0.3) {
      return this.createAcknowledgment('more_relaxed', 'observation', 'low');
    }

    if (moodChange < -0.3) {
      return this.createAcknowledgment('more_stressed', 'concern', 'medium');
    }

    // Check for longer-term trends (every 5 sessions)
    if (this.memory.totalSessions % 5 === 0 && this.memory.patterns.energyTrend === 'improving') {
      return this.createAcknowledgment('positive_trend', 'celebration', 'low');
    }

    // Check for growth (every 10 sessions)
    if (this.memory.totalSessions % 10 === 0 && this.memory.totalSessions >= 10) {
      return this.createAcknowledgment('growth', 'celebration', 'low');
    }

    return null;
  }

  /**
   * Mark a significant change as acknowledged
   */
  markAcknowledged(changeId: string): void {
    const change = this.memory.significantChanges.find(
      (c) => `${c.type}-${c.detected.getTime()}` === changeId
    );
    if (change) {
      change.acknowledged = true;
    }
  }

  /**
   * Get cross-session patterns
   */
  getPatterns(): CrossSessionPatterns {
    return { ...this.memory.patterns };
  }

  /**
   * Get session history summary
   */
  getHistorySummary(): {
    totalSessions: number;
    averageEnergy: number;
    averageValence: number;
    recentTrend: string;
  } {
    if (this.memory.sessionSnapshots.length === 0) {
      return {
        totalSessions: 0,
        averageEnergy: 0.5,
        averageValence: 0,
        recentTrend: 'stable',
      };
    }

    const recent = this.memory.sessionSnapshots.slice(0, 5);
    const avgEnergy = recent.reduce((sum, s) => sum + s.overallEnergy, 0) / recent.length;
    const avgValence = recent.reduce((sum, s) => sum + s.overallValence, 0) / recent.length;

    return {
      totalSessions: this.memory.totalSessions,
      averageEnergy: avgEnergy,
      averageValence: avgValence,
      recentTrend: this.memory.patterns.energyTrend,
    };
  }

  /**
   * Get memory for persistence
   */
  getMemory(): CrossSessionVoiceMemory {
    return {
      ...this.memory,
      sessionSnapshots: [...this.memory.sessionSnapshots],
      significantChanges: [...this.memory.significantChanges],
    };
  }

  /**
   * Serialize for storage
   */
  serialize(): string {
    return JSON.stringify(this.memory, (key, value) => {
      if (value instanceof Date) {
        return { __type: 'Date', value: value.toISOString() };
      }
      return value;
    });
  }

  /**
   * Deserialize from storage
   */
  static deserialize(data: string): CrossSessionVoiceMemory {
    return JSON.parse(data, (key, value) => {
      if (value && typeof value === 'object' && value.__type === 'Date') {
        return new Date(value.value);
      }
      return value;
    });
  }

  /**
   * Reset (clears all history)
   */
  reset(): void {
    this.memory = this.createInitialMemory(this.memory.userId);
    this.currentSessionId = null;
    this.currentSessionStart = null;
    this.sessionMoments = [];
    this.sessionTurnCount = 0;
    logger.debug('CrossSessionVoiceEngine reset');
  }

  // ==========================================================================
  // PRIVATE HELPERS
  // ==========================================================================

  private createInitialMemory(userId: string): CrossSessionVoiceMemory {
    return {
      userId,
      sessionSnapshots: [],
      patterns: {
        morningEnergy: null,
        eveningEnergy: null,
        weekdayMood: null,
        weekendMood: null,
        energyTrend: 'stable',
        moodTrend: 'stable',
        comfortTrend: 'stable',
        pitchTrend: 'stable',
        tempoTrend: 'stable',
      },
      significantChanges: [],
      voicePrintId: null,
      totalSessions: 0,
      firstSessionDate: new Date(),
      lastSessionDate: new Date(),
    };
  }

  private detectChanges(currentVoice: VoiceSnapshot): void {
    if (this.memory.sessionSnapshots.length === 0) return;

    const lastSession = this.memory.sessionSnapshots[0];
    if (!lastSession.startingVoice) return;

    const energyChange = currentVoice.energyMean - lastSession.startingVoice.energyMean;
    const moodChange = currentVoice.valence - lastSession.startingVoice.valence;
    const stressChange = currentVoice.strain - lastSession.startingVoice.strain;

    // Detect significant changes
    if (Math.abs(energyChange) > 0.25) {
      this.memory.significantChanges.push({
        type: 'energy',
        description:
          energyChange > 0
            ? 'Noticeably more energized than last session'
            : 'Noticeably less energized than last session',
        magnitude: Math.abs(energyChange),
        detected: new Date(),
        acknowledged: false,
        sessionId: this.currentSessionId || '',
      });
    }

    if (Math.abs(moodChange) > 0.3) {
      this.memory.significantChanges.push({
        type: 'mood',
        description:
          moodChange > 0
            ? 'Mood significantly improved since last session'
            : 'Mood shifted negatively since last session',
        magnitude: Math.abs(moodChange),
        detected: new Date(),
        acknowledged: false,
        sessionId: this.currentSessionId || '',
      });
    }

    if (stressChange > 0.2) {
      this.memory.significantChanges.push({
        type: 'stress',
        description: 'Voice shows more strain/stress than last session',
        magnitude: stressChange,
        detected: new Date(),
        acknowledged: false,
        sessionId: this.currentSessionId || '',
      });
    }

    // Keep only recent changes
    if (this.memory.significantChanges.length > 10) {
      this.memory.significantChanges = this.memory.significantChanges.slice(-10);
    }
  }

  private updatePatterns(): void {
    if (this.memory.sessionSnapshots.length < 3) return;

    const recent = this.memory.sessionSnapshots.slice(0, 5);
    const older = this.memory.sessionSnapshots.slice(5, 10);

    // Calculate trends
    if (older.length >= 3) {
      const recentAvgEnergy = recent.reduce((s, r) => s + r.overallEnergy, 0) / recent.length;
      const olderAvgEnergy = older.reduce((s, r) => s + r.overallEnergy, 0) / older.length;

      if (recentAvgEnergy > olderAvgEnergy + 0.1) {
        this.memory.patterns.energyTrend = 'improving';
      } else if (recentAvgEnergy < olderAvgEnergy - 0.1) {
        this.memory.patterns.energyTrend = 'declining';
      } else {
        this.memory.patterns.energyTrend = 'stable';
      }

      const recentAvgValence = recent.reduce((s, r) => s + r.overallValence, 0) / recent.length;
      const olderAvgValence = older.reduce((s, r) => s + r.overallValence, 0) / older.length;

      if (recentAvgValence > olderAvgValence + 0.15) {
        this.memory.patterns.moodTrend = 'improving';
      } else if (recentAvgValence < olderAvgValence - 0.15) {
        this.memory.patterns.moodTrend = 'declining';
      } else {
        this.memory.patterns.moodTrend = 'stable';
      }
    }

    // Time-based patterns (simplified)
    const morningsSessions = this.memory.sessionSnapshots.filter((s) => {
      const hour = s.date.getHours();
      return hour >= 5 && hour < 12;
    });

    const eveningSessions = this.memory.sessionSnapshots.filter((s) => {
      const hour = s.date.getHours();
      return hour >= 17 && hour < 23;
    });

    if (morningsSessions.length >= 2) {
      this.memory.patterns.morningEnergy =
        morningsSessions.reduce((s, r) => s + r.overallEnergy, 0) / morningsSessions.length;
    }

    if (eveningSessions.length >= 2) {
      this.memory.patterns.eveningEnergy =
        eveningSessions.reduce((s, r) => s + r.overallEnergy, 0) / eveningSessions.length;
    }
  }

  private calculateSessionDuration(): number {
    if (!this.currentSessionStart) return 0;
    return Math.floor((Date.now() - this.currentSessionStart.timestamp.getTime()) / 60000);
  }

  private createAcknowledgment(
    type: keyof typeof CROSS_SESSION_ACKNOWLEDGMENTS,
    category: CrossSessionAcknowledgment['type'],
    priority: CrossSessionAcknowledgment['priority']
  ): CrossSessionAcknowledgment {
    const templates = CROSS_SESSION_ACKNOWLEDGMENTS[type];
    const text = templates[Math.floor(Math.random() * templates.length)];

    return {
      text,
      ssml: `<break time="200ms"/>${text}`,
      type: category,
      priority,
    };
  }

  private createAcknowledgmentForChange(change: SignificantChange): CrossSessionAcknowledgment {
    let templates: string[];
    let category: CrossSessionAcknowledgment['type'];

    switch (change.type) {
      case 'energy':
        templates =
          change.magnitude > 0
            ? CROSS_SESSION_ACKNOWLEDGMENTS.more_energized
            : CROSS_SESSION_ACKNOWLEDGMENTS.less_energized;
        category = change.magnitude > 0 ? 'observation' : 'concern';
        break;
      case 'mood':
        templates =
          change.magnitude > 0
            ? CROSS_SESSION_ACKNOWLEDGMENTS.more_relaxed
            : CROSS_SESSION_ACKNOWLEDGMENTS.more_stressed;
        category = change.magnitude > 0 ? 'observation' : 'concern';
        break;
      case 'stress':
        templates = CROSS_SESSION_ACKNOWLEDGMENTS.more_stressed;
        category = 'concern';
        break;
      case 'growth':
        templates = CROSS_SESSION_ACKNOWLEDGMENTS.growth;
        category = 'celebration';
        break;
      case 'concern':
        templates = CROSS_SESSION_ACKNOWLEDGMENTS.concern;
        category = 'concern';
        break;
      default:
        templates = CROSS_SESSION_ACKNOWLEDGMENTS.positive_trend;
        category = 'observation';
    }

    const text = templates[Math.floor(Math.random() * templates.length)];

    return {
      text,
      ssml: `<break time="200ms"/>${text}`,
      type: category,
      priority: category === 'concern' ? 'high' : 'medium',
      changeId: `${change.type}-${change.detected.getTime()}`,
    };
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

const engines = new Map<string, CrossSessionVoiceEngine>();

export function getCrossSessionVoiceEngine(
  userId: string,
  existingMemory?: CrossSessionVoiceMemory
): CrossSessionVoiceEngine {
  if (!engines.has(userId)) {
    engines.set(userId, new CrossSessionVoiceEngine(userId, existingMemory));
  }
  return engines.get(userId)!;
}

export function resetCrossSessionVoiceEngine(userId: string): void {
  const engine = engines.get(userId);
  if (engine) {
    engine.reset();
    engines.delete(userId);
  }
}

export function resetAllCrossSessionVoiceEngines(): void {
  engines.clear();
}

export default CrossSessionVoiceEngine;
