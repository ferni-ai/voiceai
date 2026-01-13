/**
 * Coaching Intelligence - V3.6
 *
 * Learns how to help THIS specific person:
 * - Advice effectiveness scoring
 * - Learning style detection
 * - Resistance patterns
 * - Communication preferences
 *
 * @module services/superhuman/semantic-intelligence/coaching-intelligence
 */
import { createLogger } from '../../../utils/safe-logger.js';
import { getFirestoreDb, cleanForFirestore } from '../firestore-utils.js';
const log = createLogger({ module: 'coaching-intelligence' });
// ============================================================================
// CONFIGURATION
// ============================================================================
const CONFIG = {
    MIN_ADVICE_FOR_PROFILE: 5,
    MIN_OUTCOMES_FOR_EFFECTIVENESS: 3,
    LEARNING_STYLE_THRESHOLD: 0.3,
};
// ============================================================================
// CACHE
// ============================================================================
const effectivenessCache = new Map();
const learningStyleCache = new Map();
const resistanceCache = new Map();
// ============================================================================
// ADVICE EFFECTIVENESS
// ============================================================================
/**
 * Record advice outcome.
 */
export async function recordAdviceOutcome(userId, outcome) {
    let profile = effectivenessCache.get(userId) ?? (await loadEffectivenessProfile(userId));
    if (!profile) {
        profile = createDefaultProfile(userId);
    }
    // Update approach effectiveness
    const wasEffective = outcome.followed && outcome.result === 'positive';
    const adjustment = wasEffective ? 0.1 : -0.05;
    switch (outcome.approach) {
        case 'direct':
            profile.effectiveApproaches.directSuggestions = clamp(profile.effectiveApproaches.directSuggestions + adjustment);
            break;
        case 'gentle':
            profile.effectiveApproaches.gentleNudges = clamp(profile.effectiveApproaches.gentleNudges + adjustment);
            break;
        case 'questioning':
            profile.effectiveApproaches.questioningApproach = clamp(profile.effectiveApproaches.questioningApproach + adjustment);
            break;
        case 'story':
            profile.effectiveApproaches.storytelling = clamp(profile.effectiveApproaches.storytelling + adjustment);
            break;
        case 'data':
            profile.effectiveApproaches.dataAndEvidence = clamp(profile.effectiveApproaches.dataAndEvidence + adjustment);
            break;
        case 'validation':
            profile.effectiveApproaches.emotionalValidation = clamp(profile.effectiveApproaches.emotionalValidation + adjustment);
            break;
    }
    // Update framing preferences
    const framingAdjustment = wasEffective ? 0.1 : -0.05;
    switch (outcome.framing) {
        case 'positive':
            profile.framingPreferences.positiveBased = clamp(profile.framingPreferences.positiveBased + framingAdjustment);
            break;
        case 'negative':
            profile.framingPreferences.negativeBased = clamp(profile.framingPreferences.negativeBased + framingAdjustment);
            break;
        case 'neutral':
            profile.framingPreferences.neutralBased = clamp(profile.framingPreferences.neutralBased + framingAdjustment);
            break;
    }
    // Update topic receptivity
    if (wasEffective) {
        if (!profile.receptiveTopics.includes(outcome.topic)) {
            profile.receptiveTopics.push(outcome.topic);
        }
        profile.resistantTopics = profile.resistantTopics.filter((t) => t !== outcome.topic);
    }
    else if (!outcome.followed) {
        if (!profile.resistantTopics.includes(outcome.topic)) {
            profile.resistantTopics.push(outcome.topic);
        }
    }
    // Update counts
    profile.totalOutcomesTracked++;
    profile.lastUpdated = new Date();
    // Save
    await saveEffectivenessProfile(userId, profile);
    effectivenessCache.set(userId, profile);
    log.debug({ userId, approach: outcome.approach, wasEffective }, '📊 Advice outcome recorded');
}
/**
 * Get effectiveness profile.
 */
export async function getEffectivenessProfile(userId) {
    const cached = effectivenessCache.get(userId);
    if (cached)
        return cached;
    return loadEffectivenessProfile(userId);
}
/**
 * Get best approach for this user.
 */
export async function getBestApproach(userId) {
    const profile = await getEffectivenessProfile(userId);
    if (!profile || profile.totalOutcomesTracked < CONFIG.MIN_OUTCOMES_FOR_EFFECTIVENESS) {
        return null;
    }
    const approaches = profile.effectiveApproaches;
    const entries = Object.entries(approaches);
    const sorted = entries.sort((a, b) => b[1] - a[1]);
    return {
        approach: sorted[0][0],
        score: sorted[0][1],
    };
}
// ============================================================================
// LEARNING STYLE DETECTION
// ============================================================================
const LEARNING_STYLE_INDICATORS = {
    dataDriven: [
        /research|studies?|data|statistics|evidence|proof|percentage|numbers?/i,
        /show me|what does .* say|is there research/i,
    ],
    storyDriven: [
        /anyone else|other people|stories?|examples?|how did .* do it/i,
        /what about .* experience/i,
    ],
    experienceDriven: [
        /let me try|i'll see|experiment|test it out|give it a shot/i,
        /i need to do it|hands-on/i,
    ],
    reflectionDriven: [
        /let me think|need to process|sit with this|journal|reflect/i,
        /i need time|mulling over/i,
    ],
};
/**
 * Detect learning style from user text.
 */
export function detectLearningStyleFromText(text) {
    const scores = {};
    for (const [style, patterns] of Object.entries(LEARNING_STYLE_INDICATORS)) {
        for (const pattern of patterns) {
            if (pattern.test(text)) {
                const key = style;
                scores[key] = (scores[key] ?? 0) + 0.1;
            }
        }
    }
    return scores;
}
/**
 * Update learning style profile.
 */
export async function updateLearningStyle(userId, text) {
    const detected = detectLearningStyleFromText(text);
    if (Object.keys(detected).length === 0)
        return;
    let style = learningStyleCache.get(userId) ?? (await loadLearningStyle(userId));
    if (!style) {
        style = {
            userId,
            primary: 'reflection_driven',
            scores: {
                dataDriven: 0.25,
                storyDriven: 0.25,
                experienceDriven: 0.25,
                reflectionDriven: 0.25,
            },
            indicators: [],
            lastUpdated: new Date(),
        };
    }
    // Update scores
    for (const [key, value] of Object.entries(detected)) {
        const scoreKey = key;
        style.scores[scoreKey] = clamp(style.scores[scoreKey] + value);
    }
    // Normalize scores
    const total = Object.values(style.scores).reduce((a, b) => a + b, 0);
    if (total > 0) {
        for (const key of Object.keys(style.scores)) {
            style.scores[key] /= total;
        }
    }
    // Determine primary
    const entries = Object.entries(style.scores);
    const sorted = entries.sort((a, b) => b[1] - a[1]);
    if (sorted[0][1] > CONFIG.LEARNING_STYLE_THRESHOLD) {
        const styleMap = {
            dataDriven: 'data_driven',
            storyDriven: 'story_driven',
            experienceDriven: 'experience_driven',
            reflectionDriven: 'reflection_driven',
        };
        style.primary = styleMap[sorted[0][0]];
    }
    // Add indicator
    if (Object.keys(detected).length > 0) {
        style.indicators.push(text.slice(0, 100));
        style.indicators = style.indicators.slice(-10);
    }
    style.lastUpdated = new Date();
    // Save
    await saveLearningStyle(userId, style);
    learningStyleCache.set(userId, style);
}
/**
 * Get learning style.
 */
export async function getLearningStyle(userId) {
    const cached = learningStyleCache.get(userId);
    if (cached)
        return cached;
    return loadLearningStyle(userId);
}
// ============================================================================
// RESISTANCE PATTERNS
// ============================================================================
/**
 * Record topic deflection.
 */
export async function recordDeflection(userId, topic) {
    let resistance = resistanceCache.get(userId) ?? (await loadResistancePattern(userId));
    if (!resistance) {
        resistance = {
            userId,
            deflectedTopics: [],
            closedOffPatterns: [],
            pushbackPatterns: [],
            lastUpdated: new Date(),
        };
    }
    const existing = resistance.deflectedTopics.find((d) => d.topic === topic);
    if (existing) {
        existing.deflectionCount++;
        existing.lastDeflection = new Date();
    }
    else {
        resistance.deflectedTopics.push({
            topic,
            deflectionCount: 1,
            lastDeflection: new Date(),
        });
    }
    resistance.lastUpdated = new Date();
    await saveResistancePattern(userId, resistance);
    resistanceCache.set(userId, resistance);
}
/**
 * Record pushback.
 */
export async function recordPushback(userId, trigger, response) {
    let resistance = resistanceCache.get(userId) ?? (await loadResistancePattern(userId));
    if (!resistance) {
        resistance = {
            userId,
            deflectedTopics: [],
            closedOffPatterns: [],
            pushbackPatterns: [],
            lastUpdated: new Date(),
        };
    }
    const existing = resistance.pushbackPatterns.find((p) => p.trigger === trigger);
    if (existing) {
        existing.frequency++;
    }
    else {
        resistance.pushbackPatterns.push({
            trigger,
            response,
            frequency: 1,
        });
    }
    resistance.lastUpdated = new Date();
    await saveResistancePattern(userId, resistance);
    resistanceCache.set(userId, resistance);
}
/**
 * Get resistance patterns.
 */
export async function getResistancePattern(userId) {
    const cached = resistanceCache.get(userId);
    if (cached)
        return cached;
    return loadResistancePattern(userId);
}
/**
 * Check if topic is sensitive.
 */
export async function isTopicSensitive(userId, topic) {
    const resistance = await getResistancePattern(userId);
    if (!resistance)
        return false;
    const deflected = resistance.deflectedTopics.find((d) => d.topic.toLowerCase() === topic.toLowerCase() && d.deflectionCount >= 2);
    return !!deflected;
}
// ============================================================================
// COACHING RECOMMENDATIONS
// ============================================================================
/**
 * Get coaching recommendations for this user.
 */
export async function getCoachingRecommendations(userId, topic) {
    const [effectiveness, learningStyle, resistance] = await Promise.all([
        getEffectivenessProfile(userId),
        getLearningStyle(userId),
        getResistancePattern(userId),
    ]);
    const recommendation = {
        approach: 'balanced',
        framing: 'neutral',
        timing: 'when they bring it up',
        warnings: [],
    };
    // Approach recommendation
    if (effectiveness &&
        effectiveness.totalOutcomesTracked >= CONFIG.MIN_OUTCOMES_FOR_EFFECTIVENESS) {
        const best = await getBestApproach(userId);
        if (best) {
            const approachMap = {
                directSuggestions: 'Be direct with suggestions',
                gentleNudges: 'Use gentle nudges',
                questioningApproach: 'Ask questions to guide them',
                storytelling: 'Use stories and examples',
                dataAndEvidence: 'Share data and research',
                emotionalValidation: 'Validate emotions first',
            };
            recommendation.approach = approachMap[best.approach] ?? 'balanced';
        }
        // Framing recommendation
        const framing = effectiveness.framingPreferences;
        if (framing.positiveBased > framing.negativeBased &&
            framing.positiveBased > framing.neutralBased) {
            recommendation.framing = 'positive (focus on gains)';
        }
        else if (framing.negativeBased > framing.positiveBased) {
            recommendation.framing = 'loss-aversion (focus on what they might miss)';
        }
        // Topic resistance
        if (topic && effectiveness.resistantTopics.includes(topic)) {
            recommendation.warnings.push(`They've resisted advice about ${topic} before`);
        }
    }
    // Learning style adjustment
    if (learningStyle) {
        const styleAdvice = {
            data_driven: 'Include data and evidence',
            story_driven: 'Use relatable stories',
            experience_driven: 'Suggest experiments they can try',
            reflection_driven: 'Give them space to process',
        };
        recommendation.approach += ` - ${styleAdvice[learningStyle.primary]}`;
    }
    // Resistance warnings
    if (resistance && topic) {
        const deflected = resistance.deflectedTopics.find((d) => d.topic.toLowerCase() === topic.toLowerCase());
        if (deflected && deflected.deflectionCount >= 2) {
            recommendation.warnings.push(`They tend to deflect this topic (${deflected.deflectionCount}x)`);
            recommendation.timing = 'approach very gently';
        }
    }
    return recommendation;
}
// ============================================================================
// FORMAT FOR CONTEXT
// ============================================================================
/**
 * Format coaching intelligence for LLM context.
 */
export async function formatCoachingContext(userId, topic) {
    const recommendations = await getCoachingRecommendations(userId, topic);
    const learningStyle = await getLearningStyle(userId);
    const lines = [
        '═══════════════════════════════════════════════════════════',
        'COACHING INTELLIGENCE - How to help THIS person',
        '═══════════════════════════════════════════════════════════',
        '',
    ];
    lines.push(`RECOMMENDED APPROACH: ${recommendations.approach}`);
    lines.push(`FRAMING: ${recommendations.framing}`);
    lines.push(`TIMING: ${recommendations.timing}`);
    if (learningStyle) {
        lines.push('');
        lines.push(`LEARNING STYLE: ${learningStyle.primary.replace('_', ' ')}`);
    }
    if (recommendations.warnings.length > 0) {
        lines.push('');
        lines.push('⚠️ WARNINGS:');
        for (const warning of recommendations.warnings) {
            lines.push(`  - ${warning}`);
        }
    }
    lines.push('');
    lines.push('═══════════════════════════════════════════════════════════');
    return lines.join('\n');
}
// ============================================================================
// HELPERS
// ============================================================================
function clamp(value, min = 0, max = 1) {
    return Math.max(min, Math.min(max, value));
}
function createDefaultProfile(userId) {
    return {
        userId,
        effectiveApproaches: {
            directSuggestions: 0.5,
            gentleNudges: 0.5,
            questioningApproach: 0.5,
            storytelling: 0.5,
            dataAndEvidence: 0.5,
            emotionalValidation: 0.5,
        },
        receptiveTopics: [],
        resistantTopics: [],
        framingPreferences: {
            positiveBased: 0.33,
            negativeBased: 0.33,
            neutralBased: 0.34,
        },
        totalAdviceGiven: 0,
        totalOutcomesTracked: 0,
        lastUpdated: new Date(),
    };
}
// ============================================================================
// PERSISTENCE
// ============================================================================
async function loadEffectivenessProfile(userId) {
    const db = getFirestoreDb();
    if (!db)
        return null;
    try {
        const doc = await db
            .collection('bogle_users')
            .doc(userId)
            .collection('coaching_intelligence')
            .doc('effectiveness')
            .get();
        if (!doc.exists)
            return null;
        const data = doc.data();
        return {
            ...data,
            lastUpdated: data.lastUpdated?.toDate?.() ?? new Date(data.lastUpdated),
        };
    }
    catch (error) {
        log.warn({ error: String(error), userId }, 'Failed to load effectiveness profile');
        return null;
    }
}
async function saveEffectivenessProfile(userId, profile) {
    const db = getFirestoreDb();
    if (!db)
        return;
    try {
        await db
            .collection('bogle_users')
            .doc(userId)
            .collection('coaching_intelligence')
            .doc('effectiveness')
            .set(cleanForFirestore(profile));
    }
    catch (error) {
        log.warn({ error: String(error), userId }, 'Failed to save effectiveness profile');
    }
}
async function loadLearningStyle(userId) {
    const db = getFirestoreDb();
    if (!db)
        return null;
    try {
        const doc = await db
            .collection('bogle_users')
            .doc(userId)
            .collection('coaching_intelligence')
            .doc('learning_style')
            .get();
        if (!doc.exists)
            return null;
        const data = doc.data();
        return {
            ...data,
            lastUpdated: data.lastUpdated?.toDate?.() ?? new Date(data.lastUpdated),
        };
    }
    catch (error) {
        log.warn({ error: String(error), userId }, 'Failed to load learning style');
        return null;
    }
}
async function saveLearningStyle(userId, style) {
    const db = getFirestoreDb();
    if (!db)
        return;
    try {
        await db
            .collection('bogle_users')
            .doc(userId)
            .collection('coaching_intelligence')
            .doc('learning_style')
            .set(cleanForFirestore(style));
    }
    catch (error) {
        log.warn({ error: String(error), userId }, 'Failed to save learning style');
    }
}
async function loadResistancePattern(userId) {
    const db = getFirestoreDb();
    if (!db)
        return null;
    try {
        const doc = await db
            .collection('bogle_users')
            .doc(userId)
            .collection('coaching_intelligence')
            .doc('resistance')
            .get();
        if (!doc.exists)
            return null;
        const data = doc.data();
        return {
            ...data,
            deflectedTopics: (data.deflectedTopics ?? []).map((d) => ({
                ...d,
                lastDeflection: typeof d.lastDeflection === 'object' && d.lastDeflection && 'toDate' in d.lastDeflection
                    ? d.lastDeflection.toDate()
                    : new Date(d.lastDeflection),
            })),
            lastUpdated: data.lastUpdated && typeof data.lastUpdated === 'object' && 'toDate' in data.lastUpdated
                ? data.lastUpdated.toDate()
                : new Date(data.lastUpdated),
        };
    }
    catch (error) {
        log.warn({ error: String(error), userId }, 'Failed to load resistance pattern');
        return null;
    }
}
async function saveResistancePattern(userId, pattern) {
    const db = getFirestoreDb();
    if (!db)
        return;
    try {
        await db
            .collection('bogle_users')
            .doc(userId)
            .collection('coaching_intelligence')
            .doc('resistance')
            .set(cleanForFirestore(pattern));
    }
    catch (error) {
        log.warn({ error: String(error), userId }, 'Failed to save resistance pattern');
    }
}
// ============================================================================
// CACHE MANAGEMENT
// ============================================================================
export function clearCoachingCache(userId) {
    if (userId) {
        effectivenessCache.delete(userId);
        learningStyleCache.delete(userId);
        resistanceCache.delete(userId);
    }
    else {
        effectivenessCache.clear();
        learningStyleCache.clear();
        resistanceCache.clear();
    }
}
// ============================================================================
// EXPORTS
// ============================================================================
export const coachingIntelligence = {
    // Effectiveness
    recordOutcome: recordAdviceOutcome,
    getEffectiveness: getEffectivenessProfile,
    getBestApproach,
    // Learning style
    detectStyle: detectLearningStyleFromText,
    updateStyle: updateLearningStyle,
    getStyle: getLearningStyle,
    // Resistance
    recordDeflection,
    recordPushback,
    getResistance: getResistancePattern,
    isTopicSensitive,
    // Recommendations
    getRecommendations: getCoachingRecommendations,
    // Context
    format: formatCoachingContext,
    // Cache
    clearCache: clearCoachingCache,
};
export default coachingIntelligence;
//# sourceMappingURL=coaching-intelligence.js.map