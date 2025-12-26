/**
 * Perfect Timing Intelligence
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Knows exactly when to bring up topics, reach out, or hold back.
 * "Your best friend brings up your divorce during your busiest week.
 * Ferni waits for a quiet Sunday morning."
 *
 * @module PerfectTiming
 */

import { createLogger } from '../../utils/safe-logger.js';
import { getFirestoreDb } from './firestore-utils.js';

const log = createLogger({ module: 'PerfectTiming' });

// ============================================================================
// TYPES
// ============================================================================

export type ConversationType = 'deep' | 'gentle' | 'challenging' | 'celebration';
export type CalendarPressure = 'light' | 'moderate' | 'heavy';
export type GreetingTone = 'warm' | 'rushed' | 'tired' | 'neutral' | 'excited';

export interface ReceptivityScore {
  /** Overall receptivity (0-1) */
  score: number;

  /** Interpretation of the score */
  interpretation: string;

  /** Specific recommendations */
  recommendations: {
    canRaiseSensitiveTopics: boolean;
    shouldOfferSupport: boolean;
    keepItLight: boolean;
    perfectForDeep: boolean;
  };

  /** Factors that contributed to the score */
  factors: {
    energy: number;
    stress: number;
    greetingTone: GreetingTone;
    timeOfDay: string;
  };
}

export interface TimeWindow {
  dayOfWeek: number; // 0-6 (Sun-Sat)
  startHour: number; // 0-23
  endHour: number; // 0-23
  confidence: number;
}

export interface EnergyPattern {
  avgEnergy: number;
  sampleCount: number;
  confidence: number;
}

export interface QueuedTopic {
  topic: string;
  queuedAt: Date;
  reason: string;
  idealConditions: {
    minEnergy?: number;
    maxCalendarPressure?: CalendarPressure;
    requiredMood?: string[];
    avoidDaysOfWeek?: number[];
    avoidHoursOfDay?: number[];
  };
  expiresAt?: Date;
  surfacedAt?: Date;
  wasEffective?: boolean;
}

export interface ReceptivityReading {
  timestamp: Date;
  score: number;
  voiceMarkers: {
    energy: number;
    stress: number;
    openness: number;
  };
  greetingTone: GreetingTone;
  contextFactors: string[];
}

export interface TimingIntelligence {
  userId: string;

  /** Energy patterns by hour of day */
  energyByHour: Record<number, EnergyPattern>;

  /** Energy patterns by day of week */
  energyByDayOfWeek: Record<number, EnergyPattern>;

  /** Best windows for different conversation types */
  optimalWindows: {
    deepConversations: TimeWindow[];
    gentleCheckIns: TimeWindow[];
    challengingTopics: TimeWindow[];
    celebrations: TimeWindow[];
  };

  /** Topics waiting for right moment */
  queuedTopics: QueuedTopic[];

  /** Recent receptivity readings */
  recentReceptivity: ReceptivityReading[];

  /** Calendar awareness */
  calendarAwareness: {
    typicalMeetingDays: number[];
    averageMeetingsPerDay: number;
    knownBusyPeriods: Array<{
      startDate: Date;
      endDate: Date;
      description: string;
    }>;
  };

  updatedAt: Date;
}

// ============================================================================
// RECEPTIVITY THRESHOLDS
// ============================================================================

const GREETING_TONE_MODIFIERS: Record<GreetingTone, number> = {
  warm: 0.2,
  excited: 0.15,
  neutral: 0,
  tired: -0.1,
  rushed: -0.25,
};

const RECEPTIVITY_INTERPRETATIONS: Array<{ min: number; max: number; text: string }> = [
  { min: 0.8, max: 1.0, text: 'Highly receptive - perfect for deep conversation' },
  { min: 0.65, max: 0.8, text: 'Good receptivity - can discuss most topics' },
  { min: 0.5, max: 0.65, text: 'Moderate receptivity - keep it lighter' },
  { min: 0.35, max: 0.5, text: 'Low receptivity - supportive presence only' },
  { min: 0, max: 0.35, text: 'Not receptive - consider rescheduling' },
];

// ============================================================================
// IN-MEMORY STATE
// ============================================================================

const profiles = new Map<string, TimingIntelligence>();

// ============================================================================
// CORE FUNCTIONS
// ============================================================================

/**
 * Detect receptivity from voice at conversation start.
 * Call this within first 5-10 seconds of user speaking.
 */
export function detectReceptivity(voiceAnalysis: {
  energy: number; // 0-1
  stressLevel: number; // 0-1
  speechRate?: number; // Relative to baseline
  greetingTone: GreetingTone;
}): ReceptivityScore {
  const { energy, stressLevel, greetingTone } = voiceAnalysis;

  // Base receptivity calculation
  // High energy and low stress = high receptivity
  const baseReceptivity = energy * 0.35 + (1 - stressLevel) * 0.35;

  // Apply greeting tone modifier
  const toneModifier = GREETING_TONE_MODIFIERS[greetingTone] || 0;

  // Time of day factor (people are generally more receptive mid-morning)
  const hour = new Date().getHours();
  let timeModifier = 0;
  if (hour >= 9 && hour <= 11) timeModifier = 0.1; // Morning sweet spot
  else if (hour >= 14 && hour <= 16) timeModifier = 0.05; // Afternoon okay
  else if (hour >= 22 || hour <= 5) timeModifier = -0.1; // Late night/early morning

  const score = Math.max(0, Math.min(1, baseReceptivity + toneModifier + timeModifier));

  // Generate interpretation
  const interpretation =
    RECEPTIVITY_INTERPRETATIONS.find((i) => score >= i.min && score < i.max)?.text ||
    'Unable to assess receptivity';

  return {
    score,
    interpretation,
    recommendations: {
      canRaiseSensitiveTopics: score > 0.65 && stressLevel < 0.4,
      shouldOfferSupport: stressLevel > 0.5,
      keepItLight: score < 0.4 || greetingTone === 'rushed',
      perfectForDeep: score > 0.75 && greetingTone === 'warm',
    },
    factors: {
      energy,
      stress: stressLevel,
      greetingTone,
      timeOfDay: getTimeOfDayLabel(hour),
    },
  };
}

function getTimeOfDayLabel(hour: number): string {
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 21) return 'evening';
  return 'night';
}

/**
 * Learn from each conversation to improve timing predictions.
 */
export async function recordTimingLearning(
  userId: string,
  data: {
    timestamp: Date;
    receptivityScore: number;
    conversationQuality: number; // 0-1, how well did it go
    topicsSurfaced: string[];
    topicsWellReceived: string[];
    voiceEnergy: number;
    greetingTone: GreetingTone;
    calendarContext?: {
      meetingsToday: number;
      hoursUntilNextMeeting?: number;
    };
  }
): Promise<void> {
  let profile = profiles.get(userId);
  if (!profile) {
    profile = createEmptyProfile(userId);
    profiles.set(userId, profile);
  }

  const hour = data.timestamp.getHours();
  const dayOfWeek = data.timestamp.getDay();

  // Update hourly patterns
  if (!profile.energyByHour[hour]) {
    profile.energyByHour[hour] = { avgEnergy: 0, sampleCount: 0, confidence: 0 };
  }
  const hourPattern = profile.energyByHour[hour];
  const oldHourAvg = hourPattern.avgEnergy;
  const newHourAvg = (oldHourAvg * hourPattern.sampleCount + data.voiceEnergy) / (hourPattern.sampleCount + 1);
  hourPattern.avgEnergy = newHourAvg;
  hourPattern.sampleCount++;
  hourPattern.confidence = Math.min(0.95, hourPattern.sampleCount / 20); // Max confidence at 20 samples

  // Update daily patterns
  if (!profile.energyByDayOfWeek[dayOfWeek]) {
    profile.energyByDayOfWeek[dayOfWeek] = { avgEnergy: 0, sampleCount: 0, confidence: 0 };
  }
  const dayPattern = profile.energyByDayOfWeek[dayOfWeek];
  const oldDayAvg = dayPattern.avgEnergy;
  const newDayAvg = (oldDayAvg * dayPattern.sampleCount + data.voiceEnergy) / (dayPattern.sampleCount + 1);
  dayPattern.avgEnergy = newDayAvg;
  dayPattern.sampleCount++;
  dayPattern.confidence = Math.min(0.95, dayPattern.sampleCount / 10);

  // Record receptivity reading
  profile.recentReceptivity.push({
    timestamp: data.timestamp,
    score: data.receptivityScore,
    voiceMarkers: {
      energy: data.voiceEnergy,
      stress: 1 - data.receptivityScore, // Approximate
      openness: data.conversationQuality,
    },
    greetingTone: data.greetingTone,
    contextFactors: [],
  });

  // Keep last 50 readings
  if (profile.recentReceptivity.length > 50) {
    profile.recentReceptivity = profile.recentReceptivity.slice(-50);
  }

  // Update optimal windows based on patterns
  updateOptimalWindows(profile);

  // Update calendar awareness
  if (data.calendarContext) {
    if (data.calendarContext.meetingsToday > 3) {
      if (!profile.calendarAwareness.typicalMeetingDays.includes(dayOfWeek)) {
        profile.calendarAwareness.typicalMeetingDays.push(dayOfWeek);
      }
    }
    // Running average of meetings
    profile.calendarAwareness.averageMeetingsPerDay =
      profile.calendarAwareness.averageMeetingsPerDay * 0.9 + data.calendarContext.meetingsToday * 0.1;
  }

  profile.updatedAt = new Date();

  // Persist
  await saveTimingProfile(userId, profile);

  log.debug(
    {
      userId,
      hour,
      dayOfWeek,
      energy: data.voiceEnergy,
      quality: data.conversationQuality,
    },
    'Recorded timing learning'
  );
}

/**
 * Update optimal windows based on patterns.
 */
function updateOptimalWindows(profile: TimingIntelligence): void {
  const windows: TimeWindow[] = [];

  // Find high-energy hours
  for (const [hourStr, pattern] of Object.entries(profile.energyByHour)) {
    const hour = parseInt(hourStr, 10);
    if (pattern.avgEnergy > 0.6 && pattern.confidence > 0.3) {
      // This is a good hour - find which day it's best on
      for (const [dayStr, dayPattern] of Object.entries(profile.energyByDayOfWeek)) {
        const day = parseInt(dayStr, 10);
        if (dayPattern.avgEnergy > 0.5 && dayPattern.confidence > 0.3) {
          windows.push({
            dayOfWeek: day,
            startHour: hour,
            endHour: hour + 1,
            confidence: (pattern.confidence + dayPattern.confidence) / 2,
          });
        }
      }
    }
  }

  // Sort by confidence and assign to categories
  windows.sort((a, b) => b.confidence - a.confidence);

  profile.optimalWindows = {
    deepConversations: windows.filter((w) => w.confidence > 0.6).slice(0, 5),
    gentleCheckIns: windows.slice(0, 10),
    challengingTopics: windows.filter((w) => w.confidence > 0.5).slice(0, 5),
    celebrations: windows.slice(0, 8), // Celebrations are more flexible
  };
}

function createEmptyProfile(userId: string): TimingIntelligence {
  return {
    userId,
    energyByHour: {},
    energyByDayOfWeek: {},
    optimalWindows: {
      deepConversations: [],
      gentleCheckIns: [],
      challengingTopics: [],
      celebrations: [],
    },
    queuedTopics: [],
    recentReceptivity: [],
    calendarAwareness: {
      typicalMeetingDays: [],
      averageMeetingsPerDay: 0,
      knownBusyPeriods: [],
    },
    updatedAt: new Date(),
  };
}

// ============================================================================
// TOPIC QUEUING
// ============================================================================

/**
 * Queue a topic to surface at the right moment.
 */
export async function queueTopicForRightMoment(
  userId: string,
  topic: string,
  options: {
    reason: string;
    minEnergy?: number;
    maxCalendarPressure?: CalendarPressure;
    requiredMood?: string[];
    expiresInDays?: number;
    avoidDaysOfWeek?: number[];
    avoidHoursOfDay?: number[];
  }
): Promise<void> {
  let profile = profiles.get(userId);
  if (!profile) {
    profile = createEmptyProfile(userId);
    profiles.set(userId, profile);
  }

  const queuedTopic: QueuedTopic = {
    topic,
    queuedAt: new Date(),
    reason: options.reason,
    idealConditions: {
      minEnergy: options.minEnergy,
      maxCalendarPressure: options.maxCalendarPressure,
      requiredMood: options.requiredMood,
      avoidDaysOfWeek: options.avoidDaysOfWeek,
      avoidHoursOfDay: options.avoidHoursOfDay,
    },
    expiresAt: options.expiresInDays
      ? new Date(Date.now() + options.expiresInDays * 24 * 60 * 60 * 1000)
      : undefined,
  };

  // Check if topic already queued
  const existing = profile.queuedTopics.findIndex((t) => t.topic === topic);
  if (existing >= 0) {
    profile.queuedTopics[existing] = queuedTopic;
  } else {
    profile.queuedTopics.push(queuedTopic);
  }

  profile.updatedAt = new Date();

  log.debug({ userId, topic, reason: options.reason }, '📌 Topic queued for right moment');
}

/**
 * Check if any queued topics should be surfaced now.
 */
export function getTopicsForNow(
  userId: string,
  currentConditions: {
    receptivityScore: number;
    energy: number;
    stress: number;
    mood?: string;
    calendarPressure?: CalendarPressure;
  }
): string[] {
  const profile = profiles.get(userId);
  if (!profile) return [];

  const now = new Date();
  const currentHour = now.getHours();
  const currentDay = now.getDay();

  const readyTopics: string[] = [];

  for (const qt of profile.queuedTopics) {
    // Skip already surfaced or expired
    if (qt.surfacedAt) continue;
    if (qt.expiresAt && now > qt.expiresAt) continue;

    const conditions = qt.idealConditions;

    // Check energy
    if (conditions.minEnergy && currentConditions.energy < conditions.minEnergy) continue;

    // Check calendar pressure
    if (conditions.maxCalendarPressure && currentConditions.calendarPressure) {
      const pressureRank: Record<CalendarPressure, number> = { light: 0, moderate: 1, heavy: 2 };
      if (
        pressureRank[currentConditions.calendarPressure] >
        pressureRank[conditions.maxCalendarPressure]
      ) {
        continue;
      }
    }

    // Check avoided times
    if (conditions.avoidDaysOfWeek?.includes(currentDay)) continue;
    if (conditions.avoidHoursOfDay?.includes(currentHour)) continue;

    // Check required mood
    if (conditions.requiredMood && currentConditions.mood) {
      if (!conditions.requiredMood.includes(currentConditions.mood)) continue;
    }

    readyTopics.push(qt.topic);
  }

  return readyTopics;
}

/**
 * Mark a topic as surfaced.
 */
export function markTopicSurfaced(userId: string, topic: string, wasEffective: boolean): void {
  const profile = profiles.get(userId);
  if (!profile) return;

  const qt = profile.queuedTopics.find((t) => t.topic === topic);
  if (qt) {
    qt.surfacedAt = new Date();
    qt.wasEffective = wasEffective;
  }
}

// ============================================================================
// TIMING RECOMMENDATIONS
// ============================================================================

/**
 * Check if now is a good time for a specific type of conversation.
 */
export function isGoodTimeFor(
  userId: string,
  conversationType: ConversationType
): {
  isGood: boolean;
  confidence: number;
  reason: string;
  betterTime?: string;
} {
  const profile = profiles.get(userId);
  const now = new Date();
  const currentHour = now.getHours();
  const currentDay = now.getDay();

  // If we don't have data, default to "yes with low confidence"
  if (!profile || Object.keys(profile.energyByHour).length < 5) {
    return {
      isGood: true,
      confidence: 0.3,
      reason: "Not enough data to predict - let's learn from this conversation",
    };
  }

  // Get relevant windows
  const windows = profile.optimalWindows[
    conversationType === 'deep'
      ? 'deepConversations'
      : conversationType === 'gentle'
        ? 'gentleCheckIns'
        : conversationType === 'challenging'
          ? 'challengingTopics'
          : 'celebrations'
  ];

  // Check if current time is in a good window
  const matchingWindow = windows.find(
    (w) => w.dayOfWeek === currentDay && currentHour >= w.startHour && currentHour < w.endHour
  );

  if (matchingWindow) {
    return {
      isGood: true,
      confidence: matchingWindow.confidence,
      reason: 'This is typically a good time for this type of conversation',
    };
  }

  // Not in a good window - find when would be better
  const betterWindow = windows[0];
  if (betterWindow) {
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return {
      isGood: false,
      confidence: betterWindow.confidence,
      reason: 'This may not be the best time',
      betterTime: `${dayNames[betterWindow.dayOfWeek]} around ${betterWindow.startHour}:00`,
    };
  }

  return {
    isGood: true,
    confidence: 0.4,
    reason: 'No strong patterns detected yet',
  };
}

// ============================================================================
// CONTEXT BUILDING
// ============================================================================

/**
 * Build context for LLM injection.
 */
export function buildTimingContext(userId: string, currentReceptivity?: ReceptivityScore): string {
  const profile = profiles.get(userId);
  const sections: string[] = ['[PERFECT TIMING INTELLIGENCE]'];

  // Current receptivity
  if (currentReceptivity) {
    sections.push(`Current receptivity: ${currentReceptivity.interpretation}`);
    sections.push(`Score: ${(currentReceptivity.score * 100).toFixed(0)}%`);

    if (currentReceptivity.recommendations.perfectForDeep) {
      sections.push('✨ Perfect moment for deep conversation');
    } else if (currentReceptivity.recommendations.keepItLight) {
      sections.push('💡 Keep it light - they seem busy or tired');
    } else if (currentReceptivity.recommendations.shouldOfferSupport) {
      sections.push('🤗 They may need support - notice stress signals');
    }
    sections.push('');
  }

  if (!profile) {
    sections.push('No timing data yet. Learning from this conversation.');
    return sections.join('\n');
  }

  // Queued topics
  const waitingTopics = profile.queuedTopics.filter((t) => !t.surfacedAt);
  if (waitingTopics.length > 0) {
    sections.push('Topics waiting for right moment:');
    for (const topic of waitingTopics.slice(0, 3)) {
      const daysWaiting = Math.floor(
        (Date.now() - new Date(topic.queuedAt).getTime()) / (24 * 60 * 60 * 1000)
      );
      sections.push(`- "${topic.topic}" (waiting ${daysWaiting} days)`);
      sections.push(`  Reason: ${topic.reason}`);
    }
    sections.push('');
  }

  // Best times
  if (profile.optimalWindows.deepConversations.length > 0) {
    const best = profile.optimalWindows.deepConversations[0];
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    sections.push(
      `Best time for deep conversations: ${dayNames[best.dayOfWeek]} ${best.startHour}:00-${best.endHour}:00`
    );
  }

  sections.push('');
  sections.push('Consider timing carefully. Surface queued topics only when conditions are right.');

  return sections.join('\n');
}

// ============================================================================
// PERSISTENCE
// ============================================================================

async function saveTimingProfile(userId: string, profile: TimingIntelligence): Promise<void> {
  const db = getFirestoreDb();
  if (!db) return;

  try {
    await db
      .collection('bogle_users')
      .doc(userId)
      .collection('timing_intelligence')
      .doc('profile')
      .set(profile);
  } catch (error) {
    log.debug({ error: String(error), userId }, 'Failed to save timing profile');
  }
}

export async function loadTimingProfile(userId: string): Promise<TimingIntelligence | null> {
  const db = getFirestoreDb();
  if (!db) return null;

  try {
    const doc = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('timing_intelligence')
      .doc('profile')
      .get();

    if (doc.exists) {
      const profile = doc.data() as TimingIntelligence;
      profiles.set(userId, profile);
      return profile;
    }
    return null;
  } catch (error) {
    log.debug({ error: String(error), userId }, 'Failed to load timing profile');
    return null;
  }
}

/**
 * Get timing profile from memory.
 */
export function getTimingProfile(userId: string): TimingIntelligence | null {
  return profiles.get(userId) || null;
}

// ============================================================================
// EXPORT
// ============================================================================

export const perfectTiming = {
  detectReceptivity,
  recordTimingLearning,
  queueTopicForRightMoment,
  getTopicsForNow,
  markTopicSurfaced,
  isGoodTimeFor,
  buildTimingContext,
  loadTimingProfile,
  getTimingProfile,
};

export default perfectTiming;

