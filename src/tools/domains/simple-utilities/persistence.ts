/**
 * Firestore Persistence for Simple Utilities
 * 
 * Cross-session memory for utility patterns and preferences.
 * Ferni remembers your usual timer, tip percentage, and tracked countdowns
 * even after you close the app.
 * 
 * STORAGE STRUCTURE:
 * bogle_users/{userId}/utility_preferences/patterns
 * bogle_users/{userId}/utility_preferences/countdowns
 * bogle_users/{userId}/utility_preferences/history
 */

import { getLogger } from '../../../utils/safe-logger.js';

// ============================================================================
// TYPES
// ============================================================================

export interface PersistedUtilityPreferences {
  // Timer preferences
  timers: {
    usual: Array<{
      minutes: number;
      label: string;
      timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night';
      count: number;
    }>;
    defaultDuration?: number;
  };
  
  // Tip preferences
  tips: {
    defaultPercent: number;
    averagePercent: number;
    totalCalculations: number;
  };
  
  // Timezone preferences
  timezones: {
    frequentCities: Array<{
      city: string;
      count: number;
      lastChecked: string; // ISO date
    }>;
    homeTimezone?: string;
  };
  
  // Decision patterns
  decisions: {
    coinFlipsTotal: number;
    commonDecisionTopics: string[];
  };
  
  // Conversion preferences
  conversions: {
    frequentPairs: Array<{
      from: string;
      to: string;
      count: number;
    }>;
    preferMetric: boolean;
  };
  
  // Tracked countdowns
  countdowns: Array<{
    event: string;
    targetDate: string; // ISO date
    checksCount: number;
    notifyMilestones: boolean;
    created: string; // ISO date
  }>;
  
  // Metadata
  lastUpdated: string; // ISO date
  version: number;
}

// Default preferences
const DEFAULT_PREFERENCES: PersistedUtilityPreferences = {
  timers: { usual: [] },
  tips: { defaultPercent: 20, averagePercent: 20, totalCalculations: 0 },
  timezones: { frequentCities: [] },
  decisions: { coinFlipsTotal: 0, commonDecisionTopics: [] },
  conversions: { frequentPairs: [], preferMetric: false },
  countdowns: [],
  lastUpdated: new Date().toISOString(),
  version: 1,
};

// ============================================================================
// FIRESTORE INTEGRATION
// ============================================================================

// Lazy-loaded Firestore (to avoid circular deps)
let firestoreDb: FirebaseFirestore.Firestore | null = null;

async function getFirestore(): Promise<FirebaseFirestore.Firestore | null> {
  if (firestoreDb) return firestoreDb;
  
  try {
    const { getFirestore: getFs } = await import('firebase-admin/firestore');
    firestoreDb = getFs();
    return firestoreDb;
  } catch (err) {
    getLogger().warn({ err }, 'Firestore not available for utility persistence');
    return null;
  }
}

// ============================================================================
// PERSISTENCE FUNCTIONS
// ============================================================================

/**
 * Load user's utility preferences from Firestore
 */
export async function loadUtilityPreferences(userId: string): Promise<PersistedUtilityPreferences> {
  const db = await getFirestore();
  if (!db) {
    getLogger().debug('Firestore not available, using defaults');
    return { ...DEFAULT_PREFERENCES };
  }
  
  try {
    const doc = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('utility_preferences')
      .doc('patterns')
      .get();
    
    if (!doc.exists) {
      getLogger().debug({ userId }, 'No utility preferences found, using defaults');
      return { ...DEFAULT_PREFERENCES };
    }
    
    const data = doc.data() as PersistedUtilityPreferences;
    getLogger().debug({ userId, version: data.version }, 'Loaded utility preferences');
    
    return {
      ...DEFAULT_PREFERENCES,
      ...data,
    };
  } catch (err) {
    getLogger().error({ err, userId }, 'Failed to load utility preferences');
    return { ...DEFAULT_PREFERENCES };
  }
}

/**
 * Save user's utility preferences to Firestore
 */
export async function saveUtilityPreferences(
  userId: string,
  preferences: Partial<PersistedUtilityPreferences>
): Promise<void> {
  const db = await getFirestore();
  if (!db) {
    getLogger().debug('Firestore not available, skipping save');
    return;
  }
  
  try {
    const docRef = db
      .collection('bogle_users')
      .doc(userId)
      .collection('utility_preferences')
      .doc('patterns');
    
    await docRef.set(
      {
        ...preferences,
        lastUpdated: new Date().toISOString(),
        version: 1,
      },
      { merge: true }
    );
    
    getLogger().debug({ userId }, 'Saved utility preferences');
  } catch (err) {
    getLogger().error({ err, userId }, 'Failed to save utility preferences');
  }
}

/**
 * Update specific timer preferences
 */
export async function updateTimerPreferences(
  userId: string,
  timerData: {
    minutes: number;
    label?: string;
    timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night';
  }
): Promise<void> {
  const prefs = await loadUtilityPreferences(userId);
  
  // Find or create timer entry
  const existing = prefs.timers.usual.find(
    t => Math.abs(t.minutes - timerData.minutes) < 0.5 &&
         t.timeOfDay === timerData.timeOfDay
  );
  
  if (existing) {
    existing.count++;
    if (timerData.label) existing.label = timerData.label;
  } else {
    prefs.timers.usual.push({
      minutes: timerData.minutes,
      label: timerData.label || 'Timer',
      timeOfDay: timerData.timeOfDay,
      count: 1,
    });
  }
  
  // Keep top 5 most used timers
  prefs.timers.usual.sort((a, b) => b.count - a.count);
  prefs.timers.usual = prefs.timers.usual.slice(0, 5);
  
  // Update default if one is clearly preferred
  const mostUsed = prefs.timers.usual[0];
  if (mostUsed && mostUsed.count >= 5) {
    prefs.timers.defaultDuration = mostUsed.minutes;
  }
  
  await saveUtilityPreferences(userId, { timers: prefs.timers });
}

/**
 * Update tip preferences
 */
export async function updateTipPreferences(
  userId: string,
  tipPercent: number
): Promise<void> {
  const prefs = await loadUtilityPreferences(userId);
  
  // Update running average
  const oldAvg = prefs.tips.averagePercent;
  const count = prefs.tips.totalCalculations;
  prefs.tips.averagePercent = (oldAvg * count + tipPercent) / (count + 1);
  prefs.tips.totalCalculations++;
  
  // Update default to nearest 5% if consistent
  if (count >= 5) {
    prefs.tips.defaultPercent = Math.round(prefs.tips.averagePercent / 5) * 5;
  }
  
  await saveUtilityPreferences(userId, { tips: prefs.tips });
}

/**
 * Update timezone preferences
 */
export async function updateTimezonePreferences(
  userId: string,
  city: string
): Promise<void> {
  const prefs = await loadUtilityPreferences(userId);
  const cityLower = city.toLowerCase();
  
  const existing = prefs.timezones.frequentCities.find(
    c => c.city.toLowerCase() === cityLower
  );
  
  if (existing) {
    existing.count++;
    existing.lastChecked = new Date().toISOString();
  } else {
    prefs.timezones.frequentCities.push({
      city: cityLower,
      count: 1,
      lastChecked: new Date().toISOString(),
    });
  }
  
  // Keep top 10 cities
  prefs.timezones.frequentCities.sort((a, b) => b.count - a.count);
  prefs.timezones.frequentCities = prefs.timezones.frequentCities.slice(0, 10);
  
  await saveUtilityPreferences(userId, { timezones: prefs.timezones });
}

/**
 * Add or update a tracked countdown
 */
export async function trackCountdown(
  userId: string,
  event: string,
  targetDate: Date,
  notifyMilestones: boolean = true
): Promise<void> {
  const prefs = await loadUtilityPreferences(userId);
  
  const existing = prefs.countdowns.find(
    c => c.event.toLowerCase() === event.toLowerCase()
  );
  
  if (existing) {
    existing.checksCount++;
    existing.targetDate = targetDate.toISOString();
    existing.notifyMilestones = notifyMilestones;
  } else {
    prefs.countdowns.push({
      event,
      targetDate: targetDate.toISOString(),
      checksCount: 1,
      notifyMilestones,
      created: new Date().toISOString(),
    });
  }
  
  // Keep top 20 countdowns, remove past events
  const now = new Date();
  prefs.countdowns = prefs.countdowns
    .filter(c => new Date(c.targetDate) > now)
    .sort((a, b) => b.checksCount - a.checksCount)
    .slice(0, 20);
  
  await saveUtilityPreferences(userId, { countdowns: prefs.countdowns });
}

/**
 * Get countdowns that have upcoming milestones
 */
export async function getUpcomingMilestones(
  userId: string
): Promise<Array<{ event: string; daysRemaining: number; targetDate: Date }>> {
  const prefs = await loadUtilityPreferences(userId);
  const now = new Date();
  const milestones: Array<{ event: string; daysRemaining: number; targetDate: Date }> = [];
  
  const milestoneDays = [0, 1, 7, 30, 100]; // TODAY, tomorrow, 1 week, 1 month, 100 days
  
  for (const countdown of prefs.countdowns) {
    if (!countdown.notifyMilestones) continue;
    
    const target = new Date(countdown.targetDate);
    const diffMs = target.getTime() - now.getTime();
    const daysRemaining = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    
    if (milestoneDays.includes(daysRemaining)) {
      milestones.push({
        event: countdown.event,
        daysRemaining,
        targetDate: target,
      });
    }
  }
  
  return milestones;
}

/**
 * Increment decision counter
 */
export async function incrementDecisionCount(
  userId: string,
  type: 'coinFlip' | 'dice' | 'random',
  topics?: string[]
): Promise<number> {
  const prefs = await loadUtilityPreferences(userId);
  
  if (type === 'coinFlip') {
    prefs.decisions.coinFlipsTotal++;
  }
  
  if (topics) {
    for (const topic of topics) {
      if (!prefs.decisions.commonDecisionTopics.includes(topic)) {
        prefs.decisions.commonDecisionTopics.push(topic);
      }
    }
    // Keep last 20 topics
    prefs.decisions.commonDecisionTopics = prefs.decisions.commonDecisionTopics.slice(-20);
  }
  
  await saveUtilityPreferences(userId, { decisions: prefs.decisions });
  
  return prefs.decisions.coinFlipsTotal;
}

// ============================================================================
// SYNC WITH IN-MEMORY PATTERNS
// ============================================================================

import type { UserUtilityPatterns } from './pattern-intelligence.js';

/**
 * Sync in-memory patterns to Firestore
 */
export async function syncPatternsToFirestore(
  userId: string,
  patterns: UserUtilityPatterns
): Promise<void> {
  const hour = new Date().getHours();
  const timeOfDay = hour >= 5 && hour < 12 ? 'morning' 
    : hour >= 12 && hour < 17 ? 'afternoon'
    : hour >= 17 && hour < 21 ? 'evening' 
    : 'night';
  
  const updates: Partial<PersistedUtilityPreferences> = {
    timers: {
      usual: patterns.patterns.commonTimerDurations.map(t => ({
        minutes: t.minutes,
        label: t.label || 'Timer',
        timeOfDay: (t.usualTime || timeOfDay) as 'morning' | 'afternoon' | 'evening' | 'night',
        count: t.count,
      })),
      defaultDuration: patterns.preferences.usualTimerDuration,
    },
    tips: {
      defaultPercent: patterns.preferences.defaultTipPercent || 20,
      averagePercent: patterns.patterns.averageTipPercent,
      totalCalculations: patterns.patterns.tipCount,
    },
    timezones: {
      frequentCities: patterns.patterns.frequentCities.map(c => ({
        city: c.city,
        count: c.count,
        lastChecked: c.lastChecked.toISOString(),
      })),
    },
    decisions: {
      coinFlipsTotal: patterns.patterns.coinFlipsThisWeek,
      commonDecisionTopics: patterns.patterns.recentDecisionTopics,
    },
    conversions: {
      frequentPairs: patterns.patterns.frequentConversions,
      preferMetric: false, // Could be learned
    },
  };
  
  await saveUtilityPreferences(userId, updates);
}

/**
 * Load Firestore preferences into in-memory patterns
 */
export async function loadPatternsFromFirestore(
  userId: string
): Promise<Partial<UserUtilityPatterns['patterns']> & { preferences: Partial<UserUtilityPatterns['preferences']> }> {
  const prefs = await loadUtilityPreferences(userId);
  
  return {
    commonTimerDurations: prefs.timers.usual.map(t => ({
      minutes: t.minutes,
      label: t.label,
      usualTime: t.timeOfDay,
      count: t.count,
    })),
    averageTipPercent: prefs.tips.averagePercent,
    tipCount: prefs.tips.totalCalculations,
    frequentCities: prefs.timezones.frequentCities.map(c => ({
      city: c.city,
      count: c.count,
      lastChecked: new Date(c.lastChecked),
    })),
    coinFlipsThisWeek: prefs.decisions.coinFlipsTotal, // Approximation
    coinFlipsToday: 0, // Reset daily
    recentDecisionTopics: prefs.decisions.commonDecisionTopics,
    frequentConversions: prefs.conversions.frequentPairs,
    countdownsTracked: prefs.countdowns.map(c => ({
      event: c.event,
      targetDate: new Date(c.targetDate),
      checksCount: c.checksCount,
    })),
    preferences: {
      usualTimerDuration: prefs.timers.defaultDuration,
      defaultTipPercent: prefs.tips.defaultPercent,
    },
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  loadUtilityPreferences,
  saveUtilityPreferences,
  updateTimerPreferences,
  updateTipPreferences,
  updateTimezonePreferences,
  trackCountdown,
  getUpcomingMilestones,
  incrementDecisionCount,
  syncPatternsToFirestore,
  loadPatternsFromFirestore,
};

