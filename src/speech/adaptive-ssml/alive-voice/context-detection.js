/**
 * Context Detection Helpers
 *
 * Detects content context from text for applying appropriate voice features.
 *
 * @module speech/adaptive-ssml/alive-voice/context-detection
 */
// =============================================================================
// CONTEXT DETECTION
// =============================================================================
/**
 * Detect content context from text and existing context.
 */
export function detectContentContext(text, context) {
    // Detect good news patterns
    const isGoodNews = context.isGoodNews ??
        /\b(congratulations|amazing|wonderful|great news|so happy|excited|proud)\b/i.test(text);
    // Detect bad news patterns
    const isBadNews = context.isBadNews ??
        /\b(i'm sorry|that's hard|loss|grief|difficult|tough|struggling)\b/i.test(text);
    // Detect questions
    const isQuestion = context.isQuestion ?? text.includes('?');
    // Detect greetings
    const isGreeting = context.isGreeting ??
        /^(hey|hi|hello|good morning|good afternoon|good evening)/i.test(text.trim());
    // Detect topic weight
    let topicWeight = context.topicWeight || 'medium';
    if (!context.topicWeight) {
        const heavyPatterns = /\b(death|died|grief|loss|cancer|suicide|depression|anxiety|trauma|abuse|divorce|miscarriage)\b/i;
        const lightPatterns = /\b(fun|funny|joke|haha|lol|play|game|movie|music|weekend|vacation)\b/i;
        if (heavyPatterns.test(text)) {
            topicWeight = 'heavy';
        }
        else if (lightPatterns.test(text)) {
            topicWeight = 'light';
        }
    }
    return {
        ...context,
        isGoodNews,
        isBadNews,
        isQuestion,
        isGreeting,
        topicWeight,
    };
}
//# sourceMappingURL=context-detection.js.map