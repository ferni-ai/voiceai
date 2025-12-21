/**
 * Cognitive Intelligence Persistence
 *
 * Persists cognitive learning data to Firestore:
 * - User cognitive style preferences
 * - Effective cognitive approaches per user
 * - Knowledge state (what's been explained)
 * - Uncertainty validation tracking
 *
 * This enables cross-session cognitive learning.
 */

import { getLogger } from '../../utils/safe-logger.js';
import type { ReasoningStyle } from '../../personas/cognitive-types.js';

// ============================================================================
// TYPES
// ============================================================================

export interface UserCognitiveProfile {
  userId: string;
  /** Detected cognitive style */
  detectedStyle: ReasoningStyle;
  /** Confidence in detection */
  styleConfidence: number;
  /** When style was last updated */
  styleUpdatedAt: Date;
  /** Effectiveness scores by approach (overall) */
  approachEffectiveness: Record<
    ReasoningStyle,
    {
      totalScore: number;
      sampleCount: number;
      lastUsed: Date;
    }
  >;
  /** Per-persona effectiveness scores */
  perPersonaEffectiveness?: Record<
    string,
    Partial<
      Record<
        ReasoningStyle,
        {
          totalScore: number;
          sampleCount: number;
          lastUsed: Date;
        }
      >
    >
  >;
  /** Topics user has expertise in */
  expertiseAreas: string[];
  /** Topics user is learning */
  noviceAreas: string[];
  /** Total cognitive interactions */
  totalInteractions: number;
  /** Created timestamp */
  createdAt: Date;
  /** Updated timestamp */
  updatedAt: Date;
}

export interface UserKnowledgeState {
  userId: string;
  /** Topics that have been explained */
  explainedTopics: Record<
    string,
    {
      personaId: string;
      level: 'introduced' | 'explained' | 'deep_dive';
      lastExplained: Date;
      revisits: number;
    }
  >;
  /** Concepts user has demonstrated understanding of */
  demonstratedUnderstanding: string[];
  /** Updated timestamp */
  updatedAt: Date;
}

export interface UncertaintyRecord {
  userId: string;
  personaId: string;
  topic: string;
  statement: string;
  confidenceLevel: number;
  wasCorrect?: boolean;
  userFeedback?: string;
  timestamp: Date;
}

// ============================================================================
// IN-MEMORY CACHE (with Firestore sync)
// ============================================================================

// In-memory caches for fast access
const cognitiveProfileCache = new Map<string, UserCognitiveProfile>();
const knowledgeStateCache = new Map<string, UserKnowledgeState>();
const uncertaintyRecords: UncertaintyRecord[] = [];

// Firestore reference (lazy loaded)
let db: FirebaseFirestore.Firestore | null = null;

const COGNITIVE_COLLECTION = 'user_cognitive_profiles';
const KNOWLEDGE_COLLECTION = 'user_knowledge_states';
const UNCERTAINTY_COLLECTION = 'uncertainty_validation';

/**
 * Initialize Firestore connection
 */
async function getFirestore(): Promise<FirebaseFirestore.Firestore | null> {
  if (db) return db;

  try {
    const { Firestore } = await import('@google-cloud/firestore');
    db = new Firestore({
      projectId: process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT,
      databaseId: process.env.FIRESTORE_DATABASE || '(default)',
    });
    getLogger().info('Cognitive persistence Firestore initialized');
    return db;
  } catch (error) {
    getLogger().warn(
      { error },
      'Firestore not available for cognitive persistence, using in-memory only'
    );
    return null;
  }
}

// ============================================================================
// USER COGNITIVE PROFILE
// ============================================================================

/**
 * Get user cognitive profile
 */
export async function getUserCognitiveProfile(
  userId: string
): Promise<UserCognitiveProfile | null> {
  // Check cache first
  if (cognitiveProfileCache.has(userId)) {
    return cognitiveProfileCache.get(userId)!;
  }

  // Try Firestore
  const firestore = await getFirestore();
  if (firestore) {
    try {
      const doc = await firestore.collection(COGNITIVE_COLLECTION).doc(userId).get();
      if (doc.exists) {
        const data = doc.data() as UserCognitiveProfile;
        // Convert Firestore timestamps to Date objects
        interface FirestoreTimestamp {
          toDate?: () => Date;
        }
        data.styleUpdatedAt =
          (data.styleUpdatedAt as FirestoreTimestamp).toDate?.() ||
          new Date(data.styleUpdatedAt as unknown as string);
        data.createdAt =
          (data.createdAt as FirestoreTimestamp).toDate?.() ||
          new Date(data.createdAt as unknown as string);
        data.updatedAt =
          (data.updatedAt as FirestoreTimestamp).toDate?.() ||
          new Date(data.updatedAt as unknown as string);
        cognitiveProfileCache.set(userId, data);
        return data;
      }
    } catch (error) {
      getLogger().warn({ userId, error }, 'Failed to get cognitive profile from Firestore');
    }
  }

  return null;
}

/**
 * Save user cognitive profile
 */
export async function saveUserCognitiveProfile(profile: UserCognitiveProfile): Promise<void> {
  // Update cache
  cognitiveProfileCache.set(profile.userId, profile);

  // Persist to Firestore
  const firestore = await getFirestore();
  if (firestore) {
    try {
      await firestore
        .collection(COGNITIVE_COLLECTION)
        .doc(profile.userId)
        .set(
          {
            ...profile,
            updatedAt: new Date(),
          },
          { merge: true }
        );
      getLogger().debug({ userId: profile.userId }, 'Saved cognitive profile to Firestore');
    } catch (error) {
      getLogger().warn(
        { userId: profile.userId, error },
        'Failed to save cognitive profile to Firestore'
      );
    }
  }
}

/**
 * Update user's detected cognitive style
 */
export async function updateUserCognitiveStyle(
  userId: string,
  style: ReasoningStyle,
  confidence: number
): Promise<void> {
  let profile = await getUserCognitiveProfile(userId);

  if (!profile) {
    profile = createDefaultCognitiveProfile(userId);
  }

  // Only update if higher confidence
  if (confidence > profile.styleConfidence) {
    profile.detectedStyle = style;
    profile.styleConfidence = confidence;
    profile.styleUpdatedAt = new Date();
    await saveUserCognitiveProfile(profile);

    getLogger().info(
      {
        userId,
        style,
        confidence,
      },
      '🧠 Updated user cognitive style'
    );
  }
}

/**
 * Record cognitive approach effectiveness
 */
export async function recordApproachEffectiveness(
  userId: string,
  personaId: string,
  approach: ReasoningStyle,
  engagementScore: number
): Promise<void> {
  let profile = await getUserCognitiveProfile(userId);

  if (!profile) {
    profile = createDefaultCognitiveProfile(userId);
  }

  // Update approach effectiveness
  const current = profile.approachEffectiveness[approach] || {
    totalScore: 0,
    sampleCount: 0,
    lastUsed: new Date(),
  };

  current.totalScore += engagementScore;
  current.sampleCount += 1;
  current.lastUsed = new Date();
  profile.approachEffectiveness[approach] = current;
  profile.totalInteractions += 1;

  // Track per-persona effectiveness
  if (!profile.perPersonaEffectiveness) {
    profile.perPersonaEffectiveness = {};
  }
  if (!profile.perPersonaEffectiveness[personaId]) {
    profile.perPersonaEffectiveness[personaId] = {};
  }
  const perPersonaCurrent = profile.perPersonaEffectiveness[personaId][approach] || {
    totalScore: 0,
    sampleCount: 0,
    lastUsed: new Date(),
  };
  perPersonaCurrent.totalScore += engagementScore;
  perPersonaCurrent.sampleCount += 1;
  perPersonaCurrent.lastUsed = new Date();
  profile.perPersonaEffectiveness[personaId][approach] = perPersonaCurrent;

  await saveUserCognitiveProfile(profile);
}

/**
 * Get recommended cognitive approach for user
 */
export async function getRecommendedApproach(
  userId: string,
  personaId: string,
  defaultApproach: ReasoningStyle
): Promise<{ approach: ReasoningStyle; confidence: number; reason: string }> {
  const profile = await getUserCognitiveProfile(userId);

  if (!profile || profile.totalInteractions < 5) {
    return {
      approach: defaultApproach,
      confidence: 0.3,
      reason: 'Not enough interaction history',
    };
  }

  // Try persona-specific data first
  if (profile.perPersonaEffectiveness?.[personaId]) {
    const personaData = profile.perPersonaEffectiveness[personaId];
    let bestApproach = defaultApproach;
    let bestAvgScore = 0;
    let totalSamples = 0;

    for (const [approach, data] of Object.entries(personaData)) {
      totalSamples += data.sampleCount;
      if (data.sampleCount >= 2) {
        const avgScore = data.totalScore / data.sampleCount;
        if (avgScore > bestAvgScore) {
          bestAvgScore = avgScore;
          bestApproach = approach as ReasoningStyle;
        }
      }
    }

    if (totalSamples >= 3 && bestAvgScore > 0.5) {
      return {
        approach: bestApproach,
        confidence: Math.min(0.9, bestAvgScore),
        reason: `Based on ${totalSamples} interactions with this persona`,
      };
    }
  }

  // Fall back to overall effectiveness
  let bestApproach = defaultApproach;
  let bestAvgScore = 0;

  for (const [approach, data] of Object.entries(profile.approachEffectiveness)) {
    if (data.sampleCount >= 3) {
      const avgScore = data.totalScore / data.sampleCount;
      if (avgScore > bestAvgScore) {
        bestAvgScore = avgScore;
        bestApproach = approach as ReasoningStyle;
      }
    }
  }

  return {
    approach: bestApproach,
    confidence: Math.min(0.9, bestAvgScore),
    reason: `Based on ${profile.totalInteractions} total interactions`,
  };
}

// ============================================================================
// USER KNOWLEDGE STATE
// ============================================================================

/**
 * Get user knowledge state
 */
export async function getUserKnowledgeState(userId: string): Promise<UserKnowledgeState | null> {
  // Check cache
  if (knowledgeStateCache.has(userId)) {
    return knowledgeStateCache.get(userId)!;
  }

  // Try Firestore
  const firestore = await getFirestore();
  if (firestore) {
    try {
      const doc = await firestore.collection(KNOWLEDGE_COLLECTION).doc(userId).get();
      if (doc.exists) {
        const data = doc.data() as UserKnowledgeState;
        knowledgeStateCache.set(userId, data);
        return data;
      }
    } catch (error) {
      getLogger().warn({ userId, error }, 'Failed to get knowledge state from Firestore');
    }
  }

  return null;
}

/**
 * Record that a topic was explained to user
 */
export async function recordTopicExplained(
  userId: string,
  topic: string,
  personaId: string,
  level: 'introduced' | 'explained' | 'deep_dive' = 'explained'
): Promise<void> {
  let state = await getUserKnowledgeState(userId);

  if (!state) {
    state = {
      userId,
      explainedTopics: {},
      demonstratedUnderstanding: [],
      updatedAt: new Date(),
    };
  }

  const existing = state.explainedTopics[topic];
  state.explainedTopics[topic] = {
    personaId,
    level,
    lastExplained: new Date(),
    revisits: existing ? existing.revisits + 1 : 0,
  };
  state.updatedAt = new Date();

  // Update cache
  knowledgeStateCache.set(userId, state);

  // Persist to Firestore
  const firestore = await getFirestore();
  if (firestore) {
    try {
      await firestore.collection(KNOWLEDGE_COLLECTION).doc(userId).set(state, { merge: true });
    } catch (error) {
      getLogger().warn({ userId, error }, 'Failed to save knowledge state to Firestore');
    }
  }
}

/**
 * Check if user already knows about a topic
 */
export async function userKnowsTopic(
  userId: string,
  topic: string
): Promise<{ knows: boolean; level?: string; revisits?: number }> {
  const state = await getUserKnowledgeState(userId);

  if (!state || !state.explainedTopics[topic]) {
    return { knows: false };
  }

  const topicState = state.explainedTopics[topic];
  return {
    knows: true,
    level: topicState.level,
    revisits: topicState.revisits,
  };
}

/**
 * Record that user demonstrated understanding
 */
export async function recordDemonstratedUnderstanding(
  userId: string,
  concept: string
): Promise<void> {
  let state = await getUserKnowledgeState(userId);

  if (!state) {
    state = {
      userId,
      explainedTopics: {},
      demonstratedUnderstanding: [],
      updatedAt: new Date(),
    };
  }

  if (!state.demonstratedUnderstanding.includes(concept)) {
    state.demonstratedUnderstanding.push(concept);
    state.updatedAt = new Date();

    knowledgeStateCache.set(userId, state);

    const firestore = await getFirestore();
    if (firestore) {
      try {
        await firestore.collection(KNOWLEDGE_COLLECTION).doc(userId).set(state, { merge: true });
      } catch (error) {
        getLogger().warn({ userId, error }, 'Failed to save demonstrated understanding');
      }
    }
  }
}

// ============================================================================
// UNCERTAINTY VALIDATION
// ============================================================================

/**
 * Record an uncertainty statement for later validation
 */
export async function recordUncertaintyStatement(
  userId: string,
  personaId: string,
  topic: string,
  statement: string,
  confidenceLevel: number
): Promise<void> {
  const record: UncertaintyRecord = {
    userId,
    personaId,
    topic,
    statement,
    confidenceLevel,
    timestamp: new Date(),
  };

  uncertaintyRecords.push(record);

  // Persist to Firestore
  const firestore = await getFirestore();
  if (firestore) {
    try {
      await firestore.collection(UNCERTAINTY_COLLECTION).add(record);
    } catch (error) {
      getLogger().warn({ userId, error }, 'Failed to save uncertainty record');
    }
  }
}

/**
 * Validate a previous uncertainty statement
 */
export async function validateUncertaintyStatement(
  userId: string,
  topic: string,
  wasCorrect: boolean,
  userFeedback?: string
): Promise<void> {
  // Find matching record
  const record = uncertaintyRecords.find(
    (r) => r.userId === userId && r.topic === topic && r.wasCorrect === undefined
  );

  if (record) {
    record.wasCorrect = wasCorrect;
    record.userFeedback = userFeedback;

    // Update in Firestore
    const firestore = await getFirestore();
    if (firestore) {
      try {
        const query = await firestore
          .collection(UNCERTAINTY_COLLECTION)
          .where('userId', '==', userId)
          .where('topic', '==', topic)
          .where('wasCorrect', '==', null)
          .limit(1)
          .get();

        if (!query.empty) {
          await query.docs[0].ref.update({
            wasCorrect,
            userFeedback,
          });
        }
      } catch (error) {
        getLogger().warn({ userId, error }, 'Failed to update uncertainty validation');
      }
    }

    getLogger().info(
      {
        userId,
        topic,
        wasCorrect,
        confidenceLevel: record.confidenceLevel,
      },
      '✅ Uncertainty statement validated'
    );
  }
}

/**
 * Get uncertainty calibration stats for a persona
 */
export async function getUncertaintyCalibration(personaId: string): Promise<{
  totalStatements: number;
  validatedStatements: number;
  accuracyByConfidence: Record<string, { correct: number; total: number }>;
}> {
  const personaRecords = uncertaintyRecords.filter((r) => r.personaId === personaId);
  const validated = personaRecords.filter((r) => r.wasCorrect !== undefined);

  const accuracyByConfidence: Record<string, { correct: number; total: number }> = {
    high: { correct: 0, total: 0 },
    medium: { correct: 0, total: 0 },
    low: { correct: 0, total: 0 },
  };

  for (const record of validated) {
    const band =
      record.confidenceLevel >= 0.7 ? 'high' : record.confidenceLevel >= 0.4 ? 'medium' : 'low';

    accuracyByConfidence[band].total++;
    if (record.wasCorrect) {
      accuracyByConfidence[band].correct++;
    }
  }

  return {
    totalStatements: personaRecords.length,
    validatedStatements: validated.length,
    accuracyByConfidence,
  };
}

// ============================================================================
// HELPERS
// ============================================================================

function createDefaultCognitiveProfile(userId: string): UserCognitiveProfile {
  return {
    userId,
    detectedStyle: 'narrative',
    styleConfidence: 0,
    styleUpdatedAt: new Date(),
    approachEffectiveness: {
      analytical: { totalScore: 0, sampleCount: 0, lastUsed: new Date() },
      intuitive: { totalScore: 0, sampleCount: 0, lastUsed: new Date() },
      empathetic: { totalScore: 0, sampleCount: 0, lastUsed: new Date() },
      systematic: { totalScore: 0, sampleCount: 0, lastUsed: new Date() },
      narrative: { totalScore: 0, sampleCount: 0, lastUsed: new Date() },
      pragmatic: { totalScore: 0, sampleCount: 0, lastUsed: new Date() },
    },
    expertiseAreas: [],
    noviceAreas: [],
    totalInteractions: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

/**
 * Clear all caches (for testing)
 */
export function clearCognitivePeristenceCache(): void {
  cognitiveProfileCache.clear();
  knowledgeStateCache.clear();
  uncertaintyRecords.length = 0;
}

export default {
  getUserCognitiveProfile,
  saveUserCognitiveProfile,
  updateUserCognitiveStyle,
  recordApproachEffectiveness,
  getRecommendedApproach,
  getUserKnowledgeState,
  recordTopicExplained,
  userKnowsTopic,
  recordDemonstratedUnderstanding,
  recordUncertaintyStatement,
  validateUncertaintyStatement,
  getUncertaintyCalibration,
  clearCognitivePeristenceCache,
};
