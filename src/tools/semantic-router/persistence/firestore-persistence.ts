/**
 * Firestore Persistence for Semantic Router
 *
 * Provides persistent storage for:
 * - Routing corrections (active learning)
 * - User personalization profiles
 * - Routing analytics/events
 * - A/B test results
 *
 * Uses the same Firestore instance as the memory module.
 *
 * @module tools/semantic-router/persistence/firestore-persistence
 */

import { createLogger } from '../../../utils/safe-logger.js';
import { cleanForFirestore } from '../../../utils/firestore-utils.js';

const log = createLogger({ module: 'semantic-router:persistence' });

// ============================================================================
// TYPES (mirrors Firestore SDK interfaces)
// ============================================================================

export interface FirestoreDB {
  collection: (path: string) => CollectionReference;
}

export interface CollectionReference {
  doc: (id: string) => DocumentReference;
  add: (data: Record<string, unknown>) => Promise<DocumentReference>;
  where: (field: string, op: string, value: unknown) => Query;
  orderBy: (field: string, direction?: 'asc' | 'desc') => Query;
  limit: (n: number) => Query;
  get: () => Promise<QuerySnapshot>;
}

export interface DocumentReference {
  id: string;
  set: (data: Record<string, unknown>, options?: { merge?: boolean }) => Promise<void>;
  get: () => Promise<DocumentSnapshot>;
  update: (data: Record<string, unknown>) => Promise<void>;
  delete: () => Promise<void>;
  collection: (name: string) => CollectionReference;
}

export interface DocumentSnapshot {
  exists: boolean;
  id: string;
  data: () => Record<string, unknown> | undefined;
}

interface QuerySnapshot {
  empty: boolean;
  docs: DocumentSnapshot[];
  size: number;
}

interface Query {
  where: (field: string, op: string, value: unknown) => Query;
  orderBy: (field: string, direction?: 'asc' | 'desc') => Query;
  limit: (n: number) => Query;
  get: () => Promise<QuerySnapshot>;
}

// ============================================================================
// COLLECTION NAMES
// ============================================================================

export const COLLECTIONS = {
  CORRECTIONS: 'semantic_router_corrections',
  USER_PROFILES: 'user_tool_profiles',
  ROUTING_EVENTS: 'semantic_router_events',
  AB_TESTS: 'semantic_router_ab_tests',
  LEARNING_STATE: 'semantic_router_learning',
  TOOL_EMBEDDINGS: 'semantic_router_tool_embeddings',
} as const;

// ============================================================================
// FIRESTORE CONNECTION
// ============================================================================

let firestoreInstance: FirestoreDB | null = null;
let initializationPromise: Promise<void> | null = null;

/**
 * Initialize the Firestore connection for semantic router
 * Reuses existing Firestore instance from memory module if available
 */
export async function initializeFirestorePersistence(): Promise<void> {
  if (firestoreInstance) return;

  if (initializationPromise) {
    await initializationPromise;
    return;
  }

  initializationPromise = doInitialize();
  await initializationPromise;
  initializationPromise = null;
}

async function doInitialize(): Promise<void> {
  try {
    // Try to get Firestore from the memory module's store factory
    const { getFirestoreStore } = await import('../../../memory/firestore-store.js');
    const store = getFirestoreStore();

    // The store has a private db property - we need to access it
    // This is a bit hacky, but avoids creating a second Firestore connection
    if (store && (store as unknown as { db?: FirestoreDB }).db) {
      firestoreInstance = (store as unknown as { db: FirestoreDB }).db;
      log.info('Using existing Firestore connection from memory module');
      return;
    }
  } catch {
    log.debug('Memory module Firestore not available, initializing standalone');
  }

  // Fall back to initializing our own connection
  try {
    const hasGCP = Boolean(process.env.GOOGLE_CLOUD_PROJECT);
    if (!hasGCP) {
      log.warn('No GOOGLE_CLOUD_PROJECT - semantic router persistence disabled');
      return;
    }

    const { Firestore } = await import('@google-cloud/firestore');
    firestoreInstance = new Firestore({
      projectId: process.env.GOOGLE_CLOUD_PROJECT,
      databaseId: process.env.FIRESTORE_DATABASE || '(default)',
    }) as unknown as FirestoreDB;

    log.info('Firestore persistence initialized for semantic router');
  } catch (error) {
    log.warn({ error: String(error) }, 'Failed to initialize Firestore - using in-memory only');
  }
}

/**
 * Get the Firestore instance (null if not initialized)
 */
export function getFirestore(): FirestoreDB | null {
  return firestoreInstance;
}

/**
 * Check if persistence is available
 */
export function isPersistenceAvailable(): boolean {
  return firestoreInstance !== null;
}

// ============================================================================
// CORRECTION PERSISTENCE
// ============================================================================

export interface PersistedCorrection {
  id: string;
  timestamp: Date;
  userId: string;
  sessionId: string;
  originalQuery: string;
  normalizedQuery: string;
  predictedTool: string;
  predictedConfidence: number;
  predictedArgs: Record<string, unknown>;
  actualTool: string | null;
  actualArgs?: Record<string, unknown>;
  correctionSource: 'user_explicit' | 'user_implicit' | 'system';
  conversationContext: string[];
  personaId: string;
  feedbackType: 'wrong_tool' | 'wrong_args' | 'should_not_call' | 'missed_tool';
  userFeedback?: string;
}

/**
 * Save a routing correction to Firestore
 */
export async function saveCorrection(correction: PersistedCorrection): Promise<void> {
  if (!firestoreInstance) {
    log.debug('Firestore not available - correction not persisted');
    return;
  }

  try {
    await firestoreInstance
      .collection(COLLECTIONS.CORRECTIONS)
      .doc(correction.id)
      .set(
        cleanForFirestore({
          ...correction,
          timestamp: correction.timestamp,
          _createdAt: new Date(),
        })
      );

    log.debug({ correctionId: correction.id }, 'Correction persisted to Firestore');
  } catch (error) {
    log.error(
      { error: String(error), correctionId: correction.id },
      'Failed to persist correction'
    );
  }
}

/**
 * Load corrections from Firestore
 */
export async function loadCorrections(options?: {
  userId?: string;
  since?: Date;
  limit?: number;
}): Promise<PersistedCorrection[]> {
  if (!firestoreInstance) {
    return [];
  }

  try {
    let query = firestoreInstance.collection(COLLECTIONS.CORRECTIONS) as Query;

    if (options?.userId) {
      query = query.where('userId', '==', options.userId);
    }
    if (options?.since) {
      query = query.where('timestamp', '>=', options.since);
    }

    query = query.orderBy('timestamp', 'desc');

    if (options?.limit) {
      query = query.limit(options.limit);
    }

    const snapshot = await query.get();

    return snapshot.docs.map((doc) => {
      const data = doc.data()!;
      return {
        ...data,
        id: doc.id,
        timestamp:
          (data.timestamp as { toDate?: () => Date })?.toDate?.() ||
          new Date(data.timestamp as string),
      } as PersistedCorrection;
    });
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to load corrections');
    return [];
  }
}

// ============================================================================
// USER PROFILE PERSISTENCE (Enhanced for FTIS Phase 1.3)
// ============================================================================

/**
 * Domain affinity - how much a user uses tools from each domain
 */
export interface DomainAffinity {
  domain: string;
  usageCount: number;
  successRate: number;
  avgSatisfaction: number;
  lastUsed: Date;
}

/**
 * Persona-specific tool preferences
 */
export interface PersonaToolPreference {
  personaId: string;
  favoriteTools: string[];
  avoidedTools: string[];
  customBoosts: Record<string, number>;
  lastInteraction: Date;
}

/**
 * Aggregated tool outcome metrics
 */
export interface ToolOutcomeHistory {
  toolId: string;
  totalCalls: number;
  successCount: number;
  failureCount: number;
  avgLatencyMs: number;
  lastOutcome: 'success' | 'failure' | 'unknown';
  lastUsed: Date;
}

/**
 * User's learning/adaptation preferences
 */
export interface LearningPreferences {
  /** How quickly user preferences should adapt (0.0 = slow, 1.0 = fast) */
  adaptationRate: number;
  /** Whether to use experimental tool suggestions */
  experimentalToolsEnabled: boolean;
  /** Preferred tool complexity level */
  preferredComplexity: 'simple' | 'standard' | 'advanced';
  /** Whether to allow multi-tool plans */
  allowMultiToolPlans: boolean;
}

/**
 * Enhanced user profile with FTIS preferences
 */
export interface PersistedUserProfile {
  userId: string;

  // === Original fields ===
  toolBoosts: Record<string, number>;
  vocabulary: Record<string, string>;
  timePatterns: Record<string, Record<string, number>>;
  contextPatterns: Record<string, Record<string, number>>;
  totalInteractions: number;
  lastUpdated: Date;
  correctionRate: number;

  // === FTIS Enhanced fields (Phase 1.3) ===
  /** Domain-level affinity scores */
  domainAffinities?: Record<string, DomainAffinity>;
  /** Tools the user explicitly never wants suggested */
  excludedTools?: string[];
  /** Per-persona tool preferences */
  personaPreferences?: Record<string, PersonaToolPreference>;
  /** Historical tool outcome aggregates */
  toolOutcomes?: Record<string, ToolOutcomeHistory>;
  /** User's learning/adaptation preferences */
  learningPreferences?: LearningPreferences;
  /** Profile version for migrations */
  profileVersion?: number;
  /** When the profile was created */
  createdAt?: Date;
}

/**
 * Save user profile to Firestore
 */
export async function saveUserProfile(profile: PersistedUserProfile): Promise<void> {
  if (!firestoreInstance) {
    log.debug('Firestore not available - profile not persisted');
    return;
  }

  try {
    await firestoreInstance
      .collection(COLLECTIONS.USER_PROFILES)
      .doc(profile.userId)
      .set(
        cleanForFirestore({
          ...profile,
          lastUpdated: profile.lastUpdated,
          _updatedAt: new Date(),
        })
      );

    log.debug({ userId: profile.userId }, 'User profile persisted to Firestore');
  } catch (error) {
    log.error({ error: String(error), userId: profile.userId }, 'Failed to persist user profile');
  }
}

/**
 * Load user profile from Firestore
 */
export async function loadUserProfile(userId: string): Promise<PersistedUserProfile | null> {
  if (!firestoreInstance) {
    return null;
  }

  try {
    const doc = await firestoreInstance.collection(COLLECTIONS.USER_PROFILES).doc(userId).get();

    if (!doc.exists) {
      return null;
    }

    const data = doc.data()!;
    return deserializeUserProfile(data, doc.id);
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to load user profile');
    return null;
  }
}

/**
 * Deserialize Firestore data to PersistedUserProfile
 */
function deserializeUserProfile(
  data: Record<string, unknown>,
  userId: string
): PersistedUserProfile {
  // Deserialize domain affinities
  const domainAffinities: Record<string, DomainAffinity> | undefined = data.domainAffinities
    ? Object.fromEntries(
        Object.entries(data.domainAffinities as Record<string, unknown>).map(([domain, aff]) => {
          const affData = aff as Record<string, unknown>;
          return [
            domain,
            {
              domain,
              usageCount: affData.usageCount as number,
              successRate: affData.successRate as number,
              avgSatisfaction: affData.avgSatisfaction as number,
              lastUsed: (affData.lastUsed as { toDate?: () => Date })?.toDate?.() || new Date(),
            },
          ];
        })
      )
    : undefined;

  // Deserialize persona preferences
  const personaPreferences: Record<string, PersonaToolPreference> | undefined =
    data.personaPreferences
      ? Object.fromEntries(
          Object.entries(data.personaPreferences as Record<string, unknown>).map(
            ([personaId, pref]) => {
              const prefData = pref as Record<string, unknown>;
              return [
                personaId,
                {
                  personaId,
                  favoriteTools: (prefData.favoriteTools as string[]) || [],
                  avoidedTools: (prefData.avoidedTools as string[]) || [],
                  customBoosts: (prefData.customBoosts as Record<string, number>) || {},
                  lastInteraction:
                    (prefData.lastInteraction as { toDate?: () => Date })?.toDate?.() || new Date(),
                },
              ];
            }
          )
        )
      : undefined;

  // Deserialize tool outcomes
  const toolOutcomes: Record<string, ToolOutcomeHistory> | undefined = data.toolOutcomes
    ? Object.fromEntries(
        Object.entries(data.toolOutcomes as Record<string, unknown>).map(([toolId, outcome]) => {
          const outcomeData = outcome as Record<string, unknown>;
          return [
            toolId,
            {
              toolId,
              totalCalls: outcomeData.totalCalls as number,
              successCount: outcomeData.successCount as number,
              failureCount: outcomeData.failureCount as number,
              avgLatencyMs: outcomeData.avgLatencyMs as number,
              lastOutcome: outcomeData.lastOutcome as 'success' | 'failure' | 'unknown',
              lastUsed: (outcomeData.lastUsed as { toDate?: () => Date })?.toDate?.() || new Date(),
            },
          ];
        })
      )
    : undefined;

  return {
    userId,
    toolBoosts: (data.toolBoosts as Record<string, number>) || {},
    vocabulary: (data.vocabulary as Record<string, string>) || {},
    timePatterns: (data.timePatterns as Record<string, Record<string, number>>) || {},
    contextPatterns: (data.contextPatterns as Record<string, Record<string, number>>) || {},
    totalInteractions: (data.totalInteractions as number) || 0,
    lastUpdated: (data.lastUpdated as { toDate?: () => Date })?.toDate?.() || new Date(),
    correctionRate: (data.correctionRate as number) || 0,
    domainAffinities,
    excludedTools: (data.excludedTools as string[]) || undefined,
    personaPreferences,
    toolOutcomes,
    learningPreferences: data.learningPreferences as LearningPreferences | undefined,
    profileVersion: (data.profileVersion as number) || 1,
    createdAt: (data.createdAt as { toDate?: () => Date })?.toDate?.() || undefined,
  };
}

// ============================================================================
// ENHANCED USER PROFILE OPERATIONS (FTIS Phase 1.3)
// ============================================================================

/**
 * Record a tool outcome for a user (updates aggregates)
 */
export async function recordToolOutcome(
  userId: string,
  outcome: {
    toolId: string;
    success: boolean;
    latencyMs: number;
    domain?: string;
  }
): Promise<void> {
  if (!firestoreInstance) {
    return;
  }

  try {
    const profile = await loadUserProfile(userId);
    if (!profile) {
      log.debug({ userId }, 'No profile found for tool outcome recording');
      return;
    }

    // Update tool outcomes
    const toolOutcomes = profile.toolOutcomes || {};
    const existing = toolOutcomes[outcome.toolId] || {
      toolId: outcome.toolId,
      totalCalls: 0,
      successCount: 0,
      failureCount: 0,
      avgLatencyMs: 0,
      lastOutcome: 'unknown' as const,
      lastUsed: new Date(),
    };

    const newTotal = existing.totalCalls + 1;
    toolOutcomes[outcome.toolId] = {
      ...existing,
      totalCalls: newTotal,
      successCount: existing.successCount + (outcome.success ? 1 : 0),
      failureCount: existing.failureCount + (outcome.success ? 0 : 1),
      avgLatencyMs: (existing.avgLatencyMs * existing.totalCalls + outcome.latencyMs) / newTotal,
      lastOutcome: outcome.success ? 'success' : 'failure',
      lastUsed: new Date(),
    };

    // Update domain affinity if domain provided
    let domainAffinities = profile.domainAffinities;
    if (outcome.domain) {
      domainAffinities = domainAffinities || {};
      const domainAff = domainAffinities[outcome.domain] || {
        domain: outcome.domain,
        usageCount: 0,
        successRate: 0,
        avgSatisfaction: 0.5,
        lastUsed: new Date(),
      };

      const newDomainTotal = domainAff.usageCount + 1;
      const newSuccessRate =
        (domainAff.successRate * domainAff.usageCount + (outcome.success ? 1 : 0)) / newDomainTotal;

      domainAffinities[outcome.domain] = {
        ...domainAff,
        usageCount: newDomainTotal,
        successRate: newSuccessRate,
        lastUsed: new Date(),
      };
    }

    // Save updated profile
    await saveUserProfile({
      ...profile,
      toolOutcomes,
      domainAffinities,
      totalInteractions: profile.totalInteractions + 1,
      lastUpdated: new Date(),
    });

    log.debug(
      { userId, toolId: outcome.toolId, success: outcome.success },
      'Tool outcome recorded'
    );
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to record tool outcome');
  }
}

/**
 * Update domain affinity for a user
 */
export async function updateDomainAffinity(
  userId: string,
  domain: string,
  update: Partial<Omit<DomainAffinity, 'domain'>>
): Promise<void> {
  if (!firestoreInstance) {
    return;
  }

  try {
    const profile = await loadUserProfile(userId);
    if (!profile) {
      return;
    }

    const domainAffinities = profile.domainAffinities || {};
    const existing = domainAffinities[domain] || {
      domain,
      usageCount: 0,
      successRate: 0,
      avgSatisfaction: 0.5,
      lastUsed: new Date(),
    };

    domainAffinities[domain] = {
      ...existing,
      ...update,
      domain,
      lastUsed: new Date(),
    };

    await saveUserProfile({
      ...profile,
      domainAffinities,
      lastUpdated: new Date(),
    });
  } catch (error) {
    log.error({ error: String(error), userId, domain }, 'Failed to update domain affinity');
  }
}

/**
 * Add a tool to user's exclusion list
 */
export async function excludeTool(userId: string, toolId: string): Promise<void> {
  if (!firestoreInstance) {
    return;
  }

  try {
    const profile = await loadUserProfile(userId);
    if (!profile) {
      return;
    }

    const excludedTools = new Set(profile.excludedTools || []);
    excludedTools.add(toolId);

    await saveUserProfile({
      ...profile,
      excludedTools: Array.from(excludedTools),
      lastUpdated: new Date(),
    });

    log.info({ userId, toolId }, 'Tool excluded for user');
  } catch (error) {
    log.error({ error: String(error), userId, toolId }, 'Failed to exclude tool');
  }
}

/**
 * Remove a tool from user's exclusion list
 */
export async function unexcludeTool(userId: string, toolId: string): Promise<void> {
  if (!firestoreInstance) {
    return;
  }

  try {
    const profile = await loadUserProfile(userId);
    if (!profile) {
      return;
    }

    const excludedTools = new Set(profile.excludedTools || []);
    excludedTools.delete(toolId);

    await saveUserProfile({
      ...profile,
      excludedTools: Array.from(excludedTools),
      lastUpdated: new Date(),
    });
  } catch (error) {
    log.error({ error: String(error), userId, toolId }, 'Failed to unexclude tool');
  }
}

/**
 * Update persona-specific tool preferences
 */
export async function updatePersonaPreference(
  userId: string,
  personaId: string,
  update: Partial<Omit<PersonaToolPreference, 'personaId'>>
): Promise<void> {
  if (!firestoreInstance) {
    return;
  }

  try {
    const profile = await loadUserProfile(userId);
    if (!profile) {
      return;
    }

    const personaPreferences = profile.personaPreferences || {};
    const existing = personaPreferences[personaId] || {
      personaId,
      favoriteTools: [],
      avoidedTools: [],
      customBoosts: {},
      lastInteraction: new Date(),
    };

    personaPreferences[personaId] = {
      ...existing,
      ...update,
      personaId,
      lastInteraction: new Date(),
    };

    await saveUserProfile({
      ...profile,
      personaPreferences,
      lastUpdated: new Date(),
    });
  } catch (error) {
    log.error({ error: String(error), userId, personaId }, 'Failed to update persona preference');
  }
}

/**
 * Update user's learning preferences
 */
export async function updateLearningPreferences(
  userId: string,
  preferences: Partial<LearningPreferences>
): Promise<void> {
  if (!firestoreInstance) {
    return;
  }

  try {
    const profile = await loadUserProfile(userId);
    if (!profile) {
      return;
    }

    const existing = profile.learningPreferences || {
      adaptationRate: 0.5,
      experimentalToolsEnabled: false,
      preferredComplexity: 'standard' as const,
      allowMultiToolPlans: true,
    };

    await saveUserProfile({
      ...profile,
      learningPreferences: {
        ...existing,
        ...preferences,
      },
      lastUpdated: new Date(),
    });
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to update learning preferences');
  }
}

/**
 * Get effective tool boosts for a user (combines all preference sources)
 */
export async function getEffectiveToolBoosts(
  userId: string,
  context?: { personaId?: string; domain?: string }
): Promise<Record<string, number>> {
  const profile = await loadUserProfile(userId);
  if (!profile) {
    return {};
  }

  const boosts = { ...profile.toolBoosts };

  // Apply domain affinity boosts
  if (context?.domain && profile.domainAffinities?.[context.domain]) {
    const affinity = profile.domainAffinities[context.domain];
    // Higher usage + success = higher boost
    const domainBoost = (affinity.usageCount / 100) * affinity.successRate * 0.2;
    // This would need tool-to-domain mapping to apply
  }

  // Apply persona-specific boosts
  if (context?.personaId && profile.personaPreferences?.[context.personaId]) {
    const prefs = profile.personaPreferences[context.personaId];

    // Boost favorite tools
    for (const toolId of prefs.favoriteTools) {
      boosts[toolId] = (boosts[toolId] || 0) + 0.15;
    }

    // Penalize avoided tools
    for (const toolId of prefs.avoidedTools) {
      boosts[toolId] = (boosts[toolId] || 0) - 0.3;
    }

    // Apply custom boosts
    for (const [toolId, boost] of Object.entries(prefs.customBoosts)) {
      boosts[toolId] = (boosts[toolId] || 0) + boost;
    }
  }

  // Heavily penalize excluded tools
  if (profile.excludedTools) {
    for (const toolId of profile.excludedTools) {
      boosts[toolId] = -1; // Effectively disables
    }
  }

  // Apply outcome-based adjustments
  if (profile.toolOutcomes) {
    for (const [toolId, outcome] of Object.entries(profile.toolOutcomes)) {
      if (outcome.totalCalls >= 3) {
        // After 3+ uses, adjust based on success rate
        const successRate = outcome.successCount / outcome.totalCalls;
        const adjustment = (successRate - 0.5) * 0.1; // -0.05 to +0.05
        boosts[toolId] = (boosts[toolId] || 0) + adjustment;
      }
    }
  }

  return boosts;
}

/**
 * Create a new user profile with default FTIS settings
 */
export async function createUserProfile(userId: string): Promise<PersistedUserProfile> {
  const profile: PersistedUserProfile = {
    userId,
    toolBoosts: {},
    vocabulary: {},
    timePatterns: {},
    contextPatterns: {},
    totalInteractions: 0,
    lastUpdated: new Date(),
    correctionRate: 0,
    domainAffinities: {},
    excludedTools: [],
    personaPreferences: {},
    toolOutcomes: {},
    learningPreferences: {
      adaptationRate: 0.5,
      experimentalToolsEnabled: false,
      preferredComplexity: 'standard',
      allowMultiToolPlans: true,
    },
    profileVersion: 2, // FTIS enhanced version
    createdAt: new Date(),
  };

  await saveUserProfile(profile);
  return profile;
}

/**
 * Migrate an old profile to FTIS enhanced format
 */
export async function migrateUserProfile(userId: string): Promise<PersistedUserProfile | null> {
  const profile = await loadUserProfile(userId);
  if (!profile) {
    return null;
  }

  // Check if already migrated
  if (profile.profileVersion && profile.profileVersion >= 2) {
    return profile;
  }

  // Add new fields with defaults
  const migrated: PersistedUserProfile = {
    ...profile,
    domainAffinities: profile.domainAffinities || {},
    excludedTools: profile.excludedTools || [],
    personaPreferences: profile.personaPreferences || {},
    toolOutcomes: profile.toolOutcomes || {},
    learningPreferences: profile.learningPreferences || {
      adaptationRate: 0.5,
      experimentalToolsEnabled: false,
      preferredComplexity: 'standard',
      allowMultiToolPlans: true,
    },
    profileVersion: 2,
    createdAt: profile.createdAt || new Date(),
    lastUpdated: new Date(),
  };

  await saveUserProfile(migrated);
  log.info({ userId }, 'User profile migrated to FTIS v2');
  return migrated;
}

// ============================================================================
// ROUTING EVENT PERSISTENCE
// ============================================================================

export interface PersistedRoutingEvent {
  id: string;
  timestamp: Date;
  userId: string;
  sessionId: string;
  personaId: string;
  inputText: string;
  actionType: string;
  toolId?: string;
  confidence?: number;
  latencyMs: number;
  outcome?: {
    toolExecuted: string | null;
    executionSuccess: boolean;
    corrected?: boolean;
    llmFallbackUsed: boolean;
  };
}

/**
 * Save routing event to Firestore
 * Uses date-partitioned subcollections for efficient querying
 */
export async function saveRoutingEvent(event: PersistedRoutingEvent): Promise<void> {
  if (!firestoreInstance) {
    return;
  }

  try {
    const dateStr = event.timestamp.toISOString().split('T')[0]; // YYYY-MM-DD
    await firestoreInstance
      .collection(COLLECTIONS.ROUTING_EVENTS)
      .doc(dateStr)
      .collection('events')
      .doc(event.id)
      .set(
        cleanForFirestore({
          ...event,
          timestamp: event.timestamp,
        })
      );
  } catch (error) {
    log.debug({ error: String(error) }, 'Failed to persist routing event');
  }
}

/**
 * Load routing events from Firestore
 */
export async function loadRoutingEvents(options: {
  date: string; // YYYY-MM-DD
  userId?: string;
  limit?: number;
}): Promise<PersistedRoutingEvent[]> {
  if (!firestoreInstance) {
    return [];
  }

  try {
    let query = firestoreInstance
      .collection(COLLECTIONS.ROUTING_EVENTS)
      .doc(options.date)
      .collection('events') as unknown as Query;

    if (options.userId) {
      query = query.where('userId', '==', options.userId);
    }

    query = query.orderBy('timestamp', 'desc');

    if (options.limit) {
      query = query.limit(options.limit);
    }

    const snapshot = await query.get();

    return snapshot.docs.map((doc) => {
      const data = doc.data()!;
      return {
        ...data,
        id: doc.id,
        timestamp: (data.timestamp as { toDate?: () => Date })?.toDate?.() || new Date(),
      } as PersistedRoutingEvent;
    });
  } catch (error) {
    log.debug({ error: String(error) }, 'Failed to load routing events');
    return [];
  }
}

// ============================================================================
// A/B TEST PERSISTENCE
// ============================================================================

export interface PersistedABTest {
  testId: string;
  variants: Array<{
    name: string;
    weight: number;
    config: Record<string, unknown>;
  }>;
  metrics: string[];
  startDate: Date;
  endDate?: Date;
  results: Record<string, number[]>;
  status: 'running' | 'completed' | 'stopped';
}

/**
 * Save A/B test to Firestore
 */
export async function saveABTest(test: PersistedABTest): Promise<void> {
  if (!firestoreInstance) {
    return;
  }

  try {
    await firestoreInstance
      .collection(COLLECTIONS.AB_TESTS)
      .doc(test.testId)
      .set(
        cleanForFirestore({
          ...test,
          startDate: test.startDate,
          endDate: test.endDate || null,
          _updatedAt: new Date(),
        })
      );
  } catch (error) {
    log.error({ error: String(error), testId: test.testId }, 'Failed to persist A/B test');
  }
}

/**
 * Load A/B tests from Firestore
 */
export async function loadABTests(options?: {
  status?: 'running' | 'completed' | 'stopped';
}): Promise<PersistedABTest[]> {
  if (!firestoreInstance) {
    return [];
  }

  try {
    let query = firestoreInstance.collection(COLLECTIONS.AB_TESTS) as unknown as Query;

    if (options?.status) {
      query = query.where('status', '==', options.status);
    }

    const snapshot = await query.get();

    return snapshot.docs.map((doc) => {
      const data = doc.data()!;
      return {
        ...data,
        testId: doc.id,
        startDate: (data.startDate as { toDate?: () => Date })?.toDate?.() || new Date(),
        endDate: data.endDate ? (data.endDate as { toDate?: () => Date })?.toDate?.() : undefined,
      } as PersistedABTest;
    });
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to load A/B tests');
    return [];
  }
}

// ============================================================================
// TOOL EMBEDDING INDEX PERSISTENCE
// ============================================================================

export interface PersistedToolEmbeddingIndex {
  toolId: string;
  version: string;
  descriptionEmbedding: number[];
  exampleEmbeddings: number[][];
  embeddingModel: string;
  createdAt: Date;
  toolHash: string; // Hash of tool definition for change detection
}

/**
 * Save tool embedding index to Firestore
 * Uses version-partitioned storage for easy migrations
 */
export async function saveToolEmbedding(index: PersistedToolEmbeddingIndex): Promise<void> {
  if (!firestoreInstance) {
    return;
  }

  try {
    // Store under version/toolId path for easy version migrations
    const docId = `${index.version}:${index.toolId}`;
    await firestoreInstance
      .collection(COLLECTIONS.TOOL_EMBEDDINGS)
      .doc(docId)
      .set(
        cleanForFirestore({
          ...index,
          createdAt: index.createdAt,
          _updatedAt: new Date(),
        })
      );

    log.debug({ toolId: index.toolId, version: index.version }, 'Tool embedding index persisted');
  } catch (error) {
    log.debug({ error: String(error), toolId: index.toolId }, 'Failed to persist tool embedding');
  }
}

/**
 * Load a specific tool embedding index from Firestore
 */
export async function loadToolEmbedding(
  toolId: string,
  version: string
): Promise<PersistedToolEmbeddingIndex | null> {
  if (!firestoreInstance) {
    return null;
  }

  try {
    const docId = `${version}:${toolId}`;
    const doc = await firestoreInstance.collection(COLLECTIONS.TOOL_EMBEDDINGS).doc(docId).get();

    if (!doc.exists) {
      return null;
    }

    const data = doc.data()!;
    return {
      toolId: data.toolId as string,
      version: data.version as string,
      descriptionEmbedding: data.descriptionEmbedding as number[],
      exampleEmbeddings: data.exampleEmbeddings as number[][],
      embeddingModel: data.embeddingModel as string,
      createdAt: (data.createdAt as { toDate?: () => Date })?.toDate?.() || new Date(),
      toolHash: data.toolHash as string,
    };
  } catch (error) {
    log.debug({ error: String(error), toolId, version }, 'Failed to load tool embedding');
    return null;
  }
}

/**
 * Load all tool embeddings for a version from Firestore
 */
export async function loadAllToolEmbeddings(
  version: string
): Promise<PersistedToolEmbeddingIndex[]> {
  if (!firestoreInstance) {
    return [];
  }

  try {
    const query = firestoreInstance
      .collection(COLLECTIONS.TOOL_EMBEDDINGS)
      .where('version', '==', version);

    const snapshot = await query.get();

    return snapshot.docs.map((doc) => {
      const data = doc.data()!;
      return {
        toolId: data.toolId as string,
        version: data.version as string,
        descriptionEmbedding: data.descriptionEmbedding as number[],
        exampleEmbeddings: data.exampleEmbeddings as number[][],
        embeddingModel: data.embeddingModel as string,
        createdAt: (data.createdAt as { toDate?: () => Date })?.toDate?.() || new Date(),
        toolHash: data.toolHash as string,
      };
    });
  } catch (error) {
    log.debug({ error: String(error), version }, 'Failed to load tool embeddings');
    return [];
  }
}

/**
 * Delete old tool embedding versions (cleanup)
 */
export async function deleteToolEmbeddingVersion(version: string): Promise<number> {
  if (!firestoreInstance) {
    return 0;
  }

  try {
    const query = firestoreInstance
      .collection(COLLECTIONS.TOOL_EMBEDDINGS)
      .where('version', '==', version)
      .limit(500);

    const snapshot = await query.get();
    let deleted = 0;

    for (const doc of snapshot.docs) {
      await firestoreInstance.collection(COLLECTIONS.TOOL_EMBEDDINGS).doc(doc.id).delete();
      deleted++;
    }

    log.info({ version, deleted }, 'Deleted old tool embedding version');
    return deleted;
  } catch (error) {
    log.error({ error: String(error), version }, 'Failed to delete tool embedding version');
    return 0;
  }
}

// ============================================================================
// LEARNING STATE PERSISTENCE (confusion matrix, etc.)
// ============================================================================

export interface PersistedLearningState {
  confusionMatrix: Record<string, Record<string, number>>;
  lastRetrainTime?: Date;
  accuracyHistory: Array<{ timestamp: Date; accuracy: number }>;
}

/**
 * Save learning state to Firestore
 */
export async function saveLearningState(state: PersistedLearningState): Promise<void> {
  if (!firestoreInstance) {
    return;
  }

  try {
    await firestoreInstance
      .collection(COLLECTIONS.LEARNING_STATE)
      .doc('global')
      .set(
        cleanForFirestore({
          ...state,
          lastRetrainTime: state.lastRetrainTime || null,
          _updatedAt: new Date(),
        })
      );
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to persist learning state');
  }
}

/**
 * Load learning state from Firestore
 */
export async function loadLearningState(): Promise<PersistedLearningState | null> {
  if (!firestoreInstance) {
    return null;
  }

  try {
    const doc = await firestoreInstance.collection(COLLECTIONS.LEARNING_STATE).doc('global').get();

    if (!doc.exists) {
      return null;
    }

    const data = doc.data()!;
    return {
      confusionMatrix: data.confusionMatrix as Record<string, Record<string, number>>,
      lastRetrainTime: data.lastRetrainTime
        ? (data.lastRetrainTime as { toDate?: () => Date })?.toDate?.()
        : undefined,
      accuracyHistory:
        (data.accuracyHistory as Array<{ timestamp: unknown; accuracy: number }>)?.map((h) => ({
          timestamp: (h.timestamp as { toDate?: () => Date })?.toDate?.() || new Date(),
          accuracy: h.accuracy,
        })) || [],
    };
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to load learning state');
    return null;
  }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Clean up old data (run periodically)
 */
export async function cleanupOldData(options: {
  correctionRetentionDays?: number;
  eventRetentionDays?: number;
}): Promise<{ deletedCorrections: number; deletedEvents: number }> {
  if (!firestoreInstance) {
    return { deletedCorrections: 0, deletedEvents: 0 };
  }

  const correctionCutoff = new Date();
  correctionCutoff.setDate(correctionCutoff.getDate() - (options.correctionRetentionDays || 90));

  const eventCutoff = new Date();
  eventCutoff.setDate(eventCutoff.getDate() - (options.eventRetentionDays || 30));

  let deletedCorrections = 0;
  const deletedEvents = 0;

  try {
    // Delete old corrections
    const oldCorrections = await firestoreInstance
      .collection(COLLECTIONS.CORRECTIONS)
      .where('timestamp', '<', correctionCutoff)
      .limit(500)
      .get();

    for (const doc of oldCorrections.docs) {
      await firestoreInstance.collection(COLLECTIONS.CORRECTIONS).doc(doc.id).delete();
      deletedCorrections++;
    }

    // Delete old event date partitions
    const cutoffDateStr = eventCutoff.toISOString().split('T')[0];
    // Note: This is simplified - in production you'd list and delete old date docs
    log.info({ cutoffDate: cutoffDateStr }, 'Would delete event partitions before this date');
  } catch (error) {
    log.error({ error: String(error) }, 'Cleanup failed');
  }

  return { deletedCorrections, deletedEvents };
}

// ============================================================================
// FIRESTORE PERSISTENCE CLASS (convenience wrapper)
// ============================================================================

/**
 * Class wrapper for Firestore persistence operations
 * Provides a unified interface for all persistence operations
 */
export class FirestorePersistence {
  private initPromise: Promise<void> | null = null;

  async initialize(): Promise<void> {
    if (this.initPromise) {
      return this.initPromise;
    }
    this.initPromise = initializeFirestorePersistence();
    await this.initPromise;
  }

  isAvailable(): boolean {
    return isPersistenceAvailable();
  }

  // Corrections
  async saveCorrection(correction: PersistedCorrection): Promise<void> {
    return saveCorrection(correction);
  }

  async loadCorrections(options?: {
    userId?: string;
    since?: Date;
    limit?: number;
  }): Promise<PersistedCorrection[]> {
    return loadCorrections(options);
  }

  // User Profiles
  async saveUserProfile(profile: PersistedUserProfile): Promise<void> {
    return saveUserProfile(profile);
  }

  async loadUserProfile(userId: string): Promise<PersistedUserProfile | null> {
    return loadUserProfile(userId);
  }

  async createUserProfile(userId: string): Promise<PersistedUserProfile> {
    return createUserProfile(userId);
  }

  async migrateUserProfile(userId: string): Promise<PersistedUserProfile | null> {
    return migrateUserProfile(userId);
  }

  // Enhanced Profile Operations (FTIS)
  async recordToolOutcome(
    userId: string,
    outcome: { toolId: string; success: boolean; latencyMs: number; domain?: string }
  ): Promise<void> {
    return recordToolOutcome(userId, outcome);
  }

  async updateDomainAffinity(
    userId: string,
    domain: string,
    update: Partial<Omit<DomainAffinity, 'domain'>>
  ): Promise<void> {
    return updateDomainAffinity(userId, domain, update);
  }

  async excludeTool(userId: string, toolId: string): Promise<void> {
    return excludeTool(userId, toolId);
  }

  async unexcludeTool(userId: string, toolId: string): Promise<void> {
    return unexcludeTool(userId, toolId);
  }

  async updatePersonaPreference(
    userId: string,
    personaId: string,
    update: Partial<Omit<PersonaToolPreference, 'personaId'>>
  ): Promise<void> {
    return updatePersonaPreference(userId, personaId, update);
  }

  async updateLearningPreferences(
    userId: string,
    preferences: Partial<LearningPreferences>
  ): Promise<void> {
    return updateLearningPreferences(userId, preferences);
  }

  async getEffectiveToolBoosts(
    userId: string,
    context?: { personaId?: string; domain?: string }
  ): Promise<Record<string, number>> {
    return getEffectiveToolBoosts(userId, context);
  }

  // Routing Events
  async saveRoutingEvent(event: PersistedRoutingEvent): Promise<void> {
    return saveRoutingEvent(event);
  }

  async loadRoutingEvents(options: {
    date: string;
    userId?: string;
    limit?: number;
  }): Promise<PersistedRoutingEvent[]> {
    return loadRoutingEvents(options);
  }

  // A/B Tests
  async saveABTest(test: PersistedABTest): Promise<void> {
    return saveABTest(test);
  }

  async loadABTests(options?: {
    status?: 'running' | 'completed' | 'stopped';
  }): Promise<PersistedABTest[]> {
    return loadABTests(options);
  }

  // Tool Embeddings
  async saveToolEmbedding(index: PersistedToolEmbeddingIndex): Promise<void> {
    return saveToolEmbedding(index);
  }

  async loadToolEmbedding(
    toolId: string,
    version: string
  ): Promise<PersistedToolEmbeddingIndex | null> {
    return loadToolEmbedding(toolId, version);
  }

  async loadAllToolEmbeddings(version: string): Promise<PersistedToolEmbeddingIndex[]> {
    return loadAllToolEmbeddings(version);
  }

  async deleteToolEmbeddingVersion(version: string): Promise<number> {
    return deleteToolEmbeddingVersion(version);
  }

  // Learning State
  async saveLearningState(state: PersistedLearningState): Promise<void> {
    return saveLearningState(state);
  }

  async loadLearningState(): Promise<PersistedLearningState | null> {
    return loadLearningState();
  }

  // Cleanup
  async cleanup(options: {
    correctionRetentionDays?: number;
    eventRetentionDays?: number;
  }): Promise<{ deletedCorrections: number; deletedEvents: number }> {
    return cleanupOldData(options);
  }
}

// Singleton instance
let persistenceInstance: FirestorePersistence | null = null;

/**
 * Get the singleton FirestorePersistence instance
 */
export function getFirestorePersistence(): FirestorePersistence {
  if (!persistenceInstance) {
    persistenceInstance = new FirestorePersistence();
  }
  return persistenceInstance;
}
