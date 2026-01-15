/**
 * Event Intelligence Services
 *
 * "Better Than Human" persistence layer for event planning capabilities.
 * These services provide the superhuman memory that makes event planning transcendent.
 *
 * SERVICES:
 *   1. Event Pattern Memory - Patterns across all events
 *   2. Guest Intelligence - Permanent guest profiles
 *   3. Milestone Detection - Find forgotten celebrations
 *   4. Event Story Capture - What events MEANT
 *   5. Celebration Balance - Track joy gaps
 *   6. Anticipatory Sense - See transitions coming
 *   7. Planning Readiness - Cross-team assessment
 *
 * FIRESTORE COLLECTIONS:
 *   bogle_users/{userId}/event_patterns
 *   bogle_users/{userId}/guest_profiles
 *   bogle_users/{userId}/detected_milestones
 *   bogle_users/{userId}/event_meanings
 *   bogle_users/{userId}/celebrations
 *   bogle_users/{userId}/transition_signals
 */

import { createLogger } from '../../utils/safe-logger.js';
import { getFirestoreDb } from './firestore-utils.js';

const log = createLogger({ module: 'superhuman:event-intelligence' });

// ============================================================================
// TYPES
// ============================================================================

export interface EventPattern {
  eventType: string;
  patternType: string;
  eventName: string;
  pattern: string;
  lesson?: string;
  recordedAt: string;
}

export interface GuestProfile {
  name: string;
  dietary?: string;
  accessibility?: string;
  note?: string;
  avoidSeatingWith?: string[];
  attendanceHistory?: string[];
  updatedAt: string;
}

export interface DetectedMilestone {
  type: string;
  description: string;
  date: string;
  recurring: boolean;
  recordedAt: string;
}

export interface EventMeaning {
  eventName: string;
  meaning?: string;
  memorableMoment?: string;
  lessonLearned?: string;
  recordedAt: string;
}

export interface Celebration {
  what: string;
  forWhom: 'self' | 'other' | 'both';
  size: 'micro' | 'small' | 'medium' | 'large';
  recordedAt: string;
}

export interface CelebrationBalance {
  total: number;
  forSelf: number;
  forOthers: number;
  bySize: {
    micro: number;
    small: number;
    medium: number;
    large: number;
  };
}

export interface TransitionSignal {
  type: string;
  signal: string;
  strength: 'weak' | 'moderate' | 'strong';
  recordedAt: string;
}

export interface AnticipatedTransition {
  type: string;
  signals: string[];
  strength: 'weak' | 'moderate' | 'strong';
  signalCount: number;
  lastSignalAt: string;
}

export interface PlanningReadiness {
  overall: 'green' | 'yellow' | 'red';
  financial: 'green' | 'yellow' | 'red';
  calendar: 'green' | 'yellow' | 'red';
  energy: 'green' | 'yellow' | 'red';
  emotional: 'green' | 'yellow' | 'red';
  concerns: string[];
  suggestions: string[];
}

// ============================================================================
// EVENT PATTERN SERVICE
// ============================================================================

export async function recordEventPattern(userId: string, pattern: EventPattern): Promise<void> {
  const db = getFirestoreDb();
  if (!db) {
    log.debug({ userId }, 'No Firestore - skipping event pattern recording');
    return;
  }

  try {
    await db.collection('bogle_users').doc(userId).collection('event_patterns').add(pattern);
    log.info({ userId, eventType: pattern.eventType }, 'Event pattern recorded');
  } catch (error) {
    log.debug({ error, userId }, 'Failed to record event pattern');
  }
}

export async function getEventPatterns(
  userId: string,
  eventType?: string,
  patternType?: string
): Promise<EventPattern[]> {
  const db = getFirestoreDb();
  if (!db) return [];

  try {
    let query = db.collection('bogle_users').doc(userId).collection('event_patterns');

    if (eventType) {
      query = query.where('eventType', '==', eventType) as typeof query;
    }
    if (patternType && patternType !== 'all') {
      query = query.where('patternType', '==', patternType) as typeof query;
    }

    const snapshot = await query.orderBy('recordedAt', 'desc').limit(50).get();
    return snapshot.docs.map((doc) => doc.data() as EventPattern);
  } catch (error) {
    log.debug({ error, userId }, 'Failed to get event patterns');
    return [];
  }
}

// ============================================================================
// GUEST INTELLIGENCE SERVICE
// ============================================================================

export async function recordGuestProfile(userId: string, guest: GuestProfile): Promise<void> {
  const db = getFirestoreDb();
  if (!db) {
    log.debug({ userId }, 'No Firestore - skipping guest profile recording');
    return;
  }

  try {
    // Use guest name as document ID for easy lookup/update
    const docRef = db
      .collection('bogle_users')
      .doc(userId)
      .collection('guest_profiles')
      .doc(guest.name.toLowerCase().replace(/\s+/g, '-'));

    await docRef.set(guest, { merge: true });
    log.info({ userId, guestName: guest.name }, 'Guest profile recorded');
  } catch (error) {
    log.debug({ error, userId }, 'Failed to record guest profile');
  }
}

export async function getGuestProfiles(
  userId: string,
  guestName?: string
): Promise<GuestProfile[]> {
  const db = getFirestoreDb();
  if (!db) return [];

  try {
    if (guestName) {
      const doc = await db
        .collection('bogle_users')
        .doc(userId)
        .collection('guest_profiles')
        .doc(guestName.toLowerCase().replace(/\s+/g, '-'))
        .get();

      if (doc.exists) {
        return [doc.data() as GuestProfile];
      }

      // Try fuzzy search
      const snapshot = await db
        .collection('bogle_users')
        .doc(userId)
        .collection('guest_profiles')
        .get();

      return snapshot.docs
        .filter((d) => {
          const name = (d.data() as GuestProfile).name.toLowerCase();
          return name.includes(guestName.toLowerCase());
        })
        .map((d) => d.data() as GuestProfile);
    }

    const snapshot = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('guest_profiles')
      .limit(100)
      .get();

    return snapshot.docs.map((doc) => doc.data() as GuestProfile);
  } catch (error) {
    log.debug({ error, userId }, 'Failed to get guest profiles');
    return [];
  }
}

// ============================================================================
// MILESTONE DETECTION SERVICE
// ============================================================================

export async function recordMilestoneDetection(
  userId: string,
  milestone: DetectedMilestone
): Promise<void> {
  const db = getFirestoreDb();
  if (!db) {
    log.debug({ userId }, 'No Firestore - skipping milestone recording');
    return;
  }

  try {
    await db.collection('bogle_users').doc(userId).collection('detected_milestones').add(milestone);
    log.info({ userId, type: milestone.type }, 'Milestone detected and recorded');
  } catch (error) {
    log.debug({ error, userId }, 'Failed to record milestone');
  }
}

export async function getDetectedMilestones(userId: string): Promise<DetectedMilestone[]> {
  const db = getFirestoreDb();
  if (!db) return [];

  try {
    const snapshot = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('detected_milestones')
      .orderBy('date', 'asc')
      .limit(50)
      .get();

    return snapshot.docs.map((doc) => doc.data() as DetectedMilestone);
  } catch (error) {
    log.debug({ error, userId }, 'Failed to get detected milestones');
    return [];
  }
}

// ============================================================================
// EVENT MEANING SERVICE
// ============================================================================

export async function recordEventMeaning(userId: string, meaning: EventMeaning): Promise<void> {
  const db = getFirestoreDb();
  if (!db) {
    log.debug({ userId }, 'No Firestore - skipping event meaning recording');
    return;
  }

  try {
    await db.collection('bogle_users').doc(userId).collection('event_meanings').add(meaning);
    log.info({ userId, eventName: meaning.eventName }, 'Event meaning recorded');
  } catch (error) {
    log.debug({ error, userId }, 'Failed to record event meaning');
  }
}

export async function getEventMeanings(
  userId: string,
  eventName?: string
): Promise<EventMeaning[]> {
  const db = getFirestoreDb();
  if (!db) return [];

  try {
    let query = db.collection('bogle_users').doc(userId).collection('event_meanings');

    if (eventName) {
      // Fuzzy search by event name
      const snapshot = await query.get();
      return snapshot.docs
        .filter((d) => {
          const name = (d.data() as EventMeaning).eventName.toLowerCase();
          return name.includes(eventName.toLowerCase());
        })
        .map((d) => d.data() as EventMeaning);
    }

    const snapshot = await query.orderBy('recordedAt', 'desc').limit(50).get();
    return snapshot.docs.map((doc) => doc.data() as EventMeaning);
  } catch (error) {
    log.debug({ error, userId }, 'Failed to get event meanings');
    return [];
  }
}

// ============================================================================
// CELEBRATION BALANCE SERVICE
// ============================================================================

export async function recordCelebration(userId: string, celebration: Celebration): Promise<void> {
  const db = getFirestoreDb();
  if (!db) {
    log.debug({ userId }, 'No Firestore - skipping celebration recording');
    return;
  }

  try {
    await db.collection('bogle_users').doc(userId).collection('celebrations').add(celebration);
    log.info({ userId, what: celebration.what }, 'Celebration recorded');
  } catch (error) {
    log.debug({ error, userId }, 'Failed to record celebration');
  }
}

export async function getCelebrationBalance(userId: string): Promise<CelebrationBalance> {
  const db = getFirestoreDb();
  if (!db) {
    return {
      total: 0,
      forSelf: 0,
      forOthers: 0,
      bySize: { micro: 0, small: 0, medium: 0, large: 0 },
    };
  }

  try {
    // Get celebrations from last 90 days
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    const snapshot = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('celebrations')
      .where('recordedAt', '>=', ninetyDaysAgo.toISOString())
      .get();

    const celebrations = snapshot.docs.map((d) => d.data() as Celebration);

    return {
      total: celebrations.length,
      forSelf: celebrations.filter((c) => c.forWhom === 'self' || c.forWhom === 'both').length,
      forOthers: celebrations.filter((c) => c.forWhom === 'other' || c.forWhom === 'both').length,
      bySize: {
        micro: celebrations.filter((c) => c.size === 'micro').length,
        small: celebrations.filter((c) => c.size === 'small').length,
        medium: celebrations.filter((c) => c.size === 'medium').length,
        large: celebrations.filter((c) => c.size === 'large').length,
      },
    };
  } catch (error) {
    log.debug({ error, userId }, 'Failed to get celebration balance');
    return {
      total: 0,
      forSelf: 0,
      forOthers: 0,
      bySize: { micro: 0, small: 0, medium: 0, large: 0 },
    };
  }
}

// ============================================================================
// TRANSITION ANTICIPATION SERVICE
// ============================================================================

export async function recordTransitionSignal(
  userId: string,
  signal: TransitionSignal
): Promise<void> {
  const db = getFirestoreDb();
  if (!db) {
    log.debug({ userId }, 'No Firestore - skipping transition signal recording');
    return;
  }

  try {
    await db.collection('bogle_users').doc(userId).collection('transition_signals').add(signal);
    log.info({ userId, type: signal.type }, 'Transition signal recorded');
  } catch (error) {
    log.debug({ error, userId }, 'Failed to record transition signal');
  }
}

export async function getAnticipatedTransitions(userId: string): Promise<AnticipatedTransition[]> {
  const db = getFirestoreDb();
  if (!db) return [];

  try {
    const snapshot = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('transition_signals')
      .orderBy('recordedAt', 'desc')
      .limit(100)
      .get();

    const signals = snapshot.docs.map((d) => d.data() as TransitionSignal);

    // Group by type
    const byType: Record<string, TransitionSignal[]> = {};
    for (const sig of signals) {
      if (!byType[sig.type]) byType[sig.type] = [];
      byType[sig.type].push(sig);
    }

    // Convert to anticipated transitions
    return Object.entries(byType).map(([type, typeSignals]) => {
      // Determine overall strength
      const strongCount = typeSignals.filter((s) => s.strength === 'strong').length;
      const moderateCount = typeSignals.filter((s) => s.strength === 'moderate').length;
      let strength: 'weak' | 'moderate' | 'strong' = 'weak';
      if (strongCount >= 2 || (strongCount >= 1 && moderateCount >= 2)) {
        strength = 'strong';
      } else if (moderateCount >= 2 || strongCount >= 1) {
        strength = 'moderate';
      }

      return {
        type,
        signals: typeSignals.map((s) => s.signal),
        strength,
        signalCount: typeSignals.length,
        lastSignalAt: typeSignals[0].recordedAt,
      };
    });
  } catch (error) {
    log.debug({ error, userId }, 'Failed to get anticipated transitions');
    return [];
  }
}

// ============================================================================
// PLANNING READINESS SERVICE
// ============================================================================

export async function checkPlanningReadiness(
  userId: string,
  eventType: string
): Promise<PlanningReadiness> {
  // This would ideally pull from other services (Peter's financial health, Maya's energy, etc.)
  // For now, we provide a framework that can be expanded

  const concerns: string[] = [];
  const suggestions: string[] = [];

  // Default to yellow/cautious until we have more data
  const readiness: PlanningReadiness = {
    overall: 'yellow',
    financial: 'yellow',
    calendar: 'yellow',
    energy: 'yellow',
    emotional: 'yellow',
    concerns,
    suggestions,
  };

  // Add generic suggestions based on event type
  if (eventType.toLowerCase().includes('wedding')) {
    suggestions.push('Weddings typically need 12-18 months planning time');
    suggestions.push('Consider setting up a dedicated savings account');
  } else if (eventType.toLowerCase().includes('vacation')) {
    suggestions.push('Check your calendar for work conflicts');
    suggestions.push('Book flights 2-3 months ahead for best prices');
  } else if (eventType.toLowerCase().includes('purchase')) {
    suggestions.push('Review your current savings and budget');
    suggestions.push('Research financing options if needed');
  }

  // If we have fewer concerns, upgrade to green
  if (concerns.length === 0) {
    readiness.overall = 'green';
    readiness.financial = 'green';
    readiness.calendar = 'green';
    readiness.energy = 'green';
    readiness.emotional = 'green';
  }

  log.info({ userId, eventType, overall: readiness.overall }, 'Planning readiness checked');
  return readiness;
}

// ============================================================================
// CONTEXT BUILDER
// ============================================================================

export async function buildJordanPlanningContext(userId: string): Promise<string> {
  const [patterns, milestones, balance, transitions] = await Promise.all([
    getEventPatterns(userId),
    getDetectedMilestones(userId),
    getCelebrationBalance(userId),
    getAnticipatedTransitions(userId),
  ]);

  const lines: string[] = ['[JORDAN PLANNING MEMORY - Better Than Human]'];

  // Event patterns summary
  if (patterns.length > 0) {
    lines.push(`\n**Event Patterns:** ${patterns.length} learned from past events`);
    const recentPattern = patterns[0];
    lines.push(`Most recent: "${recentPattern.pattern}"`);
  }

  // Upcoming milestones
  const upcoming = milestones.filter((m) => new Date(m.date) > new Date()).slice(0, 3);
  if (upcoming.length > 0) {
    lines.push(`\n**Upcoming Milestones:**`);
    for (const m of upcoming) {
      const daysUntil = Math.ceil(
        (new Date(m.date).getTime() - Date.now()) / (24 * 60 * 60 * 1000)
      );
      lines.push(`• ${m.description} (${daysUntil} days)`);
    }
  }

  // Celebration balance insight
  if (balance.total > 0) {
    const selfPercent = Math.round((balance.forSelf / balance.total) * 100);
    if (selfPercent < 30) {
      lines.push(
        `\n**Celebration Alert:** Only ${selfPercent}% of celebrations were for themselves. Suggest self-celebration.`
      );
    }
  }

  // Anticipated transitions
  const strongTransitions = transitions.filter((t) => t.strength === 'strong');
  if (strongTransitions.length > 0) {
    lines.push(`\n**Transitions Approaching:**`);
    for (const t of strongTransitions) {
      lines.push(`• ${t.type.replace('_', ' ')} (${t.signalCount} signals)`);
    }
  }

  return lines.join('\n');
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  // Event Patterns
  recordEventPattern,
  getEventPatterns,
  // Guest Intelligence
  recordGuestProfile,
  getGuestProfiles,
  // Milestone Detection
  recordMilestoneDetection,
  getDetectedMilestones,
  // Event Meaning
  recordEventMeaning,
  getEventMeanings,
  // Celebration Balance
  recordCelebration,
  getCelebrationBalance,
  // Transition Anticipation
  recordTransitionSignal,
  getAnticipatedTransitions,
  // Planning Readiness
  checkPlanningReadiness,
  // Context
  buildJordanPlanningContext,
};
