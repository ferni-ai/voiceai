/**
 * Relationship Memory Persistence
 *
 * Persists relationship memory to Firestore for cross-session continuity.
 *
 * Storage structure:
 * - bogle_users/{userId}/relationships/{personaId}
 *
 * @module intelligence/relationship
 */

import { Firestore, Timestamp } from '@google-cloud/firestore';
import { createLogger } from '../../utils/safe-logger.js';
import type {
  CallbackAttempt,
  EmotionalTrajectory,
  InsideJoke,
  Milestone,
  MilestoneType,
  RelationshipMemory,
  RelationshipStage,
  SharedMoment,
} from './types.js';

const log = createLogger({ module: 'RelationshipPersistence' });

// ============================================================================
// FIRESTORE INITIALIZATION
// ============================================================================

let db: Firestore | null = null;
let initialized = false;

/**
 * Get or initialize the Firestore instance
 */
function getFirestoreDb(): Firestore | null {
  if (initialized) {
    return db;
  }

  try {
    db = new Firestore();
    initialized = true;
    log.debug('Relationship persistence Firestore initialized');
    return db;
  } catch (error) {
    log.warn({ error: String(error) }, 'Firestore not available for relationship persistence');
    initialized = true;
    return null;
  }
}

// ============================================================================
// COLLECTION PATHS
// ============================================================================

const RELATIONSHIPS_COLLECTION = 'relationships';

function getRelationshipPath(userId: string): string {
  return `bogle_users/${userId}/${RELATIONSHIPS_COLLECTION}`;
}

function getDocId(userId: string, personaId: string): string {
  return `${userId}_${personaId}`;
}

// ============================================================================
// FIRESTORE DOCUMENT TYPES
// ============================================================================

interface FirestoreRelationship {
  userId: string;
  personaId: string;
  stage: RelationshipStage;
  trustScore: number;
  totalSessions: number;
  firstSessionAt: Timestamp;
  lastSessionAt: Timestamp;
  sharedMoments: FirestoreMoment[];
  insideJokes: FirestoreJoke[];
  callbackAttempts: FirestoreCallback[];
  emotionalTrajectory: FirestoreTrajectory;
  milestones: FirestoneMilestone[];
  updatedAt: Timestamp;
}

interface FirestoreMoment {
  id: string;
  type: string;
  summary: string;
  sessionNumber: number;
  timestamp: Timestamp;
  userPhrase?: string;
  significance: number;
  topic?: string;
  callbackCount: number;
  lastCallback?: Timestamp;
}

interface FirestoreJoke {
  id: string;
  trigger: string;
  reference: string;
  origin: string;
  createdAt: Timestamp;
  originSession: number;
  usageCount: number;
  resonanceScore: number;
  lastUsed?: Timestamp;
  status: string;
}

interface FirestoreCallback {
  reference: string;
  type: string;
  timestamp: Timestamp;
  userResponse: string;
  threadContinued: boolean;
}

interface FirestoreTrajectory {
  recentSessions: Array<{
    sessionNumber: number;
    date: Timestamp;
    mood: string;
    topics: string[];
  }>;
  trendDirection: string;
  trendConfidence: number;
  concerns: Array<{
    concern: string;
    firstNoticed: Timestamp;
    severity: string;
    addressed: boolean;
  }>;
  growthAreas: Array<{
    area: string;
    firstNoticed: Timestamp;
    progressLevel: string;
  }>;
}

interface FirestoneMilestone {
  type: string;
  reached: boolean;
  reachedAt?: Timestamp;
  acknowledged: boolean;
  acknowledgedAt?: Timestamp;
}

// ============================================================================
// CONVERSION UTILITIES
// ============================================================================

function toFirestoreDoc(memory: RelationshipMemory): FirestoreRelationship {
  return {
    userId: memory.userId,
    personaId: memory.personaId,
    stage: memory.stage,
    trustScore: memory.trustScore,
    totalSessions: memory.totalSessions,
    firstSessionAt: Timestamp.fromDate(memory.firstSessionAt),
    lastSessionAt: Timestamp.fromDate(memory.lastSessionAt),
    sharedMoments: memory.sharedMoments.map((m) => ({
      id: m.id,
      type: m.type,
      summary: m.summary,
      sessionNumber: m.sessionNumber,
      timestamp: Timestamp.fromDate(m.timestamp),
      userPhrase: m.userPhrase,
      significance: m.significance,
      topic: m.topic,
      callbackCount: m.callbackCount,
      lastCallback: m.lastCallback ? Timestamp.fromDate(m.lastCallback) : undefined,
    })),
    insideJokes: memory.insideJokes.map((j) => ({
      id: j.id,
      trigger: j.trigger,
      reference: j.reference,
      origin: j.origin,
      createdAt: Timestamp.fromDate(j.createdAt),
      originSession: j.originSession,
      usageCount: j.usageCount,
      resonanceScore: j.resonanceScore,
      lastUsed: j.lastUsed ? Timestamp.fromDate(j.lastUsed) : undefined,
      status: j.status,
    })),
    callbackAttempts: memory.callbackAttempts.map((c) => ({
      reference: c.reference,
      type: c.type,
      timestamp: Timestamp.fromDate(c.timestamp),
      userResponse: c.userResponse,
      threadContinued: c.threadContinued,
    })),
    emotionalTrajectory: {
      recentSessions: memory.emotionalTrajectory.recentSessions.map((s) => ({
        sessionNumber: s.sessionNumber,
        date: Timestamp.fromDate(s.date),
        mood: s.mood,
        topics: s.topics,
      })),
      trendDirection: memory.emotionalTrajectory.trendDirection,
      trendConfidence: memory.emotionalTrajectory.trendConfidence,
      concerns: memory.emotionalTrajectory.concerns.map((c) => ({
        concern: c.concern,
        firstNoticed: Timestamp.fromDate(c.firstNoticed),
        severity: c.severity,
        addressed: c.addressed,
      })),
      growthAreas: memory.emotionalTrajectory.growthAreas.map((g) => ({
        area: g.area,
        firstNoticed: Timestamp.fromDate(g.firstNoticed),
        progressLevel: g.progressLevel,
      })),
    },
    milestones: memory.milestones.map((m) => ({
      type: m.type,
      reached: m.reached,
      reachedAt: m.reachedAt ? Timestamp.fromDate(m.reachedAt) : undefined,
      acknowledged: m.acknowledged,
      acknowledgedAt: m.acknowledgedAt ? Timestamp.fromDate(m.acknowledgedAt) : undefined,
    })),
    updatedAt: Timestamp.fromDate(memory.updatedAt),
  };
}

function fromFirestoreDoc(doc: FirestoreRelationship): RelationshipMemory {
  return {
    userId: doc.userId,
    personaId: doc.personaId,
    stage: doc.stage,
    trustScore: doc.trustScore,
    totalSessions: doc.totalSessions,
    firstSessionAt: doc.firstSessionAt.toDate(),
    lastSessionAt: doc.lastSessionAt.toDate(),
    sharedMoments: (doc.sharedMoments ?? []).map((m) => ({
      id: m.id,
      type: m.type as SharedMoment['type'],
      summary: m.summary,
      sessionNumber: m.sessionNumber,
      timestamp: m.timestamp.toDate(),
      userPhrase: m.userPhrase,
      significance: m.significance,
      topic: m.topic,
      callbackCount: m.callbackCount,
      lastCallback: m.lastCallback?.toDate(),
    })),
    insideJokes: (doc.insideJokes ?? []).map((j) => ({
      id: j.id,
      trigger: j.trigger,
      reference: j.reference,
      origin: j.origin,
      createdAt: j.createdAt.toDate(),
      originSession: j.originSession,
      usageCount: j.usageCount,
      resonanceScore: j.resonanceScore,
      lastUsed: j.lastUsed?.toDate(),
      status: j.status as InsideJoke['status'],
    })),
    callbackAttempts: (doc.callbackAttempts ?? []).map((c) => ({
      reference: c.reference,
      type: c.type as CallbackAttempt['type'],
      timestamp: c.timestamp.toDate(),
      userResponse: c.userResponse as CallbackAttempt['userResponse'],
      threadContinued: c.threadContinued,
    })),
    emotionalTrajectory: {
      recentSessions: (doc.emotionalTrajectory?.recentSessions ?? []).map((s) => ({
        sessionNumber: s.sessionNumber,
        date: s.date.toDate(),
        mood: s.mood as EmotionalTrajectory['recentSessions'][0]['mood'],
        topics: s.topics,
      })),
      trendDirection:
        (doc.emotionalTrajectory?.trendDirection as EmotionalTrajectory['trendDirection']) ??
        'stable',
      trendConfidence: doc.emotionalTrajectory?.trendConfidence ?? 0,
      concerns: (doc.emotionalTrajectory?.concerns ?? []).map((c) => ({
        concern: c.concern,
        firstNoticed: c.firstNoticed.toDate(),
        severity: c.severity as 'low' | 'medium' | 'high',
        addressed: c.addressed,
      })),
      growthAreas: (doc.emotionalTrajectory?.growthAreas ?? []).map((g) => ({
        area: g.area,
        firstNoticed: g.firstNoticed.toDate(),
        progressLevel: g.progressLevel as 'emerging' | 'developing' | 'strong',
      })),
    },
    milestones: (doc.milestones ?? []).map((m) => ({
      type: m.type as MilestoneType,
      reached: m.reached,
      reachedAt: m.reachedAt?.toDate(),
      acknowledged: m.acknowledged,
      acknowledgedAt: m.acknowledgedAt?.toDate(),
    })),
    updatedAt: doc.updatedAt.toDate(),
  };
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Load relationship memory from Firestore
 */
export async function loadRelationshipMemory(
  userId: string,
  personaId: string
): Promise<RelationshipMemory | null> {
  const firestore = getFirestoreDb();
  if (!firestore) {
    log.debug('Firestore not available, returning null');
    return null;
  }

  try {
    const docRef = firestore.collection(getRelationshipPath(userId)).doc(personaId);
    const snapshot = await docRef.get();

    if (!snapshot.exists) {
      log.debug({ userId, personaId }, 'No relationship memory found');
      return null;
    }

    const data = snapshot.data() as FirestoreRelationship;
    const memory = fromFirestoreDoc(data);

    log.debug(
      {
        userId,
        personaId,
        stage: memory.stage,
        sessions: memory.totalSessions,
      },
      'Loaded relationship memory'
    );

    return memory;
  } catch (error) {
    log.error({ error, userId, personaId }, 'Failed to load relationship memory');
    return null;
  }
}

/**
 * Save relationship memory to Firestore
 */
export async function saveRelationshipMemory(memory: RelationshipMemory): Promise<void> {
  const firestore = getFirestoreDb();
  if (!firestore) {
    log.debug('Firestore not available, skipping save');
    return;
  }

  try {
    const docRef = firestore
      .collection(getRelationshipPath(memory.userId))
      .doc(memory.personaId);

    const firestoreDoc = toFirestoreDoc(memory);

    // Remove undefined values for Firestore compatibility
    const cleanedDoc = JSON.parse(JSON.stringify(firestoreDoc));

    await docRef.set(cleanedDoc, { merge: true });

    log.debug(
      {
        userId: memory.userId,
        personaId: memory.personaId,
        stage: memory.stage,
        sessions: memory.totalSessions,
      },
      'Saved relationship memory'
    );
  } catch (error) {
    log.error({ error, userId: memory.userId, personaId: memory.personaId }, 'Failed to save relationship memory');
    throw error;
  }
}

/**
 * Delete relationship memory from Firestore
 */
export async function deleteRelationshipMemory(
  userId: string,
  personaId: string
): Promise<void> {
  const firestore = getFirestoreDb();
  if (!firestore) {
    return;
  }

  try {
    const docRef = firestore.collection(getRelationshipPath(userId)).doc(personaId);
    await docRef.delete();
    log.debug({ userId, personaId }, 'Deleted relationship memory');
  } catch (error) {
    log.error({ error, userId, personaId }, 'Failed to delete relationship memory');
    throw error;
  }
}

/**
 * Create a default relationship memory for a new user
 */
export function createDefaultMemory(userId: string, personaId: string): RelationshipMemory {
  const now = new Date();

  // Initialize all milestone types
  const milestoneTypes: MilestoneType[] = [
    'session_10',
    'session_25',
    'session_50',
    'session_100',
    'first_vulnerability',
    'first_laugh',
    'first_breakthrough',
    'first_crisis_support',
    'first_callback_landed',
    'first_inside_joke',
    'reached_friend',
    'reached_trusted',
    'reached_confidant',
    'one_month',
    'three_months',
    'six_months',
    'one_year',
  ];

  const milestones: Milestone[] = milestoneTypes.map((type) => ({
    type,
    reached: false,
    acknowledged: false,
  }));

  return {
    userId,
    personaId,
    stage: 'stranger',
    trustScore: 0,
    totalSessions: 0,
    firstSessionAt: now,
    lastSessionAt: now,
    sharedMoments: [],
    insideJokes: [],
    callbackAttempts: [],
    emotionalTrajectory: {
      recentSessions: [],
      trendDirection: 'stable',
      trendConfidence: 0,
      concerns: [],
      growthAreas: [],
    },
    milestones,
    updatedAt: now,
  };
}
