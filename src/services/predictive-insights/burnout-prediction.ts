/**
 * Burnout Prediction Index
 *
 * > "Your calendar next week has 12 back-to-back meetings.
 * > Last time this happened, you mentioned feeling drained for days after."
 *
 * Combines calendar data, conversation patterns, and historical
 * signals to predict burnout risk before it hits.
 *
 * Factors:
 * - Calendar density (meeting hours)
 * - Back-to-back meeting sequences
 * - Work hours creep
 * - Recent stress mentions
 * - Sleep/energy indicators
 * - Historical burnout patterns
 *
 * @module PredictiveInsights/BurnoutPrediction
 */

import { createLogger } from '../../utils/safe-logger.js';
import type { BurnoutFactor, BurnoutRiskLevel } from './types.js';

const log = createLogger({ module: 'BurnoutPrediction' });

// ============================================================================
// TYPES
// ============================================================================

export interface BurnoutPrediction {
  userId: string;

  /** Overall risk level */
  riskLevel: BurnoutRiskLevel;

  /** Numeric risk score (0-100) */
  riskScore: number;

  /** Contributing factors */
  factors: BurnoutFactor[];

  /** When risk peaks */
  riskPeakDate: Date;

  /** Human-friendly message */
  message: string;

  /** Suggested actions */
  suggestion: string;

  /** Specific recovery actions */
  recoveryActions: string[];

  /** Confidence in prediction (0-1) */
  confidence: number;

  /** Should surface to user */
  shouldSurface: boolean;
}

interface BurnoutHistory {
  episodeDate: Date;
  severity: BurnoutRiskLevel;
  triggers: string[];
  recoveryDays: number;
}

interface UserBurnoutProfile {
  userId: string;
  history: BurnoutHistory[];
  knownTriggers: string[];
  recoveryStrategies: string[];
  lastAssessment?: Date;
}

// ============================================================================
// STORAGE
// ============================================================================

const burnoutProfiles = new Map<string, UserBurnoutProfile>();

// ============================================================================
// FACTOR WEIGHTS
// ============================================================================

const FACTOR_WEIGHTS = {
  calendar_density: 0.25,
  back_to_back_meetings: 0.2,
  work_hours_creep: 0.15,
  stress_mentions: 0.2,
  energy_indicators: 0.1,
  historical_pattern: 0.1,
};

// ============================================================================
// MAIN PREDICTION FUNCTION
// ============================================================================

/**
 * Predict burnout risk for a user
 */
export async function predictBurnoutRisk(userId: string): Promise<BurnoutPrediction> {
  const factors: BurnoutFactor[] = [];
  let totalScore = 0;
  let peakDate = new Date();

  try {
    // Factor 1: Calendar density (next 7 days)
    const calendarFactor = await analyzeCalendarDensity(userId);
    if (calendarFactor) {
      factors.push(calendarFactor);
      totalScore += calendarFactor.score * FACTOR_WEIGHTS.calendar_density;
      if (calendarFactor.peakDate) {
        peakDate = calendarFactor.peakDate;
      }
    }

    // Factor 2: Back-to-back meetings
    const b2bFactor = await analyzeBackToBackMeetings(userId);
    if (b2bFactor) {
      factors.push(b2bFactor);
      totalScore += b2bFactor.score * FACTOR_WEIGHTS.back_to_back_meetings;
    }

    // Factor 3: Work hours creep
    const hoursFactor = await analyzeWorkHoursCreep(userId);
    if (hoursFactor) {
      factors.push(hoursFactor);
      totalScore += hoursFactor.score * FACTOR_WEIGHTS.work_hours_creep;
    }

    // Factor 4: Recent stress mentions
    const stressFactor = await analyzeStressMentions(userId);
    if (stressFactor) {
      factors.push(stressFactor);
      totalScore += stressFactor.score * FACTOR_WEIGHTS.stress_mentions;
    }

    // Factor 5: Energy indicators
    const energyFactor = await analyzeEnergyIndicators(userId);
    if (energyFactor) {
      factors.push(energyFactor);
      totalScore += energyFactor.score * FACTOR_WEIGHTS.energy_indicators;
    }

    // Factor 6: Historical patterns
    const profile = burnoutProfiles.get(userId);
    const historicalFactor = analyzeHistoricalPattern(profile, factors);
    if (historicalFactor) {
      factors.push(historicalFactor);
      totalScore += historicalFactor.score * FACTOR_WEIGHTS.historical_pattern;
    }

    // Calculate overall risk
    const riskScore = Math.min(100, Math.round(totalScore));
    const riskLevel = scoreToRiskLevel(riskScore);

    // Generate message and suggestions
    const { message, suggestion, recoveryActions } = generateBurnoutInsight(
      riskLevel,
      factors,
      profile
    );

    // Calculate confidence
    const confidence = calculateConfidence(factors);

    // Should surface if moderate or higher risk
    const shouldSurface = riskLevel !== 'low' && confidence >= 0.5;

    return {
      userId,
      riskLevel,
      riskScore,
      factors,
      riskPeakDate: peakDate,
      message,
      suggestion,
      recoveryActions,
      confidence,
      shouldSurface,
    };
  } catch (error) {
    log.error({ error, userId }, 'Burnout prediction failed');
    throw error;
  }
}

// ============================================================================
// FACTOR ANALYSIS FUNCTIONS
// ============================================================================

async function analyzeCalendarDensity(
  userId: string
): Promise<(BurnoutFactor & { peakDate?: Date }) | null> {
  try {
    const { getCalendarBusyProfile } = await import('../calendar-busy-detection.js');

    // Get today's busy profile
    const todayProfile = await getCalendarBusyProfile(userId);
    if (!todayProfile) return null;

    // Calculate meeting hours today
    const todayMeetingHours = todayProfile.todayBusySlots.reduce((sum, slot) => {
      return sum + (slot.end.getTime() - slot.start.getTime()) / (60 * 60 * 1000);
    }, 0);

    // Estimate weekly from today (week view not always available)
    const weekMeetingHours = todayMeetingHours * 5; // Rough estimate
    const peakDate = new Date();

    // Score: 6+ hours/day = high risk
    let score = 0;
    let observation = '';

    const avgDailyHours = weekMeetingHours / 5;
    if (avgDailyHours >= 7) {
      score = 100;
      observation = `Extremely heavy: ${avgDailyHours.toFixed(1)}h meetings/day average`;
    } else if (avgDailyHours >= 6) {
      score = 80;
      observation = `Very heavy: ${avgDailyHours.toFixed(1)}h meetings/day average`;
    } else if (avgDailyHours >= 5) {
      score = 60;
      observation = `Heavy: ${avgDailyHours.toFixed(1)}h meetings/day average`;
    } else if (avgDailyHours >= 4) {
      score = 40;
      observation = `Moderate: ${avgDailyHours.toFixed(1)}h meetings/day`;
    } else {
      score = 20;
      observation = `Manageable: ${avgDailyHours.toFixed(1)}h meetings/day`;
    }

    return {
      factor: 'calendar_density',
      score,
      weight: FACTOR_WEIGHTS.calendar_density,
      observation,
      peakDate,
    };
  } catch {
    return null;
  }
}

async function analyzeBackToBackMeetings(userId: string): Promise<BurnoutFactor | null> {
  try {
    const { getCalendarBusyProfile } = await import('../calendar-busy-detection.js');
    const profile = await getCalendarBusyProfile(userId);

    if (!profile || profile.todayBusySlots.length < 2) return null;

    // Sort by start time
    const sorted = [...profile.todayBusySlots].sort(
      (a, b) => a.start.getTime() - b.start.getTime()
    );

    // Count back-to-back sequences
    let backToBackCount = 0;
    let maxSequence = 1;
    let currentSequence = 1;

    for (let i = 1; i < sorted.length; i++) {
      const gap = (sorted[i].start.getTime() - sorted[i - 1].end.getTime()) / 60000;

      if (gap <= 15) {
        // 15 min or less = back-to-back
        backToBackCount++;
        currentSequence++;
        maxSequence = Math.max(maxSequence, currentSequence);
      } else {
        currentSequence = 1;
      }
    }

    let score = 0;
    let observation = '';

    if (maxSequence >= 5) {
      score = 100;
      observation = `${maxSequence} back-to-back meetings - no breaks`;
    } else if (maxSequence >= 4) {
      score = 80;
      observation = `${maxSequence} consecutive meetings`;
    } else if (maxSequence >= 3) {
      score = 60;
      observation = `${maxSequence} back-to-back meetings`;
    } else if (backToBackCount >= 2) {
      score = 40;
      observation = `${backToBackCount} back-to-back meeting pairs`;
    } else {
      score = 20;
      observation = 'Meetings have adequate breaks';
    }

    return {
      factor: 'back_to_back_meetings',
      score,
      weight: FACTOR_WEIGHTS.back_to_back_meetings,
      observation,
    };
  } catch {
    return null;
  }
}

async function analyzeWorkHoursCreep(userId: string): Promise<BurnoutFactor | null> {
  try {
    // Check for evening/weekend calendar events
    const { getCalendarBusyProfile } = await import('../calendar-busy-detection.js');
    const profile = await getCalendarBusyProfile(userId);

    if (!profile) return null;

    let lateEvents = 0;
    let earlyEvents = 0;

    for (const slot of profile.todayBusySlots) {
      const hour = slot.start.getHours();
      if (hour >= 18) lateEvents++;
      if (hour < 8) earlyEvents++;
    }

    const creepCount = lateEvents + earlyEvents;

    let score = 0;
    let observation = '';

    if (creepCount >= 3) {
      score = 80;
      observation = 'Multiple early/late meetings today';
    } else if (creepCount >= 2) {
      score = 60;
      observation = 'Work bleeding into personal time';
    } else if (creepCount >= 1) {
      score = 40;
      observation = 'One off-hours commitment';
    } else {
      score = 10;
      observation = 'Work hours contained';
    }

    return {
      factor: 'work_hours_creep',
      score,
      weight: FACTOR_WEIGHTS.work_hours_creep,
      observation,
    };
  } catch {
    return null;
  }
}

async function analyzeStressMentions(userId: string): Promise<BurnoutFactor | null> {
  try {
    // Try to get recent conversation themes
    const { getWellbeingProfile } = await import('../wellbeing-tracking/index.js');
    const profile = getWellbeingProfile(userId);

    if (!profile?.current) return null;

    // Use mood and worry from current snapshot (0-1 scale, convert to 0-100)
    // Higher mood and lower worry = better emotional state
    const moodScore = (profile.current.dimensions.mood || 0.5) * 100;
    const worryScore = (profile.current.dimensions.worry || 0.5) * 100;
    const emotionalScore = (moodScore + (100 - worryScore)) / 2;

    let score = 0;
    let observation = '';

    if (emotionalScore < 30) {
      score = 90;
      observation = 'Recent conversations indicate high stress';
    } else if (emotionalScore < 45) {
      score = 70;
      observation = 'Signs of elevated stress in recent chats';
    } else if (emotionalScore < 55) {
      score = 40;
      observation = 'Moderate stress indicators';
    } else {
      score = 20;
      observation = 'Stress levels appear manageable';
    }

    return {
      factor: 'stress_mentions',
      score,
      weight: FACTOR_WEIGHTS.stress_mentions,
      observation,
    };
  } catch {
    return null;
  }
}

async function analyzeEnergyIndicators(userId: string): Promise<BurnoutFactor | null> {
  try {
    const { predictEnergy } = await import('./energy-prediction.js');
    const energy = await predictEnergy(userId);

    let score = 0;
    let observation = '';

    switch (energy.predictedLevel) {
      case 'very_low':
        score = 90;
        observation = 'Energy levels predicted very low';
        break;
      case 'low':
        score = 70;
        observation = 'Energy levels predicted low';
        break;
      case 'moderate':
        score = 40;
        observation = 'Moderate energy expected';
        break;
      default:
        score = 20;
        observation = 'Good energy levels';
    }

    return {
      factor: 'energy_indicators',
      score,
      weight: FACTOR_WEIGHTS.energy_indicators,
      observation,
    };
  } catch {
    return null;
  }
}

function analyzeHistoricalPattern(
  profile: UserBurnoutProfile | undefined,
  currentFactors: BurnoutFactor[]
): BurnoutFactor | null {
  if (!profile || profile.history.length === 0) return null;

  // Check if current conditions match past burnout triggers
  const currentTriggers = currentFactors.filter((f) => f.score >= 60).map((f) => f.factor);

  const matchingTriggers = profile.knownTriggers.filter((t) => currentTriggers.includes(t));

  let score = 0;
  let observation = '';

  if (matchingTriggers.length >= 2) {
    score = 80;
    observation = `Pattern match: ${matchingTriggers.join(', ')} triggered burnout before`;
  } else if (matchingTriggers.length === 1) {
    score = 50;
    observation = `Warning: "${matchingTriggers[0]}" has led to burnout before`;
  } else {
    score = 20;
    observation = 'No historical burnout pattern match';
  }

  return {
    factor: 'historical_pattern',
    score,
    weight: FACTOR_WEIGHTS.historical_pattern,
    observation,
  };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function scoreToRiskLevel(score: number): BurnoutRiskLevel {
  if (score >= 80) return 'critical';
  if (score >= 60) return 'high';
  if (score >= 40) return 'moderate';
  return 'low';
}

function generateBurnoutInsight(
  riskLevel: BurnoutRiskLevel,
  factors: BurnoutFactor[],
  profile?: UserBurnoutProfile
): { message: string; suggestion: string; recoveryActions: string[] } {
  const topFactors = factors.sort((a, b) => b.score - a.score).slice(0, 2);

  let message = '';
  let suggestion = '';
  let recoveryActions: string[] = [];

  switch (riskLevel) {
    case 'critical':
      message = `Burnout risk is critical. ${topFactors[0]?.observation || 'Multiple warning signs detected.'}`;
      suggestion = "I'm genuinely concerned. Let's talk about what we can change immediately.";
      recoveryActions = [
        'Cancel or delegate at least 2 meetings today',
        'Block 2 hours for yourself tomorrow',
        'Consider working from home if possible',
        'Reach out to someone who can help',
      ];
      break;

    case 'high':
      message = `I'm seeing burnout warning signs. ${topFactors[0]?.observation || "You're running hot."}`;
      suggestion = 'This is the inflection point. Small changes now prevent bigger problems.';
      recoveryActions = [
        'Decline one non-essential meeting this week',
        'Add 15-min buffers between meetings',
        'Take a real lunch break tomorrow',
        "Say no to one thing you'd normally say yes to",
      ];
      break;

    case 'moderate':
      message = `Your schedule is getting heavy. ${topFactors[0]?.observation || 'Worth keeping an eye on.'}`;
      suggestion = "You're not in danger yet, but the trend isn't great.";
      recoveryActions = [
        'Audit your calendar for low-value meetings',
        'Protect one morning this week for deep work',
        'Check in with yourself at the end of each day',
      ];
      break;

    default:
      message = 'Burnout risk looks manageable right now.';
      suggestion = "Keep doing what you're doing.";
      recoveryActions = ['Maintain current boundaries'];
  }

  // Add personal recovery strategies if known
  if (profile?.recoveryStrategies && profile.recoveryStrategies.length > 0) {
    recoveryActions.push(`Remember: "${profile.recoveryStrategies[0]}" has helped you before`);
  }

  return { message, suggestion, recoveryActions };
}

function calculateConfidence(factors: BurnoutFactor[]): number {
  // More factors = more confidence
  const factorCount = factors.length;
  const avgScore =
    factors.length > 0 ? factors.reduce((sum, f) => sum + f.score, 0) / factors.length : 0;

  let confidence = 0.3;
  if (factorCount >= 5) confidence += 0.3;
  else if (factorCount >= 3) confidence += 0.2;

  // Clear signals increase confidence
  if (avgScore >= 60) confidence += 0.2;

  return Math.min(confidence, 0.9);
}

// ============================================================================
// DATA COLLECTION
// ============================================================================

/**
 * Record a burnout episode for learning
 */
export function recordBurnoutEpisode(
  userId: string,
  severity: BurnoutRiskLevel,
  triggers: string[],
  recoveryDays: number
): void {
  let profile = burnoutProfiles.get(userId);
  if (!profile) {
    profile = {
      userId,
      history: [],
      knownTriggers: [],
      recoveryStrategies: [],
    };
    burnoutProfiles.set(userId, profile);
  }

  profile.history.push({
    episodeDate: new Date(),
    severity,
    triggers,
    recoveryDays,
  });

  // Update known triggers
  for (const trigger of triggers) {
    if (!profile.knownTriggers.includes(trigger)) {
      profile.knownTriggers.push(trigger);
    }
  }

  log.info({ userId, severity, triggers }, 'Recorded burnout episode');
}

/**
 * Record a recovery strategy that worked
 */
export function recordRecoveryStrategy(userId: string, strategy: string): void {
  let profile = burnoutProfiles.get(userId);
  if (!profile) {
    profile = {
      userId,
      history: [],
      knownTriggers: [],
      recoveryStrategies: [],
    };
    burnoutProfiles.set(userId, profile);
  }

  if (!profile.recoveryStrategies.includes(strategy)) {
    profile.recoveryStrategies.push(strategy);
  }
}

/**
 * Clear burnout data for a user
 */
export function clearBurnoutData(userId: string): void {
  burnoutProfiles.delete(userId);
}

export default {
  predictBurnoutRisk,
  recordBurnoutEpisode,
  recordRecoveryStrategy,
  clearBurnoutData,
};
