/**
 * Event Story Capture Service
 *
 * "Your friend forgets why your 30th birthday meant so much to you."
 *
 * This service captures the MEANING behind events, not just logistics:
 * - Why this event matters (emotional significance)
 * - The emotional journey (before, during, after)
 * - Unexpected moments (surprises, speeches, connections)
 * - Lessons learned
 * - Connections to life narrative
 *
 * Better Than Human: Perfect memory of what events MEANT, not just what happened.
 *
 * @module services/superhuman/event-story-capture
 */

import { createLogger } from '../../utils/safe-logger.js';
import { getFirestoreDb } from './firestore-utils.js';

const log = createLogger({ module: 'superhuman:event-story-capture' });

// ============================================================================
// TYPES
// ============================================================================

export interface EventStory {
  /** Unique ID */
  id: string;
  /** Event name */
  eventName: string;
  /** Event type */
  eventType: string;
  /** Event date */
  eventDate: string;

  /** The meaning behind this event */
  meaning: {
    /** Why this event mattered */
    whyThisMattered: string;
    /** Life chapter this belongs to */
    lifeChapter?: string;
    /** People this was for/about */
    honorees: string[];
    /** What was being celebrated/marked */
    whatWasCelebrated: string;
  };

  /** The emotional journey */
  emotionalJourney: {
    /** How they felt leading up to the event */
    beforeEvent: string[];
    /** How they felt during */
    duringEvent: string[];
    /** How they felt after */
    afterEvent: string[];
    /** The overall emotional arc */
    overallArc: 'joyful' | 'bittersweet' | 'healing' | 'triumphant' | 'peaceful' | 'transformative' | 'mixed';
  };

  /** Memorable moments */
  moments: {
    /** Unexpected joys */
    unexpectedJoys: string[];
    /** Touching moments */
    touchingMoments: string[];
    /** Funny moments */
    funnyMoments: string[];
    /** Meaningful speeches/toasts */
    meaningfulSpeeches: Array<{
      speaker: string;
      summary: string;
      whyItMattered: string;
    }>;
    /** Connections made */
    connectionsMade: Array<{
      between: string[];
      context: string;
    }>;
  };

  /** Reflections and lessons */
  reflections: {
    /** What worked well */
    whatWorked: string[];
    /** What they'd do differently */
    whatWouldChange: string[];
    /** Lessons learned */
    lessonsLearned: string[];
    /** Gratitude notes */
    gratitudeNotes: Array<{
      to: string;
      note: string;
    }>;
  };

  /** Future connections */
  futureConnections: {
    /** Anniversary reminders */
    anniversaryReminders: Array<{
      date: string;
      reminderNote: string;
    }>;
    /** Traditions started */
    newTraditions: string[];
    /** Follow-up celebrations */
    followUpCelebrations: string[];
  };

  /** Media references (not actual media, just references) */
  mediaReferences: Array<{
    type: 'photo' | 'video' | 'audio' | 'document';
    description: string;
    whereToFind: string;
  }>;

  /** Metadata */
  capturedAt: string;
  lastUpdated: string;
}

export interface StoryCapturePrompts {
  /** Prompts for capturing meaning */
  meaningPrompts: string[];
  /** Prompts for emotional journey */
  emotionalPrompts: string[];
  /** Prompts for memorable moments */
  momentPrompts: string[];
  /** Prompts for reflections */
  reflectionPrompts: string[];
}

export interface EventStoryProfile {
  userId: string;
  stories: EventStory[];
  lastUpdated: string;
}

// ============================================================================
// PROMPTS FOR STORY CAPTURE
// ============================================================================

const DEFAULT_CAPTURE_PROMPTS: StoryCapturePrompts = {
  meaningPrompts: [
    "What made this event special - beyond just the celebration itself?",
    "If you were telling your grandchildren about this day, what would you want them to know?",
    "What was the deeper significance of this moment?",
    "How does this event fit into your larger life story?",
  ],
  emotionalPrompts: [
    "How were you feeling in the days leading up to this?",
    "What was the moment during the event when you felt most alive?",
    "How do you feel now, looking back?",
    "Were there any bittersweet moments?",
  ],
  momentPrompts: [
    "What surprised you during the event?",
    "Was there a moment that made everyone laugh?",
    "Who said something that touched your heart?",
    "Did any unexpected connections happen?",
  ],
  reflectionPrompts: [
    "What would you tell someone planning a similar event?",
    "Is there anything you'd do differently?",
    "Who are you most grateful for?",
    "What tradition might you continue from this?",
  ],
};

// ============================================================================
// STORAGE
// ============================================================================

const COLLECTION = 'event_stories';

async function loadEventStoryProfile(userId: string): Promise<EventStoryProfile | null> {
  const db = getFirestoreDb();
  if (!db) return null;

  try {
    const doc = await db.collection('bogle_users').doc(userId).collection(COLLECTION).doc('profile').get();
    if (doc.exists) {
      return doc.data() as EventStoryProfile;
    }
    return null;
  } catch (error) {
    log.debug({ error, userId }, 'Failed to load event story profile');
    return null;
  }
}

async function saveEventStoryProfile(userId: string, profile: EventStoryProfile): Promise<void> {
  const db = getFirestoreDb();
  if (!db) return;

  try {
    await db
      .collection('bogle_users')
      .doc(userId)
      .collection(COLLECTION)
      .doc('profile')
      .set({
        ...profile,
        lastUpdated: new Date().toISOString(),
      });
    log.debug({ userId }, 'Saved event story profile');
  } catch (error) {
    log.debug({ error, userId }, 'Failed to save event story profile');
  }
}

// ============================================================================
// CORE FUNCTIONS
// ============================================================================

/**
 * Start capturing a story for an event
 */
export async function startStoryCapture(
  userId: string,
  eventName: string,
  eventType: string,
  eventDate: string
): Promise<EventStory> {
  const profile = (await loadEventStoryProfile(userId)) || createDefaultProfile(userId);

  const id = `story_${eventDate}_${Date.now()}`;
  const now = new Date().toISOString();

  const story: EventStory = {
    id,
    eventName,
    eventType,
    eventDate,
    meaning: {
      whyThisMattered: '',
      honorees: [],
      whatWasCelebrated: '',
    },
    emotionalJourney: {
      beforeEvent: [],
      duringEvent: [],
      afterEvent: [],
      overallArc: 'joyful',
    },
    moments: {
      unexpectedJoys: [],
      touchingMoments: [],
      funnyMoments: [],
      meaningfulSpeeches: [],
      connectionsMade: [],
    },
    reflections: {
      whatWorked: [],
      whatWouldChange: [],
      lessonsLearned: [],
      gratitudeNotes: [],
    },
    futureConnections: {
      anniversaryReminders: [],
      newTraditions: [],
      followUpCelebrations: [],
    },
    mediaReferences: [],
    capturedAt: now,
    lastUpdated: now,
  };

  profile.stories.push(story);
  await saveEventStoryProfile(userId, profile);

  log.info({ userId, eventName, eventDate }, 'Started story capture for event');
  return story;
}

/**
 * Update an event story with new content
 */
export async function updateEventStory(
  userId: string,
  storyId: string,
  updates: Partial<Omit<EventStory, 'id' | 'capturedAt'>>
): Promise<EventStory | null> {
  const profile = await loadEventStoryProfile(userId);
  if (!profile) return null;

  const storyIdx = profile.stories.findIndex((s) => s.id === storyId);
  if (storyIdx < 0) return null;

  const story = profile.stories[storyIdx];
  
  // Deep merge updates
  const updated: EventStory = {
    ...story,
    ...updates,
    meaning: { ...story.meaning, ...updates.meaning },
    emotionalJourney: { ...story.emotionalJourney, ...updates.emotionalJourney },
    moments: { ...story.moments, ...updates.moments },
    reflections: { ...story.reflections, ...updates.reflections },
    futureConnections: { ...story.futureConnections, ...updates.futureConnections },
    lastUpdated: new Date().toISOString(),
  };

  profile.stories[storyIdx] = updated;
  await saveEventStoryProfile(userId, profile);

  log.info({ userId, storyId }, 'Updated event story');
  return updated;
}

/**
 * Add a meaningful moment to a story
 */
export async function addMeaningfulMoment(
  userId: string,
  storyId: string,
  momentType: 'unexpectedJoy' | 'touching' | 'funny' | 'speech' | 'connection',
  content: string | { speaker?: string; summary?: string; whyItMattered?: string; between?: string[]; context?: string }
): Promise<void> {
  const profile = await loadEventStoryProfile(userId);
  if (!profile) return;

  const storyIdx = profile.stories.findIndex((s) => s.id === storyId);
  if (storyIdx < 0) return;

  const story = profile.stories[storyIdx];

  switch (momentType) {
    case 'unexpectedJoy':
      if (typeof content === 'string') story.moments.unexpectedJoys.push(content);
      break;
    case 'touching':
      if (typeof content === 'string') story.moments.touchingMoments.push(content);
      break;
    case 'funny':
      if (typeof content === 'string') story.moments.funnyMoments.push(content);
      break;
    case 'speech':
      if (typeof content === 'object' && content.speaker) {
        story.moments.meaningfulSpeeches.push({
          speaker: content.speaker,
          summary: content.summary || '',
          whyItMattered: content.whyItMattered || '',
        });
      }
      break;
    case 'connection':
      if (typeof content === 'object' && content.between) {
        story.moments.connectionsMade.push({
          between: content.between,
          context: content.context || '',
        });
      }
      break;
  }

  story.lastUpdated = new Date().toISOString();
  await saveEventStoryProfile(userId, profile);
  log.info({ userId, storyId, momentType }, 'Added meaningful moment to story');
}

/**
 * Add a gratitude note to a story
 */
export async function addGratitudeNote(
  userId: string,
  storyId: string,
  to: string,
  note: string
): Promise<void> {
  const profile = await loadEventStoryProfile(userId);
  if (!profile) return;

  const storyIdx = profile.stories.findIndex((s) => s.id === storyId);
  if (storyIdx < 0) return;

  profile.stories[storyIdx].reflections.gratitudeNotes.push({ to, note });
  profile.stories[storyIdx].lastUpdated = new Date().toISOString();

  await saveEventStoryProfile(userId, profile);
  log.info({ userId, storyId, to }, 'Added gratitude note to story');
}

/**
 * Get story capture prompts based on timing (pre, during, post event)
 */
export function getStoryCapturePrompts(
  timing: 'pre' | 'during' | 'post',
  eventType?: string
): string[] {
  const base = DEFAULT_CAPTURE_PROMPTS;

  switch (timing) {
    case 'pre':
      return [
        "What are you most looking forward to?",
        "What does this event mean to you?",
        "Who are you most excited to see?",
        "Is there any nervousness mixed in with the excitement?",
      ];
    case 'during':
      return [
        "What's the highlight so far?",
        "Any unexpected moments?",
        "How are you feeling right now?",
        "What will you remember most about today?",
      ];
    case 'post':
      return [
        ...base.meaningPrompts.slice(0, 2),
        ...base.emotionalPrompts.slice(0, 2),
        ...base.momentPrompts.slice(0, 2),
        ...base.reflectionPrompts.slice(0, 2),
      ];
    default:
      return base.meaningPrompts;
  }
}

/**
 * Get an event story by ID
 */
export async function getEventStory(userId: string, storyId: string): Promise<EventStory | null> {
  const profile = await loadEventStoryProfile(userId);
  if (!profile) return null;

  return profile.stories.find((s) => s.id === storyId) || null;
}

/**
 * Find a story by event name (partial match)
 */
export async function findEventStory(userId: string, eventName: string): Promise<EventStory | null> {
  const profile = await loadEventStoryProfile(userId);
  if (!profile) return null;

  return (
    profile.stories.find((s) =>
      s.eventName.toLowerCase().includes(eventName.toLowerCase())
    ) || null
  );
}

/**
 * Get all stories for a user
 */
export async function getAllEventStories(userId: string): Promise<EventStory[]> {
  const profile = await loadEventStoryProfile(userId);
  return profile?.stories || [];
}

/**
 * Recall an event's meaning (for anniversary callbacks)
 */
export async function recallEventMeaning(
  userId: string,
  eventName: string
): Promise<{
  found: boolean;
  summary?: string;
  keyMoments?: string[];
  emotionalArc?: string;
}> {
  const story = await findEventStory(userId, eventName);

  if (!story) {
    return { found: false };
  }

  const keyMoments = [
    ...story.moments.unexpectedJoys.slice(0, 2),
    ...story.moments.touchingMoments.slice(0, 2),
    ...story.moments.meaningfulSpeeches.slice(0, 1).map((s) => `${s.speaker}'s speech`),
  ];

  return {
    found: true,
    summary: story.meaning.whyThisMattered || `Celebrating ${story.meaning.whatWasCelebrated}`,
    keyMoments,
    emotionalArc: story.emotionalJourney.overallArc,
  };
}

/**
 * Build context string for LLM injection
 */
export async function buildEventStoryContext(userId: string, eventName?: string): Promise<string> {
  if (!eventName) return '';

  const recall = await recallEventMeaning(userId, eventName);
  if (!recall.found) return '';

  const lines = ['[EVENT MEMORY - Better Than Human]'];
  lines.push(`I remember "${eventName}":\n`);

  if (recall.summary) {
    lines.push(`📖 ${recall.summary}`);
  }

  if (recall.keyMoments && recall.keyMoments.length > 0) {
    lines.push(`\n✨ Key moments:`);
    for (const moment of recall.keyMoments) {
      lines.push(`  • ${moment}`);
    }
  }

  if (recall.emotionalArc) {
    lines.push(`\n💝 The overall feeling was: ${recall.emotionalArc}`);
  }

  return lines.join('\n');
}

/**
 * Get stories that have anniversaries coming up
 */
export async function getStoriesWithUpcomingAnniversaries(
  userId: string,
  withinDays: number = 30
): Promise<Array<{ story: EventStory; daysUntil: number; anniversaryNumber: number }>> {
  const profile = await loadEventStoryProfile(userId);
  if (!profile) return [];

  const now = new Date();
  const results: Array<{ story: EventStory; daysUntil: number; anniversaryNumber: number }> = [];

  for (const story of profile.stories) {
    const eventDate = new Date(story.eventDate);
    const thisYearAnniversary = new Date(
      now.getFullYear(),
      eventDate.getMonth(),
      eventDate.getDate()
    );

    // If anniversary already passed this year, check next year
    if (thisYearAnniversary < now) {
      thisYearAnniversary.setFullYear(thisYearAnniversary.getFullYear() + 1);
    }

    const daysUntil = Math.ceil(
      (thisYearAnniversary.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (daysUntil <= withinDays) {
      const anniversaryNumber = thisYearAnniversary.getFullYear() - eventDate.getFullYear();
      results.push({ story, daysUntil, anniversaryNumber });
    }
  }

  return results.sort((a, b) => a.daysUntil - b.daysUntil);
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function createDefaultProfile(userId: string): EventStoryProfile {
  return {
    userId,
    stories: [],
    lastUpdated: new Date().toISOString(),
  };
}

// ============================================================================
// SERVICE EXPORT
// ============================================================================

export const eventStoryCapture = {
  startStoryCapture,
  updateEventStory,
  addMeaningfulMoment,
  addGratitudeNote,
  getStoryCapturePrompts,
  getEventStory,
  findEventStory,
  getAllEventStories,
  recallEventMeaning,
  buildEventStoryContext,
  getStoriesWithUpcomingAnniversaries,
  loadEventStoryProfile,
};

export default eventStoryCapture;
