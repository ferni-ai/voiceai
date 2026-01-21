/**
 * Biometric Habit Intelligence - Better Than Human Service
 *
 * What no human friend can do: Correlate biometric data with habit success,
 * predict optimal habit windows from HRV/sleep/recovery data, and provide
 * recovery-aware scheduling that respects physiological readiness.
 *
 * External APIs Integrated:
 * - Apple HealthKit / Google Fit (sleep, HRV, activity)
 * - Oura Ring API (readiness, recovery)
 * - Whoop API (strain/recovery)
 *
 * @module services/superhuman/biometric-habit-intelligence
 */

import { createLogger } from '../../utils/safe-logger.js';
import { cleanForFirestore, getFirestoreDb } from './firestore-utils.js';

const log = createLogger({ module: 'biometric-habit-intelligence' });

// ============================================================================
// TYPES
// ============================================================================

export type BiometricSource = 'apple_health' | 'google_fit' | 'oura' | 'whoop' | 'manual';
export type ReadinessLevel = 'low' | 'moderate' | 'optimal' | 'peak';
export type SleepStage = 'deep' | 'rem' | 'light' | 'awake';

export interface BiometricReading {
  id: string;
  userId: string;
  source: BiometricSource;
  timestamp: number;

  // Heart Rate Variability
  hrv?: {
    rmssd: number; // Root mean square of successive differences (ms)
    baseline: number;
    percentOfBaseline: number;
  };

  // Resting Heart Rate
  restingHeartRate?: number;

  // Sleep
  sleep?: {
    totalDuration: number; // minutes
    deepSleep: number;
    remSleep: number;
    lightSleep: number;
    awakeTime: number;
    sleepEfficiency: number; // 0-100%
    sleepScore?: number; // Provider-specific
  };

  // Activity
  activity?: {
    steps: number;
    activeMinutes: number;
    caloriesBurned: number;
    strainScore?: number; // Whoop-specific
  };

  // Recovery (Oura/Whoop)
  recovery?: {
    score: number; // 0-100
    readiness: number; // 0-100
    bodyBattery?: number; // Garmin-style
  };

  // Readiness calculation
  computedReadiness: ReadinessLevel;
  readinessScore: number; // 0-100
}

export interface HabitBiometricCorrelation {
  habitId: string;
  habitName: string;

  // Sleep correlations
  sleepCorrelation: {
    optimalSleepHours: number;
    successRateWithOptimalSleep: number;
    successRateWithoutOptimalSleep: number;
    sleepQualityImpact: number; // -1 to 1
  };

  // HRV correlations
  hrvCorrelation: {
    optimalHRVRange: { min: number; max: number };
    successRateInOptimalHRV: number;
    hrvImpact: number;
  };

  // Recovery correlations
  recoveryCorrelation: {
    minRecoveryForSuccess: number;
    successRateAboveThreshold: number;
    successRateBelowThreshold: number;
  };

  // Time-of-day correlations with biometrics
  optimalTimeWindows: Array<{
    startHour: number;
    endHour: number;
    biomarkerAlignment: string;
    successRate: number;
  }>;

  observationCount: number;
  lastUpdated: number;
}

export interface RecoveryAwareSchedule {
  userId: string;
  date: string; // YYYY-MM-DD

  currentReadiness: ReadinessLevel;
  readinessScore: number;

  // Recommended schedule
  recommendedHabits: Array<{
    habitId: string;
    habitName: string;
    recommendedTime: string; // HH:MM
    readinessMatch: 'optimal' | 'acceptable' | 'suboptimal';
    reason: string;
  }>;

  // Habits to skip/reduce
  adjustedHabits: Array<{
    habitId: string;
    habitName: string;
    adjustment: 'skip' | 'reduce' | 'modify';
    reason: string;
    alternativeSuggestion?: string;
  }>;

  // Energy forecast
  energyForecast: Array<{
    hour: number;
    predictedEnergy: number; // 0-10
    basedOn: string[];
  }>;
}

export interface BiometricProfile {
  userId: string;

  // Connected sources
  connectedSources: BiometricSource[];

  // Baselines (calculated from historical data)
  baselines: {
    hrvRmssd: number;
    restingHeartRate: number;
    avgSleepDuration: number;
    avgSleepEfficiency: number;
    avgRecoveryScore: number;
  };

  // Recent readings
  recentReadings: BiometricReading[];

  // Habit correlations
  habitCorrelations: HabitBiometricCorrelation[];

  // Patterns
  weekdayPatterns: Record<
    number,
    {
      avgReadiness: number;
      avgSleep: number;
      bestHabitWindow: { start: number; end: number };
    }
  >;

  updatedAt: number;
}

// ============================================================================
// READINESS CALCULATION
// ============================================================================

/**
 * Calculate overall readiness from biometric signals.
 */
export function calculateReadiness(reading: Partial<BiometricReading>): {
  readinessLevel: ReadinessLevel;
  readinessScore: number;
  factors: Array<{ factor: string; impact: 'positive' | 'neutral' | 'negative'; detail: string }>;
} {
  const factors: Array<{
    factor: string;
    impact: 'positive' | 'neutral' | 'negative';
    detail: string;
  }> = [];
  let totalScore = 50; // Start at neutral

  // HRV contribution (±20 points)
  if (reading.hrv) {
    const hrvPercent = reading.hrv.percentOfBaseline;
    if (hrvPercent >= 105) {
      totalScore += 20;
      factors.push({
        factor: 'HRV',
        impact: 'positive',
        detail: `${hrvPercent}% of baseline - excellent recovery`,
      });
    } else if (hrvPercent >= 95) {
      totalScore += 10;
      factors.push({
        factor: 'HRV',
        impact: 'positive',
        detail: `${hrvPercent}% of baseline - good recovery`,
      });
    } else if (hrvPercent >= 85) {
      factors.push({
        factor: 'HRV',
        impact: 'neutral',
        detail: `${hrvPercent}% of baseline - adequate`,
      });
    } else {
      totalScore -= 15;
      factors.push({
        factor: 'HRV',
        impact: 'negative',
        detail: `${hrvPercent}% of baseline - low, needs recovery`,
      });
    }
  }

  // Sleep contribution (±25 points)
  if (reading.sleep) {
    const sleep = reading.sleep;

    // Duration
    if (sleep.totalDuration >= 420 && sleep.totalDuration <= 540) {
      // 7-9 hours
      totalScore += 15;
      factors.push({
        factor: 'Sleep Duration',
        impact: 'positive',
        detail: `${Math.round(sleep.totalDuration / 60)} hours - optimal`,
      });
    } else if (sleep.totalDuration >= 360) {
      // 6+ hours
      totalScore += 5;
      factors.push({
        factor: 'Sleep Duration',
        impact: 'neutral',
        detail: `${Math.round(sleep.totalDuration / 60)} hours - acceptable`,
      });
    } else {
      totalScore -= 15;
      factors.push({
        factor: 'Sleep Duration',
        impact: 'negative',
        detail: `${Math.round(sleep.totalDuration / 60)} hours - insufficient`,
      });
    }

    // Quality (deep + REM)
    const qualitySleep = sleep.deepSleep + sleep.remSleep;
    const qualityRatio = qualitySleep / sleep.totalDuration;
    if (qualityRatio >= 0.4) {
      totalScore += 10;
      factors.push({
        factor: 'Sleep Quality',
        impact: 'positive',
        detail: 'High restorative sleep',
      });
    } else if (qualityRatio < 0.25) {
      totalScore -= 10;
      factors.push({
        factor: 'Sleep Quality',
        impact: 'negative',
        detail: 'Low restorative sleep',
      });
    }
  }

  // Recovery score contribution (±15 points)
  if (reading.recovery) {
    if (reading.recovery.score >= 80) {
      totalScore += 15;
      factors.push({
        factor: 'Recovery',
        impact: 'positive',
        detail: `${reading.recovery.score}% - fully recovered`,
      });
    } else if (reading.recovery.score >= 60) {
      totalScore += 5;
      factors.push({
        factor: 'Recovery',
        impact: 'neutral',
        detail: `${reading.recovery.score}% - moderate`,
      });
    } else {
      totalScore -= 10;
      factors.push({
        factor: 'Recovery',
        impact: 'negative',
        detail: `${reading.recovery.score}% - still recovering`,
      });
    }
  }

  // Resting heart rate contribution (±10 points)
  if (reading.restingHeartRate) {
    // This would ideally compare to personal baseline
    if (reading.restingHeartRate < 60) {
      totalScore += 10;
      factors.push({
        factor: 'Resting HR',
        impact: 'positive',
        detail: `${reading.restingHeartRate} bpm - excellent`,
      });
    } else if (reading.restingHeartRate > 80) {
      totalScore -= 10;
      factors.push({
        factor: 'Resting HR',
        impact: 'negative',
        detail: `${reading.restingHeartRate} bpm - elevated`,
      });
    }
  }

  // Clamp to 0-100
  const readinessScore = Math.max(0, Math.min(100, totalScore));

  // Determine level
  let readinessLevel: ReadinessLevel;
  if (readinessScore >= 80) readinessLevel = 'peak';
  else if (readinessScore >= 60) readinessLevel = 'optimal';
  else if (readinessScore >= 40) readinessLevel = 'moderate';
  else readinessLevel = 'low';

  return { readinessLevel, readinessScore, factors };
}

// ============================================================================
// RECOVERY-AWARE SCHEDULING
// ============================================================================

/**
 * Generate a recovery-aware habit schedule based on biometric data.
 */
export function generateRecoveryAwareSchedule(
  userId: string,
  date: string,
  currentReading: BiometricReading,
  habits: Array<{
    id: string;
    name: string;
    difficulty: 'easy' | 'moderate' | 'hard';
    preferredTime?: string;
    requiredEnergy: 'low' | 'medium' | 'high';
  }>,
  correlations: HabitBiometricCorrelation[]
): RecoveryAwareSchedule {
  const { readinessLevel, readinessScore } = calculateReadiness(currentReading);

  const recommendedHabits: RecoveryAwareSchedule['recommendedHabits'] = [];
  const adjustedHabits: RecoveryAwareSchedule['adjustedHabits'] = [];

  for (const habit of habits) {
    const correlation = correlations.find((c) => c.habitId === habit.id);

    // Check if habit should be adjusted based on readiness
    if (readinessLevel === 'low' && habit.requiredEnergy === 'high') {
      adjustedHabits.push({
        habitId: habit.id,
        habitName: habit.name,
        adjustment: 'skip',
        reason: `Readiness is ${readinessScore}% - high-energy habits not recommended today`,
        alternativeSuggestion: 'Try a gentler version or rest instead',
      });
      continue;
    }

    if (readinessLevel === 'moderate' && habit.difficulty === 'hard') {
      adjustedHabits.push({
        habitId: habit.id,
        habitName: habit.name,
        adjustment: 'reduce',
        reason: `Moderate readiness (${readinessScore}%) - consider a lighter version`,
        alternativeSuggestion: 'Do 50% of your normal routine',
      });
    }

    // Find optimal time window
    let recommendedTime = habit.preferredTime || '09:00';
    let readinessMatch: 'optimal' | 'acceptable' | 'suboptimal' = 'acceptable';
    let reason = 'Default time slot';

    if (correlation && correlation.optimalTimeWindows.length > 0) {
      const bestWindow = correlation.optimalTimeWindows[0];
      recommendedTime = `${bestWindow.startHour.toString().padStart(2, '0')}:00`;
      readinessMatch =
        readinessLevel === 'peak' || readinessLevel === 'optimal' ? 'optimal' : 'acceptable';
      reason = `Based on ${correlation.observationCount} observations: ${bestWindow.biomarkerAlignment}`;
    }

    // Adjust based on current readiness
    if (readinessLevel === 'peak' && habit.requiredEnergy === 'high') {
      readinessMatch = 'optimal';
      reason = 'Peak readiness - perfect for challenging habits';
    }

    recommendedHabits.push({
      habitId: habit.id,
      habitName: habit.name,
      recommendedTime,
      readinessMatch,
      reason,
    });
  }

  // Generate energy forecast for the day
  const energyForecast = generateEnergyForecast(currentReading);

  return {
    userId,
    date,
    currentReadiness: readinessLevel,
    readinessScore,
    recommendedHabits,
    adjustedHabits,
    energyForecast,
  };
}

/**
 * Generate hourly energy forecast based on biometric data.
 */
function generateEnergyForecast(
  reading: BiometricReading
): RecoveryAwareSchedule['energyForecast'] {
  const forecast: RecoveryAwareSchedule['energyForecast'] = [];
  const baseEnergy = reading.readinessScore / 10;

  // Typical circadian rhythm adjusted by readiness
  const circadianPattern = [
    { hour: 6, modifier: -0.3 },
    { hour: 7, modifier: -0.1 },
    { hour: 8, modifier: 0.2 },
    { hour: 9, modifier: 0.4 },
    { hour: 10, modifier: 0.5 },
    { hour: 11, modifier: 0.4 },
    { hour: 12, modifier: 0.2 },
    { hour: 13, modifier: -0.1 }, // Post-lunch dip
    { hour: 14, modifier: -0.2 },
    { hour: 15, modifier: 0.0 },
    { hour: 16, modifier: 0.2 },
    { hour: 17, modifier: 0.3 },
    { hour: 18, modifier: 0.1 },
    { hour: 19, modifier: -0.1 },
    { hour: 20, modifier: -0.3 },
    { hour: 21, modifier: -0.5 },
    { hour: 22, modifier: -0.7 },
  ];

  for (const { hour, modifier } of circadianPattern) {
    const predictedEnergy = Math.max(1, Math.min(10, baseEnergy + modifier * 3));

    const basedOn: string[] = ['Circadian rhythm pattern'];
    if (reading.sleep) {
      basedOn.push(`Sleep quality (${Math.round(reading.sleep.sleepEfficiency)}%)`);
    }
    if (reading.hrv) {
      basedOn.push(`HRV (${reading.hrv.percentOfBaseline}% of baseline)`);
    }
    if (reading.recovery) {
      basedOn.push(`Recovery score (${reading.recovery.score}%)`);
    }

    forecast.push({
      hour,
      predictedEnergy: Math.round(predictedEnergy * 10) / 10,
      basedOn,
    });
  }

  return forecast;
}

// ============================================================================
// HABIT-BIOMETRIC CORRELATION
// ============================================================================

/**
 * Analyze correlation between habit success and biometric data.
 */
export function analyzeHabitBiometricCorrelation(
  habitId: string,
  habitName: string,
  habitCompletions: Array<{
    date: string;
    completed: boolean;
    time: string;
    quality: number; // 0-10
  }>,
  biometricReadings: BiometricReading[]
): HabitBiometricCorrelation {
  // Match completions with biometric data
  const pairedData: Array<{
    completion: (typeof habitCompletions)[0];
    reading: BiometricReading;
  }> = [];

  for (const completion of habitCompletions) {
    const matchingReading = biometricReadings.find((r) => {
      const readingDate = new Date(r.timestamp).toISOString().split('T')[0];
      return readingDate === completion.date;
    });
    if (matchingReading) {
      pairedData.push({ completion, reading: matchingReading });
    }
  }

  // Sleep correlation
  const withGoodSleep = pairedData.filter(
    (d) => d.reading.sleep && d.reading.sleep.totalDuration >= 420
  );
  const withPoorSleep = pairedData.filter(
    (d) => d.reading.sleep && d.reading.sleep.totalDuration < 420
  );

  const successWithGoodSleep =
    withGoodSleep.filter((d) => d.completion.completed).length / Math.max(1, withGoodSleep.length);
  const successWithPoorSleep =
    withPoorSleep.filter((d) => d.completion.completed).length / Math.max(1, withPoorSleep.length);

  // HRV correlation
  const highHRV = pairedData.filter((d) => d.reading.hrv && d.reading.hrv.percentOfBaseline >= 95);
  const lowHRV = pairedData.filter((d) => d.reading.hrv && d.reading.hrv.percentOfBaseline < 95);

  const successWithHighHRV =
    highHRV.filter((d) => d.completion.completed).length / Math.max(1, highHRV.length);
  const successWithLowHRV =
    lowHRV.filter((d) => d.completion.completed).length / Math.max(1, lowHRV.length);

  // Recovery correlation
  const goodRecovery = pairedData.filter(
    (d) => d.reading.recovery && d.reading.recovery.score >= 70
  );
  const poorRecovery = pairedData.filter(
    (d) => d.reading.recovery && d.reading.recovery.score < 70
  );

  const successWithGoodRecovery =
    goodRecovery.filter((d) => d.completion.completed).length / Math.max(1, goodRecovery.length);
  const successWithPoorRecovery =
    poorRecovery.filter((d) => d.completion.completed).length / Math.max(1, poorRecovery.length);

  // Time window analysis
  const timeWindowAnalysis = analyzeTimeWindows(pairedData);

  return {
    habitId,
    habitName,
    sleepCorrelation: {
      optimalSleepHours: 7.5,
      successRateWithOptimalSleep: successWithGoodSleep,
      successRateWithoutOptimalSleep: successWithPoorSleep,
      sleepQualityImpact: successWithGoodSleep - successWithPoorSleep,
    },
    hrvCorrelation: {
      optimalHRVRange: { min: 95, max: 120 },
      successRateInOptimalHRV: successWithHighHRV,
      hrvImpact: successWithHighHRV - successWithLowHRV,
    },
    recoveryCorrelation: {
      minRecoveryForSuccess: 70,
      successRateAboveThreshold: successWithGoodRecovery,
      successRateBelowThreshold: successWithPoorRecovery,
    },
    optimalTimeWindows: timeWindowAnalysis,
    observationCount: pairedData.length,
    lastUpdated: Date.now(),
  };
}

function analyzeTimeWindows(
  pairedData: Array<{
    completion: { date: string; completed: boolean; time: string; quality: number };
    reading: BiometricReading;
  }>
): HabitBiometricCorrelation['optimalTimeWindows'] {
  // Group by hour
  const hourlySuccess: Record<number, { success: number; total: number; avgReadiness: number }> =
    {};

  for (const { completion, reading } of pairedData) {
    const hour = parseInt(completion.time.split(':')[0]);

    if (!hourlySuccess[hour]) {
      hourlySuccess[hour] = { success: 0, total: 0, avgReadiness: 0 };
    }

    hourlySuccess[hour].total++;
    if (completion.completed) hourlySuccess[hour].success++;
    hourlySuccess[hour].avgReadiness += reading.readinessScore;
  }

  // Calculate rates and find best windows
  const windows: HabitBiometricCorrelation['optimalTimeWindows'] = [];

  for (const [hourStr, data] of Object.entries(hourlySuccess)) {
    if (data.total >= 3) {
      // Need at least 3 observations
      const hour = parseInt(hourStr);
      const successRate = data.success / data.total;
      const avgReadiness = data.avgReadiness / data.total;

      windows.push({
        startHour: hour,
        endHour: hour + 1,
        biomarkerAlignment:
          avgReadiness >= 60 ? 'High readiness alignment' : 'Moderate readiness alignment',
        successRate,
      });
    }
  }

  // Sort by success rate
  windows.sort((a, b) => b.successRate - a.successRate);

  return windows.slice(0, 3);
}

// ============================================================================
// API INTEGRATION HELPERS
// ============================================================================

/**
 * Normalize data from different biometric APIs.
 */
export function normalizeAppleHealthData(appleData: {
  hrv?: number;
  restingHeartRate?: number;
  sleepAnalysis?: Array<{ startDate: string; endDate: string; value: string }>;
  stepCount?: number;
  activeEnergyBurned?: number;
}): Partial<BiometricReading> {
  const reading: Partial<BiometricReading> = {
    source: 'apple_health',
    timestamp: Date.now(),
  };

  if (appleData.hrv) {
    reading.hrv = {
      rmssd: appleData.hrv,
      baseline: 50, // Would be calculated from history
      percentOfBaseline: (appleData.hrv / 50) * 100,
    };
  }

  if (appleData.restingHeartRate) {
    reading.restingHeartRate = appleData.restingHeartRate;
  }

  if (appleData.sleepAnalysis && appleData.sleepAnalysis.length > 0) {
    // Parse Apple's sleep stages
    let deep = 0,
      rem = 0,
      light = 0,
      awake = 0;

    for (const stage of appleData.sleepAnalysis) {
      const start = new Date(stage.startDate).getTime();
      const end = new Date(stage.endDate).getTime();
      const duration = (end - start) / (1000 * 60);

      switch (stage.value) {
        case 'HKCategoryValueSleepAnalysisAsleepCore':
          light += duration;
          break;
        case 'HKCategoryValueSleepAnalysisAsleepDeep':
          deep += duration;
          break;
        case 'HKCategoryValueSleepAnalysisAsleepREM':
          rem += duration;
          break;
        case 'HKCategoryValueSleepAnalysisAwake':
          awake += duration;
          break;
      }
    }

    const total = deep + rem + light + awake;
    reading.sleep = {
      totalDuration: total,
      deepSleep: deep,
      remSleep: rem,
      lightSleep: light,
      awakeTime: awake,
      sleepEfficiency: total > 0 ? ((total - awake) / total) * 100 : 0,
    };
  }

  if (appleData.stepCount || appleData.activeEnergyBurned) {
    reading.activity = {
      steps: appleData.stepCount || 0,
      activeMinutes: 0, // Would need to be calculated
      caloriesBurned: appleData.activeEnergyBurned || 0,
    };
  }

  return reading;
}

export function normalizeOuraData(ouraData: {
  sleep?: {
    total: number;
    deep: number;
    rem: number;
    light: number;
    awake: number;
    score: number;
    efficiency: number;
  };
  readiness?: {
    score: number;
    temperature_deviation?: number;
    hrv_balance?: number;
  };
  activity?: {
    steps: number;
    active_calories: number;
    score: number;
  };
}): Partial<BiometricReading> {
  const reading: Partial<BiometricReading> = {
    source: 'oura',
    timestamp: Date.now(),
  };

  if (ouraData.sleep) {
    reading.sleep = {
      totalDuration: ouraData.sleep.total,
      deepSleep: ouraData.sleep.deep,
      remSleep: ouraData.sleep.rem,
      lightSleep: ouraData.sleep.light,
      awakeTime: ouraData.sleep.awake,
      sleepEfficiency: ouraData.sleep.efficiency,
      sleepScore: ouraData.sleep.score,
    };
  }

  if (ouraData.readiness) {
    reading.recovery = {
      score: ouraData.readiness.score,
      readiness: ouraData.readiness.score,
    };
  }

  if (ouraData.activity) {
    reading.activity = {
      steps: ouraData.activity.steps,
      activeMinutes: 0,
      caloriesBurned: ouraData.activity.active_calories,
    };
  }

  return reading;
}

export function normalizeWhoopData(whoopData: {
  recovery?: {
    score: number;
    hrv: number;
    resting_heart_rate: number;
  };
  sleep?: {
    quality_duration: number;
    sleep_efficiency: number;
    disturbances: number;
  };
  strain?: {
    score: number;
    average_heart_rate: number;
    calories: number;
  };
}): Partial<BiometricReading> {
  const reading: Partial<BiometricReading> = {
    source: 'whoop',
    timestamp: Date.now(),
  };

  if (whoopData.recovery) {
    reading.hrv = {
      rmssd: whoopData.recovery.hrv,
      baseline: 50,
      percentOfBaseline: (whoopData.recovery.hrv / 50) * 100,
    };
    reading.restingHeartRate = whoopData.recovery.resting_heart_rate;
    reading.recovery = {
      score: whoopData.recovery.score,
      readiness: whoopData.recovery.score,
    };
  }

  if (whoopData.sleep) {
    reading.sleep = {
      totalDuration: whoopData.sleep.quality_duration,
      deepSleep: 0, // Whoop doesn't break down stages in basic API
      remSleep: 0,
      lightSleep: 0,
      awakeTime: 0,
      sleepEfficiency: whoopData.sleep.sleep_efficiency,
    };
  }

  if (whoopData.strain) {
    reading.activity = {
      steps: 0, // Whoop doesn't track steps
      activeMinutes: 0,
      caloriesBurned: whoopData.strain.calories,
      strainScore: whoopData.strain.score,
    };
  }

  return reading;
}

// ============================================================================
// FIRESTORE PERSISTENCE
// ============================================================================

export async function loadBiometricProfile(userId: string): Promise<BiometricProfile | null> {
  const db = getFirestoreDb();
  if (!db) return null;

  try {
    const doc = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('superhuman')
      .doc('biometric')
      .get();

    if (!doc.exists) return null;
    return doc.data() as BiometricProfile;
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to load biometric profile');
    return null;
  }
}

export async function saveBiometricProfile(profile: BiometricProfile): Promise<void> {
  const db = getFirestoreDb();
  if (!db) return;

  try {
    await db
      .collection('bogle_users')
      .doc(profile.userId)
      .collection('superhuman')
      .doc('biometric')
      .set(cleanForFirestore({ ...profile, updatedAt: Date.now() }));

    log.debug({ userId: profile.userId }, 'Biometric profile saved');
  } catch (error) {
    log.warn({ error: String(error), userId: profile.userId }, 'Failed to save biometric profile');
  }
}

export async function saveBiometricReading(reading: BiometricReading): Promise<void> {
  const db = getFirestoreDb();
  if (!db) return;

  try {
    await db
      .collection('bogle_users')
      .doc(reading.userId)
      .collection('biometric_readings')
      .doc(reading.id)
      .set(cleanForFirestore(reading));

    log.debug({ userId: reading.userId, source: reading.source }, 'Biometric reading saved');
  } catch (error) {
    log.warn({ error: String(error), userId: reading.userId }, 'Failed to save biometric reading');
  }
}

// ============================================================================
// CONTEXT BUILDING
// ============================================================================

export async function buildBiometricHabitContext(userId: string): Promise<string> {
  const profile = await loadBiometricProfile(userId);
  if (!profile || profile.recentReadings.length === 0) return '';

  const latestReading = profile.recentReadings[0];
  const { readinessLevel, readinessScore, factors } = calculateReadiness(latestReading);

  const sections: string[] = ['[BIOMETRIC HABIT INTELLIGENCE - Better Than Human Body Awareness]'];
  sections.push('You know their physiological state and can optimize habits accordingly.');

  // Current readiness
  sections.push(`\n**Today's Readiness**: ${readinessLevel.toUpperCase()} (${readinessScore}%)`);
  for (const factor of factors.slice(0, 3)) {
    const emoji = factor.impact === 'positive' ? '✓' : factor.impact === 'negative' ? '!' : '○';
    sections.push(`  ${emoji} ${factor.factor}: ${factor.detail}`);
  }

  // Sleep data
  if (latestReading.sleep) {
    const sleepHours = (latestReading.sleep.totalDuration / 60).toFixed(1);
    sections.push(
      `\n**Last Night's Sleep**: ${sleepHours} hours (${latestReading.sleep.sleepEfficiency}% efficiency)`
    );
  }

  // Recommendations
  if (readinessLevel === 'low') {
    sections.push(
      '\n**Recovery Mode Recommendation**: Skip high-intensity habits today. Focus on rest and gentle routines.'
    );
  } else if (readinessLevel === 'peak') {
    sections.push(
      '\n**Peak Performance Window**: Excellent day for challenging habits and important goals.'
    );
  }

  // Top correlations
  const topCorrelations = profile.habitCorrelations
    .filter((c) => c.observationCount >= 5)
    .sort((a, b) => b.sleepCorrelation.sleepQualityImpact - a.sleepCorrelation.sleepQualityImpact)
    .slice(0, 2);

  if (topCorrelations.length > 0) {
    sections.push('\n**Habit-Biometric Insights**:');
    for (const corr of topCorrelations) {
      sections.push(
        `• ${corr.habitName}: ${Math.round(corr.sleepCorrelation.successRateWithOptimalSleep * 100)}% success with good sleep vs ${Math.round(corr.sleepCorrelation.successRateWithoutOptimalSleep * 100)}% without`
      );
    }
  }

  sections.push(
    '\nUse biometric insights naturally. "Based on your sleep last night..." not "My biometric analysis shows..."'
  );

  return sections.join('\n');
}

// ============================================================================
// EXPORTS
// ============================================================================

export const biometricHabitIntelligence = {
  // Readiness
  calculateReadiness,

  // Scheduling
  generateRecoveryAwareSchedule,

  // Correlations
  analyzeHabitBiometricCorrelation,

  // Data normalization
  normalizeAppleHealthData,
  normalizeOuraData,
  normalizeWhoopData,

  // Persistence
  loadProfile: loadBiometricProfile,
  saveProfile: saveBiometricProfile,
  saveReading: saveBiometricReading,

  // Context
  buildContext: buildBiometricHabitContext,
};
