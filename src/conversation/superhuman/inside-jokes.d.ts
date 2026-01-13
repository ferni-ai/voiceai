/**
 * Inside Jokes System
 *
 * "Remember when you called it the 'productivity monster'?" - Shared humor.
 *
 * Real relationships have inside jokes - funny moments that become shorthand.
 * This system captures those moments and references them at the right time.
 *
 * @module conversation/superhuman/inside-jokes
 */
export interface InsideJoke {
    id: string;
    userId: string;
    originalContext: string;
    funnyPart: string;
    shorthand?: string;
    createdAt: Date;
    timesReferenced: number;
    lastReferenced?: Date;
    relatedTopics: string[];
    mood: 'light' | 'supportive' | 'celebratory';
}
export interface JokeReference {
    joke: InsideJoke;
    introduction: string;
    naturalUsage: string;
}
/**
 * Detect a potential inside joke moment
 */
export declare function detectJokeMoment(userId: string, message: string, context: {
    topics?: string[];
    wasLaughing?: boolean;
    conversationMood?: string;
}): InsideJoke | null;
/**
 * Save an inside joke
 */
export declare function saveJoke(joke: InsideJoke): void;
/**
 * Capture and save a joke in one call
 */
export declare function captureJoke(userId: string, message: string, context: {
    topics?: string[];
    wasLaughing?: boolean;
    conversationMood?: string;
}): InsideJoke | null;
/**
 * Find a relevant inside joke to reference
 */
export declare function findRelevantJoke(userId: string, context: {
    currentTopics?: string[];
    currentMood?: string;
    turnCount?: number;
}): JokeReference | null;
/**
 * Mark a joke as referenced
 */
export declare function markJokeReferenced(userId: string, jokeId: string): void;
/**
 * Format joke reference for prompt
 */
export declare function formatJokeForPrompt(reference: JokeReference): string;
declare const _default: {
    captureJoke: typeof captureJoke;
    detectJokeMoment: typeof detectJokeMoment;
    saveJoke: typeof saveJoke;
    findRelevantJoke: typeof findRelevantJoke;
    markJokeReferenced: typeof markJokeReferenced;
    formatJokeForPrompt: typeof formatJokeForPrompt;
};
export default _default;
//# sourceMappingURL=inside-jokes.d.ts.map