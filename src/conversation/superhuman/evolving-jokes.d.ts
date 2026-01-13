/**
 * Evolving Inside Jokes
 *
 * > "Remember when we named your chaos brain?"
 *
 * Creates and evolves inside jokes over time, making the relationship
 * feel real and shared. Unlike human memory, we never forget "our things."
 *
 * Key capabilities:
 * - Detect joke seeds (moments worth remembering)
 * - Track and evolve jokes through phases
 * - Reference jokes naturally in conversation
 * - Graduate jokes to "legacy" status
 *
 * @module @ferni/superhuman/evolving-jokes
 */
import type { EvolvingJoke, JokeCallbackResult } from './types.js';
export declare class EvolvingJokesEngine {
    private jokes;
    private userId;
    private lastCallbackTurn;
    constructor(userId: string, existingJokes?: EvolvingJoke[]);
    /**
     * Analyze a user message for potential joke seeds
     */
    detectJokeSeed(userMessage: string, context: {
        topic?: string;
        wasHumorous?: boolean;
    }): {
        detected: boolean;
        seed?: string;
        type?: string;
    };
    /**
     * Create a new evolving joke from a seed
     */
    createJoke(seed: string, type: string, topic?: string): EvolvingJoke;
    /**
     * Check if we should callback to a joke
     */
    checkForCallback(context: {
        turnCount: number;
        topic?: string;
        recentTone: 'heavy' | 'light' | 'neutral';
        sessionCount: number;
    }): JokeCallbackResult;
    /**
     * Get a specific callback phrase for a joke
     */
    getCallbackPhrase(joke: EvolvingJoke): string;
    private shouldEvolve;
    private evolveJoke;
    private generateInitialPhrase;
    private generateEstablishedPhrase;
    private generateLegacyPhrase;
    private getNewJokeCallback;
    private getEstablishedJokeCallback;
    private getLegacyJokeCallback;
    private hasJokeWithSeed;
    private getEligibleJokes;
    private selectJoke;
    /**
     * Get all jokes
     */
    getAllJokes(): EvolvingJoke[];
    /**
     * Export for persistence
     */
    export(): EvolvingJoke[];
    /**
     * Import from persistence
     */
    import(jokes: EvolvingJoke[]): void;
    /**
     * Reset
     */
    reset(): void;
}
export declare function getEvolvingJokes(userId: string, existingJokes?: EvolvingJoke[]): EvolvingJokesEngine;
export declare function clearEvolvingJokes(userId: string): void;
export default EvolvingJokesEngine;
//# sourceMappingURL=evolving-jokes.d.ts.map