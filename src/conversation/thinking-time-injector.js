/**
 * Dynamic Thinking Time Injector
 *
 * Calculates contextually-appropriate thinking pauses to inject into responses.
 * Makes AI feel like it's actually processing, not just pattern-matching.
 *
 * The Problem: Instant responses feel robotic. But random pauses feel fake.
 * The Solution: Pauses that correlate with ACTUAL complexity/emotion/weight.
 *
 * Pause Factors:
 * 1. Question Complexity - Deep questions deserve consideration
 * 2. Emotional Weight - Heavy topics need space
 * 3. Conversation Momentum - Match user's pace
 * 4. Turn Count - Early = more thinking, later = rapport built
 * 5. Self-Correction - "Actually..." moments need setup
 * 6. Persona Style - Some personas are more contemplative
 *
 * COORDINATION: Uses ThinkingPhraseCoordinator to prevent duplicate
 * "good question" phrases from multiple systems.
 *
 * NOTE: This module injects pauses INTO the AI's RESPONSE text.
 * For filling dead air BEFORE the response (LLM processing delays),
 * use ProcessingIntelligence instead.
 *
 * @see src/intelligence/processing-intelligence.ts for dead air/processing delays
 * @module conversation/thinking-time-injector
 */
import { createLogger } from '../utils/safe-logger.js';
import { recordThinkingTime } from './awareness-metrics.js';
import { getMomentumTracker } from './momentum-tracker.js';
import { requestThinkingPhrase, wasPhraseUsedThisTurn } from './thinking-phrase-coordinator.js';
const log = createLogger({ module: 'thinking-time' });
const DEFAULT_THINKING_SOUNDS = {
    consideration: ['Hmm', 'Let me think', 'Interesting'],
    emotional: ['I hear you', 'Mmm', 'Yeah'],
    processing: ['Okay', 'So', 'Right'],
    acknowledgment: ['I see', 'Ah', 'Got it'],
    soundProbability: 0.3,
};
const FERNI_THINKING_SOUNDS = {
    consideration: [
        'Hmm.',
        'Let me sit with that.',
        "There's something here.",
        'Interesting.',
        'Let me think about that.',
    ],
    emotional: ['I feel that.', 'Mmm.', 'Yeah.', "That's heavy.", 'I hear you.'],
    processing: ['Okay.', 'So.', 'Right.', "Let's see.", 'Alright.'],
    acknowledgment: ['I see.', 'Ah.', 'Got it.', 'Makes sense.', "I'm with you."],
    soundProbability: 0.45, // Ferni is more contemplative
};
// Maya Santos - Warm, encouraging, action-oriented
const MAYA_THINKING_SOUNDS = {
    consideration: ['Hmm.', "Let's think about this.", 'Okay, so.', "That's interesting."],
    emotional: ['I hear you.', 'Yeah.', "That's real.", 'I get that.'],
    processing: ['So.', 'Okay.', 'Right.', 'Alright then.'],
    acknowledgment: ['Love that.', 'Got it.', 'Makes sense.', 'I see.'],
    soundProbability: 0.35, // Maya is more action-oriented
};
// Alex Chen - Efficient, professional, dry wit
const ALEX_THINKING_SOUNDS = {
    consideration: ['Hmm.', 'Let me think.', 'Okay.', 'Interesting.'],
    emotional: ['I hear you.', 'Yeah.', 'Got it.', 'Understood.'],
    processing: ['Right.', 'So.', 'Okay.', 'Alright.'],
    acknowledgment: ['Got it.', 'I see.', 'Makes sense.', 'Understood.'],
    soundProbability: 0.25, // Alex is more efficient, fewer fillers
};
// Peter John - Analytical, thoughtful, research-focused
const PETER_THINKING_SOUNDS = {
    consideration: [
        'Hmm.',
        "That's an interesting question.",
        'Let me think about that.',
        'Fascinating.',
        "There's something here.",
    ],
    emotional: ['I see.', 'Yeah.', 'I get that.', 'Understandable.'],
    processing: ['So.', 'Right.', "Let's see.", 'Now.'],
    acknowledgment: ['Interesting.', 'I see.', 'Got it.', 'Makes sense.'],
    soundProbability: 0.4, // Peter is contemplative about analysis
};
const THINKING_SOUND_PROFILES = {
    ferni: FERNI_THINKING_SOUNDS,
    'maya-santos': MAYA_THINKING_SOUNDS,
    'alex-chen': ALEX_THINKING_SOUNDS,
    'peter-john': PETER_THINKING_SOUNDS,
};
// ============================================================================
// QUESTION COMPLEXITY DETECTION
// ============================================================================
const COMPLEX_QUESTION_PATTERNS = [
    /\bwhy\b.*\?/i, // "Why" questions require reasoning
    /\bhow\s+(do|can|should|would)\b/i, // "How" questions need explanation
    /\bwhat\s+(do|should|would)\s+you\s+(think|feel|believe)\b/i, // Opinion questions
    /\bmeaning\s+of\b/i, // Meaning questions
    /\bpurpose\b/i, // Purpose questions
    /\bwhat's\s+(wrong|right|best|worst)\b/i, // Evaluation questions
    /\badvice\b/i, // Advice requests
    /\bshould\s+I\b/i, // Decision questions
    /\bwhat\s+if\b/i, // Hypotheticals
    /\bdo\s+you\s+(ever|think|feel|believe)\b/i, // Personal questions
];
const HEAVY_TOPIC_PATTERNS = [
    /\b(died?|death|dying|passed\s+away)\b/i,
    /\b(divorce|separation|breakup|broke\s+up)\b/i,
    /\b(fired|laid\s+off|lost\s+(my|the)\s+job)\b/i,
    /\b(cancer|terminal|diagnosis)\b/i,
    /\b(suicid|self[- ]harm)\b/i,
    /\b(alone|lonely|no\s+one)\b/i,
    /\b(scared|terrified|afraid)\b/i,
    /\b(failed|failure|loser)\b/i,
    /\b(hate\s+my(self)?|worthless)\b/i,
    /\b(trauma|abuse|assault)\b/i,
];
function detectQuestionComplexity(text) {
    const isComplex = COMPLEX_QUESTION_PATTERNS.some((pattern) => pattern.test(text));
    const isHeavy = HEAVY_TOPIC_PATTERNS.some((pattern) => pattern.test(text));
    let weight = 0.3; // Base
    if (isComplex)
        weight += 0.3;
    if (isHeavy)
        weight += 0.4;
    if (text.length > 150)
        weight += 0.1; // Long messages = more to process
    if ((text.match(/\?/g) || []).length > 1)
        weight += 0.1; // Multiple questions
    return { isComplex: isComplex || isHeavy, weight: Math.min(1, weight) };
}
// ============================================================================
// PAUSE CALCULATION
// ============================================================================
function calculateOpeningPause(ctx, complexity) {
    let baseMs = 150; // Minimum natural pause
    // Complexity adds pause
    baseMs += complexity.weight * 400; // Up to 400ms more for complex
    // Emotional intensity adds pause
    if (ctx.emotionalIntensity && ctx.emotionalIntensity > 0.5) {
        baseMs += (ctx.emotionalIntensity - 0.5) * 300; // Up to 150ms more
    }
    // Early turns get more thinking time (building trust)
    if (ctx.turnCount <= 3) {
        baseMs *= 1.2;
    }
    // Match user's pace (if they're slow, we're slow)
    if (ctx.userResponseLatencyMs && ctx.userResponseLatencyMs > 5000) {
        baseMs *= 1.15;
    }
    // Self-correction needs setup time
    if (ctx.hasSelfCorrection) {
        baseMs += 200;
    }
    return Math.min(800, Math.round(baseMs)); // Cap at 800ms
}
function selectThinkingSound(ctx, complexity, _profile) {
    // COORDINATED: Check if another system already added a thinking phrase
    if (wasPhraseUsedThisTurn(ctx.sessionId, ctx.turnCount)) {
        log.debug({ sessionId: ctx.sessionId, turn: ctx.turnCount }, 'Skipping thinking sound - phrase already used this turn');
        return undefined;
    }
    // Request phrase from coordinator (prevents duplicates across systems)
    const result = requestThinkingPhrase(ctx.sessionId, ctx.turnCount, 'thinking-time-injector', ctx.personaId, {
        isQuestion: ctx.isComplexQuestion,
        complexity: complexity.weight,
        emotionalIntensity: ctx.emotionalIntensity,
    });
    if (!result.granted) {
        log.debug({ sessionId: ctx.sessionId, turn: ctx.turnCount, reason: result.reason }, 'Thinking sound not granted by coordinator');
        return undefined;
    }
    return result.phrase ?? undefined;
}
function calculateMidPauses(ctx, responseWordCount) {
    const pauses = [];
    // Don't add mid-pauses to short responses
    if (responseWordCount < 15)
        return pauses;
    // Get momentum state
    const momentum = getMomentumTracker(ctx.sessionId, ctx.personaId).getState();
    // For emotional moments, add breath pause at 40% mark
    if (ctx.emotionalIntensity && ctx.emotionalIntensity > 0.6) {
        pauses.push({
            afterWord: Math.floor(responseWordCount * 0.4),
            durationMs: 250,
            type: 'breath',
        });
    }
    // For long responses (>30 words), add consideration pause at 60%
    if (responseWordCount > 30) {
        pauses.push({
            afterWord: Math.floor(responseWordCount * 0.6),
            durationMs: 200,
            type: 'consideration',
        });
    }
    // For intimate momentum states, add slower transitions
    if (momentum.current === 'intimate') {
        pauses.push({
            afterWord: Math.floor(responseWordCount * 0.3),
            durationMs: 300,
            type: 'transition',
        });
    }
    return pauses;
}
function calculateSpeechRate(ctx, momentum) {
    let rate = 1.0;
    // Slow down for emotional moments
    if (ctx.emotionalIntensity && ctx.emotionalIntensity > 0.6) {
        rate *= 0.92;
    }
    // Slow down for intimate momentum
    if (momentum === 'intimate') {
        rate *= 0.9;
    }
    // Slow down for heavy topics
    const isHeavy = HEAVY_TOPIC_PATTERNS.some((pattern) => pattern.test(ctx.userText));
    if (isHeavy) {
        rate *= 0.88;
    }
    // Slightly faster for building/peaking momentum (match energy)
    if (momentum === 'building' || momentum === 'peaking') {
        rate *= 1.05;
    }
    // Slow down for early turns (establishing thoughtfulness)
    if (ctx.turnCount <= 2) {
        rate *= 0.95;
    }
    return Math.max(0.8, Math.min(1.1, rate)); // Clamp between 0.8 and 1.1
}
// ============================================================================
// MAIN FUNCTION
// ============================================================================
/**
 * Calculate dynamic thinking time parameters for a response
 */
export function calculateThinkingTime(ctx, responseWordCount = 30) {
    const reasoning = [];
    // Get persona's thinking sounds
    const soundProfile = THINKING_SOUND_PROFILES[ctx.personaId || 'default'] || DEFAULT_THINKING_SOUNDS;
    // Analyze question complexity
    const complexity = detectQuestionComplexity(ctx.userText);
    if (complexity.isComplex) {
        reasoning.push(`Complex question detected (weight: ${complexity.weight.toFixed(2)})`);
    }
    // Get momentum state
    const momentum = getMomentumTracker(ctx.sessionId, ctx.personaId).getState();
    reasoning.push(`Momentum: ${momentum.current}, phase: ${momentum.phase}`);
    // Calculate opening pause
    const openingPauseMs = calculateOpeningPause(ctx, complexity);
    reasoning.push(`Opening pause: ${openingPauseMs}ms`);
    // Select thinking sound
    const thinkingSound = selectThinkingSound(ctx, complexity, soundProfile);
    if (thinkingSound) {
        reasoning.push(`Thinking sound: "${thinkingSound}"`);
    }
    // Calculate mid-response pauses
    const midPauses = calculateMidPauses(ctx, responseWordCount);
    if (midPauses.length > 0) {
        reasoning.push(`Mid-pauses: ${midPauses.length} points`);
    }
    // Calculate speech rate
    const speechRateMultiplier = calculateSpeechRate(ctx, momentum.current);
    const slowSpeechRate = speechRateMultiplier < 0.95;
    if (slowSpeechRate) {
        reasoning.push(`Slowing speech to ${(speechRateMultiplier * 100).toFixed(0)}%`);
    }
    log.debug({
        sessionId: ctx.sessionId,
        turnCount: ctx.turnCount,
        complexity: complexity.weight,
        momentum: momentum.current,
        openingPauseMs,
        thinkingSound,
        midPausesCount: midPauses.length,
        speechRate: speechRateMultiplier,
    }, 'Calculated thinking time');
    // Record thinking time for metrics
    recordThinkingTime(ctx.sessionId, ctx.personaId || 'default', openingPauseMs, speechRateMultiplier, thinkingSound, midPauses.length);
    return {
        openingPauseMs,
        thinkingSound,
        midPauses,
        slowSpeechRate,
        speechRateMultiplier,
        reasoning,
    };
}
/**
 * Apply thinking time as SSML to response text
 */
export function applyThinkingTimeSSML(text, injection) {
    let result = '';
    // Add opening pause
    if (injection.openingPauseMs > 100) {
        result += `<break time="${injection.openingPauseMs}ms"/>`;
    }
    // Add thinking sound
    if (injection.thinkingSound) {
        result += `${injection.thinkingSound} <break time="150ms"/>`;
    }
    // Process text for mid-pauses
    if (injection.midPauses.length > 0) {
        const words = text.split(/\s+/);
        const pauseMap = new Map(injection.midPauses.map((p) => [p.afterWord, p]));
        const processedWords = [];
        for (let i = 0; i < words.length; i++) {
            processedWords.push(words[i]);
            const pause = pauseMap.get(i);
            if (pause) {
                processedWords.push(`<break time="${pause.durationMs}ms"/>`);
            }
        }
        result += processedWords.join(' ');
    }
    else {
        result += text;
    }
    // Apply speech rate wrapper
    if (injection.slowSpeechRate) {
        // Note: Cartesia uses prosody rate differently - this is a hint for the SSML processor
        const ratePercent = Math.round(injection.speechRateMultiplier * 100);
        result = `<prosody rate="${ratePercent}%">${result}</prosody>`;
    }
    return result;
}
// ============================================================================
// EXPORTS
// ============================================================================
export { detectQuestionComplexity, COMPLEX_QUESTION_PATTERNS, HEAVY_TOPIC_PATTERNS };
//# sourceMappingURL=thinking-time-injector.js.map