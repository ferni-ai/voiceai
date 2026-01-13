/**
 * Intervention Timing Optimization - Better Than Human v4
 *
 * > "We know the exact right moment for every type of support."
 *
 * SUPERHUMAN CAPABILITY: Learn the optimal timing for specific types
 * of interventions for each user.
 *
 * Not just "when to reach out" but "when to challenge vs validate vs
 * celebrate vs stay silent" - for THIS specific person.
 *
 * A human friend might know you're a morning person, but can't:
 * - Track which interventions work at which times
 * - Know when challenges land vs when they backfire
 * - Learn your personal rhythm for different support types
 * - Optimize based on emotional state, topic, and timing together
 *
 * @module intelligence/predictive/intervention-timing
 */
import { createLogger } from '../../utils/safe-logger.js';
const log = createLogger({ module: 'InterventionTiming' });
// ============================================================================
// CONFIGURATION
// ============================================================================
const CONFIG = {
    /** Default optimal conditions per intervention type */
    DEFAULT_CONDITIONS: {
        gentle_challenge: {
            emotionalStates: ['calm', 'confident', 'motivated'],
            requiredContext: [],
            timeOfDay: ['morning', 'afternoon'],
            dayOfWeek: [1, 2, 3, 4, 5], // Weekdays
            recencyRange: { min: 0, max: 3 },
            contraindications: ['stressed', 'overwhelmed', 'sad', 'crisis'],
        },
        reframe_suggestion: {
            emotionalStates: ['stuck', 'frustrated', 'confused', 'neutral'],
            requiredContext: ['repeated_topic'],
            timeOfDay: ['afternoon', 'evening'],
            dayOfWeek: [0, 1, 2, 3, 4, 5, 6],
            recencyRange: { min: 0, max: 7 },
            contraindications: ['defensive', 'angry'],
        },
        habit_reminder: {
            emotionalStates: ['neutral', 'motivated', 'calm'],
            requiredContext: ['habit_context'],
            timeOfDay: ['morning'],
            dayOfWeek: [1, 2, 3, 4, 5],
            recencyRange: { min: 1, max: 7 },
            contraindications: ['overwhelmed', 'crisis', 'stressed'],
        },
        emotional_check_in: {
            emotionalStates: ['any'],
            requiredContext: [],
            timeOfDay: ['evening', 'afternoon'],
            dayOfWeek: [0, 3, 6], // Sunday, Wednesday, Saturday
            recencyRange: { min: 2, max: 14 },
            contraindications: [],
        },
        celebration: {
            emotionalStates: ['happy', 'proud', 'excited', 'relieved'],
            requiredContext: ['achievement'],
            timeOfDay: ['any'],
            dayOfWeek: [0, 1, 2, 3, 4, 5, 6],
            recencyRange: { min: 0, max: 1 },
            contraindications: ['sad', 'grieving'],
        },
        hard_truth: {
            emotionalStates: ['calm', 'grounded', 'ready'],
            requiredContext: ['trust_established', 'asked_for_honesty'],
            timeOfDay: ['morning', 'afternoon'],
            dayOfWeek: [1, 2, 3, 4], // Mid-week
            recencyRange: { min: 0, max: 2 },
            contraindications: ['vulnerable', 'crisis', 'tired', 'stressed', 'defensive'],
        },
        silence: {
            emotionalStates: ['processing', 'grieving', 'overwhelmed'],
            requiredContext: ['needs_space'],
            timeOfDay: ['any'],
            dayOfWeek: [0, 1, 2, 3, 4, 5, 6],
            recencyRange: { min: 0, max: 14 },
            contraindications: ['reaching_out', 'seeking_connection'],
        },
        proactive_outreach: {
            emotionalStates: ['any'],
            requiredContext: [],
            timeOfDay: ['morning', 'early_evening'],
            dayOfWeek: [2, 3, 4], // Tue-Thu
            recencyRange: { min: 3, max: 14 },
            contraindications: ['requested_space'],
        },
        deep_question: {
            emotionalStates: ['reflective', 'calm', 'curious', 'open'],
            requiredContext: ['trust_established'],
            timeOfDay: ['evening', 'late_night'],
            dayOfWeek: [0, 5, 6], // Weekends + Friday
            recencyRange: { min: 0, max: 3 },
            contraindications: ['rushed', 'distracted', 'surface_mode'],
        },
        practical_advice: {
            emotionalStates: ['seeking_guidance', 'stuck', 'confused'],
            requiredContext: ['asked_for_advice'],
            timeOfDay: ['morning', 'afternoon'],
            dayOfWeek: [1, 2, 3, 4, 5],
            recencyRange: { min: 0, max: 7 },
            contraindications: ['venting_mode', 'emotional'],
        },
        validation: {
            emotionalStates: ['any_emotional'],
            requiredContext: [],
            timeOfDay: ['any'],
            dayOfWeek: [0, 1, 2, 3, 4, 5, 6],
            recencyRange: { min: 0, max: 7 },
            contraindications: ['seeking_challenge'],
        },
        accountability: {
            emotionalStates: ['motivated', 'committed', 'ready'],
            requiredContext: ['commitment_made'],
            timeOfDay: ['morning'],
            dayOfWeek: [1, 2, 3, 4, 5],
            recencyRange: { min: 1, max: 7 },
            contraindications: ['fragile', 'crisis', 'overwhelmed'],
        },
        encouragement: {
            emotionalStates: ['discouraged', 'doubtful', 'struggling', 'tired'],
            requiredContext: [],
            timeOfDay: ['any'],
            dayOfWeek: [0, 1, 2, 3, 4, 5, 6],
            recencyRange: { min: 0, max: 7 },
            contraindications: [],
        },
        perspective_shift: {
            emotionalStates: ['stuck', 'narrow_focus', 'spiral'],
            requiredContext: [],
            timeOfDay: ['afternoon', 'evening'],
            dayOfWeek: [0, 1, 2, 3, 4, 5, 6],
            recencyRange: { min: 0, max: 7 },
            contraindications: ['needs_validation_first'],
        },
        grounding: {
            emotionalStates: ['anxious', 'spiraling', 'overwhelmed', 'disconnected'],
            requiredContext: [],
            timeOfDay: ['any'],
            dayOfWeek: [0, 1, 2, 3, 4, 5, 6],
            recencyRange: { min: 0, max: 7 },
            contraindications: [],
        },
        humor: {
            emotionalStates: ['tense', 'stressed', 'neutral', 'recovering'],
            requiredContext: ['good_rapport'],
            timeOfDay: ['any'],
            dayOfWeek: [0, 1, 2, 3, 4, 5, 6],
            recencyRange: { min: 0, max: 7 },
            contraindications: ['grieving', 'crisis', 'serious_topic'],
        },
        boundary_support: {
            emotionalStates: ['conflicted', 'resentful', 'overwhelmed'],
            requiredContext: ['boundary_topic'],
            timeOfDay: ['morning', 'afternoon'],
            dayOfWeek: [1, 2, 3, 4],
            recencyRange: { min: 0, max: 7 },
            contraindications: ['exhausted', 'crisis'],
        },
        presence: {
            emotionalStates: ['any'],
            requiredContext: [],
            timeOfDay: ['any'],
            dayOfWeek: [0, 1, 2, 3, 4, 5, 6],
            recencyRange: { min: 0, max: 14 },
            contraindications: [],
        },
    },
    /** Maximum outcomes to store */
    MAX_OUTCOMES: 200,
    /** Minimum observations for pattern confidence */
    MIN_OBSERVATIONS: 5,
    /** Learning rate for pattern updates */
    LEARNING_RATE: 0.15,
};
// ============================================================================
// STORAGE
// ============================================================================
const userProfiles = new Map();
// ============================================================================
// OUTCOME RECORDING
// ============================================================================
/**
 * Record an intervention outcome
 *
 * @param userId - User ID
 * @param outcome - What happened
 */
export function recordInterventionOutcome(userId, outcome) {
    const profile = getOrCreateProfile(userId);
    const now = Date.now();
    const fullOutcome = {
        ...outcome,
        timestamp: now,
    };
    profile.outcomes.push(fullOutcome);
    // Trim outcomes
    if (profile.outcomes.length > CONFIG.MAX_OUTCOMES) {
        profile.outcomes = profile.outcomes.slice(-CONFIG.MAX_OUTCOMES);
    }
    // Update pattern based on outcome
    updatePattern(profile, fullOutcome);
    profile.lastUpdated = now;
    log.debug({
        userId,
        interventionType: outcome.interventionType,
        outcome: outcome.outcome,
        effectiveness: outcome.effectivenessScore.toFixed(2),
    }, '⏰ Recorded intervention outcome');
}
/**
 * Record a quick success/failure for an intervention
 *
 * @param userId - User ID
 * @param interventionType - What was tried
 * @param success - Did it work?
 * @param context - Current context
 */
export function recordQuickOutcome(userId, interventionType, success, context = {}) {
    const now = new Date();
    const hour = now.getHours();
    let timeOfDay;
    if (hour < 12)
        timeOfDay = 'morning';
    else if (hour < 17)
        timeOfDay = 'afternoon';
    else if (hour < 21)
        timeOfDay = 'evening';
    else
        timeOfDay = 'night';
    recordInterventionOutcome(userId, {
        interventionType,
        conditions: {
            emotionalState: context.emotionalState,
            topic: context.topic,
            timeOfDay,
            dayOfWeek: now.getDay(),
            daysSinceLastConversation: 0, // Current conversation
        },
        outcome: success ? 'positive' : 'negative',
        responseType: success ? 'accepted' : 'deflected',
        effectivenessScore: success ? 0.8 : 0.2,
    });
}
// ============================================================================
// TIMING RECOMMENDATIONS
// ============================================================================
/**
 * Get recommendation for a specific intervention
 *
 * @param userId - User ID
 * @param interventionType - What intervention to evaluate
 * @param context - Current context
 * @returns Timing recommendation
 */
export function getTimingRecommendation(userId, interventionType, context = {}) {
    const profile = userProfiles.get(userId);
    const now = new Date();
    const hour = now.getHours();
    const dayOfWeek = now.getDay();
    // Get conditions (learned or default)
    const pattern = profile?.patterns.get(interventionType);
    const conditions = pattern?.optimalConditions ||
        CONFIG.DEFAULT_CONDITIONS[interventionType];
    // Calculate optimality score
    let optimalityScore = 0;
    let factors = 0;
    const reasoning = [];
    // Check time of day
    let currentTimeOfDay;
    if (hour < 12)
        currentTimeOfDay = 'morning';
    else if (hour < 17)
        currentTimeOfDay = 'afternoon';
    else if (hour < 21)
        currentTimeOfDay = 'evening';
    else
        currentTimeOfDay = 'night';
    if (conditions.timeOfDay.includes(currentTimeOfDay) || conditions.timeOfDay.includes('any')) {
        optimalityScore += 1;
        reasoning.push(`Good time (${currentTimeOfDay})`);
    }
    else {
        reasoning.push(`Not optimal time (prefer ${conditions.timeOfDay.join('/')})`);
    }
    factors++;
    // Check day of week
    if (conditions.dayOfWeek.includes(dayOfWeek)) {
        optimalityScore += 1;
        reasoning.push(`Good day`);
    }
    else {
        reasoning.push(`Not optimal day`);
    }
    factors++;
    // Check emotional state
    if (context.emotionalState) {
        if (conditions.emotionalStates.includes(context.emotionalState) ||
            conditions.emotionalStates.includes('any')) {
            optimalityScore += 1.5; // Emotional state is important
            reasoning.push(`Emotional state matches (${context.emotionalState})`);
        }
        else if (conditions.contraindications.includes(context.emotionalState)) {
            optimalityScore -= 2; // Strong negative
            reasoning.push(`⚠️ Emotional state is a contraindication`);
        }
        else {
            reasoning.push(`Emotional state neutral`);
        }
        factors++;
    }
    // Check contraindications
    const activeContraindications = [];
    if (context.emotionalState && conditions.contraindications.includes(context.emotionalState)) {
        activeContraindications.push(context.emotionalState);
    }
    // Check recency
    const daysSince = context.daysSinceLastConversation ?? 0;
    if (daysSince >= conditions.recencyRange.min && daysSince <= conditions.recencyRange.max) {
        optimalityScore += 0.5;
        reasoning.push(`Good timing relative to last conversation`);
    }
    else if (daysSince < conditions.recencyRange.min) {
        reasoning.push(`Might be too soon`);
    }
    else {
        optimalityScore += 0.3; // Overdue is usually still okay
        reasoning.push(`Overdue for this intervention`);
    }
    factors++;
    // Add historical success rate if available
    const historicalSuccess = pattern?.successRate ?? 0.5;
    if (pattern && pattern.observations >= CONFIG.MIN_OBSERVATIONS) {
        optimalityScore += historicalSuccess;
        factors++;
        reasoning.push(`Historical success: ${Math.round(historicalSuccess * 100)}%`);
    }
    // Normalize
    const normalizedScore = Math.max(0, Math.min(1, optimalityScore / factors));
    // Determine risk level
    let riskLevel = 'low';
    if (activeContraindications.length > 0) {
        riskLevel = 'high';
    }
    else if (normalizedScore < 0.4) {
        riskLevel = 'moderate';
    }
    // Find alternative if not recommended
    let alternative;
    let betterTiming;
    if (normalizedScore < 0.5 || riskLevel === 'high') {
        // Find better alternative
        const allTypes = [
            'validation', 'encouragement', 'emotional_check_in', 'celebration',
            'practical_advice', 'accountability', 'gentle_challenge',
        ];
        let bestAlt = null;
        let bestAltScore = 0;
        for (const altType of allTypes) {
            if (altType === interventionType)
                continue;
            const altRec = evaluateIntervention(profile, altType, context);
            if (altRec > bestAltScore) {
                bestAltScore = altRec;
                bestAlt = altType;
            }
        }
        if (bestAlt && bestAltScore > normalizedScore) {
            alternative = {
                type: bestAlt,
                optimalityScore: bestAltScore,
            };
        }
        // Suggest better timing
        if (conditions.timeOfDay.length > 0 && !conditions.timeOfDay.includes(currentTimeOfDay)) {
            betterTiming = `Try ${conditions.timeOfDay[0]} instead`;
        }
    }
    return {
        interventionType,
        recommended: normalizedScore >= 0.5 && riskLevel !== 'high',
        optimalityScore: normalizedScore,
        reasoning: reasoning.join('. '),
        alternative,
        betterTiming,
        riskLevel,
        historicalSuccess,
    };
}
/**
 * Get all intervention recommendations for current moment
 *
 * @param userId - User ID
 * @param context - Current context
 * @returns All recommendations sorted by optimality
 */
export function getAllTimingRecommendations(userId, context = {}) {
    const allTypes = [
        'gentle_challenge', 'reframe_suggestion', 'habit_reminder',
        'emotional_check_in', 'celebration', 'hard_truth', 'silence',
        'proactive_outreach', 'deep_question', 'practical_advice',
        'validation', 'accountability', 'encouragement', 'perspective_shift',
        'grounding', 'humor', 'boundary_support',
    ];
    const recommendations = allTypes.map((type) => getTimingRecommendation(userId, type, context));
    return recommendations.sort((a, b) => b.optimalityScore - a.optimalityScore);
}
/**
 * Get the best intervention for right now
 *
 * @param userId - User ID
 * @param context - Current context
 * @returns Best recommendation
 */
export function getBestIntervention(userId, context = {}) {
    const all = getAllTimingRecommendations(userId, context);
    return all[0];
}
// ============================================================================
// CONTEXT BUILDING
// ============================================================================
/**
 * Build intervention timing context for LLM injection
 *
 * @param userId - User ID
 * @param context - Current context
 * @returns Context string for prompt injection
 */
export function buildInterventionTimingContext(userId, context = {}) {
    const recommendations = getAllTimingRecommendations(userId, context);
    const topRecommended = recommendations.filter((r) => r.recommended).slice(0, 3);
    const toAvoid = recommendations.filter((r) => r.riskLevel === 'high').slice(0, 2);
    if (topRecommended.length === 0 && toAvoid.length === 0)
        return '';
    const sections = [];
    sections.push('[INTERVENTION TIMING - Right Moment for Right Support]');
    sections.push('You know their unique rhythm:');
    sections.push('');
    if (topRecommended.length > 0) {
        sections.push('**Good Now:**');
        for (const rec of topRecommended) {
            const typeName = rec.interventionType.replace(/_/g, ' ');
            sections.push(`• ${typeName} (${Math.round(rec.optimalityScore * 100)}% optimal)`);
            if (rec.historicalSuccess > 0.7) {
                sections.push(`  → Works well for them (${Math.round(rec.historicalSuccess * 100)}% success)`);
            }
        }
        sections.push('');
    }
    if (toAvoid.length > 0) {
        sections.push('**Avoid Now:**');
        for (const rec of toAvoid) {
            const typeName = rec.interventionType.replace(/_/g, ' ');
            sections.push(`• ${typeName} - ${rec.reasoning.split('.')[0]}`);
        }
        sections.push('');
    }
    // Best intervention
    const best = topRecommended[0];
    if (best) {
        sections.push(`**Best Approach:** ${best.interventionType.replace(/_/g, ' ')}`);
    }
    return sections.join('\n');
}
// ============================================================================
// HELPER FUNCTIONS
// ============================================================================
function getOrCreateProfile(userId) {
    let profile = userProfiles.get(userId);
    if (!profile) {
        profile = {
            userId,
            patterns: new Map(),
            outcomes: [],
            globalPreferences: {
                bestDaysForDeepWork: [1, 2, 3, 4], // Default: weekdays
                bestTimeForChallenge: 'morning',
                needsWarmupTime: true,
                sensitiveToTiming: false,
            },
            lastUpdated: Date.now(),
        };
        userProfiles.set(userId, profile);
    }
    return profile;
}
function updatePattern(profile, outcome) {
    let pattern = profile.patterns.get(outcome.interventionType);
    if (!pattern) {
        pattern = {
            interventionType: outcome.interventionType,
            optimalConditions: { ...CONFIG.DEFAULT_CONDITIONS[outcome.interventionType] },
            successRate: 0.5,
            observations: 0,
            confidence: 0.2,
            lastUpdated: Date.now(),
        };
        profile.patterns.set(outcome.interventionType, pattern);
    }
    const lr = CONFIG.LEARNING_RATE;
    pattern.observations++;
    // Update success rate
    const wasSuccessful = outcome.outcome === 'positive' ? 1 : 0;
    pattern.successRate = pattern.successRate * (1 - lr) + wasSuccessful * lr;
    // Update confidence
    pattern.confidence = Math.min(0.9, 0.2 + pattern.observations * 0.05);
    // Learn from conditions
    if (outcome.outcome === 'positive') {
        // This was a good time - reinforce conditions
        if (outcome.conditions.emotionalState) {
            if (!pattern.optimalConditions.emotionalStates.includes(outcome.conditions.emotionalState)) {
                pattern.optimalConditions.emotionalStates.push(outcome.conditions.emotionalState);
            }
        }
        // Add time of day if not present
        const timeOfDay = outcome.conditions.timeOfDay;
        if (!pattern.optimalConditions.timeOfDay.includes(timeOfDay)) {
            pattern.optimalConditions.timeOfDay.push(timeOfDay);
        }
        // Add day of week if not present
        if (!pattern.optimalConditions.dayOfWeek.includes(outcome.conditions.dayOfWeek)) {
            pattern.optimalConditions.dayOfWeek.push(outcome.conditions.dayOfWeek);
        }
    }
    else if (outcome.outcome === 'negative') {
        // This was a bad time - add to contraindications
        if (outcome.conditions.emotionalState) {
            if (!pattern.optimalConditions.contraindications.includes(outcome.conditions.emotionalState)) {
                pattern.optimalConditions.contraindications.push(outcome.conditions.emotionalState);
            }
            // Remove from positive if present
            pattern.optimalConditions.emotionalStates =
                pattern.optimalConditions.emotionalStates.filter((s) => s !== outcome.conditions.emotionalState);
        }
    }
    pattern.lastUpdated = Date.now();
}
function evaluateIntervention(profile, interventionType, context) {
    const pattern = profile?.patterns.get(interventionType);
    const conditions = pattern?.optimalConditions || CONFIG.DEFAULT_CONDITIONS[interventionType];
    let score = 0;
    let factors = 0;
    const now = new Date();
    const hour = now.getHours();
    const dayOfWeek = now.getDay();
    let currentTimeOfDay;
    if (hour < 12)
        currentTimeOfDay = 'morning';
    else if (hour < 17)
        currentTimeOfDay = 'afternoon';
    else if (hour < 21)
        currentTimeOfDay = 'evening';
    else
        currentTimeOfDay = 'night';
    // Time of day
    if (conditions.timeOfDay.includes(currentTimeOfDay)) {
        score += 1;
    }
    factors++;
    // Day of week
    if (conditions.dayOfWeek.includes(dayOfWeek)) {
        score += 1;
    }
    factors++;
    // Emotional state
    if (context.emotionalState) {
        if (conditions.emotionalStates.includes(context.emotionalState)) {
            score += 1.5;
        }
        else if (conditions.contraindications.includes(context.emotionalState)) {
            score -= 2;
        }
        factors++;
    }
    // Historical success
    if (pattern && pattern.observations >= CONFIG.MIN_OBSERVATIONS) {
        score += pattern.successRate;
        factors++;
    }
    return Math.max(0, Math.min(1, score / factors));
}
// ============================================================================
// EXPORTS
// ============================================================================
export const interventionTiming = {
    recordInterventionOutcome,
    recordQuickOutcome,
    getTimingRecommendation,
    getAllTimingRecommendations,
    getBestIntervention,
    buildInterventionTimingContext,
};
export default interventionTiming;
//# sourceMappingURL=intervention-timing.js.map