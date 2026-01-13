/**
 * Micro-Reactions System
 *
 * Inspired by Sesame AI's ability to produce immediate, natural vocal
 * reactions during conversation. These are small sounds (< 150ms) that
 * show active listening and emotional presence.
 *
 * Sesame noted: "The model can laugh, change pace, emphasize, give
 * expressive cues, and even detect your mood from your voice."
 *
 * @module speech/sesame-inspired/micro-reactions
 */
import { createLogger } from '../../utils/safe-logger.js';
const log = createLogger({ module: 'MicroReactions' });
// =============================================================================
// MICRO-REACTION LIBRARY
// =============================================================================
/**
 * Complete library of micro-reactions with SSML
 */
export const MICRO_REACTIONS = {
    gasp: {
        type: 'gasp',
        ssml: '<emotion value="surprised"/><speed ratio="1.2"/>*sharp inhale*<break time="80ms"/>',
        durationMs: 100,
        contexts: ['user_sharing_bad_news', 'user_making_realization'],
    },
    hmm: {
        type: 'hmm',
        ssml: '<emotion value="contemplative"/><speed ratio="0.9"/>Hmm.<break time="120ms"/>',
        durationMs: 150,
        contexts: ['user_pausing_to_think', 'user_asking_question', 'user_finishing_thought'],
    },
    oh: {
        type: 'oh',
        ssml: '<emotion value="surprised"/>Oh!<break time="80ms"/>',
        durationMs: 100,
        contexts: ['user_sharing_good_news', 'user_making_realization'],
    },
    ah: {
        type: 'ah',
        ssml: '<emotion value="curious"/>Ah.<break time="100ms"/>',
        durationMs: 120,
        contexts: ['user_making_realization', 'user_finishing_thought'],
    },
    mm: {
        type: 'mm',
        ssml: '<emotion value="calm"/>Mm.<break time="60ms"/>',
        durationMs: 80,
        contexts: ['user_pausing_to_think', 'user_trailing_off', 'user_being_vulnerable'],
    },
    huh: {
        type: 'huh',
        ssml: '<emotion value="curious"/>Huh.<break time="100ms"/>',
        durationMs: 120,
        contexts: ['user_asking_question', 'user_making_realization'],
    },
    wow: {
        type: 'wow',
        ssml: '<emotion value="surprised"/><speed ratio="0.95"/>Wow.<break time="120ms"/>',
        durationMs: 150,
        contexts: ['user_sharing_good_news', 'user_making_realization'],
    },
    ooh: {
        type: 'ooh',
        ssml: '<emotion value="curious"/><speed ratio="0.95"/>Ooh.<break time="100ms"/>',
        durationMs: 120,
        contexts: ['user_sharing_good_news', 'user_joking'],
    },
    oof: {
        type: 'oof',
        ssml: '<emotion value="sympathetic"/><speed ratio="0.9"/>Oof.<break time="100ms"/>',
        durationMs: 120,
        contexts: ['user_sharing_bad_news', 'user_expressing_frustration'],
    },
    aww: {
        type: 'aww',
        ssml: '<emotion value="affectionate"/><speed ratio="0.9"/>Aww.<break time="120ms"/>',
        durationMs: 140,
        contexts: ['user_being_vulnerable', 'user_sharing_good_news'],
    },
    whoa: {
        type: 'whoa',
        ssml: '<emotion value="surprised"/><speed ratio="1.1"/>Whoa!<break time="100ms"/>',
        durationMs: 120,
        contexts: ['user_sharing_good_news', 'user_sharing_bad_news', 'user_making_realization'],
    },
    yikes: {
        type: 'yikes',
        ssml: '<emotion value="surprised"/><speed ratio="1.05"/>Yikes.<break time="100ms"/>',
        durationMs: 120,
        contexts: ['user_sharing_bad_news', 'user_expressing_frustration'],
    },
    nice: {
        type: 'nice',
        ssml: '<emotion value="happy"/>Nice!<break time="80ms"/>',
        durationMs: 100,
        contexts: ['user_sharing_good_news', 'user_joking'],
    },
    right: {
        type: 'right',
        ssml: '<emotion value="confident"/>Right.<break time="80ms"/>',
        durationMs: 100,
        contexts: ['user_finishing_thought', 'user_making_realization'],
    },
};
// =============================================================================
// CONTEXT DETECTION
// =============================================================================
/**
 * Patterns to detect conversational context
 */
const CONTEXT_PATTERNS = {
    user_sharing_good_news: [
        /\b(got the job|promotion|accepted|pregnant|engaged|married|won|passed|graduated)\b/i,
        /\b(amazing|incredible|best|fantastic|great news|good news|finally)\b/i,
        /\b(can't believe|so happy|so excited|thrilled)\b/i,
    ],
    user_sharing_bad_news: [
        /\b(died|passed away|lost|fired|rejected|failed|broke up|divorced|cancer)\b/i,
        /\b(bad news|terrible|awful|worst|horrible|devastating)\b/i,
        /\b(didn't make it|didn't work out|fell through)\b/i,
    ],
    user_making_realization: [
        /\b(just realized|wait|oh my god|oh no|actually|I never thought)\b/i,
        /\b(that means|so that's why|it makes sense now|I get it)\b/i,
        /\b(holy|what if|could it be)\b/i,
    ],
    user_asking_question: [
        /\?$/,
        /\b(what do you think|how should I|should I|would you|could you)\b/i,
        /\b(wondering|curious|want to know|tell me)\b/i,
    ],
    user_expressing_frustration: [
        /\b(so frustrated|can't stand|sick of|tired of|fed up|had enough)\b/i,
        /\b(why does|why can't|why won't|this is ridiculous|unbelievable)\b/i,
        /\b(ugh|argh|seriously|again)\b/i,
    ],
    user_being_vulnerable: [
        /\b(never told anyone|hard to admit|embarrassed|ashamed|scared)\b/i,
        /\b(honestly|the truth is|between us|I feel|I've been feeling)\b/i,
        /\b(lonely|alone|lost|confused|don't know)\b/i,
    ],
    user_joking: [
        /\b(haha|lol|lmao|just kidding|jk|joking|funny thing)\b/i,
        /\b(get this|you know what's|guess what|hilarious)\b/i,
    ],
    user_trailing_off: [
        /\.\.\.$/,
        /\b(I don't know|I mean|it's just|you know)\s*\.{0,3}$/i,
        /\b(kind of|sort of|maybe|I guess)\s*\.{0,3}$/i,
    ],
    user_finishing_thought: [
        /\.\s*$/,
        /\b(that's it|that's all|yeah|so yeah|anyway)\s*\.?\s*$/i,
        /\b(I think|I guess|I hope|I believe)\s*\.?\s*$/i,
    ],
    user_pausing_to_think: [
        /\b(let me think|hmm|um|uh|well)\s*\.{0,3}$/i,
        /\b(how do I|what's the word|I'm trying to)\b/i,
    ],
};
/**
 * Detect the current conversational context from text
 */
export function detectContext(text) {
    for (const [context, patterns] of Object.entries(CONTEXT_PATTERNS)) {
        for (const pattern of patterns) {
            if (pattern.test(text)) {
                return context;
            }
        }
    }
    return null;
}
/**
 * Detect multiple contexts (for complex messages)
 */
export function detectContexts(text) {
    const contexts = [];
    for (const [context, patterns] of Object.entries(CONTEXT_PATTERNS)) {
        for (const pattern of patterns) {
            if (pattern.test(text)) {
                contexts.push(context);
                break; // Only add each context once
            }
        }
    }
    return contexts;
}
// =============================================================================
// REACTION SELECTION
// =============================================================================
/**
 * Get appropriate micro-reactions for a context
 */
export function getReactionsForContext(context) {
    return Object.values(MICRO_REACTIONS).filter((r) => r.contexts.includes(context));
}
/**
 * Select the best micro-reaction for given text
 *
 * Returns null if no appropriate reaction found or if reaction
 * would feel forced.
 */
export function selectMicroReaction(text, recentReactions) {
    const context = detectContext(text);
    if (!context) {
        return null;
    }
    const candidates = getReactionsForContext(context);
    if (candidates.length === 0) {
        return null;
    }
    // Filter out recently used reactions to add variety
    const filtered = recentReactions
        ? candidates.filter((r) => !recentReactions.includes(r.type))
        : candidates;
    // Use filtered if available, otherwise fallback to all candidates
    const pool = filtered.length > 0 ? filtered : candidates;
    // Random selection weighted by appropriateness
    const selected = pool[Math.floor(Math.random() * pool.length)];
    log.debug({
        context,
        selectedReaction: selected.type,
        candidateCount: candidates.length,
    }, 'Selected micro-reaction');
    return selected;
}
/**
 * Get a specific micro-reaction by type
 */
export function getMicroReaction(type) {
    return MICRO_REACTIONS[type];
}
// =============================================================================
// COMPOUND REACTIONS
// =============================================================================
/**
 * Compound reactions for strong emotional moments
 */
export const COMPOUND_REACTIONS = {
    big_surprise: '<emotion value="surprised"/><speed ratio="1.1"/>Oh!<break time="50ms"/>Wow.<break time="100ms"/>',
    deep_empathy: '<emotion value="sympathetic"/><speed ratio="0.85"/><volume ratio="0.85"/>Oh...<break time="150ms"/>I...<break time="100ms"/>',
    excited_celebration: '<emotion value="excited"/>YES!<break time="80ms"/>Oh that\'s amazing!<break time="100ms"/>',
    gentle_understanding: '<emotion value="affectionate"/><speed ratio="0.9"/>Mm.<break time="100ms"/>Yeah.<break time="80ms"/>',
    playful_delight: '<emotion value="happy"/>Ha!<break time="60ms"/>Oh I love that.<break time="100ms"/>',
    concerned_support: '<emotion value="sympathetic"/>Oh no.<break time="100ms"/><speed ratio="0.9"/>Hey.<break time="80ms"/>',
};
/**
 * Get compound reaction for intense emotional moments
 */
export function getCompoundReaction(contexts) {
    // Check for combinations that warrant compound reactions
    if (contexts.includes('user_sharing_good_news') && contexts.includes('user_making_realization')) {
        return COMPOUND_REACTIONS.big_surprise;
    }
    if (contexts.includes('user_being_vulnerable') && contexts.includes('user_sharing_bad_news')) {
        return COMPOUND_REACTIONS.deep_empathy;
    }
    if (contexts.includes('user_joking') && contexts.includes('user_sharing_good_news')) {
        return COMPOUND_REACTIONS.playful_delight;
    }
    return null;
}
const sessions = new Map();
/**
 * Get or create session
 */
export function getMicroReactionSession(sessionId) {
    if (!sessions.has(sessionId)) {
        sessions.set(sessionId, {
            recentReactions: [],
            reactionCount: 0,
            lastReactionTime: 0,
        });
    }
    return sessions.get(sessionId);
}
/**
 * Record a reaction being used
 */
export function recordReaction(sessionId, type) {
    const session = getMicroReactionSession(sessionId);
    session.recentReactions.push(type);
    // Keep only last 5 reactions for variety tracking
    if (session.recentReactions.length > 5) {
        session.recentReactions.shift();
    }
    session.reactionCount++;
    session.lastReactionTime = Date.now();
}
/**
 * Check if we should use a reaction (rate limiting)
 */
export function shouldUseReaction(sessionId) {
    const session = sessions.get(sessionId);
    if (!session)
        return true;
    // Rate limit: at least 3 seconds between reactions
    const timeSinceLastReaction = Date.now() - session.lastReactionTime;
    if (timeSinceLastReaction < 3000) {
        return false;
    }
    // Don't overuse reactions - max 1 per 3 user turns on average
    // (This is checked at a higher level, but we provide the data)
    return true;
}
/**
 * Get contextual micro-reaction for session
 */
export function getSessionMicroReaction(sessionId, text) {
    if (!shouldUseReaction(sessionId)) {
        return null;
    }
    const session = getMicroReactionSession(sessionId);
    const reaction = selectMicroReaction(text, session.recentReactions);
    if (reaction) {
        recordReaction(sessionId, reaction.type);
    }
    return reaction;
}
/**
 * Reset session
 */
export function resetMicroReactionSession(sessionId) {
    sessions.delete(sessionId);
}
/**
 * Get active session count
 */
export function getActiveMicroReactionSessionCount() {
    return sessions.size;
}
//# sourceMappingURL=micro-reactions.js.map