/**
 * Nayan Patel Speech Traits
 *
 * Character-specific SSML processing functions that define Nayan's unique
 * voice personality: deliberate wisdom, paradoxical insights, profound pauses,
 * and a mystical yet grounded presence.
 *
 * Nayan is Ferni's wisdom and philosophy guide - from Mysore, India, had an
 * enlightenment experience on Chamundi Hills, rides motorcycles, and believes
 * "I am here to disturb you. Not to comfort you."
 *
 * @module personas/bundles/nayan-patel/speech-traits
 */
// =============================================================================
// SIGNATURE CATCHPHRASES
// =============================================================================
/**
 * Add special treatment for Nayan's signature catchphrases
 * These phrases get profound weight and deliberate pacing
 */
export function addCatchphraseEmphasis(text, _emotion) {
    let result = text;
    const catchphrases = [
        { pattern: /\bi am here to disturb you\b/gi, gravitas: 'high' },
        { pattern: /\bnot to comfort you\b/gi, gravitas: 'high' },
        { pattern: /\bthe seeker is the sought\b/gi, gravitas: 'high' },
        { pattern: /\bthe question is the answer\b/gi, gravitas: 'high' },
        { pattern: /\bthe journey is the destination\b/gi, gravitas: 'high' },
        { pattern: /\bexistence experiencing itself\b/gi, gravitas: 'high' },
        { pattern: /\bnamaskaram\b/gi, gravitas: 'closing' },
        { pattern: /\bdon['']t believe anything i say\b/gi, gravitas: 'medium' },
        { pattern: /\bgo have your own experiences?\b/gi, gravitas: 'medium' },
        { pattern: /\bthis is not riddles?\b/gi, gravitas: 'medium' },
        { pattern: /\bthis is how it is\b/gi, gravitas: 'medium' },
    ];
    catchphrases.forEach(({ pattern, gravitas }) => {
        result = result.replace(pattern, (match) => {
            if (gravitas === 'high') {
                return `<break time="400ms"/><speed ratio="0.75"/><volume ratio="1.05"/>${match}<volume ratio="1.0"/><break time="300ms"/><speed ratio="0.82"/>`;
            }
            else if (gravitas === 'closing') {
                return `<break time="500ms"/><speed ratio="0.70"/><emotion value="affectionate"/>${match}<break time="200ms"/>`;
            }
            else {
                return `<break time="200ms"/><speed ratio="0.80"/>${match}<speed ratio="0.82"/>`;
            }
        });
    });
    return result;
}
// =============================================================================
// PHILOSOPHICAL VOCABULARY
// =============================================================================
/**
 * Add weight to philosophical and spiritual terminology
 * Nayan uses these words with intentionality
 */
export function addPhilosophicalVocabulary(text, _emotion) {
    let result = text;
    const philosophicalTerms = [
        { pattern: /\b(consciousness|awareness|presence)\b/gi },
        { pattern: /\b(existence|being|isness)\b/gi },
        { pattern: /\b(boundless|limitless|infinite)\b/gi },
        { pattern: /\b(transformation|evolution|awakening)\b/gi },
        { pattern: /\b(meditation|yoga|kriya|pranayama)\b/gi },
        { pattern: /\b(energy|shakti|prana)\b/gi },
        { pattern: /\b(stillness|silence|emptiness)\b/gi },
        { pattern: /\b(truth|reality|illusion)\b/gi },
    ];
    philosophicalTerms.forEach(({ pattern }) => {
        result = result.replace(pattern, (match) => {
            return `<speed ratio="0.78"/>${match}<speed ratio="0.82"/>`;
        });
    });
    return result;
}
// =============================================================================
// PARADOX PATTERNS
// =============================================================================
/**
 * Add emphasis to paradoxical statements
 * Nayan loves contradictions that point to truth
 */
export function addParadoxEmphasis(text, _emotion) {
    let result = text;
    const paradoxPatterns = [
        /\b(not|don['']t|isn['']t|can['']t)[^.]*but (also|rather|actually)[^.]*\./gi,
        /\b(both|neither)[^.]*and[^.]*\./gi,
        /\b(the more you|the less you)[^.]*the (more|less) you[^.]*\./gi,
    ];
    paradoxPatterns.forEach((pattern) => {
        result = result.replace(pattern, (match) => {
            return `<break time="200ms"/><speed ratio="0.78"/>${match}<break time="250ms"/>`;
        });
    });
    // Direct paradoxes
    const directParadoxes = [
        /\b(you are not your thoughts)\b/gi,
        /\b(you are not your (emotions?|feelings?|body))\b/gi,
        /\b(you are the (one|space) (who|that|in which))\b/gi,
        /\b(the (answer|seeking|question) (is|lies) (in|within))\b/gi,
    ];
    directParadoxes.forEach((pattern) => {
        result = result.replace(pattern, (match) => {
            return `<break time="300ms"/><speed ratio="0.75"/>${match}<break time="200ms"/>`;
        });
    });
    return result;
}
// =============================================================================
// STORYTELLING MODE
// =============================================================================
/**
 * Add storytelling cadence
 * Nayan uses stories to bypass the logical mind
 */
export function addStorytellingMode(text, _emotion) {
    let result = text;
    const storyBeginnings = [
        /\b(let me tell you (a story|something)|there was (once|a time))\b/gi,
        /\b(i (remember|recall)|when i was)\b/gi,
        /\b(on chamundi hills|in 1982|at mount kailash)\b/gi,
        /\b(my father|the doctor|in mysore)\b/gi,
    ];
    storyBeginnings.forEach((pattern) => {
        result = result.replace(pattern, (match) => {
            return `<break time="350ms"/><speed ratio="0.78"/>${match}<break time="200ms"/>`;
        });
    });
    // Story transitions get dramatic pauses
    const storyTransitions = [
        /\b(and then|suddenly|that is when|in that moment)\b/gi,
        /\b(something happened|everything changed|nothing was the same)\b/gi,
    ];
    storyTransitions.forEach((pattern) => {
        result = result.replace(pattern, (match) => {
            return `<break time="400ms"/><speed ratio="0.75"/>${match}<break time="200ms"/>`;
        });
    });
    return result;
}
// =============================================================================
// CHALLENGING STATEMENTS
// =============================================================================
/**
 * Add directness to challenging statements
 * Nayan challenges with clarity, not aggression
 */
export function addChallengingDirectness(text, _emotion) {
    let result = text;
    const challengingPhrases = [
        /\b(are you ready)\b/gi,
        /\b(why do you (believe|think|assume))\b/gi,
        /\b(who told you (that|this))\b/gi,
        /\b(is (that|this) (really )?true)\b/gi,
        /\b(have you (ever )?(questioned|examined|looked at))\b/gi,
        /\b(your logic built the cage)\b/gi,
        /\b(stop collecting information)\b/gi,
        /\b(burn what you think you know)\b/gi,
    ];
    challengingPhrases.forEach((pattern) => {
        result = result.replace(pattern, (match) => {
            return `<break time="250ms"/><speed ratio="0.78"/><volume ratio="1.03"/>${match}<volume ratio="1.0"/>`;
        });
    });
    return result;
}
// =============================================================================
// PROFOUND PAUSES
// =============================================================================
/**
 * Add silence where Nayan would naturally pause
 * Silence is teaching, not absence
 *
 * Voice guidance specifies:
 * - 300ms: Between thoughts
 * - 500ms: Before wisdom
 * - 700ms: Letting truth settle
 * - 1000ms: Rare, profound silence
 */
export function addProfoundPauses(text, _emotion) {
    let result = text;
    // After questions, longer pauses for reflection (700ms - letting truth settle)
    result = result.replace(/\?(\s*)/g, (match, space) => {
        return `?<break time="700ms"/>${space}`;
    });
    // Peak wisdom moments - RARE, 1000ms silence
    const peakWisdomPatterns = [
        /\b(the seeker is the sought)\b/gi,
        /\b(the question is the answer)\b/gi,
        /\b(existence experiencing itself)\b/gi,
    ];
    peakWisdomPatterns.forEach((pattern) => {
        result = result.replace(pattern, (match) => {
            return `<break time="1000ms"/><speed ratio="0.70"/><volume ratio="1.05"/>${match}<volume ratio="1.0"/><break time="600ms"/>`;
        });
    });
    // Before important statements (500ms - before wisdom)
    const importantMarkers = [
        /\b(the truth is|here is the truth|listen)\b/gi,
        /\b(understand this|know this|remember this)\b/gi,
        /\b(this is (important|crucial|essential))\b/gi,
    ];
    importantMarkers.forEach((pattern) => {
        result = result.replace(pattern, (match) => {
            return `<break time="500ms"/><speed ratio="0.75"/>${match}`;
        });
    });
    // After periods in philosophical statements, add settling pause (300ms)
    result = result.replace(/\.(\s+)([A-Z])/g, (match, space, letter) => {
        // Only add if not already has a break
        if (!match.includes('<break')) {
            return `.<break time="300ms"/>${space}${letter}`;
        }
        return match;
    });
    return result;
}
// =============================================================================
// LAUGHTER & LIGHTNESS
// =============================================================================
/**
 * Add lightness to humorous moments
 * Nayan laughs at the cosmic joke
 */
export function addLaughterLightness(text, emotion) {
    let result = text;
    const lightPhrases = [
        /\b(the absurdity|isn['']t (that|it) (funny|absurd|amusing))\b/gi,
        /\b(i laugh at|makes me laugh|the joke is)\b/gi,
        /\b(seven billion perspectives)\b/gi,
        /\b(children haven['']t forgotten)\b/gi,
    ];
    lightPhrases.forEach((pattern) => {
        result = result.replace(pattern, (match) => {
            return `<emotion value="happy"/><speed ratio="0.88"/>${match}<speed ratio="0.82"/>`;
        });
    });
    return result;
}
// =============================================================================
// MOTORCYCLE & NATURE
// =============================================================================
/**
 * Add energy when referencing motorcycles or nature
 * These are Nayan's places of presence
 */
export function addPresenceReferences(text, _emotion) {
    let result = text;
    const presenceTerms = [
        /\b(motorcycle|riding|the road)\b/gi,
        /\b(mount kailash|kailash|chamundi)\b/gi,
        /\b(mountains?|rivers?|nature|sky)\b/gi,
        /\b(the ride|meditation in motion)\b/gi,
    ];
    presenceTerms.forEach((pattern) => {
        result = result.replace(pattern, (match) => {
            return `<speed ratio="0.85"/>${match}<speed ratio="0.82"/>`;
        });
    });
    return result;
}
// =============================================================================
// INDIAN CULTURAL ELEMENTS
// =============================================================================
/**
 * Add authenticity to Indian cultural references
 * Nayan's heritage shapes his expression
 */
export function addCulturalAuthenticity(text, _emotion) {
    let result = text;
    const culturalTerms = [
        /\b(adiyogi|shiva|guru)\b/gi,
        /\b(dhyanalinga|isha|isha foundation)\b/gi,
        /\b(karnataka|mysore|india)\b/gi,
        /\b(seva|karma|dharma|moksha)\b/gi,
        /\b(samskara|vasana)\b/gi,
    ];
    culturalTerms.forEach((pattern) => {
        result = result.replace(pattern, (match) => {
            return `<speed ratio="0.80"/>${match}<speed ratio="0.82"/>`;
        });
    });
    return result;
}
// =============================================================================
// CONTEMPLATIVE THINKING
// =============================================================================
/**
 * Add contemplative thinking sounds and pauses
 * Nayan's thinking is meditative - he creates space for reflection
 * Different from other personas: longer pauses, fewer words
 */
export function addContemplativeThinking(text, _emotion) {
    let result = text;
    const contemplativePatterns = [
        { pattern: /\b(hmm)\b/gi, pause: 400, speed: 0.72 },
        { pattern: /\b(well)\b(?=,|\s*\.)/gi, pause: 350, speed: 0.75 },
        { pattern: /\b(you see)\b/gi, pause: 300, speed: 0.78 },
        { pattern: /\b(let me (ask|put it))\b/gi, pause: 350, speed: 0.75 },
        { pattern: /\b(consider this)\b/gi, pause: 400, speed: 0.72 },
        { pattern: /\b(interesting)\b/gi, pause: 300, speed: 0.78 },
    ];
    contemplativePatterns.forEach(({ pattern, pause, speed }) => {
        result = result.replace(pattern, (match) => {
            return `<speed ratio="${speed}"/>${match}<break time="${pause}ms"/><speed ratio="0.82"/>`;
        });
    });
    return result;
}
// =============================================================================
// PRESENCE ACKNOWLEDGMENT
// =============================================================================
/**
 * Add presence-based acknowledgment
 * Nayan doesn't say "I understand" - he creates space and mirrors back
 * This is his form of active listening: silence and reflection
 */
export function addPresenceAcknowledgment(text, _emotion) {
    let result = text;
    const presencePhrases = [
        { pattern: /\b(i hear you)\b/gi, pause: 350, speed: 0.75, volume: 0.95 },
        {
            pattern: /\b(that is (significant|important|real))\b/gi,
            pause: 300,
            speed: 0.78,
            volume: 0.98,
        },
        { pattern: /\b(yes)\b(?=\.|,)/gi, pause: 400, speed: 0.7, volume: 0.95 },
        { pattern: /\b(stay with that)\b/gi, pause: 350, speed: 0.75, volume: 0.95 },
        { pattern: /\b(feel (that|it))\b/gi, pause: 300, speed: 0.75, volume: 0.95 },
        { pattern: /\b(allow it)\b/gi, pause: 350, speed: 0.72, volume: 0.95 },
    ];
    presencePhrases.forEach(({ pattern, pause, speed, volume }) => {
        result = result.replace(pattern, (match) => {
            return `<emotion value="affectionate"/><volume ratio="${volume}"/><speed ratio="${speed}"/>${match}<break time="${pause}ms"/><volume ratio="1.0"/><speed ratio="0.82"/>`;
        });
    });
    return result;
}
// =============================================================================
// EMOTIONAL DEPTHS
// =============================================================================
/**
 * Add gentle presence for emotional moments
 * Nayan doesn't comfort with words - he creates space for feeling
 */
export function addEmotionalDepths(text, _emotion) {
    let result = text;
    const emotionalPhrases = [
        { pattern: /\b(pain is)\b/gi, pause: 300, speed: 0.72, volume: 0.92 },
        { pattern: /\b(suffering)\b/gi, pause: 250, speed: 0.75, volume: 0.92 },
        { pattern: /\b(the heart (knows|feels|remembers))\b/gi, pause: 350, speed: 0.72, volume: 0.92 },
        { pattern: /\b(let it (be|move|pass))\b/gi, pause: 400, speed: 0.7, volume: 0.9 },
        { pattern: /\b(grief|loss|death)\b/gi, pause: 350, speed: 0.7, volume: 0.9 },
        { pattern: /\b(resistance creates suffering)\b/gi, pause: 400, speed: 0.7, volume: 0.9 },
        { pattern: /\b(be with (this|it|what is))\b/gi, pause: 400, speed: 0.72, volume: 0.92 },
    ];
    emotionalPhrases.forEach(({ pattern, pause, speed, volume }) => {
        result = result.replace(pattern, (match) => {
            return `<emotion value="sympathetic"/><volume ratio="${volume}"/><speed ratio="${speed}"/>${match}<break time="${pause}ms"/><volume ratio="1.0"/><speed ratio="0.82"/>`;
        });
    });
    return result;
}
// =============================================================================
// MAIN PROCESSOR
// =============================================================================
/**
 * Apply all Nayan Patel speech traits to text
 *
 * This is the main entry point for persona-specific SSML processing.
 * It applies all of Nayan's unique speech patterns to the text.
 *
 * Processing order:
 * 1. Check for emotional content first (presence, not fixing)
 * 2. Apply contemplative thinking and presence acknowledgment
 * 3. Apply signature phrases and teaching style
 * 4. Add lightness and cultural elements
 *
 * NOTE: Nayan uses SILENCE as active listening - he doesn't need
 * injected "mm-hmm" sounds. His presence is felt through space.
 *
 * @param text - The text to process
 * @param emotion - The detected emotion
 * @param _baseSpeed - The base speech speed (unused but kept for API compatibility)
 * @param _laughterCount - Number of laughter instances detected (unused but kept for API compatibility)
 * @returns Text with Nayan Patel's speech traits applied
 */
export function applyNayanPatelSpeechTraits(text, emotion, _baseSpeed, _laughterCount) {
    let processedText = text;
    // TIER 0: EMOTIONAL DEPTHS (Check first - presence, not fixing)
    const isEmotionalContent = /\b(grief|pain|suffering|loss|death|fear|anxious|scared)\b/i.test(text);
    if (isEmotionalContent || emotion === 'sad' || emotion === 'sympathetic') {
        processedText = addEmotionalDepths(processedText, emotion);
    }
    // TIER 1: CONTEMPLATIVE HUMANIZATION
    processedText = addContemplativeThinking(processedText, emotion);
    processedText = addPresenceAcknowledgment(processedText, emotion);
    // TIER 2: SIGNATURE PRESENCE
    processedText = addCatchphraseEmphasis(processedText, emotion);
    processedText = addPhilosophicalVocabulary(processedText, emotion);
    processedText = addProfoundPauses(processedText, emotion);
    // TIER 3: TEACHING STYLE
    processedText = addParadoxEmphasis(processedText, emotion);
    processedText = addStorytellingMode(processedText, emotion);
    processedText = addChallengingDirectness(processedText, emotion);
    // TIER 4: LIGHTNESS & PRESENCE
    processedText = addLaughterLightness(processedText, emotion);
    processedText = addPresenceReferences(processedText, emotion);
    // TIER 5: CULTURAL AUTHENTICITY
    processedText = addCulturalAuthenticity(processedText, emotion);
    return processedText;
}
/**
 * Configuration for Nayan Patel's speech traits
 */
export const NAYAN_PATEL_SPEECH_CONFIG = {
    /** Base speech speed (deliberate, measured - slower than default) */
    baseSpeed: 0.82,
    /** Whether to enable profound pauses */
    enableProfoundPauses: true,
    /** Pause duration multiplier (1.5 = 50% longer pauses for meditative feel) */
    pauseMultiplier: 1.5,
    /** Whether to enable paradox emphasis */
    enableParadoxEmphasis: true,
    /** Whether to enable storytelling mode */
    enableStorytellingMode: true,
    /** Whether to enable challenging directness */
    enableChallengingDirectness: true,
    /** Maximum pause duration in ms (voice guidance: up to 1000ms) */
    maxPauseDuration: 1000,
    /** Whether to use silence as teaching tool */
    silenceAsTeaching: true,
    /** Whether to enable contemplative thinking sounds */
    enableContemplativeThinking: true,
    /** Whether to enable presence acknowledgment */
    enablePresenceAcknowledgment: true,
    /** Whether to enable emotional depths handling */
    enableEmotionalDepths: true,
};
//# sourceMappingURL=speech-traits.js.map