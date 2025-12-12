/**
 * Life Rhythm Prediction System
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Predicts when someone will need support BEFORE they reach out.
 * Learns the rhythms of their life - Sunday scaries, Monday motivation,
 * end-of-month stress, seasonal patterns, anniversaries.
 *
 * This is superhuman because even close friends forget these patterns.
 * Ferni remembers and reaches out at just the right moment.
 *
 * "Hey, I know Mondays are usually tough for you. Just checking in."
 */

import { createLogger } from '../utils/safe-logger.js';

const log = createLogger({ module: 'LifeRhythmPrediction' });

// ============================================================================
// TYPES
// ============================================================================

export interface WeeklyPattern {
  /** Sunday night anxiety pattern */
  sundayScaries: {
    detected: boolean;
    severity: number; // 0-1
    typicalOnsetHour: number;
    topics: string[]; // What they worry about
  };

  /** Monday patterns */
  monday: {
    type: 'dread' | 'motivated' | 'neutral';
    energyLevel: number;
    bestSupportTime: number; // Hour
  };

  /** Mid-week patterns */
  midweek: {
    wednesdaySlump: boolean;
    peakProductivityDay: 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday';
  };

  /** Friday patterns */
  friday: {
    reliefIntensity: number;
    reflectiveEvening: boolean;
  };

  /** Weekend patterns */
  weekend: {
    type: 'restorative' | 'lonely' | 'busy' | 'mixed';
    lonelinessPeak: boolean;
    familyStress: boolean;
  };

  /** Per-day emotional baselines */
  dailyBaselines: Record<number, { avgMood: number; avgEnergy: number; conversationLikelihood: number }>;
}

export interface MonthlyPattern {
  /** Pay day effects */
  payDay: {
    dayOfMonth: number;
    prePayStress: boolean;
    postPayRelief: boolean;
  };

  /** Bill-related stress */
  billStress: {
    stressDays: number[]; // Days of month
    severity: number;
  };

  /** End of month patterns */
  endOfMonth: {
    deadlinePressure: boolean;
    financialAnxiety: boolean;
    reflectionTendency: boolean;
  };

  /** Beginning of month patterns */
  beginningOfMonth: {
    freshStartEnergy: boolean;
    goalSettingTendency: boolean;
  };
}

export interface SeasonalPattern {
  /** Winter patterns */
  winter: {
    seasonalBlues: boolean;
    severity: number;
    peakMonths: number[];
    copingStrategies: string[];
  };

  /** Holiday patterns */
  holidays: {
    stressLevel: number;
    familyDynamics: 'positive' | 'stressful' | 'mixed' | 'lonely';
    peakStressDates: Date[];
    needsExtraSupport: boolean;
  };

  /** Summer patterns */
  summer: {
    moodLift: boolean;
    vacationAnxiety: boolean;
    socialPressure: boolean;
  };

  /** Transition periods */
  transitions: {
    fallAnxiety: boolean; // Back to school/work energy
    springOptimism: boolean;
  };
}

export interface AnniversaryDate {
  /** Date (month/day) */
  date: { month: number; day: number };

  /** Type of anniversary */
  type: 'loss' | 'trauma' | 'relationship_end' | 'achievement' | 'beginning' | 'health' | 'other';

  /** Emotional valence */
  valence: 'positive' | 'negative' | 'mixed';

  /** How they typically feel */
  typicalMood: string;

  /** Brief description (for context) */
  description: string;

  /** Last time we acknowledged it */
  lastAcknowledged?: Date;

  /** How many days before to be aware */
  awarenessWindow: number;
}

export interface LifeRhythmProfile {
  userId: string;
  weekly: WeeklyPattern;
  monthly: MonthlyPattern;
  seasonal: SeasonalPattern;
  anniversaries: AnniversaryDate[];

  /** Observation metadata */
  dataQuality: {
    weeklyConfidence: number;
    monthlyConfidence: number;
    seasonalConfidence: number;
    totalObservations: number;
    lastUpdated: Date;
  };
}

export interface RhythmPrediction {
  /** When this prediction is for */
  targetTime: Date;

  /** What we predict */
  prediction: {
    likelyMood: 'low' | 'neutral' | 'elevated';
    likelyEnergy: 'depleted' | 'normal' | 'high';
    supportNeed: 'proactive' | 'available' | 'minimal';
    conversationLikelihood: number; // 0-1
  };

  /** Why we think this */
  reasons: string[];

  /** Suggested approach */
  approach: {
    shouldReachOut: boolean;
    bestTime: Date | null;
    tone: 'checking_in' | 'celebrating' | 'supporting' | 'neutral';
    suggestedOpener?: string;
  };

  /** Confidence in prediction */
  confidence: number;
}

// ============================================================================
// PATTERN STORAGE
// ============================================================================

const userProfiles = new Map<string, LifeRhythmProfile>();

/**
 * Get or create a life rhythm profile
 */
export function getLifeRhythmProfile(userId: string): LifeRhythmProfile {
  let profile = userProfiles.get(userId);

  if (!profile) {
    profile = createDefaultProfile(userId);
    userProfiles.set(userId, profile);
  }

  return profile;
}

function createDefaultProfile(userId: string): LifeRhythmProfile {
  return {
    userId,
    weekly: {
      sundayScaries: { detected: false, severity: 0, typicalOnsetHour: 18, topics: [] },
      monday: { type: 'neutral', energyLevel: 0.5, bestSupportTime: 9 },
      midweek: { wednesdaySlump: false, peakProductivityDay: 'tuesday' },
      friday: { reliefIntensity: 0.5, reflectiveEvening: false },
      weekend: { type: 'mixed', lonelinessPeak: false, familyStress: false },
      dailyBaselines: {},
    },
    monthly: {
      payDay: { dayOfMonth: 15, prePayStress: false, postPayRelief: false },
      billStress: { stressDays: [], severity: 0 },
      endOfMonth: { deadlinePressure: false, financialAnxiety: false, reflectionTendency: false },
      beginningOfMonth: { freshStartEnergy: false, goalSettingTendency: false },
    },
    seasonal: {
      winter: { seasonalBlues: false, severity: 0, peakMonths: [], copingStrategies: [] },
      holidays: {
        stressLevel: 0.5,
        familyDynamics: 'mixed',
        peakStressDates: [],
        needsExtraSupport: false,
      },
      summer: { moodLift: false, vacationAnxiety: false, socialPressure: false },
      transitions: { fallAnxiety: false, springOptimism: false },
    },
    anniversaries: [],
    dataQuality: {
      weeklyConfidence: 0,
      monthlyConfidence: 0,
      seasonalConfidence: 0,
      totalObservations: 0,
      lastUpdated: new Date(),
    },
  };
}

// ============================================================================
// PREDICTION ENGINE
// ============================================================================

/**
 * Predict user state for a given time
 */
export function predictUserState(userId: string, targetTime: Date = new Date()): RhythmPrediction {
  const profile = getLifeRhythmProfile(userId);
  const reasons: string[] = [];
  let moodScore = 0.5; // Neutral baseline
  let energyScore = 0.5;
  let supportNeed = 0.5;
  let conversationLikelihood = 0.5;

  const dayOfWeek = targetTime.getDay();
  const hour = targetTime.getHours();
  const dayOfMonth = targetTime.getDate();
  const month = targetTime.getMonth();

  // ========== WEEKLY PATTERNS ==========

  // Sunday scaries
  if (dayOfWeek === 0 && hour >= profile.weekly.sundayScaries.typicalOnsetHour) {
    if (profile.weekly.sundayScaries.detected) {
      moodScore -= profile.weekly.sundayScaries.severity * 0.3;
      supportNeed += 0.2;
      reasons.push('Sunday evening anxiety pattern detected');
    }
  }

  // Monday
  if (dayOfWeek === 1) {
    if (profile.weekly.monday.type === 'dread') {
      moodScore -= 0.2;
      energyScore -= 0.1;
      supportNeed += 0.15;
      reasons.push('Mondays are typically difficult');
    } else if (profile.weekly.monday.type === 'motivated') {
      moodScore += 0.1;
      energyScore += 0.15;
      reasons.push('Fresh start energy on Mondays');
    }
  }

  // Wednesday slump
  if (dayOfWeek === 3 && profile.weekly.midweek.wednesdaySlump) {
    energyScore -= 0.15;
    reasons.push('Mid-week energy dip typical');
  }

  // Friday
  if (dayOfWeek === 5 && hour >= 17) {
    moodScore += profile.weekly.friday.reliefIntensity * 0.2;
    reasons.push('End of work week relief');
  }

  // Weekend loneliness
  if ((dayOfWeek === 0 || dayOfWeek === 6) && profile.weekly.weekend.lonelinessPeak) {
    moodScore -= 0.15;
    supportNeed += 0.2;
    reasons.push('Weekend loneliness pattern');
  }

  // ========== MONTHLY PATTERNS ==========

  // Pre-pay day stress
  if (profile.monthly.payDay.prePayStress) {
    const daysUntilPayday =
      (profile.monthly.payDay.dayOfMonth - dayOfMonth + 31) % 31 || 31;
    if (daysUntilPayday <= 3 && daysUntilPayday > 0) {
      moodScore -= 0.1;
      reasons.push('Approaching pay day - financial stress typical');
    }
  }

  // Bill stress days
  if (profile.monthly.billStress.stressDays.includes(dayOfMonth)) {
    moodScore -= profile.monthly.billStress.severity * 0.15;
    reasons.push('Bill-related stress day');
  }

  // End of month
  if (dayOfMonth >= 28) {
    if (profile.monthly.endOfMonth.deadlinePressure) {
      energyScore -= 0.1;
      reasons.push('End of month deadline pressure');
    }
    if (profile.monthly.endOfMonth.financialAnxiety) {
      moodScore -= 0.1;
      reasons.push('End of month financial anxiety');
    }
  }

  // Beginning of month
  if (dayOfMonth <= 3 && profile.monthly.beginningOfMonth.freshStartEnergy) {
    moodScore += 0.1;
    energyScore += 0.1;
    reasons.push('Beginning of month fresh start energy');
  }

  // ========== SEASONAL PATTERNS ==========

  // Winter blues
  if ([11, 0, 1, 2].includes(month) && profile.seasonal.winter.seasonalBlues) {
    if (profile.seasonal.winter.peakMonths.includes(month)) {
      moodScore -= profile.seasonal.winter.severity * 0.2;
      supportNeed += 0.15;
      reasons.push('Peak seasonal affective period');
    }
  }

  // Holiday stress (November-December)
  if ([10, 11].includes(month) && profile.seasonal.holidays.needsExtraSupport) {
    moodScore -= profile.seasonal.holidays.stressLevel * 0.15;
    supportNeed += 0.2;
    reasons.push('Holiday season - extra support needed');
  }

  // ========== ANNIVERSARIES ==========

  for (const anniversary of profile.anniversaries) {
    const targetMonth = targetTime.getMonth();
    const targetDay = targetTime.getDate();

    // Check if within awareness window
    const daysUntil = calculateDaysUntil(
      { month: targetMonth, day: targetDay },
      anniversary.date
    );

    if (daysUntil >= 0 && daysUntil <= anniversary.awarenessWindow) {
      if (anniversary.valence === 'negative') {
        moodScore -= 0.2;
        supportNeed += 0.25;
        reasons.push(`Approaching difficult anniversary: ${anniversary.description}`);
      } else if (anniversary.valence === 'positive') {
        moodScore += 0.1;
        reasons.push(`Approaching meaningful anniversary: ${anniversary.description}`);
      }
    }
  }

  // ========== DAILY BASELINES ==========

  const baseline = profile.weekly.dailyBaselines[dayOfWeek];
  if (baseline) {
    moodScore = moodScore * 0.7 + baseline.avgMood * 0.3;
    energyScore = energyScore * 0.7 + baseline.avgEnergy * 0.3;
    conversationLikelihood = baseline.conversationLikelihood;
  }

  // ========== BUILD PREDICTION ==========

  // Clamp scores
  moodScore = Math.max(0, Math.min(1, moodScore));
  energyScore = Math.max(0, Math.min(1, energyScore));
  supportNeed = Math.max(0, Math.min(1, supportNeed));

  // Determine categories
  const likelyMood: 'low' | 'neutral' | 'elevated' =
    moodScore < 0.35 ? 'low' : moodScore > 0.65 ? 'elevated' : 'neutral';

  const likelyEnergy: 'depleted' | 'normal' | 'high' =
    energyScore < 0.35 ? 'depleted' : energyScore > 0.65 ? 'high' : 'normal';

  const supportNeedLevel: 'proactive' | 'available' | 'minimal' =
    supportNeed > 0.6 ? 'proactive' : supportNeed > 0.35 ? 'available' : 'minimal';

  // Determine if we should reach out
  const shouldReachOut = supportNeed > 0.55 && profile.dataQuality.weeklyConfidence > 0.3;

  // Determine tone
  let tone: 'checking_in' | 'celebrating' | 'supporting' | 'neutral' = 'neutral';
  if (supportNeed > 0.6) tone = 'supporting';
  else if (moodScore > 0.65) tone = 'celebrating';
  else if (supportNeed > 0.4) tone = 'checking_in';

  // Generate opener
  const suggestedOpener = generateOpener(reasons, tone, profile);

  // Calculate confidence based on data quality
  const confidence = Math.min(
    profile.dataQuality.weeklyConfidence,
    profile.dataQuality.monthlyConfidence * 0.8,
    0.9
  );

  return {
    targetTime,
    prediction: {
      likelyMood,
      likelyEnergy,
      supportNeed: supportNeedLevel,
      conversationLikelihood,
    },
    reasons,
    approach: {
      shouldReachOut,
      bestTime: shouldReachOut ? findBestTime(profile, targetTime) : null,
      tone,
      suggestedOpener: shouldReachOut ? suggestedOpener : undefined,
    },
    confidence,
  };
}

/**
 * Calculate days until a date
 */
function calculateDaysUntil(
  from: { month: number; day: number },
  to: { month: number; day: number }
): number {
  const fromDate = new Date(2000, from.month, from.day);
  const toDate = new Date(2000, to.month, to.day);

  // Handle year wrap
  if (toDate < fromDate) {
    toDate.setFullYear(2001);
  }

  return Math.floor((toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * Find the best time to reach out
 */
function findBestTime(profile: LifeRhythmProfile, aroundTime: Date): Date {
  // Default to morning check-in
  const bestTime = new Date(aroundTime);
  bestTime.setHours(profile.weekly.monday.bestSupportTime || 9, 0, 0, 0);
  return bestTime;
}

/**
 * Generate a contextual opener
 */
function generateOpener(reasons: string[], tone: string, profile: LifeRhythmProfile): string {
  // Find the most specific reason
  const anniversaryReason = reasons.find((r) => r.includes('anniversary'));
  const dayReason = reasons.find(
    (r) => r.includes('Monday') || r.includes('Sunday') || r.includes('weekend')
  );
  const seasonalReason = reasons.find(
    (r) => r.includes('seasonal') || r.includes('Holiday') || r.includes('winter')
  );

  if (anniversaryReason) {
    return "Hey, I've been thinking about you. How are you holding up?";
  }

  if (tone === 'supporting') {
    if (dayReason?.includes('Sunday')) {
      return "Sunday evening check-in. How's the soul doing?";
    }
    if (dayReason?.includes('Monday')) {
      return 'Mondays, right? Just wanted you to know I\'m here.';
    }
    if (dayReason?.includes('weekend') && profile.weekly.weekend.lonelinessPeak) {
      return "Weekend wave. What's on your mind?";
    }
    return "Thinking of you. How's it going?";
  }

  if (tone === 'checking_in') {
    return "Hey! Just checking in. How's your week shaping up?";
  }

  if (tone === 'celebrating') {
    return 'Good vibes your way! What\'s making you smile?';
  }

  return "Hey, hope you're doing well!";
}

// ============================================================================
// PATTERN LEARNING
// ============================================================================

/**
 * Record a conversation observation
 */
export function recordConversationObservation(
  userId: string,
  observation: {
    timestamp: Date;
    mood: number; // 0-1
    energy: number; // 0-1
    topics: string[];
    wasStressed: boolean;
    wasPositive: boolean;
    initiated: 'user' | 'ferni';
  }
): void {
  const profile = getLifeRhythmProfile(userId);
  const dayOfWeek = observation.timestamp.getDay();
  const hour = observation.timestamp.getHours();
  const dayOfMonth = observation.timestamp.getDate();

  // Update daily baselines
  if (!profile.weekly.dailyBaselines[dayOfWeek]) {
    profile.weekly.dailyBaselines[dayOfWeek] = {
      avgMood: observation.mood,
      avgEnergy: observation.energy,
      conversationLikelihood: observation.initiated === 'user' ? 0.6 : 0.4,
    };
  } else {
    const baseline = profile.weekly.dailyBaselines[dayOfWeek];
    const alpha = 0.2;
    baseline.avgMood = alpha * observation.mood + (1 - alpha) * baseline.avgMood;
    baseline.avgEnergy = alpha * observation.energy + (1 - alpha) * baseline.avgEnergy;
    baseline.conversationLikelihood =
      alpha * (observation.initiated === 'user' ? 0.7 : 0.3) +
      (1 - alpha) * baseline.conversationLikelihood;
  }

  // Detect Sunday scaries
  if (dayOfWeek === 0 && hour >= 16 && observation.wasStressed) {
    const ss = profile.weekly.sundayScaries;
    ss.detected = true;
    ss.severity = Math.min(1, ss.severity + 0.1);
    ss.typicalOnsetHour = Math.round((ss.typicalOnsetHour + hour) / 2);
    if (observation.topics.length > 0) {
      ss.topics = [...new Set([...ss.topics, ...observation.topics])].slice(0, 5);
    }
  }

  // Detect Monday patterns
  if (dayOfWeek === 1 && hour < 12) {
    if (observation.wasStressed || observation.mood < 0.4) {
      profile.weekly.monday.type = 'dread';
    } else if (observation.wasPositive || observation.mood > 0.6) {
      profile.weekly.monday.type = 'motivated';
    }
    profile.weekly.monday.energyLevel =
      0.2 * observation.energy + 0.8 * profile.weekly.monday.energyLevel;
  }

  // Detect weekend patterns
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    if (observation.topics.some((t) => /lonel|alone|isolated/i.test(t))) {
      profile.weekly.weekend.lonelinessPeak = true;
    }
    if (observation.topics.some((t) => /family|parent|sibling/i.test(t)) && observation.wasStressed) {
      profile.weekly.weekend.familyStress = true;
    }
  }

  // Update data quality
  profile.dataQuality.totalObservations++;
  profile.dataQuality.lastUpdated = new Date();
  profile.dataQuality.weeklyConfidence = Math.min(
    0.9,
    profile.dataQuality.totalObservations / 20
  );

  log.debug(
    { userId, day: dayOfWeek, mood: observation.mood },
    '📅 Life rhythm observation recorded'
  );
}

/**
 * Add an anniversary date
 */
export function addAnniversary(userId: string, anniversary: AnniversaryDate): void {
  const profile = getLifeRhythmProfile(userId);

  // Check for duplicate
  const exists = profile.anniversaries.some(
    (a) => a.date.month === anniversary.date.month && a.date.day === anniversary.date.day
  );

  if (!exists) {
    profile.anniversaries.push(anniversary);
    log.info(
      { userId, type: anniversary.type, description: anniversary.description },
      '📆 Anniversary recorded'
    );
  }
}

/**
 * Format prediction for prompt injection
 */
export function formatPredictionForPrompt(prediction: RhythmPrediction): string {
  const lines = ['[LIFE RHYTHM AWARENESS]'];

  if (prediction.reasons.length > 0) {
    lines.push(`Current context: ${prediction.reasons.join('; ')}`);
  }

  lines.push(`Predicted state: ${prediction.prediction.likelyMood} mood, ${prediction.prediction.likelyEnergy} energy`);

  if (prediction.approach.shouldReachOut) {
    lines.push(`Approach: ${prediction.approach.tone}`);
    // NOTE: Removed literal opener suggestion - the LLM was copying it verbatim
    // Just provide the tone guidance and let the LLM craft natural language
  }

  return lines.join('\n');
}

// ============================================================================
// IMPORT/EXPORT (for persistence)
// ============================================================================

/**
 * Import a life rhythm profile into memory (for persistence)
 */
export function importLifeRhythmProfile(profile: LifeRhythmProfile): void {
  userProfiles.set(profile.userId, profile);
}

// ============================================================================
// RESET (for testing)
// ============================================================================

/**
 * Reset all life rhythm prediction state (for testing)
 */
export function resetLifeRhythmPrediction(): void {
  userProfiles.clear();
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  getLifeRhythmProfile,
  predictUserState,
  recordConversationObservation,
  addAnniversary,
  formatPredictionForPrompt,
  resetLifeRhythmPrediction,
};

