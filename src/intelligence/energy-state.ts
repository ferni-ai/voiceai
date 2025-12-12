/**
 * Energy State Inference System
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Inferring physical and mental energy from voice patterns and behavior.
 * Understanding when someone is depleted vs. energized, and adapting
 * response complexity accordingly.
 *
 * "You sound tired today. Want to keep things light, or would talking help?"
 *
 * This is superhuman because even close friends don't always notice
 * subtle energy shifts, and they certainly can't modulate their own
 * communication style in response.
 */

import { createLogger } from '../utils/safe-logger.js';
import type { VoiceEmotionResult } from '../speech/audio-prosody.js';

const log = createLogger({ module: 'EnergyState' });

// ============================================================================
// TYPES
// ============================================================================

export type EnergyLevel = 'depleted' | 'low' | 'moderate' | 'high' | 'elevated';
export type SleepQuality = 'poor' | 'fair' | 'good' | 'unknown';
export type MentalCapacity = 'overwhelmed' | 'limited' | 'normal' | 'sharp' | 'flow';

export interface PhysicalEnergyState {
  /** Overall physical energy level */
  level: EnergyLevel;

  /** Estimated sleep quality */
  sleepQuality: SleepQuality;

  /** Indicators detected */
  indicators: Array<{
    type: 'voice' | 'language' | 'pace' | 'engagement';
    signal: string;
    weight: number;
  }>;

  /** Time of day factor */
  timeOfDayFactor: {
    hour: number;
    expectedEnergy: EnergyLevel;
    deviation: number; // How much they deviate from expected
  };

  /** Confidence in assessment */
  confidence: number;
}

export interface MentalEnergyState {
  /** Cognitive capacity right now */
  capacity: MentalCapacity;

  /** Decision fatigue indicators */
  decisionFatigue: {
    detected: boolean;
    severity: number; // 0-1
    indicators: string[];
  };

  /** Emotional reserve (capacity for heavy topics) */
  emotionalReserve: {
    level: number; // 0-1
    canHandleHeavy: boolean;
    recentDrains: string[];
  };

  /** Focus indicators */
  focus: {
    level: number; // 0-1
    distractionSignals: string[];
    engagementSignals: string[];
  };

  /** Confidence in assessment */
  confidence: number;
}

export interface EnergyAssessment {
  /** Physical energy state */
  physical: PhysicalEnergyState;

  /** Mental energy state */
  mental: MentalEnergyState;

  /** Overall state summary */
  overall: {
    readyForDeep: boolean;
    optimalResponseLength: 'brief' | 'normal' | 'detailed';
    topicsToAvoid: string[];
    suggestedApproach: string;
  };

  /** Timestamp */
  assessedAt: Date;
}

export interface EnergyPattern {
  userId: string;

  /** Historical energy by time of day */
  timePatterns: Record<number, { avgEnergy: number; samples: number }>;

  /** Day of week patterns */
  dayPatterns: Record<number, { avgEnergy: number; samples: number }>;

  /** Recovery patterns (how quickly they bounce back) */
  recoveryRate: number;

  /** Typical baseline energy */
  baselineEnergy: number;

  /** Topics that drain energy */
  drainingTopics: string[];

  /** Topics that energize */
  energizingTopics: string[];

  /** Total observations */
  observations: number;
}

// ============================================================================
// STORAGE
// ============================================================================

const userPatterns = new Map<string, EnergyPattern>();

/**
 * Get or create energy pattern for user
 */
export function getEnergyPattern(userId: string): EnergyPattern {
  let pattern = userPatterns.get(userId);

  if (!pattern) {
    pattern = {
      userId,
      timePatterns: {},
      dayPatterns: {},
      recoveryRate: 0.5,
      baselineEnergy: 0.5,
      drainingTopics: [],
      energizingTopics: [],
      observations: 0,
    };
    userPatterns.set(userId, pattern);
  }

  return pattern;
}

// ============================================================================
// ENERGY DETECTION
// ============================================================================

/**
 * Voice indicators of low energy
 */
const LOW_ENERGY_VOICE_INDICATORS = [
  { signal: 'slower_pace', description: 'Speech pace slower than usual' },
  { signal: 'lower_pitch', description: 'Voice pitch lower than baseline' },
  { signal: 'monotone', description: 'Reduced pitch variation' },
  { signal: 'sighing', description: 'Audible sighs detected' },
  { signal: 'trailing_off', description: 'Sentences trailing off' },
  { signal: 'low_volume', description: 'Quieter than usual' },
];

/**
 * Voice indicators of high energy
 */
const HIGH_ENERGY_VOICE_INDICATORS = [
  { signal: 'faster_pace', description: 'Speech pace faster than usual' },
  { signal: 'higher_pitch', description: 'Voice pitch elevated' },
  { signal: 'varied_pitch', description: 'Dynamic pitch variation' },
  { signal: 'clear_articulation', description: 'Crisp pronunciation' },
  { signal: 'strong_volume', description: 'Confident volume' },
];

/**
 * Language indicators of energy state
 */
const ENERGY_LANGUAGE_PATTERNS = {
  low: [
    /i('m| am)\s+(so\s+)?(tired|exhausted|drained|wiped)/i,
    /didn't\s+(sleep|rest)\s+(well|enough|much)/i,
    /i\s+(just\s+)?can't\s+(think|focus|concentrate)/i,
    /my\s+brain\s+is\s+(fried|mush|foggy)/i,
    /i('m| am)\s+(barely|hardly)\s+functioning/i,
    /need\s+(more\s+)?(coffee|sleep|rest)/i,
    /long\s+(day|week|night)/i,
  ],
  high: [
    /i('m| am)\s+(feeling|doing)\s+(great|good|energized|amazing)/i,
    /slept\s+(well|great|amazing)/i,
    /i('m| am)\s+(ready|pumped|excited)/i,
    /full\s+of\s+energy/i,
    /let's\s+(do\s+this|go|get\s+started)/i,
  ],
  decisionFatigue: [
    /i\s+(just\s+)?can't\s+decide/i,
    /too\s+many\s+(choices|options|decisions)/i,
    /whatever\s+(you|is)\s+(think|fine)/i,
    /i\s+don't\s+(care|know)\s+anymore/i,
    /decision\s+paralysis/i,
    /just\s+(pick|choose)\s+(for\s+me|one|something)/i,
  ],
  overwhelm: [
    /too\s+much\s+(going\s+on|to\s+(do|handle|think\s+about))/i,
    /i\s+can't\s+(deal|cope|handle)/i,
    /overwhelm(ed|ing)/i,
    /drowning\s+in/i,
    /everything\s+at\s+once/i,
  ],
};

/**
 * Expected energy by time of day
 */
function getExpectedEnergy(hour: number): EnergyLevel {
  if (hour >= 6 && hour < 10) return 'moderate'; // Morning ramp up
  if (hour >= 10 && hour < 12) return 'high'; // Morning peak
  if (hour >= 12 && hour < 14) return 'moderate'; // Post-lunch dip
  if (hour >= 14 && hour < 17) return 'moderate'; // Afternoon
  if (hour >= 17 && hour < 20) return 'moderate'; // Early evening
  if (hour >= 20 && hour < 23) return 'low'; // Evening wind down
  return 'depleted'; // Late night/early morning
}

/**
 * Convert energy level to numeric value
 */
function energyToNumber(level: EnergyLevel): number {
  const map: Record<EnergyLevel, number> = {
    depleted: 0.1,
    low: 0.3,
    moderate: 0.5,
    high: 0.7,
    elevated: 0.9,
  };
  return map[level];
}

/**
 * Convert numeric value to energy level
 */
function numberToEnergy(value: number): EnergyLevel {
  if (value < 0.2) return 'depleted';
  if (value < 0.4) return 'low';
  if (value < 0.6) return 'moderate';
  if (value < 0.8) return 'high';
  return 'elevated';
}

/**
 * Assess energy state from multiple signals
 */
export function assessEnergyState(
  userId: string,
  text: string,
  voiceData: VoiceEmotionResult | null,
  currentTopics: string[],
  sessionTurnCount: number
): EnergyAssessment {
  const pattern = getEnergyPattern(userId);
  const hour = new Date().getHours();
  const dayOfWeek = new Date().getDay();

  // ========== PHYSICAL ENERGY ==========

  const physicalIndicators: PhysicalEnergyState['indicators'] = [];
  let physicalScore = 0.5; // Start at moderate

  // Check voice indicators
  if (voiceData) {
    // Lower arousal = lower energy
    if (voiceData.arousal < 0.3) {
      physicalIndicators.push({
        type: 'voice',
        signal: 'low_arousal',
        weight: 0.2,
      });
      physicalScore -= 0.15;
    } else if (voiceData.arousal > 0.7) {
      physicalIndicators.push({
        type: 'voice',
        signal: 'high_arousal',
        weight: 0.2,
      });
      physicalScore += 0.15;
    }

    // Stress can indicate low energy reserves
    if (voiceData.stressLevel > 0.6) {
      physicalIndicators.push({
        type: 'voice',
        signal: 'stress_detected',
        weight: 0.15,
      });
      physicalScore -= 0.1;
    }
  }

  // Check language patterns
  for (const lowPattern of ENERGY_LANGUAGE_PATTERNS.low) {
    if (lowPattern.test(text)) {
      physicalIndicators.push({
        type: 'language',
        signal: 'low_energy_language',
        weight: 0.25,
      });
      physicalScore -= 0.2;
      break;
    }
  }

  for (const highPattern of ENERGY_LANGUAGE_PATTERNS.high) {
    if (highPattern.test(text)) {
      physicalIndicators.push({
        type: 'language',
        signal: 'high_energy_language',
        weight: 0.25,
      });
      physicalScore += 0.2;
      break;
    }
  }

  // Check response length/engagement
  const wordsPerTurn = text.split(/\s+/).length;
  if (wordsPerTurn < 10) {
    physicalIndicators.push({
      type: 'engagement',
      signal: 'brief_responses',
      weight: 0.1,
    });
    physicalScore -= 0.05;
  } else if (wordsPerTurn > 50) {
    physicalIndicators.push({
      type: 'engagement',
      signal: 'engaged_responses',
      weight: 0.1,
    });
    physicalScore += 0.05;
  }

  // Time of day adjustment
  const expectedEnergy = getExpectedEnergy(hour);
  const expectedScore = energyToNumber(expectedEnergy);
  const deviation = physicalScore - expectedScore;

  // Estimate sleep quality
  let sleepQuality: SleepQuality = 'unknown';
  if (hour < 12) {
    // Morning assessment of sleep
    if (physicalScore < 0.3) sleepQuality = 'poor';
    else if (physicalScore < 0.5) sleepQuality = 'fair';
    else sleepQuality = 'good';
  }

  const physical: PhysicalEnergyState = {
    level: numberToEnergy(Math.max(0.1, Math.min(0.9, physicalScore))),
    sleepQuality,
    indicators: physicalIndicators,
    timeOfDayFactor: {
      hour,
      expectedEnergy,
      deviation,
    },
    confidence: Math.min(0.9, 0.4 + physicalIndicators.length * 0.1),
  };

  // ========== MENTAL ENERGY ==========

  let mentalScore = 0.5;
  const decisionFatigueIndicators: string[] = [];
  const overwhelmIndicators: string[] = [];
  const distractionSignals: string[] = [];
  const engagementSignals: string[] = [];

  // Check decision fatigue
  for (const pattern of ENERGY_LANGUAGE_PATTERNS.decisionFatigue) {
    if (pattern.test(text)) {
      decisionFatigueIndicators.push('Language indicating decision fatigue');
      mentalScore -= 0.15;
      break;
    }
  }

  // Check overwhelm
  for (const pattern of ENERGY_LANGUAGE_PATTERNS.overwhelm) {
    if (pattern.test(text)) {
      overwhelmIndicators.push('Language indicating overwhelm');
      mentalScore -= 0.2;
      break;
    }
  }

  // Check topic jumping (distraction signal)
  if (sessionTurnCount > 3 && currentTopics.length > 2) {
    distractionSignals.push('Multiple topic shifts');
    mentalScore -= 0.05;
  }

  // Check depth of engagement
  const hasQuestions = /\?/.test(text);
  const hasReflection = /i\s+(think|feel|believe|wonder|realize)/i.test(text);
  if (hasQuestions) {
    engagementSignals.push('Asking questions');
    mentalScore += 0.05;
  }
  if (hasReflection) {
    engagementSignals.push('Reflective language');
    mentalScore += 0.05;
  }

  // Determine capacity
  let capacity: MentalCapacity = 'normal';
  if (mentalScore < 0.25) capacity = 'overwhelmed';
  else if (mentalScore < 0.4) capacity = 'limited';
  else if (mentalScore > 0.7) capacity = 'sharp';
  else if (mentalScore > 0.85 && engagementSignals.length >= 2) capacity = 'flow';

  // Emotional reserve
  const emotionalReserve = calculateEmotionalReserve(
    physicalScore,
    mentalScore,
    currentTopics,
    pattern
  );

  const mental: MentalEnergyState = {
    capacity,
    decisionFatigue: {
      detected: decisionFatigueIndicators.length > 0,
      severity: decisionFatigueIndicators.length * 0.3,
      indicators: decisionFatigueIndicators,
    },
    emotionalReserve,
    focus: {
      level: Math.max(0.2, mentalScore + (engagementSignals.length - distractionSignals.length) * 0.1),
      distractionSignals,
      engagementSignals,
    },
    confidence: 0.5,
  };

  // ========== OVERALL ASSESSMENT ==========

  const overallScore = physicalScore * 0.4 + mentalScore * 0.6;

  const overall = {
    readyForDeep: overallScore > 0.5 && emotionalReserve.canHandleHeavy,
    optimalResponseLength:
      overallScore < 0.35 ? ('brief' as const) : overallScore > 0.65 ? ('detailed' as const) : ('normal' as const),
    topicsToAvoid: emotionalReserve.recentDrains.slice(0, 3),
    suggestedApproach: generateApproach(physical.level, mental.capacity, emotionalReserve.canHandleHeavy),
  };

  // Record observation
  recordEnergyObservation(userId, overallScore, hour, dayOfWeek, currentTopics);

  return {
    physical,
    mental,
    overall,
    assessedAt: new Date(),
  };
}

/**
 * Calculate emotional reserve
 */
function calculateEmotionalReserve(
  physicalScore: number,
  mentalScore: number,
  currentTopics: string[],
  pattern: EnergyPattern
): MentalEnergyState['emotionalReserve'] {
  let reserve = (physicalScore + mentalScore) / 2;

  // Check if current topics are draining
  const drainingTopicsPresent = currentTopics.filter((t) =>
    pattern.drainingTopics.some((d) => t.toLowerCase().includes(d.toLowerCase()))
  );

  reserve -= drainingTopicsPresent.length * 0.1;

  // Check if current topics are energizing
  const energizingTopicsPresent = currentTopics.filter((t) =>
    pattern.energizingTopics.some((e) => t.toLowerCase().includes(e.toLowerCase()))
  );

  reserve += energizingTopicsPresent.length * 0.1;

  return {
    level: Math.max(0, Math.min(1, reserve)),
    canHandleHeavy: reserve > 0.4,
    recentDrains: drainingTopicsPresent,
  };
}

/**
 * Generate approach suggestion
 */
function generateApproach(
  physicalLevel: EnergyLevel,
  mentalCapacity: MentalCapacity,
  canHandleHeavy: boolean
): string {
  if (physicalLevel === 'depleted' || mentalCapacity === 'overwhelmed') {
    return "They're running on empty. Keep it light, brief, and supportive. Save deep topics for another time.";
  }

  if (physicalLevel === 'low' || mentalCapacity === 'limited') {
    return 'Energy is low. Match their pace, keep responses concise, and avoid complex or heavy topics.';
  }

  if (!canHandleHeavy) {
    return 'Good energy but emotional reserves are low. Stay positive and supportive.';
  }

  if (physicalLevel === 'high' && mentalCapacity === 'sharp') {
    return 'High energy and mental clarity. Great time for deeper exploration or challenging conversations.';
  }

  return 'Normal energy levels. Follow their lead on conversation depth.';
}

/**
 * Record energy observation for pattern learning
 */
function recordEnergyObservation(
  userId: string,
  energyScore: number,
  hour: number,
  dayOfWeek: number,
  topics: string[]
): void {
  const pattern = getEnergyPattern(userId);
  const alpha = 0.2;

  // Update time pattern
  if (!pattern.timePatterns[hour]) {
    pattern.timePatterns[hour] = { avgEnergy: energyScore, samples: 1 };
  } else {
    const tp = pattern.timePatterns[hour];
    tp.avgEnergy = alpha * energyScore + (1 - alpha) * tp.avgEnergy;
    tp.samples++;
  }

  // Update day pattern
  if (!pattern.dayPatterns[dayOfWeek]) {
    pattern.dayPatterns[dayOfWeek] = { avgEnergy: energyScore, samples: 1 };
  } else {
    const dp = pattern.dayPatterns[dayOfWeek];
    dp.avgEnergy = alpha * energyScore + (1 - alpha) * dp.avgEnergy;
    dp.samples++;
  }

  // Update baseline
  pattern.baselineEnergy = alpha * energyScore + (1 - alpha) * pattern.baselineEnergy;

  pattern.observations++;

  log.debug({ userId, hour, energyScore: energyScore.toFixed(2) }, '⚡ Energy observation recorded');
}

/**
 * Mark a topic as draining or energizing
 */
export function markTopicEnergy(
  userId: string,
  topic: string,
  effect: 'draining' | 'energizing'
): void {
  const pattern = getEnergyPattern(userId);

  if (effect === 'draining') {
    if (!pattern.drainingTopics.includes(topic)) {
      pattern.drainingTopics.push(topic);
      if (pattern.drainingTopics.length > 10) pattern.drainingTopics.shift();
    }
  } else {
    if (!pattern.energizingTopics.includes(topic)) {
      pattern.energizingTopics.push(topic);
      if (pattern.energizingTopics.length > 10) pattern.energizingTopics.shift();
    }
  }
}

// ============================================================================
// PROMPT FORMATTING
// ============================================================================

/**
 * Format energy assessment for prompt injection
 */
export function formatEnergyForPrompt(assessment: EnergyAssessment): string {
  const lines = ['[ENERGY AWARENESS]'];

  // Physical state
  if (assessment.physical.level === 'depleted' || assessment.physical.level === 'low') {
    lines.push(`Physical energy: ${assessment.physical.level}. They're tired.`);
    if (assessment.physical.sleepQuality !== 'unknown') {
      lines.push(`Possible sleep quality: ${assessment.physical.sleepQuality}`);
    }
  }

  // Mental state
  if (assessment.mental.capacity === 'overwhelmed' || assessment.mental.capacity === 'limited') {
    lines.push(`Mental capacity: ${assessment.mental.capacity}. Keep it simple.`);
  }

  if (assessment.mental.decisionFatigue.detected) {
    lines.push("Decision fatigue detected. Don't ask them to choose.");
  }

  // Response guidance
  lines.push(`Optimal response: ${assessment.overall.optimalResponseLength}`);
  lines.push(assessment.overall.suggestedApproach);

  if (assessment.overall.topicsToAvoid.length > 0) {
    lines.push(`Topics to avoid: ${assessment.overall.topicsToAvoid.join(', ')}`);
  }

  return lines.join('\n');
}

// ============================================================================
// RESET (for testing)
// ============================================================================

/**
 * Reset all energy state inference state (for testing)
 */
export function resetEnergyStateInference(): void {
  userPatterns.clear();
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  getEnergyPattern,
  assessEnergyState,
  markTopicEnergy,
  formatEnergyForPrompt,
  resetEnergyStateInference,
};

