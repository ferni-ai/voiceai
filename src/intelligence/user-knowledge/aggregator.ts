/**
 * User Knowledge Aggregator - "Better Than Human" Data Unification
 *
 * Aggregates user knowledge from ALL intelligence sources:
 * - Lifestyle preferences (preference-extractor.ts)
 * - Data captures (contacts, commitments, dreams, relationships)
 * - Superhuman services (19 capabilities)
 * - User profiles
 * - Semantic intelligence
 *
 * > "Your best friend forgets. We don't."
 *
 * @module intelligence/user-knowledge/aggregator
 */

import { createLogger } from '../../utils/safe-logger.js';
import type {
  UserKnowledge,
  IdentityKnowledge,
  LifestyleKnowledge,
  RelationshipKnowledge,
  AspirationsKnowledge,
  WellnessKnowledge,
  WorkKnowledge,
  CommunicationKnowledge,
  EmotionalKnowledge,
  PatternKnowledge,
  BoundaryKnowledge,
  SharedHistoryKnowledge,
  KnowledgeMetadata,
  KnowledgeOptions,
  ContactInfo,
  DreamItem,
  CommitmentItem,
} from './types.js';
import type { Dream } from '../../services/superhuman/dream-keeper.js';
import type { Commitment } from '../../services/superhuman/commitment-keeper.js';
import type { EmotionalArc } from '../../services/superhuman/semantic-intelligence/emotional-trajectories.js';
import type { UserValue } from '../../services/superhuman/values-alignment.js';
import type { OpenLoop } from '../../services/superhuman/semantic-intelligence/open-loops.js';

const log = createLogger({ module: 'UserKnowledgeAggregator' });

// ============================================================================
// CACHE
// ============================================================================

interface CachedKnowledge {
  knowledge: UserKnowledge;
  fetchedAt: Date;
}

const knowledgeCache = new Map<string, CachedKnowledge>();
const CACHE_TTL_MS = 60 * 1000; // 1 minute cache

/**
 * Clear cache for a user
 */
export function clearKnowledgeCache(userId: string): void {
  knowledgeCache.delete(userId);
}

// ============================================================================
// FIRESTORE ACCESS
// ============================================================================

async function getFirestoreDb(): Promise<FirebaseFirestore.Firestore | null> {
  try {
    const admin = await import('firebase-admin');
    if (admin.apps.length === 0) {
      admin.initializeApp();
    }
    return admin.firestore();
  } catch (error) {
    log.debug({ error: String(error) }, 'Firestore not available');
    return null;
  }
}

// ============================================================================
// MAIN AGGREGATOR
// ============================================================================

/**
 * Get complete user knowledge from all sources
 */
export async function getUserKnowledge(
  userId: string,
  options?: KnowledgeOptions
): Promise<UserKnowledge> {
  // Check cache unless force refresh
  if (!options?.forceRefresh) {
    const cached = knowledgeCache.get(userId);
    if (cached && Date.now() - cached.fetchedAt.getTime() < CACHE_TTL_MS) {
      log.debug({ userId }, 'Returning cached user knowledge');
      return cached.knowledge;
    }
  }

  log.debug({ userId }, 'Aggregating user knowledge from all sources');
  const startTime = Date.now();

  // Run all data fetches in parallel for performance
  const [
    identity,
    lifestyle,
    relationships,
    aspirations,
    wellness,
    work,
    communication,
    emotional,
    patterns,
    boundaries,
    sharedHistory,
  ] = await Promise.all([
    aggregateIdentity(userId),
    aggregateLifestyle(userId),
    aggregateRelationships(userId),
    aggregateAspirations(userId),
    aggregateWellness(userId),
    aggregateWork(userId),
    aggregateCommunication(userId),
    aggregateEmotional(userId),
    aggregatePatterns(userId),
    aggregateBoundaries(userId),
    aggregateSharedHistory(userId),
  ]);

  // Calculate completeness scores
  const metadata = calculateMetadata(
    userId,
    identity,
    lifestyle,
    relationships,
    aspirations,
    wellness,
    work,
    communication,
    emotional,
    patterns,
    boundaries,
    sharedHistory
  );

  const knowledge: UserKnowledge = {
    userId,
    identity,
    lifestyle,
    relationships,
    aspirations,
    wellness,
    work,
    communication,
    emotional,
    patterns,
    boundaries,
    sharedHistory,
    metadata,
  };

  // Update cache
  knowledgeCache.set(userId, {
    knowledge,
    fetchedAt: new Date(),
  });

  const durationMs = Date.now() - startTime;
  log.debug(
    {
      userId,
      durationMs,
      completeness: metadata.completeness.overall,
    },
    'User knowledge aggregated'
  );

  return knowledge;
}

// ============================================================================
// SECTION AGGREGATORS
// ============================================================================

async function aggregateIdentity(userId: string): Promise<IdentityKnowledge> {
  const identity: IdentityKnowledge = {};

  try {
    const db = await getFirestoreDb();
    if (!db) return identity;

    // Get from user profile
    const profileDoc = await db.collection('bogle_users').doc(userId).get();
    if (profileDoc.exists) {
      const data = profileDoc.data();
      identity.name = data?.name || data?.displayName;
      identity.timezone = data?.timezone;
      identity.occupation = data?.occupation;
      identity.company = data?.company;
      identity.birthday = data?.birthday;
    }
  } catch (error) {
    log.debug({ error: String(error), userId }, 'Failed to aggregate identity');
  }

  return identity;
}

async function aggregateLifestyle(userId: string): Promise<LifestyleKnowledge> {
  const lifestyle: LifestyleKnowledge = {
    entertainment: {
      musicLikes: [],
      musicDislikes: [],
      movieGenres: [],
      tvShows: [],
      sportsTeams: [],
    },
    food: {
      cuisineLikes: [],
      cuisineDislikes: [],
      dietaryRestrictions: [],
      drinks: [],
      favoriteRestaurants: [],
    },
    travel: {
      bucketList: [],
      favoritePlaces: [],
    },
    learning: {
      goals: [],
      skills: [],
      interests: [],
    },
    daily: {
      shoppingPreferences: [],
    },
  };

  try {
    const db = await getFirestoreDb();
    if (!db) return lifestyle;

    // Get all lifestyle preferences from subcollection
    const prefsSnapshot = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('lifestyle_preferences')
      .get();

    for (const doc of prefsSnapshot.docs) {
      const domain = doc.id;
      const data = doc.data();
      const likes = (data.likes as string[]) || [];
      const dislikes = (data.dislikes as string[]) || [];

      switch (domain) {
        case 'music':
          lifestyle.entertainment.musicLikes = likes;
          lifestyle.entertainment.musicDislikes = dislikes;
          break;
        case 'entertainment':
          lifestyle.entertainment.movieGenres = likes.filter((l) =>
            ['comedy', 'drama', 'action', 'horror', 'romance', 'thriller', 'sci-fi'].includes(
              l.toLowerCase()
            )
          );
          lifestyle.entertainment.tvShows = likes.filter(
            (l) =>
              !['comedy', 'drama', 'action', 'horror', 'romance', 'thriller', 'sci-fi'].includes(
                l.toLowerCase()
              )
          );
          break;
        case 'food':
          lifestyle.food.cuisineLikes = likes;
          lifestyle.food.cuisineDislikes = dislikes;
          lifestyle.food.dietaryRestrictions = (data.restrictions as string[]) || [];
          lifestyle.food.drinks = (data.drinks as string[]) || [];
          lifestyle.food.favoriteRestaurants = (data.restaurants as string[]) || [];
          break;
        case 'travel':
          lifestyle.travel.style = data.style as string | undefined;
          lifestyle.travel.bucketList = (data.bucketList as string[]) || likes;
          lifestyle.travel.favoritePlaces = (data.favoritePlaces as string[]) || [];
          break;
        case 'learning':
          lifestyle.learning.goals = (data.goals as string[]) || likes;
          lifestyle.learning.skills = (data.skills as string[]) || [];
          lifestyle.learning.interests = (data.interests as string[]) || [];
          break;
        case 'daily_life':
          lifestyle.daily.productivityStyle = data.productivityStyle as string | undefined;
          lifestyle.daily.morningRoutine = data.morningRoutine as string | undefined;
          lifestyle.daily.sleepPattern = data.sleepPattern as string | undefined;
          lifestyle.daily.shoppingPreferences = (data.shoppingPreferences as string[]) || likes;
          break;
        case 'wellness':
          // Handle in wellness aggregator
          break;
        case 'social':
          // Handle in communication aggregator
          break;
      }
    }

    // Get favorite sports teams from user profile or dedicated collection
    const profileDoc = await db.collection('bogle_users').doc(userId).get();
    if (profileDoc.exists) {
      const data = profileDoc.data();
      const teams = data?.favoriteTeams || data?.sportsTeams;
      if (Array.isArray(teams)) {
        lifestyle.entertainment.sportsTeams = teams.map((t: { name?: string }) =>
          typeof t === 'string' ? t : t.name || ''
        );
      }
    }
  } catch (error) {
    log.debug({ error: String(error), userId }, 'Failed to aggregate lifestyle');
  }

  return lifestyle;
}

async function aggregateRelationships(userId: string): Promise<RelationshipKnowledge> {
  const relationships: RelationshipKnowledge = {
    contacts: [],
    keyPeople: [],
    patterns: [],
  };

  try {
    // Load contacts from contacts service
    const { getContacts } = await import('../../services/contacts/index.js');
    const allContacts = await getContacts(userId);
    const contacts = allContacts.slice(0, 100); // Limit to 100

    relationships.contacts = contacts.map(
      (c: {
        displayName?: string;
        relationship?: string;
        phones?: Array<{ number?: string }>;
        emails?: Array<{ address?: string }>;
        lastContactedAt?: Date;
      }): ContactInfo => ({
        name: c.displayName || 'Unknown',
        relationship: c.relationship,
        phone: c.phones?.[0]?.number,
        email: c.emails?.[0]?.address,
        lastMentioned: c.lastContactedAt,
      })
    );

    // Identify key people (family, partner, close relationships)
    const keyRelationships = [
      'mother',
      'father',
      'wife',
      'husband',
      'spouse',
      'partner',
      'sister',
      'brother',
      'son',
      'daughter',
    ];

    relationships.keyPeople = contacts
      .filter(
        (c: { relationship?: string }) =>
          c.relationship && keyRelationships.includes(c.relationship.toLowerCase())
      )
      .map((c: { displayName?: string; relationship?: string }) => ({
        name: c.displayName || 'Unknown',
        relationship: c.relationship || 'unknown',
        importance: (['wife', 'husband', 'spouse', 'partner'].includes(
          c.relationship?.toLowerCase() || ''
        )
          ? 'critical'
          : 'high') as 'critical' | 'high',
      }));

    // Load relationship patterns from semantic intelligence
    const db = await getFirestoreDb();
    if (db) {
      const networkDoc = await db
        .collection('bogle_users')
        .doc(userId)
        .collection('deep_understanding')
        .doc('relational_network')
        .get();

      if (networkDoc.exists) {
        const data = networkDoc.data();
        const people = (data?.people as Array<{ name: string; sentiment?: string }>) || [];

        // Merge with existing key people
        for (const person of people.slice(0, 10)) {
          if (!relationships.keyPeople.find((k) => k.name === person.name)) {
            relationships.keyPeople.push({
              name: person.name,
              relationship: 'mentioned',
              importance: 'medium',
              sentiment: person.sentiment as 'positive' | 'negative' | 'mixed' | 'neutral',
            });
          }
        }
      }
    }
  } catch (error) {
    log.debug({ error: String(error), userId }, 'Failed to aggregate relationships');
  }

  return relationships;
}

async function aggregateAspirations(userId: string): Promise<AspirationsKnowledge> {
  const aspirations: AspirationsKnowledge = {
    dreams: [],
    commitments: [],
    goals: [],
  };

  try {
    // Load dreams from dream-keeper (Dream type imported at top of file)
    const { loadUserDreams } = await import('../../services/superhuman/dream-keeper.js');
    const dreams = await loadUserDreams(userId);

    aspirations.dreams = dreams.map(
      (d: Dream): DreamItem => ({
        description: d.statement || d.title || '',
        type: d.type || 'general',
        mentionedAt: d.lastMentioned ? new Date(d.lastMentioned) : undefined,
        status: d.status === 'achieved' ? 'achieved' : 'active',
      })
    );

    // Load commitments from commitment-keeper (Commitment type imported at top of file)
    const { loadUserCommitments } = await import('../../services/superhuman/commitment-keeper.js');
    const allCommitments = await loadUserCommitments(userId);
    // Filter to pending/active commitments
    const pendingCommitments = allCommitments.filter(
      (c: Commitment) => c.status === 'active' || c.status === 'unclear'
    );

    aspirations.commitments = pendingCommitments.map(
      (c: Commitment): CommitmentItem => ({
        description: c.summary || c.statement || '',
        dueDate: c.targetDate ? new Date(c.targetDate) : undefined,
        status:
          c.status === 'completed'
            ? 'completed'
            : c.targetDate && new Date(c.targetDate) < new Date()
              ? 'overdue'
              : 'pending',
        createdAt: c.createdAt ? new Date(c.createdAt) : undefined,
      })
    );
  } catch (error) {
    log.debug({ error: String(error), userId }, 'Failed to aggregate aspirations');
  }

  return aspirations;
}

async function aggregateWellness(userId: string): Promise<WellnessKnowledge> {
  const wellness: WellnessKnowledge = {
    health: {
      allergies: [],
      conditions: [],
    },
    fitness: {
      exercises: [],
      routines: [],
      preferences: [],
    },
    mental: {
      practices: [],
    },
    sleep: {},
  };

  try {
    const db = await getFirestoreDb();
    if (!db) return wellness;

    // Get allergies from user profile
    const profileDoc = await db.collection('bogle_users').doc(userId).get();
    if (profileDoc.exists) {
      const data = profileDoc.data();
      wellness.health.allergies = (data?.allergies as string[]) || [];
    }

    // Get wellness preferences
    const wellnessDoc = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('lifestyle_preferences')
      .doc('wellness')
      .get();

    if (wellnessDoc.exists) {
      const data = wellnessDoc.data();
      wellness.fitness.exercises = (data?.likes as string[]) || [];
      wellness.fitness.routines = (data?.routines as string[]) || [];
      wellness.mental.practices = (data?.mentalPractices as string[]) || [];
    }

    // Get sleep pattern
    const dailyDoc = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('lifestyle_preferences')
      .doc('daily_life')
      .get();

    if (dailyDoc.exists) {
      const data = dailyDoc.data();
      wellness.sleep.pattern = data?.sleepPattern as string | undefined;
    }
  } catch (error) {
    log.debug({ error: String(error), userId }, 'Failed to aggregate wellness');
  }

  return wellness;
}

async function aggregateWork(userId: string): Promise<WorkKnowledge> {
  const work: WorkKnowledge = {
    stressors: [],
    interests: [],
    goals: [],
  };

  try {
    const db = await getFirestoreDb();
    if (!db) return work;

    const profileDoc = await db.collection('bogle_users').doc(userId).get();
    if (profileDoc.exists) {
      const data = profileDoc.data();
      work.role = data?.occupation;
      work.company = data?.company;
      work.industry = data?.industry;
    }
  } catch (error) {
    log.debug({ error: String(error), userId }, 'Failed to aggregate work');
  }

  return work;
}

async function aggregateCommunication(userId: string): Promise<CommunicationKnowledge> {
  const communication: CommunicationKnowledge = {};

  try {
    const db = await getFirestoreDb();
    if (!db) return communication;

    // Get social preferences
    const socialDoc = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('lifestyle_preferences')
      .doc('social')
      .get();

    if (socialDoc.exists) {
      const data = socialDoc.data();
      communication.socialStyle = data?.socialStyle as 'introvert' | 'extrovert' | 'ambivert';
      communication.bestTimeToTalk = data?.bestTime as string | undefined;
    }

    // Get linguistic mirroring data
    const mirroringDoc = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('superhuman')
      .doc('linguistic_mirroring')
      .get();

    if (mirroringDoc.exists) {
      const data = mirroringDoc.data();
      communication.linguisticPatterns = (data?.patterns as string[]) || [];
      communication.preferredStyle = data?.preferredStyle as
        | 'direct'
        | 'gentle'
        | 'detailed'
        | 'brief';
    }
  } catch (error) {
    log.debug({ error: String(error), userId }, 'Failed to aggregate communication');
  }

  return communication;
}

async function aggregateEmotional(userId: string): Promise<EmotionalKnowledge> {
  const emotional: EmotionalKnowledge = {
    patterns: [],
    values: [],
  };

  try {
    // Get emotional trajectories (EmotionalArc type imported at top of file)
    const { getActiveArcs } =
      await import('../../services/superhuman/semantic-intelligence/emotional-trajectories.js');
    const arcs = await getActiveArcs(userId);

    if (arcs.length > 0) {
      const latestArc: EmotionalArc = arcs[0];
      // Map trend from EmotionalArc to EmotionalKnowledge (rising/falling → improving/declining)
      const trendMap: Record<string, 'improving' | 'stable' | 'declining'> = {
        rising: 'improving',
        falling: 'declining',
        stable: 'stable',
        volatile: 'stable', // volatile treated as unstable → stable for this context
      };
      emotional.trajectory = {
        trend: trendMap[latestArc.trend] || 'stable',
        confidence: 0.5, // EmotionalArc doesn't have confidence, use default
        period: latestArc.theme || 'general',
      };
    }

    // Get values from values-alignment (UserValue type imported at top of file)
    const { loadUserValues } = await import('../../services/superhuman/values-alignment.js');
    const values = await loadUserValues(userId);

    emotional.values = values.slice(0, 10).map((v: UserValue) => ({
      value: v.category || v.statement || 'unknown',
      strength: v.importance || 0.5,
      detectedFrom: v.contextExamples?.[0],
    }));
  } catch (error) {
    log.debug({ error: String(error), userId }, 'Failed to aggregate emotional');
  }

  return emotional;
}

async function aggregatePatterns(userId: string): Promise<PatternKnowledge> {
  const patterns: PatternKnowledge = {
    behaviors: [],
    temporal: [],
    correlations: [],
  };

  try {
    // Get behavioral patterns from coaching-patterns
    const { getUserPatterns } = await import('../coaching-patterns.js');
    const userPatterns = await getUserPatterns(userId);

    patterns.behaviors = userPatterns.slice(0, 10).map((p) => ({
      pattern: p.pattern,
      category: p.patternType,
      confidence: Math.min(1, p.occurrences / 5),
      surfacedToUser: p.surfacedToUser,
    }));

    // Get temporal patterns
    const db = await getFirestoreDb();
    if (db) {
      const profileDoc = await db.collection('bogle_users').doc(userId).get();
      if (profileDoc.exists) {
        const data = profileDoc.data();
        const temporalData = data?.temporalPatterns;
        if (temporalData) {
          const preferred = temporalData.preferredTimes;
          if (preferred?.mostActive) {
            patterns.temporal.push({
              type: 'preferred_time',
              timeOfDay: preferred.mostActive,
              description: `Most active during ${preferred.mostActive}`,
            });
          }
        }
      }
    }

    // Get cross-domain correlations
    // TODO: cross-domain-correlator.js is planned but not yet implemented
    // Once implemented, uncomment the following:
    // const { getCrossCorrelator } = await import('../patterns/cross-domain-correlator.js');
    // const correlations = getCrossCorrelator().getCorrelations(userId, { minConfidence: 'likely' });
    // patterns.correlations = correlations.slice(0, 5).map((c: { domains: string[], insight: string, confidence: string }) => ({
    //   domains: c.domains,
    //   insight: c.insight,
    //   confidence: c.confidence === 'confirmed' ? 1 : c.confidence === 'likely' ? 0.7 : 0.4,
    // }));
    patterns.correlations = []; // Placeholder until cross-domain-correlator is implemented
  } catch (error) {
    log.debug({ error: String(error), userId }, 'Failed to aggregate patterns');
  }

  return patterns;
}

async function aggregateBoundaries(userId: string): Promise<BoundaryKnowledge> {
  const boundaries: BoundaryKnowledge = {
    avoidTopics: [],
    sensitivities: [],
    ferniCommitments: [],
  };

  try {
    const db = await getFirestoreDb();
    if (!db) return boundaries;

    // Get avoid topics from profile
    const profileDoc = await db.collection('bogle_users').doc(userId).get();
    if (profileDoc.exists) {
      const data = profileDoc.data();
      boundaries.avoidTopics = (data?.avoidTopics as string[]) || [];
    }

    // Get Ferni's commitments (things Ferni promised to avoid or remember)
    const { getPendingCommitments } =
      await import('../../services/superhuman/semantic-intelligence/ferni-commitments.js');
    const commitments = await getPendingCommitments(userId);

    boundaries.ferniCommitments = commitments.map((c) => ({
      description: c.commitment,
      status: c.fulfilled ? ('completed' as const) : ('pending' as const),
      createdAt: c.madeAt ? new Date(c.madeAt) : undefined,
    }));

    // Get sensitivities from protective memory
    const protectiveDoc = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('superhuman')
      .doc('protective_memory')
      .get();

    if (protectiveDoc.exists) {
      const data = protectiveDoc.data();
      const topics = (data?.sensitiveTopics as Array<{ topic: string; severity?: string }>) || [];
      boundaries.sensitivities = topics.map((t) => ({
        topic: t.topic,
        severity: (t.severity as 'low' | 'medium' | 'high') || 'medium',
      }));
    }
  } catch (error) {
    log.debug({ error: String(error), userId }, 'Failed to aggregate boundaries');
  }

  return boundaries;
}

async function aggregateSharedHistory(userId: string): Promise<SharedHistoryKnowledge> {
  const sharedHistory: SharedHistoryKnowledge = {
    insideJokes: [],
    openLoops: [],
    totalConversations: 0,
    milestones: [],
  };

  try {
    // Get inside jokes/shared moments
    const { loadSharedMoments } = await import('../../services/superhuman/inside-joke-memory.js');
    const moments = await loadSharedMoments(userId);

    sharedHistory.insideJokes = moments.map((m) => ({
      reference: m.essence,
      context: m.context || '',
      createdAt: m.createdAt ? new Date(m.createdAt) : undefined,
    }));

    // Get open loops (OpenLoop type imported at top of file)
    const { getAllOpenLoops } =
      await import('../../services/superhuman/semantic-intelligence/open-loops.js');
    const loops = await getAllOpenLoops(userId);

    sharedHistory.openLoops = loops.slice(0, 10).map((l: OpenLoop) => ({
      topic: l.content || l.description || '',
      context: l.context || '',
      mentionedAt: l.created ? new Date(l.created) : new Date(),
      resolved: l.status === 'resolved' || l.resolved === true,
    }));

    // Get total conversations from profile
    const db = await getFirestoreDb();
    if (db) {
      const profileDoc = await db.collection('bogle_users').doc(userId).get();
      if (profileDoc.exists) {
        const data = profileDoc.data();
        sharedHistory.totalConversations = data?.totalConversations || 0;
        if (data?.createdAt) {
          sharedHistory.firstConversation = data.createdAt.toDate?.() || new Date(data.createdAt);
        }
      }
    }
  } catch (error) {
    log.debug({ error: String(error), userId }, 'Failed to aggregate shared history');
  }

  return sharedHistory;
}

// ============================================================================
// METADATA CALCULATION
// ============================================================================

function calculateMetadata(
  _userId: string,
  identity: IdentityKnowledge,
  lifestyle: LifestyleKnowledge,
  relationships: RelationshipKnowledge,
  aspirations: AspirationsKnowledge,
  wellness: WellnessKnowledge,
  work: WorkKnowledge,
  communication: CommunicationKnowledge,
  emotional: EmotionalKnowledge,
  patterns: PatternKnowledge,
  boundaries: BoundaryKnowledge,
  sharedHistory: SharedHistoryKnowledge
): KnowledgeMetadata {
  // Calculate completeness for each section
  const identityScore =
    [identity.name, identity.timezone, identity.occupation].filter(Boolean).length / 3;

  const lifestyleScore =
    [
      lifestyle.entertainment.musicLikes.length > 0,
      lifestyle.food.cuisineLikes.length > 0,
      lifestyle.travel.bucketList.length > 0,
      lifestyle.learning.goals.length > 0,
    ].filter(Boolean).length / 4;

  const relationshipsScore = Math.min(1, relationships.contacts.length / 5);

  const aspirationsScore =
    [aspirations.dreams.length > 0, aspirations.commitments.length > 0].filter(Boolean).length / 2;

  const wellnessScore =
    [
      wellness.health.allergies.length > 0,
      wellness.fitness.exercises.length > 0,
      wellness.mental.practices.length > 0,
    ].filter(Boolean).length / 3;

  const workScore = [work.role, work.company].filter(Boolean).length / 2;

  const communicationScore =
    [communication.preferredStyle, communication.socialStyle].filter(Boolean).length / 2;

  const emotionalScore =
    [emotional.trajectory, emotional.values.length > 0].filter(Boolean).length / 2;

  const patternsScore =
    [patterns.behaviors.length > 0, patterns.correlations.length > 0].filter(Boolean).length / 2;

  const boundariesScore =
    [
      boundaries.avoidTopics.length > 0,
      boundaries.ferniCommitments.length > 0,
      boundaries.sensitivities.length > 0,
    ].filter(Boolean).length / 3;

  const sharedHistoryScore = Math.min(
    1,
    (sharedHistory.insideJokes.length > 0 ? 0.5 : 0) +
      (sharedHistory.totalConversations > 10 ? 0.5 : sharedHistory.totalConversations / 20)
  );

  const overall =
    (identityScore +
      lifestyleScore +
      relationshipsScore +
      aspirationsScore +
      wellnessScore +
      workScore +
      communicationScore +
      emotionalScore +
      patternsScore +
      boundariesScore +
      sharedHistoryScore) /
    11;

  return {
    lastUpdated: new Date(),
    sources: [
      'user_profile',
      'lifestyle_preferences',
      'contacts',
      'dream_keeper',
      'commitment_keeper',
      'ferni_commitments',
      'inside_jokes',
      'open_loops',
      'coaching_patterns',
      'values_alignment',
      'emotional_trajectories',
    ],
    completeness: {
      identity: identityScore,
      lifestyle: lifestyleScore,
      relationships: relationshipsScore,
      aspirations: aspirationsScore,
      wellness: wellnessScore,
      work: workScore,
      communication: communicationScore,
      emotional: emotionalScore,
      patterns: patternsScore,
      boundaries: boundariesScore,
      sharedHistory: sharedHistoryScore,
      overall,
    },
  };
}
