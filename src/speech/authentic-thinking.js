/**
 * Authentic Thinking Pauses
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Maps actual cognitive load to natural pauses, creating the experience
 * that Ferni is genuinely thinking:
 *
 * - Complex questions → longer thinking pause + "Hmm..." phrase
 * - Simple questions → quick response
 * - Emotional content → gentle pause + soft entry
 *
 * Key insight: Rather than fixed delays, we use question complexity
 * and conversation context to determine appropriate "thinking time".
 *
 * Humans don't respond instantly. We pause, consider, reflect.
 * These pauses aren't empty - they signal that we're truly engaged,
 * that your question deserves real thought.
 *
 * COORDINATION: This module uses ThinkingPhraseCoordinator to prevent
 * duplicate "good question" phrases from multiple systems.
 */
import { requestThinkingPhrase } from '../conversation/thinking-phrase-coordinator.js';
import { getLogger } from '../utils/safe-logger.js';
const log = getLogger();
// ============================================================================
// COMPLEXITY ANALYSIS
// ============================================================================
/**
 * Analyze question complexity based on linguistic features
 */
export function analyzeQuestionComplexity(userText) {
    let complexity = 0.3; // Base complexity
    const text = userText.toLowerCase();
    const wordCount = text.split(/\s+/).length;
    // =========================================================================
    // Deep/philosophical questions (high complexity)
    // =========================================================================
    const deepPatterns = [
        /what('s| is) the (meaning|point|purpose)/i,
        /why (do|does|should|would|am|is)/i,
        /how (do|should|can|would) (i|you|we)/i,
        /what (do you think|would you say|should i)/i,
        /(meaning|purpose) of (life|this|it all)/i,
        /is (it|this|that) (right|wrong|okay|normal)/i,
        /what if/i,
        /how do (i|you) (know|decide|choose)/i,
    ];
    if (deepPatterns.some((p) => p.test(text))) {
        complexity += 0.3;
    }
    // =========================================================================
    // Multi-part questions (higher complexity)
    // =========================================================================
    const questionMarks = (text.match(/\?/g) || []).length;
    if (questionMarks > 1) {
        complexity += 0.15 * Math.min(questionMarks - 1, 3);
    }
    // Questions with "and" or "or" (compound)
    if (/\?\s*(and|or|but)\s/i.test(text) || /(and|or|but).*\?/i.test(text)) {
        complexity += 0.1;
    }
    // =========================================================================
    // Long messages (more to process)
    // =========================================================================
    if (wordCount > 50)
        complexity += 0.1;
    if (wordCount > 100)
        complexity += 0.1;
    // =========================================================================
    // Advice-seeking (requires thoughtful response)
    // =========================================================================
    const advicePatterns = [
        /what (should|would|could) (i|you)/i,
        /any (advice|suggestions|recommendations)/i,
        /how (do|can|should) i (handle|deal|cope|manage)/i,
        /what('s| is) (your|the best) (take|advice|suggestion)/i,
    ];
    if (advicePatterns.some((p) => p.test(text))) {
        complexity += 0.2;
    }
    // =========================================================================
    // Simple/factual questions (lower complexity)
    // =========================================================================
    const simplePatterns = [
        /^(what|when|where|who) (is|was|are|were) /i,
        /^(can|could|will|would) you /i,
        /^(yes|no|yeah|nope|sure|okay)/i,
        /^(thanks|thank you|got it|understood)/i,
    ];
    if (simplePatterns.some((p) => p.test(text))) {
        complexity -= 0.2;
    }
    // =========================================================================
    // Very short messages (quick response)
    // =========================================================================
    if (wordCount < 5) {
        complexity -= 0.15;
    }
    return Math.max(0, Math.min(1, complexity));
}
// ============================================================================
// DEPRECATED: STATIC THINKING PHRASES
// ============================================================================
//
// These static thinking phrases have been replaced by LLM behavioral guidance.
// See: src/intelligence/context-builders/humanization/dynamic-speech-guidance.ts
//
// The new approach:
// - Silence is fine when thinking (don't announce "let me think")
// - Brief acknowledgments are okay but should vary naturally
// - The LLM generates contextual responses, not template phrases
//
// The phrase pools below are kept for backward compatibility but return
// empty strings. The LLM will handle natural pauses and speech.
// ============================================================================
/**
 * @deprecated REMOVED - LLM generates natural thinking behavior from guidance
 * Kept for backwards compatibility with tests - returns empty strings.
 */
const personaThinkingPhrases = {
    ferni: [''], // Empty - LLM decides naturally based on context
    'nayan-patel': [''],
    'peter-john': [''],
    'maya-santos': [''],
    'alex-chen': [''],
    'jordan-taylor': [''],
    default: [''],
};
/**
 * Get a thinking phrase for a persona.
 *
 * COORDINATED: Uses ThinkingPhraseCoordinator to prevent duplicate
 * "good question" phrases from multiple systems.
 */
function getThinkingPhrase(personaId, complexity, sessionId, turnCount) {
    // Only use thinking phrase for complex questions
    if (complexity < 0.5)
        return '';
    // If we have session info, use the coordinator (prevents duplicates)
    if (sessionId && turnCount !== undefined) {
        const result = requestThinkingPhrase(sessionId, turnCount, 'authentic-thinking', personaId, {
            isQuestion: true,
            complexity,
        });
        if (result.granted && result.phrase) {
            return result.phrase;
        }
        // Coordinator denied (another system already added a phrase)
        return '';
    }
    // Fallback for callers without session info (legacy compatibility)
    // Use lower probability since we can't coordinate
    const usePhrase = Math.random() < complexity * 0.4;
    if (!usePhrase)
        return '';
    const phrases = personaThinkingPhrases[personaId || 'default'] || personaThinkingPhrases.default;
    return phrases[Math.floor(Math.random() * phrases.length)];
}
// ============================================================================
// PAUSE CALCULATION
// ============================================================================
/**
 * Calculate authentic thinking pause based on context
 */
export function calculateThinkingPause(context) {
    const { questionComplexity, isEmotional, requiresLookup, turnCount, personaId, sessionId } = context;
    // Base pause (100-400ms depending on complexity)
    let pauseDurationMs = 100 + questionComplexity * 300;
    // Adjust for emotional content (longer, gentler pause)
    if (isEmotional) {
        pauseDurationMs += 150;
    }
    // Adjust for lookup requirement (simulated "searching" time)
    if (requiresLookup) {
        pauseDurationMs += 200;
    }
    // Early conversation = slightly longer pauses (still warming up)
    if (turnCount < 3) {
        pauseDurationMs *= 1.2;
    }
    // Cap at 800ms (anything longer feels unnatural)
    pauseDurationMs = Math.min(800, pauseDurationMs);
    // Get thinking phrase (coordinated to prevent duplicates)
    const thinkingPhrase = getThinkingPhrase(personaId, questionComplexity, sessionId, turnCount);
    // Soft entry for emotional content
    const softEntry = isEmotional && Math.random() < 0.4;
    // Speed adjustment (complex = slightly slower)
    const speedAdjustment = questionComplexity > 0.6 ? 0.95 : 1.0;
    log.debug({
        complexity: questionComplexity.toFixed(2),
        pauseMs: Math.round(pauseDurationMs),
        hasPhrase: !!thinkingPhrase,
        sessionId,
    }, 'Calculated thinking pause');
    return {
        thinkingPhrase,
        pauseDurationMs: Math.round(pauseDurationMs),
        softEntry,
        speedAdjustment,
    };
}
// ============================================================================
// SSML GENERATION
// ============================================================================
/**
 * Generate SSML for thinking pause
 */
export function generateThinkingSSML(pause) {
    const parts = [];
    // Opening pause
    if (pause.pauseDurationMs > 150) {
        parts.push(`<break time="${Math.round(pause.pauseDurationMs * 0.4)}ms"/>`);
    }
    // Thinking phrase
    if (pause.thinkingPhrase) {
        // Wrap in curious emotion for naturalness (Cartesia valid: angry, sad, surprised, curious, affectionate)
        parts.push(`<emotion value="curious">${pause.thinkingPhrase}</emotion>`);
        parts.push(`<break time="${Math.round(pause.pauseDurationMs * 0.3)}ms"/>`);
    }
    // Soft entry - removed "Well..." as it sounds like AI inner monologue
    // Just use a pause instead for a softer entry
    if (pause.softEntry && !pause.thinkingPhrase) {
        parts.push(`<break time="200ms"/>`);
    }
    return parts.join('');
}
/**
 * Wrap response with thinking pause SSML
 */
export function wrapWithThinkingPause(response, context) {
    const pause = calculateThinkingPause(context);
    // Skip if minimal pause needed
    if (pause.pauseDurationMs < 150 && !pause.thinkingPhrase) {
        return response;
    }
    const thinkingSSML = generateThinkingSSML(pause);
    // Don't double-add if response already starts with thinking
    if (response.trim().toLowerCase().startsWith('hmm') ||
        response.trim().toLowerCase().startsWith('well') ||
        response.trim().toLowerCase().startsWith('let me')) {
        return response;
    }
    return thinkingSSML + response;
}
// ============================================================================
// INTEGRATION HELPERS
// ============================================================================
/**
 * Create thinking context from conversation state
 */
export function createThinkingContext(userText, emotionIntensity, isQuestion, turnCount, personaId, sessionId) {
    return {
        userText,
        questionComplexity: isQuestion ? analyzeQuestionComplexity(userText) : 0.2,
        isEmotional: emotionIntensity > 0.6,
        requiresLookup: /\b(price|stock|weather|news|score|rate)\b/i.test(userText),
        turnCount,
        personaId,
        sessionId,
    };
}
export { personaThinkingPhrases, getThinkingPhrase };
//# sourceMappingURL=authentic-thinking.js.map