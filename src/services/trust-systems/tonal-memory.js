/**
 * Tonal Memory - Remember HOW things were said
 *
 * "Your voice always gets quieter when you mention your sister."
 *
 * Philosophy: Humans remember not just WHAT people said, but HOW they
 * said it. The tremor in someone's voice when discussing their father.
 * The brightness that appears when they mention their garden. These
 * tonal signatures are deeply meaningful.
 *
 * This system tracks:
 * - Emotional signatures per topic
 * - Recurring voice patterns
 * - Changes in how someone talks about something over time
 * - The texture of conversations, not just content
 *
 * Better Than Human: Real friends notice these patterns but often
 * can't articulate them. We can detect AND surface them appropriately.
 *
 * @module TonalMemory
 */
import { createLogger } from '../../utils/safe-logger.js';
import { indexTonalMemory } from '../data-layer/integrations/trust-integration.js';
const log = createLogger({ module: 'TonalMemory' });
// ============================================================================
// STORAGE
// ============================================================================
const userProfiles = new Map();
// Track what we've surfaced this session
const surfacedThisSession = new Set();
// ============================================================================
// CORE FUNCTIONS
// ============================================================================
/**
 * Get or create a user's tonal memory profile
 */
function getProfile(userId) {
    let profile = userProfiles.get(userId);
    if (!profile) {
        profile = {
            userId,
            patterns: [],
            lastUpdated: new Date(),
        };
        userProfiles.set(userId, profile);
    }
    return profile;
}
/**
 * Record a tonal observation for a topic
 */
export function recordTonalObservation(params) {
    const { userId, topic, voiceSignals, emotion, confidence = 0.7 } = params;
    if (!topic || topic.length < 2)
        return;
    const profile = getProfile(userId);
    const normalizedTopic = normalizeTopic(topic);
    // Find existing pattern or create new one
    let pattern = profile.patterns.find((p) => normalizeTopic(p.topic) === normalizedTopic ||
        p.aliases.some((a) => normalizeTopic(a) === normalizedTopic));
    if (!pattern) {
        pattern = {
            topic: normalizedTopic,
            aliases: [],
            signatures: [],
            occurrenceCount: 0,
            consistency: 0,
            firstObserved: new Date(),
            lastObserved: new Date(),
            surfaced: false,
        };
        profile.patterns.push(pattern);
    }
    // Build signature from voice signals
    const signature = {
        pitch: classifyPitch(voiceSignals.pitch),
        energy: classifyEnergy(voiceSignals.energy),
        pace: classifyPace(voiceSignals.speechRate),
        tremor: voiceSignals.tremor ?? false,
        breathiness: classifyBreathiness(voiceSignals.breathiness),
        emotion: emotion || 'unknown',
        confidence,
    };
    // Add signature
    pattern.signatures.push(signature);
    pattern.occurrenceCount++;
    pattern.lastObserved = new Date();
    // Index to semantic memory when pattern becomes significant
    if (pattern.occurrenceCount >= 3 && signature.confidence >= 0.6) {
        const voiceChars = [
            signature.pitch !== 'normal' ? `pitch: ${signature.pitch}` : '',
            signature.energy !== 'normal' ? `energy: ${signature.energy}` : '',
            signature.pace !== 'normal' ? `pace: ${signature.pace}` : '',
            signature.tremor ? 'tremor detected' : '',
        ]
            .filter(Boolean)
            .join(', ');
        indexTonalMemory(userId, {
            id: `tonal_${normalizedTopic}_${Date.now()}`,
            pattern: `Voice pattern when discussing ${normalizedTopic}`,
            voiceCharacteristics: voiceChars || 'subtle changes',
            communicationStyle: signature.emotion !== 'unknown' ? signature.emotion : undefined,
        });
    }
    // Keep last 20 signatures per topic
    if (pattern.signatures.length > 20) {
        pattern.signatures = pattern.signatures.slice(-20);
    }
    // Update dominant signature and consistency
    updatePatternAnalysis(pattern);
    profile.lastUpdated = new Date();
    log.debug({
        userId,
        topic: normalizedTopic,
        occurrenceCount: pattern.occurrenceCount,
        emotion,
    }, '🎤 Tonal observation recorded');
}
/**
 * Detect recurring tonal patterns that could be surfaced
 */
export function detectRecurringPatterns(userId) {
    const profile = userProfiles.get(userId);
    if (!profile)
        return [];
    const insights = [];
    for (const pattern of profile.patterns) {
        // Need at least 3 observations
        if (pattern.occurrenceCount < 3)
            continue;
        // Need decent consistency
        if (pattern.consistency < 0.6)
            continue;
        // Skip if already surfaced recently
        const key = `${userId}:${pattern.topic}`;
        if (pattern.surfaced && surfacedThisSession.has(key))
            continue;
        // Build insight
        const insight = buildInsight(pattern);
        if (insight && insight.confidence > 0.5) {
            insights.push(insight);
        }
    }
    // Sort by confidence and occurrences
    insights.sort((a, b) => {
        const scoreA = a.confidence * a.occurrences;
        const scoreB = b.confidence * b.occurrences;
        return scoreB - scoreA;
    });
    return insights;
}
/**
 * Get the best insight to surface
 */
export function getBestInsight(userId) {
    const insights = detectRecurringPatterns(userId);
    if (insights.length === 0)
        return null;
    // Return the highest-confidence insight that hasn't been surfaced recently
    return insights[0] || null;
}
/**
 * Mark an insight as surfaced
 */
export function markInsightSurfaced(userId, topic) {
    const profile = userProfiles.get(userId);
    if (!profile)
        return;
    const normalizedTopic = normalizeTopic(topic);
    const pattern = profile.patterns.find((p) => normalizeTopic(p.topic) === normalizedTopic ||
        p.aliases.some((a) => normalizeTopic(a) === normalizedTopic));
    if (pattern) {
        pattern.surfaced = true;
        surfacedThisSession.add(`${userId}:${pattern.topic}`);
        log.debug({ userId, topic: normalizedTopic }, '🎤 Tonal insight surfaced');
    }
}
/**
 * Check if we have a tonal memory for a specific topic
 */
export function hasTonalMemory(userId, topic) {
    const profile = userProfiles.get(userId);
    if (!profile)
        return false;
    const normalizedTopic = normalizeTopic(topic);
    return profile.patterns.some((p) => (normalizeTopic(p.topic) === normalizedTopic ||
        p.aliases.some((a) => normalizeTopic(a) === normalizedTopic)) &&
        p.occurrenceCount >= 3 &&
        p.consistency >= 0.5);
}
/**
 * Get description of how user sounds when talking about a topic
 */
export function getTonalDescription(userId, topic) {
    const profile = userProfiles.get(userId);
    if (!profile)
        return null;
    const normalizedTopic = normalizeTopic(topic);
    const pattern = profile.patterns.find((p) => normalizeTopic(p.topic) === normalizedTopic ||
        p.aliases.some((a) => normalizeTopic(a) === normalizedTopic));
    if (!pattern || pattern.occurrenceCount < 3 || !pattern.dominantSignature) {
        return null;
    }
    return buildDescription(pattern.dominantSignature, pattern.topic);
}
// ============================================================================
// PATTERN ANALYSIS
// ============================================================================
function updatePatternAnalysis(pattern) {
    if (pattern.signatures.length < 2) {
        pattern.consistency = 0;
        return;
    }
    // Calculate dominant signature by voting
    const votes = {};
    for (const sig of pattern.signatures) {
        const key = `${sig.pitch}-${sig.energy}-${sig.pace}-${sig.emotion}`;
        votes[key] = (votes[key] || 0) + 1;
    }
    // Find most common
    let maxVotes = 0;
    let dominantKey = '';
    for (const [key, count] of Object.entries(votes)) {
        if (count > maxVotes) {
            maxVotes = count;
            dominantKey = key;
        }
    }
    // Calculate consistency (% that match dominant)
    pattern.consistency = maxVotes / pattern.signatures.length;
    // Set dominant signature from most recent matching signature
    for (let i = pattern.signatures.length - 1; i >= 0; i--) {
        const sig = pattern.signatures[i];
        const key = `${sig.pitch}-${sig.energy}-${sig.pace}-${sig.emotion}`;
        if (key === dominantKey) {
            pattern.dominantSignature = sig;
            break;
        }
    }
    // Build description
    if (pattern.dominantSignature) {
        pattern.description = buildDescription(pattern.dominantSignature, pattern.topic);
    }
}
function buildInsight(pattern) {
    if (!pattern.dominantSignature)
        return null;
    const sig = pattern.dominantSignature;
    const description = buildDescription(sig, pattern.topic);
    // Build surfacing phrase
    const surfacingPhrases = buildSurfacingPhrases(sig, pattern.topic);
    const surfacingPhrase = surfacingPhrases[Math.floor(Math.random() * surfacingPhrases.length)] ||
        `I notice something in how you talk about ${pattern.topic}.`;
    // Determine if we should ask permission
    const sensitiveEmotions = ['sad', 'anxious', 'angry', 'hurt', 'fearful', 'grief'];
    const askPermission = sensitiveEmotions.includes(sig.emotion.toLowerCase()) ||
        sig.tremor ||
        pattern.topic.toLowerCase().includes('death') ||
        pattern.topic.toLowerCase().includes('loss');
    return {
        topic: pattern.topic,
        observation: description,
        surfacingPhrase,
        confidence: pattern.consistency * (sig.confidence || 0.7),
        occurrences: pattern.occurrenceCount,
        askPermission,
    };
}
function buildDescription(sig, topic) {
    const parts = [];
    // Voice quality observations
    if (sig.pitch === 'lower') {
        parts.push('voice gets quieter');
    }
    else if (sig.pitch === 'higher') {
        parts.push('voice lifts');
    }
    if (sig.energy === 'quieter') {
        parts.push('voice softens');
    }
    else if (sig.energy === 'louder') {
        parts.push('voice gets stronger');
    }
    if (sig.pace === 'slower') {
        parts.push('pace slows down');
    }
    else if (sig.pace === 'faster') {
        parts.push('pace picks up');
    }
    if (sig.tremor) {
        parts.push('voice trembles slightly');
    }
    if (sig.breathiness === 'more') {
        parts.push('voice gets breathier');
    }
    // Emotional context
    if (sig.emotion && sig.emotion !== 'unknown' && sig.emotion !== 'neutral') {
        parts.push(`sounds ${sig.emotion}`);
    }
    if (parts.length === 0) {
        return `Voice changes when discussing ${topic}`;
    }
    return `When you mention ${topic}, your ${parts.slice(0, 2).join(' and ')}`;
}
function buildSurfacingPhrases(sig, topic) {
    const phrases = [];
    // Gentle noticing phrases
    if (sig.pitch === 'lower' || sig.energy === 'quieter') {
        phrases.push(`I notice your voice gets quieter when ${topic} comes up.`, `Something shifts in your voice when you mention ${topic}.`, `There's a softness in how you talk about ${topic}.`);
    }
    if (sig.pitch === 'higher' || sig.energy === 'louder') {
        phrases.push(`I can hear something lifts in you when you talk about ${topic}.`, `There's energy in your voice when ${topic} comes up.`, `Your voice brightens when you mention ${topic}.`);
    }
    if (sig.tremor) {
        phrases.push(`I hear something tender in your voice when ${topic} comes up.`, `There's weight in how you talk about ${topic}. Can I ask about that?`, `${topic} seems to touch something deep. Am I reading that right?`);
    }
    if (sig.pace === 'slower') {
        phrases.push(`You slow down when talking about ${topic}. Like you're being careful.`, `I notice you take your time when ${topic} comes up.`);
    }
    if (sig.pace === 'faster') {
        phrases.push(`Your words speed up when ${topic} comes up. There's excitement there.`, `I can hear the energy when you talk about ${topic}.`);
    }
    // Fallback
    if (phrases.length === 0) {
        phrases.push(`I've noticed something about how you talk about ${topic}.`, `There's something in your voice when ${topic} comes up.`);
    }
    return phrases;
}
// ============================================================================
// CLASSIFICATION HELPERS
// ============================================================================
function classifyPitch(pitch) {
    if (pitch === undefined)
        return 'normal';
    if (pitch < 0.35)
        return 'lower';
    if (pitch > 0.65)
        return 'higher';
    if (pitch < 0.45 || pitch > 0.55)
        return 'variable';
    return 'normal';
}
function classifyEnergy(energy) {
    if (energy === undefined)
        return 'normal';
    if (energy < 0.35)
        return 'quieter';
    if (energy > 0.65)
        return 'louder';
    if (energy < 0.45 || energy > 0.55)
        return 'variable';
    return 'normal';
}
function classifyPace(rate) {
    if (rate === undefined)
        return 'normal';
    // Assuming rate is normalized 0-1 or words per minute
    if (rate < 100 || rate < 0.35)
        return 'slower';
    if (rate > 160 || rate > 0.65)
        return 'faster';
    return 'normal';
}
function classifyBreathiness(breathiness) {
    if (breathiness === undefined)
        return 'normal';
    if (breathiness > 0.6)
        return 'more';
    if (breathiness < 0.3)
        return 'less';
    return 'normal';
}
function normalizeTopic(topic) {
    return topic
        .toLowerCase()
        .trim()
        .replace(/[^\w\s]/g, '');
}
// ============================================================================
// PERSISTENCE
// ============================================================================
export function loadTonalProfile(userId, data) {
    // Hydrate dates
    const hydrated = {
        ...data,
        lastUpdated: new Date(data.lastUpdated),
        patterns: data.patterns.map((p) => ({
            ...p,
            firstObserved: new Date(p.firstObserved),
            lastObserved: new Date(p.lastObserved),
        })),
    };
    if (hydrated.baseline) {
        hydrated.baseline.updatedAt = new Date(hydrated.baseline.updatedAt);
    }
    userProfiles.set(userId, hydrated);
    log.debug({ userId, patternCount: hydrated.patterns.length }, '🎤 Loaded tonal profile');
}
export function getTonalProfileForPersistence(userId) {
    return userProfiles.get(userId) || null;
}
export function getAllTopicPatterns(userId) {
    const profile = userProfiles.get(userId);
    return profile?.patterns || [];
}
// ============================================================================
// CLEAR SESSION STATE
// ============================================================================
export function clearSessionState() {
    surfacedThisSession.clear();
}
/**
 * Clear tonal profile for a user (for testing)
 */
export function clearTonalProfile(userId) {
    userProfiles.delete(userId);
}
// ============================================================================
// EXPORTS
// ============================================================================
export default {
    recordTonalObservation,
    detectRecurringPatterns,
    getBestInsight,
    markInsightSurfaced,
    hasTonalMemory,
    getTonalDescription,
    loadTonalProfile,
    getTonalProfileForPersistence,
    getAllTopicPatterns,
    clearSessionState,
    clearTonalProfile,
};
//# sourceMappingURL=tonal-memory.js.map