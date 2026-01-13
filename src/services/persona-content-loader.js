/**
 * Persona Content Loader Service
 *
 * Loads and caches persona behavior content from JSON files.
 * This enables context builders and tools to access rich, persona-specific
 * content without hardcoding phrases.
 *
 * USAGE:
 *   const trustPhrases = await loadFerniContent('trust-phrases');
 *   const lateNight = await loadFerniContent('late-night-presence');
 *
 * @module PersonaContentLoader
 */
import { createLogger } from '../utils/safe-logger.js';
import { loadBundleById } from '../personas/bundles/index.js';
const log = createLogger({ module: 'PersonaContentLoader' });
const CACHE_CONFIG = {
    maxBehaviorEntries: 50,
    maxContentEntries: 500,
    ttlMs: 24 * 60 * 60 * 1000, // 24 hours
};
// LRU caches with access tracking
const behaviorCache = new Map();
const contentCache = new Map();
// Stats for monitoring
const cacheStats = {
    behaviorHits: 0,
    behaviorMisses: 0,
    behaviorEvictions: 0,
    contentHits: 0,
    contentMisses: 0,
    contentEvictions: 0,
};
/**
 * Check if a cache entry is expired
 */
function isExpired(entry) {
    return Date.now() - entry.createdAt > CACHE_CONFIG.ttlMs;
}
/**
 * Evict least recently used entry from a cache
 */
function evictLRU(cache) {
    let oldest = null;
    for (const [key, entry] of cache.entries()) {
        if (!oldest || entry.accessedAt < oldest.accessedAt) {
            oldest = { key, accessedAt: entry.accessedAt };
        }
    }
    if (oldest) {
        cache.delete(oldest.key);
    }
}
/**
 * Get from cache with LRU tracking
 */
function getFromCache(cache, key, statsKey) {
    const entry = cache.get(key);
    if (!entry) {
        if (statsKey === 'behavior')
            cacheStats.behaviorMisses++;
        else
            cacheStats.contentMisses++;
        return null;
    }
    if (isExpired(entry)) {
        cache.delete(key);
        if (statsKey === 'behavior')
            cacheStats.behaviorMisses++;
        else
            cacheStats.contentMisses++;
        return null;
    }
    // Update access time (LRU)
    entry.accessedAt = Date.now();
    if (statsKey === 'behavior')
        cacheStats.behaviorHits++;
    else
        cacheStats.contentHits++;
    return entry.value;
}
/**
 * Set in cache with LRU eviction
 */
function setInCache(cache, key, value, maxSize, statsKey) {
    // Evict if at capacity
    if (cache.size >= maxSize) {
        evictLRU(cache);
        if (statsKey === 'behavior')
            cacheStats.behaviorEvictions++;
        else
            cacheStats.contentEvictions++;
    }
    const now = Date.now();
    cache.set(key, {
        value,
        accessedAt: now,
        createdAt: now,
    });
}
/**
 * Get cache statistics for monitoring
 */
export function getContentCacheStats() {
    const behaviorTotal = cacheStats.behaviorHits + cacheStats.behaviorMisses;
    const contentTotal = cacheStats.contentHits + cacheStats.contentMisses;
    return {
        behaviors: {
            size: behaviorCache.size,
            hits: cacheStats.behaviorHits,
            misses: cacheStats.behaviorMisses,
            evictions: cacheStats.behaviorEvictions,
            hitRate: behaviorTotal > 0 ? cacheStats.behaviorHits / behaviorTotal : 0,
        },
        content: {
            size: contentCache.size,
            hits: cacheStats.contentHits,
            misses: cacheStats.contentMisses,
            evictions: cacheStats.contentEvictions,
            hitRate: contentTotal > 0 ? cacheStats.contentHits / contentTotal : 0,
        },
    };
}
/**
 * Prune expired entries from caches
 */
export function pruneExpiredContent() {
    let behaviorsPruned = 0;
    let contentPruned = 0;
    for (const [key, entry] of behaviorCache.entries()) {
        if (isExpired(entry)) {
            behaviorCache.delete(key);
            behaviorsPruned++;
        }
    }
    for (const [key, entry] of contentCache.entries()) {
        if (isExpired(entry)) {
            contentCache.delete(key);
            contentPruned++;
        }
    }
    if (behaviorsPruned > 0 || contentPruned > 0) {
        log.info({ behaviorsPruned, contentPruned }, 'Pruned expired content cache entries');
    }
    return { behaviors: behaviorsPruned, content: contentPruned };
}
// ============================================================================
// LOADER FUNCTIONS
// ============================================================================
/**
 * Load all behaviors for a persona (cached with LRU eviction)
 */
export async function loadPersonaBehaviors(personaId) {
    const cacheKey = `behaviors:${personaId}`;
    // Check cache with LRU tracking
    const cached = getFromCache(behaviorCache, cacheKey, 'behavior');
    if (cached) {
        return cached;
    }
    try {
        const bundle = await loadBundleById(personaId);
        if (!bundle) {
            log.warn({ personaId }, 'Persona bundle not found');
            return null;
        }
        const behaviors = await bundle.getBehaviors();
        // Store with LRU eviction
        setInCache(behaviorCache, cacheKey, behaviors, CACHE_CONFIG.maxBehaviorEntries, 'behavior');
        log.debug({ personaId, behaviorCount: Object.keys(behaviors).length }, 'Loaded persona behaviors');
        return behaviors;
    }
    catch (error) {
        log.error({ personaId, error: String(error) }, 'Failed to load persona behaviors');
        return null;
    }
}
/**
 * Load specific behavior content for Ferni (legacy, use loadPersonaContent instead)
 * @deprecated Use loadPersonaContent(personaId, behaviorName) instead
 */
export async function loadFerniContent(behaviorName) {
    return loadPersonaContent('ferni', behaviorName);
}
/**
 * Load specific behavior content for ANY persona (cached with LRU eviction)
 * This is the primary way to access persona-specific 200% content
 */
export async function loadPersonaContent(personaId, behaviorName) {
    const cacheKey = `${personaId}:${behaviorName}`;
    // Check cache with LRU tracking
    const cached = getFromCache(contentCache, cacheKey, 'content');
    if (cached !== null) {
        return cached;
    }
    const behaviors = await loadPersonaBehaviors(personaId);
    if (!behaviors) {
        return null;
    }
    const content = behaviors[behaviorName];
    if (content) {
        // Store with LRU eviction
        setInCache(contentCache, cacheKey, content, CACHE_CONFIG.maxContentEntries, 'content');
    }
    return content || null;
}
/**
 * Load trust phrases for a specific persona
 * Falls back to Ferni if not available for the requested persona
 */
export async function loadTrustPhrases(personaId = 'ferni') {
    // Try to load for the specific persona first
    const phrases = await loadPersonaContent(personaId, 'trust_phrases');
    if (phrases) {
        return phrases;
    }
    // Fall back to Ferni if persona doesn't have trust phrases
    if (personaId !== 'ferni') {
        log.debug({ personaId }, 'No trust phrases for persona, falling back to Ferni');
        return loadPersonaContent('ferni', 'trust_phrases');
    }
    return null;
}
/**
 * Load late-night presence content for a specific persona
 */
export async function loadLateNightPresence(personaId = 'ferni') {
    const content = await loadPersonaContent(personaId, 'late_night_presence');
    if (content)
        return content;
    // Fall back to Ferni
    if (personaId !== 'ferni') {
        return loadPersonaContent('ferni', 'late_night_presence');
    }
    return null;
}
/**
 * Load emotional intelligence patterns for a specific persona
 */
export async function loadEmotionalIntelligence(personaId = 'ferni') {
    const content = await loadPersonaContent(personaId, 'emotional_intelligence');
    if (content)
        return content;
    // Fall back to Ferni
    if (personaId !== 'ferni') {
        return loadPersonaContent('ferni', 'emotional_intelligence');
    }
    return null;
}
/**
 * Load I-notice power content for a specific persona
 */
export async function loadINoticePower(personaId = 'ferni') {
    const content = await loadPersonaContent(personaId, 'i_notice_power');
    if (content)
        return content;
    // Fall back to Ferni
    if (personaId !== 'ferni') {
        return loadPersonaContent('ferni', 'i_notice_power');
    }
    return null;
}
/**
 * Load superhuman insights content for a specific persona
 */
export async function loadSuperhumanInsights(personaId = 'ferni') {
    const content = await loadPersonaContent(personaId, 'superhuman_insights');
    if (content)
        return content;
    // Fall back to Ferni
    if (personaId !== 'ferni') {
        return loadPersonaContent('ferni', 'superhuman_insights');
    }
    return null;
}
/**
 * Load silence responses content for a specific persona
 * Used for meaningful silence moments that feel like genuine human connection
 */
export async function loadSilenceResponses(personaId = 'ferni') {
    const content = await loadPersonaContent(personaId, 'silence_responses');
    if (content)
        return content;
    // Fall back to Ferni
    if (personaId !== 'ferni') {
        return loadPersonaContent('ferni', 'silence_responses');
    }
    return null;
}
// ============================================================================
// LIFE COACHING DOMAIN LOADERS
// ============================================================================
/**
 * Load second-chances voice content for life coaching
 */
export async function loadSecondChancesVoice(personaId = 'ferni') {
    const content = await loadPersonaContent(personaId, 'second_chances_voice');
    if (content)
        return content;
    // Fall back to Ferni
    if (personaId !== 'ferni') {
        return loadPersonaContent('ferni', 'second_chances_voice');
    }
    return null;
}
/**
 * Load connection voice content for life coaching
 */
export async function loadConnectionVoice(personaId = 'ferni') {
    const content = await loadPersonaContent(personaId, 'connection_voice');
    if (content)
        return content;
    // Fall back to Ferni
    if (personaId !== 'ferni') {
        return loadPersonaContent('ferni', 'connection_voice');
    }
    return null;
}
/**
 * Load difficult-conversations voice content for life coaching
 */
export async function loadDifficultConversationsVoice(personaId = 'ferni') {
    const content = await loadPersonaContent(personaId, 'difficult_conversations_voice');
    if (content)
        return content;
    // Fall back to Ferni
    if (personaId !== 'ferni') {
        return loadPersonaContent('ferni', 'difficult_conversations_voice');
    }
    return null;
}
/**
 * Load life-transitions voice content for life coaching
 */
export async function loadLifeTransitionsVoice(personaId = 'ferni') {
    const content = await loadPersonaContent(personaId, 'life_transitions_voice');
    if (content)
        return content;
    // Fall back to Ferni
    if (personaId !== 'ferni') {
        return loadPersonaContent('ferni', 'life_transitions_voice');
    }
    return null;
}
/**
 * Load quiet-growth voice content for life coaching
 */
export async function loadQuietGrowthVoice(personaId = 'ferni') {
    const content = await loadPersonaContent(personaId, 'quiet_growth_voice');
    if (content)
        return content;
    // Fall back to Ferni
    if (personaId !== 'ferni') {
        return loadPersonaContent('ferni', 'quiet_growth_voice');
    }
    return null;
}
// ============================================================================
// HELPER: GET RANDOM PHRASE
// ============================================================================
/**
 * Get a random phrase from an array (with SSML support)
 */
export function getRandomPhrase(phrases) {
    if (!phrases || phrases.length === 0) {
        return null;
    }
    return phrases[Math.floor(Math.random() * phrases.length)];
}
/**
 * Strip SSML tags from a phrase for context injection
 * (SSML is for TTS, not for LLM context)
 */
export function stripSsml(phrase) {
    return phrase
        .replace(/<break[^>]*>/g, ' ')
        .replace(/<\/?[^>]+(>|$)/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}
/**
 * Get a random phrase, stripped of SSML for LLM context
 */
export function getRandomPhraseClean(phrases) {
    const phrase = getRandomPhrase(phrases);
    return phrase ? stripSsml(phrase) : null;
}
// ============================================================================
// CLEAR CACHE (for testing)
// ============================================================================
export function clearContentCache() {
    behaviorCache.clear();
    contentCache.clear();
    // Reset stats
    cacheStats.behaviorHits = 0;
    cacheStats.behaviorMisses = 0;
    cacheStats.behaviorEvictions = 0;
    cacheStats.contentHits = 0;
    cacheStats.contentMisses = 0;
    cacheStats.contentEvictions = 0;
}
export default {
    loadPersonaBehaviors,
    loadPersonaContent,
    loadFerniContent, // deprecated
    loadTrustPhrases,
    loadLateNightPresence,
    loadEmotionalIntelligence,
    loadINoticePower,
    loadSuperhumanInsights,
    loadSilenceResponses,
    // Life coaching domain loaders
    loadSecondChancesVoice,
    loadConnectionVoice,
    loadDifficultConversationsVoice,
    loadLifeTransitionsVoice,
    loadQuietGrowthVoice,
    getRandomPhrase,
    getRandomPhraseClean,
    stripSsml,
    clearContentCache,
    // Cache monitoring
    getContentCacheStats,
    pruneExpiredContent,
};
//# sourceMappingURL=persona-content-loader.js.map