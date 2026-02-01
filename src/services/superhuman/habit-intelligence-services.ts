/**
 * Habit Intelligence Services
 *
 * "Better Than Human" persistence layer for habit coaching capabilities.
 * These services provide the superhuman memory that makes habit coaching transcendent.
 *
 * SERVICES:
 *   1. Habit DNA - Complete genetic profile of every habit
 *   2. Friction Mapper - Track where/when habits fail
 *   3. Tendency Profiler - Dynamic Four Tendencies assessment
 *   4. Keystone Detector - Find cascade habits
 *   5. Identity Tracker - "I am someone who..." evolution
 *   6. Setback Archaeologist - Pattern-match failures
 *   7. Habit Autopsy - Post-mortem for dead habits
 *
 * FIRESTORE COLLECTIONS:
 *   bogle_users/{userId}/habit_dna
 *   bogle_users/{userId}/friction_points
 *   bogle_users/{userId}/tendency_signals
 *   bogle_users/{userId}/keystone_observations
 *   bogle_users/{userId}/identity_statements
 *   bogle_users/{userId}/setback_patterns
 *   bogle_users/{userId}/habit_autopsies
 */

import { createLogger } from '../../utils/safe-logger.js';
import { getFirestoreDb } from './firestore-utils.js';
import {
  onHabitDNAChange,
  onFrictionPointChange,
  onTendencyProfileChange,
  onKeystoneObservationChange,
  onIdentityStatementChange,
  onSetbackPatternChange,
  onHabitAutopsyChange,
} from '../data-layer/hooks/superhuman-hooks.js';

const log = createLogger({ module: 'superhuman:habit-intelligence' });

// ============================================================================
// TYPES
// ============================================================================

export interface HabitDNAEvent {
  event: 'started' | 'maintained' | 'struggled' | 'broke' | 'restarted' | 'mastered';
  context?: string;
  triggerOrBarrier?: string;
  emotionalState?: string;
  timeOfDay?: string;
  date: string;
}

export interface HabitDNA {
  habitName: string;
  events: HabitDNAEvent[];
  timesStarted: number;
  timesBroke: number;
  currentStreak: number;
  longestStreak: number;
  commonTriggers: string[];
  commonBarriers: string[];
  optimalConditions?: {
    bestTime?: string;
    bestContext?: string;
    bestMood?: string;
  };
}

export interface FrictionPoint {
  frictionType: 'time' | 'location' | 'energy' | 'social' | 'emotional' | 'environmental' | 'other';
  description: string;
  intensity: 'minor' | 'moderate' | 'major';
  recordedAt: string;
}

export interface TendencySignal {
  signal: string;
  context?: string;
  recordedAt: string;
}

export interface TendencyProfile {
  signals: TendencySignal[];
  primaryTendency: 'Upholder' | 'Questioner' | 'Obliger' | 'Rebel';
  confidence: number;
}

export interface KeystoneObservation {
  observation: string;
  primaryHabit: string;
  affectedHabits: string[];
  recordedAt: string;
}

export interface KeystoneHabit {
  primaryHabit: string;
  affectedHabits: string[];
  observations: KeystoneObservation[];
}

export interface IdentityStatement {
  statement: string;
  domain: string;
  confidence: 'aspiring' | 'emerging' | 'established' | 'core';
  recordedAt: string;
}

export interface SetbackPattern {
  habitName: string;
  whatHappened: string;
  whenItHappened?: string;
  emotionalTrigger?: string;
  recordedAt: string;
}

export interface HabitAutopsy {
  habitName: string;
  howLongItLasted?: string;
  causeOfDeath: string;
  lastRites?: string;
  lessonsLearned?: string;
  willResurrect?: boolean;
  recordedAt: string;
}

// ============================================================================
// HABIT DNA SERVICE
// ============================================================================

export async function recordHabitDNA(
  userId: string,
  habitName: string,
  event: HabitDNAEvent
): Promise<void> {
  const db = getFirestoreDb();
  if (!db) {
    log.debug({ userId }, 'No Firestore - skipping habit DNA recording');
    return;
  }

  try {
    const docRef = db.collection('bogle_users').doc(userId).collection('habit_dna').doc(habitName);
    const doc = await docRef.get();

    if (doc.exists) {
      const existing = doc.data() as HabitDNA;
      const events = [...existing.events, event];

      // Compute aggregates
      const timesStarted = events.filter(
        (e) => e.event === 'started' || e.event === 'restarted'
      ).length;
      const timesBroke = events.filter((e) => e.event === 'broke').length;

      // Extract common triggers and barriers
      const triggers = events
        .filter((e) => (e.event === 'maintained' || e.event === 'mastered') && e.triggerOrBarrier)
        .map((e) => e.triggerOrBarrier!);
      const barriers = events
        .filter((e) => (e.event === 'struggled' || e.event === 'broke') && e.triggerOrBarrier)
        .map((e) => e.triggerOrBarrier!);

      // Compute optimal conditions from successful events
      const successEvents = events.filter(
        (e) => e.event === 'maintained' || e.event === 'mastered'
      );
      const bestTime = getMostCommon(
        successEvents.map((e) => e.timeOfDay).filter(Boolean) as string[]
      );
      const bestMood = getMostCommon(
        successEvents.map((e) => e.emotionalState).filter(Boolean) as string[]
      );

      const updateData = {
        events,
        timesStarted,
        timesBroke,
        currentStreak:
          event.event === 'broke'
            ? 0
            : (existing.currentStreak || 0) + (event.event === 'maintained' ? 1 : 0),
        longestStreak: Math.max(existing.longestStreak || 0, existing.currentStreak || 0),
        commonTriggers: [...new Set(triggers)].slice(0, 5),
        commonBarriers: [...new Set(barriers)].slice(0, 5),
        optimalConditions: {
          bestTime,
          bestMood,
        },
      };
      await docRef.update(updateData);
      void onHabitDNAChange(userId, habitName, updateData, 'update');
    } else {
      const createData = {
        habitName,
        events: [event],
        timesStarted: event.event === 'started' ? 1 : 0,
        timesBroke: event.event === 'broke' ? 1 : 0,
        currentStreak: 0,
        longestStreak: 0,
        commonTriggers:
          event.triggerOrBarrier && (event.event === 'maintained' || event.event === 'mastered')
            ? [event.triggerOrBarrier]
            : [],
        commonBarriers:
          event.triggerOrBarrier && (event.event === 'struggled' || event.event === 'broke')
            ? [event.triggerOrBarrier]
            : [],
        optimalConditions: {},
      };
      await docRef.set(createData);
      void onHabitDNAChange(userId, habitName, createData, 'create');
    }

    log.info({ userId, habitName, event: event.event }, 'Habit DNA recorded');
  } catch (error) {
    log.debug({ error, userId }, 'Failed to record habit DNA');
  }
}

export async function getHabitDNA(userId: string, habitName: string): Promise<HabitDNA | null> {
  const db = getFirestoreDb();
  if (!db) return null;

  try {
    const doc = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('habit_dna')
      .doc(habitName)
      .get();

    if (!doc.exists) return null;
    return doc.data() as HabitDNA;
  } catch (error) {
    log.debug({ error, userId }, 'Failed to get habit DNA');
    return null;
  }
}

// ============================================================================
// FRICTION MAPPER SERVICE
// ============================================================================

export async function recordFrictionPoint(
  userId: string,
  habitName: string,
  friction: FrictionPoint
): Promise<void> {
  const db = getFirestoreDb();
  if (!db) {
    log.debug({ userId }, 'No Firestore - skipping friction recording');
    return;
  }

  try {
    const frictionData = { habitName, ...friction };
    const docRef = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('friction_points')
      .add(frictionData);
    void onFrictionPointChange(userId, docRef.id, frictionData, 'create');
    log.info({ userId, habitName, frictionType: friction.frictionType }, 'Friction point recorded');
  } catch (error) {
    log.debug({ error, userId }, 'Failed to record friction point');
  }
}

export async function getFrictionPoints(
  userId: string,
  habitName?: string
): Promise<(FrictionPoint & { habitName: string })[]> {
  const db = getFirestoreDb();
  if (!db) return [];

  try {
    let query = db.collection('bogle_users').doc(userId).collection('friction_points');
    if (habitName) {
      query = query.where('habitName', '==', habitName) as typeof query;
    }

    const snapshot = await query.orderBy('recordedAt', 'desc').limit(50).get();
    return snapshot.docs.map((doc) => doc.data() as FrictionPoint & { habitName: string });
  } catch (error) {
    log.debug({ error, userId }, 'Failed to get friction points');
    return [];
  }
}

// ============================================================================
// TENDENCY PROFILER SERVICE
// ============================================================================

export async function recordTendencySignal(userId: string, signal: TendencySignal): Promise<void> {
  const db = getFirestoreDb();
  if (!db) {
    log.debug({ userId }, 'No Firestore - skipping tendency signal');
    return;
  }

  try {
    const docRef = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('tendency_signals')
      .add(signal);
    void onTendencyProfileChange(userId, docRef.id, signal, 'create');
    log.info({ userId, signal: signal.signal }, 'Tendency signal recorded');
  } catch (error) {
    log.debug({ error, userId }, 'Failed to record tendency signal');
  }
}

export async function getTendencyProfile(userId: string): Promise<TendencyProfile | null> {
  const db = getFirestoreDb();
  if (!db) return null;

  try {
    const snapshot = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('tendency_signals')
      .orderBy('recordedAt', 'desc')
      .limit(100)
      .get();

    const signals = snapshot.docs.map((doc) => doc.data() as TendencySignal);

    if (signals.length === 0) return null;

    // Analyze signals to determine tendency
    const scores = {
      Upholder: 0,
      Questioner: 0,
      Obliger: 0,
      Rebel: 0,
    };

    for (const sig of signals) {
      switch (sig.signal) {
        case 'followed-own-rule':
          scores.Upholder += 2;
          break;
        case 'followed-external-rule':
          scores.Upholder += 1;
          scores.Obliger += 1;
          break;
        case 'broke-own-rule':
          scores.Obliger += 1;
          scores.Rebel += 1;
          break;
        case 'broke-external-rule':
          scores.Questioner += 1;
          scores.Rebel += 1;
          break;
        case 'needed-accountability':
          scores.Obliger += 2;
          break;
        case 'resisted-external-pressure':
          scores.Rebel += 2;
          break;
        case 'questioned-why':
          scores.Questioner += 2;
          break;
        case 'just-did-it':
          scores.Upholder += 2;
          break;
      }
    }

    const totalScore = Object.values(scores).reduce((a, b) => a + b, 0);
    const primaryTendency = Object.entries(scores).sort(
      (a, b) => b[1] - a[1]
    )[0][0] as TendencyProfile['primaryTendency'];
    const confidence = totalScore > 0 ? scores[primaryTendency] / totalScore : 0;

    return {
      signals,
      primaryTendency,
      confidence,
    };
  } catch (error) {
    log.debug({ error, userId }, 'Failed to get tendency profile');
    return null;
  }
}

// ============================================================================
// KEYSTONE DETECTOR SERVICE
// ============================================================================

export async function recordKeystoneObservation(
  userId: string,
  observation: KeystoneObservation
): Promise<void> {
  const db = getFirestoreDb();
  if (!db) {
    log.debug({ userId }, 'No Firestore - skipping keystone observation');
    return;
  }

  try {
    const docRef = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('keystone_observations')
      .add(observation);
    void onKeystoneObservationChange(userId, docRef.id, observation, 'create');
    log.info({ userId, primaryHabit: observation.primaryHabit }, 'Keystone observation recorded');
  } catch (error) {
    log.debug({ error, userId }, 'Failed to record keystone observation');
  }
}

export async function getKeystoneHabits(userId: string): Promise<KeystoneHabit[]> {
  const db = getFirestoreDb();
  if (!db) return [];

  try {
    const snapshot = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('keystone_observations')
      .orderBy('recordedAt', 'desc')
      .limit(100)
      .get();

    const observations = snapshot.docs.map((doc) => doc.data() as KeystoneObservation);

    // Group by primary habit
    const byHabit: Record<string, KeystoneObservation[]> = {};
    for (const obs of observations) {
      if (!byHabit[obs.primaryHabit]) byHabit[obs.primaryHabit] = [];
      byHabit[obs.primaryHabit].push(obs);
    }

    // Convert to KeystoneHabit format
    return Object.entries(byHabit).map(([primaryHabit, obsList]) => ({
      primaryHabit,
      affectedHabits: [...new Set(obsList.flatMap((o) => o.affectedHabits))],
      observations: obsList,
    }));
  } catch (error) {
    log.debug({ error, userId }, 'Failed to get keystone habits');
    return [];
  }
}

// ============================================================================
// IDENTITY TRACKER SERVICE
// ============================================================================

export async function recordIdentityStatement(
  userId: string,
  statement: IdentityStatement
): Promise<void> {
  const db = getFirestoreDb();
  if (!db) {
    log.debug({ userId }, 'No Firestore - skipping identity statement');
    return;
  }

  try {
    // Check if this statement already exists
    const existing = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('identity_statements')
      .where('statement', '==', statement.statement)
      .limit(1)
      .get();

    if (!existing.empty) {
      // Update confidence if it increased
      const doc = existing.docs[0];
      const existingData = doc.data() as IdentityStatement;
      const confidenceOrder = ['aspiring', 'emerging', 'established', 'core'];
      if (
        confidenceOrder.indexOf(statement.confidence) >
        confidenceOrder.indexOf(existingData.confidence)
      ) {
        const updateData = {
          confidence: statement.confidence,
          recordedAt: statement.recordedAt,
        };
        await doc.ref.update(updateData);
        void onIdentityStatementChange(userId, doc.id, updateData, 'update');
      }
    } else {
      const docRef = await db
        .collection('bogle_users')
        .doc(userId)
        .collection('identity_statements')
        .add(statement);
      void onIdentityStatementChange(userId, docRef.id, statement, 'create');
    }

    log.info(
      { userId, domain: statement.domain, confidence: statement.confidence },
      'Identity statement recorded'
    );
  } catch (error) {
    log.debug({ error, userId }, 'Failed to record identity statement');
  }
}

export async function getIdentityEvolution(userId: string): Promise<IdentityStatement[]> {
  const db = getFirestoreDb();
  if (!db) return [];

  try {
    const snapshot = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('identity_statements')
      .orderBy('recordedAt', 'desc')
      .limit(50)
      .get();

    return snapshot.docs.map((doc) => doc.data() as IdentityStatement);
  } catch (error) {
    log.debug({ error, userId }, 'Failed to get identity evolution');
    return [];
  }
}

// ============================================================================
// SETBACK ARCHAEOLOGIST SERVICE
// ============================================================================

export async function recordSetbackPattern(userId: string, pattern: SetbackPattern): Promise<void> {
  const db = getFirestoreDb();
  if (!db) {
    log.debug({ userId }, 'No Firestore - skipping setback pattern');
    return;
  }

  try {
    const docRef = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('setback_patterns')
      .add(pattern);
    void onSetbackPatternChange(userId, docRef.id, pattern, 'create');
    log.info({ userId, habitName: pattern.habitName }, 'Setback pattern recorded');
  } catch (error) {
    log.debug({ error, userId }, 'Failed to record setback pattern');
  }
}

export async function getSetbackPatterns(
  userId: string,
  habitName?: string
): Promise<SetbackPattern[]> {
  const db = getFirestoreDb();
  if (!db) return [];

  try {
    let query = db.collection('bogle_users').doc(userId).collection('setback_patterns');
    if (habitName) {
      query = query.where('habitName', '==', habitName) as typeof query;
    }

    const snapshot = await query.orderBy('recordedAt', 'desc').limit(100).get();
    return snapshot.docs.map((doc) => doc.data() as SetbackPattern);
  } catch (error) {
    log.debug({ error, userId }, 'Failed to get setback patterns');
    return [];
  }
}

// ============================================================================
// HABIT AUTOPSY SERVICE
// ============================================================================

export async function recordHabitAutopsy(userId: string, autopsy: HabitAutopsy): Promise<void> {
  const db = getFirestoreDb();
  if (!db) {
    log.debug({ userId }, 'No Firestore - skipping habit autopsy');
    return;
  }

  try {
    const docRef = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('habit_autopsies')
      .add(autopsy);
    void onHabitAutopsyChange(userId, docRef.id, autopsy, 'create');
    log.info({ userId, habitName: autopsy.habitName }, 'Habit autopsy recorded');
  } catch (error) {
    log.debug({ error, userId }, 'Failed to record habit autopsy');
  }
}

export async function getHabitAutopsies(userId: string): Promise<HabitAutopsy[]> {
  const db = getFirestoreDb();
  if (!db) return [];

  try {
    const snapshot = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('habit_autopsies')
      .orderBy('recordedAt', 'desc')
      .limit(50)
      .get();

    return snapshot.docs.map((doc) => doc.data() as HabitAutopsy);
  } catch (error) {
    log.debug({ error, userId }, 'Failed to get habit autopsies');
    return [];
  }
}

// ============================================================================
// CONTEXT BUILDER FOR MAYA
// ============================================================================

/**
 * Build comprehensive coaching context for Maya
 * This aggregates all coaching services into a context injection
 */
export async function buildMayaCoachingContext(userId: string): Promise<string> {
  const [
    frictionPoints,
    tendencyProfile,
    keystones,
    identityStatements,
    setbackPatterns,
    autopsies,
  ] = await Promise.all([
    getFrictionPoints(userId),
    getTendencyProfile(userId),
    getKeystoneHabits(userId),
    getIdentityEvolution(userId),
    getSetbackPatterns(userId),
    getHabitAutopsies(userId),
  ]);

  const lines: string[] = ['[MAYA COACHING MEMORY - Better Than Human]'];

  // Tendency profile
  if (tendencyProfile && tendencyProfile.signals.length >= 5) {
    lines.push(
      `\n**Four Tendency:** ${tendencyProfile.primaryTendency} (${Math.round(tendencyProfile.confidence * 100)}% confidence)`
    );
    const strategies: Record<string, string> = {
      Upholder: 'Clear rules and schedules work. Watch for over-tightening.',
      Questioner: 'Always explain WHY. Beware analysis paralysis.',
      Obliger: 'External accountability is essential, not a crutch.',
      Rebel: 'Frame as choice and identity. Never "should" or "have to".',
    };
    lines.push(`Strategy: ${strategies[tendencyProfile.primaryTendency]}`);
  }

  // Top friction patterns
  if (frictionPoints.length > 0) {
    const byType: Record<string, number> = {};
    for (const fp of frictionPoints) {
      byType[fp.frictionType] = (byType[fp.frictionType] || 0) + 1;
    }
    const topFriction = Object.entries(byType).sort((a, b) => b[1] - a[1])[0];
    lines.push(`\n**Top Friction:** ${topFriction[0]} (${topFriction[1]} incidents)`);
    lines.push('Design environment to reduce this friction type.');
  }

  // Keystone habits
  if (keystones.length > 0) {
    const topKeystone = keystones.sort(
      (a, b) => b.affectedHabits.length - a.affectedHabits.length
    )[0];
    lines.push(`\n**Keystone Habit:** ${topKeystone.primaryHabit}`);
    lines.push(`Cascades to: ${topKeystone.affectedHabits.slice(0, 3).join(', ')}`);
    lines.push('Protect this habit above others.');
  }

  // Core identity statements
  const coreIdentity = identityStatements.filter(
    (s) => s.confidence === 'core' || s.confidence === 'established'
  );
  if (coreIdentity.length > 0) {
    lines.push('\n**Identity Anchors:**');
    for (const stmt of coreIdentity.slice(0, 3)) {
      lines.push(`• "${stmt.statement}" (${stmt.confidence})`);
    }
  }

  // Setback patterns
  if (setbackPatterns.length >= 3) {
    const emotionalTriggers: Record<string, number> = {};
    for (const p of setbackPatterns) {
      if (p.emotionalTrigger) {
        emotionalTriggers[p.emotionalTrigger] = (emotionalTriggers[p.emotionalTrigger] || 0) + 1;
      }
    }
    const topTrigger = Object.entries(emotionalTriggers).sort((a, b) => b[1] - a[1])[0];
    if (topTrigger) {
      lines.push(`\n**Setback Trigger:** "${topTrigger[0]}" state (${topTrigger[1]} incidents)`);
      lines.push('Build a contingency plan for this emotional state.');
    }
  }

  // Resurrection candidates
  const resurrectCandidates = autopsies.filter((a) => a.willResurrect);
  if (resurrectCandidates.length > 0) {
    lines.push(
      `\n**Resurrection Candidates:** ${resurrectCandidates.map((r) => r.habitName).join(', ')}`
    );
  }

  return lines.join('\n');
}

// ============================================================================
// HELPERS
// ============================================================================

function getMostCommon(arr: string[]): string | undefined {
  if (arr.length === 0) return undefined;
  const counts: Record<string, number> = {};
  for (const item of arr) {
    counts[item] = (counts[item] || 0) + 1;
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0];
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  // Habit DNA
  recordHabitDNA,
  getHabitDNA,
  // Friction
  recordFrictionPoint,
  getFrictionPoints,
  // Tendency
  recordTendencySignal,
  getTendencyProfile,
  // Keystone
  recordKeystoneObservation,
  getKeystoneHabits,
  // Identity
  recordIdentityStatement,
  getIdentityEvolution,
  // Setback
  recordSetbackPattern,
  getSetbackPatterns,
  // Autopsy
  recordHabitAutopsy,
  getHabitAutopsies,
  // Context
  buildMayaCoachingContext,
};
