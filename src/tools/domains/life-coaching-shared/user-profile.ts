/**
 * Life Coaching User Profile Service
 *
 * Manages user profiles for personalized life coaching.
 * Persists to Firestore for "Better than Human" memory.
 *
 * Schema:
 * - bogle_users/{userId}/life_coaching/profile → LifeCoachingProfile
 */

import { createLogger } from '../../../utils/safe-logger.js';
import type {
  LifeCoachingProfile,
  FourTendency,
  AttachmentStyle,
  EmotionalState,
  BoundaryAttempt,
} from './types.js';

// Re-export the type for consumers who import from user-profile
export type { LifeCoachingProfile };

const log = createLogger({ module: 'LifeCoachingProfile' });

// Minimal Firestore types (to avoid hard dependency)
interface Firestore {
  collection: (path: string) => CollectionReference;
}

interface CollectionReference {
  doc: (id: string) => DocumentReference;
}

interface DocumentReference {
  collection: (path: string) => CollectionReference;
  get: () => Promise<DocumentSnapshot>;
  set: (data: unknown, options?: { merge?: boolean }) => Promise<void>;
}

interface DocumentSnapshot {
  exists: boolean;
  data: () => Record<string, unknown> | undefined;
}

// Serialized version for Firestore (dates as ISO strings)
interface SerializedProfile extends Omit<LifeCoachingProfile, 'lastUpdated' | 'boundaryHistory'> {
  lastUpdated: string;
  boundaryHistory?: Array<{
    date: string;
    personType: string;
    boundaryType: string;
    outcome: string;
    notes?: string;
  }>;
}

// ============================================================================
// FIRESTORE CONNECTION
// ============================================================================

let db: Firestore | null = null;
const USERS_COLLECTION = 'bogle_users';
const LIFE_COACHING_SUBCOLLECTION = 'life_coaching';
const PROFILE_DOC = 'profile';

async function getFirestore(): Promise<Firestore | null> {
  if (db) return db;

  try {
    const { Firestore: FirestoreClass } = await import('@google-cloud/firestore');
    // Cast to our minimal interface - the actual implementation is compatible
    db = new FirestoreClass({
      projectId: process.env.GOOGLE_PROJECT_ID || 'bogle-voiceai',
    }) as unknown as Firestore;
    log.info('Firestore initialized for life coaching profiles');
    return db;
  } catch (error) {
    log.warn({ error: String(error) }, 'Firestore not available - using memory-only mode');
    return null;
  }
}

// In-memory cache (Firestore is primary storage)
const profileCache = new Map<string, LifeCoachingProfile>();

// Cache TTL: 5 minutes
const CACHE_TTL = 5 * 60 * 1000;
const cacheTimestamps = new Map<string, number>();

function isCacheValid(userId: string): boolean {
  const timestamp = cacheTimestamps.get(userId);
  if (!timestamp) return false;
  return Date.now() - timestamp < CACHE_TTL;
}

// ============================================================================
// SERIALIZATION
// ============================================================================

function serializeProfile(profile: LifeCoachingProfile): SerializedProfile {
  return {
    ...profile,
    lastUpdated: profile.lastUpdated.toISOString(),
    boundaryHistory: profile.boundaryHistory?.map((b) => ({
      ...b,
      date: b.date.toISOString(),
    })),
  };
}

function deserializeProfile(data: Record<string, unknown>): LifeCoachingProfile {
  const serialized = data as unknown as SerializedProfile;
  return {
    ...serialized,
    lastUpdated: new Date(serialized.lastUpdated),
    boundaryHistory: serialized.boundaryHistory?.map((b) => ({
      date: new Date(b.date),
      personType: b.personType,
      boundaryType: b.boundaryType,
      outcome: b.outcome as BoundaryAttempt['outcome'], // Cast to union type
      notes: b.notes,
    })),
  };
}

// ============================================================================
// PROFILE MANAGEMENT
// ============================================================================

/**
 * Get or create a user's life coaching profile
 */
export async function getLifeCoachingProfile(userId: string): Promise<LifeCoachingProfile> {
  // Check cache first
  if (isCacheValid(userId)) {
    const cached = profileCache.get(userId);
    if (cached) {
      return cached;
    }
  }

  // Try to load from Firestore
  const firestore = await getFirestore();
  if (firestore) {
    try {
      const docRef = firestore
        .collection(USERS_COLLECTION)
        .doc(userId)
        .collection(LIFE_COACHING_SUBCOLLECTION)
        .doc(PROFILE_DOC);

      const snapshot = await docRef.get();

      if (snapshot.exists) {
        const data = snapshot.data();
        if (data) {
          const profile = deserializeProfile(data);
          profileCache.set(userId, profile);
          cacheTimestamps.set(userId, Date.now());
          log.debug({ userId }, 'Loaded life coaching profile from Firestore');
          return profile;
        }
      }
    } catch (error) {
      log.error({ error: String(error), userId }, 'Failed to load profile from Firestore');
    }
  }

  // Return default profile
  const profile: LifeCoachingProfile = {
    userId,
    lastUpdated: new Date(),
    totalLifeCoachingInteractions: 0,
  };

  profileCache.set(userId, profile);
  cacheTimestamps.set(userId, Date.now());
  return profile;
}

/**
 * Update a user's profile
 */
export async function updateLifeCoachingProfile(
  userId: string,
  updates: Partial<LifeCoachingProfile>
): Promise<void> {
  const profile = await getLifeCoachingProfile(userId);
  const updated: LifeCoachingProfile = {
    ...profile,
    ...updates,
    lastUpdated: new Date(),
    totalLifeCoachingInteractions: profile.totalLifeCoachingInteractions + 1,
  };

  // Update cache
  profileCache.set(userId, updated);
  cacheTimestamps.set(userId, Date.now());
  log.debug({ userId }, 'Updated life coaching profile in cache');

  // Persist to Firestore (async, don't await for speed)
  const firestore = await getFirestore();
  if (firestore) {
    const docRef = firestore
      .collection(USERS_COLLECTION)
      .doc(userId)
      .collection(LIFE_COACHING_SUBCOLLECTION)
      .doc(PROFILE_DOC);

    const serialized = serializeProfile(updated);

    docRef.set(serialized, { merge: true }).catch((error) => {
      log.error({ error: String(error), userId }, 'Failed to persist profile to Firestore');
    });
  }
}

// ============================================================================
// FOUR TENDENCIES DETECTION
// ============================================================================

/**
 * Cues that suggest each tendency
 */
const TENDENCY_CUES: Record<FourTendency, string[]> = {
  upholder: [
    'schedule',
    'routine',
    'commitment',
    'promise',
    'should',
    'supposed to',
    'right thing',
    'self-discipline',
    'rules',
    'consistent',
  ],
  questioner: [
    'why',
    'reason',
    'makes sense',
    'research',
    'data',
    'evidence',
    'justify',
    'efficient',
    'pointless',
    'arbitrary',
  ],
  obliger: [
    'let down',
    'disappoint',
    'others',
    'accountable to',
    'for them',
    'external',
    'support',
    'group',
    'team',
    'someone else',
  ],
  rebel: [
    'want to',
    'choose',
    'freedom',
    'authentic',
    'my way',
    'forced',
    "don't tell me",
    'identity',
    'who I am',
    'rebel',
  ],
};

/**
 * Analyze text for tendency cues
 */
export function detectTendencyCues(
  text: string
): { tendency: FourTendency; confidence: number } | null {
  const lower = text.toLowerCase();
  const scores: Record<FourTendency, number> = {
    upholder: 0,
    questioner: 0,
    obliger: 0,
    rebel: 0,
  };

  for (const [tendency, cues] of Object.entries(TENDENCY_CUES)) {
    for (const cue of cues) {
      if (lower.includes(cue)) {
        scores[tendency as FourTendency]++;
      }
    }
  }

  const max = Math.max(...Object.values(scores));
  if (max === 0) return null;

  const winner = (Object.keys(scores) as FourTendency[]).find((t) => scores[t] === max);
  const total = Object.values(scores).reduce((a, b) => a + b, 0);
  const confidence = max / total;

  return winner && confidence > 0.3 ? { tendency: winner, confidence } : null;
}

/**
 * Update tendency based on new evidence
 */
export async function updateTendency(
  userId: string,
  tendency: FourTendency,
  confidence: number
): Promise<void> {
  const profile = await getLifeCoachingProfile(userId);

  // Use exponential moving average
  const alpha = 0.3;
  const newConfidence = profile.fourTendencyConfidence
    ? profile.fourTendencyConfidence * (1 - alpha) + confidence * alpha
    : confidence;

  await updateLifeCoachingProfile(userId, {
    fourTendency: tendency,
    fourTendencyConfidence: newConfidence,
  });
}

// ============================================================================
// ATTACHMENT STYLE DETECTION
// ============================================================================

const ATTACHMENT_CUES: Record<AttachmentStyle, string[]> = {
  secure: [
    'comfortable',
    'trust',
    'communicate',
    'independent but',
    'close',
    'balanced',
    'healthy',
  ],
  anxious: [
    'worried about',
    'need reassurance',
    'clingy',
    'abandon',
    'overthink',
    'analyze every',
    'what if they',
  ],
  avoidant: [
    'space',
    'independent',
    'too close',
    'suffocating',
    'pull away',
    "don't need",
    'distance',
  ],
  disorganized: [
    'push pull',
    'hot and cold',
    'want but scared',
    'confusing',
    'chaos',
    'unpredictable',
  ],
};

export function detectAttachmentCues(
  text: string
): { style: AttachmentStyle; confidence: number } | null {
  const lower = text.toLowerCase();
  const scores: Record<AttachmentStyle, number> = {
    secure: 0,
    anxious: 0,
    avoidant: 0,
    disorganized: 0,
  };

  for (const [style, cues] of Object.entries(ATTACHMENT_CUES)) {
    for (const cue of cues) {
      if (lower.includes(cue)) {
        scores[style as AttachmentStyle]++;
      }
    }
  }

  const max = Math.max(...Object.values(scores));
  if (max === 0) return null;

  const winner = (Object.keys(scores) as AttachmentStyle[]).find((s) => scores[s] === max);
  const total = Object.values(scores).reduce((a, b) => a + b, 0);
  const confidence = max / total;

  return winner && confidence > 0.3 ? { style: winner, confidence } : null;
}

// ============================================================================
// EMOTIONAL STATE DETECTION
// ============================================================================

const EMOTION_CUES: Record<EmotionalState, string[]> = {
  calm: ['peaceful', 'relaxed', 'centered', 'good', 'fine', 'okay'],
  anxious: ['worried', 'nervous', 'anxious', 'stressed', 'panic', 'racing thoughts'],
  sad: ['sad', 'down', 'depressed', 'hopeless', 'crying', 'grief', 'loss'],
  angry: ['angry', 'frustrated', 'furious', 'pissed', 'mad', 'resentful'],
  overwhelmed: ['overwhelmed', 'too much', "can't handle", 'drowning', 'exhausted'],
  hopeful: ['hopeful', 'optimistic', 'excited', 'looking forward', 'better'],
  neutral: ['fine', 'okay', 'not much', 'nothing special'],
  distressed: ['crisis', 'emergency', "can't go on", 'desperate', 'breaking down'],
  numb: ['numb', 'empty', "don't feel", 'nothing', 'disconnected'],
};

export function detectEmotionalState(text: string): EmotionalState | null {
  const lower = text.toLowerCase();
  const scores: Record<EmotionalState, number> = {
    calm: 0,
    anxious: 0,
    sad: 0,
    angry: 0,
    overwhelmed: 0,
    hopeful: 0,
    neutral: 0,
    distressed: 0,
    numb: 0,
  };

  for (const [emotion, cues] of Object.entries(EMOTION_CUES)) {
    for (const cue of cues) {
      if (lower.includes(cue)) {
        scores[emotion as EmotionalState]++;
      }
    }
  }

  const max = Math.max(...Object.values(scores));
  if (max === 0) return null;

  return (Object.keys(scores) as EmotionalState[]).find((e) => scores[e] === max) ?? null;
}

// ============================================================================
// BOUNDARY TRACKING
// ============================================================================

export async function recordBoundaryAttempt(
  userId: string,
  attempt: Omit<BoundaryAttempt, 'date'>
): Promise<void> {
  const profile = await getLifeCoachingProfile(userId);
  const history = profile.boundaryHistory || [];

  history.push({
    ...attempt,
    date: new Date(),
  });

  // Keep last 50 attempts
  const trimmed = history.slice(-50);

  await updateLifeCoachingProfile(userId, {
    boundaryHistory: trimmed,
  });
}

export async function getBoundaryPatterns(userId: string): Promise<{
  successRate: number;
  commonChallenges: string[];
  growth: string[];
}> {
  const profile = await getLifeCoachingProfile(userId);
  const history = profile.boundaryHistory || [];

  if (history.length === 0) {
    return { successRate: 0, commonChallenges: [], growth: [] };
  }

  const maintained = history.filter((b) => b.outcome === 'maintained').length;
  const successRate = maintained / history.length;

  // Find patterns
  const personTypes = history.map((b) => b.personType);
  const uniqueTypes = [...new Set(personTypes)];
  const challenges = uniqueTypes.filter((type) => {
    const typeHistory = history.filter((b) => b.personType === type);
    const typeSuccess = typeHistory.filter((b) => b.outcome === 'maintained').length;
    return typeSuccess / typeHistory.length < 0.5;
  });

  // Recent improvements
  const recent = history.slice(-10);
  const recentSuccess = recent.filter((b) => b.outcome === 'maintained').length / recent.length;
  const oldSuccess =
    history.slice(0, -10).filter((b) => b.outcome === 'maintained').length /
    Math.max(history.length - 10, 1);
  const growth: string[] = [];
  if (recentSuccess > oldSuccess + 0.1) {
    growth.push('Your boundary-setting has been improving recently!');
  }

  return {
    successRate,
    commonChallenges: challenges,
    growth,
  };
}
