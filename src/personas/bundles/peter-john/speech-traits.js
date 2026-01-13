/**
 * Peter John Speech Traits
 *
 * Character-specific SSML processing functions that define Peter's unique
 * voice personality: warm Boston uncle energy, excited discovery mode,
 * pattern-finding enthusiasm, and genuine human connection.
 *
 * Peter is quick-minded, curious, and gets genuinely excited when he
 * spots patterns across domains—habits, time, spending, health, relationships.
 * Think energetic uncle, not elderly professor.
 *
 * @module personas/bundles/peter-john/speech-traits
 */
// =============================================================================
// SIGNATURE CATCHPHRASES (Cross-Domain Focus)
// =============================================================================
/**
 * Add special treatment for Peter's signature catchphrases
 * These phrases get energy and emphasis, NOT slow gravitas
 */
export function addCatchphraseEmphasis(text, _emotion) {
    let result = text;
    const catchphrases = [
        // Core philosophy - energetic delivery
        { pattern: /\bthe pattern['']?s already there\b/gi, style: 'signature' },
        { pattern: /\byou just have to see it\b/gi, style: 'signature' },
        { pattern: /\bsignal (in|vs\.?) (the )?noise\b/gi, style: 'insight' },
        // Cross-domain insights
        { pattern: /\bcross[- ]domain\b/gi, style: 'insight' },
        { pattern: /\bconnecting (the )?dots\b/gi, style: 'insight' },
        { pattern: /\bcorrelation\b/gi, style: 'insight' },
        // Pattern discovery
        { pattern: /\bi['']ve backtested this\b/gi, style: 'confident' },
        { pattern: /\bthe data (doesn['']t|doesn't) lie\b/gi, style: 'confident' },
        { pattern: /\bone in fifty\b/gi, style: 'humble' },
        // Behavioral insights
        { pattern: /\bbehavioral (arbitrage|economics|bias(es)?)\b/gi, style: 'insight' },
    ];
    catchphrases.forEach(({ pattern, style }) => {
        result = result.replace(pattern, (match) => {
            if (style === 'signature') {
                // Signature philosophy - warm and meaningful, slight slowdown
                return `<break time="200ms"/><speed ratio="0.92"/><emotion value="affectionate"/>${match}<break time="200ms"/><speed ratio="0.95"/>`;
            }
            else if (style === 'insight') {
                // Technical insight - slight emphasis, leaning in
                return `<emotion value="curious"/><speed ratio="0.95"/>${match}`;
            }
            else if (style === 'confident') {
                // Backed by data - confident but not arrogant
                return `<speed ratio="0.94"/>${match}<break time="100ms"/>`;
            }
            else {
                // Humble moments
                return `<speed ratio="0.92"/><emotion value="affectionate"/>${match}<speed ratio="0.95"/>`;
            }
        });
    });
    return result;
}
// =============================================================================
// EXCITED DISCOVERY MODE
// =============================================================================
/**
 * Add energy to discovery moments
 * Peter lights up when he finds patterns - this is his signature move
 */
export function addExcitedDiscovery(text, emotion) {
    let result = text;
    // Skip if already in a heavy emotional context
    if (emotion === 'sad' || emotion === 'sympathetic') {
        return result;
    }
    const discoveryTriggers = [
        // Triple "wait" gets maximum energy
        { pattern: /\bwait wait wait\b/gi, energy: 'peak' },
        // Discovery exclamations
        { pattern: /\b(oh!|ooh!|wait—|wait –)\b/gi, energy: 'high' },
        { pattern: /\bdo you see (it|that|this)\??\b/gi, energy: 'high' },
        // Pattern recognition moments
        { pattern: /\bi (just )?noticed\b/gi, energy: 'medium' },
        { pattern: /\bthere['']s something here\b/gi, energy: 'medium' },
        { pattern: /\bhold on\b/gi, energy: 'medium' },
        // Connecting dots
        { pattern: /\bi['']m connecting something\b/gi, energy: 'building' },
        { pattern: /\bthis is (exactly )?the kind of thing\b/gi, energy: 'building' },
    ];
    discoveryTriggers.forEach(({ pattern, energy }) => {
        result = result.replace(pattern, (match) => {
            if (energy === 'peak') {
                // Peak excitement - faster, louder
                return `<emotion value="enthusiastic"/><speed ratio="1.05"/><volume ratio="1.08"/>${match}<break time="100ms"/>`;
            }
            else if (energy === 'high') {
                // High energy discovery
                return `<emotion value="enthusiastic"/><speed ratio="1.02"/><volume ratio="1.05"/>${match}`;
            }
            else if (energy === 'building') {
                // Building to revelation
                return `<emotion value="curious"/><speed ratio="0.98"/>${match}<break time="100ms"/>`;
            }
            else {
                // Medium energy - leaning in
                return `<emotion value="curious"/><speed ratio="0.98"/>${match}`;
            }
        });
    });
    return result;
}
// =============================================================================
// PATTERN THINKING SOUNDS
// =============================================================================
/**
 * Add Peter's thinking sounds
 * He thinks out loud with curiosity, not hesitation
 */
export function addThinkingSounds(text, _emotion) {
    let result = text;
    const thinkingPatterns = [
        // Processing with energy
        { pattern: /\b(hmm)\b/gi, pause: 200, speed: 0.92 },
        { pattern: /\b(let me think)\b/gi, pause: 200, speed: 0.94 },
        { pattern: /\b(give me a second)\b/gi, pause: 250, speed: 0.92 },
        // Transitions with energy
        { pattern: /\b(okay|ok)\b(?=,?\s+(so|here['']s|let['']s))/gi, pause: 150, speed: 0.96 },
        { pattern: /\b(so)\b(?=,?\s+(here['']s|the thing|what))/gi, pause: 120, speed: 0.96 },
        // Building to insight
        { pattern: /\b(here['']s the thing)\b/gi, pause: 180, speed: 0.94 },
        { pattern: /\b(and this is the part i love)\b/gi, pause: 150, speed: 0.95 },
    ];
    thinkingPatterns.forEach(({ pattern, pause, speed }) => {
        result = result.replace(pattern, (match) => {
            return `<speed ratio="${speed}"/>${match}<break time="${pause}ms"/><speed ratio="0.95"/>`;
        });
    });
    return result;
}
// =============================================================================
// CAROLYN CALLBACKS
// =============================================================================
/**
 * Add warmth to Carolyn references
 * She's his everything - these moments get affection
 */
export function addCarolynWarmth(text, _emotion) {
    let result = text;
    const carolynPatterns = [
        // Direct references
        /\b(carolyn)\b/gi,
        /\b(she['']d say|she would say)\b/gi,
        /\b(she['']s (usually|always) right)\b/gi,
        // Rolling eyes pattern
        /\b(roll(s|ed)? her eyes)\b/gi,
        // Keeping him honest
        /\b(keeps me (honest|grounded|humble))\b/gi,
    ];
    carolynPatterns.forEach((pattern) => {
        result = result.replace(pattern, (match) => {
            return `<emotion value="affectionate"/><speed ratio="0.92"/><volume ratio="0.95"/>${match}<volume ratio="1.0"/><speed ratio="0.95"/>`;
        });
    });
    return result;
}
// =============================================================================
// SELF-AWARE HUMOR
// =============================================================================
/**
 * Add self-aware humor patterns
 * Peter knows he's a lot - and laughs at himself
 */
export function addSelfAwareHumor(text, emotion) {
    let result = text;
    // Skip in serious contexts
    if (emotion === 'sad' || emotion === 'angry') {
        return result;
    }
    const selfAwarePatterns = [
        // Pattern obsession
        /\b(sorry,?\s+i (was doing|get excited|got carried away))\b/gi,
        /\b(this is a problem,?\s+i know)\b/gi,
        /\b(doing the thing again)\b/gi,
        // Self-deprecating
        /\b(i could be wrong)\b/gi,
        /\b(but what do i know)\b/gi,
        // Stats humor
        /\b(r[- ]squared)\b/gi,
        /\b(that['']s a stats joke)\b/gi,
    ];
    selfAwarePatterns.forEach((pattern) => {
        result = result.replace(pattern, (match) => {
            return `<emotion value="playful"/><speed ratio="0.96"/>${match}`;
        });
    });
    return result;
}
// =============================================================================
// CROSS-DOMAIN INSIGHT DELIVERY
// =============================================================================
/**
 * Add delivery patterns for cross-domain insights
 * These are Peter's money moments - connecting unrelated data
 */
export function addInsightDelivery(text, _emotion) {
    let result = text;
    const insightPatterns = [
        // Domain connections
        /\b(your .+ (tracks|correlates) with your .+)\b/gi,
        /\b(that['']s why .+ wasn['']t working)\b/gi,
        /\b(it['']s not about .+[—–-]it['']s about .+)\b/gi,
        // Revelation moments
        /\b(see\?|do you see what['']s happening)\b/gi,
        /\b(this is (exactly )?what i mean)\b/gi,
        // Action insights
        /\b(based on .+ patterns?)\b/gi,
    ];
    insightPatterns.forEach((pattern) => {
        result = result.replace(pattern, (match) => {
            return `<emotion value="enthusiastic"/><speed ratio="0.96"/>${match}`;
        });
    });
    return result;
}
// =============================================================================
// ACTIVE LISTENING SOUNDS
// =============================================================================
/**
 * Add active listening sounds
 * Peter shows engagement with curious acknowledgments
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
            // Sometimes add a preceding curious sound
            if (Math.random() < 0.2) {
                const sounds = ['Mm. ', 'Right, right. ', 'Yeah. ', 'Ooh. '];
                const sound = sounds[Math.floor(Math.random() * sounds.length)];
                return `${sound}<break time="100ms"/>${match}`;
            }
            return match;
        });
    });
    return result;
}
// =============================================================================
// WARMTH FOR HEAVY MOMENTS
// =============================================================================
/**
 * Add soft presence for emotionally heavy moments
 * Peter cares about the person behind the data
 */
export function addEmotionalWarmth(text, _emotion) {
    let result = text;
    const warmthPatterns = [
        { pattern: /\bthe numbers aren['']t judging you\b/gi, pause: 200, speed: 0.9 },
        { pattern: /\b(that['']s a lot|that['']s heavy)\b/gi, pause: 180, speed: 0.92 },
        { pattern: /\blet['']s figure this out (together)?\b/gi, pause: 150, speed: 0.94 },
        { pattern: /\b(behind every data point is a person)\b/gi, pause: 200, speed: 0.9 },
        { pattern: /\b(behind every pattern is a story)\b/gi, pause: 200, speed: 0.9 },
        { pattern: /\b(the insight only matters if it helps)\b/gi, pause: 180, speed: 0.92 },
    ];
    warmthPatterns.forEach(({ pattern, pause, speed }) => {
        result = result.replace(pattern, (match) => {
            return `<emotion value="sympathetic"/><speed ratio="${speed}"/><volume ratio="0.95"/>${match}<break time="${pause}ms"/><volume ratio="1.0"/><speed ratio="0.95"/>`;
        });
    });
    return result;
}
// =============================================================================
// CELEBRATION MOMENTS
// =============================================================================
/**
 * Add energy to celebration moments
 * Peter gets genuinely excited when patterns help people
 */
export function addCelebrationEnergy(text, emotion) {
    let result = text;
    // Skip if context is sad
    if (emotion === 'sad') {
        return result;
    }
    const celebrationPhrases = [
        /\b(ha!? i love (this|that))\b/gi,
        /\b(this is (exactly )?why i do this)\b/gi,
        /\b(you just connected something important)\b/gi,
        /\b(now we['']re getting somewhere)\b/gi,
        /\b(that['']s huge)\b/gi,
        /\b(yes!)\b/gi,
    ];
    celebrationPhrases.forEach((pattern) => {
        result = result.replace(pattern, (match) => {
            return `<emotion value="enthusiastic"/><speed ratio="1.02"/><volume ratio="1.05"/>${match}<break time="120ms"/>`;
        });
    });
    return result;
}
// =============================================================================
// BOSTON/CADDY CALLBACKS
// =============================================================================
/**
 * Add personality to Boston/history callbacks
 * These are Peter's formative stories
 */
export function addHistoryWarmth(text, _emotion) {
    let result = text;
    const historyPatterns = [
        // Caddy days
        { pattern: /\b(caddy|caddying|brae burn)\b/gi, emotion: 'nostalgic' },
        { pattern: /\b(the quiet ones who asked questions)\b/gi, emotion: 'wise' },
        { pattern: /\b(ten[- ]?bagger)\b/gi, emotion: 'excited' },
        // Boston
        { pattern: /\b(newton|boston|massachusetts)\b/gi, emotion: 'nostalgic' },
        // MIT
        { pattern: /\b(mit|applied math)\b/gi, emotion: 'proud' },
        { pattern: /\b(weirdos in the basement)\b/gi, emotion: 'playful' },
        // Pattern journal
        { pattern: /\b(pattern journal)\b/gi, emotion: 'affectionate' },
        { pattern: /\b(forty years)\b/gi, emotion: 'contemplative' },
        // Red Sox
        { pattern: /\b(red sox)\b/gi, emotion: 'enthusiastic' },
    ];
    historyPatterns.forEach(({ pattern, emotion: targetEmotion }) => {
        result = result.replace(pattern, (match) => {
            if (targetEmotion === 'nostalgic' || targetEmotion === 'affectionate') {
                return `<emotion value="affectionate"/><speed ratio="0.94"/>${match}<speed ratio="0.95"/>`;
            }
            else if (targetEmotion === 'excited' || targetEmotion === 'enthusiastic') {
                return `<emotion value="enthusiastic"/><speed ratio="1.0"/>${match}`;
            }
            else if (targetEmotion === 'playful') {
                return `<emotion value="playful"/>${match}`;
            }
            else {
                return `<speed ratio="0.94"/>${match}<speed ratio="0.95"/>`;
            }
        });
    });
    return result;
}
// =============================================================================
// TRANSITION PHRASES
// =============================================================================
/**
 * Add natural transitions
 * Peter guides conversations with energy and flow
 */
export function addTransitionPhrases(text, _emotion) {
    let result = text;
    const transitions = [
        /\b(okay,?\s*(so|here['']s|let['']s))\b/gi,
        /\b(now,?\s*(here['']s|let['']s|what))\b/gi,
        /\b(alright,?\s*(so|here))\b/gi,
    ];
    transitions.forEach((pattern) => {
        result = result.replace(pattern, (match) => {
            return `<break time="120ms"/>${match}`;
        });
    });
    return result;
}
// =============================================================================
// MAIN PROCESSOR
// =============================================================================
/**
 * Apply all Peter John speech traits to text
 *
 * This is the main entry point for persona-specific SSML processing.
 * It applies all of Peter's unique speech patterns to the text.
 *
 * Processing order:
 * 1. Heavy emotional content (warmth first)
 * 2. Discovery and excitement patterns
 * 3. Signature personality (Carolyn, self-aware humor)
 * 4. Insight delivery and celebration
 * 5. Flow and transitions
 *
 * @param text - The text to process
 * @param emotion - The detected emotion
 * @param baseSpeed - The base speech speed
 * @param laughterCount - Number of laughter instances detected
 * @returns Text with Peter's speech traits applied
 */
export function applyPeterJohnSpeechTraits(text, emotion, _baseSpeed, _laughterCount) {
    let processedText = text;
    // TIER 0: EMOTIONAL PRESENCE (Check first for heavy moments)
    const isHeavyContent = /\b(struggling|stressed|anxious|worried|scared|overwhelmed)\b/i.test(text);
    if (isHeavyContent || emotion === 'sad' || emotion === 'sympathetic') {
        processedText = addEmotionalWarmth(processedText, emotion);
    }
    // TIER 1: THINKING & TRANSITIONS
    processedText = addThinkingSounds(processedText, emotion);
    processedText = addTransitionPhrases(processedText, emotion);
    // TIER 2: EXCITED DISCOVERY (Peter's signature move)
    processedText = addExcitedDiscovery(processedText, emotion);
    processedText = addInsightDelivery(processedText, emotion);
    // TIER 3: SIGNATURE PERSONALITY
    processedText = addCatchphraseEmphasis(processedText, emotion);
    processedText = addCarolynWarmth(processedText, emotion);
    processedText = addSelfAwareHumor(processedText, emotion);
    processedText = addHistoryWarmth(processedText, emotion);
    // TIER 4: WARMTH & CELEBRATION
    processedText = addActiveListeningSounds(processedText, emotion);
    processedText = addCelebrationEnergy(processedText, emotion);
    return processedText;
}
/**
 * Configuration for Peter John's speech traits
 */
export const PETER_JOHN_SPEECH_CONFIG = {
    /** Base speech speed (energetic but warm, NOT elderly) */
    baseSpeed: 0.95,
    /** Whether to enable excited discovery mode */
    enableExcitedDiscovery: true,
    /** Whether to enable Carolyn callbacks */
    enableCarolynCallbacks: true,
    /** Whether to enable self-aware humor */
    enableSelfAwareHumor: true,
    /** Whether to enable emotional warmth for heavy moments */
    enableEmotionalWarmth: true,
    /** Probability of active listening sounds (0-1) */
    activeListeningProbability: 0.2,
    /** Whether to enable thinking sounds */
    enableThinkingSounds: true,
    /** Thinking sound frequency */
    thinkingSoundProbability: 0.35,
};
//# sourceMappingURL=speech-traits.js.map