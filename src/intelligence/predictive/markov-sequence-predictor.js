/**
 * Markov Sequence Predictor
 *
 * TRUE PREDICTIVE INTELLIGENCE: Learn behavioral sequences and predict next states.
 *
 * This uses a Markov chain to learn patterns like:
 * - "After talking about work stress → user often mentions sleep issues"
 * - "Morning conversations → typically lead to energy discussions"
 * - "After milestone celebrations → user often sets new goals"
 *
 * Unlike rule-based systems that say "if Sunday → anxious", this LEARNS from actual
 * user behavior what tends to follow what.
 *
 * Key Features:
 * - First-order and second-order Markov chains
 * - Decay-weighted learning (recent patterns matter more)
 * - Cross-user pattern transfer for cold start
 * - Confidence calibration based on observation count
 *
 * @module intelligence/predictive/markov-sequence-predictor
 */
import { createLogger } from '../../utils/safe-logger.js';
import { loadMarkovState, saveMarkovState, markDirty, isUserLoaded, markUserLoaded, } from './persistence.js';
const log = createLogger({ module: 'MarkovPredictor' });
// ============================================================================
// CONFIGURATION
// ============================================================================
const CONFIG = {
    /** Minimum observations for reliable prediction */
    MIN_OBSERVATIONS_FOR_CONFIDENCE: 5,
    /** Weight decay for older observations (exponential) */
    DECAY_HALF_LIFE_DAYS: 30,
    /** Smoothing factor for unseen transitions (Laplace smoothing) */
    SMOOTHING_ALPHA: 0.01,
    /** Weight for community patterns in cold start */
    COMMUNITY_PRIOR_WEIGHT: 0.3,
    /** How many predictions to return */
    TOP_K_PREDICTIONS: 3,
    /** Minimum probability to surface */
    MIN_PROBABILITY_THRESHOLD: 0.1,
};
// ============================================================================
// STORAGE
// ============================================================================
const userProfiles = new Map();
const communityPatterns = new Map();
let communityObservations = 0;
// ============================================================================
// CORE LEARNING FUNCTIONS
// ============================================================================
/**
 * Record a state transition observation
 *
 * @param userId - User to learn from
 * @param from - Previous state
 * @param to - Current state
 * @param context - Optional temporal context
 */
export function recordTransition(userId, from, to, context) {
    const profile = getOrCreateProfile(userId);
    const now = Date.now();
    // Update first-order chain
    if (!profile.firstOrder.has(from)) {
        profile.firstOrder.set(from, new Map());
    }
    const fromTransitions = profile.firstOrder.get(from);
    const existing = fromTransitions.get(to);
    if (existing) {
        existing.observations++;
        existing.lastSeen = now;
        existing.confidence = calculateConfidence(existing.observations);
    }
    else {
        fromTransitions.set(to, {
            probability: 0, // Will be recalculated
            observations: 1,
            lastSeen: now,
            confidence: 'low',
        });
    }
    // Update second-order chain if we have previous context
    // (stored in a separate call with previousState)
    // Update community patterns (anonymized)
    updateCommunityPatterns(from, to);
    // Recalculate probabilities for this source state
    recalculateProbabilities(fromTransitions, profile.priorStrength);
    profile.totalObservations++;
    profile.lastUpdated = now;
    // Mark for persistence
    markDirty(userId);
    log.debug({ userId, from, to, totalObs: profile.totalObservations }, '📈 Recorded state transition');
}
/**
 * Record a second-order transition (with previous state context)
 */
export function recordSecondOrderTransition(userId, previous, current, next) {
    const profile = getOrCreateProfile(userId);
    const now = Date.now();
    // Create composite key for second-order
    const key = `${previous}→${current}`;
    if (!profile.secondOrder.has(key)) {
        profile.secondOrder.set(key, new Map());
    }
    const transitions = profile.secondOrder.get(key);
    const existing = transitions.get(next);
    if (existing) {
        existing.observations++;
        existing.lastSeen = now;
        existing.confidence = calculateConfidence(existing.observations);
    }
    else {
        transitions.set(next, {
            probability: 0,
            observations: 1,
            lastSeen: now,
            confidence: 'low',
        });
    }
    recalculateProbabilities(transitions, profile.priorStrength);
    profile.lastUpdated = now;
    log.debug({ userId, previous, current, next }, '📈 Recorded 2nd-order transition');
}
// ============================================================================
// PREDICTION FUNCTIONS
// ============================================================================
/**
 * Predict the most likely next states
 *
 * @param userId - User to predict for
 * @param currentState - Current observed state
 * @param previousState - Optional previous state for 2nd-order prediction
 * @returns Prediction with probabilities and confidence
 */
export function predictNextStates(userId, currentState, previousState) {
    const profile = userProfiles.get(userId);
    const predictions = [];
    let source = 'prior';
    // Try second-order prediction first (more context = better prediction)
    if (previousState && profile?.secondOrder) {
        const key = `${previousState}→${currentState}`;
        const transitions = profile.secondOrder.get(key);
        if (transitions && transitions.size > 0) {
            const sorted = Array.from(transitions.entries())
                .sort((a, b) => b[1].probability - a[1].probability)
                .slice(0, CONFIG.TOP_K_PREDICTIONS);
            for (const [state, prob] of sorted) {
                if (prob.probability >= CONFIG.MIN_PROBABILITY_THRESHOLD) {
                    predictions.push({
                        state,
                        probability: prob.probability,
                        confidence: prob.confidence,
                        reasoning: `After ${previousState} → ${currentState}, ${state} follows ${Math.round(prob.probability * 100)}% of the time`,
                    });
                }
            }
            if (predictions.length > 0) {
                source = 'personal';
            }
        }
    }
    // Fall back to first-order prediction
    if (predictions.length === 0) {
        const firstOrderPredictions = predictFirstOrder(userId, currentState);
        for (const pred of firstOrderPredictions) {
            predictions.push({
                ...pred,
                reasoning: `After ${currentState}, ${pred.state} typically follows`,
            });
        }
        if (firstOrderPredictions.length > 0) {
            source = profile ? 'personal' : 'community';
        }
    }
    // Fall back to community patterns for cold start
    if (predictions.length === 0) {
        const communityPredictions = predictFromCommunity(currentState);
        for (const pred of communityPredictions) {
            predictions.push({
                ...pred,
                reasoning: `Community pattern: ${currentState} often leads to ${pred.state}`,
            });
        }
        source = 'community';
    }
    // Determine if prediction is reliable
    const isReliable = predictions.length > 0 &&
        predictions[0].confidence !== 'low' &&
        predictions[0].probability >= 0.2;
    return {
        currentState,
        previousState,
        predictions,
        isReliable,
        source,
    };
}
function predictFirstOrder(userId, currentState) {
    const profile = userProfiles.get(userId);
    const transitions = profile?.firstOrder.get(currentState);
    if (!transitions || transitions.size === 0) {
        return [];
    }
    return Array.from(transitions.entries())
        .filter(([_, prob]) => prob.probability >= CONFIG.MIN_PROBABILITY_THRESHOLD)
        .sort((a, b) => b[1].probability - a[1].probability)
        .slice(0, CONFIG.TOP_K_PREDICTIONS)
        .map(([state, prob]) => ({
        state,
        probability: prob.probability,
        confidence: prob.confidence,
    }));
}
function predictFromCommunity(currentState) {
    const transitions = communityPatterns.get(currentState);
    if (!transitions || transitions.size === 0) {
        return [];
    }
    return Array.from(transitions.entries())
        .filter(([_, prob]) => prob.probability >= CONFIG.MIN_PROBABILITY_THRESHOLD)
        .sort((a, b) => b[1].probability - a[1].probability)
        .slice(0, CONFIG.TOP_K_PREDICTIONS)
        .map(([state, prob]) => ({
        state,
        probability: prob.probability,
        // Community predictions have lower confidence
        confidence: 'low',
    }));
}
// ============================================================================
// HELPER FUNCTIONS
// ============================================================================
function getOrCreateProfile(userId) {
    let profile = userProfiles.get(userId);
    if (!profile) {
        profile = {
            userId,
            firstOrder: new Map(),
            secondOrder: new Map(),
            totalObservations: 0,
            lastUpdated: Date.now(),
            priorStrength: CONFIG.COMMUNITY_PRIOR_WEIGHT,
        };
        userProfiles.set(userId, profile);
        // Async load from Firestore (don't block)
        if (!isUserLoaded(userId)) {
            void loadUserProfileFromFirestore(userId);
        }
    }
    return profile;
}
/**
 * Load user profile from Firestore (async, called on first access)
 */
async function loadUserProfileFromFirestore(userId) {
    try {
        const data = await loadMarkovState(userId);
        if (data && data.firstOrder) {
            // Reconstruct Maps from persisted data
            const profile = userProfiles.get(userId);
            if (profile) {
                // Restore first-order chain
                for (const [from, transitions] of Object.entries(data.firstOrder)) {
                    const transitionMap = new Map();
                    for (const [to, prob] of Object.entries(transitions)) {
                        transitionMap.set(to, prob);
                    }
                    profile.firstOrder.set(from, transitionMap);
                }
                // Restore second-order chain
                if (data.secondOrder) {
                    for (const [key, transitions] of Object.entries(data.secondOrder)) {
                        const transitionMap = new Map();
                        for (const [to, prob] of Object.entries(transitions)) {
                            transitionMap.set(to, prob);
                        }
                        profile.secondOrder.set(key, transitionMap);
                    }
                }
                profile.totalObservations = data.totalObservations;
                profile.lastUpdated = data.lastUpdated;
                log.debug({ userId, observations: data.totalObservations }, 'Loaded Markov profile from Firestore');
            }
        }
        markUserLoaded(userId);
    }
    catch (error) {
        log.debug({ error: String(error), userId }, 'Failed to load Markov profile');
        markUserLoaded(userId); // Don't retry
    }
}
function calculateConfidence(observations) {
    if (observations >= 20)
        return 'very_high';
    if (observations >= 10)
        return 'high';
    if (observations >= CONFIG.MIN_OBSERVATIONS_FOR_CONFIDENCE)
        return 'medium';
    return 'low';
}
function recalculateProbabilities(transitions, priorStrength) {
    const now = Date.now();
    let totalWeightedObs = 0;
    // Calculate decay-weighted observations
    for (const prob of transitions.values()) {
        const ageMs = now - prob.lastSeen;
        const ageDays = ageMs / (1000 * 60 * 60 * 24);
        const decayFactor = Math.pow(0.5, ageDays / CONFIG.DECAY_HALF_LIFE_DAYS);
        totalWeightedObs += prob.observations * decayFactor + CONFIG.SMOOTHING_ALPHA;
    }
    // Add smoothing for unseen states
    totalWeightedObs += CONFIG.SMOOTHING_ALPHA * 10; // Small prior for unknown
    // Update probabilities
    for (const [state, prob] of transitions.entries()) {
        const ageMs = now - prob.lastSeen;
        const ageDays = ageMs / (1000 * 60 * 60 * 24);
        const decayFactor = Math.pow(0.5, ageDays / CONFIG.DECAY_HALF_LIFE_DAYS);
        const weightedObs = prob.observations * decayFactor + CONFIG.SMOOTHING_ALPHA;
        prob.probability = weightedObs / totalWeightedObs;
    }
}
function updateCommunityPatterns(from, to) {
    if (!communityPatterns.has(from)) {
        communityPatterns.set(from, new Map());
    }
    const transitions = communityPatterns.get(from);
    const existing = transitions.get(to);
    if (existing) {
        existing.observations++;
        existing.lastSeen = Date.now();
        existing.confidence = calculateConfidence(existing.observations);
    }
    else {
        transitions.set(to, {
            probability: 0,
            observations: 1,
            lastSeen: Date.now(),
            confidence: 'low',
        });
    }
    communityObservations++;
    // Recalculate community probabilities periodically
    if (communityObservations % 100 === 0) {
        recalculateProbabilities(transitions, 0);
    }
}
// ============================================================================
// INTEGRATION WITH CONVERSATION
// ============================================================================
/**
 * Extract observable states from a conversation turn
 *
 * @param text - User message
 * @param emotion - Detected emotion (if any)
 * @param topic - Detected topic (if any)
 * @param timestamp - When the message was sent
 * @returns Array of observable states
 */
export function extractStatesFromTurn(text, emotion, topic, timestamp) {
    const states = [];
    const time = timestamp || new Date();
    // Add temporal state
    const hour = time.getHours();
    const day = time.getDay();
    if (hour >= 5 && hour < 12)
        states.push('temporal:morning');
    else if (hour >= 12 && hour < 17)
        states.push('temporal:afternoon');
    else if (hour >= 17 && hour < 22)
        states.push('temporal:evening');
    else
        states.push('temporal:late_night');
    if (day === 0 || day === 6)
        states.push('temporal:weekend');
    else
        states.push('temporal:weekday');
    // Add emotion state
    if (emotion) {
        const emotionMap = {
            anxious: 'emotion:anxious',
            stressed: 'emotion:stressed',
            calm: 'emotion:calm',
            happy: 'emotion:happy',
            sad: 'emotion:sad',
            frustrated: 'emotion:frustrated',
            excited: 'emotion:excited',
            overwhelmed: 'emotion:overwhelmed',
        };
        const mapped = emotionMap[emotion.toLowerCase()];
        if (mapped)
            states.push(mapped);
    }
    // Add topic state
    if (topic) {
        const topicMap = {
            work: 'topic:work',
            relationships: 'topic:relationships',
            health: 'topic:health',
            finances: 'topic:finances',
            family: 'topic:family',
            goals: 'topic:goals',
            habits: 'topic:habits',
            sleep: 'topic:sleep',
            exercise: 'topic:exercise',
            social: 'topic:social',
            creativity: 'topic:creativity',
            career: 'topic:career',
        };
        const mapped = topicMap[topic.toLowerCase()];
        if (mapped)
            states.push(mapped);
    }
    // Detect behavioral state from text patterns
    const textLower = text.toLowerCase();
    if (/i don't know what to do|help me|what should i/i.test(textLower)) {
        states.push('behavior:seeking_advice');
    }
    else if (/ugh|so frustrated|can't believe|annoying/i.test(textLower)) {
        states.push('behavior:venting');
    }
    else if (/excited|can't wait|so happy|amazing/i.test(textLower)) {
        states.push('behavior:celebrating');
    }
    else if (/thinking about|wondering if|trying to figure/i.test(textLower)) {
        states.push('behavior:processing');
    }
    else if (/going to|plan to|want to start|my goal/i.test(textLower)) {
        states.push('behavior:planning');
    }
    else if (/looking back|realized|learned that/i.test(textLower)) {
        states.push('behavior:reflecting');
    }
    return states;
}
// ============================================================================
// PERSISTENCE
// ============================================================================
/**
 * Save user's Markov profile to Firestore
 */
export async function saveUserProfile(userId) {
    const profile = userProfiles.get(userId);
    if (!profile)
        return;
    // Convert Maps to plain objects for Firestore
    const data = {
        firstOrder: mapToObject(profile.firstOrder),
        secondOrder: mapToObject(profile.secondOrder),
        totalObservations: profile.totalObservations,
        lastUpdated: profile.lastUpdated,
    };
    await saveMarkovState(userId, data);
}
/**
 * Convert nested Map to plain object for Firestore
 */
function mapToObject(map) {
    const result = {};
    for (const [outerKey, innerMap] of map.entries()) {
        result[outerKey] = {};
        for (const [innerKey, value] of innerMap.entries()) {
            result[outerKey][innerKey] = value;
        }
    }
    return result;
}
/**
 * Load user's Markov profile from memory
 * (Firestore loading happens async on first access)
 */
export async function loadUserProfile(userId) {
    return userProfiles.get(userId) || null;
}
/**
 * Get Markov data for persistence (called by persistence layer)
 */
export function getMarkovDataForPersistence(userId) {
    const profile = userProfiles.get(userId);
    if (!profile)
        return null;
    return {
        firstOrder: mapToObject(profile.firstOrder),
        secondOrder: mapToObject(profile.secondOrder),
        totalObservations: profile.totalObservations,
        lastUpdated: profile.lastUpdated,
    };
}
// ============================================================================
// EXPORTS
// ============================================================================
export default {
    recordTransition,
    recordSecondOrderTransition,
    predictNextStates,
    extractStatesFromTurn,
    saveUserProfile,
    loadUserProfile,
    getMarkovDataForPersistence,
};
//# sourceMappingURL=markov-sequence-predictor.js.map