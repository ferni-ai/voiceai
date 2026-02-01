/**
 * Memory Intelligence Learning Persistence
 *
 * Persists user memory profiles and response data to Firestore.
 * This enables cross-session learning about user preferences.
 *
 * @module intelligence/memory-intelligence/learning/persistence
 */

import { createLogger } from '../../../utils/safe-logger.js';
import { getFirestoreDb } from '../../../utils/firestore-utils.js';
import type { Firestore, CollectionReference, DocumentData } from '@google-cloud/firestore';
import type { UserMemoryProfile, TrustLevel, PhrasingStyle } from '../types.js';
import type { SurfacedMemoryRecord } from './response-tracker.js';

const log = createLogger({ module: 'MemoryIntelPersistence' });

// ============================================================================
// CONFIGURATION
// ============================================================================

const COLLECTION_NAMES = {
  profiles: 'memory_intelligence_profiles',
  records: 'memory_intelligence_records',
} as const;

// ============================================================================
// TYPES
// ============================================================================

/**
 * Serializable version of UserMemoryProfile for Firestore
 */
interface SerializedProfile {
  userId: string;
  lastUpdated: string;
  
  // Receptivity patterns (Map -> Object)
  receptivityPatterns: {
    byTimeOfDay: Record<number, number>;
    byConversationDepth: Record<number, number>;
    byEmotionalState: Record<string, number>;
  };
  
  // Response patterns
  responsePatterns: {
    topicsWelcomed: string[];
    topicsDeflected: string[];
    preferredPhrasingStyle: PhrasingStyle;
  };
  
  // Sensitive topics
  sensitiveTopics: string[];
  
  // Frequency preference
  idealRecallFrequency: number;
  
  // Trust level
  trustLevel: TrustLevel;
  
  // Stats
  totalSurfacings: number;
  totalEngagements: number;
  totalDeflections: number;
  profileConfidence: number;
}

/**
 * Serializable version of SurfacedMemoryRecord for Firestore
 */
interface SerializedRecord {
  memoryId: string;
  userId: string;
  sessionId: string;
  surfacedAt: string;
  trigger: string;
  style: string;
  persona: string;
  contextSnapshot: {
    turnCount: number;
    emotionalIntensity: number;
    topics: string[];
  };
  response?: {
    type: string;
    intensity: number;
    timestamp: string;
    turnsUntilResponse: number;
  };
}

// ============================================================================
// PERSISTENCE FUNCTIONS
// ============================================================================

let db: Firestore | null = null;

function getDb(): Firestore {
  if (!db) {
    db = getFirestoreDb();
  }
  if (!db) {
    throw new Error('Firestore not available');
  }
  return db;
}

function getProfilesCollection(): CollectionReference<DocumentData> {
  return getDb().collection(COLLECTION_NAMES.profiles);
}

function getRecordsCollection(): CollectionReference<DocumentData> {
  return getDb().collection(COLLECTION_NAMES.records);
}

// ============================================================================
// PROFILE PERSISTENCE
// ============================================================================

/**
 * Serialize a UserMemoryProfile for Firestore storage
 */
function serializeProfile(profile: UserMemoryProfile): SerializedProfile {
  return {
    userId: profile.userId,
    lastUpdated: profile.lastUpdated.toISOString(),
    receptivityPatterns: {
      byTimeOfDay: Object.fromEntries(profile.receptivityPatterns.byTimeOfDay),
      byConversationDepth: Object.fromEntries(profile.receptivityPatterns.byConversationDepth),
      byEmotionalState: Object.fromEntries(profile.receptivityPatterns.byEmotionalState),
    },
    responsePatterns: {
      topicsWelcomed: profile.responsePatterns.topicsWelcomed,
      topicsDeflected: profile.responsePatterns.topicsDeflected,
      preferredPhrasingStyle: profile.responsePatterns.preferredPhrasingStyle,
    },
    sensitiveTopics: Array.from(profile.sensitiveTopics),
    idealRecallFrequency: profile.idealRecallFrequency,
    trustLevel: profile.trustLevel,
    totalSurfacings: profile.totalMemoriesSurfaced || 0,
    totalEngagements: Math.round((profile.engagementRate || 0.5) * (profile.totalMemoriesSurfaced || 0)),
    totalDeflections: Math.round((1 - (profile.engagementRate || 0.5)) * (profile.totalMemoriesSurfaced || 0)),
    profileConfidence: profile.engagementRate || 0.5,
  };
}

/**
 * Deserialize a UserMemoryProfile from Firestore
 */
function deserializeProfile(data: SerializedProfile): UserMemoryProfile {
  const totalSurfacings = data.totalSurfacings || 0;
  const totalEngagements = data.totalEngagements || 0;
  const engagementRate = totalSurfacings > 0 ? totalEngagements / totalSurfacings : 0.5;
  
  return {
    userId: data.userId,
    lastUpdated: new Date(data.lastUpdated),
    receptivityPatterns: {
      byTimeOfDay: new Map(Object.entries(data.receptivityPatterns.byTimeOfDay || {}).map(([k, v]) => [Number(k), v as number])),
      byConversationDepth: new Map(Object.entries(data.receptivityPatterns.byConversationDepth || {})),
      byEmotionalState: new Map(Object.entries(data.receptivityPatterns.byEmotionalState || {})),
    },
    responsePatterns: {
      topicsWelcomed: data.responsePatterns?.topicsWelcomed || [],
      topicsDeflected: data.responsePatterns?.topicsDeflected || [],
      preferredPhrasingStyle: data.responsePatterns?.preferredPhrasingStyle || 'warm',
      averageEngagement: data.profileConfidence || 0.5,
    },
    sensitiveTopics: new Set(data.sensitiveTopics || []),
    idealRecallFrequency: data.idealRecallFrequency || 3,
    trustLevel: data.trustLevel || 'new',
    totalMemoriesSurfaced: totalSurfacings,
    engagementRate,
  };
}

/**
 * Save a user's memory profile to Firestore
 */
export async function saveProfile(profile: UserMemoryProfile): Promise<void> {
  try {
    const serialized = serializeProfile(profile);
    await getProfilesCollection().doc(profile.userId).set(serialized, { merge: true });
    log.debug({ userId: profile.userId }, 'Saved memory intelligence profile');
  } catch (error) {
    log.warn({ error: String(error), userId: profile.userId }, 'Failed to save profile');
    // Don't throw - this is a background operation
  }
}

/**
 * Load a user's memory profile from Firestore
 */
export async function loadProfile(userId: string): Promise<UserMemoryProfile | null> {
  try {
    const doc = await getProfilesCollection().doc(userId).get();
    if (!doc.exists) {
      return null;
    }
    const data = doc.data() as SerializedProfile;
    return deserializeProfile(data);
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to load profile');
    return null;
  }
}

/**
 * Delete a user's memory profile
 */
export async function deleteProfile(userId: string): Promise<void> {
  try {
    await getProfilesCollection().doc(userId).delete();
    log.debug({ userId }, 'Deleted memory intelligence profile');
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to delete profile');
  }
}

// ============================================================================
// RECORD PERSISTENCE
// ============================================================================

/**
 * Serialize a SurfacedMemoryRecord for Firestore
 */
function serializeRecord(record: SurfacedMemoryRecord): SerializedRecord {
  return {
    memoryId: record.memoryId,
    userId: record.userId,
    sessionId: record.sessionId,
    surfacedAt: record.surfacedAt.toISOString(),
    trigger: record.trigger,
    style: record.style,
    persona: record.persona,
    contextSnapshot: record.contextSnapshot,
    response: record.response
      ? {
          type: record.response.type,
          intensity: record.response.intensity,
          timestamp: record.response.timestamp.toISOString(),
          turnsUntilResponse: record.response.turnsUntilResponse,
        }
      : undefined,
  };
}

/**
 * Deserialize a SurfacedMemoryRecord from Firestore
 */
function deserializeRecord(data: SerializedRecord): SurfacedMemoryRecord {
  return {
    memoryId: data.memoryId,
    userId: data.userId,
    sessionId: data.sessionId,
    surfacedAt: new Date(data.surfacedAt),
    trigger: data.trigger,
    style: data.style,
    persona: data.persona,
    contextSnapshot: data.contextSnapshot,
    response: data.response
      ? {
          type: data.response.type as SurfacedMemoryRecord['response'] extends { type: infer T } ? T : never,
          intensity: data.response.intensity,
          timestamp: new Date(data.response.timestamp),
          turnsUntilResponse: data.response.turnsUntilResponse,
        }
      : undefined,
  };
}

/**
 * Save surfaced memory records to Firestore (batch)
 */
export async function saveRecords(records: SurfacedMemoryRecord[]): Promise<void> {
  if (records.length === 0) return;

  try {
    const firestore = getDb();
    const batch = firestore.batch();
    const collection = getRecordsCollection();

    for (const record of records) {
      const docId = `${record.userId}_${record.sessionId}_${record.memoryId}`;
      const serialized = serializeRecord(record);
      batch.set(collection.doc(docId), serialized, { merge: true });
    }

    await batch.commit();
    log.debug({ count: records.length }, 'Saved memory surfacing records');
  } catch (error) {
    log.warn({ error: String(error), count: records.length }, 'Failed to save records');
  }
}

/**
 * Load recent records for a user
 */
export async function loadRecords(
  userId: string,
  options?: { limit?: number; sessionId?: string }
): Promise<SurfacedMemoryRecord[]> {
  try {
    let query = getRecordsCollection()
      .where('userId', '==', userId)
      .orderBy('surfacedAt', 'desc');

    if (options?.sessionId) {
      query = query.where('sessionId', '==', options.sessionId);
    }

    if (options?.limit) {
      query = query.limit(options.limit);
    }

    const snapshot = await query.get();
    return snapshot.docs.map((doc) => deserializeRecord(doc.data() as SerializedRecord));
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to load records');
    return [];
  }
}

/**
 * Load records for profile building (last N sessions)
 */
export async function loadRecordsForProfileBuilding(
  userId: string,
  options?: { maxSessions?: number; maxRecords?: number }
): Promise<SurfacedMemoryRecord[]> {
  const maxRecords = options?.maxRecords || 100;
  
  try {
    const records = await loadRecords(userId, { limit: maxRecords });
    
    // Optionally limit by number of sessions
    if (options?.maxSessions) {
      const sessionIds = new Set<string>();
      const filtered: SurfacedMemoryRecord[] = [];
      
      for (const record of records) {
        if (sessionIds.size < options.maxSessions || sessionIds.has(record.sessionId)) {
          sessionIds.add(record.sessionId);
          filtered.push(record);
        } else {
          break;
        }
      }
      
      return filtered;
    }
    
    return records;
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to load records for profile building');
    return [];
  }
}

/**
 * Delete old records (for cleanup)
 */
export async function deleteOldRecords(userId: string, olderThan: Date): Promise<number> {
  try {
    const snapshot = await getRecordsCollection()
      .where('userId', '==', userId)
      .where('surfacedAt', '<', olderThan.toISOString())
      .get();

    if (snapshot.empty) return 0;

    const batch = getDb().batch();
    snapshot.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();

    log.debug({ userId, deleted: snapshot.size }, 'Deleted old records');
    return snapshot.size;
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to delete old records');
    return 0;
  }
}

// ============================================================================
// AGGREGATION HELPERS
// ============================================================================

/**
 * Get summary statistics for a user
 */
export async function getStats(userId: string): Promise<{
  totalSurfacings: number;
  totalEngagements: number;
  totalDeflections: number;
  sessionsTracked: number;
  averageEngagementRate: number;
}> {
  try {
    const records = await loadRecords(userId, { limit: 1000 });
    
    const sessionIds = new Set(records.map((r) => r.sessionId));
    let engagements = 0;
    let deflections = 0;
    
    for (const record of records) {
      if (record.response) {
        if (record.response.type === 'engaged' || record.response.type === 'acknowledged') {
          engagements++;
        } else if (record.response.type === 'deflected' || record.response.type === 'ignored') {
          deflections++;
        }
      }
    }
    
    const responded = engagements + deflections;
    const engagementRate = responded > 0 ? engagements / responded : 0.5;
    
    return {
      totalSurfacings: records.length,
      totalEngagements: engagements,
      totalDeflections: deflections,
      sessionsTracked: sessionIds.size,
      averageEngagementRate: engagementRate,
    };
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to get stats');
    return {
      totalSurfacings: 0,
      totalEngagements: 0,
      totalDeflections: 0,
      sessionsTracked: 0,
      averageEngagementRate: 0.5,
    };
  }
}
