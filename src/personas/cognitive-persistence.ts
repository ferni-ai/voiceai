/**
 * Cognitive Learning Persistence
 *
 * > "Perfect memory. Zero judgment. Full presence."
 *
 * Firestore persistence for cognitive learning data.
 * Tracks which reasoning approaches work best for each user-persona pair,
 * what topics they're expert vs novice in, and knowledge state to avoid
 * re-explaining concepts they already understand.
 *
 * This is what makes Ferni "learn" over time - not just remember facts,
 * but remember HOW to communicate with each person.
 */

import type { Firestore as FirestoreType } from '@google-cloud/firestore';
import { getFirestoreDatabase, getGCPProjectId } from '../config/environment.js';
import { createLogger } from '../utils/safe-logger.js';
import type { ReasoningStyle } from './cognitive-types.js';

const log = createLogger({ module: 'CognitivePersistence' });

// Module-level Firestore instance (lazy initialized)
let db: FirestoreType | null = null;

// ============================================================================
// TYPES
// ============================================================================

/**
 * User cognitive style - how THEY think (detected from conversations)
 */
export type UserCognitiveStyle =
  | 'analytical'
  | 'emotional'
  | 'practical'
  | 'narrative'
  | 'systematic'
  | 'intuitive'
  | 'unknown';

/**
 * Persisted cognitive learning for a user-persona pair
 */
export interface PersistedCognitiveLearning {
  userId: string;
  personaId: string;

  /** Which approaches work best with this user (approach -> effectiveness score 0-1) */
  effectiveApproaches: Record<ReasoningStyle, number>;

  /** User's detected preferred cognitive style */
  userPreferredStyle: UserCognitiveStyle;

  /** Approaches that led to breakthroughs */
  breakthroughApproaches: ReasoningStyle[];

  /** Approaches to avoid (consistently ineffective) */
  ineffectiveApproaches: ReasoningStyle[];

  /** Topics where user has expertise (skip basics) */
  expertiseTopics: string[];

  /** Topics that need more explanation */
  noviceTopics: string[];

  /** Total interactions for confidence */
  totalInteractions: number;

  /** Last updated */
  updatedAt: string;
}

/**
 * Persisted knowledge state for a user
 */
export interface PersistedKnowledgeState {
  userId: string;

  /** Topics we've explained to this user */
  topicsExplained: Record<
    string,
    {
      firstExplained: string;
      timesRevisited: number;
      understandingLevel: 'introduced' | 'learning' | 'comfortable' | 'expert';
      lastAssessedConfidence: number;
      personaWhoExplained: string;
    }
  >;

  /** Don't re-explain these */
  skipExplanationFor: string[];

  /** User has asked about these multiple times - might need different approach */
  confusionTopics: string[];

  /** Last updated */
  updatedAt: string;
}

// ============================================================================
// FIRESTORE INITIALIZATION
// ============================================================================

/**
 * Get Firestore connection (lazy initialized)
 */
async function getFirestore(): Promise<FirestoreType | null> {
  if (db) return db;

  try {
    const { Firestore } = await import('@google-cloud/firestore');
    db = new Firestore({
      projectId: getGCPProjectId(),
      databaseId: getFirestoreDatabase(),
    });
    log.info('Cognitive persistence Firestore initialized');
    return db;
  } catch (error) {
    log.warn({ error }, 'Firestore not available for cognitive persistence');
    return null;
  }
}

// ============================================================================
// COGNITIVE LEARNING PERSISTENCE
// ============================================================================

const COGNITIVE_LEARNING_COLLECTION = 'cognitive_learning';

/**
 * Save cognitive learning data for a user-persona pair
 */
export async function saveCognitiveLearning(data: PersistedCognitiveLearning): Promise<void> {
  const firestore = await getFirestore();
  if (!firestore) {
    log.warn('Firestore not available, cognitive learning not persisted');
    return;
  }

  try {
    const docId = `${data.userId}_${data.personaId}`;
    await firestore
      .collection('bogle_users')
      .doc(data.userId)
      .collection(COGNITIVE_LEARNING_COLLECTION)
      .doc(docId)
      .set(
        {
          ...data,
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );

    log.debug(
      {
        userId: data.userId,
        personaId: data.personaId,
        totalInteractions: data.totalInteractions,
        preferredStyle: data.userPreferredStyle,
      },
      'Saved cognitive learning data'
    );
  } catch (error) {
    log.error(
      { error, userId: data.userId, personaId: data.personaId },
      'Failed to save cognitive learning'
    );
  }
}

/**
 * Load cognitive learning data for a user-persona pair
 */
export async function loadCognitiveLearning(
  userId: string,
  personaId: string
): Promise<PersistedCognitiveLearning | null> {
  const firestore = await getFirestore();
  if (!firestore) return null;

  try {
    const docId = `${userId}_${personaId}`;
    const doc = await firestore
      .collection('bogle_users')
      .doc(userId)
      .collection(COGNITIVE_LEARNING_COLLECTION)
      .doc(docId)
      .get();

    if (!doc.exists) {
      return null;
    }

    const data = doc.data() as PersistedCognitiveLearning;
    log.debug(
      {
        userId,
        personaId,
        totalInteractions: data.totalInteractions,
        preferredStyle: data.userPreferredStyle,
      },
      'Loaded cognitive learning data'
    );

    return data;
  } catch (error) {
    log.error({ error, userId, personaId }, 'Failed to load cognitive learning');
    return null;
  }
}

/**
 * Load all cognitive learning data for a user (across all personas)
 */
export async function loadAllCognitiveLearning(
  userId: string
): Promise<PersistedCognitiveLearning[]> {
  const firestore = await getFirestore();
  if (!firestore) return [];

  try {
    const snapshot = await firestore
      .collection('bogle_users')
      .doc(userId)
      .collection(COGNITIVE_LEARNING_COLLECTION)
      .get();

    if (snapshot.empty) return [];

    return snapshot.docs.map((doc) => doc.data() as PersistedCognitiveLearning);
  } catch (error) {
    log.error({ error, userId }, 'Failed to load all cognitive learning');
    return [];
  }
}

// ============================================================================
// KNOWLEDGE STATE PERSISTENCE
// ============================================================================

const KNOWLEDGE_STATE_COLLECTION = 'knowledge_state';

/**
 * Save knowledge state for a user
 */
export async function saveKnowledgeState(data: PersistedKnowledgeState): Promise<void> {
  const firestore = await getFirestore();
  if (!firestore) {
    log.warn('Firestore not available, knowledge state not persisted');
    return;
  }

  try {
    await firestore
      .collection('bogle_users')
      .doc(data.userId)
      .collection(KNOWLEDGE_STATE_COLLECTION)
      .doc('state')
      .set(
        {
          ...data,
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );

    log.debug(
      {
        userId: data.userId,
        topicsCount: Object.keys(data.topicsExplained).length,
        skipCount: data.skipExplanationFor.length,
      },
      'Saved knowledge state'
    );
  } catch (error) {
    log.error({ error, userId: data.userId }, 'Failed to save knowledge state');
  }
}

/**
 * Load knowledge state for a user
 */
export async function loadKnowledgeState(userId: string): Promise<PersistedKnowledgeState | null> {
  const firestore = await getFirestore();
  if (!firestore) return null;

  try {
    const doc = await firestore
      .collection('bogle_users')
      .doc(userId)
      .collection(KNOWLEDGE_STATE_COLLECTION)
      .doc('state')
      .get();

    if (!doc.exists) return null;

    const data = doc.data() as PersistedKnowledgeState;
    log.debug(
      {
        userId,
        topicsCount: Object.keys(data.topicsExplained).length,
      },
      'Loaded knowledge state'
    );

    return data;
  } catch (error) {
    log.error({ error, userId }, 'Failed to load knowledge state');
    return null;
  }
}

// ============================================================================
// TRACKER INTEGRATION HELPERS
// ============================================================================

/**
 * Convert CognitiveLearning (in-memory Map-based) to PersistedCognitiveLearning
 */
export function toPersistableLearning(
  userId: string,
  personaId: string,
  learning: {
    effectiveApproaches: Map<ReasoningStyle, number>;
    userPreferredStyle: UserCognitiveStyle;
    breakthroughApproaches: ReasoningStyle[];
    ineffectiveApproaches: ReasoningStyle[];
    expertiseTopics: string[];
    noviceTopics: string[];
    totalInteractions: number;
  }
): PersistedCognitiveLearning {
  // Convert Map to Record
  const effectiveApproaches: Record<ReasoningStyle, number> = {
    analytical: 0.5,
    intuitive: 0.5,
    empathetic: 0.5,
    systematic: 0.5,
    narrative: 0.5,
    pragmatic: 0.5,
  };

  for (const [approach, score] of learning.effectiveApproaches) {
    effectiveApproaches[approach] = score;
  }

  return {
    userId,
    personaId,
    effectiveApproaches,
    userPreferredStyle: learning.userPreferredStyle,
    breakthroughApproaches: [...learning.breakthroughApproaches],
    ineffectiveApproaches: [...learning.ineffectiveApproaches],
    expertiseTopics: [...learning.expertiseTopics],
    noviceTopics: [...learning.noviceTopics],
    totalInteractions: learning.totalInteractions,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Convert PersistedCognitiveLearning back to in-memory format
 */
export function fromPersistedLearning(data: PersistedCognitiveLearning): {
  effectiveApproaches: Map<ReasoningStyle, number>;
  userPreferredStyle: UserCognitiveStyle;
  breakthroughApproaches: ReasoningStyle[];
  ineffectiveApproaches: ReasoningStyle[];
  expertiseTopics: string[];
  noviceTopics: string[];
  totalInteractions: number;
} {
  return {
    effectiveApproaches: new Map(
      Object.entries(data.effectiveApproaches) as Array<[ReasoningStyle, number]>
    ),
    userPreferredStyle: data.userPreferredStyle,
    breakthroughApproaches: [...data.breakthroughApproaches],
    ineffectiveApproaches: [...data.ineffectiveApproaches],
    expertiseTopics: [...data.expertiseTopics],
    noviceTopics: [...data.noviceTopics],
    totalInteractions: data.totalInteractions,
  };
}

/**
 * Convert UserKnowledgeState (in-memory Map-based) to PersistedKnowledgeState
 */
export function toPersistableKnowledge(
  userId: string,
  state: {
    topicsExplained: Map<
      string,
      {
        firstExplained: Date;
        timesRevisited: number;
        understandingLevel: 'introduced' | 'learning' | 'comfortable' | 'expert';
        lastAssessedConfidence: number;
        personaWhoExplained: string;
      }
    >;
    skipExplanationFor: string[];
    confusionTopics: string[];
  }
): PersistedKnowledgeState {
  const topicsExplained: PersistedKnowledgeState['topicsExplained'] = {};

  for (const [topic, info] of state.topicsExplained) {
    topicsExplained[topic] = {
      firstExplained: info.firstExplained.toISOString(),
      timesRevisited: info.timesRevisited,
      understandingLevel: info.understandingLevel,
      lastAssessedConfidence: info.lastAssessedConfidence,
      personaWhoExplained: info.personaWhoExplained,
    };
  }

  return {
    userId,
    topicsExplained,
    skipExplanationFor: [...state.skipExplanationFor],
    confusionTopics: [...state.confusionTopics],
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Convert PersistedKnowledgeState back to in-memory format
 */
export function fromPersistedKnowledge(data: PersistedKnowledgeState): {
  userId: string;
  topicsExplained: Map<
    string,
    {
      firstExplained: Date;
      timesRevisited: number;
      understandingLevel: 'introduced' | 'learning' | 'comfortable' | 'expert';
      lastAssessedConfidence: number;
      personaWhoExplained: string;
    }
  >;
  skipExplanationFor: string[];
  confusionTopics: string[];
} {
  const topicsExplained = new Map<
    string,
    {
      firstExplained: Date;
      timesRevisited: number;
      understandingLevel: 'introduced' | 'learning' | 'comfortable' | 'expert';
      lastAssessedConfidence: number;
      personaWhoExplained: string;
    }
  >();

  for (const [topic, info] of Object.entries(data.topicsExplained)) {
    topicsExplained.set(topic, {
      firstExplained: new Date(info.firstExplained),
      timesRevisited: info.timesRevisited,
      understandingLevel: info.understandingLevel,
      lastAssessedConfidence: info.lastAssessedConfidence,
      personaWhoExplained: info.personaWhoExplained,
    });
  }

  return {
    userId: data.userId,
    topicsExplained,
    skipExplanationFor: [...data.skipExplanationFor],
    confusionTopics: [...data.confusionTopics],
  };
}

export default {
  saveCognitiveLearning,
  loadCognitiveLearning,
  loadAllCognitiveLearning,
  saveKnowledgeState,
  loadKnowledgeState,
  toPersistableLearning,
  fromPersistedLearning,
  toPersistableKnowledge,
  fromPersistedKnowledge,
};
