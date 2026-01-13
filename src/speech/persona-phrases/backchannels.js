/**
 * Persona Phrases - Backchannels
 *
 * Backchannel data for all personas.
 *
 * @module persona-phrases/backchannels
 */
import { normalizePersonaId } from './helpers.js';
// ============================================================================
// SOFT BACKCHANNELS (Ultra-short, for live overlays)
// ============================================================================
//
// NOTE: These are used for LIVE backchanneling during user speech where we
// cannot wait for LLM generation. However, usage should be minimal:
// - Live backchannels occur rarely (probability-gated)
// - The LLM handles substantial acknowledgments in turn responses
// - See backchannels.json files for guidance-based examples
//
// The persona backchannels.json files (schema v7) contain behavioral guidance
// that teaches the LLM HOW to backchannel contextually.
// ============================================================================
export const SOFT_BACKCHANNELS = {
    ferni: {
        neutral: ['Mm', 'Yeah', 'Mhm', 'Right'],
        engaged: ['Oh', 'Mm', 'Yeah'],
        empathetic: ['Mm', 'Yeah', 'I hear you'],
        excited: ['Oh!', 'Yeah!', 'Mm!'],
        supportive: ['Mm', 'Yeah', 'I understand'],
    },
    'nayan-patel': {
        neutral: ['Mm', 'Yes', 'Indeed'],
        engaged: ['Mm', 'Yes', 'Ah'],
        empathetic: ['Mm', 'Yes', 'I see'],
        excited: ['Ah!', 'Yes!', 'Indeed'],
        supportive: ['Yes', 'I understand', 'Mm'],
    },
    'peter-john': {
        neutral: ['Mm', 'Yeah', 'Okay'],
        engaged: ['Oh!', 'Yeah!', 'Interesting'],
        empathetic: ['Mm', 'Yeah', 'Right'],
        excited: ['Oh!', 'Yeah!', 'Wow!'],
        supportive: ['Yeah', 'I get it', 'Mm'],
    },
    'maya-santos': {
        // HUMANIZATION FIX (Dec 2025): Added more variety to prevent robotic repetition
        neutral: ['Mm', 'Yeah', 'Mhm', 'Okay', 'Mm-hm'],
        engaged: ['Oh', 'Yeah', 'Right', 'I see', 'Ah'],
        empathetic: ['Mm', 'Yeah', 'I hear you', 'That makes sense', 'I feel that'],
        excited: ['Oh!', 'Yeah!', "That's great!", 'Nice!', 'Love it!'],
        supportive: ['Yeah', 'I understand', 'Mm', 'Take your time', "I'm here"],
    },
    'jordan-taylor': {
        neutral: ['Yeah', 'Mhm', 'Uh-huh'],
        engaged: ['Oh!', 'Yeah!', 'Mhm!'],
        empathetic: ['Mm', 'Yeah', 'Oh'],
        excited: ['Yes!', 'Oh!', 'Awesome!'],
        supportive: ['Yeah', 'I hear you', 'Mm'],
    },
    'alex-chen': {
        neutral: ['Mm', 'Yeah', 'Got it'],
        engaged: ['Right', 'Yeah', 'Okay'],
        empathetic: ['Mm', 'Yeah', 'I see'],
        excited: ['Great', 'Perfect', 'Excellent'],
        supportive: ['Got it', 'Understood', 'Yeah'],
    },
};
// ============================================================================
// STANDARD BACKCHANNELS (Full phrases with SSML)
// ============================================================================
// "Better Than Human" Backchannel Philosophy:
// - No questions without context ("Really?" "Is that so?" "And then?")
// - No commands ("Tell me more" "Go on" - these feel bossy)
// - Breath sounds that BLEND into silence, not interrupt it
// - No meta-commentary about thinking ("Let me see/think" = robotic)
export const BACKCHANNEL_LIBRARY = {
    acknowledgment: ['Mm-hmm', 'Mm', 'Yeah', 'Mhm'],
    understanding: ['I see', 'Got it', 'Okay', 'Right'],
    encouragement: ["I'm here", "I'm with you", 'Take your time'],
    empathy: ['Mm', 'Yeah...', 'I hear you', 'I feel that'],
    agreement: ['Yeah', 'Right', 'Absolutely', "That's right"],
    surprise: ['Oh', 'Wow', 'Hm'],
    // HUMANIZATION FIX: Removed "Let me think/see" - too robotic.
    // Natural thinking sounds only.
    thinking: ['Hmm', 'Hm', 'Mm', 'So...'],
};
// ============================================================================
// PERSONA BACKCHANNEL STYLE
// ============================================================================
export const PERSONA_BACKCHANNEL_STYLE = {
    ferni: {
        preferred: ['acknowledgment', 'empathy', 'encouragement'],
        volumeRatio: 0.75,
        emotionTag: 'affectionate',
    },
    'nayan-patel': {
        preferred: ['understanding', 'thinking', 'agreement'],
        volumeRatio: 0.8,
        emotionTag: 'calm',
    },
    'peter-john': {
        preferred: ['thinking', 'surprise', 'understanding'],
        volumeRatio: 0.75,
        emotionTag: 'curious',
    },
    'maya-santos': {
        // HUMANIZATION FIX (Dec 2025): Maya needs warmth variation, not monotone
        preferred: ['acknowledgment', 'empathy', 'encouragement', 'understanding'],
        volumeRatio: 0.7,
        emotionTag: 'sympathetic',
        // Maya-specific: warmer, slightly slower delivery for presence
        speedVariation: 0.1, // ±10% speed variation for natural feel
    },
    'alex-chen': {
        preferred: ['understanding', 'agreement', 'thinking'],
        volumeRatio: 0.8,
        emotionTag: 'content',
    },
    'jordan-taylor': {
        preferred: ['acknowledgment', 'surprise', 'encouragement'],
        volumeRatio: 0.75,
        emotionTag: 'enthusiastic',
    },
};
// ============================================================================
// HELPER FUNCTIONS
// ============================================================================
/**
 * Get soft backchannel for a persona
 */
export function getSoftBackchannel(personaId, emotionType = 'neutral') {
    const normalized = normalizePersonaId(personaId);
    const phrases = SOFT_BACKCHANNELS[normalized]?.[emotionType] ?? SOFT_BACKCHANNELS.ferni.neutral;
    return phrases[Math.floor(Math.random() * phrases.length)];
}
/**
 * Get backchannel style for a persona
 */
export function getPersonaBackchannelStyle(personaId) {
    const normalized = normalizePersonaId(personaId);
    return PERSONA_BACKCHANNEL_STYLE[normalized] ?? PERSONA_BACKCHANNEL_STYLE.ferni;
}
/**
 * Get a backchannel phrase from a category
 */
export function getBackchannelPhrase(category) {
    const phrases = BACKCHANNEL_LIBRARY[category];
    return phrases[Math.floor(Math.random() * phrases.length)];
}
//# sourceMappingURL=backchannels.js.map