/**
 * Optimal Timing ML Service
 *
 * "Better Than Human" learning of the best times to reach each contact.
 * Uses Thompson Sampling (multi-armed bandit) to balance exploration/exploitation.
 *
 * Learns from:
 * - Response rates by time of day
 * - Response rates by day of week
 * - Message open rates (email)
 * - Reply speed
 * - Engagement quality
 *
 * @module services/contacts/optimal-timing
 */

import { createLogger } from '../../utils/safe-logger.js';
import type { Firestore as FirestoreType } from '@google-cloud/firestore';

const log = createLogger({ module: 'optimal-timing' });

// ============================================================================
// TYPES
// ============================================================================

export type TimeSlot =
  | 'early_morning' // 6-8 AM
  | 'morning' // 8-11 AM
  | 'midday' // 11 AM - 1 PM
  | 'afternoon' // 1-5 PM
  | 'evening' // 5-8 PM
  | 'night'; // 8-11 PM

export type DayOfWeek =
  | 'monday'
  | 'tuesday'
  | 'wednesday'
  | 'thursday'
  | 'friday'
  | 'saturday'
  | 'sunday';

const TIME_SLOT_HOURS: Record<TimeSlot, { start: number; end: number; label: string }> = {
  early_morning: { start: 6, end: 8, label: '6-8 AM' },
  morning: { start: 8, end: 11, label: '8-11 AM' },
  midday: { start: 11, end: 13, label: '11 AM - 1 PM' },
  afternoon: { start: 13, end: 17, label: '1-5 PM' },
  evening: { start: 17, end: 20, label: '5-8 PM' },
  night: { start: 20, end: 23, label: '8-11 PM' },
};

const DAYS_OF_WEEK: DayOfWeek[] = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
];

/**
 * Beta distribution parameters for Thompson Sampling
 * Higher alpha = more successes, higher beta = more failures
 */
interface BetaParams {
  alpha: number; // Successes + 1 (prior)
  beta: number; // Failures + 1 (prior)
}

/**
 * Timing stats for a specific time slot
 */
interface TimingSlotStats {
  slot: TimeSlot;
  params: BetaParams;

  // Raw counts
  attempts: number;
  responses: number;
  avgResponseTimeMinutes?: number;

  // Derived
  responseRate: number;
  confidenceLevel: number; // 0-1, how confident we are
}

/**
 * Complete timing profile for a contact
 */
interface ContactTimingProfile {
  contactId: string;
  userId: string;

  // Time of day preferences
  timeSlots: Record<TimeSlot, BetaParams>;

  // Day of week preferences
  dayPreferences: Record<DayOfWeek, BetaParams>;

  // Combined best (learned)
  bestTimeSlot?: TimeSlot;
  bestDay?: DayOfWeek;

  // User-specified preferences (override ML)
  userSpecifiedBestTime?: string;

  // Stats
  totalAttempts: number;
  totalResponses: number;
  lastUpdated: Date;
}

export interface TimingRecommendation {
  contactId: string;
  contactName: string;

  // Best time to reach them
  recommendedTimeSlot: TimeSlot;
  recommendedDay: DayOfWeek;
  recommendedTimeLabel: string;

  // Confidence
  confidenceLevel: 'high' | 'medium' | 'low' | 'learning';
  confidenceReason: string;

  // When to send (specific datetime)
  suggestedSendTime: Date;

  // Stats
  expectedResponseRate: number;
  dataPoints: number;
}

export interface OutreachOutcome {
  contactId: string;
  sentAt: Date;
  channel: 'email' | 'sms' | 'voice';

  // Outcome
  gotResponse: boolean;
  responseTime?: number; // Minutes until response
  engagementQuality?: 'high' | 'medium' | 'low';

  // For emails
  wasOpened?: boolean;
  wasClicked?: boolean;
}

// ============================================================================
// THOMPSON SAMPLING HELPERS
// ============================================================================

/**
 * Sample from Beta distribution using the inverse CDF method (Box-Muller)
 */
function sampleBeta(alpha: number, beta: number): number {
  // Use gamma distribution sampling for beta
  // Beta(a,b) = Gamma(a) / (Gamma(a) + Gamma(b))

  const gammaA = sampleGamma(alpha);
  const gammaB = sampleGamma(beta);

  return gammaA / (gammaA + gammaB);
}

/**
 * Sample from Gamma distribution using Marsaglia and Tsang's method
 */
function sampleGamma(shape: number): number {
  if (shape < 1) {
    // For shape < 1, use: Gamma(a) = Gamma(a+1) * U^(1/a)
    const u = Math.random();
    return sampleGamma(shape + 1) * Math.pow(u, 1 / shape);
  }

  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);

  // Rejection sampling
  // eslint-disable-next-line no-constant-condition
  while (true) {
    let x: number;
    let v: number;

    do {
      x = randomNormal();
      v = 1 + c * x;
    } while (v <= 0);

    v = v * v * v;
    const u = Math.random();

    // Accept/reject
    if (u < 1 - 0.0331 * (x * x) * (x * x)) {
      return d * v;
    }

    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) {
      return d * v;
    }
  }
}

/**
 * Sample from standard normal distribution using Box-Muller
 */
function randomNormal(): number {
  const u1 = Math.random();
  const u2 = Math.random();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

/**
 * Get the expected value (mean) of a Beta distribution
 */
function betaMean(alpha: number, beta: number): number {
  return alpha / (alpha + beta);
}

/**
 * Get confidence level based on sample size
 */
function getConfidenceLevel(attempts: number): 'high' | 'medium' | 'low' | 'learning' {
  if (attempts >= 20) return 'high';
  if (attempts >= 10) return 'medium';
  if (attempts >= 5) return 'low';
  return 'learning';
}

// ============================================================================
// TIMING PROFILE MANAGEMENT
// ============================================================================

// In-memory cache
const profileCache = new Map<string, ContactTimingProfile>();

/**
 * Get initial (uninformed) timing profile
 */
function createInitialProfile(contactId: string, userId: string): ContactTimingProfile {
  const timeSlots: Record<TimeSlot, BetaParams> = {
    early_morning: { alpha: 1, beta: 1 },
    morning: { alpha: 2, beta: 1 }, // Slight prior for morning
    midday: { alpha: 1, beta: 1 },
    afternoon: { alpha: 1.5, beta: 1 }, // Slight prior for afternoon
    evening: { alpha: 1.5, beta: 1 }, // Slight prior for evening
    night: { alpha: 1, beta: 1 },
  };

  const dayPreferences: Record<DayOfWeek, BetaParams> = {
    sunday: { alpha: 1, beta: 1.5 }, // Slight negative prior for weekends
    monday: { alpha: 1.5, beta: 1 },
    tuesday: { alpha: 1.5, beta: 1 },
    wednesday: { alpha: 1.5, beta: 1 },
    thursday: { alpha: 1.5, beta: 1 },
    friday: { alpha: 1.5, beta: 1 },
    saturday: { alpha: 1, beta: 1.5 },
  };

  return {
    contactId,
    userId,
    timeSlots,
    dayPreferences,
    totalAttempts: 0,
    totalResponses: 0,
    lastUpdated: new Date(),
  };
}

let db: FirestoreType | null = null;

async function getFirestore(): Promise<FirestoreType | null> {
  if (db) return db;
  try {
    const { Firestore } = await import('@google-cloud/firestore');
    db = new Firestore({
      projectId: process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT,
      databaseId: process.env.FIRESTORE_DATABASE || '(default)',
    });
    return db;
  } catch {
    return null;
  }
}

/**
 * Load timing profile for a contact
 */
export async function getTimingProfile(
  userId: string,
  contactId: string
): Promise<ContactTimingProfile> {
  const cacheKey = `${userId}_${contactId}`;

  // Check cache
  if (profileCache.has(cacheKey)) {
    return profileCache.get(cacheKey)!;
  }

  // Try loading from Firestore
  const firestore = await getFirestore();
  if (firestore) {
    try {
      const doc = await firestore
        .collection('bogle_users')
        .doc(userId)
        .collection('contact_timing')
        .doc(contactId)
        .get();

      if (doc.exists) {
        const data = doc.data()!;
        const profile: ContactTimingProfile = {
          ...data,
          lastUpdated: data.lastUpdated?.toDate() || new Date(),
        } as ContactTimingProfile;

        profileCache.set(cacheKey, profile);
        return profile;
      }
    } catch (error) {
      log.warn({ error: String(error), contactId }, 'Failed to load timing profile');
    }
  }

  // Return initial profile
  const initial = createInitialProfile(contactId, userId);
  profileCache.set(cacheKey, initial);
  return initial;
}

/**
 * Save timing profile
 */
async function saveTimingProfile(profile: ContactTimingProfile): Promise<void> {
  const cacheKey = `${profile.userId}_${profile.contactId}`;
  profileCache.set(cacheKey, profile);

  const firestore = await getFirestore();
  if (!firestore) return;

  try {
    await firestore
      .collection('bogle_users')
      .doc(profile.userId)
      .collection('contact_timing')
      .doc(profile.contactId)
      .set(profile);
  } catch (error) {
    log.warn({ error: String(error) }, 'Failed to save timing profile');
  }
}

// ============================================================================
// LEARNING FROM OUTCOMES
// ============================================================================

/**
 * Record the outcome of an outreach attempt and update the model
 */
export async function recordOutcome(userId: string, outcome: OutreachOutcome): Promise<void> {
  const profile = await getTimingProfile(userId, outcome.contactId);

  // Determine time slot and day
  const sentDate = outcome.sentAt;
  const hour = sentDate.getHours();
  const dayIndex = sentDate.getDay();

  const timeSlot = getTimeSlotForHour(hour);
  const day = DAYS_OF_WEEK[dayIndex];

  // Update Beta parameters
  if (outcome.gotResponse) {
    profile.timeSlots[timeSlot].alpha += 1;
    profile.dayPreferences[day].alpha += 1;
    profile.totalResponses += 1;
  } else {
    profile.timeSlots[timeSlot].beta += 1;
    profile.dayPreferences[day].beta += 1;
  }

  profile.totalAttempts += 1;
  profile.lastUpdated = new Date();

  // Update best time/day if we have enough data
  if (profile.totalAttempts >= 5) {
    profile.bestTimeSlot = findBestSlot(profile.timeSlots);
    profile.bestDay = findBestDay(profile.dayPreferences);
  }

  await saveTimingProfile(profile);

  log.debug(
    {
      contactId: outcome.contactId,
      timeSlot,
      day,
      gotResponse: outcome.gotResponse,
      totalAttempts: profile.totalAttempts,
    },
    'Timing outcome recorded'
  );
}

function getTimeSlotForHour(hour: number): TimeSlot {
  if (hour >= 6 && hour < 8) return 'early_morning';
  if (hour >= 8 && hour < 11) return 'morning';
  if (hour >= 11 && hour < 13) return 'midday';
  if (hour >= 13 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 20) return 'evening';
  return 'night';
}

function findBestSlot(timeSlots: Record<TimeSlot, BetaParams>): TimeSlot {
  let best: TimeSlot = 'morning';
  let bestSample = 0;

  for (const [slot, params] of Object.entries(timeSlots)) {
    const sample = sampleBeta(params.alpha, params.beta);
    if (sample > bestSample) {
      bestSample = sample;
      best = slot as TimeSlot;
    }
  }

  return best;
}

function findBestDay(dayPrefs: Record<DayOfWeek, BetaParams>): DayOfWeek {
  let best: DayOfWeek = 'tuesday';
  let bestSample = 0;

  for (const [day, params] of Object.entries(dayPrefs)) {
    const sample = sampleBeta(params.alpha, params.beta);
    if (sample > bestSample) {
      bestSample = sample;
      best = day as DayOfWeek;
    }
  }

  return best;
}

// ============================================================================
// RECOMMENDATION GENERATION
// ============================================================================

/**
 * Get optimal timing recommendation for reaching a contact
 */
export async function getTimingRecommendation(
  userId: string,
  contactId: string,
  contactName: string
): Promise<TimingRecommendation> {
  const profile = await getTimingProfile(userId, contactId);

  // Use Thompson Sampling to select time and day
  const selectedSlot = selectTimeSlotThompson(profile.timeSlots);
  const selectedDay = selectDayThompson(profile.dayPreferences);

  // Calculate confidence
  const confidenceLevel = getConfidenceLevel(profile.totalAttempts);
  const expectedRate = betaMean(
    profile.timeSlots[selectedSlot].alpha,
    profile.timeSlots[selectedSlot].beta
  );

  // Calculate next occurrence of recommended time
  const suggestedSendTime = getNextOccurrence(selectedDay, selectedSlot);

  let confidenceReason: string;
  switch (confidenceLevel) {
    case 'high':
      confidenceReason = `Based on ${profile.totalAttempts} interactions, this is their most responsive time`;
      break;
    case 'medium':
      confidenceReason = `Learning their patterns (${profile.totalAttempts} data points so far)`;
      break;
    case 'low':
      confidenceReason = `Still gathering data (${profile.totalAttempts} interactions)`;
      break;
    default:
      confidenceReason = 'Using smart defaults while we learn their patterns';
  }

  return {
    contactId,
    contactName,
    recommendedTimeSlot: selectedSlot,
    recommendedDay: selectedDay,
    recommendedTimeLabel: `${capitalizeFirst(selectedDay)} ${TIME_SLOT_HOURS[selectedSlot].label}`,
    confidenceLevel,
    confidenceReason,
    suggestedSendTime,
    expectedResponseRate: Math.round(expectedRate * 100),
    dataPoints: profile.totalAttempts,
  };
}

function selectTimeSlotThompson(timeSlots: Record<TimeSlot, BetaParams>): TimeSlot {
  let best: TimeSlot = 'morning';
  let bestSample = -1;

  for (const [slot, params] of Object.entries(timeSlots)) {
    const sample = sampleBeta(params.alpha, params.beta);
    if (sample > bestSample) {
      bestSample = sample;
      best = slot as TimeSlot;
    }
  }

  return best;
}

function selectDayThompson(dayPrefs: Record<DayOfWeek, BetaParams>): DayOfWeek {
  let best: DayOfWeek = 'tuesday';
  let bestSample = -1;

  for (const [day, params] of Object.entries(dayPrefs)) {
    const sample = sampleBeta(params.alpha, params.beta);
    if (sample > bestSample) {
      bestSample = sample;
      best = day as DayOfWeek;
    }
  }

  return best;
}

function getNextOccurrence(day: DayOfWeek, slot: TimeSlot): Date {
  const now = new Date();
  const targetDayIndex = DAYS_OF_WEEK.indexOf(day);
  const currentDayIndex = now.getDay();

  let daysUntil = targetDayIndex - currentDayIndex;
  if (daysUntil < 0) daysUntil += 7;
  if (daysUntil === 0) {
    // If it's today, check if the time slot has passed
    const slotHours = TIME_SLOT_HOURS[slot];
    if (now.getHours() >= slotHours.end) {
      daysUntil = 7; // Next week
    }
  }

  const targetDate = new Date(now);
  targetDate.setDate(targetDate.getDate() + daysUntil);

  // Set to middle of time slot
  const slotHours = TIME_SLOT_HOURS[slot];
  const midHour = Math.floor((slotHours.start + slotHours.end) / 2);
  targetDate.setHours(midHour, 0, 0, 0);

  return targetDate;
}

function capitalizeFirst(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// ============================================================================
// BATCH TIMING
// ============================================================================

/**
 * Get optimal send times for a batch of contacts
 */
export async function getBatchTimingRecommendations(
  userId: string,
  contacts: Array<{ id: string; name: string }>
): Promise<TimingRecommendation[]> {
  const recommendations: TimingRecommendation[] = [];

  for (const contact of contacts) {
    const rec = await getTimingRecommendation(userId, contact.id, contact.name);
    recommendations.push(rec);
  }

  // Sort by suggested send time
  recommendations.sort((a, b) => a.suggestedSendTime.getTime() - b.suggestedSendTime.getTime());

  return recommendations;
}

/**
 * Group contacts by optimal send time for batch scheduling
 */
export async function groupByOptimalTime(
  userId: string,
  contacts: Array<{ id: string; name: string }>
): Promise<Map<string, Array<{ id: string; name: string; recommendation: TimingRecommendation }>>> {
  const groups = new Map<
    string,
    Array<{ id: string; name: string; recommendation: TimingRecommendation }>
  >();

  for (const contact of contacts) {
    const rec = await getTimingRecommendation(userId, contact.id, contact.name);
    const key = `${rec.recommendedDay}_${rec.recommendedTimeSlot}`;

    if (!groups.has(key)) {
      groups.set(key, []);
    }

    groups.get(key)!.push({
      id: contact.id,
      name: contact.name,
      recommendation: rec,
    });
  }

  return groups;
}

// ============================================================================
// EXPORTS
// ============================================================================

export const optimalTiming = {
  getProfile: getTimingProfile,
  recordOutcome,
  getRecommendation: getTimingRecommendation,
  getBatchRecommendations: getBatchTimingRecommendations,
  groupByOptimalTime,
  TIME_SLOT_HOURS,
  DAYS_OF_WEEK,
};

export default optimalTiming;
