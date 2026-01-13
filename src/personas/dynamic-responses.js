/**
 * Dynamic Response Generator
 *
 * CRITICAL FIX: Replaces static response lists with persona-trait-based generation.
 *
 * Problem solved: All personas had 80%+ identical backchannels, comfort phrases,
 * and thinking sounds because they shared the same static JSON files.
 *
 * This generator:
 * 1. Uses persona personality traits to vary responses
 * 2. Tracks what's been used to avoid repetition
 * 3. Generates contextually-appropriate variations
 * 4. Makes each persona sound distinctly different
 */
import { getLogger } from '../utils/safe-logger.js';
const log = getLogger();
// ============================================================================
// PERSONA VOICE PROFILES
// ============================================================================
/**
 * Extract voice traits from persona config
 */
export function extractVoiceTraits(persona) {
    const personality = (persona.personality || {});
    return {
        warmth: personality.warmth ?? 0.7,
        energy: personality.energy ?? 0.6,
        formality: 1 - (personality.directness ?? 0.5), // More direct = less formal
        humor: personality.humorLevel ?? 0.4,
        directness: personality.directness ?? 0.5,
    };
}
// ============================================================================
// RESPONSE VARIANTS BY TRAIT
// ============================================================================
/**
 * Backchannel variants with trait requirements
 */
const BACKCHANNEL_VARIANTS = {
    // NEUTRAL - "I'm listening"
    neutral: [
        // High warmth variants
        { text: 'Mm-hmm', minWarmth: 0.6 },
        { text: 'Yeah', minWarmth: 0.5 },
        { text: 'Mhm', minWarmth: 0.7 },
        // Low formality variants
        { text: 'Uh-huh', maxFormality: 0.4 },
        { text: 'Yup', maxFormality: 0.3 },
        { text: 'K', maxFormality: 0.2, minEnergy: 0.6 },
        // High formality variants
        { text: 'I see', minFormality: 0.5 },
        { text: 'Understood', minFormality: 0.7 },
        { text: 'Right', minFormality: 0.4 },
        // High energy variants
        { text: 'Got it!', minEnergy: 0.7 },
        { text: 'Okay!', minEnergy: 0.6 },
        // Low energy variants
        { text: 'Okay', maxEnergy: 0.5 },
        { text: 'Mm', maxEnergy: 0.4, minWarmth: 0.6 },
    ],
    // ENGAGED - "That's interesting"
    engaged: [
        // High warmth + energy
        { text: 'Oh!', minWarmth: 0.6, minEnergy: 0.5 },
        { text: 'Oh wow', minWarmth: 0.7, minEnergy: 0.6 },
        { text: 'No way!', minEnergy: 0.7, maxFormality: 0.4 },
        { text: 'Really?', minWarmth: 0.5 },
        { text: 'Interesting...', minFormality: 0.4 },
        // High formality
        { text: "That's fascinating", minFormality: 0.6 },
        { text: 'How interesting', minFormality: 0.5 },
        // Low formality + high energy
        { text: 'Wait, seriously?', maxFormality: 0.4, minEnergy: 0.6 },
        { text: 'Whoa', maxFormality: 0.3, minEnergy: 0.6 },
        { text: 'Huh!', minEnergy: 0.5 },
        // Warm + curious
        { text: 'Tell me more', minWarmth: 0.6 },
        { text: 'Go on...', minWarmth: 0.5, maxEnergy: 0.6 },
    ],
    // EMPATHETIC - "I hear you"
    empathetic: [
        // High warmth required
        { text: 'I hear you', minWarmth: 0.7 },
        { text: "That's hard", minWarmth: 0.6 },
        { text: 'I get it', minWarmth: 0.5 },
        { text: 'That sounds tough', minWarmth: 0.7 },
        { text: 'Of course', minWarmth: 0.6 },
        { text: 'I understand', minWarmth: 0.5, minFormality: 0.4 },
        // Very warm
        { text: 'Oh, honey', minWarmth: 0.9, maxFormality: 0.3 },
        { text: "I'm so sorry", minWarmth: 0.8 },
        { text: 'That must be really hard', minWarmth: 0.8 },
        // Warm + present
        { text: "I'm here", minWarmth: 0.7 },
        { text: 'Yeah...', minWarmth: 0.6 },
        { text: 'Mmm...', minWarmth: 0.7 },
    ],
    // THINKING - Processing sounds
    thinking: [
        // Universal
        { text: 'Hmm...' },
        { text: 'Let me think...' },
        { text: 'Well...' },
        // High formality
        { text: 'Let me consider that...', minFormality: 0.6 },
        { text: 'That makes me think...', minFormality: 0.4 },
        // Low formality + warm
        { text: 'Okay, so...', maxFormality: 0.5 },
        { text: 'Alright...', maxFormality: 0.4 },
        { text: 'You know...', minWarmth: 0.5, maxFormality: 0.4 },
        // High energy
        { text: 'Oh, let me think...', minEnergy: 0.6 },
        { text: 'Ooh, interesting...', minEnergy: 0.6, minWarmth: 0.6 },
        // Low energy + reflective
        { text: 'Hmm, let me sit with that...', maxEnergy: 0.5, minWarmth: 0.6 },
    ],
};
/**
 * Comfort phrase variants with trait requirements
 */
const COMFORT_VARIANTS = [
    // High warmth
    { text: 'I hear you. That sounds really hard.', minWarmth: 0.7 },
    { text: 'That takes a lot of courage to share.', minWarmth: 0.7 },
    { text: "You're not alone in this.", minWarmth: 0.8 },
    { text: 'Thank you for trusting me with that.', minWarmth: 0.8 },
    // Practical + warm
    { text: 'One step at a time.', minWarmth: 0.5, minDirectness: 0.5 },
    { text: "You're doing better than you think.", minWarmth: 0.6 },
    { text: "That's a lot to carry.", minWarmth: 0.6 },
    // Direct + supportive
    { text: "That's valid.", minDirectness: 0.6 },
    { text: "Makes sense you'd feel that way.", minDirectness: 0.5 },
    { text: 'Anyone would struggle with that.', minDirectness: 0.5, minWarmth: 0.5 },
    // Very warm + gentle
    { text: "Take your time. I'm here.", minWarmth: 0.8 },
    { text: "You don't have to have it all figured out.", minWarmth: 0.7 },
    { text: "It's okay to not be okay.", minWarmth: 0.8 },
    // Energetic + encouraging
    { text: 'Hey, you showed up. That counts.', minEnergy: 0.6, minWarmth: 0.6 },
    { text: "You've got this. Seriously.", minEnergy: 0.6, maxFormality: 0.4 },
];
/**
 * Acknowledgment variants
 */
const ACKNOWLEDGMENT_VARIANTS = [
    // Warm
    { text: 'I appreciate you sharing that.', minWarmth: 0.7 },
    { text: 'Thanks for telling me.', minWarmth: 0.6 },
    // Direct
    { text: 'Got it.', minDirectness: 0.6 },
    { text: 'Okay, I understand.', minDirectness: 0.5 },
    { text: 'Makes sense.', minDirectness: 0.6 },
    // Energetic
    { text: 'Oh, totally!', minEnergy: 0.7, maxFormality: 0.4 },
    { text: 'Yes, exactly!', minEnergy: 0.6 },
    // Formal
    { text: 'I understand completely.', minFormality: 0.6 },
    { text: 'Thank you for clarifying.', minFormality: 0.7 },
];
// ============================================================================
// SILENCE RESPONSE VARIANTS (for meaningful silence moments)
// ============================================================================
/**
 * Silence presence variants - "I'm here" energy
 */
const SILENCE_PRESENCE_VARIANTS = [
    // High warmth - very present
    { text: "I'm here. No rush.", minWarmth: 0.8 },
    { text: "Take your time. I'm not going anywhere.", minWarmth: 0.8 },
    { text: 'Still here with you.', minWarmth: 0.7 },
    { text: "I'm listening. Even to the silence.", minWarmth: 0.8 },
    // Warm + direct
    { text: "Whenever you're ready.", minWarmth: 0.6, minDirectness: 0.5 },
    { text: 'No rush.', minDirectness: 0.6, minWarmth: 0.5 },
    { text: "I'm here.", minWarmth: 0.6 },
    // Lower energy - contemplative
    { text: 'Take your time.', maxEnergy: 0.6, minWarmth: 0.6 },
    { text: 'Still here.', maxEnergy: 0.5, minWarmth: 0.5 },
    // Higher energy - encouraging
    { text: 'Take all the time you need!', minEnergy: 0.7, minWarmth: 0.7 },
    // Formal - professional presence
    { text: 'I am here. Take your time.', minFormality: 0.6, minWarmth: 0.5 },
    { text: 'No hurry.', minFormality: 0.5 },
];
/**
 * Silence question variants - thoughtful questions during silence
 */
const SILENCE_QUESTION_VARIANTS = [
    // Deep/reflective (low energy, high warmth)
    { text: "What's underneath that?", maxEnergy: 0.6, minWarmth: 0.6 },
    { text: 'What would it mean if this worked out?', minWarmth: 0.7 },
    { text: "What's the story you're telling yourself here?", minWarmth: 0.7 },
    // Direct questions
    { text: "What's on your mind?", minDirectness: 0.6 },
    { text: 'What are you thinking about?', minDirectness: 0.5 },
    { text: "What's blocking progress?", minDirectness: 0.7 },
    // Warm + curious
    { text: 'What are you feeling right now?', minWarmth: 0.7 },
    { text: "What's coming up for you?", minWarmth: 0.6 },
    // Energetic + encouraging
    { text: 'What are you looking forward to?', minEnergy: 0.6, minWarmth: 0.6 },
    { text: "What's exciting you?", minEnergy: 0.7 },
    // Philosophical (high formality)
    { text: 'What is the deeper truth here?', minFormality: 0.6 },
    { text: 'What does your intuition say?', minFormality: 0.5, minWarmth: 0.6 },
];
/**
 * Silence observation variants - gentle observations during silence
 */
const SILENCE_OBSERVATION_VARIANTS = [
    // Warm + reflective
    { text: 'The best conversations have long pauses.', minWarmth: 0.7 },
    { text: "Silence isn't awkward if you're comfortable with someone.", minWarmth: 0.7 },
    { text: 'Sometimes the good stuff lives in the quiet.', minWarmth: 0.7 },
    // Direct observations
    { text: 'Processing time is productive time.', minDirectness: 0.6 },
    { text: 'Room to think.', minDirectness: 0.6 },
    // Low energy - contemplative
    { text: 'Some things need space to breathe.', maxEnergy: 0.5, minWarmth: 0.6 },
    { text: 'The mind needs space to unfold.', maxEnergy: 0.5 },
    // Higher energy
    { text: "I love this part. The part where something's forming.", minEnergy: 0.7 },
    // Philosophical
    { text: 'In silence, we find what noise cannot reveal.', minFormality: 0.6 },
    { text: 'The best insights come when we stop seeking them.', minFormality: 0.6 },
];
// ============================================================================
// RESPONSE SELECTION
// ============================================================================
/**
 * Check if a variant matches the persona's traits
 */
function variantMatchesTraits(variant, traits) {
    if (variant.minWarmth !== undefined && traits.warmth < variant.minWarmth)
        return false;
    if (variant.maxWarmth !== undefined && traits.warmth > variant.maxWarmth)
        return false;
    if (variant.minEnergy !== undefined && traits.energy < variant.minEnergy)
        return false;
    if (variant.maxEnergy !== undefined && traits.energy > variant.maxEnergy)
        return false;
    if (variant.minFormality !== undefined && traits.formality < variant.minFormality)
        return false;
    if (variant.maxFormality !== undefined && traits.formality > variant.maxFormality)
        return false;
    return true;
}
/**
 * Get eligible variants for a persona
 */
function getEligibleVariants(variants, traits) {
    return variants.filter((v) => variantMatchesTraits(v, traits));
}
// ============================================================================
// USAGE TRACKING (avoid repetition)
// ============================================================================
// Session-scoped usage tracking
const usageTracking = new Map();
function getUsageKey(sessionId, category) {
    const key = `${sessionId}:${category}`;
    if (!usageTracking.has(key)) {
        usageTracking.set(key, new Map());
    }
    return usageTracking.get(key);
}
function trackUsage(sessionId, category, text) {
    const usage = getUsageKey(sessionId, category);
    usage.set(text, (usage.get(text) || 0) + 1);
}
function getUsageCount(sessionId, category, text) {
    const usage = getUsageKey(sessionId, category);
    return usage.get(text) || 0;
}
/**
 * Clear session usage tracking
 */
export function clearSessionUsage(sessionId) {
    for (const key of usageTracking.keys()) {
        if (key.startsWith(`${sessionId}:`)) {
            usageTracking.delete(key);
        }
    }
}
// ============================================================================
// PUBLIC API
// ============================================================================
/**
 * Get a dynamic backchannel for a persona
 */
export function getDynamicBackchannel(persona, sessionId, type = 'neutral') {
    const traits = extractVoiceTraits(persona);
    const variants = BACKCHANNEL_VARIANTS[type] || BACKCHANNEL_VARIANTS.neutral;
    const eligible = getEligibleVariants(variants, traits);
    if (eligible.length === 0) {
        log.warn({ personaId: persona.identity?.id, type }, 'No eligible backchannels');
        return 'Mm-hmm'; // Fallback
    }
    // Sort by least used
    const sorted = [...eligible].sort((a, b) => {
        const aUsage = getUsageCount(sessionId, `backchannel_${type}`, a.text);
        const bUsage = getUsageCount(sessionId, `backchannel_${type}`, b.text);
        return aUsage - bUsage;
    });
    // Pick from top 3 least used (with randomness)
    const topChoices = sorted.slice(0, Math.min(3, sorted.length));
    const selected = topChoices[Math.floor(Math.random() * topChoices.length)];
    trackUsage(sessionId, `backchannel_${type}`, selected.text);
    return selected.text;
}
/**
 * Get a dynamic comfort phrase for a persona
 */
export function getDynamicComfortPhrase(persona, sessionId) {
    const traits = extractVoiceTraits(persona);
    const eligible = getEligibleVariants(COMFORT_VARIANTS, traits);
    if (eligible.length === 0) {
        return 'I hear you.'; // Fallback
    }
    // Sort by least used
    const sorted = [...eligible].sort((a, b) => {
        const aUsage = getUsageCount(sessionId, 'comfort', a.text);
        const bUsage = getUsageCount(sessionId, 'comfort', b.text);
        return aUsage - bUsage;
    });
    const topChoices = sorted.slice(0, Math.min(3, sorted.length));
    const selected = topChoices[Math.floor(Math.random() * topChoices.length)];
    trackUsage(sessionId, 'comfort', selected.text);
    return selected.text;
}
/**
 * Get a dynamic acknowledgment for a persona
 */
export function getDynamicAcknowledgment(persona, sessionId) {
    const traits = extractVoiceTraits(persona);
    const eligible = getEligibleVariants(ACKNOWLEDGMENT_VARIANTS, traits);
    if (eligible.length === 0) {
        return 'Got it.'; // Fallback
    }
    const sorted = [...eligible].sort((a, b) => {
        const aUsage = getUsageCount(sessionId, 'acknowledgment', a.text);
        const bUsage = getUsageCount(sessionId, 'acknowledgment', b.text);
        return aUsage - bUsage;
    });
    const topChoices = sorted.slice(0, Math.min(3, sorted.length));
    const selected = topChoices[Math.floor(Math.random() * topChoices.length)];
    trackUsage(sessionId, 'acknowledgment', selected.text);
    return selected.text;
}
/**
 * Get a dynamic thinking sound for a persona
 */
export function getDynamicThinkingSound(persona, sessionId) {
    return getDynamicBackchannel(persona, sessionId, 'thinking');
}
// ============================================================================
// SILENCE RESPONSE API
// ============================================================================
/**
 * Get a dynamic silence presence phrase for a persona
 * Used when offering warm presence during silence
 */
export function getDynamicSilencePresence(persona, sessionId) {
    const traits = extractVoiceTraits(persona);
    const eligible = getEligibleVariants(SILENCE_PRESENCE_VARIANTS, traits);
    if (eligible.length === 0) {
        return "I'm here."; // Fallback
    }
    const sorted = [...eligible].sort((a, b) => {
        const aUsage = getUsageCount(sessionId, 'silence_presence', a.text);
        const bUsage = getUsageCount(sessionId, 'silence_presence', b.text);
        return aUsage - bUsage;
    });
    const topChoices = sorted.slice(0, Math.min(3, sorted.length));
    const selected = topChoices[Math.floor(Math.random() * topChoices.length)];
    trackUsage(sessionId, 'silence_presence', selected.text);
    return selected.text;
}
/**
 * Get a dynamic silence question for a persona
 * Used when asking a thoughtful question during silence
 */
export function getDynamicSilenceQuestion(persona, sessionId) {
    const traits = extractVoiceTraits(persona);
    const eligible = getEligibleVariants(SILENCE_QUESTION_VARIANTS, traits);
    if (eligible.length === 0) {
        return "What's on your mind?"; // Fallback
    }
    const sorted = [...eligible].sort((a, b) => {
        const aUsage = getUsageCount(sessionId, 'silence_question', a.text);
        const bUsage = getUsageCount(sessionId, 'silence_question', b.text);
        return aUsage - bUsage;
    });
    const topChoices = sorted.slice(0, Math.min(3, sorted.length));
    const selected = topChoices[Math.floor(Math.random() * topChoices.length)];
    trackUsage(sessionId, 'silence_question', selected.text);
    return selected.text;
}
/**
 * Get a dynamic silence observation for a persona
 * Used when sharing a gentle observation during silence
 */
export function getDynamicSilenceObservation(persona, sessionId) {
    const traits = extractVoiceTraits(persona);
    const eligible = getEligibleVariants(SILENCE_OBSERVATION_VARIANTS, traits);
    if (eligible.length === 0) {
        return 'The best conversations have long pauses.'; // Fallback
    }
    const sorted = [...eligible].sort((a, b) => {
        const aUsage = getUsageCount(sessionId, 'silence_observation', a.text);
        const bUsage = getUsageCount(sessionId, 'silence_observation', b.text);
        return aUsage - bUsage;
    });
    const topChoices = sorted.slice(0, Math.min(3, sorted.length));
    const selected = topChoices[Math.floor(Math.random() * topChoices.length)];
    trackUsage(sessionId, 'silence_observation', selected.text);
    return selected.text;
}
/**
 * Get silence response by persona ID (convenience function)
 */
export function getDynamicSilenceResponseByPersonaId(personaId, sessionId, type = 'presence') {
    const traits = PERSONA_TRAIT_PROFILES[personaId] || {
        warmth: 0.7,
        energy: 0.6,
        formality: 0.5,
        humor: 0.4,
        directness: 0.5,
    };
    const variants = type === 'presence'
        ? SILENCE_PRESENCE_VARIANTS
        : type === 'question'
            ? SILENCE_QUESTION_VARIANTS
            : SILENCE_OBSERVATION_VARIANTS;
    const eligible = getEligibleVariants(variants, traits);
    if (eligible.length === 0) {
        return type === 'presence'
            ? "I'm here."
            : type === 'question'
                ? "What's on your mind?"
                : 'The best conversations have long pauses.';
    }
    const sorted = [...eligible].sort((a, b) => {
        const aUsage = getUsageCount(sessionId, `silence_${type}`, a.text);
        const bUsage = getUsageCount(sessionId, `silence_${type}`, b.text);
        return aUsage - bUsage;
    });
    const topChoices = sorted.slice(0, Math.min(3, sorted.length));
    const selected = topChoices[Math.floor(Math.random() * topChoices.length)];
    trackUsage(sessionId, `silence_${type}`, selected.text);
    return selected.text;
}
// ============================================================================
// PERSONA-SPECIFIC OVERRIDES
// ============================================================================
/**
 * Persona-specific phrases that should ONLY come from that persona
 */
const PERSONA_EXCLUSIVE_PHRASES = {
    ferni: [
        'Second chances are sacred.',
        'Your net worth is not your self-worth.',
        "What would the version of you who's already figured this out say?",
        "Let's sit with that for a moment.",
    ],
    'maya-santos': [
        'Progress, not perfection.',
        'Small wins compound.',
        "You showed up. That's what matters.",
        'Tiny steps, massive results.',
    ],
    'peter-john': [
        'Know what you own!',
        "That's a ten-bagger waiting to happen.",
        'The story is everything.',
        'Research before you invest.',
    ],
    'nayan-patel': [
        'Stay the course.',
        'Time in the market beats timing the market.',
        'Cost matters.',
        "Don't just do something, stand there.",
    ],
    'alex-chen': [
        'Got it covered.',
        'Systems over intentions.',
        'Consider it handled.',
        'Let me take care of that.',
    ],
    'jordan-taylor': [
        'Life is celebration!',
        'Details matter.',
        "Let's make this memorable.",
        'Every milestone deserves a moment.',
    ],
};
/**
 * Get a persona-exclusive phrase (their signature lines)
 */
export function getPersonaExclusivePhrase(persona, sessionId) {
    const personaId = persona.identity?.id;
    if (!personaId)
        return null;
    const exclusives = PERSONA_EXCLUSIVE_PHRASES[personaId];
    if (!exclusives || exclusives.length === 0)
        return null;
    // Sort by least used
    const sorted = [...exclusives].sort((a, b) => {
        const aUsage = getUsageCount(sessionId, 'exclusive', a);
        const bUsage = getUsageCount(sessionId, 'exclusive', b);
        return aUsage - bUsage;
    });
    // Only return if not overused (max 2 times per session)
    const selected = sorted[0];
    if (getUsageCount(sessionId, 'exclusive', selected) >= 2) {
        return null;
    }
    trackUsage(sessionId, 'exclusive', selected);
    return selected;
}
// ============================================================================
// HELPER: Get responses by personaId (uses persona trait profiles)
// ============================================================================
/**
 * Persona trait profiles - defines personality characteristics for each persona
 * These are used to generate appropriate backchannels without async registry calls
 */
export const PERSONA_TRAIT_PROFILES = {
    ferni: { warmth: 0.85, energy: 0.5, formality: 0.4, humor: 0.5, directness: 0.4 },
    'maya-santos': { warmth: 0.9, energy: 0.75, formality: 0.3, humor: 0.6, directness: 0.5 },
    'alex-chen': { warmth: 0.7, energy: 0.65, formality: 0.6, humor: 0.4, directness: 0.7 },
    'peter-john': { warmth: 0.75, energy: 0.9, formality: 0.3, humor: 0.6, directness: 0.6 },
    'nayan-patel': { warmth: 0.7, energy: 0.4, formality: 0.7, humor: 0.3, directness: 0.5 },
    'jordan-taylor': { warmth: 0.85, energy: 0.85, formality: 0.3, humor: 0.7, directness: 0.5 },
};
/**
 * Get a dynamic backchannel using just personaId
 * This is the main entry point for integration with other systems
 */
export function getDynamicBackchannelByPersonaId(personaId, sessionId, type = 'neutral') {
    // Get traits for this persona, with fallback to balanced defaults
    const traits = PERSONA_TRAIT_PROFILES[personaId] || {
        warmth: 0.7,
        energy: 0.6,
        formality: 0.5,
        humor: 0.4,
        directness: 0.5,
    };
    // Get eligible variants based on traits
    const variants = BACKCHANNEL_VARIANTS[type] || BACKCHANNEL_VARIANTS.neutral;
    const eligible = getEligibleVariants(variants, traits);
    if (eligible.length === 0) {
        // Fallback based on type
        return type === 'empathetic' ? 'I hear you' : type === 'engaged' ? 'Oh?' : 'Mm-hmm';
    }
    // Sort by least used to avoid repetition
    const sorted = [...eligible].sort((a, b) => {
        const aUsage = getUsageCount(sessionId, `backchannel_${type}`, a.text);
        const bUsage = getUsageCount(sessionId, `backchannel_${type}`, b.text);
        return aUsage - bUsage;
    });
    // Pick from top 3 least used
    const topChoices = sorted.slice(0, Math.min(3, sorted.length));
    const selected = topChoices[Math.floor(Math.random() * topChoices.length)];
    trackUsage(sessionId, `backchannel_${type}`, selected.text);
    return selected.text;
}
/**
 * Map emotion/topic context to backchannel type
 */
export function mapContextToBackchannelType(context) {
    if (context.userJustSharedSomethingPersonal || context.topicSeriousness === 'emotional') {
        return 'empathetic';
    }
    if (context.topicSeriousness === 'serious') {
        return 'empathetic';
    }
    if (context.userEmotion === 'excited' || context.userEmotion === 'happy') {
        return 'engaged';
    }
    return 'neutral';
}
export { ACKNOWLEDGMENT_VARIANTS, BACKCHANNEL_VARIANTS, COMFORT_VARIANTS, PERSONA_EXCLUSIVE_PHRASES, SILENCE_OBSERVATION_VARIANTS, SILENCE_PRESENCE_VARIANTS, SILENCE_QUESTION_VARIANTS, };
//# sourceMappingURL=dynamic-responses.js.map