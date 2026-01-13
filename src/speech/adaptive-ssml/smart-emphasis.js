/**
 * Smart Emphasis Module
 *
 * Adds natural speech emphasis using Cartesia-compatible SSML.
 *
 * IMPORTANT: Cartesia does NOT support <emphasis> or <prosody> tags!
 * Instead, we use micro-pauses and slight speed variations to create
 * natural emphasis on important words.
 *
 * Technique: A tiny pause before an important word + slight slowdown
 * creates the perception of emphasis without unsupported tags.
 *
 * @see https://docs.cartesia.ai/build-with-cartesia/sonic-3/ssml-tags
 */
import { getLogger } from '../../utils/safe-logger.js';
const log = getLogger();
// ============================================================================
// EMPHASIS PATTERNS (using Cartesia-compatible techniques)
// ============================================================================
/**
 * Words that benefit from a micro-pause before them
 */
const EMPHASIS_WORDS = new Set([
    // Affirmations
    'yes',
    'absolutely',
    'definitely',
    'exactly',
    // Contrasts
    'but',
    'however',
    'actually',
    // Importance markers
    'important',
    'really',
    'truly',
    // Emotional
    'proud',
    'brave',
    'strong',
    // Validation
    'valid',
    'okay',
    // Superlatives/absolutes
    'never',
    'always',
    'only',
    'best',
]);
/**
 * Phrases where we add a pause before the key word
 */
const EMPHASIS_PHRASE_PATTERNS = [
    { pattern: /\b(you can)\b/gi, pauseBefore: 'can' },
    { pattern: /\b(you will)\b/gi, pauseBefore: 'will' },
    { pattern: /\b(i'm here)\b/gi, pauseBefore: 'here' },
    { pattern: /\b(i hear you)\b/gi, pauseBefore: 'hear' },
    { pattern: /\b(that's okay)\b/gi, pauseBefore: 'okay' },
    { pattern: /\b(that takes courage)\b/gi, pauseBefore: 'courage' },
    { pattern: /\b(that takes strength)\b/gi, pauseBefore: 'strength' },
];
/**
 * Apply smart emphasis using Cartesia-compatible micro-pauses.
 *
 * Instead of unsupported <emphasis> tags, we add subtle pauses
 * before important words, which creates natural speech emphasis.
 *
 * @param text - The response text (may already have SSML tags)
 * @param options - Emphasis options
 * @returns Text with micro-pauses for emphasis
 */
export function applySmartEmphasis(text, options = {}) {
    const { maxEmphasis = 2, userName, skipIfHasManyBreaks = true } = options;
    // Skip if already has many breaks (don't over-pause)
    if (skipIfHasManyBreaks) {
        const breakCount = (text.match(/<break/g) || []).length;
        if (breakCount >= 4) {
            return text;
        }
    }
    // Don't add emphasis to very short responses
    const wordCount = text.split(/\s+/).length;
    if (wordCount < 6) {
        return text;
    }
    let result = text;
    let emphasisCount = 0;
    // 1. Add micro-pause before user's name (most personal!)
    if (userName && emphasisCount < maxEmphasis) {
        const nameRegex = new RegExp(`\\b(${escapeRegex(userName)})\\b`, 'gi');
        if (nameRegex.test(result) && !result.includes(`<break time`)) {
            // Only add pause before first occurrence
            let replaced = false;
            result = result.replace(nameRegex, (match) => {
                if (replaced)
                    return match;
                replaced = true;
                emphasisCount++;
                return `<break time="80ms"/>${match}`;
            });
            log.debug({ userName }, 'Added emphasis pause before user name');
        }
    }
    // 2. Apply phrase-level emphasis patterns
    for (const { pattern, pauseBefore } of EMPHASIS_PHRASE_PATTERNS) {
        if (emphasisCount >= maxEmphasis)
            break;
        if (pattern.test(result)) {
            // Add micro-pause before the key word in the phrase
            const pauseRegex = new RegExp(`\\b(${pauseBefore})\\b`, 'gi');
            let replaced = false;
            result = result.replace(pauseRegex, (match) => {
                if (replaced || emphasisCount >= maxEmphasis)
                    return match;
                replaced = true;
                emphasisCount++;
                return `<break time="60ms"/>${match}`;
            });
        }
    }
    // 3. Add micro-pauses before key emphasis words (sparingly)
    if (emphasisCount < maxEmphasis) {
        for (const word of EMPHASIS_WORDS) {
            if (emphasisCount >= maxEmphasis)
                break;
            const regex = new RegExp(`\\s(${word})\\b`, 'gi');
            if (regex.test(result)) {
                // Only emphasize first occurrence, avoid double-pausing
                let replaced = false;
                result = result.replace(regex, (match, capturedWord) => {
                    if (replaced || emphasisCount >= maxEmphasis)
                        return match;
                    // Don't add if already has a break before
                    if (result.includes(`<break time`) && result.indexOf(match) < 50) {
                        return match;
                    }
                    replaced = true;
                    emphasisCount++;
                    return ` <break time="50ms"/>${capturedWord}`;
                });
                break; // Only one word emphasis per response
            }
        }
    }
    if (emphasisCount > 0) {
        log.debug({ emphasisCount }, 'Applied Cartesia-compatible emphasis pauses');
    }
    return result;
}
/**
 * Escape special regex characters in a string
 */
function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
//# sourceMappingURL=smart-emphasis.js.map