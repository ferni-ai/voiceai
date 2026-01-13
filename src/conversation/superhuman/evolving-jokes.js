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
import { seededChance, seededPick } from '../utils/rng.js';
import { createLogger } from '../../utils/safe-logger.js';
const logger = createLogger({ module: 'EvolvingJokes' });
// ============================================================================
// CONSTANTS
// ============================================================================
// Patterns that might seed a joke
const JOKE_SEED_PATTERNS = [
    // User creates a funny name/label
    {
        pattern: /(?:my|the|i call it(?: my)?)\s+["']?([a-z]+ ?[a-z]+)["']?\s+(?:brain|mode|problem|issue|thing)/i,
        type: 'self_label',
    },
    { pattern: /(?:let's call it|i call it|nickname)\s+["']?([a-z]+ ?[a-z]+)["']?/i, type: 'naming' },
    // Running gags about user's habits
    { pattern: /i always (?:do|say|forget|mess up|overthink)/i, type: 'habit' },
    { pattern: /every time i (?:do|try|think about)/i, type: 'habit' },
    // Self-deprecating humor
    { pattern: /(?:i'm|i am) (?:so|such a) (bad|terrible|awful) at/i, type: 'self_deprecation' },
    { pattern: /classic me/i, type: 'self_deprecation' },
    // Shared references
    { pattern: /(?:remember when|that time when|like when we)/i, type: 'shared_memory' },
    // Unique phrases they use
    { pattern: /(?:as i always say|my motto|my philosophy)/i, type: 'catchphrase' },
];
// ============================================================================
// EVOLVING JOKES ENGINE
// ============================================================================
export class EvolvingJokesEngine {
    jokes = new Map();
    userId;
    lastCallbackTurn = 0;
    constructor(userId, existingJokes) {
        this.userId = userId;
        if (existingJokes) {
            for (const joke of existingJokes) {
                this.jokes.set(joke.id, joke);
            }
        }
    }
    // ==========================================================================
    // JOKE SEED DETECTION
    // ==========================================================================
    /**
     * Analyze a user message for potential joke seeds
     */
    detectJokeSeed(userMessage, context) {
        // Check for pattern matches
        for (const { pattern, type } of JOKE_SEED_PATTERNS) {
            const match = userMessage.match(pattern);
            if (match) {
                // Extract the key phrase
                const seed = match[1] || match[0];
                // Check if we already have this joke
                if (this.hasJokeWithSeed(seed)) {
                    return { detected: false };
                }
                return { detected: true, seed, type };
            }
        }
        // Check for humorous context with a memorable phrase
        if (context.wasHumorous && userMessage.length > 10 && userMessage.length < 100) {
            // Look for quotable phrases
            const quotablePatterns = [
                /["']([^"']{10,50})["']/,
                /(?:i (?:always|never|can't) )(.{10,50})/i,
            ];
            for (const pattern of quotablePatterns) {
                const match = userMessage.match(pattern);
                if (match) {
                    return { detected: true, seed: match[1] || match[0], type: 'quotable' };
                }
            }
        }
        return { detected: false };
    }
    /**
     * Create a new evolving joke from a seed
     */
    createJoke(seed, type, topic) {
        const id = `joke_${Date.now()}_${Date.now().toString(36).slice(-6)}`;
        // Generate initial callback phrase based on type
        const initialPhrase = this.generateInitialPhrase(seed, type);
        const joke = {
            id,
            seed,
            currentPhrase: initialPhrase,
            phase: 'new',
            callbackCount: 0,
            createdAt: new Date(),
            evolutionHistory: [],
            triggers: topic ? [topic] : [],
        };
        this.jokes.set(id, joke);
        logger.debug({ userId: this.userId, id, seed, type }, '🃏 New inside joke created');
        return joke;
    }
    // ==========================================================================
    // JOKE CALLBACKS
    // ==========================================================================
    /**
     * Check if we should callback to a joke
     */
    checkForCallback(context) {
        // No callbacks if tone is heavy
        if (context.recentTone === 'heavy') {
            return { shouldCallback: false, shouldEvolve: false };
        }
        // Cooldown - minimum 20 turns between callbacks
        if (context.turnCount - this.lastCallbackTurn < 20) {
            return { shouldCallback: false, shouldEvolve: false };
        }
        // Need at least one joke
        if (this.jokes.size === 0) {
            return { shouldCallback: false, shouldEvolve: false };
        }
        // Find eligible jokes
        const eligibleJokes = this.getEligibleJokes(context.topic);
        if (eligibleJokes.length === 0) {
            return { shouldCallback: false, shouldEvolve: false };
        }
        // Probability based on relationship depth
        const probability = Math.min(0.15, 0.05 + context.sessionCount * 0.01);
        if (!seededChance(`${Date.now()}:1`, probability)) {
            return { shouldCallback: false, shouldEvolve: false };
        }
        // Select a joke
        const joke = this.selectJoke(eligibleJokes);
        if (!joke) {
            return { shouldCallback: false, shouldEvolve: false };
        }
        // Update joke
        joke.callbackCount++;
        joke.lastCallback = new Date();
        this.lastCallbackTurn = context.turnCount;
        // Check if it should evolve
        const shouldEvolve = this.shouldEvolve(joke);
        let evolvedPhrase;
        if (shouldEvolve) {
            evolvedPhrase = this.evolveJoke(joke);
        }
        logger.debug({ userId: this.userId, jokeId: joke.id, callbackCount: joke.callbackCount }, '🃏 Inside joke callback');
        return {
            shouldCallback: true,
            joke,
            phrase: joke.currentPhrase,
            shouldEvolve,
            evolvedPhrase,
        };
    }
    /**
     * Get a specific callback phrase for a joke
     */
    getCallbackPhrase(joke) {
        // Phase-specific callbacks
        switch (joke.phase) {
            case 'new':
                return this.getNewJokeCallback(joke);
            case 'established':
                return this.getEstablishedJokeCallback(joke);
            case 'legacy':
                return this.getLegacyJokeCallback(joke);
            default:
                return joke.currentPhrase;
        }
    }
    // ==========================================================================
    // JOKE EVOLUTION
    // ==========================================================================
    shouldEvolve(joke) {
        // Evolve from new → established after 3 callbacks
        if (joke.phase === 'new' && joke.callbackCount >= 3) {
            return true;
        }
        // Evolve from established → legacy after 8 callbacks
        if (joke.phase === 'established' && joke.callbackCount >= 8) {
            return true;
        }
        return false;
    }
    evolveJoke(joke) {
        const oldPhrase = joke.currentPhrase;
        let newPhrase;
        let newPhase;
        if (joke.phase === 'new') {
            newPhase = 'established';
            newPhrase = this.generateEstablishedPhrase(joke);
        }
        else if (joke.phase === 'established') {
            newPhase = 'legacy';
            newPhrase = this.generateLegacyPhrase(joke);
        }
        else {
            return oldPhrase;
        }
        // Record evolution
        joke.evolutionHistory.push({
            date: new Date(),
            from: oldPhrase,
            to: newPhrase,
            reason: 'repeated_use',
        });
        joke.phase = newPhase;
        joke.currentPhrase = newPhrase;
        logger.debug({ userId: this.userId, jokeId: joke.id, oldPhase: joke.phase, newPhase }, '🃏 Inside joke evolved');
        return newPhrase;
    }
    // ==========================================================================
    // PHRASE GENERATION
    // ==========================================================================
    generateInitialPhrase(seed, type) {
        const templates = {
            self_label: [
                `"${seed}" mode—is that what's happening?`,
                `Ah, the famous ${seed}.`,
                `${seed} activated?`,
            ],
            naming: [`"${seed}"—I love that we have a name for it.`, `Good old ${seed}.`],
            habit: [`Classic you.`, `There it is again.`, `Some things never change.`],
            self_deprecation: [
                `Hey, you're being too hard on yourself.`,
                `We both know that's not entirely true.`,
            ],
            shared_memory: [`I remember that.`, `Oh, we're going there.`],
            catchphrase: [`As you always say.`, `Your words, not mine.`],
            quotable: [`"${seed}"—that's going in the book.`, `I'm remembering that one.`],
        };
        const typeTemplates = templates[type] || templates.quotable;
        return seededPick(`${Date.now()}:310`, typeTemplates) ?? typeTemplates[0];
    }
    generateEstablishedPhrase(joke) {
        const templates = [
            `Our old friend "${joke.seed}"...`,
            `Ah, "${joke.seed}" again. I know this one.`,
            `"${joke.seed}"—we've been here before.`,
            `The "${joke.seed}" returns.`,
        ];
        return seededPick(`${Date.now()}:320`, templates) ?? templates[0];
    }
    generateLegacyPhrase(joke) {
        const templates = [
            `Remember when we named this "${joke.seed}"? Look at us now.`,
            `"${joke.seed}"—feels like a lifetime ago we started calling it that.`,
            `Our "${joke.seed}" is basically a veteran at this point.`,
            `"${joke.seed}"—one of my favorite things about us.`,
        ];
        return seededPick(`${Date.now()}:330`, templates) ?? templates[0];
    }
    getNewJokeCallback(joke) {
        const templates = [
            `Wait, is this "${joke.seed}" again?`,
            `"${joke.seed}"—I'm starting to recognize this one.`,
        ];
        return seededPick(`${Date.now()}:338`, templates) ?? templates[0];
    }
    getEstablishedJokeCallback(joke) {
        const templates = [
            `Ah, good old "${joke.seed}."`,
            `There's our "${joke.seed}" again.`,
            `"${joke.seed}" says hello.`,
        ];
        return seededPick(`${Date.now()}:347`, templates) ?? templates[0];
    }
    getLegacyJokeCallback(joke) {
        const templates = [
            `"${joke.seed}"—an old favorite.`,
            `Classic "${joke.seed}." Some things become tradition.`,
            `"${joke.seed}"—how far we've come with this one.`,
        ];
        return seededPick(`${Date.now()}:356`, templates) ?? templates[0];
    }
    // ==========================================================================
    // HELPERS
    // ==========================================================================
    hasJokeWithSeed(seed) {
        const seedLower = seed.toLowerCase();
        for (const joke of Array.from(this.jokes.values())) {
            if (joke.seed.toLowerCase() === seedLower) {
                return true;
            }
        }
        return false;
    }
    getEligibleJokes(topic) {
        const eligible = [];
        for (const joke of Array.from(this.jokes.values())) {
            // Skip retired jokes
            if (joke.phase === 'retired')
                continue;
            // Prefer topic-relevant jokes
            if (topic && joke.triggers.includes(topic)) {
                eligible.unshift(joke); // Add to front
            }
            else {
                eligible.push(joke);
            }
        }
        return eligible;
    }
    selectJoke(eligible) {
        if (eligible.length === 0)
            return null;
        // Weight by phase (established > new > legacy)
        const weighted = [];
        for (const joke of eligible) {
            const weight = joke.phase === 'established' ? 3 : joke.phase === 'new' ? 2 : 1;
            for (let i = 0; i < weight; i++) {
                weighted.push(joke);
            }
        }
        return seededPick(`${Date.now()}:403`, weighted) ?? weighted[0];
    }
    // ==========================================================================
    // STATE ACCESS
    // ==========================================================================
    /**
     * Get all jokes
     */
    getAllJokes() {
        return Array.from(this.jokes.values());
    }
    /**
     * Export for persistence
     */
    export() {
        return structuredClone(Array.from(this.jokes.values()));
    }
    /**
     * Import from persistence
     */
    import(jokes) {
        this.jokes.clear();
        for (const joke of jokes) {
            const restored = {
                ...joke,
                createdAt: new Date(joke.createdAt),
                lastCallback: joke.lastCallback ? new Date(joke.lastCallback) : undefined,
                evolutionHistory: joke.evolutionHistory.map((e) => ({
                    ...e,
                    date: new Date(e.date),
                })),
            };
            this.jokes.set(joke.id, restored);
        }
    }
    /**
     * Reset
     */
    reset() {
        this.jokes.clear();
        this.lastCallbackTurn = 0;
    }
}
// ============================================================================
// SINGLETON MANAGEMENT
// ============================================================================
const engines = new Map();
export function getEvolvingJokes(userId, existingJokes) {
    if (!engines.has(userId)) {
        engines.set(userId, new EvolvingJokesEngine(userId, existingJokes));
    }
    return engines.get(userId);
}
export function clearEvolvingJokes(userId) {
    engines.delete(userId);
}
export default EvolvingJokesEngine;
//# sourceMappingURL=evolving-jokes.js.map