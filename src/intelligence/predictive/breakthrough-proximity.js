/**
 * Breakthrough Proximity Detection - Better Than Human v4
 *
 * > "We see the insight forming before you do."
 *
 * SUPERHUMAN CAPABILITY: Detect when users are approaching a breakthrough
 * and create optimal conditions for it to happen.
 *
 * A human mentor might sense "they're close to figuring something out" but can't:
 * - Systematically track the indicators across conversations
 * - Know the optimal catalyst question
 * - Understand what's blocking the breakthrough
 * - Create the precise conditions needed
 *
 * Breakthroughs have PATTERNS:
 * 1. Increased questioning of old beliefs
 * 2. More reflection and "I've been thinking" statements
 * 3. Circling back to the same topic from different angles
 * 4. Emotional intensity building around an issue
 * 5. Contradictions surfacing in their narrative
 *
 * @module intelligence/predictive/breakthrough-proximity
 */
import { createLogger } from '../../utils/safe-logger.js';
const log = createLogger({ module: 'BreakthroughProximity' });
// ============================================================================
// CONFIGURATION
// ============================================================================
const CONFIG = {
    /** Minimum indicators for proximity detection */
    MIN_INDICATORS: 3,
    /** How quickly indicators decay in relevance */
    INDICATOR_DECAY_DAYS: 14,
    /** Weight for recent vs older indicators */
    RECENCY_WEIGHT: 0.7,
    /** Threshold for "imminent" proximity */
    IMMINENT_THRESHOLD: 0.75,
    /** Threshold for "threshold" proximity (on the verge) */
    THRESHOLD_THRESHOLD: 0.9,
};
// ============================================================================
// STORAGE
// ============================================================================
const userProfiles = new Map();
// ============================================================================
// INDICATOR RECORDING
// ============================================================================
/**
 * Record a breakthrough indicator
 *
 * @param userId - User ID
 * @param indicator - The observed indicator
 * @param topic - Topic this relates to
 */
export function recordIndicator(userId, indicator, topic) {
    const profile = getOrCreateProfile(userId);
    const now = Date.now();
    // Get or create track for this topic
    let track = profile.activeTracks.get(topic);
    if (!track) {
        track = {
            id: `track_${now}_${Math.random().toString(36).slice(2, 8)}`,
            topic,
            indicators: [],
            blockages: [],
            startedAt: now,
            lastActivity: now,
            proximityHistory: [],
        };
        profile.activeTracks.set(topic, track);
    }
    // Add indicator
    track.indicators.push({
        ...indicator,
        topic,
        timestamp: now,
    });
    track.lastActivity = now;
    profile.lastUpdated = now;
    // Update proximity history
    const assessment = assessProximity(userId, topic);
    if (assessment) {
        track.proximityHistory.push({
            timestamp: now,
            proximity: assessment.proximity,
            probability: assessment.probability,
        });
    }
    log.debug({
        userId,
        topic,
        indicatorType: indicator.type,
        strength: indicator.strength,
        proximity: assessment?.proximity,
    }, '💡 Recorded breakthrough indicator');
}
/**
 * Record a blockage observation
 *
 * @param userId - User ID
 * @param topic - Topic this relates to
 * @param blockage - The observed blockage
 */
export function recordBlockage(userId, topic, blockage) {
    const profile = getOrCreateProfile(userId);
    const now = Date.now();
    const track = profile.activeTracks.get(topic);
    if (!track)
        return;
    // Generate addressing strategy
    const addressingStrategy = generateAddressingStrategy(blockage.type, profile);
    track.blockages.push({
        ...blockage,
        addressingStrategy,
    });
    track.lastActivity = now;
    profile.lastUpdated = now;
    log.debug({
        userId,
        topic,
        blockageType: blockage.type,
        strength: blockage.strength,
    }, '🚧 Recorded breakthrough blockage');
}
/**
 * Record that a breakthrough happened
 *
 * @param userId - User ID
 * @param topic - Topic of the breakthrough
 * @param type - Type of breakthrough
 * @param catalyst - What triggered it
 */
export function recordBreakthrough(userId, topic, type, catalyst) {
    const profile = getOrCreateProfile(userId);
    const now = Date.now();
    const track = profile.activeTracks.get(topic);
    // Record the breakthrough
    const precursorIndicators = track
        ? [...new Set(track.indicators.map((i) => i.type))]
        : [];
    const timeFromFirstIndicator = track
        ? now - track.startedAt
        : 0;
    profile.pastBreakthroughs.push({
        topic,
        type,
        timestamp: now,
        precursorIndicators,
        catalystType: catalyst,
        timeFromFirstIndicator,
        impact: 0.8, // Will be updated based on follow-up
    });
    // Update breakthrough style based on this experience
    updateBreakthroughStyle(profile);
    // Remove from active tracks
    profile.activeTracks.delete(topic);
    profile.lastUpdated = now;
    log.info({
        userId,
        topic,
        type,
        catalyst,
        precursorIndicators,
    }, '🎆 Breakthrough recorded!');
}
// ============================================================================
// PROXIMITY ASSESSMENT
// ============================================================================
/**
 * Assess how close a user is to a breakthrough on a topic
 *
 * @param userId - User ID
 * @param topic - Topic to assess
 * @returns Breakthrough proximity assessment
 */
export function assessProximity(userId, topic) {
    const profile = userProfiles.get(userId);
    if (!profile)
        return null;
    const track = profile.activeTracks.get(topic);
    if (!track || track.indicators.length < CONFIG.MIN_INDICATORS)
        return null;
    const now = Date.now();
    // Calculate indicator strength with decay
    let totalStrength = 0;
    let weightSum = 0;
    const indicatorCounts = new Map();
    for (const indicator of track.indicators) {
        const ageMs = now - indicator.timestamp;
        const ageDays = ageMs / (1000 * 60 * 60 * 24);
        const decayFactor = Math.pow(0.5, ageDays / CONFIG.INDICATOR_DECAY_DAYS);
        const weight = decayFactor * CONFIG.RECENCY_WEIGHT + (1 - CONFIG.RECENCY_WEIGHT);
        totalStrength += indicator.strength * weight;
        weightSum += weight;
        const count = indicatorCounts.get(indicator.type) || 0;
        indicatorCounts.set(indicator.type, count + 1);
    }
    const avgStrength = totalStrength / weightSum;
    // Diversity of indicators (more types = more confident)
    const indicatorDiversity = indicatorCounts.size / 10; // Normalized
    // Calculate blockage impact
    const blockageImpact = track.blockages.reduce((sum, b) => sum + b.strength, 0) /
        Math.max(1, track.blockages.length);
    // Calculate raw probability
    let probability = avgStrength * 0.5 + indicatorDiversity * 0.3 - blockageImpact * 0.2;
    probability = Math.max(0, Math.min(1, probability));
    // Adjust based on past breakthroughs (they may have a pattern)
    if (profile.pastBreakthroughs.length > 0) {
        const typicalDuration = profile.breakthroughStyle.typicalDuration;
        const currentDuration = now - track.startedAt;
        if (currentDuration > typicalDuration * 0.8) {
            probability += 0.15; // They're in their typical breakthrough window
        }
    }
    // Determine proximity level
    let proximity;
    if (probability >= CONFIG.THRESHOLD_THRESHOLD) {
        proximity = 'threshold';
    }
    else if (probability >= CONFIG.IMMINENT_THRESHOLD) {
        proximity = 'imminent';
    }
    else if (probability >= 0.4) {
        proximity = 'approaching';
    }
    else {
        proximity = 'distant';
    }
    // Determine breakthrough type
    const potentialBreakthroughType = inferBreakthroughType(track.indicators, topic);
    // Generate predicted insight
    const predictedInsight = generatePredictedInsight(track.indicators, topic, potentialBreakthroughType);
    // Generate optimal conditions
    const optimalConditions = generateOptimalConditions(track, profile, potentialBreakthroughType);
    // Generate catalyst questions
    const catalystQuestions = generateCatalystQuestions(track, potentialBreakthroughType, predictedInsight);
    // Generate anti-patterns
    const antiPatterns = generateAntiPatterns(track.blockages, profile);
    // Calculate impact potential
    const impactPotential = calculateImpactPotential(potentialBreakthroughType, track);
    // Calculate confidence
    const confidence = Math.min(0.9, 0.3 + track.indicators.length * 0.05 + indicatorDiversity * 0.2);
    return {
        userId,
        topic,
        potentialBreakthroughType,
        proximity,
        probability: Math.min(1, probability),
        confidence,
        indicators: track.indicators,
        blockages: track.blockages,
        predictedInsight,
        optimalConditions,
        catalystQuestions,
        antiPatterns,
        impactPotential,
    };
}
/**
 * Get all active breakthrough assessments for a user
 *
 * @param userId - User ID
 * @returns All proximity assessments sorted by probability
 */
export function getAllBreakthroughAssessments(userId) {
    const profile = userProfiles.get(userId);
    if (!profile)
        return [];
    const assessments = [];
    for (const topic of profile.activeTracks.keys()) {
        const assessment = assessProximity(userId, topic);
        if (assessment) {
            assessments.push(assessment);
        }
    }
    // Sort by probability
    assessments.sort((a, b) => b.probability - a.probability);
    return assessments;
}
/**
 * Get imminent breakthroughs (high probability)
 *
 * @param userId - User ID
 * @returns High-probability breakthrough assessments
 */
export function getImminentBreakthroughs(userId) {
    return getAllBreakthroughAssessments(userId).filter((a) => a.proximity === 'imminent' || a.proximity === 'threshold');
}
// ============================================================================
// CONTEXT BUILDING
// ============================================================================
/**
 * Build breakthrough context for LLM injection
 *
 * @param userId - User ID
 * @returns Context string for prompt injection
 */
export function buildBreakthroughContext(userId) {
    const assessments = getImminentBreakthroughs(userId);
    if (assessments.length === 0)
        return '';
    const sections = [];
    sections.push('[BREAKTHROUGH INTELLIGENCE - Insights Forming]');
    sections.push('You sense they\'re approaching a breakthrough. Be the midwife to their insight.');
    sections.push('');
    for (const assessment of assessments.slice(0, 2)) {
        sections.push(`• **Topic:** ${assessment.topic}`);
        sections.push(`  - Proximity: ${assessment.proximity} (${Math.round(assessment.probability * 100)}%)`);
        sections.push(`  - Likely insight: "${assessment.predictedInsight}"`);
        sections.push(`  - Tone: ${assessment.optimalConditions.conversationTone}`);
        if (assessment.catalystQuestions.length > 0) {
            sections.push(`  - Catalyst question: "${assessment.catalystQuestions[0]}"`);
        }
        if (assessment.blockages.length > 0) {
            sections.push(`  - Blockage: ${assessment.blockages[0].type.replace(/_/g, ' ')}`);
        }
        sections.push('');
    }
    sections.push('**Your role:** Don\'t give them the answer. Help them find it themselves.');
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
            activeTracks: new Map(),
            pastBreakthroughs: [],
            breakthroughStyle: {
                typicalDuration: 14 * 24 * 60 * 60 * 1000, // 14 days default
                preferredCatalyst: 'question',
                predictiveIndicators: [],
                commonBlockages: [],
            },
            insightReadiness: 0.5,
            lastUpdated: Date.now(),
        };
        userProfiles.set(userId, profile);
    }
    return profile;
}
function inferBreakthroughType(indicators, topic) {
    // Count indicator types
    const typeCounts = new Map();
    for (const ind of indicators) {
        const count = typeCounts.get(ind.type) || 0;
        typeCounts.set(ind.type, count + 1);
    }
    // Topic-based inference
    const topicLower = topic.toLowerCase();
    if (topicLower.includes('relationship') || topicLower.includes('parent') ||
        topicLower.includes('partner')) {
        return 'relationship_insight';
    }
    if (topicLower.includes('decision') || topicLower.includes('choose') ||
        topicLower.includes('whether')) {
        return 'decision_clarity';
    }
    if (topicLower.includes('forgive') || topicLower.includes('resentment')) {
        return 'forgiveness';
    }
    if (topicLower.includes('grief') || topicLower.includes('loss')) {
        return 'grief_movement';
    }
    if (topicLower.includes('value') || topicLower.includes('matter')) {
        return 'value_alignment';
    }
    if (topicLower.includes('purpose') || topicLower.includes('meaning')) {
        return 'purpose_clarity';
    }
    // Indicator-based inference
    if (typeCounts.get('questioning_beliefs')) {
        return 'belief_shift';
    }
    if (typeCounts.get('connecting_dots') || typeCounts.get('circling_topic')) {
        return 'pattern_recognition';
    }
    if (typeCounts.get('emotional_intensity')) {
        return 'emotional_release';
    }
    if (typeCounts.get('past_reframing')) {
        return 'integration';
    }
    // Default
    return 'self_understanding';
}
function generatePredictedInsight(indicators, topic, type) {
    // Find most common content themes
    const contentWords = indicators
        .map((i) => i.content.toLowerCase().split(/\s+/))
        .flat();
    // Generate insight based on type
    switch (type) {
        case 'pattern_recognition':
            return `They're recognizing a pattern in how they approach ${topic}`;
        case 'belief_shift':
            return `They're questioning a core assumption about ${topic}`;
        case 'relationship_insight':
            return `They're understanding a dynamic in their relationship with ${topic}`;
        case 'decision_clarity':
            return `They're getting clarity on their true preference about ${topic}`;
        case 'emotional_release':
            return `They're ready to feel what they've been holding about ${topic}`;
        case 'value_alignment':
            return `They're realizing what truly matters to them about ${topic}`;
        case 'acceptance':
            return `They're moving toward accepting ${topic} as it is`;
        case 'forgiveness':
            return `They're ready to release the resentment about ${topic}`;
        case 'integration':
            return `They're integrating their experience with ${topic} into who they are now`;
        case 'purpose_clarity':
            return `They're understanding why ${topic} matters to their larger purpose`;
        default:
            return `They're approaching a deeper understanding of ${topic}`;
    }
}
function generateOptimalConditions(track, profile, type) {
    // Default conditions
    let conversationTone = 'reflecting';
    let timing = 'when they bring it up naturally';
    let pacing = 'follow_their_lead';
    const topics = [track.topic];
    const avoidTopics = [];
    let environment = 'private, unrushed';
    // Adjust based on breakthrough type
    switch (type) {
        case 'emotional_release':
            conversationTone = 'validating';
            timing = 'when they feel safe and have time';
            environment = 'private, quiet, no time pressure';
            break;
        case 'decision_clarity':
            conversationTone = 'socratic';
            timing = 'after they\'ve had time to process';
            break;
        case 'belief_shift':
            conversationTone = 'challenging';
            timing = 'when they\'re questioning themselves';
            pacing = 'slow';
            break;
        case 'forgiveness':
            conversationTone = 'witnessing';
            timing = 'when anger has softened';
            avoidTopics.push('rushing', 'should');
            break;
        case 'pattern_recognition':
            conversationTone = 'reflecting';
            timing = 'when they circle back to the topic';
            break;
        case 'integration':
            conversationTone = 'grounding';
            timing = 'when they\'re in a reflective mood';
            break;
    }
    // Adjust based on blockages
    for (const blockage of track.blockages) {
        if (blockage.type === 'overwhelm') {
            pacing = 'slow';
            avoidTopics.push('too much at once');
        }
        if (blockage.type === 'safety') {
            conversationTone = 'grounding';
            environment = 'established safety first';
        }
        if (blockage.type === 'intellectualization') {
            conversationTone = 'validating';
            avoidTopics.push('analysis without feeling');
        }
    }
    return {
        conversationTone,
        topics,
        avoidTopics,
        timing,
        environment,
        pacing,
    };
}
function generateCatalystQuestions(track, type, predictedInsight) {
    const questions = [];
    // Type-specific questions
    switch (type) {
        case 'pattern_recognition':
            questions.push('Have you noticed this showing up in other areas of your life?');
            questions.push('What does this remind you of?');
            questions.push('When was the first time you remember feeling this way?');
            break;
        case 'belief_shift':
            questions.push('What if that wasn\'t true?');
            questions.push('Who told you that, originally?');
            questions.push('What would change if you believed something different?');
            break;
        case 'decision_clarity':
            questions.push('If you knew you couldn\'t fail, what would you choose?');
            questions.push('What does your gut say, beneath all the analysis?');
            questions.push('What are you most afraid of about this decision?');
            break;
        case 'emotional_release':
            questions.push('What would happen if you let yourself feel that fully?');
            questions.push('Where do you feel that in your body?');
            questions.push('What does that part of you need to hear?');
            break;
        case 'relationship_insight':
            questions.push('What role do you play in this dynamic?');
            questions.push('What do you think they\'re really trying to say?');
            questions.push('What would shift if you saw it from their perspective?');
            break;
        case 'forgiveness':
            questions.push('What is this resentment costing you?');
            questions.push('What would you need to hear to let this go?');
            questions.push('Is holding onto this protecting you from something?');
            break;
        case 'value_alignment':
            questions.push('What does this tell you about what you really value?');
            questions.push('If you fully honored this value, what would change?');
            questions.push('What have you been sacrificing this for?');
            break;
        default:
            questions.push('What are you starting to see that you couldn\'t see before?');
            questions.push('What would shift if you really let yourself know this?');
            questions.push('What does this mean for who you want to become?');
    }
    return questions.slice(0, 5);
}
function generateAntiPatterns(blockages, profile) {
    const antiPatterns = [];
    // Universal anti-patterns
    antiPatterns.push('Don\'t give them the answer - let them find it');
    antiPatterns.push('Don\'t rush - breakthroughs have their own timing');
    // Blockage-specific
    for (const blockage of blockages) {
        switch (blockage.type) {
            case 'fear_of_change':
                antiPatterns.push('Don\'t push them to commit to change');
                break;
            case 'identity_threat':
                antiPatterns.push('Don\'t challenge their self-image directly');
                break;
            case 'grief_avoidance':
                antiPatterns.push('Don\'t force them to feel before they\'re ready');
                break;
            case 'shame_protection':
                antiPatterns.push('Don\'t imply there\'s something wrong with them');
                break;
            case 'overwhelm':
                antiPatterns.push('Don\'t add more to process right now');
                break;
            case 'external_validation':
                antiPatterns.push('Don\'t give permission they need to find themselves');
                break;
        }
    }
    return [...new Set(antiPatterns)].slice(0, 5);
}
function generateAddressingStrategy(type, profile) {
    switch (type) {
        case 'fear_of_change':
            return 'Acknowledge the fear as valid. Explore what they\'d gain AND lose.';
        case 'identity_threat':
            return 'Emphasize that insight adds to who they are, doesn\'t replace it.';
        case 'grief_avoidance':
            return 'Create safety for feeling. Normalize grief as part of growth.';
        case 'shame_protection':
            return 'Lead with unconditional acceptance. Share that this is human.';
        case 'relationship_stakes':
            return 'Explore what relationships could look like with the insight.';
        case 'overwhelm':
            return 'Break it down. Focus on one piece. Assure them there\'s time.';
        case 'intellectualization':
            return 'Gently redirect from thinking to feeling. Ask body questions.';
        case 'external_validation':
            return 'Reflect their wisdom back to them. They already know.';
        case 'timing':
            return 'Honor the pace. Plant seeds and let them germinate.';
        case 'safety':
            return 'Build safety first. Be consistent. Don\'t push.';
        case 'language_gap':
            return 'Offer multiple ways to express it. Use metaphors. Patience.';
        default:
            return 'Stay present and patient. The breakthrough will come.';
    }
}
function calculateImpactPotential(type, track) {
    // High-impact breakthrough types
    const highImpactTypes = [
        'purpose_clarity',
        'belief_shift',
        'forgiveness',
        'identity_evolution',
        'value_alignment',
    ];
    let impact = highImpactTypes.includes(type) ? 0.8 : 0.6;
    // Longer brewing = potentially more impactful
    const daysActive = (Date.now() - track.startedAt) / (1000 * 60 * 60 * 24);
    if (daysActive > 30)
        impact += 0.1;
    // More indicators = more substantial
    if (track.indicators.length > 10)
        impact += 0.1;
    return Math.min(1, impact);
}
function updateBreakthroughStyle(profile) {
    if (profile.pastBreakthroughs.length < 2)
        return;
    // Calculate typical duration
    const durations = profile.pastBreakthroughs.map((b) => b.timeFromFirstIndicator);
    profile.breakthroughStyle.typicalDuration =
        durations.reduce((a, b) => a + b, 0) / durations.length;
    // Find most common catalyst
    const catalystCounts = new Map();
    for (const b of profile.pastBreakthroughs) {
        const count = catalystCounts.get(b.catalystType) || 0;
        catalystCounts.set(b.catalystType, count + 1);
    }
    let maxCount = 0;
    for (const [catalyst, count] of catalystCounts) {
        if (count > maxCount) {
            maxCount = count;
            profile.breakthroughStyle.preferredCatalyst = catalyst;
        }
    }
    // Find predictive indicators
    const indicatorCounts = new Map();
    for (const b of profile.pastBreakthroughs) {
        for (const ind of b.precursorIndicators) {
            const count = indicatorCounts.get(ind) || 0;
            indicatorCounts.set(ind, count + 1);
        }
    }
    profile.breakthroughStyle.predictiveIndicators = Array.from(indicatorCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([ind]) => ind);
}
// ============================================================================
// EXPORTS
// ============================================================================
export const breakthroughProximity = {
    recordIndicator,
    recordBlockage,
    recordBreakthrough,
    assessProximity,
    getAllBreakthroughAssessments,
    getImminentBreakthroughs,
    buildBreakthroughContext,
};
export default breakthroughProximity;
//# sourceMappingURL=breakthrough-proximity.js.map