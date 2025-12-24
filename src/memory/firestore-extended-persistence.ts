/**
 * Extended Firestore Persistence
 *
 * Persists additional data that was previously ephemeral:
 * - Session state (survives restarts)
 * - Tool execution logs (for pattern analysis)
 * - Persona bonds (relationship with each persona)
 * - Voice profiles (vocal characteristics)
 * - User intents (intent history for learning)
 * - Superhuman cache (cached insights)
 * - Quality metrics (per-session quality data)
 *
 * Schema:
 * - bogle_users/{userId}/sessions/{sessionId} → SessionState
 * - bogle_users/{userId}/tool_executions/{executionId} → ToolExecution
 * - bogle_users/{userId}/persona_bonds/{personaId} → PersonaBond
 * - bogle_users/{userId}/voice_profile → VoiceProfile
 * - bogle_users/{userId}/intents/{intentId} → UserIntent
 * - bogle_users/{userId}/superhuman_cache/{cacheKey} → CachedInsight
 * - bogle_users/{userId}/quality_metrics/{sessionId} → QualityMetrics
 *
 * @module memory/firestore-extended-persistence
 */

import { createLogger } from '../utils/safe-logger.js';

const log = createLogger({ module: 'FirestoreExtendedPersistence' });

// ============================================================================
// TYPES
// ============================================================================

// Minimal Firestore types (to avoid hard dependency)
interface Firestore {
  collection: (path: string) => CollectionReference;
}

interface CollectionReference {
  doc: (id: string) => DocumentReference;
  get: () => Promise<QuerySnapshot>;
  add: (data: unknown) => Promise<DocumentReference>;
  where: (field: string, op: string, value: unknown) => Query;
  orderBy: (field: string, direction?: 'asc' | 'desc') => Query;
  limit: (n: number) => Query;
}

interface Query {
  get: () => Promise<QuerySnapshot>;
  limit: (n: number) => Query;
  orderBy: (field: string, direction?: 'asc' | 'desc') => Query;
}

interface DocumentReference {
  id: string;
  set: (data: unknown, options?: { merge?: boolean }) => Promise<unknown>;
  get: () => Promise<DocumentSnapshot>;
  delete: () => Promise<unknown>;
  update: (data: unknown) => Promise<unknown>;
  collection: (name: string) => CollectionReference;
}

interface DocumentSnapshot {
  exists: boolean;
  data: () => Record<string, unknown> | undefined;
  id: string;
  ref: DocumentReference;
}

interface QuerySnapshot {
  empty: boolean;
  docs: DocumentSnapshot[];
  size: number;
}

// ============================================================================
// SESSION STATE
// ============================================================================

export interface SessionState {
  sessionId: string;
  userId: string;
  startedAt: Date;
  lastActiveAt: Date;
  personaId: string;
  connectionType: 'webrtc' | 'websocket';
  deviceInfo?: {
    platform?: string;
    browser?: string;
    deviceId?: string;
  };
  context?: {
    mood?: string;
    topics?: string[];
    emotionalState?: string;
  };
  isActive: boolean;
}

interface SerializedSession {
  sessionId: string;
  userId: string;
  startedAt: string;
  lastActiveAt: string;
  personaId: string;
  connectionType: string;
  deviceInfo?: Record<string, string>;
  context?: Record<string, unknown>;
  isActive: boolean;
}

// ============================================================================
// TOOL EXECUTION
// ============================================================================

export interface ToolExecution {
  id: string;
  sessionId: string;
  toolId: string;
  toolName: string;
  parameters: Record<string, unknown>;
  result?: string;
  success: boolean;
  errorMessage?: string;
  durationMs: number;
  executedAt: Date;
  personaId: string;
}

interface SerializedToolExecution extends Omit<ToolExecution, 'executedAt'> {
  executedAt: string;
}

// ============================================================================
// PERSONA BOND
// ============================================================================

export interface PersonaBond {
  personaId: string;
  userId: string;
  totalConversations: number;
  totalDurationMinutes: number;
  firstConversation: Date;
  lastConversation: Date;
  trustLevel: number; // 0-100
  preferredTopics: string[];
  memorableExchanges: Array<{
    date: Date;
    topic: string;
    emotionalResonance: number;
  }>;
  communicationStyle?: {
    formalityPreference: 'formal' | 'casual' | 'adaptive';
    humorAppreciation: number;
    detailPreference: 'brief' | 'detailed' | 'adaptive';
  };
}

interface SerializedPersonaBond extends Omit<
  PersonaBond,
  'firstConversation' | 'lastConversation' | 'memorableExchanges'
> {
  firstConversation: string;
  lastConversation: string;
  memorableExchanges: Array<{
    date: string;
    topic: string;
    emotionalResonance: number;
  }>;
}

// ============================================================================
// VOICE PROFILE
// ============================================================================

export interface VoiceProfile {
  userId: string;
  updatedAt: Date;
  characteristics: {
    avgPitch?: number;
    avgSpeed?: number;
    volumeProfile?: 'soft' | 'moderate' | 'loud';
    clarity?: number;
  };
  preferences: {
    preferredResponseSpeed?: 'slow' | 'normal' | 'fast';
    pauseTolerance?: number; // ms before interruption feels natural
    preferredVoiceId?: string;
  };
  emotionalSignatures?: Array<{
    emotion: string;
    voicePattern: string; // e.g., "pitch rises, speed increases"
    detectedCount: number;
  }>;
  enrollmentStatus?: 'not_enrolled' | 'enrolled' | 'needs_refresh';
}

interface SerializedVoiceProfile extends Omit<VoiceProfile, 'updatedAt'> {
  updatedAt: string;
}

// ============================================================================
// USER INTENT
// ============================================================================

export interface UserIntent {
  id: string;
  userId: string;
  sessionId: string;
  utterance: string;
  detectedIntent: string;
  confidence: number;
  entities?: Record<string, string>;
  routedToTool?: string;
  successful: boolean;
  correctedIntent?: string; // If user corrected our understanding
  timestamp: Date;
}

interface SerializedUserIntent extends Omit<UserIntent, 'timestamp'> {
  timestamp: string;
}

// ============================================================================
// SUPERHUMAN CACHE
// ============================================================================

export interface CachedInsight {
  cacheKey: string;
  userId: string;
  insightType: string; // e.g., 'commitment_keeper', 'predictive_coaching'
  data: Record<string, unknown>;
  computedAt: Date;
  expiresAt: Date;
  hitCount: number;
}

interface SerializedCachedInsight extends Omit<CachedInsight, 'computedAt' | 'expiresAt'> {
  computedAt: string;
  expiresAt: string;
}

// ============================================================================
// QUALITY METRICS
// ============================================================================

export interface QualityMetrics {
  sessionId: string;
  userId: string;
  recordedAt: Date;
  audioQuality: {
    avgLatencyMs?: number;
    packetLoss?: number;
    jitter?: number;
  };
  conversationQuality: {
    turnsCount: number;
    avgTurnDurationMs: number;
    interruptionCount: number;
    silencePercentage: number;
  };
  userSatisfaction?: {
    explicit?: number; // If user rated
    inferred?: number; // From sentiment analysis
  };
  toolsUsed: string[];
  errorsEncountered: string[];
}

interface SerializedQualityMetrics extends Omit<QualityMetrics, 'recordedAt'> {
  recordedAt: string;
}

// ============================================================================
// FIRESTORE INSTANCE
// ============================================================================

let db: Firestore | null = null;

/**
 * Configure the Firestore instance (call once at startup)
 */
export function configureFirestoreExtended(firestore: Firestore): void {
  db = firestore;
}

/**
 * Get the Firestore instance, with lazy loading fallback
 */
async function getDb(): Promise<Firestore | null> {
  if (db) return db;

  try {
    const { getFirestore } = await import('firebase-admin/firestore');
    db = getFirestore() as unknown as Firestore;
    return db;
  } catch {
    log.debug('Firestore not available');
    return null;
  }
}

// ============================================================================
// SESSION STATE OPERATIONS
// ============================================================================

export async function saveSessionState(session: SessionState): Promise<void> {
  const firestore = await getDb();
  if (!firestore) return;

  const serialized: SerializedSession = {
    ...session,
    startedAt: session.startedAt.toISOString(),
    lastActiveAt: session.lastActiveAt.toISOString(),
  };

  try {
    await firestore
      .collection('bogle_users')
      .doc(session.userId)
      .collection('sessions')
      .doc(session.sessionId)
      .set(serialized, { merge: true });

    log.debug({ sessionId: session.sessionId }, 'Session state saved');
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to save session state');
  }
}

export async function getSessionState(
  userId: string,
  sessionId: string
): Promise<SessionState | null> {
  const firestore = await getDb();
  if (!firestore) return null;

  try {
    const doc = await firestore
      .collection('bogle_users')
      .doc(userId)
      .collection('sessions')
      .doc(sessionId)
      .get();

    if (!doc.exists) return null;

    const data = doc.data() as unknown as SerializedSession;
    return {
      ...data,
      startedAt: new Date(data.startedAt),
      lastActiveAt: new Date(data.lastActiveAt),
    } as SessionState;
  } catch (error) {
    log.debug({ error: String(error) }, 'Failed to get session state');
    return null;
  }
}

export async function getRecentSessions(
  userId: string,
  limit: number = 10
): Promise<SessionState[]> {
  const firestore = await getDb();
  if (!firestore) return [];

  try {
    const snapshot = await firestore
      .collection('bogle_users')
      .doc(userId)
      .collection('sessions')
      .orderBy('lastActiveAt', 'desc')
      .limit(limit)
      .get();

    return snapshot.docs.map((doc) => {
      const data = doc.data() as unknown as SerializedSession;
      return {
        ...data,
        startedAt: new Date(data.startedAt),
        lastActiveAt: new Date(data.lastActiveAt),
      } as SessionState;
    });
  } catch (error) {
    log.debug({ error: String(error) }, 'Failed to get recent sessions');
    return [];
  }
}

// ============================================================================
// TOOL EXECUTION OPERATIONS
// ============================================================================

export async function logToolExecution(execution: ToolExecution): Promise<void> {
  const firestore = await getDb();
  if (!firestore) return;

  const serialized: SerializedToolExecution = {
    ...execution,
    executedAt: execution.executedAt.toISOString(),
  };

  try {
    await firestore
      .collection('bogle_users')
      .doc(execution.sessionId.split('_')[0]) // Extract userId from sessionId
      .collection('tool_executions')
      .doc(execution.id)
      .set(serialized);

    log.debug({ toolId: execution.toolId }, 'Tool execution logged');
  } catch (error) {
    log.debug({ error: String(error) }, 'Failed to log tool execution');
  }
}

export async function getToolExecutions(
  userId: string,
  options?: { toolId?: string; limit?: number; since?: Date }
): Promise<ToolExecution[]> {
  const firestore = await getDb();
  if (!firestore) return [];

  try {
    let query = firestore
      .collection('bogle_users')
      .doc(userId)
      .collection('tool_executions')
      .orderBy('executedAt', 'desc');

    if (options?.limit) {
      query = query.limit(options.limit);
    }

    const snapshot = await query.get();

    return snapshot.docs.map((doc) => {
      const data = doc.data() as unknown as SerializedToolExecution;
      return {
        ...data,
        executedAt: new Date(data.executedAt),
      } as ToolExecution;
    });
  } catch (error) {
    log.debug({ error: String(error) }, 'Failed to get tool executions');
    return [];
  }
}

// ============================================================================
// PERSONA BOND OPERATIONS
// ============================================================================

export async function savePersonaBond(bond: PersonaBond): Promise<void> {
  const firestore = await getDb();
  if (!firestore) return;

  const serialized: SerializedPersonaBond = {
    ...bond,
    firstConversation: bond.firstConversation.toISOString(),
    lastConversation: bond.lastConversation.toISOString(),
    memorableExchanges: bond.memorableExchanges.map((e) => ({
      ...e,
      date: e.date.toISOString(),
    })),
  };

  try {
    await firestore
      .collection('bogle_users')
      .doc(bond.userId)
      .collection('persona_bonds')
      .doc(bond.personaId)
      .set(serialized, { merge: true });

    log.debug({ personaId: bond.personaId }, 'Persona bond saved');
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to save persona bond');
  }
}

export async function getPersonaBond(
  userId: string,
  personaId: string
): Promise<PersonaBond | null> {
  const firestore = await getDb();
  if (!firestore) return null;

  try {
    const doc = await firestore
      .collection('bogle_users')
      .doc(userId)
      .collection('persona_bonds')
      .doc(personaId)
      .get();

    if (!doc.exists) return null;

    const data = doc.data() as unknown as SerializedPersonaBond;
    return {
      ...data,
      firstConversation: new Date(data.firstConversation),
      lastConversation: new Date(data.lastConversation),
      memorableExchanges: data.memorableExchanges.map((e) => ({
        ...e,
        date: new Date(e.date),
      })),
    } as PersonaBond;
  } catch (error) {
    log.debug({ error: String(error) }, 'Failed to get persona bond');
    return null;
  }
}

export async function getAllPersonaBonds(userId: string): Promise<PersonaBond[]> {
  const firestore = await getDb();
  if (!firestore) return [];

  try {
    const snapshot = await firestore
      .collection('bogle_users')
      .doc(userId)
      .collection('persona_bonds')
      .get();

    return snapshot.docs.map((doc) => {
      const data = doc.data() as unknown as SerializedPersonaBond;
      return {
        ...data,
        firstConversation: new Date(data.firstConversation),
        lastConversation: new Date(data.lastConversation),
        memorableExchanges: data.memorableExchanges.map((e) => ({
          ...e,
          date: new Date(e.date),
        })),
      } as PersonaBond;
    });
  } catch (error) {
    log.debug({ error: String(error) }, 'Failed to get persona bonds');
    return [];
  }
}

// ============================================================================
// VOICE PROFILE OPERATIONS
// ============================================================================

export async function saveVoiceProfile(profile: VoiceProfile): Promise<void> {
  const firestore = await getDb();
  if (!firestore) return;

  const serialized: SerializedVoiceProfile = {
    ...profile,
    updatedAt: profile.updatedAt.toISOString(),
  };

  try {
    await firestore
      .collection('bogle_users')
      .doc(profile.userId)
      .collection('voice_profile')
      .doc('current')
      .set(serialized, { merge: true });

    log.debug({ userId: profile.userId }, 'Voice profile saved');
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to save voice profile');
  }
}

export async function getVoiceProfile(userId: string): Promise<VoiceProfile | null> {
  const firestore = await getDb();
  if (!firestore) return null;

  try {
    const doc = await firestore
      .collection('bogle_users')
      .doc(userId)
      .collection('voice_profile')
      .doc('current')
      .get();

    if (!doc.exists) return null;

    const data = doc.data() as unknown as SerializedVoiceProfile;
    return {
      ...data,
      updatedAt: new Date(data.updatedAt),
    } as VoiceProfile;
  } catch (error) {
    log.debug({ error: String(error) }, 'Failed to get voice profile');
    return null;
  }
}

// ============================================================================
// USER INTENT OPERATIONS
// ============================================================================

export async function logUserIntent(intent: UserIntent): Promise<void> {
  const firestore = await getDb();
  if (!firestore) return;

  const serialized: SerializedUserIntent = {
    ...intent,
    timestamp: intent.timestamp.toISOString(),
  };

  try {
    await firestore
      .collection('bogle_users')
      .doc(intent.userId)
      .collection('intents')
      .doc(intent.id)
      .set(serialized);

    log.debug({ intent: intent.detectedIntent }, 'User intent logged');
  } catch (error) {
    log.debug({ error: String(error) }, 'Failed to log user intent');
  }
}

export async function getRecentIntents(
  userId: string,
  limit: number = 50
): Promise<UserIntent[]> {
  const firestore = await getDb();
  if (!firestore) return [];

  try {
    const snapshot = await firestore
      .collection('bogle_users')
      .doc(userId)
      .collection('intents')
      .orderBy('timestamp', 'desc')
      .limit(limit)
      .get();

    return snapshot.docs.map((doc) => {
      const data = doc.data() as unknown as SerializedUserIntent;
      return {
        ...data,
        timestamp: new Date(data.timestamp),
      } as UserIntent;
    });
  } catch (error) {
    log.debug({ error: String(error) }, 'Failed to get recent intents');
    return [];
  }
}

// ============================================================================
// SUPERHUMAN CACHE OPERATIONS
// ============================================================================

export async function setCachedInsight(insight: CachedInsight): Promise<void> {
  const firestore = await getDb();
  if (!firestore) return;

  const serialized: SerializedCachedInsight = {
    ...insight,
    computedAt: insight.computedAt.toISOString(),
    expiresAt: insight.expiresAt.toISOString(),
  };

  try {
    await firestore
      .collection('bogle_users')
      .doc(insight.userId)
      .collection('superhuman_cache')
      .doc(insight.cacheKey)
      .set(serialized, { merge: true });

    log.debug({ cacheKey: insight.cacheKey }, 'Superhuman insight cached');
  } catch (error) {
    log.debug({ error: String(error) }, 'Failed to cache insight');
  }
}

export async function getCachedInsight(
  userId: string,
  cacheKey: string
): Promise<CachedInsight | null> {
  const firestore = await getDb();
  if (!firestore) return null;

  try {
    const doc = await firestore
      .collection('bogle_users')
      .doc(userId)
      .collection('superhuman_cache')
      .doc(cacheKey)
      .get();

    if (!doc.exists) return null;

    const data = doc.data() as unknown as SerializedCachedInsight;
    const insight: CachedInsight = {
      ...data,
      computedAt: new Date(data.computedAt),
      expiresAt: new Date(data.expiresAt),
    };

    // Check if expired
    if (insight.expiresAt < new Date()) {
      // Delete expired cache entry
      await doc.ref.delete();
      return null;
    }

    // Increment hit count
    await doc.ref.update({ hitCount: insight.hitCount + 1 });

    return insight;
  } catch (error) {
    log.debug({ error: String(error) }, 'Failed to get cached insight');
    return null;
  }
}

// ============================================================================
// QUALITY METRICS OPERATIONS
// ============================================================================

export async function saveQualityMetrics(metrics: QualityMetrics): Promise<void> {
  const firestore = await getDb();
  if (!firestore) return;

  const serialized: SerializedQualityMetrics = {
    ...metrics,
    recordedAt: metrics.recordedAt.toISOString(),
  };

  try {
    await firestore
      .collection('bogle_users')
      .doc(metrics.userId)
      .collection('quality_metrics')
      .doc(metrics.sessionId)
      .set(serialized);

    log.debug({ sessionId: metrics.sessionId }, 'Quality metrics saved');
  } catch (error) {
    log.debug({ error: String(error) }, 'Failed to save quality metrics');
  }
}

export async function getQualityMetrics(
  userId: string,
  options?: { limit?: number; since?: Date }
): Promise<QualityMetrics[]> {
  const firestore = await getDb();
  if (!firestore) return [];

  try {
    let query = firestore
      .collection('bogle_users')
      .doc(userId)
      .collection('quality_metrics')
      .orderBy('recordedAt', 'desc');

    if (options?.limit) {
      query = query.limit(options.limit);
    }

    const snapshot = await query.get();

    return snapshot.docs.map((doc) => {
      const data = doc.data() as unknown as SerializedQualityMetrics;
      return {
        ...data,
        recordedAt: new Date(data.recordedAt),
      } as QualityMetrics;
    });
  } catch (error) {
    log.debug({ error: String(error) }, 'Failed to get quality metrics');
    return [];
  }
}

// ============================================================================
// GDPR DELETION
// ============================================================================

/**
 * Delete all extended data for a user (GDPR compliance)
 */
export async function deleteAllExtendedUserData(userId: string): Promise<{
  deleted: string[];
  errors: string[];
}> {
  const firestore = await getDb();
  if (!firestore) return { deleted: [], errors: ['Firestore not available'] };

  const collections = [
    'sessions',
    'tool_executions',
    'persona_bonds',
    'voice_profile',
    'intents',
    'superhuman_cache',
    'quality_metrics',
  ];

  const deleted: string[] = [];
  const errors: string[] = [];

  for (const collectionName of collections) {
    try {
      const collectionRef = firestore
        .collection('bogle_users')
        .doc(userId)
        .collection(collectionName);

      const snapshot = await collectionRef.get();

      // Delete each document
      for (const doc of snapshot.docs) {
        await doc.ref.delete();
      }

      deleted.push(collectionName);
      log.info({ userId, collection: collectionName }, 'Collection deleted for GDPR');
    } catch (error) {
      errors.push(`${collectionName}: ${String(error)}`);
      log.error({ error: String(error), collection: collectionName }, 'GDPR deletion failed');
    }
  }

  return { deleted, errors };
}
