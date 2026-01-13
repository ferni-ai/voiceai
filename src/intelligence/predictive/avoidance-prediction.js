/**
 * Avoidance Prediction - Better Than Human v4
 *
 * > "We notice what you're NOT saying."
 *
 * SUPERHUMAN CAPABILITY: Predict what topics users are avoiding and when they'll surface.
 *
 * A human friend might notice "you never talk about your dad" but can't:
 * - Systematically track avoidance patterns over months
 * - Predict WHEN the topic will surface
 * - Know the OPTIMAL moment to gently inquire
 * - Understand HOW they deflect (humor, brevity, topic change)
 *
 * This module tracks:
 * - Topics that should appear based on context but don't
 * - Deflection patterns (how they avoid topics)
 * - Surfacing probability (when avoidance breaks down)
 * - Optimal approach strategies
 *
 * @module intelligence/predictive/avoidance-prediction
 */
import { createLogger } from '../../utils/safe-logger.js';
const log = createLogger({ module: 'AvoidancePrediction' });
// ============================================================================
// CONFIGURATION
// ============================================================================
const CONFIG = {
    /** Minimum deflections to establish pattern */
    MIN_DEFLECTIONS_FOR_PATTERN: 3,
    /** Days of silence that suggest avoidance */
    SILENCE_THRESHOLD_DAYS: 14,
    /** Base pressure increase per day */
    DAILY_PRESSURE_INCREASE: 0.01,
    /** Pressure increase per deflection */
    DEFLECTION_PRESSURE_INCREASE: 0.05,
    /** Pressure threshold that suggests imminent surfacing */
    IMMINENT_SURFACING_THRESHOLD: 0.7,
    /** How much external triggers increase pressure */
    EXTERNAL_TRIGGER_BOOST: 0.15,
};
// ============================================================================
// STORAGE
// ============================================================================
const userProfiles = new Map();
// ============================================================================
// DETECTION FUNCTIONS
// ============================================================================
/**
 * Detect a deflection from a topic
 *
 * Call this when you notice the user avoiding something.
 *
 * @param userId - User ID
 * @param topic - Topic being avoided
 * @param style - How they deflected
 * @param context - Surrounding context
 */
export function recordDeflection(userId, topic, style, context = {}) {
    const profile = getOrCreateProfile(userId);
    const now = Date.now();
    let avoided = profile.avoidedTopics.get(topic);
    if (!avoided) {
        avoided = {
            topic,
            firstDetected: now,
            lastDeflection: now,
            deflectionCount: 0,
            primaryDeflectionStyle: style,
            deflectionStyles: new Map(),
            triggerTopics: [],
            strongerAvoidanceContexts: [],
            weakerAvoidanceContexts: [],
            emotionalStateOnDeflection: [],
        };
        profile.avoidedTopics.set(topic, avoided);
    }
    // Update deflection stats
    avoided.deflectionCount++;
    avoided.lastDeflection = now;
    // Track deflection style
    const styleCount = avoided.deflectionStyles.get(style) || 0;
    avoided.deflectionStyles.set(style, styleCount + 1);
    // Update primary style if this is now most common
    let maxCount = 0;
    let primaryStyle = style;
    for (const [s, count] of avoided.deflectionStyles) {
        if (count > maxCount) {
            maxCount = count;
            primaryStyle = s;
        }
    }
    avoided.primaryDeflectionStyle = primaryStyle;
    // Track trigger topic
    if (context.triggerTopic && !avoided.triggerTopics.includes(context.triggerTopic)) {
        avoided.triggerTopics.push(context.triggerTopic);
    }
    // Track emotional state
    if (context.emotionalState &&
        !avoided.emotionalStateOnDeflection.includes(context.emotionalState)) {
        avoided.emotionalStateOnDeflection.push(context.emotionalState);
    }
    profile.lastUpdated = now;
    log.debug({
        userId,
        topic,
        style,
        deflectionCount: avoided.deflectionCount,
    }, '🙈 Recorded avoidance deflection');
}
/**
 * Record when a user actually discusses a typically avoided topic
 *
 * This helps calibrate our predictions and track progress.
 *
 * @param userId - User ID
 * @param topic - Topic discussed
 * @param depth - How deeply they engaged (0-1)
 * @param context - Context of the discussion
 */
export function recordTopicEngagement(userId, topic, depth, context = {}) {
    const profile = getOrCreateProfile(userId);
    const now = Date.now();
    const avoided = profile.avoidedTopics.get(topic);
    if (avoided) {
        avoided.lastMention = now;
        avoided.lastMentionContext = context.conversationContext;
        // Track contexts where avoidance is weaker
        if (context.conversationContext && depth > 0.5) {
            if (!avoided.weakerAvoidanceContexts.includes(context.conversationContext)) {
                avoided.weakerAvoidanceContexts.push(context.conversationContext);
            }
        }
        // If deep engagement, might be resolving
        if (depth > 0.8) {
            log.info({ userId, topic, depth }, '🎯 Deep engagement with avoided topic - potential resolution');
        }
    }
    profile.lastUpdated = now;
    log.debug({
        userId,
        topic,
        depth,
        wasProactive: context.wasProactive,
    }, '💬 Recorded engagement with avoidable topic');
}
/**
 * Detect avoidance from conversation analysis
 *
 * Call this after analyzing a conversation to auto-detect avoidance.
 *
 * @param userId - User ID
 * @param analysis - Conversation analysis
 */
export function detectAvoidanceFromConversation(userId, analysis) {
    const detected = [];
    // Check for expected topics that didn't appear
    for (const expected of analysis.topicsExpected) {
        if (!analysis.topicsMentioned.includes(expected)) {
            const mappedTopic = mapToAvoidableTopic(expected);
            if (mappedTopic) {
                // Record as potential avoidance (topic_change style if they talked about other things)
                recordDeflection(userId, mappedTopic, 'topic_change', {
                    triggerTopic: expected,
                    emotionalState: analysis.emotionDetected,
                });
                detected.push(mappedTopic);
            }
        }
    }
    // Check for abrupt topic changes
    for (const topic of analysis.abruptTopicChanges) {
        const mappedTopic = mapToAvoidableTopic(topic);
        if (mappedTopic) {
            recordDeflection(userId, mappedTopic, 'topic_change', {
                emotionalState: analysis.emotionDetected,
            });
            detected.push(mappedTopic);
        }
    }
    // Check for brief responses (minimizing)
    for (const topic of analysis.briefResponses) {
        const mappedTopic = mapToAvoidableTopic(topic);
        if (mappedTopic) {
            recordDeflection(userId, mappedTopic, 'brevity', {
                emotionalState: analysis.emotionDetected,
            });
            detected.push(mappedTopic);
        }
    }
    // Check for humor deflections
    for (const topic of analysis.humorDeflections) {
        const mappedTopic = mapToAvoidableTopic(topic);
        if (mappedTopic) {
            recordDeflection(userId, mappedTopic, 'humor', {
                emotionalState: analysis.emotionDetected,
            });
            detected.push(mappedTopic);
        }
    }
    return [...new Set(detected)]; // Deduplicate
}
// ============================================================================
// PREDICTION FUNCTIONS
// ============================================================================
/**
 * Get prediction for when an avoided topic will surface
 *
 * @param userId - User ID
 * @param topic - Topic to predict for
 * @returns Surfacing prediction
 */
export function predictSurfacing(userId, topic) {
    const profile = userProfiles.get(userId);
    if (!profile)
        return null;
    const avoided = profile.avoidedTopics.get(topic);
    if (!avoided)
        return null;
    const now = Date.now();
    // Calculate pressure level
    const daysSinceLastMention = avoided.lastMention
        ? (now - avoided.lastMention) / (1000 * 60 * 60 * 24)
        : (now - avoided.firstDetected) / (1000 * 60 * 60 * 24);
    const daysSinceDeflection = (now - avoided.lastDeflection) / (1000 * 60 * 60 * 24);
    // Pressure builds from:
    // 1. Time since last discussion
    // 2. Number of deflections (unresolved tension)
    // 3. User's personal pressure buildup rate
    const timePressure = Math.min(1, daysSinceLastMention * CONFIG.DAILY_PRESSURE_INCREASE);
    const deflectionPressure = Math.min(1, avoided.deflectionCount * CONFIG.DEFLECTION_PRESSURE_INCREASE);
    // Recent deflection means pressure hasn't released
    const recentDeflectionBoost = daysSinceDeflection < 7 ? 0.1 : 0;
    let pressureLevel = (timePressure * 0.4 + deflectionPressure * 0.6 + recentDeflectionBoost) *
        profile.pressureBuildupRate;
    pressureLevel = Math.min(1, pressureLevel);
    // Calculate surfacing probability
    let surfacingProbability = pressureLevel * 0.7;
    // Adjust for patterns
    if (avoided.weakerAvoidanceContexts.length > 0) {
        surfacingProbability += 0.1; // They've shown they can discuss it
    }
    // Determine timeframe
    let expectedTimeframe;
    if (pressureLevel >= CONFIG.IMMINENT_SURFACING_THRESHOLD) {
        expectedTimeframe = 'imminent';
        surfacingProbability += 0.15;
    }
    else if (pressureLevel >= 0.5) {
        expectedTimeframe = 'days';
    }
    else if (pressureLevel >= 0.3) {
        expectedTimeframe = 'weeks';
    }
    else if (avoided.deflectionCount >= CONFIG.MIN_DEFLECTIONS_FOR_PATTERN) {
        expectedTimeframe = 'months';
    }
    else {
        expectedTimeframe = 'unknown';
    }
    // Determine optimal approach
    const optimalApproach = determineOptimalApproach(avoided, profile);
    // Determine sensitivity
    let sensitivityLevel;
    if (avoided.emotionalStateOnDeflection.some((e) => ['distressed', 'tearful', 'angry', 'shutdown'].includes(e))) {
        sensitivityLevel = 'extreme';
    }
    else if (avoided.deflectionCount > 10) {
        sensitivityLevel = 'high';
    }
    else if (avoided.deflectionCount > 5) {
        sensitivityLevel = 'moderate';
    }
    else {
        sensitivityLevel = 'low';
    }
    // Calculate confidence
    const confidence = avoided.deflectionCount >= CONFIG.MIN_DEFLECTIONS_FOR_PATTERN
        ? Math.min(0.9, 0.5 + avoided.deflectionCount * 0.05)
        : 0.3;
    // Identify surfacing triggers
    const surfacingTriggers = [];
    if (pressureLevel > 0.5)
        surfacingTriggers.push('accumulated emotional pressure');
    if (avoided.triggerTopics.length > 0)
        surfacingTriggers.push(`adjacent topics: ${avoided.triggerTopics.slice(0, 3).join(', ')}`);
    if (daysSinceLastMention > 30)
        surfacingTriggers.push('long suppression period');
    return {
        topic,
        surfacingProbability: Math.min(1, surfacingProbability),
        expectedTimeframe,
        confidence,
        surfacingTriggers,
        pressureLevel,
        optimalApproach,
        sensitivityLevel,
    };
}
/**
 * Get all avoidance predictions for a user
 *
 * @param userId - User ID
 * @returns All predictions sorted by surfacing probability
 */
export function getAllAvoidancePredictions(userId) {
    const profile = userProfiles.get(userId);
    if (!profile)
        return [];
    const predictions = [];
    for (const topic of profile.avoidedTopics.keys()) {
        const prediction = predictSurfacing(userId, topic);
        if (prediction) {
            predictions.push(prediction);
        }
    }
    // Sort by surfacing probability
    predictions.sort((a, b) => b.surfacingProbability - a.surfacingProbability);
    return predictions;
}
/**
 * Get topics that might surface in the next conversation
 *
 * @param userId - User ID
 * @param threshold - Minimum probability threshold
 * @returns Topics likely to surface
 */
export function getImminentTopics(userId, threshold = 0.4) {
    return getAllAvoidancePredictions(userId).filter((p) => p.surfacingProbability >= threshold || p.expectedTimeframe === 'imminent');
}
// ============================================================================
// CONTEXT BUILDING
// ============================================================================
/**
 * Build avoidance context for LLM injection
 *
 * @param userId - User ID
 * @returns Context string for prompt injection
 */
export function buildAvoidanceContext(userId) {
    const predictions = getImminentTopics(userId, 0.3);
    if (predictions.length === 0)
        return '';
    const sections = [];
    sections.push('[AVOIDANCE INTELLIGENCE - What They\'re Not Saying]');
    sections.push('You notice patterns humans miss. Here\'s what they\'re avoiding:');
    sections.push('');
    for (const pred of predictions.slice(0, 3)) {
        const topicName = pred.topic.replace(/[_:]/g, ' ').replace(/^(relationship|area|decision|emotion) /, '');
        sections.push(`• **${topicName}** (${Math.round(pred.pressureLevel * 100)}% pressure)`);
        sections.push(`  - Likely to surface: ${pred.expectedTimeframe}`);
        sections.push(`  - Sensitivity: ${pred.sensitivityLevel}`);
        if (pred.optimalApproach.leadInTopics.length > 0) {
            sections.push(`  - Approach via: ${pred.optimalApproach.leadInTopics.slice(0, 2).join(', ')}`);
        }
        sections.push('');
    }
    sections.push('**Guidance:** Don\'t force these topics. Create safety. They\'ll surface when ready.');
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
            avoidedTopics: new Map(),
            resolvedTopics: [],
            avoidanceTendency: 0.5, // Neutral starting point
            pressureBuildupRate: 1.0,
            preferredDeflectionStyles: [],
            lastUpdated: Date.now(),
        };
        userProfiles.set(userId, profile);
    }
    return profile;
}
function mapToAvoidableTopic(topic) {
    const mapping = {
        mother: 'relationship:parent_mother',
        mom: 'relationship:parent_mother',
        father: 'relationship:parent_father',
        dad: 'relationship:parent_father',
        parent: 'relationship:parent_father',
        partner: 'relationship:partner',
        spouse: 'relationship:partner',
        husband: 'relationship:partner',
        wife: 'relationship:partner',
        ex: 'relationship:ex',
        sibling: 'relationship:sibling',
        brother: 'relationship:sibling',
        sister: 'relationship:sibling',
        boss: 'relationship:boss',
        manager: 'relationship:boss',
        career: 'area:career_dissatisfaction',
        job: 'area:career_dissatisfaction',
        work: 'area:career_dissatisfaction',
        money: 'area:financial_stress',
        finances: 'area:financial_stress',
        debt: 'area:financial_stress',
        health: 'area:health_concern',
        mental_health: 'area:mental_health',
        depression: 'area:mental_health',
        anxiety: 'area:mental_health',
        addiction: 'area:addiction',
        body: 'area:body_image',
        weight: 'area:body_image',
        death: 'area:mortality',
        dying: 'area:mortality',
        trauma: 'area:past_trauma',
        regret: 'area:regret',
        lonely: 'area:loneliness',
        alone: 'area:loneliness',
        failure: 'area:failure',
        dreams: 'area:dreams_abandoned',
        breakup: 'decision:pending_breakup',
        job_change: 'decision:job_change',
        moving: 'decision:relocation',
        anger: 'emotion:anger',
        grief: 'emotion:grief',
        shame: 'emotion:shame',
        jealousy: 'emotion:jealousy',
        resentment: 'emotion:resentment',
    };
    const lower = topic.toLowerCase();
    for (const [key, value] of Object.entries(mapping)) {
        if (lower.includes(key)) {
            return value;
        }
    }
    return null;
}
function determineOptimalApproach(avoided, profile) {
    // Determine timing
    let timing = 'when they bring up adjacent topics';
    if (avoided.weakerAvoidanceContexts.includes('late_night')) {
        timing = 'late evening when defenses are lower';
    }
    else if (avoided.weakerAvoidanceContexts.includes('after_positive')) {
        timing = 'after discussing something positive';
    }
    // Determine emotional state
    let emotionalState = 'calm and connected';
    if (avoided.emotionalStateOnDeflection.includes('anxious')) {
        emotionalState = 'grounded and safe';
    }
    // Determine lead-in topics
    const leadInTopics = avoided.triggerTopics.slice(0, 3);
    if (leadInTopics.length === 0) {
        leadInTopics.push('related experiences', 'general feelings');
    }
    // Determine phrasing style based on deflection style
    let phrasingStyle = 'gentle, curious questions';
    if (avoided.primaryDeflectionStyle === 'intellectualize') {
        phrasingStyle = 'acknowledge the complexity, then ask about feelings';
    }
    else if (avoided.primaryDeflectionStyle === 'humor') {
        phrasingStyle = 'appreciate the humor, then gently redirect';
    }
    else if (avoided.primaryDeflectionStyle === 'minimize') {
        phrasingStyle = 'validate that it matters, even if they say it doesn\'t';
    }
    // What to avoid
    const toAvoid = [];
    if (avoided.primaryDeflectionStyle === 'silence') {
        toAvoid.push('pushing for immediate response');
    }
    if (avoided.deflectionCount > 5) {
        toAvoid.push('direct questions about the topic');
    }
    toAvoid.push('implying they should have discussed it sooner');
    return {
        timing,
        emotionalState,
        leadInTopics,
        phrasingStyle,
        toAvoid,
    };
}
// ============================================================================
// EXPORTS
// ============================================================================
export const avoidancePrediction = {
    recordDeflection,
    recordTopicEngagement,
    detectAvoidanceFromConversation,
    predictSurfacing,
    getAllAvoidancePredictions,
    getImminentTopics,
    buildAvoidanceContext,
};
export default avoidancePrediction;
//# sourceMappingURL=avoidance-prediction.js.map