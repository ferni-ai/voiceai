/**
 * Voice Prosody Learning
 *
 * Learns user's unique voice patterns over time for better
 * emotion detection and personalized understanding.
 *
 * Philosophy: Everyone expresses emotion differently.
 * "Quiet" for one person might be "screaming" for another.
 * Learning individual baselines enables true understanding.
 *
 * Features:
 * - Personal baseline establishment
 * - Deviation detection from personal norm
 * - Confidence boosting through familiarity
 * - Voice evolution tracking
 * - Micro-expression detection
 *
 * @module VoiceProsodyLearning
 */

import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'VoiceProsodyLearning' });

// ============================================================================
// TYPES
// ============================================================================

export interface VoiceCharacteristics {
  // Pitch
  pitchMean: number; // Hz
  pitchRange: number; // Hz variance
  pitchVariability: number; // 0-1

  // Energy
  energyMean: number; // dB
  energyRange: number;
  energyVariability: number;

  // Tempo
  speakingRate: number; // words per minute
  pauseFrequency: number; // pauses per minute
  pauseDuration: number; // avg ms

  // Quality
  breathiness: number; // 0-1
  tension: number; // 0-1
  clarity: number; // 0-1
}

export interface PersonalBaseline {
  userId: string;
  characteristics: VoiceCharacteristics;
  sampleCount: number;
  confidence: number; // 0-1
  establishedAt: Date;
  lastUpdated: Date;

  // Emotional baselines (how THEY sound when feeling X)
  emotionalProfiles: EmotionalVoiceProfile[];
}

export interface EmotionalVoiceProfile {
  emotion: string;
  characteristics: Partial<VoiceCharacteristics>;
  sampleCount: number;
  confidence: number;
}

export interface VoiceSample {
  timestamp: Date;
  characteristics: VoiceCharacteristics;
  detectedEmotion?: string;
  userConfirmedEmotion?: string;
  context?: string;
}

export interface DeviationAnalysis {
  deviates: boolean;
  magnitude: number; // 0-1 (how much)
  direction: 'elevated' | 'subdued' | 'normal';
  significantFactors: SignificantFactor[];
  possibleMeaning: string;
  confidence: number;
}

export interface SignificantFactor {
  factor: keyof VoiceCharacteristics;
  baseline: number;
  current: number;
  deviation: number; // standard deviations
  interpretation: string;
}

export interface VoiceEvolution {
  period: 'week' | 'month' | 'quarter';
  changes: VoiceChange[];
  interpretation: string;
}

export interface VoiceChange {
  factor: string;
  direction: 'increased' | 'decreased' | 'stable';
  magnitude: number;
  significance: 'notable' | 'subtle' | 'none';
}

// ============================================================================
// THRESHOLDS
// ============================================================================

const BASELINE_CONFIDENCE_THRESHOLD = 0.7;
const MIN_SAMPLES_FOR_BASELINE = 10;
const DEVIATION_THRESHOLD = 1.5; // standard deviations
const EMOTIONAL_PROFILE_MIN_SAMPLES = 3;

// ============================================================================
// IN-MEMORY STORAGE
// ============================================================================

const userBaselines = new Map<string, PersonalBaseline>();
const voiceSamples = new Map<string, VoiceSample[]>();

// ============================================================================
// BASELINE MANAGEMENT
// ============================================================================

/**
 * Record a voice sample and update baseline
 */
export function recordVoiceSample(
  userId: string,
  characteristics: VoiceCharacteristics,
  context?: {
    detectedEmotion?: string;
    userConfirmedEmotion?: string;
    conversationContext?: string;
  }
): void {
  // Store sample
  const samples = voiceSamples.get(userId) || [];
  samples.push({
    timestamp: new Date(),
    characteristics,
    detectedEmotion: context?.detectedEmotion,
    userConfirmedEmotion: context?.userConfirmedEmotion,
    context: context?.conversationContext,
  });

  // Keep last 500 samples
  if (samples.length > 500) {
    samples.shift();
  }
  voiceSamples.set(userId, samples);

  // Update baseline
  updateBaseline(userId, samples);

  // Update emotional profiles if we have emotion data
  if (context?.detectedEmotion || context?.userConfirmedEmotion) {
    updateEmotionalProfile(
      userId,
      context.userConfirmedEmotion || context.detectedEmotion!,
      characteristics
    );
  }

  log.debug({ userId, sampleCount: samples.length }, '🎤 Voice sample recorded');
}

/**
 * Update baseline from samples
 */
function updateBaseline(userId: string, samples: VoiceSample[]): void {
  if (samples.length < MIN_SAMPLES_FOR_BASELINE) return;

  // Use only "neutral" samples for baseline (no strong emotion)
  const neutralSamples = samples.filter(
    (s) => !s.detectedEmotion || s.detectedEmotion === 'neutral'
  );

  if (neutralSamples.length < MIN_SAMPLES_FOR_BASELINE / 2) {
    // Not enough neutral samples, use all
    calculateBaseline(userId, samples);
  } else {
    calculateBaseline(userId, neutralSamples);
  }
}

/**
 * Calculate baseline from samples
 */
function calculateBaseline(userId: string, samples: VoiceSample[]): void {
  const chars = samples.map((s) => s.characteristics);

  const baseline: VoiceCharacteristics = {
    pitchMean: average(chars.map((c) => c.pitchMean)),
    pitchRange: average(chars.map((c) => c.pitchRange)),
    pitchVariability: average(chars.map((c) => c.pitchVariability)),
    energyMean: average(chars.map((c) => c.energyMean)),
    energyRange: average(chars.map((c) => c.energyRange)),
    energyVariability: average(chars.map((c) => c.energyVariability)),
    speakingRate: average(chars.map((c) => c.speakingRate)),
    pauseFrequency: average(chars.map((c) => c.pauseFrequency)),
    pauseDuration: average(chars.map((c) => c.pauseDuration)),
    breathiness: average(chars.map((c) => c.breathiness)),
    tension: average(chars.map((c) => c.tension)),
    clarity: average(chars.map((c) => c.clarity)),
  };

  // Calculate confidence based on sample count and variance
  const confidence =
    Math.min(1, samples.length / 50) * 0.7 + (1 - calculateVarianceScore(chars)) * 0.3;

  const existing = userBaselines.get(userId);

  userBaselines.set(userId, {
    userId,
    characteristics: baseline,
    sampleCount: samples.length,
    confidence,
    establishedAt: existing?.establishedAt || new Date(),
    lastUpdated: new Date(),
    emotionalProfiles: existing?.emotionalProfiles || [],
  });
}

/**
 * Update emotional voice profile
 */
function updateEmotionalProfile(
  userId: string,
  emotion: string,
  characteristics: VoiceCharacteristics
): void {
  const baseline = userBaselines.get(userId);
  if (!baseline) return;

  let profile = baseline.emotionalProfiles.find((p) => p.emotion === emotion);

  if (!profile) {
    profile = {
      emotion,
      characteristics: {},
      sampleCount: 0,
      confidence: 0,
    };
    baseline.emotionalProfiles.push(profile);
  }

  // Update with exponential moving average
  const alpha = 0.3; // Learning rate
  profile.sampleCount++;

  const keys: Array<keyof VoiceCharacteristics> = [
    'pitchMean',
    'pitchRange',
    'pitchVariability',
    'energyMean',
    'energyRange',
    'energyVariability',
    'speakingRate',
    'pauseFrequency',
    'pauseDuration',
    'breathiness',
    'tension',
    'clarity',
  ];

  for (const key of keys) {
    const current = profile.characteristics[key] as number | undefined;
    const newValue = characteristics[key];

    if (current === undefined) {
      profile.characteristics[key] = newValue;
    } else {
      (profile.characteristics as Record<string, number>)[key] =
        current * (1 - alpha) + newValue * alpha;
    }
  }

  profile.confidence = Math.min(1, profile.sampleCount / EMOTIONAL_PROFILE_MIN_SAMPLES);
}

// ============================================================================
// DEVIATION ANALYSIS
// ============================================================================

/**
 * Analyze deviation from personal baseline
 */
export function analyzeDeviation(
  userId: string,
  currentCharacteristics: VoiceCharacteristics
): DeviationAnalysis {
  const baseline = userBaselines.get(userId);

  if (!baseline || baseline.confidence < BASELINE_CONFIDENCE_THRESHOLD) {
    return {
      deviates: false,
      magnitude: 0,
      direction: 'normal',
      significantFactors: [],
      possibleMeaning: 'Not enough baseline data yet',
      confidence: baseline?.confidence || 0,
    };
  }

  const samples = voiceSamples.get(userId) || [];
  const significantFactors: SignificantFactor[] = [];

  const keys: Array<keyof VoiceCharacteristics> = [
    'pitchMean',
    'pitchRange',
    'pitchVariability',
    'energyMean',
    'energyRange',
    'energyVariability',
    'speakingRate',
    'pauseFrequency',
    'pauseDuration',
    'breathiness',
    'tension',
    'clarity',
  ];

  for (const key of keys) {
    const baselineValue = baseline.characteristics[key];
    const currentValue = currentCharacteristics[key];
    const stdDev = calculateStdDev(samples.map((s) => s.characteristics[key]));

    if (stdDev > 0) {
      const deviationMagnitude = Math.abs(currentValue - baselineValue) / stdDev;

      if (deviationMagnitude > DEVIATION_THRESHOLD) {
        significantFactors.push({
          factor: key,
          baseline: baselineValue,
          current: currentValue,
          deviation: deviationMagnitude,
          interpretation: interpretFactor(key, currentValue > baselineValue),
        });
      }
    }
  }

  // Calculate overall magnitude
  const magnitude =
    significantFactors.length > 0
      ? Math.min(1, average(significantFactors.map((f) => f.deviation)) / 3)
      : 0;

  // Determine direction
  const direction = determineDirection(
    significantFactors,
    baseline.characteristics,
    currentCharacteristics
  );

  // Generate interpretation
  const possibleMeaning = generateInterpretation(
    significantFactors,
    direction,
    baseline.emotionalProfiles
  );

  return {
    deviates: significantFactors.length > 0,
    magnitude,
    direction,
    significantFactors,
    possibleMeaning,
    confidence: baseline.confidence,
  };
}

/**
 * Interpret what a factor deviation means
 */
function interpretFactor(factor: keyof VoiceCharacteristics, increased: boolean): string {
  const interpretations: Record<string, { up: string; down: string }> = {
    pitchMean: {
      up: 'Voice is higher than usual - possible excitement or stress',
      down: 'Voice is lower than usual - possible sadness or fatigue',
    },
    pitchRange: {
      up: 'More pitch variation - more animated or emotional',
      down: 'Flatter intonation - possible low energy or disengagement',
    },
    energyMean: {
      up: 'Speaking louder - more energized or emphatic',
      down: 'Speaking softer - more withdrawn or tired',
    },
    speakingRate: {
      up: 'Speaking faster - possible anxiety or excitement',
      down: 'Speaking slower - possible thoughtfulness or heaviness',
    },
    pauseFrequency: {
      up: 'More pauses - processing something or hesitant',
      down: 'Fewer pauses - more certain or urgent',
    },
    tension: {
      up: 'Voice sounds tenser - possible stress or anxiety',
      down: 'Voice sounds more relaxed',
    },
    breathiness: {
      up: 'More breathiness - possible vulnerability or exhaustion',
      down: 'Less breathiness - more grounded',
    },
  };

  const interp = interpretations[factor];
  if (!interp) return `${factor} is ${increased ? 'higher' : 'lower'} than usual`;

  return increased ? interp.up : interp.down;
}

/**
 * Determine overall direction of deviation
 */
function determineDirection(
  factors: SignificantFactor[],
  baseline: VoiceCharacteristics,
  current: VoiceCharacteristics
): 'elevated' | 'subdued' | 'normal' {
  if (factors.length === 0) return 'normal';

  // Check energy-related factors
  const energyUp = current.energyMean > baseline.energyMean;
  const pitchUp = current.pitchMean > baseline.pitchMean;
  const rateUp = current.speakingRate > baseline.speakingRate;

  const elevatedSignals = [energyUp, pitchUp, rateUp].filter(Boolean).length;

  if (elevatedSignals >= 2) return 'elevated';
  if (elevatedSignals <= 1 && factors.length >= 2) return 'subdued';

  return 'normal';
}

/**
 * Generate interpretation from deviations
 */
function generateInterpretation(
  factors: SignificantFactor[],
  direction: 'elevated' | 'subdued' | 'normal',
  emotionalProfiles: EmotionalVoiceProfile[]
): string {
  if (factors.length === 0) {
    return 'Voice sounds like your usual self';
  }

  // Check against known emotional profiles
  for (const profile of emotionalProfiles) {
    if (profile.confidence < 0.5) continue;

    // Simple matching - could be more sophisticated
    if (direction === 'elevated' && ['excited', 'anxious', 'happy'].includes(profile.emotion)) {
      return `Voice pattern matches when you've felt ${profile.emotion}`;
    }
    if (direction === 'subdued' && ['sad', 'tired', 'down'].includes(profile.emotion)) {
      return `Voice pattern matches when you've felt ${profile.emotion}`;
    }
  }

  // Generic interpretation
  if (direction === 'elevated') {
    return 'Voice sounds more activated than usual - could be excitement, stress, or heightened emotion';
  }
  if (direction === 'subdued') {
    return 'Voice sounds more subdued than usual - could be tiredness, sadness, or deep thought';
  }

  return factors.map((f) => f.interpretation).join('. ');
}

// ============================================================================
// VOICE EVOLUTION
// ============================================================================

/**
 * Track voice evolution over time
 */
export function getVoiceEvolution(
  userId: string,
  period: 'week' | 'month' | 'quarter'
): VoiceEvolution | null {
  const samples = voiceSamples.get(userId);
  if (!samples || samples.length < 20) return null;

  const periodDays = { week: 7, month: 30, quarter: 90 };
  const cutoff = new Date(Date.now() - periodDays[period] * 24 * 60 * 60 * 1000);

  const periodSamples = samples.filter((s) => s.timestamp >= cutoff);
  if (periodSamples.length < 10) return null;

  const midpoint = Math.floor(periodSamples.length / 2);
  const firstHalf = periodSamples.slice(0, midpoint);
  const secondHalf = periodSamples.slice(midpoint);

  const changes: VoiceChange[] = [];

  const keys: Array<keyof VoiceCharacteristics> = [
    'pitchMean',
    'energyMean',
    'speakingRate',
    'tension',
    'clarity',
  ];

  for (const key of keys) {
    const firstAvg = average(firstHalf.map((s) => s.characteristics[key]));
    const secondAvg = average(secondHalf.map((s) => s.characteristics[key]));
    const change = secondAvg - firstAvg;
    const percentChange = Math.abs(change / firstAvg);

    let significance: 'notable' | 'subtle' | 'none' = 'none';
    if (percentChange > 0.15) significance = 'notable';
    else if (percentChange > 0.05) significance = 'subtle';

    changes.push({
      factor: key,
      direction: change > 0 ? 'increased' : change < 0 ? 'decreased' : 'stable',
      magnitude: percentChange,
      significance,
    });
  }

  const notableChanges = changes.filter((c) => c.significance === 'notable');

  let interpretation = 'Voice patterns have remained relatively stable';

  if (notableChanges.length > 0) {
    const descriptions = notableChanges.map((c) => {
      if (c.factor === 'tension' && c.direction === 'decreased') {
        return 'voice has become more relaxed';
      }
      if (c.factor === 'clarity' && c.direction === 'increased') {
        return 'speaking with more clarity';
      }
      if (c.factor === 'energyMean' && c.direction === 'increased') {
        return 'more energy in voice';
      }
      return `${c.factor} has ${c.direction}`;
    });

    interpretation = `Over this ${period}, ${descriptions.join(', ')}`;
  }

  return {
    period,
    changes,
    interpretation,
  };
}

// ============================================================================
// CONFIDENCE & FAMILIARITY
// ============================================================================

/**
 * Get familiarity score - how well we know this voice
 */
export function getFamiliarityScore(userId: string): {
  score: number;
  level: 'stranger' | 'acquaintance' | 'familiar' | 'well_known';
  description: string;
} {
  const baseline = userBaselines.get(userId);
  const samples = voiceSamples.get(userId);

  if (!baseline || !samples) {
    return {
      score: 0,
      level: 'stranger',
      description: "I'm still learning your voice",
    };
  }

  const score = baseline.confidence;
  const emotionalProfileCount = baseline.emotionalProfiles.filter((p) => p.confidence > 0.5).length;

  let level: 'stranger' | 'acquaintance' | 'familiar' | 'well_known' = 'stranger';
  let description = "I'm still learning your voice";

  if (score > 0.8 && emotionalProfileCount >= 3) {
    level = 'well_known';
    description = 'I know your voice well - I can tell when something feels off';
  } else if (score > 0.6 && emotionalProfileCount >= 2) {
    level = 'familiar';
    description = "I'm getting to know your voice patterns";
  } else if (score > 0.3) {
    level = 'acquaintance';
    description = "I'm learning what's normal for you";
  }

  return { score, level, description };
}

/**
 * Get boost for emotion detection based on familiarity
 */
export function getEmotionDetectionBoost(userId: string): number {
  const familiarity = getFamiliarityScore(userId);

  // Better familiarity = higher confidence in emotion detection
  const boosts = {
    stranger: 0,
    acquaintance: 0.1,
    familiar: 0.2,
    well_known: 0.3,
  };

  return boosts[familiarity.level];
}

// ============================================================================
// HELPERS
// ============================================================================

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function calculateStdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const avg = average(values);
  const squareDiffs = values.map((v) => Math.pow(v - avg, 2));
  return Math.sqrt(average(squareDiffs));
}

function calculateVarianceScore(chars: VoiceCharacteristics[]): number {
  // Lower variance = more consistent baseline = higher score
  const keys: Array<keyof VoiceCharacteristics> = ['pitchMean', 'energyMean', 'speakingRate'];
  const variances = keys.map((k) => {
    const values = chars.map((c) => c[k]);
    const avg = average(values);
    if (avg === 0) return 0;
    return calculateStdDev(values) / avg; // Coefficient of variation
  });

  return Math.min(1, average(variances));
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Get baseline for user
 */
export function getBaseline(userId: string): PersonalBaseline | null {
  return userBaselines.get(userId) || null;
}

/**
 * Check if user mentions something about their voice
 */
export function detectVoiceMention(text: string): {
  mentioned: boolean;
  type?: 'tired' | 'sick' | 'excited' | 'stressed' | 'other';
} {
  const patterns = {
    tired: /\b(tired|exhausted|didn't sleep|sleepy)\b/i,
    sick: /\b(sick|cold|flu|sore throat|hoarse)\b/i,
    excited: /\b(excited|pumped|can't wait|so happy)\b/i,
    stressed: /\b(stressed|anxious|nervous|worried)\b/i,
  };

  for (const [type, pattern] of Object.entries(patterns)) {
    if (pattern.test(text)) {
      return { mentioned: true, type: type as 'tired' | 'sick' | 'excited' | 'stressed' };
    }
  }

  return { mentioned: false };
}

/**
 * Generate context for LLM about voice state
 */
export function generateVoiceContext(userId: string): string | null {
  const familiarity = getFamiliarityScore(userId);

  if (familiarity.level === 'stranger') {
    return null;
  }

  const baseline = userBaselines.get(userId);
  if (!baseline) return null;

  const sections: string[] = [];
  sections.push(`[VOICE FAMILIARITY: ${familiarity.level}]`);
  sections.push(familiarity.description);

  // Add emotional profiles we know
  const knownEmotions = baseline.emotionalProfiles
    .filter((p) => p.confidence > 0.5)
    .map((p) => p.emotion);

  if (knownEmotions.length > 0) {
    sections.push(`Known voice patterns for: ${knownEmotions.join(', ')}`);
  }

  return sections.join('\n');
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  recordVoiceSample,
  analyzeDeviation,
  getVoiceEvolution,
  getFamiliarityScore,
  getEmotionDetectionBoost,
  getBaseline,
  detectVoiceMention,
  generateVoiceContext,
};
