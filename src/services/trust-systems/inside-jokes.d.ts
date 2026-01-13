/**
 * Inside Jokes & Callbacks
 *
 * Shared history that creates intimacy - the running gags,
 * the references only the two of you understand.
 *
 * Philosophy: Inside jokes are trust markers. They say "we have history,
 * we have shared understanding." This system tracks recurring themes,
 * memorable moments, and unique phrases to callback naturally.
 *
 * This system tracks:
 * - Recurring themes unique to each user
 * - Memorable phrases they've used
 * - Running gags that developed organically
 * - Stories they've shared that can be referenced
 * - Opinions or hot takes they've expressed
 *
 * @module InsideJokes
 */
export interface SharedMoment {
    id: string;
    /** Type of shared moment */
    type: 'phrase' | 'story' | 'opinion' | 'running_gag' | 'quirk' | 'preference' | 'callback_moment';
    /** The content of this moment */
    content: string;
    /** Keywords that might trigger a callback */
    triggers: string[];
    /** Context it originated from */
    origin: {
        timestamp: Date;
        topic?: string;
        whatTheySaid: string;
    };
    /** How many times we've called back to this */
    callbackCount: number;
    /** Last time we called back */
    lastCallback?: Date;
    /** Whether callbacks have landed well */
    callbackReception: 'positive' | 'neutral' | 'negative' | 'unknown';
    /** How safe is this to callback to */
    safety: 'always_safe' | 'context_dependent' | 'be_careful';
    /** Optional response we can use */
    suggestedCallbacks?: string[];
}
export interface InsideJokesProfile {
    userId: string;
    /** All shared moments */
    moments: SharedMoment[];
    /** Phrases that have become "theirs" */
    signaturePhrases: string[];
    /** Topics they always have opinions about */
    opinionTopics: string[];
    /** Things they're known for (to us) */
    characterTraits: Array<{
        trait: string;
        examples: string[];
        canTease: boolean;
    }>;
}
export interface CallbackOpportunity {
    moment: SharedMoment;
    relevance: number;
    suggestedCallback: string;
    ssml: string;
}
/**
 * Analyze a user message for callback-worthy moments
 *
 * "Better than Human" - We catch and remember the little things that
 * make someone unique. These become the inside jokes and shared references
 * that make the relationship feel real.
 */
export declare function detectCallbackMoment(userId: string, userMessage: string, context?: {
    topic?: string;
    emotion?: string;
    wasLaughing?: boolean;
    emotionIntensity?: number;
}): SharedMoment | null;
/**
 * Check if current context matches any stored moments
 */
export declare function findCallbackOpportunity(userId: string, currentContext: {
    userMessage: string;
    topic?: string;
    mood?: string;
}): CallbackOpportunity | null;
/**
 * Record that we used a callback and how it was received
 */
export declare function recordCallbackUsed(userId: string, momentId: string, reception: 'positive' | 'neutral' | 'negative'): void;
/**
 * Check if something has become a running gag
 */
export declare function detectRunningGag(userId: string, topic: string): SharedMoment | null;
/**
 * Record a character trait
 */
export declare function recordCharacterTrait(userId: string, trait: string, example: string, canTease?: boolean): void;
/**
 * Get callback-safe character traits
 */
export declare function getCallbackTraits(userId: string): string[];
/**
 * Get all shared moments for a user
 */
export declare function getSharedMoments(userId: string): SharedMoment[];
/**
 * Export profile for persistence
 */
export declare function exportInsideJokesProfile(userId: string): InsideJokesProfile | null;
/**
 * Import profile from persistence
 */
export declare function importInsideJokesProfile(profile: InsideJokesProfile): void;
declare const _default: {
    detectCallbackMoment: typeof detectCallbackMoment;
    findCallbackOpportunity: typeof findCallbackOpportunity;
    recordCallbackUsed: typeof recordCallbackUsed;
    detectRunningGag: typeof detectRunningGag;
    recordCharacterTrait: typeof recordCharacterTrait;
    getCallbackTraits: typeof getCallbackTraits;
    getSharedMoments: typeof getSharedMoments;
    exportInsideJokesProfile: typeof exportInsideJokesProfile;
    importInsideJokesProfile: typeof importInsideJokesProfile;
};
export default _default;
//# sourceMappingURL=inside-jokes.d.ts.map