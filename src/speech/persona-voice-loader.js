/**
 * Persona Voice Loader
 *
 * Loads voice-specific content (backchannels, catchphrases, expressions)
 * from persona bundles. Falls back to defaults if not found.
 *
 * This replaces hardcoded data in persona-phrases.ts with dynamic loading
 * from persona bundles, following the clean architecture principle of
 * keeping persona data with personas.
 *
 * @module persona-voice-loader
 */
import { readFile } from 'fs/promises';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { createLogger } from '../utils/safe-logger.js';
const log = createLogger({ module: 'PersonaVoiceLoader' });
// ============================================================================
// CACHE
// ============================================================================
const voiceDataCache = new Map();
const loadingPromises = new Map();
// ============================================================================
// PATH HELPERS
// ============================================================================
const __dirname = fileURLToPath(new URL('.', import.meta.url));
const BUNDLES_PATH = join(__dirname, '..', 'personas', 'bundles');
function getPersonaBundlePath(personaId) {
    return join(BUNDLES_PATH, personaId);
}
// ============================================================================
// LOADERS
// ============================================================================
async function loadJsonFile(filePath) {
    try {
        const content = await readFile(filePath, 'utf-8');
        return JSON.parse(content);
    }
    catch {
        return null;
    }
}
/**
 * Load voice data for a persona from their bundle
 */
async function loadPersonaVoiceDataInternal(personaId) {
    const bundlePath = getPersonaBundlePath(personaId);
    const [backchannels, catchphrases, expressions] = await Promise.all([
        loadJsonFile(join(bundlePath, 'content', 'behaviors', 'backchannels.json')),
        loadJsonFile(join(bundlePath, 'content', 'behaviors', 'catchphrases.json')),
        loadJsonFile(join(bundlePath, 'content', 'voice', 'expressions.json')),
    ]);
    return { backchannels, catchphrases, expressions };
}
/**
 * Load voice data for a persona with caching
 */
export async function loadPersonaVoiceData(personaId) {
    // Normalize persona ID
    const normalizedId = normalizePersonaIdInternal(personaId);
    // Check cache
    const cached = voiceDataCache.get(normalizedId);
    if (cached) {
        return cached;
    }
    // Check if already loading
    const existing = loadingPromises.get(normalizedId);
    if (existing) {
        return existing;
    }
    // Start loading
    const promise = loadPersonaVoiceDataInternal(normalizedId);
    loadingPromises.set(normalizedId, promise);
    try {
        const data = await promise;
        voiceDataCache.set(normalizedId, data);
        log.debug({ personaId: normalizedId, hasBackchannels: !!data.backchannels }, 'Loaded persona voice data');
        return data;
    }
    finally {
        loadingPromises.delete(normalizedId);
    }
}
/**
 * Preload voice data for common personas
 */
export async function preloadCommonPersonaVoice() {
    const commonPersonas = [
        'ferni',
        'nayan-patel',
        'peter-john',
        'maya-santos',
        'jordan-taylor',
        'alex-chen',
    ];
    await Promise.all(commonPersonas.map(async (id) => loadPersonaVoiceData(id).catch((err) => {
        log.warn({ personaId: id, error: String(err) }, 'Failed to preload voice data');
        return null;
    })));
    log.info({ count: voiceDataCache.size }, 'Preloaded persona voice data');
}
/**
 * Clear the voice data cache
 */
export function clearVoiceDataCache() {
    voiceDataCache.clear();
    loadingPromises.clear();
}
// ============================================================================
// PERSONA ID NORMALIZATION
// ============================================================================
const PERSONA_ALIASES = {
    'jack-b': 'ferni',
    maya: 'maya-santos',
    jordan: 'jordan-taylor',
    alex: 'alex-chen',
    peter: 'peter-john',
    nayan: 'nayan-patel',
};
function normalizePersonaIdInternal(personaId) {
    return PERSONA_ALIASES[personaId] || personaId;
}
// ============================================================================
// SYNC GETTERS (with fallbacks)
// ============================================================================
// Default fallbacks when persona data isn't loaded or doesn't exist
const DEFAULT_BACKCHANNELS = {
    neutral: ['Mm-hmm', 'Right', 'Yeah', 'I see', 'Okay'],
    engaged: ['Oh!', 'Interesting', 'Hmm', 'Really?'],
    empathetic: ['I hear you', "That's hard", 'I understand', 'Yeah...'],
    excited: ['Oh!', 'Yes!', 'Nice!'],
    supportive: ["I'm here", 'Take your time', 'I understand'],
};
/**
 * Get a backchannel phrase synchronously (uses cache, falls back to defaults)
 */
export function getBackchannelSync(personaId, emotionType) {
    const normalizedId = normalizePersonaIdInternal(personaId);
    const cached = voiceDataCache.get(normalizedId);
    if (cached?.backchannels) {
        // Map emotion type to backchannel category
        const categoryMap = {
            neutral: 'neutral',
            engaged: 'engaged',
            empathetic: 'empathetic',
            excited: 'celebration',
            supportive: 'encouragement',
        };
        const category = categoryMap[emotionType];
        const phrases = cached.backchannels[category];
        if (Array.isArray(phrases) && phrases.length > 0) {
            return phrases[Math.floor(Math.random() * phrases.length)];
        }
    }
    // Fallback to defaults
    const fallback = DEFAULT_BACKCHANNELS[emotionType] || DEFAULT_BACKCHANNELS.neutral;
    return fallback[Math.floor(Math.random() * fallback.length)];
}
/**
 * Get a backchannel by category
 */
export function getBackchannelByCategorySync(personaId, category) {
    const normalizedId = normalizePersonaIdInternal(personaId);
    const cached = voiceDataCache.get(normalizedId);
    if (cached?.backchannels) {
        const phrases = cached.backchannels[category];
        if (Array.isArray(phrases) && phrases.length > 0) {
            return phrases[Math.floor(Math.random() * phrases.length)];
        }
    }
    return null;
}
/**
 * Get a catchphrase synchronously
 */
export function getCatchphraseSync(personaId) {
    const normalizedId = normalizePersonaIdInternal(personaId);
    const cached = voiceDataCache.get(normalizedId);
    if (cached?.catchphrases?.signature_phrases) {
        const phrases = cached.catchphrases.signature_phrases;
        if (phrases.length > 0) {
            return phrases[Math.floor(Math.random() * phrases.length)];
        }
    }
    return null;
}
/**
 * Get an expression by type
 */
export function getExpressionSync(personaId, expressionType) {
    const normalizedId = normalizePersonaIdInternal(personaId);
    const cached = voiceDataCache.get(normalizedId);
    if (cached?.expressions?.emotional_expressions[expressionType]) {
        const expr = cached.expressions.emotional_expressions[expressionType];
        const phrase = expr.phrases[Math.floor(Math.random() * expr.phrases.length)];
        return {
            ssmlWrapper: expr.ssml_wrapper,
            phrase,
        };
    }
    return null;
}
/**
 * Get a silence filler based on silence duration
 */
export function getSilenceFillerSync(personaId, silenceDurationMs) {
    const normalizedId = normalizePersonaIdInternal(personaId);
    const cached = voiceDataCache.get(normalizedId);
    if (cached?.backchannels?.silence_fillers) {
        const { early, mid, late } = cached.backchannels.silence_fillers;
        let phrases;
        if (silenceDurationMs < 3000) {
            phrases = early;
        }
        else if (silenceDurationMs < 8000) {
            phrases = mid;
        }
        else {
            phrases = late;
        }
        if (phrases && phrases.length > 0) {
            return phrases[Math.floor(Math.random() * phrases.length)];
        }
    }
    return null;
}
/**
 * Check if persona has voice data loaded
 */
export function hasVoiceDataLoaded(personaId) {
    const normalizedId = normalizePersonaIdInternal(personaId);
    return voiceDataCache.has(normalizedId);
}
/**
 * Get the count of loaded personas
 */
export function getLoadedPersonaCount() {
    return voiceDataCache.size;
}
//# sourceMappingURL=persona-voice-loader.js.map