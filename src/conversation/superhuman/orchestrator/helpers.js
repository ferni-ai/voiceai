/**
 * Superhuman Orchestrator Helpers
 *
 * Detection and assessment utilities.
 *
 * @module @ferni/superhuman/orchestrator/helpers
 */
import { countWordsRust, isTokenCountingAvailable } from '../../../memory/rust-accelerator.js';
const RUST_COUNTING_AVAILABLE = isTokenCountingAvailable();
/**
 * Assess topic weight
 */
export function assessTopicWeight(context) {
    const heavyPatterns = [
        /\b(death|died|cancer|terminal|divorce|abuse|trauma|suicide|depression|anxiety)\b/i,
        /\b(lost|fired|bankruptcy|foreclosure)\b/i,
    ];
    const lightPatterns = [
        /\b(haha|lol|fun|excited|happy|great|awesome)\b/i,
        /\b(vacation|weekend|party|celebrate)\b/i,
    ];
    if (heavyPatterns.some((p) => p.test(context.userMessage)))
        return 'heavy';
    if (lightPatterns.some((p) => p.test(context.userMessage)))
        return 'light';
    if (context.emotion === 'sadness' || context.emotion === 'fear')
        return 'heavy';
    if (context.emotion === 'joy')
        return 'light';
    return 'medium';
}
/**
 * Assess user energy level
 */
export function assessUserEnergy(message) {
    const highEnergy = /[!]{2,}|[A-Z]{3,}|\b(excited|amazing|awesome|incredible|YES)\b/i;
    const lowEnergy = /\b(tired|exhausted|drained|meh|whatever|fine)\b/i;
    if (highEnergy.test(message))
        return 'high';
    if (lowEnergy.test(message))
        return 'low';
    const wordCount = RUST_COUNTING_AVAILABLE
        ? countWordsRust(message)
        : message.split(/\s+/).length;
    if (wordCount < 5)
        return 'low';
    if (wordCount > 50)
        return 'high';
    return 'medium';
}
/**
 * Assess recent tone
 */
export function assessRecentTone(context) {
    const weight = assessTopicWeight(context);
    if (weight === 'heavy')
        return 'heavy';
    if (weight === 'light')
        return 'light';
    return 'neutral';
}
/**
 * Check for emotional content
 */
export function hasEmotionalContent(context) {
    const emotionalPatterns = [
        /\bi feel\b/i,
        /\b(scared|worried|anxious|stressed|sad|hurt|angry|frustrated|overwhelmed)\b/i,
        /\bhonestly\b/i,
        /\bthe truth is\b/i,
        /\bi('ve| have) never told anyone\b/i,
    ];
    return emotionalPatterns.some((p) => p.test(context.userMessage));
}
/**
 * Check for laughter
 */
export function hasLaughter(message) {
    return /\b(haha|lol|lmao|rofl)\b/i.test(message) || message.includes('😂');
}
/**
 * Detect personal growth
 */
export function detectGrowth(message) {
    const growthPatterns = [
        /\bi (finally|actually) (did|made|started|finished)/i,
        /\bi('?ve| have) (been|started|made progress)/i,
        /\bit('?s| is) getting (better|easier)/i,
        /\bi('?m| am) (proud|happy|excited) (of|about|that)/i,
        /\b(breakthrough|realized|figured out|understand now)/i,
        /\bi (overcame|conquered|beat|handled)/i,
        /\bused to .* but now/i,
        /\bfor the first time/i,
    ];
    return growthPatterns.some((p) => p.test(message));
}
/**
 * Detect breakthrough moments
 */
export function detectBreakthrough(message) {
    const breakthroughPatterns = [
        /\b(oh|wow|wait)[\s,!]+i (just|never|finally)/i,
        /\b(everything|it all) (makes sense|clicked)/i,
        /\bi (never|didn('?t| not)) (realized|thought|knew)/i,
        /\bthat('?s| is) (it|exactly|what)/i,
        /\bwow,? (i|that|you)/i,
        /\bi get it now/i,
        /\bthis changes everything/i,
        /\blightbulb moment/i,
    ];
    return breakthroughPatterns.some((p) => p.test(message));
}
/**
 * Detect resolution
 */
export function detectResolution(message) {
    const resolutionPatterns = [
        /\b(solved|fixed|resolved|handled|done|figured out)/i,
        /\bno longer (worried|stressed|anxious)/i,
        /\b(feel|feeling) (better|relieved|good) (about|now)/i,
        /\bthat('?s| is) (sorted|taken care of)/i,
        /\bworked out/i,
        /\bproblem solved/i,
    ];
    return resolutionPatterns.some((p) => p.test(message));
}
/**
 * Detect concerns
 */
export function detectConcerns(message) {
    const concernPatterns = [
        /\bi('?m| am) (worried|concerned|anxious|scared|stressed) (about|that)/i,
        /\bwhat if/i,
        /\bi('?m| am) afraid/i,
        /\bkeeps me (up|awake)/i,
        /\bcan('?t| not) stop (thinking|worrying)/i,
        /\bit('?s| is) (stressing|worrying|bothering) me/i,
    ];
    return concernPatterns.some((p) => p.test(message));
}
/**
 * Calculate energy level (0-1 scale)
 */
export function calculateEnergyLevel(message) {
    const energy = assessUserEnergy(message);
    switch (energy) {
        case 'high':
            return 0.8;
        case 'low':
            return 0.3;
        default:
            return 0.5;
    }
}
//# sourceMappingURL=helpers.js.map