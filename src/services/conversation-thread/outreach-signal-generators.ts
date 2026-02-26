/**
 * Superhuman Outreach Intelligence - Signal Generators (V0/V1)
 *
 * Core signal generators and Better Than Human V1 generators:
 * crisis, prediction, capacity, values, open loops, temporal,
 * voice distress, dreams, milestones, streaks, goals, reconnection,
 * life chapters, seasonal, silence, contradiction, receptivity,
 * blind spots, future trajectory.
 *
 * @module services/conversation-thread/outreach-signal-generators
 */

import type { SuperhumanSignal } from './outreach-signal-types.js';

// ============================================================================
// CORE SIGNAL GENERATORS (V0)
// ============================================================================

/**
 * Generate signals from crisis detection.
 */
export function signalFromCrisis(crisisData: {
  type: string;
  severity: 'low' | 'moderate' | 'high' | 'severe';
  context?: string;
}): SuperhumanSignal {
  return {
    type: 'crisis_detected',
    severity:
      crisisData.severity === 'severe'
        ? 'urgent'
        : crisisData.severity === 'high'
          ? 'high'
          : 'medium',
    source: 'emotional-first-aid',
    data: crisisData,
    timestamp: new Date(),
  };
}

/**
 * Generate signals from predictive coaching.
 */
export function signalFromPrediction(prediction: {
  patternId: string;
  confidence: number;
  timing: string;
  context?: string;
}): SuperhumanSignal {
  return {
    type: 'predictive_pattern_match',
    severity: prediction.confidence > 0.8 ? 'high' : prediction.confidence > 0.5 ? 'medium' : 'low',
    source: 'predictive-coaching',
    data: prediction,
    timestamp: new Date(),
  };
}

/**
 * Generate signals from capacity guardian.
 */
export function signalFromCapacity(capacity: {
  level: 'depleted' | 'low' | 'moderate' | 'good' | 'high';
  burnoutRisk: boolean;
  indicators: string[];
}): SuperhumanSignal | null {
  if (capacity.level !== 'depleted' && capacity.level !== 'low') return null;

  return {
    type: 'capacity_depleted',
    severity: capacity.burnoutRisk ? 'high' : 'medium',
    source: 'capacity-guardian',
    data: capacity,
    timestamp: new Date(),
  };
}

/**
 * Generate signals from values alignment.
 */
export function signalFromValuesConflict(conflict: {
  statedValue: string;
  demonstratedValue: string;
  tension: string;
}): SuperhumanSignal {
  return {
    type: 'values_conflict',
    severity: 'medium',
    source: 'values-alignment',
    data: conflict,
    timestamp: new Date(),
  };
}

/**
 * Generate signals from open loops.
 */
export function signalFromOpenLoop(loop: {
  type: string;
  content: string;
  priority: number;
}): SuperhumanSignal | null {
  if (loop.priority < 3) return null; // Only high priority loops

  return {
    type: loop.type === 'life_event' ? 'life_event_detected' : 'open_loop_high_priority',
    severity: loop.priority >= 4 ? 'high' : 'medium',
    source: 'open-loops',
    data: loop,
    timestamp: new Date(),
  };
}

/**
 * Generate signals from temporal patterns.
 */
export function signalFromTemporalAnomaly(anomaly: {
  description: string;
  unusualBehavior: string;
}): SuperhumanSignal {
  return {
    type: 'temporal_anomaly',
    severity: 'medium',
    source: 'temporal-patterns',
    data: anomaly,
    timestamp: new Date(),
  };
}

/**
 * Generate signals from voice prosody analysis.
 */
export function signalFromVoiceDistress(voice: {
  hasStrain: boolean;
  hasTremor: boolean;
  arousal: number;
  valence: number;
}): SuperhumanSignal | null {
  if (!voice.hasStrain && !voice.hasTremor && voice.arousal < 0.7) return null;

  return {
    type: 'voice_distress',
    severity: voice.hasStrain && voice.hasTremor ? 'high' : 'medium',
    source: 'voice-prosody',
    data: voice,
    timestamp: new Date(),
  };
}

/**
 * Generate signals from dream keeper.
 */
export function signalFromDreamReignition(dream: {
  dreamText: string;
  dormantDays: number;
  mentionedAgain: boolean;
}): SuperhumanSignal | null {
  if (!dream.mentionedAgain || dream.dormantDays < 30) return null;

  return {
    type: 'dream_reignited',
    severity: dream.dormantDays > 180 ? 'high' : 'medium',
    source: 'dream-keeper',
    data: dream,
    timestamp: new Date(),
  };
}

/**
 * Generate signals from relationship milestones.
 */
export function signalFromMilestone(milestone: {
  type: 'duration' | 'conversations' | 'trust' | 'breakthrough' | 'growth';
  title: string;
  isSignificant: boolean;
}): SuperhumanSignal | null {
  if (!milestone.isSignificant) return null;

  const isMajor = ['100 Conversations', 'One Year', 'Six Months'].includes(milestone.title);

  return {
    type: milestone.type === 'breakthrough' ? 'breakthrough_moment' : 'commitment_milestone',
    severity: isMajor ? 'high' : 'medium',
    source: 'relationship-milestones',
    data: milestone,
    timestamp: new Date(),
  };
}

/**
 * Generate signals from habit streaks.
 */
export function signalFromStreak(streak: {
  habitName: string;
  streakDays: number;
  isRecord: boolean;
}): SuperhumanSignal | null {
  // Celebrate 7, 30, 100 day streaks or personal records
  const isMilestone = [7, 30, 100].includes(streak.streakDays) || streak.isRecord;
  if (!isMilestone) return null;

  return {
    type: 'streak_milestone',
    severity: streak.streakDays >= 30 || streak.isRecord ? 'high' : 'medium',
    source: 'habit-tracking',
    data: streak,
    timestamp: new Date(),
  };
}

/**
 * Generate signals from goal completion.
 */
export function signalFromGoalAchieved(goal: {
  goalId: string;
  goalTitle: string;
  completionDate: Date;
  importance: 'low' | 'medium' | 'high';
}): SuperhumanSignal {
  return {
    type: 'goal_achieved',
    severity: goal.importance,
    source: 'goal-tracking',
    data: goal,
    timestamp: new Date(),
  };
}

/**
 * Generate signals from relationship network.
 */
export function signalFromReconnection(reconnect: {
  personName: string;
  daysSinceLastMention: number;
  importance: number;
}): SuperhumanSignal | null {
  if (reconnect.daysSinceLastMention < 30 || reconnect.importance < 0.5) return null;

  return {
    type: 'relationship_reconnect',
    severity: reconnect.daysSinceLastMention > 90 ? 'high' : 'medium',
    source: 'relationship-network',
    data: reconnect,
    timestamp: new Date(),
  };
}

// ============================================================================
// BETTER THAN HUMAN V1 SIGNAL GENERATORS
// ============================================================================

/**
 * Generate signals from life narrative chapter changes.
 */
export function signalFromLifeChapter(chapter: {
  chapterType: string;
  title: string;
  isNewChapter: boolean;
  significance: 'minor' | 'moderate' | 'major';
}): SuperhumanSignal | null {
  if (!chapter.isNewChapter || chapter.significance === 'minor') return null;

  return {
    type: 'life_chapter_change',
    severity: chapter.significance === 'major' ? 'high' : 'medium',
    source: 'life-narrative',
    data: chapter,
    timestamp: new Date(),
  };
}

/**
 * Generate signals from seasonal awareness.
 */
export function signalFromSeasonalDate(date: {
  name: string;
  daysUntil: number;
  dateType: 'anniversary' | 'birthday' | 'memorial' | 'custom';
  importance: number;
}): SuperhumanSignal | null {
  // Alert 7 days before, or 1 day for less important
  const threshold = date.importance > 0.7 ? 7 : 1;
  if (date.daysUntil > threshold || date.daysUntil < 0) return null;

  return {
    type: 'seasonal_date_upcoming',
    severity: date.daysUntil <= 1 ? 'high' : 'medium',
    source: 'seasonal-awareness',
    data: date,
    timestamp: new Date(),
  };
}

/**
 * Generate signals from seasonal pattern detection.
 */
export function signalFromSeasonalPattern(pattern: {
  patternType: string;
  currentSeason: string;
  userTendency: string;
  confidence: number;
}): SuperhumanSignal | null {
  if (pattern.confidence < 0.6) return null;

  return {
    type: 'seasonal_pattern_match',
    severity: pattern.confidence > 0.8 ? 'high' : 'medium',
    source: 'seasonal-awareness',
    data: pattern,
    timestamp: new Date(),
  };
}

/**
 * Generate signals from silence interpreter.
 */
export function signalFromSilence(silence: {
  silenceType: 'processing' | 'invitation' | 'thinking' | 'resistance' | 'emotional';
  duration: number;
  context?: string;
}): SuperhumanSignal | null {
  if (silence.silenceType !== 'processing' && silence.silenceType !== 'invitation') return null;

  return {
    type: silence.silenceType === 'processing' ? 'silence_processing' : 'silence_invitation',
    severity: 'low',
    source: 'silence-interpreter',
    data: silence,
    timestamp: new Date(),
  };
}

/**
 * Generate signals from contradiction comfort.
 */
export function signalFromContradiction(contradiction: {
  emotions: [string, string];
  intensity: number;
  validated: boolean;
}): SuperhumanSignal | null {
  if (contradiction.intensity < 0.5) return null;

  return {
    type: 'contradiction_detected',
    severity: contradiction.intensity > 0.8 ? 'high' : 'medium',
    source: 'contradiction-comfort',
    data: contradiction,
    timestamp: new Date(),
  };
}

/**
 * Generate signals from perfect timing / receptivity.
 */
export function signalFromReceptivity(receptivity: {
  score: number;
  factors: string[];
  bestTopics?: string[];
  avoidTopics?: string[];
}): SuperhumanSignal | null {
  if (receptivity.score >= 0.7) {
    return {
      type: 'receptivity_high',
      severity: 'low',
      source: 'perfect-timing',
      data: receptivity,
      timestamp: new Date(),
    };
  }
  if (receptivity.score <= 0.3) {
    return {
      type: 'receptivity_low',
      severity: 'low',
      source: 'perfect-timing',
      data: receptivity,
      timestamp: new Date(),
    };
  }
  return null;
}

/**
 * Generate signals from pattern mirror (blind spots).
 */
export function signalFromBlindSpot(pattern: {
  patternType: 'topic_energy' | 'cyclical' | 'fading' | 'mismatch';
  description: string;
  confidence: number;
  surfaceable: boolean;
}): SuperhumanSignal | null {
  if (!pattern.surfaceable || pattern.confidence < 0.7) return null;

  return {
    type: 'blind_spot_pattern',
    severity: 'medium',
    source: 'pattern-mirror',
    data: pattern,
    timestamp: new Date(),
  };
}

/**
 * Generate signals from future self projection.
 */
export function signalFromFutureTrajectory(trajectory: {
  timeframe: '3_months' | '1_year' | '5_years';
  concern: string;
  positivePatterns: string[];
  concerningPatterns: string[];
}): SuperhumanSignal | null {
  if (trajectory.concerningPatterns.length === 0) return null;

  return {
    type: 'future_trajectory_concern',
    severity: trajectory.concerningPatterns.length > 2 ? 'high' : 'medium',
    source: 'future-self',
    data: trajectory,
    timestamp: new Date(),
  };
}
