/**
 * Mirroring and Emotional Echoing
 *
 * Vocabulary mirroring and emotional echo generation.
 *
 * @module conversation/active-listening/mirroring
 */
import { seededIndex } from '../utils/rng.js';
// ============================================================================
// VOCABULARY MIRRORING
// ============================================================================
const SUBSTITUTIONS = {
    worried: ['concerned', 'anxious', 'uneasy'],
    scared: ['afraid', 'fearful', 'nervous'],
    excited: ['thrilled', 'eager', 'enthusiastic'],
    happy: ['glad', 'pleased', 'satisfied'],
    money: ['finances', 'funds', 'cash'],
    plan: ['strategy', 'approach', 'method'],
    goal: ['objective', 'target', 'aim'],
};
/**
 * Generate a mirrored phrase that echoes the user's vocabulary
 */
export function mirrorUserVocabulary(userText, responseText, extractedVocabulary) {
    const userWords = extractNotableWords(userText);
    // Add to vocabulary tracking
    userWords.forEach((w) => extractedVocabulary.add(w.toLowerCase()));
    // Find opportunities to mirror in response
    for (const word of userWords) {
        const lowerWord = word.toLowerCase();
        for (const [key, synonyms] of Object.entries(SUBSTITUTIONS)) {
            if (lowerWord === key)
                continue; // User used the base word
            if (synonyms.includes(lowerWord)) {
                // User used a synonym - we should use their word instead
                const pattern = new RegExp(`\\b(${key}|${synonyms.join('|')})\\b`, 'gi');
                if (pattern.test(responseText)) {
                    return {
                        original: responseText,
                        mirrored: responseText.replace(pattern, word),
                        type: 'vocabulary',
                    };
                }
            }
        }
    }
    return null;
}
/**
 * Extract notable words from text (excluding common words)
 */
export function extractNotableWords(text) {
    const commonWords = new Set([
        'the',
        'a',
        'an',
        'is',
        'are',
        'was',
        'were',
        'be',
        'been',
        'being',
        'have',
        'has',
        'had',
        'do',
        'does',
        'did',
        'will',
        'would',
        'could',
        'should',
        'may',
        'might',
        'must',
        'shall',
        'can',
        'need',
        'dare',
        'ought',
        'used',
        'to',
        'of',
        'in',
        'for',
        'on',
        'with',
        'at',
        'by',
        'from',
        'as',
        'into',
        'through',
        'during',
        'before',
        'after',
        'above',
        'below',
        'between',
        'i',
        'you',
        'he',
        'she',
        'it',
        'we',
        'they',
        'me',
        'him',
        'her',
        'us',
        'them',
        'my',
        'your',
        'his',
        'its',
        'our',
        'their',
        'mine',
        'yours',
        'hers',
        'ours',
        'theirs',
        'this',
        'that',
        'these',
        'those',
        'what',
        'which',
        'who',
        'whom',
        'whose',
        'and',
        'but',
        'or',
        'nor',
        'so',
        'yet',
        'both',
        'either',
        'neither',
        'not',
        'no',
        'yes',
        'just',
        'also',
        'very',
        'too',
        'quite',
        'rather',
        'about',
        'like',
        'really',
        'think',
        'know',
        'get',
        'got',
        'want',
        'going',
        'because',
        'when',
        'if',
        'then',
        'than',
        'some',
        'any',
        'all',
        'each',
    ]);
    const words = text
        .toLowerCase()
        .replace(/[^\w\s]/g, '')
        .split(/\s+/)
        .filter((w) => w.length > 3 && !commonWords.has(w));
    return [...new Set(words)];
}
// ============================================================================
// EMOTIONAL ECHOING
// ============================================================================
const EMOTIONAL_ECHOES = {
    worried: {
        low: ['I can tell this is on your mind.'],
        medium: ["I hear the concern in what you're saying.", 'You seem worried about this.'],
        high: [
            "This is really weighing on you, isn't it?",
            'I can feel how much this is troubling you.',
        ],
    },
    excited: {
        low: ["There's some energy here."],
        medium: ['I can hear the excitement.', 'You sound eager about this.'],
        high: ["You're really fired up about this!", 'I love the enthusiasm!'],
    },
    sad: {
        low: ['That sounds difficult.'],
        medium: ['I hear some sadness there.', 'That seems painful.'],
        high: ["This is really hard, isn't it?", 'I can feel how heavy this is for you.'],
    },
    frustrated: {
        low: ['That sounds annoying.'],
        medium: ['I can understand the frustration.', 'That would be irritating.'],
        high: ['This is really frustrating, I get it.', "No wonder you're fed up."],
    },
    hopeful: {
        low: ["There's optimism here."],
        medium: ['I hear hope in your voice.', 'You seem encouraged.'],
        high: ["You're feeling really positive about this!", 'I love the optimism!'],
    },
    confused: {
        low: ["That's a lot to sort through."],
        medium: ["It's understandable to feel uncertain.", 'This is confusing territory.'],
        high: ["There's a lot to untangle here.", 'I can see why this feels overwhelming.'],
    },
};
/**
 * Generate an emotional echo phrase
 */
export function generateEmotionalEcho(userEmotion, userText, intensity = 'medium') {
    const emotionEchoes = EMOTIONAL_ECHOES[userEmotion.toLowerCase()];
    if (!emotionEchoes) {
        return "I hear what you're saying.";
    }
    const options = emotionEchoes[intensity];
    if (!options || options.length === 0) {
        return "I hear what you're saying.";
    }
    return (options[seededIndex(`echo:${userEmotion}:${intensity}:${userText}`, options.length)] ??
        options[0]);
}
//# sourceMappingURL=mirroring.js.map