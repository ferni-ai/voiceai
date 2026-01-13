/**
 * First Turn Notice Generator
 *
 * Generates "I notice" moments for early turns that make the user feel
 * truly SEEN. These are the "They see me" moments that build trust.
 *
 * @module @ferni/conversation/deep-humanization/generators/first-turn-notice
 */
import { seededChance, seededPick } from '../../utils/rng.js';
import { HUMANIZATION_CONFIG } from '../../humanization-tuning.js';
import { detectHesitation } from '../../utils/detection.js';
// ============================================================================
// "I NOTICE" TEMPLATES
// ============================================================================
const NOTICING_HESITATION = [
    'I notice you hesitated there...',
    'Something tells me there is more to that...',
    'The way you said that... there is something behind it.',
    'I am picking up on something unspoken...',
    'There is a pause in what you are saying...',
];
const NOTICING_DEFLECTION = [
    'You said you are fine, but...',
    'I hear the words, but something feels different...',
    'You are being pretty quick to say that...',
    'That was a very short answer for a big question...',
    'You glossed over that pretty fast...',
];
const NOTICING_ENERGY = [
    'You sound different today...',
    'There is an energy to what you are saying...',
    'Something shifted just then...',
    'I can feel something in how you are talking...',
    'Your voice tells me more than your words...',
];
const NOTICING_PATTERNS = [
    'You have mentioned that before...',
    'That keeps coming up, does not it?',
    'I notice you often...',
    'There is a pattern here...',
    'This sounds familiar...',
];
// ============================================================================
// GENERATOR
// ============================================================================
/**
 * Generate a first-turn noticing moment
 */
export async function generateFirstTurnNotice(context, mood, signals) {
    // Only for early turns (first 5 turns of a conversation)
    if (context.turnCount > 5) {
        return null;
    }
    const probability = HUMANIZATION_CONFIG.probabilities.firstTurnNotice;
    if (!seededChance(`${Date.now()}:1`, probability)) {
        return null;
    }
    const hasHesitation = detectHesitation(context.userMessage);
    // Choose what to notice
    let notices;
    if (hasHesitation) {
        // User seems hesitant or deflecting
        const isDeflecting = /^(fine|okay|good|not bad|alright)\.?$/i.test(context.userMessage.trim());
        notices = isDeflecting ? NOTICING_DEFLECTION : NOTICING_HESITATION;
    }
    else if (context.sessionData?.patterns && context.sessionData.patterns.length > 0) {
        // User has mentioned this topic before
        notices = NOTICING_PATTERNS;
    }
    else if (mood.energy !== 0.75) {
        // Energy seems different from baseline
        notices = NOTICING_ENERGY;
    }
    else {
        // Default to hesitation notices (most versatile)
        notices = NOTICING_HESITATION;
    }
    const content = seededPick(`${Date.now()}:99`, notices) ?? notices[0];
    return {
        type: 'first_turn_notice',
        content,
        placement: 'prefix',
        probability,
        cooldownTurns: HUMANIZATION_CONFIG.cooldowns.firstTurnNotice,
    };
}
//# sourceMappingURL=first-turn-notice.js.map