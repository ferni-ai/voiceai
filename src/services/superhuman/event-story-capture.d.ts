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
declare function loadEventStoryProfile(userId: string): Promise<EventStoryProfile | null>;
/**
 * Start capturing a story for an event
 */
export declare function startStoryCapture(userId: string, eventName: string, eventType: string, eventDate: string): Promise<EventStory>;
/**
 * Update an event story with new content
 */
export declare function updateEventStory(userId: string, storyId: string, updates: Partial<Omit<EventStory, 'id' | 'capturedAt'>>): Promise<EventStory | null>;
/**
 * Add a meaningful moment to a story
 */
export declare function addMeaningfulMoment(userId: string, storyId: string, momentType: 'unexpectedJoy' | 'touching' | 'funny' | 'speech' | 'connection', content: string | {
    speaker?: string;
    summary?: string;
    whyItMattered?: string;
    between?: string[];
    context?: string;
}): Promise<void>;
/**
 * Add a gratitude note to a story
 */
export declare function addGratitudeNote(userId: string, storyId: string, to: string, note: string): Promise<void>;
/**
 * Get story capture prompts based on timing (pre, during, post event)
 */
export declare function getStoryCapturePrompts(timing: 'pre' | 'during' | 'post', eventType?: string): string[];
/**
 * Get an event story by ID
 */
export declare function getEventStory(userId: string, storyId: string): Promise<EventStory | null>;
/**
 * Find a story by event name (partial match)
 */
export declare function findEventStory(userId: string, eventName: string): Promise<EventStory | null>;
/**
 * Get all stories for a user
 */
export declare function getAllEventStories(userId: string): Promise<EventStory[]>;
/**
 * Recall an event's meaning (for anniversary callbacks)
 */
export declare function recallEventMeaning(userId: string, eventName: string): Promise<{
    found: boolean;
    summary?: string;
    keyMoments?: string[];
    emotionalArc?: string;
}>;
/**
 * Build context string for LLM injection
 */
export declare function buildEventStoryContext(userId: string, eventName?: string): Promise<string>;
/**
 * Get stories that have anniversaries coming up
 */
export declare function getStoriesWithUpcomingAnniversaries(userId: string, withinDays?: number): Promise<Array<{
    story: EventStory;
    daysUntil: number;
    anniversaryNumber: number;
}>>;
export declare const eventStoryCapture: {
    startStoryCapture: typeof startStoryCapture;
    updateEventStory: typeof updateEventStory;
    addMeaningfulMoment: typeof addMeaningfulMoment;
    addGratitudeNote: typeof addGratitudeNote;
    getStoryCapturePrompts: typeof getStoryCapturePrompts;
    getEventStory: typeof getEventStory;
    findEventStory: typeof findEventStory;
    getAllEventStories: typeof getAllEventStories;
    recallEventMeaning: typeof recallEventMeaning;
    buildEventStoryContext: typeof buildEventStoryContext;
    getStoriesWithUpcomingAnniversaries: typeof getStoriesWithUpcomingAnniversaries;
    loadEventStoryProfile: typeof loadEventStoryProfile;
};
export default eventStoryCapture;
//# sourceMappingURL=event-story-capture.d.ts.map