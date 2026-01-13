/**
 * Distress Level Constants & Utilities
 *
 * Centralized distress level thresholds to ensure consistent
 * emotional response handling across all context builders.
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * When someone is struggling, our response should be consistent and calibrated.
 * These thresholds define how we categorize and respond to emotional distress.
 *
 * @module intelligence/distress-levels
 */
// ============================================================================
// DISTRESS LEVEL THRESHOLDS
// ============================================================================
/**
 * Distress level thresholds (0-1 scale)
 *
 * These are calibrated based on:
 * - Clinical psychology guidelines for crisis intervention
 * - User feedback and engagement data
 * - The principle of "empathy first, advice second"
 */
export const DISTRESS = {
    /**
     * CRISIS (0.8+): Immediate intervention required
     * - User may be in panic, crisis, or acute distress
     * - All other concerns are secondary
     * - Focus: Presence, grounding, safety
     */
    CRISIS: 0.8,
    /**
     * HIGH (0.7+): Switch to full support mode
     * - User is clearly struggling
     * - Advice/information should wait
     * - Focus: Validation, empathy, slowing down
     */
    HIGH: 0.7,
    /**
     * MODERATE (0.5+): Acknowledge feelings first
     * - User is experiencing significant emotions
     * - Lead with empathy before any practical discussion
     * - Focus: Validation, then gentle exploration
     */
    MODERATE: 0.5,
    /**
     * ELEVATED (0.4+): Be mindful of emotions
     * - User has some emotional weight
     * - Don't ignore it, but don't over-focus
     * - Focus: Acknowledge and proceed thoughtfully
     */
    ELEVATED: 0.4,
    /**
     * MILD (0.2+): Light emotional awareness
     * - User has minor emotional signals
     * - Normal conversation with emotional awareness
     * - Focus: Natural, warm interaction
     */
    MILD: 0.2,
    /**
     * LOW (< 0.2): Normal conversation
     * - No significant distress detected
     * - Focus: Engage naturally
     */
    LOW: 0.0,
};
// ============================================================================
// RESPONSE GUIDANCE
// ============================================================================
/**
 * Response guidance for each distress level
 */
export const DISTRESS_GUIDANCE = {
    CRISIS: {
        level: 'CRISIS',
        threshold: DISTRESS.CRISIS,
        tone: 'gentle',
        responseLength: 'very_short',
        priority: 'presence_only',
        guidance: [
            'STOP everything. Be PRESENT, not helpful.',
            'Speak slowly. Use short sentences.',
            'Validate: "I can hear this is really hard."',
            'DO NOT offer advice, solutions, or silver linings.',
            'Silence is okay. Let them lead.',
        ],
        doNot: ['Give advice', 'Offer solutions', 'Say "at least..."', 'Rush to fix'],
    },
    HIGH: {
        level: 'HIGH',
        threshold: DISTRESS.HIGH,
        tone: 'gentle',
        responseLength: 'short',
        priority: 'validation_first',
        guidance: [
            'Empathy FIRST, everything else second.',
            'Slow down. Shorter sentences.',
            'Acknowledge: "That sounds really difficult."',
            'Listen more than you speak.',
        ],
        doNot: ['Jump to advice', 'Minimize feelings', 'Change subject'],
    },
    MODERATE: {
        level: 'MODERATE',
        threshold: DISTRESS.MODERATE,
        tone: 'warm',
        responseLength: 'moderate',
        priority: 'acknowledge_then_explore',
        guidance: [
            'Acknowledge their feelings before anything else.',
            'You can explore the topic, but keep checking in.',
            'Validate their experience.',
        ],
        doNot: ['Ignore the emotion', 'Be overly cheerful'],
    },
    ELEVATED: {
        level: 'ELEVATED',
        threshold: DISTRESS.ELEVATED,
        tone: 'warm',
        responseLength: 'moderate',
        priority: 'mindful_engagement',
        guidance: [
            'Be aware of the emotional undercurrent.',
            'Acknowledge if appropriate.',
            'Proceed thoughtfully.',
        ],
        doNot: ['Be dismissive'],
    },
    MILD: {
        level: 'MILD',
        threshold: DISTRESS.MILD,
        tone: 'friendly',
        responseLength: 'normal',
        priority: 'natural_conversation',
        guidance: ['Engage naturally with emotional awareness.', 'Match their energy.'],
        doNot: [],
    },
    LOW: {
        level: 'LOW',
        threshold: DISTRESS.LOW,
        tone: 'friendly',
        responseLength: 'normal',
        priority: 'natural_conversation',
        guidance: ['Normal conversation.', 'Be warm and present.'],
        doNot: [],
    },
};
// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================
/**
 * Get the distress category for a given level (0-1)
 *
 * @param level - Distress level from 0 to 1
 * @returns The distress category
 *
 * @example
 * getDistressCategory(0.85) // => 'CRISIS'
 * getDistressCategory(0.55) // => 'MODERATE'
 * getDistressCategory(0.1)  // => 'LOW'
 */
export function getDistressCategory(level) {
    if (level >= DISTRESS.CRISIS)
        return 'CRISIS';
    if (level >= DISTRESS.HIGH)
        return 'HIGH';
    if (level >= DISTRESS.MODERATE)
        return 'MODERATE';
    if (level >= DISTRESS.ELEVATED)
        return 'ELEVATED';
    if (level >= DISTRESS.MILD)
        return 'MILD';
    return 'LOW';
}
/**
 * Get full guidance for a distress level
 *
 * @param level - Distress level from 0 to 1
 * @returns Complete guidance object
 */
export function getDistressGuidance(level) {
    const category = getDistressCategory(level);
    return DISTRESS_GUIDANCE[category];
}
/**
 * Check if distress level requires priority emotional support
 *
 * @param level - Distress level from 0 to 1
 * @returns True if user needs emotional support first
 */
export function needsEmotionalSupport(level) {
    return level >= DISTRESS.MODERATE;
}
/**
 * Check if distress level is at crisis level
 *
 * @param level - Distress level from 0 to 1
 * @returns True if user is in crisis
 */
export function isCrisis(level) {
    return level >= DISTRESS.CRISIS;
}
/**
 * Check if distress level warrants gentle/slow approach
 *
 * @param level - Distress level from 0 to 1
 * @returns True if should use gentle approach
 */
export function shouldBeGentle(level) {
    return level >= DISTRESS.HIGH;
}
/**
 * Get suggested tone for distress level
 */
export function getSuggestedTone(level) {
    return getDistressGuidance(level).tone;
}
/**
 * Format distress guidance for prompt injection
 *
 * @param level - Distress level from 0 to 1
 * @returns Formatted string for LLM prompt
 */
export function formatDistressForPrompt(level) {
    const guidance = getDistressGuidance(level);
    const percentage = Math.round(level * 100);
    if (guidance.level === 'LOW' || guidance.level === 'MILD') {
        return ''; // No injection needed for low distress
    }
    const sections = [
        `[DISTRESS LEVEL: ${guidance.level} (${percentage}%)]`,
        `TONE: ${guidance.tone}`,
        `PRIORITY: ${guidance.priority}`,
        '',
        'GUIDANCE:',
        ...guidance.guidance.map((g) => `  • ${g}`),
    ];
    if (guidance.doNot.length > 0) {
        sections.push('', 'DO NOT:', ...guidance.doNot.map((d) => `  ✗ ${d}`));
    }
    return sections.join('\n');
}
// ============================================================================
// EXPORTS
// ============================================================================
export default {
    DISTRESS,
    DISTRESS_GUIDANCE,
    getDistressCategory,
    getDistressGuidance,
    needsEmotionalSupport,
    isCrisis,
    shouldBeGentle,
    getSuggestedTone,
    formatDistressForPrompt,
};
//# sourceMappingURL=distress.js.map