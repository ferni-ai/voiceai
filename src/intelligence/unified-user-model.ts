/**
 * Unified User Model (H2.3 - BTH Architecture)
 *
 * Aggregates learning signals from across the system into a single coherent user
 * profile that any persona can access for personalization and handoff decisions.
 *
 * @module intelligence/unified-user-model
 */

import { cleanForFirestore, getFirestoreDb, toSafeDate } from '../utils/firestore-utils.js';
import { createLogger } from '../utils/safe-logger.js';

const log = createLogger({ module: 'UnifiedUserModel' });

const COLLECTION = 'unified_user_models';
const BLEND_WEIGHT = 0.2; // How much new signals influence existing values (exponential moving average)

// --- TYPES ---

export interface UnifiedUserModel {
  userId: string;
  lastUpdated: Date;

  communicationStyle: {
    verbosity: 'concise' | 'moderate' | 'detailed';
    formality: 'casual' | 'balanced' | 'formal';
    preferredResponseLength: 'short' | 'medium' | 'long';
    humorAppreciation: number;
    directnessPreference: number;
  };

  engagementPatterns: {
    preferredTimeOfDay: string[];
    averageSessionDuration: number;
    sessionFrequency: number;
    topicDepthPreference: 'surface' | 'moderate' | 'deep';
  };

  emotionalProfile: {
    baselineValence: number;
    emotionalRange: number;
    vulnerabilityComfort: number;
    supportStyle: 'active_advice' | 'reflective_listening' | 'balanced';
  };

  interests: Array<{
    topic: string;
    engagementLevel: number;
    lastDiscussed: Date;
  }>;

  personaAffinities: Record<
    string,
    { sessionCount: number; lastInteraction: Date; satisfactionScore: number }
  >;
}

/** Optional signals from a conversation - any subset can be present. */
export interface ConversationSignals {
  communicationStyle?: Partial<UnifiedUserModel['communicationStyle']>;
  engagementPatterns?: Partial<UnifiedUserModel['engagementPatterns']>;
  emotionalProfile?: Partial<UnifiedUserModel['emotionalProfile']>;
  interests?: Array<{ topic: string; engagementLevel?: number }>;
  personaAffinity?: {
    personaId: string;
    sessionCount?: number;
    satisfactionScore?: number;
  };
}

// --- DEFAULT MODEL ---

export function createDefaultModel(userId: string): UnifiedUserModel {
  const now = new Date();
  return {
    userId,
    lastUpdated: now,
    communicationStyle: {
      verbosity: 'moderate',
      formality: 'balanced',
      preferredResponseLength: 'medium',
      humorAppreciation: 0.5,
      directnessPreference: 0.5,
    },
    engagementPatterns: {
      preferredTimeOfDay: [],
      averageSessionDuration: 10,
      sessionFrequency: 3,
      topicDepthPreference: 'moderate',
    },
    emotionalProfile: {
      baselineValence: 0,
      emotionalRange: 0.5,
      vulnerabilityComfort: 0.5,
      supportStyle: 'balanced',
    },
    interests: [],
    personaAffinities: {},
  };
}

// --- UPDATE (IMMUTABLE) ---

const blend = (cur: number, inc: number) => cur + BLEND_WEIGHT * (inc - cur);
const bn = (cur: number, inc?: number) => (inc !== undefined ? blend(cur, inc) : cur);

export function updateFromConversation(
  model: UnifiedUserModel,
  signals: ConversationSignals
): UnifiedUserModel {
  try {
    const now = new Date();
    let next = { ...model, lastUpdated: now };

    if (signals.communicationStyle) {
      const cs = signals.communicationStyle;
      next = {
        ...next,
        communicationStyle: {
          verbosity: cs.verbosity ?? next.communicationStyle.verbosity,
          formality: cs.formality ?? next.communicationStyle.formality,
          preferredResponseLength:
            cs.preferredResponseLength ?? next.communicationStyle.preferredResponseLength,
          humorAppreciation: bn(next.communicationStyle.humorAppreciation, cs.humorAppreciation),
          directnessPreference: bn(
            next.communicationStyle.directnessPreference,
            cs.directnessPreference
          ),
        },
      };
    }

    if (signals.engagementPatterns) {
      const ep = signals.engagementPatterns;
      next = {
        ...next,
        engagementPatterns: {
          preferredTimeOfDay: ep.preferredTimeOfDay ?? next.engagementPatterns.preferredTimeOfDay,
          averageSessionDuration: bn(
            next.engagementPatterns.averageSessionDuration,
            ep.averageSessionDuration
          ),
          sessionFrequency: bn(next.engagementPatterns.sessionFrequency, ep.sessionFrequency),
          topicDepthPreference:
            ep.topicDepthPreference ?? next.engagementPatterns.topicDepthPreference,
        },
      };
    }

    if (signals.emotionalProfile) {
      const em = signals.emotionalProfile;
      next = {
        ...next,
        emotionalProfile: {
          baselineValence: bn(next.emotionalProfile.baselineValence, em.baselineValence),
          emotionalRange: bn(next.emotionalProfile.emotionalRange, em.emotionalRange),
          vulnerabilityComfort: bn(
            next.emotionalProfile.vulnerabilityComfort,
            em.vulnerabilityComfort
          ),
          supportStyle: em.supportStyle ?? next.emotionalProfile.supportStyle,
        },
      };
    }

    if (signals.interests && signals.interests.length > 0) {
      const existing = new Map(next.interests.map((i) => [i.topic.toLowerCase(), i]));
      for (const { topic, engagementLevel = 0.5 } of signals.interests) {
        const key = topic.toLowerCase();
        const prev = existing.get(key);
        const level = prev ? blend(prev.engagementLevel, engagementLevel) : engagementLevel;
        existing.set(key, { topic, engagementLevel: level, lastDiscussed: now });
      }
      next = { ...next, interests: Array.from(existing.values()) };
    }

    if (signals.personaAffinity) {
      const { personaId, sessionCount, satisfactionScore } = signals.personaAffinity;
      const prev = next.personaAffinities[personaId];
      next = {
        ...next,
        personaAffinities: {
          ...next.personaAffinities,
          [personaId]: {
            sessionCount: (prev?.sessionCount ?? 0) + (sessionCount ?? 1),
            lastInteraction: now,
            satisfactionScore:
              satisfactionScore !== undefined
                ? prev
                  ? blend(prev.satisfactionScore, satisfactionScore)
                  : satisfactionScore
                : (prev?.satisfactionScore ?? 0.5),
          },
        },
      };
    }

    return next;
  } catch (error) {
    log.warn({ error: String(error), userId: model.userId }, 'Failed to update model from signals');
    return model;
  }
}

// --- PERSISTENCE ---

export async function loadUserModel(userId: string): Promise<UnifiedUserModel> {
  const db = getFirestoreDb();
  if (!db) return createDefaultModel(userId);

  try {
    const doc = await db.collection(COLLECTION).doc(userId).get();
    if (!doc.exists) return createDefaultModel(userId);

    const data = doc.data();
    if (!data) return createDefaultModel(userId);

    const r = data as Record<string, unknown>;
    const cs = (r.communicationStyle ?? {}) as Record<string, unknown>;
    const ep = (r.engagementPatterns ?? {}) as Record<string, unknown>;
    const em = (r.emotionalProfile ?? {}) as Record<string, unknown>;
    const interests = (r.interests as Array<Record<string, unknown>> | undefined) ?? [];
    const affinities = (r.personaAffinities as Record<string, Record<string, unknown>>) ?? {};

    return {
      userId: String(r.userId ?? userId),
      lastUpdated: toSafeDate(r.lastUpdated),
      communicationStyle: {
        verbosity: ((cs.verbosity as string) ||
          'moderate') as UnifiedUserModel['communicationStyle']['verbosity'],
        formality: ((cs.formality as string) ||
          'balanced') as UnifiedUserModel['communicationStyle']['formality'],
        preferredResponseLength: ((cs.preferredResponseLength as string) ||
          'medium') as UnifiedUserModel['communicationStyle']['preferredResponseLength'],
        humorAppreciation: Number(cs.humorAppreciation) || 0.5,
        directnessPreference: Number(cs.directnessPreference) || 0.5,
      },
      engagementPatterns: {
        preferredTimeOfDay: (ep.preferredTimeOfDay as string[]) ?? [],
        averageSessionDuration: Number(ep.averageSessionDuration) || 10,
        sessionFrequency: Number(ep.sessionFrequency) || 3,
        topicDepthPreference: ((ep.topicDepthPreference as string) ||
          'moderate') as UnifiedUserModel['engagementPatterns']['topicDepthPreference'],
      },
      emotionalProfile: {
        baselineValence: Number(em.baselineValence) || 0,
        emotionalRange: Number(em.emotionalRange) || 0.5,
        vulnerabilityComfort: Number(em.vulnerabilityComfort) || 0.5,
        supportStyle: ((em.supportStyle as string) ||
          'balanced') as UnifiedUserModel['emotionalProfile']['supportStyle'],
      },
      interests: interests.map((i) => ({
        topic: String(i.topic ?? ''),
        engagementLevel: Number(i.engagementLevel) || 0.5,
        lastDiscussed: toSafeDate(i.lastDiscussed),
      })),
      personaAffinities: Object.fromEntries(
        Object.entries(affinities).map(([k, v]) => [
          k,
          {
            sessionCount: Number(v?.sessionCount) || 0,
            lastInteraction: toSafeDate(v?.lastInteraction),
            satisfactionScore: Number(v?.satisfactionScore) || 0.5,
          },
        ])
      ),
    };
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to load user model, using default');
    return createDefaultModel(userId);
  }
}

export async function saveUserModel(model: UnifiedUserModel): Promise<void> {
  const db = getFirestoreDb();
  if (!db) {
    log.debug({ userId: model.userId }, 'Firestore not available for user model save');
    return;
  }

  try {
    const doc: Record<string, unknown> = {
      ...model,
      lastUpdated: model.lastUpdated,
    };
    await db.collection(COLLECTION).doc(model.userId).set(cleanForFirestore(doc));
    log.debug({ userId: model.userId }, 'User model saved');
  } catch (error) {
    log.error({ error: String(error), userId: model.userId }, 'Failed to save user model');
  }
}

// --- CONTEXT & RECOMMENDATION ---

export function buildUserModelContext(model: UnifiedUserModel): string {
  const { communicationStyle, engagementPatterns, emotionalProfile, interests } = model;
  const pct = (n: number) => (n * 100).toFixed(0);
  const parts = [
    `[User model] Communication: ${communicationStyle.verbosity}, ${communicationStyle.formality}. ` +
      `Prefers ${communicationStyle.preferredResponseLength}. Humor: ${pct(communicationStyle.humorAppreciation)}%, directness: ${pct(communicationStyle.directnessPreference)}%.`,
    `Engagement: ~${engagementPatterns.averageSessionDuration} min, ${engagementPatterns.sessionFrequency}/week. Depth: ${engagementPatterns.topicDepthPreference}.`,
    `Emotional: valence ${emotionalProfile.baselineValence.toFixed(2)}, range ${pct(emotionalProfile.emotionalRange)}%. Support: ${emotionalProfile.supportStyle}.`,
  ];
  if (interests.length > 0) {
    const top = interests
      .sort((a, b) => b.engagementLevel - a.engagementLevel)
      .slice(0, 5)
      .map((i) => `${i.topic} (${pct(i.engagementLevel)}%)`)
      .join(', ');
    parts.push(`Top interests: ${top}.`);
  }
  return parts.join('\n');
}

const PERSONA_IDS = ['ferni', 'peter', 'maya', 'jordan', 'alex', 'nayan'] as const;

export function getPersonaRecommendation(model: UnifiedUserModel): string | null {
  const { personaAffinities, emotionalProfile } = model;
  if (Object.keys(personaAffinities).length === 0) return null;

  const candidates = PERSONA_IDS.filter((id) => personaAffinities[id]).map((id) => ({
    id,
    ...personaAffinities[id],
  }));
  if (candidates.length === 0) return null;

  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const stale = candidates.filter((c) => c.lastInteraction.getTime() < weekAgo);
  const toScore = stale.length > 0 ? stale : candidates;

  const scored = toScore
    .map((c) => ({
      id: c.id,
      score:
        c.satisfactionScore * 0.6 +
        (c.sessionCount > 0 ? Math.min(c.sessionCount * 0.05, 0.2) : 0) +
        (emotionalProfile.supportStyle === 'reflective_listening' &&
        ['nayan', 'ferni'].includes(c.id)
          ? 0.1
          : 0),
    }))
    .sort((a, b) => b.score - a.score);

  return scored[0]?.score >= 0.5 ? scored[0].id : null;
}
