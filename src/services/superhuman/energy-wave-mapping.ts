/**
 * Energy Wave Mapping - Better Than Human Timing Intelligence
 *
 * Maps when users are most receptive to different types of interactions:
 * - Peak times for deep conversations
 * - Best times for practical planning
 * - When they're most open to vulnerability
 * - Energy patterns throughout the day/week
 *
 * WHY IT'S SUPERHUMAN: Ferni knows to save heavy conversations for
 * Sunday mornings (when you're reflective) vs Friday nights (when you want light chat).
 *
 * @module services/superhuman/energy-wave-mapping
 */

import { createLogger } from '../../utils/safe-logger.js';
import { getFirestoreDb, cleanForFirestore } from './firestore-utils.js';

const log = createLogger({ module: 'EnergyWaveMapping' });

// ============================================================================
// TYPES
// ============================================================================

export type ConversationType =
  | 'deep_emotional' // Heavy topics, vulnerability
  | 'practical_planning' // Goals, tasks, logistics
  | 'light_chat' // Casual, fun conversation
  | 'problem_solving' // Complex thinking
  | 'creative' // Brainstorming, ideas
  | 'reflective' // Looking back, processing
  | 'motivational' // Energy, encouragement
  | 'learning'; // New information

export type EnergyLevel = 'high' | 'medium' | 'low' | 'variable';

export interface ConversationInteraction {
  userId: string;
  type: ConversationType;
  dayOfWeek: number; // 0-6
  hourOfDay: number; // 0-23
  engagement: number; // 0-1 how engaged they were
  depth: number; // 0-1 how deep the conversation went
  outcome: 'positive' | 'neutral' | 'negative';
  timestamp: number;
}

export interface TimeSlot {
  dayOfWeek: number;
  hourStart: number;
  hourEnd: number;
}

export interface EnergyWaveProfile {
  userId: string;
  /** Best times for each conversation type */
  optimalTimes: Record<ConversationType, TimeSlot[]>;
  /** Times to avoid heavy topics */
  lowEnergyTimes: TimeSlot[];
  /** General energy pattern */
  dailyPattern: {
    peakHours: number[];
    lowHours: number[];
  };
  /** Weekly pattern */
  weeklyPattern: {
    highEnergyDays: number[];
    lowEnergyDays: number[];
  };
  /** Last updated */
  lastUpdated: number;
}

export interface TimingRecommendation {
  conversationType: ConversationType;
  isGoodTime: boolean;
  confidence: number;
  reason: string;
  betterTimes?: string[];
}

// ============================================================================
// CONSTANTS
// ============================================================================

const DEFAULT_OPTIMAL_TIMES: Record<ConversationType, TimeSlot[]> = {
  deep_emotional: [
    { dayOfWeek: 0, hourStart: 9, hourEnd: 12 }, // Sunday morning
    { dayOfWeek: 6, hourStart: 10, hourEnd: 13 }, // Saturday morning
  ],
  practical_planning: [
    { dayOfWeek: 1, hourStart: 9, hourEnd: 11 }, // Monday morning
    { dayOfWeek: 0, hourStart: 18, hourEnd: 20 }, // Sunday evening
  ],
  light_chat: [
    { dayOfWeek: 5, hourStart: 17, hourEnd: 22 }, // Friday evening
    { dayOfWeek: 6, hourStart: 18, hourEnd: 22 }, // Saturday evening
  ],
  problem_solving: [
    { dayOfWeek: 2, hourStart: 10, hourEnd: 12 }, // Tuesday morning
    { dayOfWeek: 3, hourStart: 10, hourEnd: 12 }, // Wednesday morning
  ],
  creative: [
    { dayOfWeek: 0, hourStart: 10, hourEnd: 14 }, // Sunday midday
    { dayOfWeek: 6, hourStart: 10, hourEnd: 14 }, // Saturday midday
  ],
  reflective: [
    { dayOfWeek: 0, hourStart: 8, hourEnd: 11 }, // Sunday morning
    { dayOfWeek: 0, hourStart: 20, hourEnd: 23 }, // Sunday evening
  ],
  motivational: [
    { dayOfWeek: 1, hourStart: 7, hourEnd: 9 }, // Monday morning
    { dayOfWeek: 0, hourStart: 19, hourEnd: 21 }, // Sunday evening
  ],
  learning: [
    { dayOfWeek: 6, hourStart: 10, hourEnd: 14 }, // Saturday midday
    { dayOfWeek: 0, hourStart: 14, hourEnd: 17 }, // Sunday afternoon
  ],
};

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// ============================================================================
// PERSISTENCE
// ============================================================================

/**
 * Record a conversation interaction for pattern learning.
 */
export async function recordInteraction(
  userId: string,
  type: ConversationType,
  engagement: number,
  depth: number,
  outcome: 'positive' | 'neutral' | 'negative'
): Promise<void> {
  const db = getFirestoreDb();
  if (!db) return;

  const now = new Date();
  const interaction: ConversationInteraction = {
    userId,
    type,
    dayOfWeek: now.getDay(),
    hourOfDay: now.getHours(),
    engagement: Math.max(0, Math.min(1, engagement)),
    depth: Math.max(0, Math.min(1, depth)),
    outcome,
    timestamp: Date.now(),
  };

  try {
    await db
      .collection('bogle_users')
      .doc(userId)
      .collection('energy_interactions')
      .add(cleanForFirestore(interaction));

    log.debug({ userId, type, hourOfDay: interaction.hourOfDay }, 'Recorded energy interaction');
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to record interaction');
  }
}

/**
 * Load interaction history.
 */
export async function loadInteractions(
  userId: string,
  daysBack = 90
): Promise<ConversationInteraction[]> {
  const db = getFirestoreDb();
  if (!db) return [];

  try {
    const cutoff = Date.now() - daysBack * 24 * 60 * 60 * 1000;
    const snapshot = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('energy_interactions')
      .where('timestamp', '>', cutoff)
      .orderBy('timestamp', 'desc')
      .limit(500)
      .get();

    return snapshot.docs.map((doc) => doc.data() as ConversationInteraction);
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to load interactions');
    return [];
  }
}

// ============================================================================
// PATTERN ANALYSIS
// ============================================================================

/**
 * Analyze interactions to build energy wave profile.
 */
export function analyzeEnergyPatterns(
  interactions: ConversationInteraction[]
): EnergyWaveProfile | null {
  if (interactions.length < 10) return null;

  const userId = interactions[0].userId;

  // Group by conversation type and time
  const byTypeAndTime = new Map<string, ConversationInteraction[]>();
  for (const interaction of interactions) {
    const key = `${interaction.type}-${interaction.dayOfWeek}-${Math.floor(interaction.hourOfDay / 3)}`;
    const existing = byTypeAndTime.get(key) || [];
    existing.push(interaction);
    byTypeAndTime.set(key, existing);
  }

  // Find optimal times for each type
  const optimalTimes: Record<ConversationType, TimeSlot[]> = {} as Record<
    ConversationType,
    TimeSlot[]
  >;

  const types: ConversationType[] = [
    'deep_emotional',
    'practical_planning',
    'light_chat',
    'problem_solving',
    'creative',
    'reflective',
    'motivational',
    'learning',
  ];

  for (const type of types) {
    const typeInteractions = interactions.filter((i) => i.type === type);
    if (typeInteractions.length < 3) {
      optimalTimes[type] = DEFAULT_OPTIMAL_TIMES[type];
      continue;
    }

    // Find best time slots
    const timeScores = new Map<string, { total: number; count: number }>();

    for (const interaction of typeInteractions) {
      const hourBlock = Math.floor(interaction.hourOfDay / 3) * 3;
      const key = `${interaction.dayOfWeek}-${hourBlock}`;
      const score =
        interaction.engagement * 0.4 +
        interaction.depth * 0.3 +
        (interaction.outcome === 'positive' ? 0.3 : interaction.outcome === 'neutral' ? 0.15 : 0);

      const existing = timeScores.get(key) || { total: 0, count: 0 };
      existing.total += score;
      existing.count++;
      timeScores.set(key, existing);
    }

    // Sort by average score
    const sorted = Array.from(timeScores.entries())
      .map(([key, data]) => ({
        key,
        avgScore: data.total / data.count,
        count: data.count,
      }))
      .filter((x) => x.count >= 2)
      .sort((a, b) => b.avgScore - a.avgScore);

    // Take top 2 time slots
    optimalTimes[type] = sorted.slice(0, 2).map((slot) => {
      const [day, hour] = slot.key.split('-').map(Number);
      return {
        dayOfWeek: day,
        hourStart: hour,
        hourEnd: hour + 3,
      };
    });

    if (optimalTimes[type].length === 0) {
      optimalTimes[type] = DEFAULT_OPTIMAL_TIMES[type];
    }
  }

  // Find general low energy times
  const allScores = new Map<string, number[]>();
  for (const interaction of interactions) {
    const hourBlock = Math.floor(interaction.hourOfDay / 3) * 3;
    const key = `${interaction.dayOfWeek}-${hourBlock}`;
    const score = interaction.engagement;

    const existing = allScores.get(key) || [];
    existing.push(score);
    allScores.set(key, existing);
  }

  const lowEnergyTimes: TimeSlot[] = [];
  for (const [key, scores] of allScores.entries()) {
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    if (avg < 0.4 && scores.length >= 3) {
      const [day, hour] = key.split('-').map(Number);
      lowEnergyTimes.push({ dayOfWeek: day, hourStart: hour, hourEnd: hour + 3 });
    }
  }

  // Daily pattern
  const hourScores = new Map<number, number[]>();
  for (const interaction of interactions) {
    const existing = hourScores.get(interaction.hourOfDay) || [];
    existing.push(interaction.engagement);
    hourScores.set(interaction.hourOfDay, existing);
  }

  const peakHours: number[] = [];
  const lowHours: number[] = [];
  for (const [hour, scores] of hourScores.entries()) {
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    if (avg > 0.7) peakHours.push(hour);
    if (avg < 0.4) lowHours.push(hour);
  }

  // Weekly pattern
  const dayScores = new Map<number, number[]>();
  for (const interaction of interactions) {
    const existing = dayScores.get(interaction.dayOfWeek) || [];
    existing.push(interaction.engagement);
    dayScores.set(interaction.dayOfWeek, existing);
  }

  const highEnergyDays: number[] = [];
  const lowEnergyDays: number[] = [];
  for (const [day, scores] of dayScores.entries()) {
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    if (avg > 0.65) highEnergyDays.push(day);
    if (avg < 0.45) lowEnergyDays.push(day);
  }

  return {
    userId,
    optimalTimes,
    lowEnergyTimes,
    dailyPattern: { peakHours, lowHours },
    weeklyPattern: { highEnergyDays, lowEnergyDays },
    lastUpdated: Date.now(),
  };
}

// ============================================================================
// TIMING RECOMMENDATIONS
// ============================================================================

/**
 * Get timing recommendation for a conversation type.
 */
export function getTimingRecommendation(
  conversationType: ConversationType,
  profile: EnergyWaveProfile | null
): TimingRecommendation {
  const now = new Date();
  const currentDay = now.getDay();
  const currentHour = now.getHours();

  // Use default if no profile
  const optimalSlots =
    profile?.optimalTimes[conversationType] || DEFAULT_OPTIMAL_TIMES[conversationType];

  // Check if current time is optimal
  const isInOptimalSlot = optimalSlots.some(
    (slot) =>
      slot.dayOfWeek === currentDay && currentHour >= slot.hourStart && currentHour < slot.hourEnd
  );

  // Check if in low energy time
  const isLowEnergy =
    profile?.lowEnergyTimes.some(
      (slot) =>
        slot.dayOfWeek === currentDay && currentHour >= slot.hourStart && currentHour < slot.hourEnd
    ) ?? false;

  if (isInOptimalSlot && !isLowEnergy) {
    return {
      conversationType,
      isGoodTime: true,
      confidence: profile ? 0.8 : 0.5,
      reason: 'This is typically a good time for this type of conversation',
    };
  }

  if (isLowEnergy) {
    const betterTimes = optimalSlots.map(
      (slot) => `${DAY_NAMES[slot.dayOfWeek]} ${slot.hourStart}:00-${slot.hourEnd}:00`
    );

    return {
      conversationType,
      isGoodTime: false,
      confidence: profile ? 0.7 : 0.4,
      reason: 'This tends to be a lower energy time',
      betterTimes,
    };
  }

  return {
    conversationType,
    isGoodTime: true,
    confidence: 0.5,
    reason: 'This time should work fine',
  };
}

// ============================================================================
// CONTEXT BUILDING
// ============================================================================

/**
 * Build context for LLM injection.
 */
export async function buildEnergyWaveContext(userId: string): Promise<string> {
  const interactions = await loadInteractions(userId, 60);
  const profile = analyzeEnergyPatterns(interactions);

  if (!profile) {
    return '';
  }

  const now = new Date();
  const currentDay = now.getDay();
  const currentHour = now.getHours();

  const sections: string[] = [];

  // Check current energy state
  const isLowEnergy = profile.lowEnergyTimes.some(
    (slot) =>
      slot.dayOfWeek === currentDay && currentHour >= slot.hourStart && currentHour < slot.hourEnd
  );

  const isPeakEnergy =
    profile.dailyPattern.peakHours.includes(currentHour) &&
    profile.weeklyPattern.highEnergyDays.includes(currentDay);

  if (isLowEnergy) {
    sections.push('[ENERGY AWARENESS]');
    sections.push(
      `⚡ This tends to be a lower energy time for this person.\n` +
        `Keep conversation lighter. Save deep topics for their better times.`
    );

    // Suggest better times for heavy topics
    const deepSlots = profile.optimalTimes.deep_emotional;
    if (deepSlots.length > 0) {
      const suggestion = `${DAY_NAMES[deepSlots[0].dayOfWeek]} ${deepSlots[0].hourStart}:00`;
      sections.push(`💡 Better time for deep conversations: ${suggestion}`);
    }
  } else if (isPeakEnergy) {
    sections.push('[ENERGY AWARENESS]');
    sections.push(
      `🌟 This is typically a high-energy time for this person.\n` +
        `Good window for deeper conversations or challenging topics if needed.`
    );
  }

  // Add weekly context on Sundays
  if (currentDay === 0) {
    const reflectiveSlots = profile.optimalTimes.reflective;
    const inReflectiveTime = reflectiveSlots.some(
      (slot) => currentHour >= slot.hourStart && currentHour < slot.hourEnd
    );

    if (inReflectiveTime) {
      sections.push(
        `\n📅 Sunday reflection window: This is when they're most open to ` +
          `looking back on the week and processing experiences.`
      );
    }
  }

  return sections.join('\n');
}

// ============================================================================
// EXPORTS
// ============================================================================

export const energyWaveMapping = {
  record: recordInteraction,
  load: loadInteractions,
  analyze: analyzeEnergyPatterns,
  getRecommendation: getTimingRecommendation,
  buildContext: buildEnergyWaveContext,
};
