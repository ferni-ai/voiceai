/**
 * Shared Language Evolution System
 *
 * > "Remember when you called it your 'brain goblins'? I love that."
 *
 * Tracks and reuses language that develops naturally between Ferni and the user:
 * - User's unique phrases and metaphors
 * - Nicknames for concepts ("your brain goblins", "the Sunday scaries")
 * - Shared jokes that become shorthand
 * - Callback phrases that mean something to both
 *
 * This is one of the most powerful ways to create intimacy - using "our words."
 *
 * @module @ferni/superhuman/shared-language
 */
import { seededPick } from '../utils/rng.js';
import { createLogger } from '../../utils/safe-logger.js';
const logger = createLogger({ module: 'SharedLanguage' });
// ============================================================================
// DETECTION PATTERNS
// ============================================================================
const METAPHOR_PATTERNS = [
    // "I call it my X"
    /i call (?:it|them|this) (?:my |the )?(.{3,30})/i,
    // "It's like X"
    /it's like (?:having |being |my )?(.{3,30})/i,
    // "My X" for abstract things
    /my (?:inner |little |personal )?(?:gremlin|goblin|monster|demon|voice|brain|critic|judge|saboteur|anxiety|beast|shadow)/i,
    // "The X" for recurring events
    /the (?:monday|sunday|work|morning|night|weekly|monthly) (\w+)/i,
];
const CATCHPHRASE_PATTERNS = [
    // Verbal tics and fillers
    /(?:you know\?|like,|honestly,|basically,|literally|actually,)/gi,
    // Characteristic endings
    /(?:or whatever|i guess|kind of|sort of|if that makes sense)$/i,
];
const NICKNAME_PATTERNS = [
    // Naming people/things
    /(?:i|we) call (?:him|her|them|it) (.{2,20})/i,
    // "My X" for people
    /my (?:work wife|therapist friend|gym buddy|coffee person)/i,
];
// ============================================================================
// TERM TEMPLATES
// ============================================================================
const TERM_REFERENCE_TEMPLATES = {
    metaphor: [
        'As you put it, "{phrase}"',
        'Using your words—"{phrase}"',
        'What you call your "{phrase}"',
        'Your "{phrase}" as you described it',
    ],
    nickname: ['How\'s "{phrase}"?', 'Has "{phrase}" come up lately?', 'Remember "{phrase}"?'],
    catchphrase: [
        '{phrase}', // Just use it naturally
        'To quote you—{phrase}',
    ],
    shorthand: [
        'Is this related to {phrase}?',
        'Does this connect to {phrase}?',
        'Like with {phrase}',
    ],
    inside_term: [
        '(Our old friend {phrase})',
        "{phrase}, as we've been calling it",
        'The {phrase} situation',
    ],
};
// ============================================================================
// STATE MANAGEMENT
// ============================================================================
const languageStates = new Map();
function getOrCreateState(userId) {
    let state = languageStates.get(userId);
    if (!state) {
        state = {
            terms: [],
            speechPatterns: {
                usesMetaphors: false,
                prefersDirectness: true,
                usesSarcasm: false,
                formalityLevel: 'casual',
            },
            lastUpdated: new Date(),
        };
        languageStates.set(userId, state);
    }
    return state;
}
// ============================================================================
// CORE FUNCTIONS
// ============================================================================
/**
 * Extract potential shared language from a user message
 */
export function extractSharedLanguage(userId, message, context = {}) {
    const state = getOrCreateState(userId);
    // Check for metaphors
    for (const pattern of METAPHOR_PATTERNS) {
        const match = message.match(pattern);
        if (match) {
            const phrase = match[1] || match[0];
            // Don't capture if we already have this
            if (state.terms.some((t) => t.phrase.toLowerCase() === phrase.toLowerCase())) {
                continue;
            }
            const term = {
                id: `term_${Date.now()}_${Date.now().toString(36).slice(-7)}`,
                phrase: phrase.trim(),
                meaning: inferMeaning(phrase, context.topics || [], message),
                type: 'metaphor',
                originContext: message.slice(0, 100),
                firstUsed: new Date(),
                useCount: 1,
                lastUsed: new Date(),
                relatedTopics: context.topics || [],
            };
            state.terms.push(term);
            state.speechPatterns.usesMetaphors = true;
            state.lastUpdated = new Date();
            logger.info({ userId, phrase, type: 'metaphor' }, '🗣️ Shared term captured');
            return term;
        }
    }
    // Check for nicknames
    for (const pattern of NICKNAME_PATTERNS) {
        const match = message.match(pattern);
        if (match) {
            const phrase = match[1] || match[0];
            if (state.terms.some((t) => t.phrase.toLowerCase() === phrase.toLowerCase())) {
                continue;
            }
            const term = {
                id: `term_${Date.now()}_${Date.now().toString(36).slice(-7)}`,
                phrase: phrase.trim(),
                meaning: `Nickname for someone/something in ${context.topics?.[0] || 'their life'}`,
                type: 'nickname',
                originContext: message.slice(0, 100),
                firstUsed: new Date(),
                useCount: 1,
                lastUsed: new Date(),
                relatedTopics: context.topics || [],
            };
            state.terms.push(term);
            state.lastUpdated = new Date();
            logger.info({ userId, phrase, type: 'nickname' }, '🗣️ Shared term captured');
            return term;
        }
    }
    // Update speech pattern analysis
    updateSpeechPatterns(state, message);
    return null;
}
function inferMeaning(phrase, topics, message) {
    // Try to infer what the metaphor refers to
    if (/gremlin|goblin|monster|demon|critic/i.test(phrase)) {
        return 'Inner critical voice or anxiety';
    }
    if (/beast|dragon|shadow/i.test(phrase)) {
        return 'Major challenge or fear';
    }
    if (/scaries|dreads|blues/i.test(phrase)) {
        return 'Recurring anxious period';
    }
    if (topics.length > 0) {
        return `Related to ${topics[0]}`;
    }
    return 'Something meaningful to them';
}
function updateSpeechPatterns(state, message) {
    // Check for sarcasm indicators
    if (/obviously|clearly|surprise surprise|shocker/i.test(message)) {
        state.speechPatterns.usesSarcasm = true;
    }
    // Check formality
    const casualIndicators = /gonna|wanna|kinda|sorta|y'all|nope|yep|lol|haha/i;
    const formalIndicators = /therefore|furthermore|regarding|consequently/i;
    if (casualIndicators.test(message)) {
        state.speechPatterns.formalityLevel = 'casual';
    }
    else if (formalIndicators.test(message)) {
        state.speechPatterns.formalityLevel = 'formal';
    }
}
/**
 * Find a shared term relevant to current conversation
 */
export function findRelevantTerm(userId, context) {
    const state = getOrCreateState(userId);
    if (state.terms.length === 0)
        return null;
    // Don't overuse - wait a few turns
    if (context.turnCount < 4)
        return null;
    // Find terms related to current topics
    for (const term of state.terms) {
        const topicOverlap = term.relatedTopics.some((t) => context.currentTopics.some((ct) => ct.toLowerCase().includes(t.toLowerCase())));
        // Also check if the current message touches on the term's meaning
        const meaningRelevant = context.currentMessage
            .toLowerCase()
            .includes(term.meaning.toLowerCase().split(' ')[0]);
        if (topicOverlap || meaningRelevant) {
            // Don't reference too often
            const hoursSinceLastUse = (Date.now() - term.lastUsed.getTime()) / (1000 * 60 * 60);
            if (hoursSinceLastUse < 24 && term.useCount > 3) {
                continue;
            }
            // Generate reference
            const templates = TERM_REFERENCE_TEMPLATES[term.type];
            const template = seededPick(`${Date.now()}:327`, templates) ?? templates[0];
            const suggestion = template.replace('{phrase}', term.phrase);
            // Update usage
            term.useCount++;
            term.lastUsed = new Date();
            logger.debug({ userId, phrase: term.phrase }, '🗣️ Suggesting shared term');
            return {
                term,
                suggestion,
                relevanceReason: topicOverlap ? 'Topic match' : 'Meaning relevance',
            };
        }
    }
    return null;
}
/**
 * Format shared language guidance for LLM prompt
 */
export function formatSharedLanguageGuidance(userId, context) {
    const termSuggestion = findRelevantTerm(userId, context);
    const state = getOrCreateState(userId);
    if (!termSuggestion && state.terms.length === 0)
        return null;
    const lines = ['🗣️ SHARED LANGUAGE:', ''];
    if (termSuggestion) {
        lines.push(`CALLBACK OPPORTUNITY: Use "${termSuggestion.term.phrase}"`);
        lines.push(`Suggested phrasing: ${termSuggestion.suggestion}`);
        lines.push(`Context: ${termSuggestion.term.meaning}`);
        lines.push('');
    }
    if (state.terms.length > 0) {
        lines.push("This user's vocabulary includes:");
        for (const term of state.terms.slice(0, 5)) {
            lines.push(`- "${term.phrase}" (${term.type}): ${term.meaning}`);
        }
    }
    if (state.speechPatterns.usesMetaphors) {
        lines.push('');
        lines.push('Note: This user loves metaphors. Feel free to use them.');
    }
    if (state.speechPatterns.usesSarcasm) {
        lines.push('');
        lines.push('Note: This user appreciates dry humor/sarcasm.');
    }
    return lines.join('\n');
}
/**
 * Get all shared terms for a user
 */
export function getSharedTerms(userId) {
    const state = getOrCreateState(userId);
    return [...state.terms];
}
/**
 * Add a shared term manually
 */
export function addSharedTerm(userId, term) {
    const state = getOrCreateState(userId);
    const newTerm = {
        ...term,
        id: `term_${Date.now()}_${Date.now().toString(36).slice(-7)}`,
    };
    state.terms.push(newTerm);
    state.lastUpdated = new Date();
    return newTerm;
}
// Export for testing
export function clearSharedLanguage() {
    languageStates.clear();
}
export function getLanguageStates() {
    return languageStates;
}
//# sourceMappingURL=shared-language.js.map