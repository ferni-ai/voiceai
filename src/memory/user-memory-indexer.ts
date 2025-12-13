/**
 * User Memory Indexer
 *
 * Vectorizes all user profile data for semantic search.
 * Enables "better than human" recall across all memory domains.
 *
 * @see USER-MEMORY-VECTORIZATION.md for full strategy
 */

import { getLogger } from '../utils/safe-logger.js';
import type {
  UserProfile,
  KeyMoment,
  FamilyMember,
  LifeEvent,
  FinancialGoal,
} from '../types/user-profile.js';
import type {
  HumanMemory,
  ImportantDate,
  InsideJoke,
  RunningTheme,
  CoreValue,
  Dream,
  Fear,
  GrowthMarker,
  ChallengeProgress,
  RecurringAvoidance,
  SeasonalPattern,
  ComfortPattern,
  StressTrigger,
  EmotionalTell,
} from '../types/human-memory.js';
import { getFirestoreVectorStore, type FirestoreVectorStore } from './firestore-vector-store.js';
import { getVectorStore, type VectorStore, type VectorDocument } from './vector-store.js';

const log = getLogger().child({ module: 'UserMemoryIndexer' });

// ============================================================================
// TYPES
// ============================================================================

type AnyVectorStore = VectorStore | FirestoreVectorStore;

/** Categories for user memory documents */
export type UserMemoryCategory =
  // Original domains
  | 'key_moment'
  | 'person'
  | 'thread'
  | 'followup'
  | 'life_event'
  | 'goal'
  | 'persona_learning'
  | 'shared_content'
  | 'emotional_pattern'
  | 'preference'
  | 'entertainment'
  // Human-centric domains
  | 'important_date'
  | 'emotional_signature'
  | 'inside_joke'
  | 'running_theme'
  | 'value'
  | 'dream'
  | 'fear'
  | 'growth_marker'
  | 'challenge'
  | 'avoidance'
  | 'temporal_pattern'
  | 'comfort_pattern'
  | 'stress_trigger'
  | 'emotional_tell';

/** Result of indexing operation */
export interface IndexingResult {
  indexed: number;
  skipped: number;
  errors: number;
  categories: Record<string, number>;
}

// ============================================================================
// DOCUMENT ID GENERATION
// ============================================================================

/**
 * Generate a stable document ID for user memory
 * Format: {category}_{userId}_{uniqueId}
 */
function generateDocId(category: UserMemoryCategory, userId: string, uniqueId: string): string {
  // Sanitize uniqueId to be URL-safe
  const safeId = uniqueId
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .slice(0, 50);
  return `${category}_${userId}_${safeId}`;
}

// ============================================================================
// INDEXING FUNCTIONS BY DOMAIN
// ============================================================================

/**
 * Index key moments (breakthroughs, vulnerabilities, celebrations)
 */
async function indexKeyMoments(
  userId: string,
  moments: KeyMoment[],
  store: AnyVectorStore
): Promise<number> {
  let indexed = 0;

  for (const moment of moments) {
    const text = `${moment.type}: ${moment.summary}. Topics: ${moment.topics.join(', ')}`;
    const doc: VectorDocument = {
      id: generateDocId('key_moment', userId, moment.id),
      text,
      metadata: {
        source: 'user_memory',
        category: 'key_moment',
        momentType: moment.type,
        emotionalWeight: moment.emotionalWeight,
        userId,
        timestamp: moment.timestamp,
        topics: moment.topics,
        followUpNeeded: moment.followUpNeeded,
      },
    };

    try {
      await store.addDocument(doc);
      indexed++;
    } catch (err) {
      log.debug({ error: err, momentId: moment.id }, 'Failed to index key moment');
    }
  }

  return indexed;
}

/**
 * Index family members and people mentioned
 */
async function indexPeople(
  userId: string,
  userName: string | undefined,
  familyMembers: FamilyMember[],
  store: AnyVectorStore
): Promise<number> {
  let indexed = 0;

  for (const member of familyMembers) {
    const personName = member.name || member.relationship;
    const text = `${userName || 'User'}'s ${member.relationship}${member.name ? ` named ${member.name}` : ''}. ${
      member.mentionedTopics?.length ? `Discussed: ${member.mentionedTopics.join(', ')}` : ''
    }`;

    const doc: VectorDocument = {
      id: generateDocId('person', userId, `${member.relationship}_${personName}`),
      text,
      metadata: {
        source: 'user_memory',
        category: 'person',
        personType: 'family',
        relationship: member.relationship,
        personName: member.name || null,
        userId,
        lastMentioned: member.lastMentioned,
        mentionedTopics: member.mentionedTopics,
      },
    };

    try {
      await store.addDocument(doc);
      indexed++;
    } catch (err) {
      log.debug({ error: err, relationship: member.relationship }, 'Failed to index person');
    }
  }

  return indexed;
}

/**
 * Index open threads (cross-session topics to resume)
 */
async function indexOpenThreads(
  userId: string,
  threads: UserProfile['openThreads'],
  store: AnyVectorStore
): Promise<number> {
  if (!threads) return 0;
  let indexed = 0;

  for (const thread of threads) {
    const text = `Open topic: ${thread.topic}. Reason: ${thread.reason}. Resume with: "${thread.suggestedResumption}"`;

    const doc: VectorDocument = {
      id: generateDocId('thread', userId, thread.id),
      text,
      metadata: {
        source: 'user_memory',
        category: 'thread',
        priority: thread.priority,
        status: thread.status,
        userId,
        timestamp: thread.createdAt,
        topic: thread.topic,
      },
    };

    try {
      await store.addDocument(doc);
      indexed++;
    } catch (err) {
      log.debug({ error: err, threadId: thread.id }, 'Failed to index thread');
    }
  }

  return indexed;
}

/**
 * Index pending follow-ups (commitments to user)
 */
async function indexFollowUps(
  userId: string,
  followUps: UserProfile['pendingFollowUps'],
  store: AnyVectorStore
): Promise<number> {
  if (!followUps) return 0;
  let indexed = 0;

  for (const followUp of followUps) {
    const text = `Follow up about: ${followUp.topic}. Reason: ${followUp.reason}`;

    const doc: VectorDocument = {
      id: generateDocId('followup', userId, `${followUp.topic}_${followUp.targetDate}`),
      text,
      metadata: {
        source: 'user_memory',
        category: 'followup',
        userId,
        targetDate: followUp.targetDate,
        topic: followUp.topic,
        reason: followUp.reason,
      },
    };

    try {
      await store.addDocument(doc);
      indexed++;
    } catch (err) {
      log.debug({ error: err, topic: followUp.topic }, 'Failed to index follow-up');
    }
  }

  return indexed;
}

/**
 * Index life events (weddings, babies, career changes, etc.)
 */
async function indexLifeEvents(
  userId: string,
  events: LifeEvent[],
  store: AnyVectorStore
): Promise<number> {
  let indexed = 0;

  for (const event of events) {
    const text = `Life event: ${event.title}${event.description ? `. ${event.description}` : ''}. Type: ${event.type}. Status: ${event.status}`;

    const doc: VectorDocument = {
      id: generateDocId('life_event', userId, event.id),
      text,
      metadata: {
        source: 'user_memory',
        category: 'life_event',
        eventType: event.type,
        emotionalSignificance: event.emotionalSignificance,
        status: event.status,
        userId,
        eventDate: event.date,
        timestamp: event.createdAt,
        teamInvolved: event.teamInvolved,
      },
    };

    try {
      await store.addDocument(doc);
      indexed++;
    } catch (err) {
      log.debug({ error: err, eventId: event.id }, 'Failed to index life event');
    }
  }

  return indexed;
}

/**
 * Index financial goals with notes
 */
async function indexGoals(
  userId: string,
  goals: FinancialGoal[],
  store: AnyVectorStore
): Promise<number> {
  let indexed = 0;

  for (const goal of goals) {
    const text = `Goal: ${goal.name}. Type: ${goal.type}. ${
      goal.targetAmount ? `Target: $${goal.targetAmount}. ` : ''
    }Status: ${goal.status}. Priority: ${goal.priority}. ${
      goal.jackNotes ? `Notes: ${goal.jackNotes}` : ''
    }`;

    const doc: VectorDocument = {
      id: generateDocId('goal', userId, goal.id),
      text,
      metadata: {
        source: 'user_memory',
        category: 'goal',
        goalType: goal.type,
        status: goal.status,
        priority: goal.priority,
        userId,
        targetDate: goal.targetDate,
        targetAmount: goal.targetAmount,
        progressPercent: goal.progressPercent,
        timestamp: goal.createdAt,
      },
    };

    try {
      await store.addDocument(doc);
      indexed++;
    } catch (err) {
      log.debug({ error: err, goalId: goal.id }, 'Failed to index goal');
    }
  }

  return indexed;
}

/**
 * Index per-persona specific memories
 */
async function indexPersonaMemories(
  userId: string,
  personaMemories: UserProfile['personaMemories'],
  store: AnyVectorStore
): Promise<number> {
  if (!personaMemories) return 0;
  let indexed = 0;

  // Index each persona's memories
  const personas = Object.entries(personaMemories) as Array<
    [
      string,
      Array<{
        id: string;
        type: string;
        name: string;
        details?: string;
        tags: string[];
        createdAt: Date;
      }>,
    ]
  >;

  for (const [personaId, memories] of personas) {
    if (!memories) continue;

    for (const memory of memories) {
      const text = `${personaId} learned: ${memory.type} - ${memory.name}${memory.details ? `. ${memory.details}` : ''}. Tags: ${memory.tags.join(', ')}`;

      const doc: VectorDocument = {
        id: generateDocId('persona_learning', userId, `${personaId}_${memory.id}`),
        text,
        metadata: {
          source: 'user_memory',
          category: 'persona_learning',
          personaId,
          memoryType: memory.type,
          userId,
          timestamp: memory.createdAt,
          tags: memory.tags,
        },
      };

      try {
        await store.addDocument(doc);
        indexed++;
      } catch (err) {
        log.debug({ error: err, memoryId: memory.id }, 'Failed to index persona memory');
      }
    }
  }

  return indexed;
}

/**
 * Index shared stories and content
 */
async function indexSharedContent(
  userId: string,
  sharedStories: UserProfile['sharedStories'],
  humanizingState: UserProfile['humanizingState'],
  store: AnyVectorStore
): Promise<number> {
  let indexed = 0;

  // Index shared stories
  if (sharedStories) {
    for (const story of sharedStories) {
      const text = `Story shared: ${story.theme}. Context: ${story.context}${
        story.userReaction ? `. User reaction: ${story.userReaction}` : ''
      }`;

      const doc: VectorDocument = {
        id: generateDocId('shared_content', userId, `story_${story.storyId}`),
        text,
        metadata: {
          source: 'user_memory',
          category: 'shared_content',
          contentType: 'story',
          storyId: story.storyId,
          userReaction: story.userReaction,
          userId,
          timestamp: story.sharedAt,
        },
      };

      try {
        await store.addDocument(doc);
        indexed++;
      } catch (err) {
        log.debug({ error: err, storyId: story.storyId }, 'Failed to index shared story');
      }
    }
  }

  // Index inner world revelations from humanizing state
  if (humanizingState?.innerWorldRevealed) {
    for (const revelation of humanizingState.innerWorldRevealed) {
      const text = `Shared ${revelation.type}: ${revelation.content}`;

      const doc: VectorDocument = {
        id: generateDocId('shared_content', userId, `inner_${revelation.sharedAt.getTime()}`),
        text,
        metadata: {
          source: 'user_memory',
          category: 'shared_content',
          contentType: revelation.type,
          userId,
          timestamp: revelation.sharedAt,
        },
      };

      try {
        await store.addDocument(doc);
        indexed++;
      } catch (err) {
        log.debug({ error: err }, 'Failed to index inner world revelation');
      }
    }
  }

  return indexed;
}

/**
 * Index user preferences and communication style
 */
async function indexPreferences(
  userId: string,
  profile: UserProfile,
  store: AnyVectorStore
): Promise<number> {
  let indexed = 0;

  // Communication preferences
  const commText = `Communication style: ${profile.communicationStyle}. Speaking pace: ${profile.speakingPace}. Humor appreciation: ${profile.humorAppreciation}. ${
    profile.preferredTopics.length
      ? `Likes discussing: ${profile.preferredTopics.join(', ')}. `
      : ''
  }${profile.avoidTopics.length ? `Avoids: ${profile.avoidTopics.join(', ')}` : ''}`;

  const commDoc: VectorDocument = {
    id: generateDocId('preference', userId, 'communication_style'),
    text: commText,
    metadata: {
      source: 'user_memory',
      category: 'preference',
      preferenceType: 'communication',
      userId,
      updatedAt: profile.updatedAt,
    },
  };

  try {
    await store.addDocument(commDoc);
    indexed++;
  } catch (err) {
    log.debug({ error: err }, 'Failed to index communication preferences');
  }

  // Verbosity and other preferences
  if (profile.preferences) {
    const prefText = `Prefers ${profile.preferences.verbosity} responses. ${
      profile.preferences.topicsToAvoid.length
        ? `Topics to avoid: ${profile.preferences.topicsToAvoid.join(', ')}. `
        : ''
    }${profile.preferences.wantsProactiveAdvice ? 'Open to proactive advice.' : 'Prefers to lead conversations.'}`;

    const prefDoc: VectorDocument = {
      id: generateDocId('preference', userId, 'response_style'),
      text: prefText,
      metadata: {
        source: 'user_memory',
        category: 'preference',
        preferenceType: 'style',
        userId,
        updatedAt: profile.updatedAt,
      },
    };

    try {
      await store.addDocument(prefDoc);
      indexed++;
    } catch (err) {
      log.debug({ error: err }, 'Failed to index response preferences');
    }
  }

  return indexed;
}

/**
 * Index music and entertainment memories
 */
async function indexEntertainment(
  userId: string,
  musicMemory: UserProfile['musicMemory'],
  gameMemory: UserProfile['gameMemory'],
  store: AnyVectorStore
): Promise<number> {
  let indexed = 0;

  // Music favorites
  if (musicMemory) {
    if (musicMemory.favoriteArtists.length > 0) {
      const text = `Favorite artists: ${musicMemory.favoriteArtists.join(', ')}. ${
        musicMemory.favoriteGenres.length
          ? `Genres: ${musicMemory.favoriteGenres.join(', ')}. `
          : ''
      }${musicMemory.dislikedArtists.length ? `Dislikes: ${musicMemory.dislikedArtists.join(', ')}` : ''}`;

      const doc: VectorDocument = {
        id: generateDocId('entertainment', userId, 'music_preferences'),
        text,
        metadata: {
          source: 'user_memory',
          category: 'entertainment',
          entertainmentType: 'music',
          subType: 'preferences',
          userId,
          updatedAt: musicMemory.updatedAt,
        },
      };

      try {
        await store.addDocument(doc);
        indexed++;
      } catch (err) {
        log.debug({ error: err }, 'Failed to index music preferences');
      }
    }

    // Shared music moments
    if (musicMemory.sharedMoments) {
      for (const moment of musicMemory.sharedMoments) {
        const text = `Shared music moment: ${moment.description}. Artist: ${moment.artist}`;

        const doc: VectorDocument = {
          id: generateDocId('entertainment', userId, `music_moment_${moment.timestamp}`),
          text,
          metadata: {
            source: 'user_memory',
            category: 'entertainment',
            entertainmentType: 'music',
            subType: 'shared_moment',
            artist: moment.artist,
            userId,
            timestamp: new Date(moment.timestamp),
          },
        };

        try {
          await store.addDocument(doc);
          indexed++;
        } catch (err) {
          log.debug({ error: err }, 'Failed to index music moment');
        }
      }
    }
  }

  // Game milestones
  if (gameMemory?.milestones) {
    for (const milestone of gameMemory.milestones) {
      const text = `Game milestone: ${milestone.type} in ${milestone.gameType}${
        milestone.context ? `. ${milestone.context}` : ''
      }`;

      const doc: VectorDocument = {
        id: generateDocId(
          'entertainment',
          userId,
          `game_milestone_${milestone.achievedAt.getTime()}`
        ),
        text,
        metadata: {
          source: 'user_memory',
          category: 'entertainment',
          entertainmentType: 'game',
          subType: 'milestone',
          milestoneType: milestone.type,
          gameType: milestone.gameType,
          userId,
          timestamp: milestone.achievedAt,
        },
      };

      try {
        await store.addDocument(doc);
        indexed++;
      } catch (err) {
        log.debug({ error: err }, 'Failed to index game milestone');
      }
    }
  }

  return indexed;
}

// ============================================================================
// HUMAN-CENTRIC MEMORY INDEXING
// ============================================================================

/**
 * Index important dates (birthdays, anniversaries, etc.)
 */
async function indexImportantDates(
  userId: string,
  dates: ImportantDate[],
  store: AnyVectorStore
): Promise<number> {
  let indexed = 0;

  for (const date of dates) {
    const text = `Important date: ${date.label}. Type: ${date.type}. ${
      date.relatedPerson ? `Related to ${date.relatedPerson}. ` : ''
    }Occurs ${date.month}/${date.day}${date.year ? `/${date.year}` : ' annually'}. ${
      date.notes || ''
    }`;

    const doc: VectorDocument = {
      id: generateDocId('important_date', userId, date.id),
      text,
      metadata: {
        source: 'user_memory',
        category: 'important_date',
        dateType: date.type,
        month: date.month,
        day: date.day,
        year: date.year,
        relatedPerson: date.relatedPerson,
        significance: date.significance,
        sentiment: date.sentiment,
        wantsAcknowledgment: date.wantsAcknowledgment,
        userId,
        timestamp: date.discoveredAt,
      },
    };

    try {
      await store.addDocument(doc);
      indexed++;
    } catch (err) {
      log.debug({ error: err, dateId: date.id }, 'Failed to index important date');
    }
  }

  return indexed;
}

/**
 * Index inside jokes for relationship texture
 */
async function indexInsideJokes(
  userId: string,
  jokes: InsideJoke[],
  store: AnyVectorStore
): Promise<number> {
  let indexed = 0;

  for (const joke of jokes) {
    const text = `Inside joke: "${joke.reference}". Origin: ${joke.origin}. Status: ${joke.status}`;

    const doc: VectorDocument = {
      id: generateDocId('inside_joke', userId, joke.id),
      text,
      metadata: {
        source: 'user_memory',
        category: 'inside_joke',
        status: joke.status,
        usageCount: joke.usageCount,
        userId,
        timestamp: joke.originatedAt,
      },
    };

    try {
      await store.addDocument(doc);
      indexed++;
    } catch (err) {
      log.debug({ error: err, jokeId: joke.id }, 'Failed to index inside joke');
    }
  }

  return indexed;
}

/**
 * Index running themes in conversations
 */
async function indexRunningThemes(
  userId: string,
  themes: RunningTheme[],
  store: AnyVectorStore
): Promise<number> {
  let indexed = 0;

  for (const theme of themes) {
    const keyMomentsSummary = theme.keyMoments
      .slice(-3)
      .map((m) => m.summary)
      .join('; ');
    const text = `Running theme: ${theme.theme}. Comes up ${theme.frequency}. Sentiment: ${theme.sentiment}. ${
      keyMomentsSummary ? `Key moments: ${keyMomentsSummary}` : ''
    }`;

    const doc: VectorDocument = {
      id: generateDocId('running_theme', userId, theme.id),
      text,
      metadata: {
        source: 'user_memory',
        category: 'running_theme',
        frequency: theme.frequency,
        sentiment: theme.sentiment,
        userId,
        startedAt: theme.startedAt,
        timestamp: theme.lastMentioned,
      },
    };

    try {
      await store.addDocument(doc);
      indexed++;
    } catch (err) {
      log.debug({ error: err, themeId: theme.id }, 'Failed to index running theme');
    }
  }

  return indexed;
}

/**
 * Index core values
 */
async function indexValues(
  userId: string,
  values: CoreValue[],
  store: AnyVectorStore
): Promise<number> {
  let indexed = 0;

  for (const value of values) {
    const text = `Core value: ${value.value}. Strength: ${value.strength}. Evidence: ${value.evidence.join('; ')}`;

    const doc: VectorDocument = {
      id: generateDocId('value', userId, value.id),
      text,
      metadata: {
        source: 'user_memory',
        category: 'value',
        strength: value.strength,
        userId,
        timestamp: value.discoveredAt,
      },
    };

    try {
      await store.addDocument(doc);
      indexed++;
    } catch (err) {
      log.debug({ error: err, valueId: value.id }, 'Failed to index value');
    }
  }

  return indexed;
}

/**
 * Index dreams and aspirations
 */
async function indexDreams(
  userId: string,
  dreams: Dream[],
  store: AnyVectorStore
): Promise<number> {
  let indexed = 0;

  for (const dream of dreams) {
    const text = `Dream: ${dream.description}. Category: ${dream.category}. Sentiment: ${dream.sentiment}. Status: ${dream.status}`;

    const doc: VectorDocument = {
      id: generateDocId('dream', userId, dream.id),
      text,
      metadata: {
        source: 'user_memory',
        category: 'dream',
        dreamCategory: dream.category,
        sentiment: dream.sentiment,
        status: dream.status,
        userId,
        timestamp: dream.firstMentioned,
      },
    };

    try {
      await store.addDocument(doc);
      indexed++;
    } catch (err) {
      log.debug({ error: err, dreamId: dream.id }, 'Failed to index dream');
    }
  }

  return indexed;
}

/**
 * Index fears and worries
 */
async function indexFears(userId: string, fears: Fear[], store: AnyVectorStore): Promise<number> {
  let indexed = 0;

  for (const fear of fears) {
    const text = `Fear/Worry: ${fear.fear}. Frequency: ${fear.frequency}. ${
      fear.copingMechanisms?.length ? `Coping: ${fear.copingMechanisms.join(', ')}` : ''
    }`;

    const doc: VectorDocument = {
      id: generateDocId('fear', userId, fear.id),
      text,
      metadata: {
        source: 'user_memory',
        category: 'fear',
        frequency: fear.frequency,
        sensitivity: fear.sensitivity,
        userId,
        timestamp: fear.discoveredAt,
      },
    };

    try {
      await store.addDocument(doc);
      indexed++;
    } catch (err) {
      log.debug({ error: err, fearId: fear.id }, 'Failed to index fear');
    }
  }

  return indexed;
}

/**
 * Index growth markers ("look how far you've come")
 */
async function indexGrowthMarkers(
  userId: string,
  markers: GrowthMarker[],
  store: AnyVectorStore
): Promise<number> {
  let indexed = 0;

  for (const marker of markers) {
    const text = `Growth: ${marker.description}. Before: ${marker.before}. After: ${marker.after}. ${
      marker.acknowledged
        ? `Acknowledged (reaction: ${marker.reactionWhenAcknowledged})`
        : 'Not yet acknowledged'
    }`;

    const doc: VectorDocument = {
      id: generateDocId('growth_marker', userId, marker.id),
      text,
      metadata: {
        source: 'user_memory',
        category: 'growth_marker',
        acknowledged: marker.acknowledged,
        reactionWhenAcknowledged: marker.reactionWhenAcknowledged,
        userId,
        timestamp: marker.observedAt,
      },
    };

    try {
      await store.addDocument(doc);
      indexed++;
    } catch (err) {
      log.debug({ error: err, markerId: marker.id }, 'Failed to index growth marker');
    }
  }

  return indexed;
}

/**
 * Index challenges they're working through
 */
async function indexChallenges(
  userId: string,
  challenges: ChallengeProgress[],
  store: AnyVectorStore
): Promise<number> {
  let indexed = 0;

  for (const challenge of challenges) {
    const milestonesSummary = challenge.milestones
      .slice(-3)
      .map((m) => m.description)
      .join('; ');
    const text = `Challenge: ${challenge.challenge}. Status: ${challenge.status}. ${
      milestonesSummary ? `Progress: ${milestonesSummary}` : ''
    }`;

    const doc: VectorDocument = {
      id: generateDocId('challenge', userId, challenge.id),
      text,
      metadata: {
        source: 'user_memory',
        category: 'challenge',
        status: challenge.status,
        userId,
        startedAt: challenge.startedAt,
        timestamp: challenge.lastUpdate,
      },
    };

    try {
      await store.addDocument(doc);
      indexed++;
    } catch (err) {
      log.debug({ error: err, challengeId: challenge.id }, 'Failed to index challenge');
    }
  }

  return indexed;
}

/**
 * Index recurring avoidances (what they don't want to talk about)
 */
async function indexAvoidances(
  userId: string,
  avoidances: RecurringAvoidance[],
  store: AnyVectorStore
): Promise<number> {
  let indexed = 0;

  for (const avoidance of avoidances) {
    const text = `Avoids topic: ${avoidance.topic}. Style: ${avoidance.avoidanceStyle}. Observed ${avoidance.observations} times. ${
      avoidance.possibleReason ? `Possible reason: ${avoidance.possibleReason}` : ''
    }. Approach: ${avoidance.approach}`;

    const doc: VectorDocument = {
      id: generateDocId('avoidance', userId, avoidance.id),
      text,
      metadata: {
        source: 'user_memory',
        category: 'avoidance',
        avoidanceStyle: avoidance.avoidanceStyle,
        observations: avoidance.observations,
        approach: avoidance.approach,
        userId,
        timestamp: avoidance.firstNoticed,
      },
    };

    try {
      await store.addDocument(doc);
      indexed++;
    } catch (err) {
      log.debug({ error: err, avoidanceId: avoidance.id }, 'Failed to index avoidance');
    }
  }

  return indexed;
}

/**
 * Index seasonal/temporal patterns
 */
async function indexTemporalPatterns(
  userId: string,
  patterns: SeasonalPattern[],
  store: AnyVectorStore
): Promise<number> {
  let indexed = 0;

  for (const pattern of patterns) {
    const text = `Seasonal pattern: ${pattern.pattern}. Timing: ${pattern.timing}${
      pattern.customTiming ? ` (${pattern.customTiming})` : ''
    }. Emotional tone: ${pattern.emotionalTone}. ${pattern.approach ? `Approach: ${pattern.approach}` : ''}`;

    const doc: VectorDocument = {
      id: generateDocId('temporal_pattern', userId, pattern.id),
      text,
      metadata: {
        source: 'user_memory',
        category: 'temporal_pattern',
        timing: pattern.timing,
        emotionalTone: pattern.emotionalTone,
        confidence: pattern.confidence,
        yearsObserved: pattern.yearsObserved,
        userId,
      },
    };

    try {
      await store.addDocument(doc);
      indexed++;
    } catch (err) {
      log.debug({ error: err, patternId: pattern.id }, 'Failed to index temporal pattern');
    }
  }

  return indexed;
}

/**
 * Index comfort patterns (what helps when they're struggling)
 */
async function indexComfortPatterns(
  userId: string,
  patterns: ComfortPattern[],
  store: AnyVectorStore
): Promise<number> {
  let indexed = 0;

  for (const pattern of patterns) {
    const text = `Comfort: ${pattern.type} works for ${pattern.effectiveFor}. Evidence: ${pattern.evidence}`;

    const doc: VectorDocument = {
      id: generateDocId('comfort_pattern', userId, pattern.id),
      text,
      metadata: {
        source: 'user_memory',
        category: 'comfort_pattern',
        comfortType: pattern.type,
        effectiveFor: pattern.effectiveFor,
        userId,
        timestamp: pattern.discoveredAt,
      },
    };

    try {
      await store.addDocument(doc);
      indexed++;
    } catch (err) {
      log.debug({ error: err, patternId: pattern.id }, 'Failed to index comfort pattern');
    }
  }

  return indexed;
}

/**
 * Index stress triggers
 */
async function indexStressTriggers(
  userId: string,
  triggers: StressTrigger[],
  store: AnyVectorStore
): Promise<number> {
  let indexed = 0;

  for (const trigger of triggers) {
    const text = `Stress trigger: ${trigger.trigger}. Category: ${trigger.category}. Intensity: ${trigger.intensity}. ${
      trigger.helpfulResponses?.length ? `Helpful: ${trigger.helpfulResponses.join(', ')}` : ''
    }`;

    const doc: VectorDocument = {
      id: generateDocId('stress_trigger', userId, trigger.id),
      text,
      metadata: {
        source: 'user_memory',
        category: 'stress_trigger',
        triggerCategory: trigger.category,
        intensity: trigger.intensity,
        userId,
        timestamp: trigger.discoveredAt,
      },
    };

    try {
      await store.addDocument(doc);
      indexed++;
    } catch (err) {
      log.debug({ error: err, triggerId: trigger.id }, 'Failed to index stress trigger');
    }
  }

  return indexed;
}

/**
 * Index emotional tells
 */
async function indexEmotionalTells(
  userId: string,
  tells: EmotionalTell[],
  store: AnyVectorStore
): Promise<number> {
  let indexed = 0;

  for (const tell of tells) {
    const text = `Emotional tell: When they "${tell.signal}", it usually means ${tell.interpretation}. Observed ${tell.observations} times. Confidence: ${Math.round(tell.confidence * 100)}%`;

    const doc: VectorDocument = {
      id: generateDocId('emotional_tell', userId, tell.id),
      text,
      metadata: {
        source: 'user_memory',
        category: 'emotional_tell',
        signal: tell.signal,
        interpretation: tell.interpretation,
        confidence: tell.confidence,
        observations: tell.observations,
        userId,
        timestamp: tell.discoveredAt,
      },
    };

    try {
      await store.addDocument(doc);
      indexed++;
    } catch (err) {
      log.debug({ error: err, tellId: tell.id }, 'Failed to index emotional tell');
    }
  }

  return indexed;
}

/**
 * Index complete human memory profile
 */
async function indexHumanMemory(
  userId: string,
  humanMemory: Partial<HumanMemory>,
  store: AnyVectorStore
): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};

  // Important dates
  if (humanMemory.importantDates?.length) {
    counts['important_date'] = await indexImportantDates(userId, humanMemory.importantDates, store);
  }

  // Inside jokes
  if (humanMemory.insideJokes?.length) {
    counts['inside_joke'] = await indexInsideJokes(userId, humanMemory.insideJokes, store);
  }

  // Running themes
  if (humanMemory.runningThemes?.length) {
    counts['running_theme'] = await indexRunningThemes(userId, humanMemory.runningThemes, store);
  }

  // Emotional signature components
  if (humanMemory.emotionalSignature) {
    const sig = humanMemory.emotionalSignature;

    if (sig.comfortPatterns?.length) {
      counts['comfort_pattern'] = await indexComfortPatterns(userId, sig.comfortPatterns, store);
    }

    if (sig.stressTriggers?.length) {
      counts['stress_trigger'] = await indexStressTriggers(userId, sig.stressTriggers, store);
    }

    if (sig.tells?.length) {
      counts['emotional_tell'] = await indexEmotionalTells(userId, sig.tells, store);
    }
  }

  // Identity components
  if (humanMemory.identity) {
    const { identity } = humanMemory;

    if (identity.values?.length) {
      counts['value'] = await indexValues(userId, identity.values, store);
    }

    if (identity.dreams?.length) {
      counts['dream'] = await indexDreams(userId, identity.dreams, store);
    }

    if (identity.fears?.length) {
      counts['fear'] = await indexFears(userId, identity.fears, store);
    }
  }

  // Growth arc
  if (humanMemory.growthArc) {
    if (humanMemory.growthArc.markers?.length) {
      counts['growth_marker'] = await indexGrowthMarkers(
        userId,
        humanMemory.growthArc.markers,
        store
      );
    }

    if (humanMemory.growthArc.challenges?.length) {
      counts['challenge'] = await indexChallenges(userId, humanMemory.growthArc.challenges, store);
    }
  }

  // Unspoken patterns
  if (humanMemory.unspoken?.avoidances?.length) {
    counts['avoidance'] = await indexAvoidances(userId, humanMemory.unspoken.avoidances, store);
  }

  // Temporal patterns
  if (humanMemory.temporal?.seasonal?.length) {
    counts['temporal_pattern'] = await indexTemporalPatterns(
      userId,
      humanMemory.temporal.seasonal,
      store
    );
  }

  return counts;
}

// ============================================================================
// MAIN INDEXING FUNCTION
// ============================================================================

/**
 * Index all user memory data into the vector store
 *
 * Call this:
 * - After conversation ends (incremental)
 * - When profile is loaded (full)
 * - On user migration (full)
 *
 * @param userId - User ID
 * @param profile - User profile data
 * @param options - Indexing options
 */
export async function indexUserMemories(
  userId: string,
  profile: UserProfile,
  options?: {
    /** Only index specific categories */
    categories?: UserMemoryCategory[];
    /** Vector store to use (defaults to active store) */
    vectorStore?: AnyVectorStore;
    /** Skip if already indexed recently */
    skipIfRecent?: boolean;
  }
): Promise<IndexingResult> {
  const store = options?.vectorStore || getActiveVectorStore();
  const categories = options?.categories;

  const result: IndexingResult = {
    indexed: 0,
    skipped: 0,
    errors: 0,
    categories: {},
  };

  const shouldIndex = (cat: UserMemoryCategory) => !categories || categories.includes(cat);

  try {
    // Key Moments (P0)
    if (shouldIndex('key_moment') && profile.keyMoments?.length) {
      const count = await indexKeyMoments(userId, profile.keyMoments, store);
      result.indexed += count;
      result.categories['key_moment'] = count;
    }

    // People (P0)
    if (shouldIndex('person') && profile.familyMembers?.length) {
      const count = await indexPeople(userId, profile.name, profile.familyMembers, store);
      result.indexed += count;
      result.categories['person'] = count;
    }

    // Open Threads (P0)
    if (shouldIndex('thread')) {
      const count = await indexOpenThreads(userId, profile.openThreads, store);
      result.indexed += count;
      result.categories['thread'] = count;
    }

    // Follow-ups (P0)
    if (shouldIndex('followup')) {
      const count = await indexFollowUps(userId, profile.pendingFollowUps, store);
      result.indexed += count;
      result.categories['followup'] = count;
    }

    // Life Events (P1)
    if (shouldIndex('life_event') && profile.lifeEvents?.length) {
      const count = await indexLifeEvents(userId, profile.lifeEvents, store);
      result.indexed += count;
      result.categories['life_event'] = count;
    }

    // Goals (P1)
    if (shouldIndex('goal') && profile.goals?.length) {
      const count = await indexGoals(userId, profile.goals, store);
      result.indexed += count;
      result.categories['goal'] = count;
    }

    // Per-Persona Memories (P1)
    if (shouldIndex('persona_learning')) {
      const count = await indexPersonaMemories(userId, profile.personaMemories, store);
      result.indexed += count;
      result.categories['persona_learning'] = count;
    }

    // Shared Content (P2)
    if (shouldIndex('shared_content')) {
      const count = await indexSharedContent(
        userId,
        profile.sharedStories,
        profile.humanizingState,
        store
      );
      result.indexed += count;
      result.categories['shared_content'] = count;
    }

    // Preferences (P2)
    if (shouldIndex('preference')) {
      const count = await indexPreferences(userId, profile, store);
      result.indexed += count;
      result.categories['preference'] = count;
    }

    // Entertainment (P3)
    if (shouldIndex('entertainment')) {
      const count = await indexEntertainment(
        userId,
        profile.musicMemory,
        profile.gameMemory,
        store
      );
      result.indexed += count;
      result.categories['entertainment'] = count;
    }

    // ========================================================================
    // HUMAN-CENTRIC MEMORY (The texture of relationship)
    // ========================================================================

    // Index all human memory domains if available
    if (profile.humanMemory) {
      const humanMemoryCounts = await indexHumanMemory(userId, profile.humanMemory, store);

      // Merge counts into result
      for (const [cat, count] of Object.entries(humanMemoryCounts)) {
        result.indexed += count;
        result.categories[cat] = count;
      }
    }

    log.info({ userId, ...result }, `Indexed ${result.indexed} user memory documents`);
  } catch (error) {
    log.error({ error, userId }, 'User memory indexing failed');
    result.errors++;
  }

  return result;
}

/**
 * Remove all indexed memories for a user (for deletion/GDPR)
 */
export async function removeUserMemories(
  userId: string,
  vectorStore?: AnyVectorStore
): Promise<number> {
  const store = vectorStore || getActiveVectorStore();
  let removed = 0;

  // Categories to clean up
  const categories: UserMemoryCategory[] = [
    'key_moment',
    'person',
    'thread',
    'followup',
    'life_event',
    'goal',
    'persona_learning',
    'shared_content',
    'emotional_pattern',
    'preference',
    'entertainment',
  ];

  // Find all documents for this user by searching with a broad query
  try {
    const results = await store.search('*', {
      topK: 1000, // Get all user documents
      filter: {
        source: 'user_memory',
        userId,
      },
      minScore: 0,
    });

    // Remove each document
    for (const result of results) {
      try {
        await store.removeDocument(result.document.id);
        removed++;
      } catch (err) {
        log.debug({ error: err, docId: result.document.id }, 'Failed to remove document');
      }
    }
  } catch (err) {
    log.debug({ error: err, userId }, 'Failed to search for user memory documents');
  }

  log.info({ userId, removed }, 'Removed user memory documents');
  return removed;
}

/**
 * Batch index all users' memories (for migrations)
 *
 * @param store - Memory store to read profiles from
 * @param options - Batch options
 */
export async function batchIndexUserMemories(
  store: { listProfiles: (opts: { limit: number; cursor?: string }) => Promise<UserProfile[]> },
  options?: {
    /** Max users to process */
    limit?: number;
    /** Starting cursor */
    cursor?: string;
    /** Categories to index */
    categories?: UserMemoryCategory[];
    /** Callback on progress */
    onProgress?: (processed: number, total: number) => void;
  }
): Promise<{
  totalUsers: number;
  totalDocuments: number;
  errors: number;
  categoryCounts: Record<string, number>;
}> {
  const maxUsers = options?.limit || 500;
  const categories = options?.categories;

  const result = {
    totalUsers: 0,
    totalDocuments: 0,
    errors: 0,
    categoryCounts: {} as Record<string, number>,
  };

  try {
    const profiles = await store.listProfiles({ limit: maxUsers, cursor: options?.cursor });

    for (const profile of profiles) {
      try {
        const indexResult = await indexUserMemories(profile.id, profile, { categories });
        result.totalUsers++;
        result.totalDocuments += indexResult.indexed;
        result.errors += indexResult.errors;

        // Aggregate category counts
        for (const [cat, count] of Object.entries(indexResult.categories)) {
          result.categoryCounts[cat] = (result.categoryCounts[cat] || 0) + count;
        }

        options?.onProgress?.(result.totalUsers, profiles.length);
      } catch (err) {
        log.warn({ error: err, userId: profile.id }, 'Failed to index user memories');
        result.errors++;
      }
    }

    log.info(
      {
        totalUsers: result.totalUsers,
        totalDocuments: result.totalDocuments,
        errors: result.errors,
      },
      'Batch user memory indexing complete'
    );
  } catch (error) {
    log.error({ error }, 'Batch indexing failed');
    result.errors++;
  }

  return result;
}

/**
 * Get indexing statistics for a user
 */
export async function getUserMemoryStats(
  userId: string,
  vectorStore?: AnyVectorStore
): Promise<{
  totalDocuments: number;
  byCategory: Record<string, number>;
  lastIndexed?: Date;
}> {
  const store = vectorStore || getActiveVectorStore();

  const stats = {
    totalDocuments: 0,
    byCategory: {} as Record<string, number>,
    lastIndexed: undefined as Date | undefined,
  };

  // Search for all user memory documents
  try {
    const results = await store.search('*', {
      topK: 1000,
      filter: {
        source: 'user_memory',
        userId,
      },
      minScore: 0, // Include all
    });

    stats.totalDocuments = results.length;

    // Count by category
    for (const result of results) {
      const category = (result.document.metadata.category as string) || 'unknown';
      stats.byCategory[category] = (stats.byCategory[category] || 0) + 1;

      // Track most recent
      const timestamp = result.document.metadata.timestamp as Date | undefined;
      if (timestamp && (!stats.lastIndexed || timestamp > stats.lastIndexed)) {
        stats.lastIndexed = timestamp;
      }
    }
  } catch (err) {
    log.debug({ error: err, userId }, 'Failed to get user memory stats');
  }

  return stats;
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Get the active vector store (with fallback)
 */
function getActiveVectorStore(): AnyVectorStore {
  // Try Firestore first in production
  if (process.env.NODE_ENV === 'production' || process.env.GOOGLE_CLOUD_PROJECT) {
    return getFirestoreVectorStore();
  }
  return getVectorStore();
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  indexUserMemories,
  removeUserMemories,
  batchIndexUserMemories,
  getUserMemoryStats,
};
