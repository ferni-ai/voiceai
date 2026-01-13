/**
 * Speech Context
 *
 * Provides context for adaptive SSML generation.
 * Tracks user speaking patterns and adapts agent speech accordingly.
 *
 * PERSONA-AWARE: Now incorporates per-persona speech characteristics
 * so each agent sounds distinctly different (pacing, pauses, energy).
 */
// ============================================================================
// WPM TRACKER
// ============================================================================
/**
 * Tracks user words per minute from transcriptions
 */
export class WPMTracker {
    samples = [];
    maxSamples = 10;
    /**
     * Add a speech sample
     */
    addSample(text, durationMs) {
        if (durationMs <= 0)
            return;
        const wordCount = text.split(/\s+/).filter((w) => w.length > 0).length;
        this.samples.push({ wordCount, durationMs });
        if (this.samples.length > this.maxSamples) {
            this.samples.shift();
        }
    }
    /**
     * Calculate average WPM
     */
    getAverageWPM() {
        if (this.samples.length === 0)
            return 150; // Default
        const totalWords = this.samples.reduce((sum, s) => sum + s.wordCount, 0);
        const totalMinutes = this.samples.reduce((sum, s) => sum + s.durationMs, 0) / 60000;
        if (totalMinutes === 0)
            return 150;
        return Math.round(totalWords / totalMinutes);
    }
    /**
     * Classify speaking pace
     */
    getSpeedCategory() {
        const wpm = this.getAverageWPM();
        if (wpm < 120)
            return 'slow';
        if (wpm > 180)
            return 'fast';
        return 'moderate';
    }
    /**
     * Clear samples
     */
    clear() {
        this.samples = [];
    }
}
// ============================================================================
// ENERGY DETECTOR
// ============================================================================
/**
 * Detect user energy level from text patterns (3-level for backward compat)
 */
export function detectEnergyLevel(text) {
    const extended = detectExtendedEnergyLevel(text);
    // Map 5-level to 3-level
    switch (extended) {
        case 'very_low':
        case 'low':
            return 'low';
        case 'high':
        case 'elevated':
            return 'high';
        default:
            return 'medium';
    }
}
/**
 * Detect user energy level from text patterns (5-level for humanization)
 */
export function detectExtendedEnergyLevel(text) {
    const lowerText = text.toLowerCase();
    // Very high energy indicators
    const veryHighEnergy = [
        /!{3,}/, // Multiple exclamation marks (3+)
        /\b(omg|oh my god|holy|wow|yes yes)\b/i,
        /\b(SO excited|absolutely amazing|incredible)\b/i,
    ];
    // High energy indicators
    const highEnergy = [
        /!{2,}/, // Multiple exclamation marks
        /\b(excited|amazing|awesome|incredible|fantastic|love|great)\b/i,
        /\b(can't wait|so happy|thrilled|pumped)\b/i,
    ];
    // Very low energy indicators
    const veryLowEnergy = [
        /\b(exhausted|drained|can't go on|give up|hopeless)\b/i,
        /\b(barely|struggling|too tired)\b/i,
        /^(yeah|mhm|ok|sure)\.?$/i, // Single word responses
    ];
    // Low energy indicators
    const lowEnergy = [
        /\b(tired|overwhelmed|down|sad|depressed)\b/i,
        /\b(don't want to|no energy)\b/i,
        /\.{3,}/, // Trailing ellipses
        /^(yeah|okay|fine|sure|whatever)\.?$/i, // Minimal responses
    ];
    let veryHighScore = 0;
    let highScore = 0;
    let lowScore = 0;
    let veryLowScore = 0;
    for (const pattern of veryHighEnergy) {
        if (pattern.test(text))
            veryHighScore++;
    }
    for (const pattern of highEnergy) {
        if (pattern.test(text))
            highScore++;
    }
    for (const pattern of lowEnergy) {
        if (pattern.test(lowerText))
            lowScore++;
    }
    for (const pattern of veryLowEnergy) {
        if (pattern.test(lowerText))
            veryLowScore++;
    }
    // Short responses suggest lower energy
    const wordCount = text.split(/\s+/).length;
    if (wordCount < 3) {
        veryLowScore += 0.5;
    }
    else if (wordCount < 5) {
        lowScore += 0.5;
    }
    // Long enthusiastic responses suggest higher energy
    if (wordCount > 20 && text.includes('!')) {
        highScore += 0.5;
    }
    if (wordCount > 30 && (text.match(/!/g) || []).length > 2) {
        veryHighScore += 0.5;
    }
    // Return appropriate energy level
    if (veryHighScore > 0)
        return 'high';
    if (highScore > lowScore + 1)
        return 'elevated';
    if (veryLowScore > 0)
        return 'very_low';
    if (lowScore > highScore + 1)
        return 'low';
    return 'neutral';
}
/**
 * Check if it's late night (11pm - 5am)
 */
export function isLateNightHours() {
    const hour = new Date().getHours();
    return hour >= 23 || hour < 5;
}
/**
 * Detect if user just laughed from their transcript
 */
export function detectUserLaughter(text) {
    const laughterPatterns = [
        /\b(haha|hahaha|lol|lmao|rofl)\b/i,
        /\b(that's funny|so funny|hilarious)\b/i,
        /😂|🤣|😆/,
        /\[laughing\]|\[laughter\]/i,
    ];
    return laughterPatterns.some((pattern) => pattern.test(text));
}
/**
 * Determine topic weight from emotion and topic
 */
export function determineTopicWeight(emotion, topics) {
    // Heavy topics
    const heavyTopics = [
        'grief',
        'loss',
        'death',
        'illness',
        'anxiety',
        'depression',
        'debt',
        'failure',
    ];
    const lightTopics = ['vacation', 'celebration', 'success', 'achievement', 'family', 'hobbies'];
    // Check emotion first
    if (emotion) {
        if (emotion.distressLevel > 0.6)
            return 'heavy';
        if (emotion.valence === 'negative' && emotion.intensity > 0.7)
            return 'heavy';
        if (emotion.valence === 'positive' && emotion.intensity > 0.7)
            return 'light';
    }
    // Check topics
    if (topics) {
        for (const topic of topics) {
            const lowerTopic = topic.toLowerCase();
            if (heavyTopics.some((t) => lowerTopic.includes(t)))
                return 'heavy';
            if (lightTopics.some((t) => lowerTopic.includes(t)))
                return 'light';
        }
    }
    return 'medium';
}
// ============================================================================
// DEFAULT SPEECH CHARACTERISTICS BY PERSONA TYPE
// ============================================================================
/**
 * Default speech characteristics for different persona archetypes.
 * Used when a persona doesn't define custom speechCharacteristics.
 */
export const DEFAULT_SPEECH_CHARACTERISTICS = {
    // Wise grandfather - measured, deliberate, contemplative
    measured: {
        baseSpeedMultiplier: 0.72,
        pauseMultiplier: 1.4,
        speedVariation: 0.08,
        thinkingSoundFrequency: 0.6,
        emphasisStyle: 'subtle',
        sentenceEndingStyle: 'falling',
        minimumEnergy: 0.75,
        maximumEnergy: 1.05,
    },
    // Energetic storyteller - fast, animated, dynamic
    energetic: {
        baseSpeedMultiplier: 1.02,
        pauseMultiplier: 0.75,
        speedVariation: 0.25,
        thinkingSoundFrequency: 0.15,
        emphasisStyle: 'pronounced',
        sentenceEndingStyle: 'rising',
        minimumEnergy: 0.95,
        maximumEnergy: 1.25,
    },
    // Warm conversationalist - natural, balanced, warm
    conversational: {
        baseSpeedMultiplier: 0.88,
        pauseMultiplier: 1.0,
        speedVariation: 0.15,
        thinkingSoundFrequency: 0.3,
        emphasisStyle: 'moderate',
        sentenceEndingStyle: 'natural',
        minimumEnergy: 0.85,
        maximumEnergy: 1.15,
    },
};
/**
 * Derive speech characteristics from persona energy level.
 * Falls back to this when speechCharacteristics isn't defined.
 */
export function deriveSpeechCharacteristicsFromEnergy(energy) {
    // energy is 0-1, where 0 = calm/measured, 1 = high energy
    if (energy <= 0.4) {
        return DEFAULT_SPEECH_CHARACTERISTICS['measured'];
    }
    else if (energy >= 0.8) {
        return DEFAULT_SPEECH_CHARACTERISTICS['energetic'];
    }
    else {
        return DEFAULT_SPEECH_CHARACTERISTICS['conversational'];
    }
}
// ============================================================================
// SPEECH CONTEXT BUILDER
// ============================================================================
/**
 * Build speech context from available information.
 *
 * PERSONA-AWARE: Now accepts optional speechCharacteristics to make
 * each persona sound distinctly different.
 */
export function buildSpeechContext(input) {
    // Get persona speech characteristics (or derive from energy, or use default)
    const personaSpeech = input.personaSpeech ??
        (input.personaEnergy !== undefined
            ? deriveSpeechCharacteristicsFromEnergy(input.personaEnergy)
            : DEFAULT_SPEECH_CHARACTERISTICS['conversational']);
    // Determine user energy (both 3-level and 5-level)
    const userEnergy = input.userText ? detectEnergyLevel(input.userText) : 'medium';
    const extendedUserEnergy = input.userText ? detectExtendedEnergyLevel(input.userText) : 'neutral';
    // Determine topic weight
    const topicWeight = determineTopicWeight(input.emotion, input.topics);
    // Calculate base speed from user WPM AND persona characteristics
    const userWPM = input.userWPM || 150;
    let baseSpeed;
    // Start with persona's base speed
    const personaBaseSpeed = personaSpeech.baseSpeedMultiplier;
    // Adjust for user's speaking pace (mirror within persona's range)
    if (userWPM < 120) {
        // Slow user - slow down but stay within persona's style
        baseSpeed = personaBaseSpeed * 0.92;
    }
    else if (userWPM < 150) {
        // Moderate user - slight adjustment
        baseSpeed = personaBaseSpeed * 0.96;
    }
    else if (userWPM < 180) {
        // Normal user - use persona's natural pace
        baseSpeed = personaBaseSpeed;
    }
    else {
        // Fast user - speed up but cap by persona's max energy
        const speedBoost = 1.0 + personaSpeech.speedVariation;
        baseSpeed = Math.min(personaBaseSpeed * speedBoost, personaSpeech.maximumEnergy);
    }
    // Adjust for conversation phase (but respect persona's style)
    const phase = input.phase || 'exploring';
    const phaseMultiplier = getPhaseSpeedMultiplier(phase, personaSpeech);
    baseSpeed *= phaseMultiplier;
    // Calculate energy multiplier (mirror user energy, constrained by persona)
    // FIX BUG #voice-19: Ensure energyMultiplier stays within safe bounds
    const ENERGY_MIN = 0.8;
    const ENERGY_MAX = 1.3;
    let energyMultiplier;
    switch (userEnergy) {
        case 'low':
            // Mirror low energy, but not below persona's minimum
            energyMultiplier = Math.max(0.92, personaSpeech.minimumEnergy / personaBaseSpeed);
            break;
        case 'high': {
            // Mirror high energy, but not above persona's maximum
            const highMultiplier = 1.0 + personaSpeech.speedVariation;
            energyMultiplier = Math.min(highMultiplier, personaSpeech.maximumEnergy / personaBaseSpeed);
            break;
        }
        default:
            energyMultiplier = 1.0;
    }
    // FIX BUG #voice-19: Final bounds check to prevent extreme values
    energyMultiplier = Math.max(ENERGY_MIN, Math.min(ENERGY_MAX, energyMultiplier));
    // Determine if laughter is appropriate
    const allowLaughter = topicWeight !== 'heavy' && phase !== 'supporting' && input.emotion?.valence !== 'negative';
    // Calculate pause multiplier (incorporate persona's base pause style)
    let { pauseMultiplier } = personaSpeech;
    if (topicWeight === 'heavy') {
        pauseMultiplier *= 1.25; // Add pauses for heavy topics
    }
    else if (phase === 'supporting') {
        pauseMultiplier *= 1.2; // Add pauses for support
    }
    else if (userEnergy === 'low') {
        pauseMultiplier *= 1.1; // Slightly longer pauses for low energy users
    }
    // Calculate emotion intensity for SSML (varies by persona emphasis style)
    let emotionIntensity;
    switch (personaSpeech.emphasisStyle) {
        case 'subtle':
            emotionIntensity = 0.6;
            break;
        case 'pronounced':
            emotionIntensity = 0.9;
            break;
        default:
            emotionIntensity = 0.75;
    }
    // Adjust for user emotional state
    if (input.emotion) {
        if (input.emotion.distressLevel > 0.5) {
            emotionIntensity *= 0.7; // Gentle when distressed
        }
        else if (input.emotion.valence === 'positive') {
            emotionIntensity = Math.min(1.0, emotionIntensity * 1.1);
        }
    }
    // Clamp base speed to reasonable bounds (but respect persona's range)
    const minSpeed = Math.max(0.65, personaSpeech.minimumEnergy * 0.7);
    const maxSpeed = Math.min(1.15, personaSpeech.maximumEnergy * 1.1);
    // Detect late night and user laughter
    const isLateNight = isLateNightHours();
    const userJustLaughed = input.userText ? detectUserLaughter(input.userText) : false;
    // Generate random seed for deterministic behavior selection
    const randomSeed = input.sessionId ? `${input.sessionId}-${input.turnCount || 0}` : undefined;
    return {
        userWPM,
        userEnergy,
        extendedUserEnergy,
        // Use explicitly passed userEmotion (tracked from user's speech) or fall back to current text emotion
        userEmotion: input.userEmotion || input.emotion?.primary || 'neutral',
        conversationPhase: phase,
        topicWeight,
        turnCount: input.turnCount || 0,
        baseSpeed: Math.max(minSpeed, Math.min(maxSpeed, baseSpeed)),
        energyMultiplier,
        allowLaughter,
        pauseMultiplier,
        emotionIntensity,
        isLateNight,
        userJustLaughed,
        randomSeed,
    };
}
/**
 * Get speed multiplier for conversation phase, respecting persona style.
 * Energetic personas slow down less during supportive phases.
 * Measured personas slow down more deliberately.
 */
function getPhaseSpeedMultiplier(phase, personaSpeech) {
    const isEnergetic = personaSpeech.baseSpeedMultiplier >= 0.95;
    const isMeasured = personaSpeech.baseSpeedMultiplier <= 0.75;
    switch (phase) {
        case 'greeting':
        case 'warming_up':
            // Measured personas don't need to slow more; energetic personas slow a bit
            return isEnergetic ? 0.92 : isMeasured ? 1.0 : 0.95;
        case 'supporting':
            // Everyone slows for emotional support, but proportionally
            return isEnergetic ? 0.88 : isMeasured ? 0.95 : 0.9;
        case 'advising':
            // Measured personas stay steady; energetic slow to be clear
            return isEnergetic ? 0.9 : isMeasured ? 1.0 : 0.95;
        case 'wrapping_up':
            // Warm and unhurried for all
            return isEnergetic ? 0.92 : isMeasured ? 0.98 : 0.95;
        default:
            return 1.0;
    }
}
// ============================================================================
// SESSION-SCOPED WPM TRACKING
// ============================================================================
/**
 * Session-scoped WPM tracker map.
 * FIX BUG #voice-11: Per-session tracking instead of global singleton.
 */
const sessionWPMTrackers = new Map();
/**
 * Get or create a WPM tracker for a specific session
 */
export function getSessionWPMTracker(sessionId) {
    let tracker = sessionWPMTrackers.get(sessionId);
    if (!tracker) {
        tracker = new WPMTracker();
        sessionWPMTrackers.set(sessionId, tracker);
    }
    return tracker;
}
/**
 * Reset and remove a session's WPM tracker (on session end)
 */
export function resetSessionWPMTracker(sessionId) {
    sessionWPMTrackers.delete(sessionId);
}
export default {
    buildSpeechContext,
    detectEnergyLevel,
    determineTopicWeight,
    isLateNightHours,
    detectUserLaughter,
    WPMTracker,
    getSessionWPMTracker,
    resetSessionWPMTracker,
};
//# sourceMappingURL=speech-context.js.map