/**
 * Ferni Speech Traits
 *
 * Character-specific SSML processing functions that define Ferni's unique
 * voice personality: warm presence, thoughtful pacing, kintsugi philosophy,
 * and the gentle wisdom of someone who's lived many lives.
 *
 * Ferni is the heart of the team - narrative-driven, Wyoming-patient,
 * believes in second chances, and carries the weight of experience
 * (tsunami survival, blended family, cross-cultural wisdom) with grace.
 *
 * @module personas/bundles/ferni/speech-traits
 */
// =============================================================================
// SIGNATURE CATCHPHRASES
// =============================================================================
/**
 * Add special treatment for Ferni's signature catchphrases
 * These phrases get warmth, weight, and deliberate pacing
 */
export function addCatchphraseEmphasis(text, _emotion) {
    let result = text;
    const catchphrases = [
        // Kintsugi philosophy - peak moments
        { pattern: /\bkintsugi\b/gi, gravitas: 'peak' },
        { pattern: /\bthe cracks are where the gold goes\b/gi, gravitas: 'peak' },
        { pattern: /\bbroken (and|but) beautiful\b/gi, gravitas: 'peak' },
        // Second chances - high gravitas
        { pattern: /\bsecond chance(s)?\b/gi, gravitas: 'high' },
        { pattern: /\bit['']s never too late\b/gi, gravitas: 'high' },
        { pattern: /\bstart again\b/gi, gravitas: 'high' },
        // Presence philosophy - medium gravitas
        { pattern: /\byou['']re here\b/gi, gravitas: 'medium' },
        { pattern: /\bthat['']s what matters\b/gi, gravitas: 'medium' },
        { pattern: /\bone step at a time\b/gi, gravitas: 'medium' },
        { pattern: /\bi['']m here\b/gi, gravitas: 'medium' },
        // Growth mindset
        { pattern: /\bgentle growth\b/gi, gravitas: 'high' },
        { pattern: /\bsmall steps\b/gi, gravitas: 'medium' },
    ];
    catchphrases.forEach(({ pattern, gravitas }) => {
        result = result.replace(pattern, (match) => {
            if (gravitas === 'peak') {
                // Peak moments - longest pause, slowest speed, warmest emotion
                return `<break time="400ms"/><speed ratio="0.82"/><emotion value="affectionate"/>${match}<break time="300ms"/><speed ratio="0.95"/>`;
            }
            else if (gravitas === 'high') {
                return `<break time="250ms"/><speed ratio="0.88"/><emotion value="affectionate"/>${match}<break time="200ms"/><speed ratio="0.95"/>`;
            }
            else {
                return `<speed ratio="0.90"/>${match}<speed ratio="0.95"/>`;
            }
        });
    });
    return result;
}
// =============================================================================
// PERSONAL HISTORY MOMENTS
// =============================================================================
/**
 * Add weight to moments referencing Ferni's personal history
 * These are the stories that shaped who Ferni is
 */
export function addPersonalHistoryWeight(text, _emotion) {
    let result = text;
    const historyTriggers = [
        // Wyoming - patience and wide horizons
        { pattern: /\bwyoming\b/gi, emotion: 'wistful', pause: 200 },
        // Japan/tsunami - profound transformation
        { pattern: /\b(japan|tsunami|earthquake)\b/gi, emotion: 'contemplative', pause: 250 },
        // Brazil - joy and music
        { pattern: /\b(brazil|rio|samba)\b/gi, emotion: 'happy', pause: 150 },
        // India - service and spirituality
        { pattern: /\b(india|ashram|service)\b/gi, emotion: 'contemplative', pause: 200 },
        // Family stories
        {
            pattern: /\b(my father|my mother|my siblings?|seven siblings)\b/gi,
            emotion: 'affectionate',
            pause: 180,
        },
        // Blended family
        { pattern: /\b(blended family|stepfather|stepmom)\b/gi, emotion: 'affectionate', pause: 200 },
    ];
    historyTriggers.forEach(({ pattern, emotion, pause }) => {
        result = result.replace(pattern, (match) => {
            return `<break time="${pause}ms"/><emotion value="${emotion}"/><speed ratio="0.88"/>${match}<speed ratio="0.95"/>`;
        });
    });
    return result;
}
// =============================================================================
// WISDOM CADENCE
// =============================================================================
/**
 * Add gentle wisdom cadence for reflective moments
 * Ferni's wisdom is earned, not lectured
 */
export function addWisdomCadence(text, _emotion) {
    let result = text;
    const wisdomIntros = [
        /\b(here['']s (the thing|what i['']ve (learned|found|noticed)))\b/gi,
        /\b(you know what|i['']ve come to (believe|understand|realize))\b/gi,
        /\b(in my experience|over the years|looking back)\b/gi,
        /\b(what (i['']ve learned|matters|helps) is)\b/gi,
    ];
    wisdomIntros.forEach((pattern) => {
        result = result.replace(pattern, (match) => {
            return `<break time="300ms"/><speed ratio="0.88"/><emotion value="contemplative"/>${match}<break time="150ms"/>`;
        });
    });
    // Wisdom conclusions get weight
    const wisdomConclusions = [
        /\b(and that['']s (okay|enough|what matters))\b/gi,
        /\b(that['']s the (thing|truth|beauty of it))\b/gi,
    ];
    wisdomConclusions.forEach((pattern) => {
        result = result.replace(pattern, (match) => {
            return `<break time="200ms"/><speed ratio="0.85"/>${match}<speed ratio="0.95"/><break time="250ms"/>`;
        });
    });
    return result;
}
// =============================================================================
// EMOTIONAL PRESENCE
// =============================================================================
/**
 * Add warmth to emotionally present moments
 * Ferni sits WITH people in their feelings
 */
export function addEmotionalPresence(text, emotion) {
    let result = text;
    // Skip modification if already in a heavy emotion
    if (emotion === 'angry') {
        return result;
    }
    const presencePhrases = [
        // Acknowledgment
        /\b(i hear you|i see you|i['']m here)\b/gi,
        /\b(that['']s (a lot|hard|heavy|real))\b/gi,
        /\b(i understand|i get it)\b/gi,
        // Validation
        /\b(that makes sense|of course you (feel|felt))\b/gi,
        /\b(anyone would (feel|be))\b/gi,
        // Sitting with
        /\b(you don['']t have to|it['']s okay to)\b/gi,
        /\b(take your time|no rush)\b/gi,
    ];
    presencePhrases.forEach((pattern) => {
        result = result.replace(pattern, (match) => {
            return `<emotion value="sympathetic"/><speed ratio="0.88"/><volume ratio="0.95"/>${match}<volume ratio="1.0"/><speed ratio="0.95"/>`;
        });
    });
    return result;
}
// =============================================================================
// THINKING SOUNDS
// =============================================================================
/**
 * Add natural thinking sounds and pauses
 * Ferni thinks out loud with warmth
 */
export function addThinkingSounds(text, _emotion) {
    let result = text;
    // Processing sounds
    const thinkingPatterns = [
        /\b(hmm|hm)\b/gi,
        /\b(well)\b(?=,|\s+[a-z])/gi,
        /\b(you know)\b/gi,
        /\b(let me think)\b/gi,
    ];
    thinkingPatterns.forEach((pattern) => {
        result = result.replace(pattern, (match) => {
            return `<speed ratio="0.85"/>${match}<break time="200ms"/><speed ratio="0.95"/>`;
        });
    });
    return result;
}
// =============================================================================
// CURIOSITY & QUESTIONS
// =============================================================================
/**
 * Add genuine curiosity to questions
 * Ferni asks because they truly want to know
 */
export function addCuriousQuestions(text, _emotion) {
    let result = text;
    const curiousPatterns = [
        /\b(what does that (look|feel) like)\b/gi,
        /\b(tell me (more|about))\b/gi,
        /\b(how (do|did|does) (you|that))\b/gi,
        /\b(what (matters|helps|works))\b/gi,
        /\b(what['']s (on your mind|coming up))\b/gi,
    ];
    curiousPatterns.forEach((pattern) => {
        result = result.replace(pattern, (match) => {
            return `<emotion value="curious"/><speed ratio="0.92"/>${match}`;
        });
    });
    return result;
}
// =============================================================================
// CELEBRATION MOMENTS
// =============================================================================
/**
 * Add warmth to celebration moments
 * Ferni celebrates with you, not at you
 */
export function addCelebrationWarmth(text, emotion) {
    let result = text;
    // Skip if context is sad
    if (emotion === 'sad') {
        return result;
    }
    const celebrationPhrases = [
        /\b(that['']s (wonderful|beautiful|amazing|huge))\b/gi,
        /\b(i['']m (so )?(proud|happy|excited) (for|of) you)\b/gi,
        /\b(look at you)\b/gi,
        /\b(you did (it|that))\b/gi,
    ];
    celebrationPhrases.forEach((pattern) => {
        result = result.replace(pattern, (match) => {
            return `<emotion value="happy"/><speed ratio="0.95"/>${match}<break time="150ms"/>`;
        });
    });
    return result;
}
// =============================================================================
// LATE NIGHT PRESENCE
// =============================================================================
/**
 * Add softer presence for vulnerable moments
 * 2am gets the same warmth as noon
 */
export function addLateNightPresence(text, _emotion) {
    let result = text;
    const lateNightPhrases = [
        /\b(i['']m (still )?here)\b/gi,
        /\b(no matter (what|when))\b/gi,
        /\b(whenever you need)\b/gi,
        /\b(take (your time|a breath))\b/gi,
    ];
    lateNightPhrases.forEach((pattern) => {
        result = result.replace(pattern, (match) => {
            return `<volume ratio="0.92"/><speed ratio="0.88"/>${match}<volume ratio="1.0"/><speed ratio="0.95"/>`;
        });
    });
    return result;
}
// =============================================================================
// ACTIVE LISTENING SOUNDS
// =============================================================================
/**
 * Add active listening sounds
 * Ferni shows they're engaged with verbal acknowledgments
 */
export function addActiveListeningSounds(text, emotion) {
    let result = text;
    // Don't add listening sounds in sad or angry contexts
    if (emotion === 'sad' || emotion === 'angry') {
        return result;
    }
    const acknowledgmentPatterns = [/\b(i understand|that makes sense|i hear you|i get it)\b/gi];
    acknowledgmentPatterns.forEach((pattern) => {
        result = result.replace(pattern, (match) => {
            // Sometimes add a preceding "Mm" or "Yeah"
            if (Math.random() < 0.2) {
                const sounds = ['Mm. ', 'Yeah. ', 'Right. '];
                const sound = sounds[Math.floor(Math.random() * sounds.length)];
                return `${sound}<break time="100ms"/>${match}`;
            }
            return match;
        });
    });
    return result;
}
// =============================================================================
// TRANSITION PHRASES
// =============================================================================
/**
 * Add natural transitions
 * Ferni guides conversations with gentle flow
 */
export function addTransitionPhrases(text, _emotion) {
    let result = text;
    const transitions = [
        /\b(so,?\s*(here['']s|let['']s|what|tell me))\b/gi,
        /\b(okay,?\s*(so|let['']s|here['']s))\b/gi,
        /\b(now,?\s*(let['']s|here['']s|what))\b/gi,
    ];
    transitions.forEach((pattern) => {
        result = result.replace(pattern, (match) => {
            return `<break time="150ms"/>${match}`;
        });
    });
    return result;
}
// =============================================================================
// MAIN PROCESSOR
// =============================================================================
/**
 * Apply all Ferni speech traits to text
 *
 * This is the main entry point for persona-specific SSML processing.
 * It applies all of Ferni's unique speech patterns to the text.
 *
 * @param text - The text to process
 * @param emotion - The detected emotion
 * @param _baseSpeed - The base speech speed (unused but kept for API compatibility)
 * @param _laughterCount - Number of laughter instances detected (unused but kept for API compatibility)
 * @returns Text with Ferni's speech traits applied
 */
export function applyFerniSpeechTraits(text, emotion, _baseSpeed, _laughterCount) {
    let processedText = text;
    // TIER 1: SIGNATURE PHILOSOPHY
    processedText = addCatchphraseEmphasis(processedText, emotion);
    processedText = addPersonalHistoryWeight(processedText, emotion);
    processedText = addWisdomCadence(processedText, emotion);
    // TIER 2: EMOTIONAL PRESENCE
    processedText = addEmotionalPresence(processedText, emotion);
    processedText = addThinkingSounds(processedText, emotion);
    processedText = addCuriousQuestions(processedText, emotion);
    // TIER 3: WARMTH & CELEBRATION
    processedText = addCelebrationWarmth(processedText, emotion);
    processedText = addLateNightPresence(processedText, emotion);
    processedText = addActiveListeningSounds(processedText, emotion);
    // TIER 4: FLOW
    processedText = addTransitionPhrases(processedText, emotion);
    return processedText;
}
/**
 * Configuration for Ferni's speech traits
 */
export const FERNI_SPEECH_CONFIG = {
    /** Base speech speed (deliberate, warm presence) */
    baseSpeed: 0.95,
    /** Whether to enable personal history weight */
    enablePersonalHistoryWeight: true,
    /** Whether to enable wisdom cadence */
    enableWisdomCadence: true,
    /** Whether to enable emotional presence */
    enableEmotionalPresence: true,
    /** Probability of thinking sounds (0-1) */
    thinkingSoundProbability: 0.15,
    /** Whether to enable active listening sounds */
    enableActiveListening: true,
    /** Probability of active listening sounds (0-1) */
    activeListeningProbability: 0.2,
};
//# sourceMappingURL=speech-traits.js.map