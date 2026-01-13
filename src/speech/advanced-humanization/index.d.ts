/**
 * Advanced Voice Humanization System
 *
 * Implements research-backed techniques to make Ferni's voice feel genuinely human:
 *
 * 1. **Expanded Emotions** - Uses Cartesia Sonic-3's full 50+ emotion palette
 * 2. **Natural Fillers** - Injects "um", "well", "you know" for spontaneity
 * 3. **Breath Group Pacing** - Natural pauses at phrase boundaries
 * 4. **Speech Rhythm Variation** - Prevents monotonous delivery
 *
 * @see docs/VOICE-HUMANIZATION-RESEARCH.md for research basis
 *
 * @module advanced-humanization
 */
export { ALL_CARTESIA_EMOTIONS, CARTESIA_EMOTIONS, DEFAULT_BREATH_CONFIG, DEFAULT_FILLER_CONFIG, DEFAULT_HUMANIZATION_OPTIONS, type BreathGroupConfig, type CartesiaEmotion, type EmotionContext, type FillerConfig, type HumanizationOptions, type RhythmVariation, } from './types.js';
export { getEmotionTransition, mapContextToEmotion } from './emotions.js';
export { FILLERS, injectNaturalFillers, PERSONA_FILLER_PREFERENCES, type FillerCategory, } from './fillers.js';
export { addBreathGroupPauses } from './breath-groups.js';
export { analyzeRhythm, applyRhythmVariations, hasSignificantVariation } from './rhythm.js';
export { humanizeText } from './pipeline.js';
export { applyContextualEmotion, applyPersonaVoiceFingerprint, getPersonaAppropriateEmotion, getRandomPersonaEmotion, isEmotionInPersonaRange, } from '../cartesia-expressiveness.js';
export { getEmotionProfile, PERSONA_EMOTION_PROFILES, type PersonaEmotionProfile, } from '../emotion-profiles.js';
import { addBreathGroupPauses } from './breath-groups.js';
import { applyContextualEmotion, applyPersonaVoiceFingerprint, getPersonaAppropriateEmotion, getRandomPersonaEmotion } from '../cartesia-expressiveness.js';
import { getEmotionProfile } from '../emotion-profiles.js';
import { getEmotionTransition, mapContextToEmotion } from './emotions.js';
import { injectNaturalFillers } from './fillers.js';
import { humanizeText } from './pipeline.js';
import { analyzeRhythm, applyRhythmVariations } from './rhythm.js';
declare const _default: {
    CARTESIA_EMOTIONS: {
        readonly positive: readonly ["happy", "excited", "enthusiastic", "elated", "euphoric", "triumphant", "content", "peaceful", "serene", "calm", "grateful", "affectionate", "trust", "sympathetic", "flirtatious"];
        readonly engagement: readonly ["curious", "amazed", "surprised", "anticipation", "mysterious", "joking", "comedic", "sarcastic", "ironic"];
        readonly negative: readonly ["sad", "dejected", "melancholic", "disappointed", "hurt", "angry", "mad", "outraged", "frustrated", "agitated", "threatened", "scared", "disgusted", "contempt", "envious"];
        readonly nuanced: readonly ["hesitant", "insecure", "confused", "resigned", "guilty", "bored", "tired", "rejected", "nostalgic", "wistful", "apologetic"];
    };
    ALL_CARTESIA_EMOTIONS: readonly ["happy", "excited", "enthusiastic", "elated", "euphoric", "triumphant", "content", "peaceful", "serene", "calm", "grateful", "affectionate", "trust", "sympathetic", "flirtatious", "curious", "amazed", "surprised", "anticipation", "mysterious", "joking", "comedic", "sarcastic", "ironic", "sad", "dejected", "melancholic", "disappointed", "hurt", "angry", "mad", "outraged", "frustrated", "agitated", "threatened", "scared", "disgusted", "contempt", "envious", "hesitant", "insecure", "confused", "resigned", "guilty", "bored", "tired", "rejected", "nostalgic", "wistful", "apologetic"];
    mapContextToEmotion: typeof mapContextToEmotion;
    getEmotionTransition: typeof getEmotionTransition;
    PERSONA_EMOTION_PROFILES: Record<string, import("../emotion-profiles.js").PersonaEmotionProfile>;
    getEmotionProfile: typeof getEmotionProfile;
    applyPersonaVoiceFingerprint: typeof applyPersonaVoiceFingerprint;
    applyContextualEmotion: typeof applyContextualEmotion;
    getPersonaAppropriateEmotion: typeof getPersonaAppropriateEmotion;
    getRandomPersonaEmotion: typeof getRandomPersonaEmotion;
    injectNaturalFillers: typeof injectNaturalFillers;
    addBreathGroupPauses: typeof addBreathGroupPauses;
    analyzeRhythm: typeof analyzeRhythm;
    applyRhythmVariations: typeof applyRhythmVariations;
    humanizeText: typeof humanizeText;
};
export default _default;
//# sourceMappingURL=index.d.ts.map