/**
 * Growth Reflection System
 *
 * Noticing and reflecting back someone's evolution over time.
 * "A year ago, you would have spiraled. Look at you now."
 *
 * Philosophy: One of the most validating things a friend can do is
 * notice your growth before you see it yourself. This system tracks
 * patterns over time and surfaces moments of meaningful change.
 *
 * This system tracks:
 * - How they respond to similar situations over time
 * - Changes in emotional regulation
 * - Shifts in perspective or values
 * - Progress on stated goals
 * - New coping strategies they've developed
 *
 * @module GrowthReflection
 */
import { createLogger } from '../../utils/safe-logger.js';
import { indexGrowthReflection } from '../data-layer/integrations/trust-integration.js';
const log = createLogger({ module: 'GrowthReflection' });
// ============================================================================
// GROWTH DETECTION PATTERNS
// ============================================================================
/** Phrases indicating emotional regulation growth */
const REGULATION_GROWTH = {
    before: [
        'i always freak out',
        'i spiral',
        "i can't handle",
        'it destroys me',
        'i shut down',
        'i lash out',
    ],
    after: [
        'i noticed i was getting',
        'i took a breath',
        'i sat with it',
        "i didn't react",
        'i gave myself space',
        'i let it pass',
    ],
};
/** Phrases indicating perspective shifts */
const PERSPECTIVE_GROWTH = {
    before: [
        "it's always my fault",
        'everyone thinks',
        "i'll never",
        "it's impossible",
        "i can't",
        "they're all",
    ],
    after: [
        'i realize now',
        "i've started to see",
        "maybe it's not",
        'i wonder if',
        'what if',
        'looking back',
    ],
};
/** Phrases indicating boundary growth */
const BOUNDARY_GROWTH = {
    before: [
        "i couldn't say no",
        'i let them',
        "i didn't want to upset",
        'i just went along',
        'i felt guilty saying',
    ],
    after: [
        'i told them no',
        'i set a boundary',
        'i said what i needed',
        "i didn't apologize for",
        'i stood my ground',
    ],
};
// ============================================================================
// IN-MEMORY STORE
// ============================================================================
const growthProfiles = new Map();
function getOrCreateProfile(userId) {
    let profile = growthProfiles.get(userId);
    if (!profile) {
        profile = {
            userId,
            patterns: [],
            historicalResponses: [],
            valueEvolution: [],
            copingStrategies: [],
        };
        growthProfiles.set(userId, profile);
    }
    return profile;
}
// ============================================================================
// GROWTH DETECTION
// ============================================================================
/**
 * Record a response to a situation for historical tracking
 */
export function recordResponse(userId, situation, response, emotion, topic) {
    const profile = getOrCreateProfile(userId);
    profile.historicalResponses.push({
        situation,
        response,
        emotion,
        timestamp: new Date(),
        topic,
    });
    // Keep only last 100 responses
    if (profile.historicalResponses.length > 100) {
        profile.historicalResponses = profile.historicalResponses.slice(-100);
    }
    // Check for growth patterns
    detectGrowthPatterns(userId);
}
/**
 * Detect growth patterns by comparing recent vs historical responses
 */
function detectGrowthPatterns(userId) {
    const profile = growthProfiles.get(userId);
    if (!profile || profile.historicalResponses.length < 5)
        return;
    const recent = profile.historicalResponses.slice(-5);
    const older = profile.historicalResponses.slice(0, -5);
    // Check emotional regulation growth
    checkEmotionalRegulationGrowth(profile, recent, older);
    // Check perspective growth
    checkPerspectiveGrowth(profile, recent, older);
    // Check boundary growth
    checkBoundaryGrowth(profile, recent, older);
}
/**
 * Check for emotional regulation improvement
 */
function checkEmotionalRegulationGrowth(profile, recent, older) {
    // Look for old patterns of dysregulation
    const oldDysregulation = older.filter((r) => REGULATION_GROWTH.before.some((phrase) => r.response.toLowerCase().includes(phrase)));
    // Look for new patterns of regulation
    const newRegulation = recent.filter((r) => REGULATION_GROWTH.after.some((phrase) => r.response.toLowerCase().includes(phrase)));
    if (oldDysregulation.length >= 2 && newRegulation.length >= 2) {
        const existingPattern = profile.patterns.find((p) => p.type === 'emotional_regulation');
        if (existingPattern) {
            existingPattern.timesObserved++;
            existingPattern.confidence = Math.min(existingPattern.confidence + 0.1, 0.95);
        }
        else {
            const pattern = {
                id: `growth_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
                type: 'emotional_regulation',
                before: {
                    pattern: 'Struggled with emotional reactions',
                    examples: oldDysregulation.map((r) => r.response.slice(0, 100)),
                    firstSeen: oldDysregulation[0]?.timestamp || new Date(),
                },
                after: {
                    pattern: 'Better at regulating emotional responses',
                    examples: newRegulation.map((r) => r.response.slice(0, 100)),
                    firstSeen: newRegulation[0]?.timestamp || new Date(),
                },
                significance: 'notable',
                confidence: 0.6,
                timesObserved: 1,
                reflectedBack: false,
            };
            profile.patterns.push(pattern);
            // Index to semantic memory
            indexGrowthReflection(profile.userId, {
                id: pattern.id,
                observation: pattern.after.pattern,
                area: pattern.type,
                evidence: pattern.after.examples.join('; '),
            });
            log.info({ userId: profile.userId, type: 'emotional_regulation' }, '🌱 Growth pattern detected');
        }
    }
}
/**
 * Check for perspective shifts
 */
function checkPerspectiveGrowth(profile, recent, older) {
    const oldRigid = older.filter((r) => PERSPECTIVE_GROWTH.before.some((phrase) => r.response.toLowerCase().includes(phrase)));
    const newFlexible = recent.filter((r) => PERSPECTIVE_GROWTH.after.some((phrase) => r.response.toLowerCase().includes(phrase)));
    if (oldRigid.length >= 2 && newFlexible.length >= 1) {
        const existingPattern = profile.patterns.find((p) => p.type === 'perspective_shift');
        if (!existingPattern) {
            const pattern = {
                id: `growth_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
                type: 'perspective_shift',
                before: {
                    pattern: 'More rigid thinking patterns',
                    examples: oldRigid.map((r) => r.response.slice(0, 100)),
                    firstSeen: oldRigid[0]?.timestamp || new Date(),
                },
                after: {
                    pattern: 'More flexible, curious perspective',
                    examples: newFlexible.map((r) => r.response.slice(0, 100)),
                    firstSeen: newFlexible[0]?.timestamp || new Date(),
                },
                significance: 'subtle',
                confidence: 0.5,
                timesObserved: 1,
                reflectedBack: false,
            };
            profile.patterns.push(pattern);
            // Index to semantic memory
            indexGrowthReflection(profile.userId, {
                id: pattern.id,
                observation: pattern.after.pattern,
                area: pattern.type,
                evidence: pattern.after.examples.join('; '),
            });
            log.info({ userId: profile.userId, type: 'perspective_shift' }, '🌱 Growth pattern detected');
        }
    }
}
/**
 * Check for boundary-setting growth
 */
function checkBoundaryGrowth(profile, recent, older) {
    const oldPoorBoundaries = older.filter((r) => BOUNDARY_GROWTH.before.some((phrase) => r.response.toLowerCase().includes(phrase)));
    const newGoodBoundaries = recent.filter((r) => BOUNDARY_GROWTH.after.some((phrase) => r.response.toLowerCase().includes(phrase)));
    if (oldPoorBoundaries.length >= 1 && newGoodBoundaries.length >= 1) {
        const existingPattern = profile.patterns.find((p) => p.type === 'boundary_setting');
        if (!existingPattern) {
            const pattern = {
                id: `growth_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
                type: 'boundary_setting',
                before: {
                    pattern: 'Difficulty setting/holding boundaries',
                    examples: oldPoorBoundaries.map((r) => r.response.slice(0, 100)),
                    firstSeen: oldPoorBoundaries[0]?.timestamp || new Date(),
                },
                after: {
                    pattern: 'Asserting boundaries more clearly',
                    examples: newGoodBoundaries.map((r) => r.response.slice(0, 100)),
                    firstSeen: newGoodBoundaries[0]?.timestamp || new Date(),
                },
                significance: 'transformative',
                confidence: 0.65,
                timesObserved: 1,
                reflectedBack: false,
            };
            profile.patterns.push(pattern);
            // Index to semantic memory
            indexGrowthReflection(profile.userId, {
                id: pattern.id,
                observation: pattern.after.pattern,
                area: pattern.type,
                evidence: pattern.after.examples.join('; '),
            });
            log.info({ userId: profile.userId, type: 'boundary_setting' }, '🌱 Growth pattern detected');
        }
    }
}
// ============================================================================
// GROWTH REFLECTION GENERATION
// ============================================================================
/**
 * Generate a reflection to share with the user
 */
export function generateGrowthReflection(userId, context) {
    const profile = growthProfiles.get(userId);
    if (!profile || profile.patterns.length === 0)
        return null;
    // "Better than Human" - Surface growth reflections more generously
    // Friends notice growth even when it's early. We should too.
    //
    // Find a pattern that:
    // 1. Hasn't been reflected back yet
    // 2. Has decent confidence (lowered from 0.6 to 0.5)
    // 3. Has been observed at least once (lowered from 2 to 1 for notable+ growth)
    const eligiblePatterns = profile.patterns.filter((p) => {
        if (p.reflectedBack)
            return false;
        if (p.confidence < 0.5)
            return false;
        // For transformative growth, share after just 1 observation
        if (p.significance === 'transformative' && p.timesObserved >= 1)
            return true;
        // For notable growth, share after 1-2 observations
        if (p.significance === 'notable' && p.timesObserved >= 1)
            return true;
        // For subtle growth, still require 2+ observations
        if (p.timesObserved >= 2)
            return true;
        return false;
    });
    if (eligiblePatterns.length === 0)
        return null;
    // Prefer patterns relevant to current context
    let pattern = eligiblePatterns[0];
    if (context?.currentTopic) {
        const relevant = eligiblePatterns.find((p) => p.before.examples.some((e) => e.toLowerCase().includes(context.currentTopic.toLowerCase())) ||
            p.after.examples.some((e) => e.toLowerCase().includes(context.currentTopic.toLowerCase())));
        if (relevant)
            pattern = relevant;
    }
    // Generate the reflection based on type
    const reflection = createReflection(pattern);
    return {
        pattern,
        reflection: reflection.text,
        timing: pattern.significance === 'transformative' ? 'now' : 'next_relevant_moment',
        ssml: reflection.ssml,
    };
}
/**
 * Create the actual reflection text
 */
function createReflection(pattern) {
    const reflections = {
        emotional_regulation: [
            "You know what I've noticed? The way you're handling this now is different from before. You're not spiraling - you're actually sitting with it.",
            "A while back, this kind of thing would've knocked you off balance. But look at you - you're processing it, not just reacting.",
            "I see growth here. The old you might have shut down. This version of you? You're present with it.",
        ],
        perspective_shift: [
            "I've noticed something shift in how you see things. You used to speak in absolutes - 'always' and 'never.' Now you're asking 'what if.'",
            "There's more curiosity in how you're approaching this than I've seen before. That's real growth.",
            "You're seeing shades of gray where you used to see black and white. That's not nothing.",
        ],
        boundary_setting: [
            "Can I tell you what I see? You're holding your ground now. That's different from before, when you'd bend to avoid conflict.",
            "You said no. You didn't apologize for it. That's huge growth from where you started.",
            "Remember when saying no felt impossible? Look at you now - setting boundaries like it's just... what you do.",
        ],
        behavior_change: [
            "You're responding differently than you used to. Same situation, but you - you're different.",
            "I've watched you grow in how you handle these moments. It's subtle but it's real.",
        ],
        self_awareness: [
            "You caught yourself. You saw your pattern in real time. That's not easy to do.",
            "The fact that you can name what's happening - that's growth. Before, you were just in it.",
        ],
        coping_upgrade: [
            "Your toolkit has expanded. The strategies you're using now? They're healthier than what you had before.",
            "You found something that actually helps. That's not nothing - that's real progress.",
        ],
        goal_progress: [
            "Look how far you've come from where you started. The progress might feel slow to you, but from here? It's visible.",
            "You're closer than you think. The steps you've taken - they add up.",
        ],
    };
    const options = reflections[pattern.type] || reflections.behavior_change;
    const text = options[Math.floor(Math.random() * options.length)];
    // Create SSML version with thoughtful pacing
    const ssml = text
        .replace(/\. /g, ". <break time='300ms'/> ")
        .replace(/\?/g, "? <break time='400ms'/> ")
        .replace(/ - /g, " <break time='200ms'/> ");
    return { text, ssml };
}
/**
 * Record that we reflected growth back and how they responded
 */
export function recordReflectionResponse(userId, patternId, response) {
    const profile = growthProfiles.get(userId);
    if (!profile)
        return;
    const pattern = profile.patterns.find((p) => p.id === patternId);
    if (pattern) {
        pattern.reflectedBack = true;
        pattern.responseToReflection = response;
        // If it resonated, increase confidence
        if (response === 'resonated' || response === 'emotional') {
            pattern.confidence = Math.min(pattern.confidence + 0.15, 0.95);
        }
        log.info({ userId, patternId, response }, '🪞 Growth reflection recorded');
    }
}
// ============================================================================
// PROFILE ACCESS
// ============================================================================
/**
 * Get unreflected growth patterns
 */
export function getUnreflectedGrowth(userId) {
    const profile = growthProfiles.get(userId);
    if (!profile)
        return [];
    return profile.patterns.filter((p) => !p.reflectedBack && p.confidence >= 0.6 && p.timesObserved >= 2);
}
/**
 * Generate a growth reflection with lowered thresholds
 * Use this for special moments like:
 * - First returning session
 * - Time-based milestones (1 month, 3 months, etc.)
 * - When user is discussing a topic where they've grown
 *
 * Philosophy: Sometimes we want to notice growth earlier, especially
 * for returning users who might not have hit the standard thresholds yet.
 */
export function generateEarlyGrowthReflection(userId, context) {
    const profile = growthProfiles.get(userId);
    if (!profile || profile.patterns.length === 0)
        return null;
    // Lower thresholds for early detection
    // - confidence >= 0.4 (vs 0.6)
    // - timesObserved >= 1 (vs 2)
    const eligiblePatterns = profile.patterns.filter((p) => !p.reflectedBack && p.confidence >= 0.4 && p.timesObserved >= 1);
    if (eligiblePatterns.length === 0)
        return null;
    // Prefer patterns relevant to current context
    let pattern = eligiblePatterns[0];
    // For topic-relevant moments, prioritize matching topic
    if (context.reason === 'topic_relevant' && context.currentTopic) {
        const relevant = eligiblePatterns.find((p) => p.before.examples.some((e) => e.toLowerCase().includes(context.currentTopic.toLowerCase())) ||
            p.after.examples.some((e) => e.toLowerCase().includes(context.currentTopic.toLowerCase())));
        if (relevant)
            pattern = relevant;
    }
    // For emotional moments, prioritize emotional regulation patterns
    if (context.reason === 'emotional_moment') {
        const emotional = eligiblePatterns.find((p) => p.type === 'emotional_regulation');
        if (emotional)
            pattern = emotional;
    }
    // For returning users or time milestones, prioritize transformative changes
    if (context.reason === 'returning_user' || context.reason === 'time_milestone') {
        const transformative = eligiblePatterns.find((p) => p.significance === 'transformative');
        if (transformative)
            pattern = transformative;
    }
    const reflection = createReflection(pattern);
    log.info({ userId, reason: context.reason, patternType: pattern.type }, '🌱 Early growth reflection generated');
    return {
        pattern,
        reflection: reflection.text,
        timing: 'now', // Early reflections are meant to be shared
        ssml: reflection.ssml,
    };
}
/**
 * Check if this is a good moment to surface growth
 * Returns true if conditions are favorable for a growth reflection
 */
export function isGoodMomentForGrowth(userId, context) {
    const profile = growthProfiles.get(userId);
    // No growth data = no growth to surface
    if (!profile || profile.patterns.length === 0) {
        return { shouldSurface: false, reason: 'no_growth_data', useEarlyThreshold: false };
    }
    // "Better than Human" - Surface growth more generously
    // Friends notice and reflect back growth. We should too.
    // Check for milestone turns (more frequent now: every 5 turns starting at 5)
    const earlyMilestones = [5, 10, 15, 20, 25, 30];
    const laterMilestones = [50, 75, 100];
    if (earlyMilestones.includes(context.turnCount) ||
        laterMilestones.includes(context.turnCount) ||
        (context.turnCount > 100 && context.turnCount % 25 === 0)) {
        // Use early thresholds for earlier turns (more forgiving)
        const useEarly = context.turnCount <= 30;
        return { shouldSurface: true, reason: 'milestone_turn', useEarlyThreshold: useEarly };
    }
    // First returning session - great time for "I noticed something..."
    if (context.isReturningSession && context.turnCount <= 8) {
        return { shouldSurface: true, reason: 'returning_session', useEarlyThreshold: true };
    }
    // Time-based milestones (more frequent: every 2 weeks for first 2 months)
    const timeMilestones = [7, 14, 21, 30, 60, 90, 180, 365];
    if (context.daysSinceFirstSession && timeMilestones.includes(context.daysSinceFirstSession)) {
        const useEarly = context.daysSinceFirstSession <= 30;
        return { shouldSurface: true, reason: 'time_milestone', useEarlyThreshold: useEarly };
    }
    // Topic-relevant growth - if discussing a topic where they've grown
    if (context.currentTopic) {
        const topicRelevant = profile.patterns.some((p) => !p.reflectedBack &&
            (p.before.examples.some((e) => e.toLowerCase().includes(context.currentTopic.toLowerCase())) ||
                p.after.examples.some((e) => e.toLowerCase().includes(context.currentTopic.toLowerCase()))));
        if (topicRelevant) {
            return { shouldSurface: true, reason: 'topic_relevant', useEarlyThreshold: true };
        }
    }
    // Emotional moment related to previous struggles (lowered threshold from 0.7 to 0.6)
    if (context.emotionIntensity && context.emotionIntensity > 0.6) {
        const hasEmotionalGrowth = profile.patterns.some((p) => !p.reflectedBack && p.type === 'emotional_regulation');
        if (hasEmotionalGrowth) {
            return { shouldSurface: true, reason: 'emotional_moment', useEarlyThreshold: true };
        }
    }
    // "Better than Human" - NEW: Check for unreflected transformative growth
    // If we have transformative growth that hasn't been shared, find a natural moment
    const hasTransformativeGrowth = profile.patterns.some((p) => !p.reflectedBack && p.significance === 'transformative' && p.confidence >= 0.5);
    if (hasTransformativeGrowth && context.turnCount > 3 && context.turnCount % 7 === 0) {
        return { shouldSurface: true, reason: 'transformative_growth', useEarlyThreshold: true };
    }
    // "Better than Human" - NEW: Emotion matching (when current emotion matches growth pattern)
    if (context.currentEmotion) {
        const emotionMatchingGrowth = profile.patterns.some((p) => !p.reflectedBack &&
            p.before.examples.some((e) => e.toLowerCase().includes(context.currentEmotion.toLowerCase()) ||
                (context.currentEmotion === 'anxious' && e.toLowerCase().includes('stress')) ||
                (context.currentEmotion === 'sad' && e.toLowerCase().includes('down'))));
        if (emotionMatchingGrowth) {
            return { shouldSurface: true, reason: 'emotion_matching', useEarlyThreshold: true };
        }
    }
    return { shouldSurface: false, reason: 'no_trigger', useEarlyThreshold: false };
}
/**
 * Get a count of unreflected growth patterns at any threshold
 * Useful for session summaries and progress tracking
 */
export function getGrowthCount(userId) {
    const profile = growthProfiles.get(userId);
    if (!profile) {
        return { total: 0, unreflected: 0, byType: {} };
    }
    const byType = {};
    for (const pattern of profile.patterns) {
        byType[pattern.type] = (byType[pattern.type] || 0) + 1;
    }
    return {
        total: profile.patterns.length,
        unreflected: profile.patterns.filter((p) => !p.reflectedBack).length,
        byType,
    };
}
/**
 * Get all growth patterns for a user
 */
export function getGrowthPatterns(userId) {
    const profile = growthProfiles.get(userId);
    return profile?.patterns || [];
}
/**
 * Export growth profile for persistence
 */
export function exportGrowthProfile(userId) {
    return growthProfiles.get(userId) || null;
}
/**
 * Import growth profile from persistence
 */
export function importGrowthProfile(profile) {
    growthProfiles.set(profile.userId, profile);
    log.debug({ userId: profile.userId, patternCount: profile.patterns.length }, 'Imported growth profile');
}
// ============================================================================
// EXPORTS
// ============================================================================
export default {
    recordResponse,
    generateGrowthReflection,
    recordReflectionResponse,
    getUnreflectedGrowth,
    getGrowthPatterns,
    exportGrowthProfile,
    importGrowthProfile,
};
//# sourceMappingURL=growth-reflection.js.map