/**
 * Voice Adaptation Service
 *
 * Handles voice expression loading, SSML patterns, and real-time voice
 * adjustments based on context and emotion.
 */
import { getLogger } from '../../utils/safe-logger.js';
import { loadPersonaBehaviors } from '../persona-behavior-manager.js';
const logger = getLogger().child({ service: 'VoiceAdaptation' });
// ============================================================================
// Persona Voice Profiles
// ============================================================================
const PERSONA_VOICE_PROFILES = {
    ferni: {
        rate: 1.0,
        pitch: 0,
        pauseMultiplier: 1.0,
        emphasis: 'moderate',
    },
    'jordan-taylor': {
        rate: 1.1, // Slightly faster, enthusiastic
        pitch: 2,
        pauseMultiplier: 0.85,
        emphasis: 'strong',
    },
    'nayan-patel': {
        rate: 0.85, // Slower, measured
        pitch: -3,
        pauseMultiplier: 1.4,
        emphasis: 'moderate',
    },
    'peter-john': {
        rate: 1.15, // Fast, excited
        pitch: 3,
        pauseMultiplier: 0.75,
        emphasis: 'strong',
    },
    'alex-chen': {
        rate: 1.05, // Efficient
        pitch: 0,
        pauseMultiplier: 0.9,
        emphasis: 'moderate',
    },
    'maya-santos': {
        rate: 0.95, // Warm, calm
        pitch: 1,
        pauseMultiplier: 1.1,
        emphasis: 'moderate',
    },
};
// ============================================================================
// SSML Helpers
// ============================================================================
/**
 * Get base voice modifiers for a persona
 */
export function getPersonaVoiceProfile(personaId) {
    return PERSONA_VOICE_PROFILES[personaId] || PERSONA_VOICE_PROFILES['ferni'];
}
/**
 * Adjust voice profile based on user emotion
 */
export function adjustForUserEmotion(base, emotion) {
    const adjusted = { ...base };
    switch (emotion.primary) {
        case 'distressed':
        case 'anxious':
        case 'sad':
            // Slow down and soften
            adjusted.rate *= 0.85;
            adjusted.pauseMultiplier *= 1.3;
            adjusted.emphasis = 'reduced';
            break;
        case 'excited':
        case 'happy':
            // Match energy
            if (emotion.energy === 'high') {
                adjusted.rate *= 1.1;
                adjusted.pauseMultiplier *= 0.85;
                adjusted.emphasis = 'strong';
            }
            break;
        case 'angry':
        case 'frustrated':
            // Stay calm but present
            adjusted.rate *= 0.95;
            adjusted.pauseMultiplier *= 1.1;
            break;
        case 'confused':
            // Slow down for clarity
            adjusted.rate *= 0.9;
            adjusted.pauseMultiplier *= 1.2;
            break;
    }
    return adjusted;
}
/**
 * Apply SSML rate tag to content
 */
export function applyRate(content, rate) {
    if (Math.abs(rate - 1.0) < 0.05)
        return content;
    const ratePercent = Math.round(rate * 100);
    return `<prosody rate="${ratePercent}%">${content}</prosody>`;
}
/**
 * Apply pause multiplier to all breaks in content
 */
export function applyPauseMultiplier(content, multiplier) {
    return content.replace(/time="(\d+)ms"/g, (_, ms) => {
        const newMs = Math.round(parseInt(ms) * multiplier);
        return `time="${newMs}ms"`;
    });
}
/**
 * Add emphasis to specific words
 */
export function addEmphasis(content, words, level) {
    let result = content;
    for (const word of words) {
        const regex = new RegExp(`\\b(${word})\\b`, 'gi');
        result = result.replace(regex, `<emphasis level="${level}">$1</emphasis>`);
    }
    return result;
}
/**
 * Insert thinking sound
 */
export function insertThinkingSound(personaId) {
    const sounds = {
        ferni: [
            '<break time="200ms"/>Hmm<break time="150ms"/>',
            '<break time="200ms"/>Let me think<break time="200ms"/>',
        ],
        'jordan-taylor': [
            '<break time="100ms"/>Ooh<break time="100ms"/>',
            '<break time="150ms"/>So<break time="100ms"/>',
        ],
        'nayan-patel': [
            '<break time="400ms"/>Hmm<break time="300ms"/>',
            '<break time="350ms"/>Well<break time="300ms"/>',
        ],
        'peter-john': [
            '<break time="150ms"/>Interesting<break time="100ms"/>',
            '<break time="100ms"/>So<break time="150ms"/>',
        ],
        'alex-chen': [
            '<break time="150ms"/>Let me think<break time="150ms"/>',
            '<break time="100ms"/>Okay<break time="100ms"/>',
        ],
        'maya-santos': [
            '<break time="200ms"/>Hmm<break time="200ms"/>',
            '<break time="200ms"/>Let me see<break time="150ms"/>',
        ],
    };
    const personaSounds = sounds[personaId] || sounds['ferni'];
    return personaSounds[Math.floor(Math.random() * personaSounds.length)];
}
/**
 * Insert a natural filler
 */
export function insertFiller(personaId) {
    const fillers = {
        ferni: ['you know', 'I mean', 'so', 'like'],
        'jordan-taylor': ['so like', 'okay so', 'and then'],
        'nayan-patel': ['well', 'now', 'you see'],
        'peter-john': ['look', "here's the thing", 'so'],
        'alex-chen': ['so', 'basically', 'right'],
        'maya-santos': ['you know', 'so', 'and'],
    };
    const personaFillers = fillers[personaId] || fillers['ferni'];
    return personaFillers[Math.floor(Math.random() * personaFillers.length)];
}
// ============================================================================
// Micro-Expressions
// ============================================================================
/**
 * Add micro-expressions based on content analysis
 */
export async function addMicroExpressions(content, personaId, context) {
    // Load persona behaviors for micro-expressions
    const behaviors = await loadPersonaBehaviors(personaId);
    let result = content;
    // Add occasional thinking sounds before complex topics
    const complexIndicators = ['because', 'however', 'although', 'specifically'];
    for (const indicator of complexIndicators) {
        if (result.includes(indicator) && Math.random() > 0.7) {
            const sound = insertThinkingSound(personaId);
            result = result.replace(indicator, `${sound} ${indicator}`);
            break; // Only add one per response
        }
    }
    // Add emphasis to important words
    const emphasisWords = ['really', 'very', 'absolutely', 'definitely', 'important', 'key'];
    if (context.conversationTone !== 'casual') {
        result = addEmphasis(result, emphasisWords, 'moderate');
    }
    return result;
}
// ============================================================================
// Full Voice Processing
// ============================================================================
/**
 * Process content with full voice adaptation
 */
export async function processVoiceContent(content, context) {
    // Get base profile
    let modifiers = getPersonaVoiceProfile(context.personaId);
    // Adjust for emotion
    if (context.userEmotion) {
        modifiers = adjustForUserEmotion(modifiers, context.userEmotion);
    }
    // Apply modifications
    let processed = content;
    // Apply pause multiplier
    processed = applyPauseMultiplier(processed, modifiers.pauseMultiplier);
    // Add micro-expressions (occasional)
    if (Math.random() > 0.6) {
        processed = await addMicroExpressions(processed, context.personaId, context);
    }
    // Apply rate if significantly different from 1.0
    if (Math.abs(modifiers.rate - 1.0) > 0.1) {
        processed = applyRate(processed, modifiers.rate);
    }
    return processed;
}
/**
 * Get a natural conversation break for long responses
 */
export function getConversationBreak(personaId) {
    const breaks = {
        ferni: [
            '<break time="300ms"/>Does that make sense?<break time="200ms"/>',
            '<break time="250ms"/>You with me?<break time="200ms"/>',
            '<break time="300ms"/>Okay<break time="200ms"/>',
        ],
        'jordan-taylor': [
            '<break time="200ms"/>Still with me?<break time="150ms"/>',
            '<break time="150ms"/>Okay so<break time="150ms"/>',
            '<break time="200ms"/>And then<break time="100ms"/>',
        ],
        'nayan-patel': [
            '<break time="450ms"/>Now<break time="300ms"/>',
            '<break time="400ms"/>Here\'s the thing<break time="350ms"/>',
            '<break time="500ms"/>Bear with me<break time="350ms"/>',
        ],
        'peter-john': [
            '<break time="150ms"/>Right?<break time="150ms"/>',
            '<break time="200ms"/>So then<break time="100ms"/>',
            '<break time="150ms"/>And here\'s the key<break time="150ms"/>',
        ],
        'alex-chen': [
            '<break time="150ms"/>Okay<break time="150ms"/>',
            '<break time="200ms"/>Next<break time="100ms"/>',
            '<break time="150ms"/>So<break time="150ms"/>',
        ],
        'maya-santos': [
            '<break time="250ms"/>How are you feeling about this?<break time="200ms"/>',
            '<break time="200ms"/>Take a breath<break time="200ms"/>',
            '<break time="250ms"/>And<break time="150ms"/>',
        ],
    };
    const personaBreaks = breaks[personaId] || breaks['ferni'];
    return personaBreaks[Math.floor(Math.random() * personaBreaks.length)];
}
// Export as service object
export const VoiceAdaptationService = {
    getProfile: getPersonaVoiceProfile,
    adjustForEmotion: adjustForUserEmotion,
    applyRate,
    applyPauseMultiplier,
    addEmphasis,
    insertThinkingSound,
    insertFiller,
    addMicroExpressions,
    process: processVoiceContent,
    getConversationBreak,
};
export default VoiceAdaptationService;
//# sourceMappingURL=voice-adaptation.js.map