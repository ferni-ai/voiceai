/**
 * Shared Personality Resonance Store
 *
 * Cross-session learning: What personality expressions resonate with THIS user?
 *
 * This is what makes ALL personas "better than human" - a real friend learns
 * what makes you laugh, what references land, what topics feel safe.
 * Most AI forgets every session. We remember and adapt.
 *
 * Storage: Firestore under bogle_users/{userId}/personality_resonance
 *
 * Generalized from: personas/bundles/ferni/personality-resonance-store.ts
 *
 * @module personas/shared/personality-resonance-store
 */

import { createLogger } from '../../utils/safe-logger.js';
import type { ThemeCategory } from '../../services/session-manager/session-variety-tracker.js';
import type { UserResonanceProfile } from './better-than-human-personality.js';
import { cleanForFirestore } from '../../utils/firestore-utils.js';

const log = createLogger({ module: 'shared-personality-resonance' });

// ============================================================================
// FIRESTORE TYPES & STATE
// ============================================================================

interface Firestore {
  collection: (path: string) => CollectionReference;
}

interface CollectionReference {
  doc: (id: string) => DocumentReference;
}

interface DocumentReference {
  set: (data: unknown, options?: { merge?: boolean }) => Promise<unknown>;
  get: () => Promise<DocumentSnapshot>;
  collection: (path: string) => CollectionReference;
}

interface DocumentSnapshot {
  exists: boolean;
  data: () => Record<string, unknown> | undefined;
}

// Firestore instance (lazy loaded)
let firestoreDb: Firestore | null = null;
let firestoreInitPromise: Promise<void> | null = null;

// Debounced save tracking
const pendingSaves = new Map<string, ReturnType<typeof setTimeout>>();
const SAVE_DEBOUNCE_MS = 5000;

// ============================================================================
// TYPES
// ============================================================================

interface ResonanceEvent {
  theme: ThemeCategory;
  expressionId?: string;
  engagement: 'positive' | 'neutral' | 'negative';
  personaId: string; // Which persona was expressing
  context: {
    turnCount: number;
    momentum: string;
    emotion?: string;
  };
  timestamp: Date;
}

interface StoredResonanceProfile {
  userId: string;

  // Theme resonance scores (0-1, starts at 0.5)
  themeScores: Record<ThemeCategory, number>;

  // Specific expression resonance
  expressionEngagement: Record<
    string,
    {
      positive: number;
      negative: number;
      lastUsed: Date;
    }
  >;

  // User topic mentions (for callbacks)
  mentionedTopics: Array<{
    topic: string;
    firstMentioned: Date;
    lastMentioned: Date;
    timesReferenced: number;
  }>;

  // Vulnerability comfort level
  vulnerabilityComfort: {
    level: 'low' | 'medium' | 'high';
    lastVulnerableShare?: Date;
    responseType?: 'reciprocated' | 'deflected' | 'ignored';
  };

  // Preferred expression style
  stylePreferences: {
    preferredLength: 'brief' | 'medium' | 'detailed';
    likesHumor: boolean;
    likesStories: boolean;
    likesDirect: boolean;
  };

  // Per-persona resonance (what works from each persona)
  perPersonaResonance?: Record<
    string,
    {
      resonantThemes: ThemeCategory[];
      avoidThemes: ThemeCategory[];
      lastInteraction: Date;
    }
  >;

  // Metadata
  totalExpressions: number;
  lastUpdated: Date;
  version: number;
}

// ============================================================================
// IN-MEMORY CACHE
// ============================================================================

const resonanceCache = new Map<string, StoredResonanceProfile>();

// ============================================================================
// FIRESTORE HELPERS
// ============================================================================

function schedulePersist(userId: string, profile: StoredResonanceProfile): void {
  const existing = pendingSaves.get(userId);
  if (existing) {
    clearTimeout(existing);
  }

  const timeout = setTimeout(() => {
    pendingSaves.delete(userId);
    void persistToFirestore(userId, profile);
  }, SAVE_DEBOUNCE_MS);

  pendingSaves.set(userId, timeout);
}

async function persistToFirestore(userId: string, profile: StoredResonanceProfile): Promise<void> {
  const db = await initFirestore();
  if (!db) return;

  try {
    const docRef = db.collection('bogle_users').doc(userId);
    const profileDoc = docRef.collection('personality_resonance').doc('profile');

    const serialized = {
      ...profile,
      lastUpdated: profile.lastUpdated.toISOString(),
      mentionedTopics: profile.mentionedTopics.map((t) => ({
        ...t,
        firstMentioned: t.firstMentioned.toISOString(),
        lastMentioned: t.lastMentioned.toISOString(),
      })),
      expressionEngagement: Object.fromEntries(
        Object.entries(profile.expressionEngagement).map(([k, v]) => [
          k,
          { ...v, lastUsed: v.lastUsed.toISOString() },
        ])
      ),
      vulnerabilityComfort: {
        ...profile.vulnerabilityComfort,
        lastVulnerableShare: profile.vulnerabilityComfort.lastVulnerableShare?.toISOString(),
      },
    };

    await profileDoc.set(cleanForFirestore(serialized), { merge: true });
    log.debug(
      { userId, totalExpressions: profile.totalExpressions },
      'Persisted resonance profile'
    );
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to persist resonance profile');
  }
}

async function initFirestore(): Promise<Firestore | null> {
  if (firestoreDb) return firestoreDb;

  if (!firestoreInitPromise) {
    firestoreInitPromise = (async () => {
      try {
        const { Firestore: FirestoreClass } = await import('@google-cloud/firestore');
        firestoreDb = new FirestoreClass({
          projectId: process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT,
          databaseId: process.env.FIRESTORE_DATABASE || '(default)',
        }) as unknown as Firestore;
        log.info('Firestore initialized for shared personality resonance');
      } catch (error) {
        log.debug({ error: String(error) }, 'Firestore not available, using in-memory only');
        firestoreDb = null;
      }
    })();
  }

  await firestoreInitPromise;
  return firestoreDb;
}

// ============================================================================
// PROFILE OPERATIONS
// ============================================================================

/**
 * Load user's resonance profile from cache or Firestore
 */
export async function loadResonanceProfile(userId: string): Promise<UserResonanceProfile | null> {
  try {
    const cached = resonanceCache.get(userId);
    if (cached) {
      return transformToResonanceProfile(cached);
    }

    const db = await initFirestore();
    if (db) {
      try {
        const docRef = db.collection('bogle_users').doc(userId);
        const profileDoc = await docRef.collection('personality_resonance').doc('profile').get();

        if (profileDoc.exists) {
          const data = profileDoc.data() as StoredResonanceProfile | undefined;
          if (data) {
            const profile: StoredResonanceProfile = {
              ...data,
              lastUpdated: new Date(data.lastUpdated as unknown as string),
              mentionedTopics: (data.mentionedTopics || []).map((t) => ({
                ...t,
                firstMentioned: new Date(t.firstMentioned as unknown as string),
                lastMentioned: new Date(t.lastMentioned as unknown as string),
              })),
              vulnerabilityComfort: {
                ...data.vulnerabilityComfort,
                lastVulnerableShare: data.vulnerabilityComfort.lastVulnerableShare
                  ? new Date(data.vulnerabilityComfort.lastVulnerableShare as unknown as string)
                  : undefined,
              },
            };

            resonanceCache.set(userId, profile);
            log.debug({ userId }, 'Loaded resonance profile from Firestore');
            return transformToResonanceProfile(profile);
          }
        }
      } catch (firestoreError) {
        log.warn({ error: String(firestoreError), userId }, 'Firestore load failed (non-critical)');
      }
    }

    log.debug({ userId }, 'No resonance profile found, will use defaults');
    return null;
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to load resonance profile');
    return null;
  }
}

/**
 * Record a resonance event (called when we detect user reaction)
 */
export async function recordResonanceEvent(userId: string, event: ResonanceEvent): Promise<void> {
  try {
    const profile = resonanceCache.get(userId) || createDefaultProfile(userId);

    // Update theme score
    const currentScore = profile.themeScores[event.theme] ?? 0.5;
    const adjustment = getEngagementAdjustment(event.engagement);
    profile.themeScores[event.theme] = clamp(currentScore + adjustment, 0, 1);

    // Update expression engagement if specific
    if (event.expressionId) {
      const expr = profile.expressionEngagement[event.expressionId] || {
        positive: 0,
        negative: 0,
        lastUsed: new Date(),
      };

      if (event.engagement === 'positive') expr.positive++;
      else if (event.engagement === 'negative') expr.negative++;
      expr.lastUsed = new Date();

      profile.expressionEngagement[event.expressionId] = expr;
    }

    // Update per-persona resonance
    if (!profile.perPersonaResonance) {
      profile.perPersonaResonance = {};
    }
    if (!profile.perPersonaResonance[event.personaId]) {
      profile.perPersonaResonance[event.personaId] = {
        resonantThemes: [],
        avoidThemes: [],
        lastInteraction: new Date(),
      };
    }

    const personaRes = profile.perPersonaResonance[event.personaId];
    personaRes.lastInteraction = new Date();

    if (event.engagement === 'positive' && !personaRes.resonantThemes.includes(event.theme)) {
      personaRes.resonantThemes.push(event.theme);
    } else if (event.engagement === 'negative' && !personaRes.avoidThemes.includes(event.theme)) {
      personaRes.avoidThemes.push(event.theme);
    }

    // Update metadata
    profile.totalExpressions++;
    profile.lastUpdated = new Date();

    resonanceCache.set(userId, profile);
    schedulePersist(userId, profile);

    log.debug(
      {
        userId,
        personaId: event.personaId,
        theme: event.theme,
        engagement: event.engagement,
        newScore: profile.themeScores[event.theme],
      },
      'Recorded resonance event'
    );
  } catch (error) {
    log.error({ error, userId }, 'Failed to record resonance event');
  }
}

/**
 * Record a user topic mention (for future callbacks)
 */
export async function recordUserTopicMention(userId: string, topic: string): Promise<void> {
  try {
    const profile = resonanceCache.get(userId) || createDefaultProfile(userId);

    const existing = profile.mentionedTopics.find(
      (t) => t.topic.toLowerCase() === topic.toLowerCase()
    );

    if (existing) {
      existing.lastMentioned = new Date();
      existing.timesReferenced++;
    } else {
      profile.mentionedTopics.push({
        topic,
        firstMentioned: new Date(),
        lastMentioned: new Date(),
        timesReferenced: 1,
      });
    }

    profile.mentionedTopics = profile.mentionedTopics
      .sort((a, b) => b.timesReferenced - a.timesReferenced)
      .slice(0, 50);

    profile.lastUpdated = new Date();
    resonanceCache.set(userId, profile);
    schedulePersist(userId, profile);

    log.debug({ userId, topic }, 'Recorded topic mention');
  } catch (error) {
    log.error({ error, userId, topic }, 'Failed to record topic mention');
  }
}

/**
 * Record vulnerability response
 */
export async function recordVulnerabilityResponse(
  userId: string,
  responseType: 'reciprocated' | 'deflected' | 'ignored'
): Promise<void> {
  try {
    const profile = resonanceCache.get(userId) || createDefaultProfile(userId);

    profile.vulnerabilityComfort.lastVulnerableShare = new Date();
    profile.vulnerabilityComfort.responseType = responseType;

    if (responseType === 'reciprocated') {
      if (profile.vulnerabilityComfort.level === 'low') {
        profile.vulnerabilityComfort.level = 'medium';
      } else if (profile.vulnerabilityComfort.level === 'medium') {
        profile.vulnerabilityComfort.level = 'high';
      }
    } else if (responseType === 'deflected' || responseType === 'ignored') {
      if (profile.vulnerabilityComfort.level === 'high') {
        profile.vulnerabilityComfort.level = 'medium';
      } else if (profile.vulnerabilityComfort.level === 'medium') {
        profile.vulnerabilityComfort.level = 'low';
      }
    }

    profile.lastUpdated = new Date();
    resonanceCache.set(userId, profile);
    schedulePersist(userId, profile);

    log.debug(
      {
        userId,
        responseType,
        newLevel: profile.vulnerabilityComfort.level,
      },
      'Recorded vulnerability response'
    );
  } catch (error) {
    log.error({ error, userId }, 'Failed to record vulnerability response');
  }
}

/**
 * Force immediate persist (call on session end)
 */
export async function flushResonanceProfile(userId: string): Promise<void> {
  const existing = pendingSaves.get(userId);
  if (existing) {
    clearTimeout(existing);
    pendingSaves.delete(userId);
  }

  const profile = resonanceCache.get(userId);
  if (profile) {
    await persistToFirestore(userId, profile);
  }
}

// ============================================================================
// SYNC CACHE ACCESS
// ============================================================================

/**
 * Get resonance profile from cache ONLY (synchronous, for hot path).
 */
export function getCachedResonance(userId: string): UserResonanceProfile | null {
  const cached = resonanceCache.get(userId);
  if (!cached) return null;
  return transformToResonanceProfile(cached);
}

/**
 * Pre-load resonance profile into cache (async, call at session start).
 */
export async function prewarmResonanceCache(userId: string): Promise<void> {
  await loadResonanceProfile(userId);
}

// ============================================================================
// ENGAGEMENT DETECTION
// ============================================================================

/**
 * Analyze user's response to detect engagement
 */
export function detectEngagement(
  userResponse: string,
  previousExpression: { theme: ThemeCategory; content: string }
): 'positive' | 'neutral' | 'negative' {
  const response = userResponse.toLowerCase();

  const positivePatterns = [
    /that('s| is) (so |really |exactly )?true/i,
    /i (love|like) that/i,
    /yes!? (exactly|definitely|totally)/i,
    /me too/i,
    /same/i,
    /that makes sense/i,
    /i (feel|felt) that/i,
    /wow/i,
    /thank you for sharing/i,
    /i appreciate/i,
    /haha|hah|lol|😂|🤣/i,
    /that('s| is) (beautiful|wonderful|amazing)/i,
    /i relate/i,
    /you get it/i,
  ];

  const negativePatterns = [
    /anyway/i,
    /so,? (what|how)/i,
    /let('s| us) (move on|talk about|get back)/i,
    /i don('t| do not) (really )?(want|need) to/i,
    /that('s| is) (weird|strange|odd)/i,
    /ok(ay)?\.\.\./i,
    /sure/i,
  ];

  for (const pattern of positivePatterns) {
    if (pattern.test(response)) return 'positive';
  }

  for (const pattern of negativePatterns) {
    if (pattern.test(response)) return 'negative';
  }

  if (userResponse.split(' ').length < 5 && previousExpression.theme === 'vulnerability') {
    return 'negative';
  }

  return 'neutral';
}

// ============================================================================
// HELPERS
// ============================================================================

function createDefaultProfile(userId: string): StoredResonanceProfile {
  return {
    userId,
    themeScores: {} as Record<ThemeCategory, number>,
    expressionEngagement: {},
    mentionedTopics: [],
    vulnerabilityComfort: {
      level: 'medium',
    },
    stylePreferences: {
      preferredLength: 'medium',
      likesHumor: true,
      likesStories: true,
      likesDirect: false,
    },
    perPersonaResonance: {},
    totalExpressions: 0,
    lastUpdated: new Date(),
    version: 1,
  };
}

function transformToResonanceProfile(stored: StoredResonanceProfile): UserResonanceProfile {
  const resonantThemes: ThemeCategory[] = [];
  const avoidThemes: ThemeCategory[] = [];

  for (const [theme, score] of Object.entries(stored.themeScores)) {
    if (score > 0.6) {
      resonantThemes.push(theme as ThemeCategory);
    } else if (score < 0.4) {
      avoidThemes.push(theme as ThemeCategory);
    }
  }

  const connectionPoints: string[] = [];
  for (const [exprId, engagement] of Object.entries(stored.expressionEngagement)) {
    if (engagement.positive > engagement.negative * 2) {
      const theme = exprId.split('-')[0];
      if (theme && !connectionPoints.includes(`${theme} references`)) {
        connectionPoints.push(`${theme} references`);
      }
    }
  }

  return {
    resonantThemes,
    avoidThemes,
    connectionPoints: connectionPoints.slice(0, 5),
    comfortWithVulnerability: stored.vulnerabilityComfort.level,
    preferredExpressionLength: stored.stylePreferences.preferredLength,
    userMentionedTopics: stored.mentionedTopics
      .sort((a, b) => b.timesReferenced - a.timesReferenced)
      .slice(0, 10)
      .map((t) => t.topic),
  };
}

function getEngagementAdjustment(engagement: 'positive' | 'neutral' | 'negative'): number {
  switch (engagement) {
    case 'positive':
      return 0.05;
    case 'negative':
      return -0.08;
    case 'neutral':
    default:
      return 0;
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

// ============================================================================
// EXPORTS
// ============================================================================

export const sharedPersonalityResonanceStore = {
  load: loadResonanceProfile,
  getCached: getCachedResonance,
  prewarm: prewarmResonanceCache,
  recordEvent: recordResonanceEvent,
  recordTopicMention: recordUserTopicMention,
  recordVulnerabilityResponse,
  detectEngagement,
  flush: flushResonanceProfile,
};

export default sharedPersonalityResonanceStore;
