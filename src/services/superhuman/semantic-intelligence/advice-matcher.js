/**
 * Semantic Advice Matching
 *
 * Uses embeddings to semantically match user statements to past advice.
 * This enables accurate counterfactual learning even when users don't
 * explicitly reference the advice:
 *
 * - "I tried getting more sleep" → matches "You should try getting more rest"
 * - "The thing you mentioned helped" → matches recent relevant advice
 * - "Remember when you said X?" → explicit reference to past advice
 *
 * @module services/superhuman/semantic-intelligence/advice-matcher
 */
import { createLogger } from '../../../utils/safe-logger.js';
const log = createLogger({ module: 'advice-matcher' });
// ============================================================================
// EXPLICIT REFERENCE PATTERNS
// ============================================================================
/**
 * Patterns that indicate explicit reference to past advice.
 */
const EXPLICIT_REFERENCE_PATTERNS = [
    /\byou (?:said|told me|suggested|mentioned|recommended)\b/i,
    /\bremember when you\b/i,
    /\bthat (?:thing|advice) you\b/i,
    /\bwhat you (?:said|told me)\b/i,
    /\byour (?:advice|suggestion|recommendation)\b/i,
    /\blike you said\b/i,
    /\bas you suggested\b/i,
];
/**
 * Patterns for implicit advice following.
 */
const IMPLICIT_FOLLOW_PATTERNS = [
    /\bi (?:tried|did|started|began)\b/i,
    /\bi've been\b/i,
    /\bi actually\b/i,
    /\bfinally\b/i,
    /\bi went ahead and\b/i,
];
// ============================================================================
// SEMANTIC MATCHING
// ============================================================================
/**
 * Find the best matching advice for a user statement.
 *
 * Uses a multi-strategy approach:
 * 1. Check for explicit references ("you said X")
 * 2. Semantic similarity using embeddings
 * 3. Topic matching as fallback
 *
 * @param userText - The user's current message
 * @param pastAdvice - Array of past advice to match against
 * @returns The best matching advice or null
 */
export async function findMatchingAdvice(userText, pastAdvice) {
    if (!userText || pastAdvice.length === 0) {
        return null;
    }
    const matches = [];
    // 1. Check for explicit references first (highest confidence)
    const hasExplicitReference = EXPLICIT_REFERENCE_PATTERNS.some((p) => p.test(userText));
    const hasImplicitFollow = IMPLICIT_FOLLOW_PATTERNS.some((p) => p.test(userText));
    if (!hasExplicitReference && !hasImplicitFollow) {
        // User probably isn't talking about advice
        return null;
    }
    // 2. Try semantic matching with embeddings
    try {
        const semanticMatches = await semanticMatch(userText, pastAdvice);
        matches.push(...semanticMatches);
    }
    catch (error) {
        log.warn({ error: String(error) }, 'Semantic matching failed, using fallback');
    }
    // 3. Topic-based matching as fallback
    const topicMatches = topicMatch(userText, pastAdvice);
    matches.push(...topicMatches);
    // 4. Boost scores for explicit references
    if (hasExplicitReference) {
        for (const match of matches) {
            match.confidence = Math.min(match.confidence * 1.3, 1.0);
        }
    }
    // 5. Recency boost (more recent advice is more likely to be referenced)
    const now = Date.now();
    for (const match of matches) {
        const ageMs = now - match.advice.timestamp.getTime();
        const ageDays = ageMs / (1000 * 60 * 60 * 24);
        // Boost advice from last 7 days
        if (ageDays < 7) {
            match.confidence *= 1 + (0.2 * (7 - ageDays)) / 7;
        }
    }
    // 6. Sort by confidence and return best match
    matches.sort((a, b) => b.confidence - a.confidence);
    const bestMatch = matches[0];
    if (!bestMatch || bestMatch.confidence < 0.3) {
        return null;
    }
    log.debug({
        matchedAdvice: bestMatch.advice.adviceText.slice(0, 50),
        confidence: bestMatch.confidence,
        matchType: bestMatch.matchType,
    }, '🎯 Found matching advice');
    return bestMatch;
}
/**
 * Semantic matching using embeddings.
 */
async function semanticMatch(userText, pastAdvice) {
    const matches = [];
    try {
        // Dynamic import to avoid circular deps
        const { embed, cosineSimilarity } = await import('../../../memory/embeddings.js');
        // Generate embedding for user text
        const userEmbedding = await embed(userText);
        if (!userEmbedding || userEmbedding.length === 0) {
            return [];
        }
        // Compare against each advice
        for (const advice of pastAdvice) {
            let adviceEmbedding = advice.embedding;
            // Generate embedding if not cached
            if (!adviceEmbedding) {
                adviceEmbedding = await embed(advice.adviceText);
            }
            if (!adviceEmbedding || adviceEmbedding.length === 0) {
                continue;
            }
            const similarity = cosineSimilarity(userEmbedding, adviceEmbedding);
            // Only consider meaningful similarity
            if (similarity > 0.4) {
                matches.push({
                    advice,
                    similarity,
                    matchType: 'semantic',
                    confidence: normalizeSemanticScore(similarity),
                });
            }
        }
    }
    catch (error) {
        log.warn({ error: String(error) }, 'Embedding generation failed');
    }
    return matches;
}
/**
 * Topic-based matching as fallback.
 */
function topicMatch(userText, pastAdvice) {
    const matches = [];
    const lowerText = userText.toLowerCase();
    for (const advice of pastAdvice) {
        // Extract key terms from advice
        const adviceTerms = extractKeyTerms(advice.adviceText);
        const topicTerms = advice.topic ? extractKeyTerms(advice.topic) : [];
        const allTerms = [...adviceTerms, ...topicTerms];
        // Count matching terms
        let matchCount = 0;
        for (const term of allTerms) {
            if (lowerText.includes(term.toLowerCase())) {
                matchCount++;
            }
        }
        if (matchCount > 0) {
            const score = Math.min(matchCount / Math.max(allTerms.length, 1), 1.0);
            matches.push({
                advice,
                similarity: score,
                matchType: 'topic',
                confidence: score * 0.5, // Lower confidence for topic matching
            });
        }
    }
    return matches;
}
/**
 * Extract key terms from text for topic matching.
 */
function extractKeyTerms(text) {
    const stopWords = new Set([
        'a',
        'an',
        'the',
        'is',
        'are',
        'was',
        'were',
        'be',
        'been',
        'to',
        'of',
        'in',
        'for',
        'on',
        'with',
        'at',
        'by',
        'from',
        'you',
        'your',
        'i',
        'my',
        'me',
        'we',
        'our',
        'it',
        'its',
        'this',
        'that',
        'these',
        'those',
        'should',
        'could',
        'would',
        'try',
        'maybe',
        'perhaps',
        'might',
        'can',
        'will',
        'do',
        'does',
        'and',
        'or',
        'but',
        'if',
        'then',
        'so',
        'just',
        'about',
    ]);
    const words = text.toLowerCase().match(/\b[a-z]{3,}\b/g) || [];
    return words.filter((w) => !stopWords.has(w));
}
/**
 * Normalize semantic similarity score to confidence.
 */
function normalizeSemanticScore(similarity) {
    // Map 0.4-1.0 similarity to 0.3-0.95 confidence
    const minSim = 0.4;
    const maxSim = 0.9;
    const minConf = 0.3;
    const maxConf = 0.95;
    const normalized = (similarity - minSim) / (maxSim - minSim);
    const clamped = Math.max(0, Math.min(1, normalized));
    return minConf + clamped * (maxConf - minConf);
}
// ============================================================================
// ADVICE EMBEDDING CACHE
// ============================================================================
const adviceEmbeddingCache = new Map();
/**
 * Pre-compute and cache embeddings for advice.
 * Call this when loading past advice to speed up matching.
 */
export async function precomputeAdviceEmbeddings(advice) {
    try {
        const { embed } = await import('../../../memory/embeddings.js');
        for (const a of advice) {
            if (!adviceEmbeddingCache.has(a.id)) {
                const embedding = await embed(a.adviceText);
                if (embedding && embedding.length > 0) {
                    adviceEmbeddingCache.set(a.id, embedding);
                    a.embedding = embedding;
                }
            }
            else {
                a.embedding = adviceEmbeddingCache.get(a.id);
            }
        }
        log.debug({ count: advice.length }, '📦 Pre-computed advice embeddings');
    }
    catch (error) {
        log.warn({ error: String(error) }, 'Failed to pre-compute embeddings');
    }
}
/**
 * Clear the embedding cache.
 */
export function clearAdviceEmbeddingCache() {
    adviceEmbeddingCache.clear();
}
// ============================================================================
// EXPORTS
// ============================================================================
export { EXPLICIT_REFERENCE_PATTERNS, IMPLICIT_FOLLOW_PATTERNS };
//# sourceMappingURL=advice-matcher.js.map