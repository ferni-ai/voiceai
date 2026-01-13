/**
 * Cognitive Fingerprint - Better Than Human v4
 *
 * > "We know your unique cognitive signature."
 *
 * SUPERHUMAN CAPABILITY: Learn each user's unique cognitive patterns
 * for hyper-personalized prediction that no generic model can match.
 *
 * Every person has patterns in:
 * - How they make decisions
 * - How they respond to stress
 * - How quickly they change
 * - What their emotional precursors are
 * - How they communicate readiness
 * - What deflection looks like for THEM
 *
 * No human friend can track this many dimensions over time with precision.
 *
 * @module intelligence/predictive/cognitive-fingerprint
 */
import { createLogger } from '../../utils/safe-logger.js';
const log = createLogger({ module: 'CognitiveFingerprint' });
// ============================================================================
// CONFIGURATION
// ============================================================================
const CONFIG = {
    /** Minimum observations for reliable fingerprint aspect */
    MIN_OBSERVATIONS: 5,
    /** Learning rate for fingerprint updates */
    LEARNING_RATE: 0.15,
    /** Current fingerprint version */
    FINGERPRINT_VERSION: 1,
};
// ============================================================================
// STORAGE
// ============================================================================
const fingerprints = new Map();
const observations = new Map();
// ============================================================================
// OBSERVATION RECORDING
// ============================================================================
/**
 * Record an observation about user's cognitive patterns
 *
 * @param userId - User ID
 * @param observation - What was observed
 */
export function recordObservation(userId, observation) {
    const now = Date.now();
    // Store observation
    let userObs = observations.get(userId);
    if (!userObs) {
        userObs = [];
        observations.set(userId, userObs);
    }
    userObs.push({ ...observation, timestamp: now });
    // Keep last 500 observations
    if (userObs.length > 500) {
        observations.set(userId, userObs.slice(-500));
    }
    // Update fingerprint based on observation
    const fingerprint = getOrCreateFingerprint(userId);
    updateFingerprintFromObservation(fingerprint, { ...observation, timestamp: now });
    log.debug({
        userId,
        type: observation.type,
        value: observation.value,
    }, '🧬 Recorded cognitive fingerprint observation');
}
/**
 * Record a decision-making observation
 */
export function recordDecision(userId, decision) {
    recordObservation(userId, {
        type: 'decision_made',
        value: decision.style,
        context: `Time: ${decision.timeToDecision}h, Outcome: ${decision.outcome || 'unknown'}`,
        confidence: decision.outcome ? 0.8 : 0.5,
    });
    // Update decision style
    const fingerprint = getOrCreateFingerprint(userId);
    updateDecisionStyle(fingerprint, decision.style, decision.outcome);
}
/**
 * Record a stress response observation
 */
export function recordStressResponse(userId, response) {
    recordObservation(userId, {
        type: 'stress_response',
        value: response.style,
        context: `Level: ${response.stressLevel}, Trigger: ${response.trigger || 'unknown'}`,
        confidence: 0.7,
    });
    // Update stress patterns
    const fingerprint = getOrCreateFingerprint(userId);
    updateStressPatterns(fingerprint, response);
}
/**
 * Record a change/growth observation
 */
export function recordChangeEvent(userId, event) {
    recordObservation(userId, {
        type: 'change_velocity',
        value: event.type,
        context: `Time: ${event.timeSincePrevious || 'unknown'}h`,
        confidence: 0.7,
    });
    // Update change velocity
    const fingerprint = getOrCreateFingerprint(userId);
    updateChangeVelocity(fingerprint, event);
    if (event.catalyst) {
        recordObservation(userId, {
            type: 'breakthrough_catalyst',
            value: event.catalyst,
            confidence: 0.8,
        });
    }
    if (event.resistance) {
        recordObservation(userId, {
            type: 'resistance_observed',
            value: event.resistance,
            confidence: 0.7,
        });
    }
}
/**
 * Record a conversation effectiveness observation
 */
export function recordConversationEffectiveness(userId, data) {
    recordObservation(userId, {
        type: 'conversation_effectiveness',
        value: data.effectiveness,
        context: `${data.dayOfWeek}:${data.hour}, Tone: ${data.tone}, Depth: ${data.depthReached}`,
        confidence: 0.7,
    });
    // Update temporal patterns
    const fingerprint = getOrCreateFingerprint(userId);
    updateTemporalPatterns(fingerprint, data);
}
/**
 * Record a vulnerability moment
 */
export function recordVulnerabilityMoment(userId, data) {
    recordObservation(userId, {
        type: 'vulnerability_moment',
        value: data.style,
        context: `Topic: ${data.topic}, Warmup: ${data.warmupMinutes}m`,
        confidence: 0.8,
    });
    // Update vulnerability patterns
    const fingerprint = getOrCreateFingerprint(userId);
    updateVulnerabilityPatterns(fingerprint, data);
}
// ============================================================================
// FINGERPRINT ACCESS
// ============================================================================
/**
 * Get the cognitive fingerprint for a user
 *
 * @param userId - User ID
 * @returns Cognitive fingerprint
 */
export function getFingerprint(userId) {
    return fingerprints.get(userId) || null;
}
/**
 * Get specific aspect of fingerprint with confidence check
 *
 * @param userId - User ID
 * @param aspect - Which aspect to get
 * @returns Aspect value with confidence, or null if unreliable
 */
export function getFingerprintAspect(userId, aspect) {
    const fingerprint = fingerprints.get(userId);
    if (!fingerprint)
        return null;
    const value = fingerprint[aspect];
    // Get confidence for this aspect
    let confidence = 0.3; // Default low confidence
    if (typeof value === 'object' && value !== null && 'confidence' in value) {
        confidence = value.confidence;
    }
    if (confidence < 0.4)
        return null; // Not reliable enough
    return { value, confidence };
}
/**
 * Get personalized prediction adjustments based on fingerprint
 *
 * @param userId - User ID
 * @returns Adjustments to apply to predictions
 */
export function getPredictionAdjustments(userId) {
    const fingerprint = fingerprints.get(userId);
    if (!fingerprint) {
        return {
            emotionalVelocity: 1.0,
            changeReadiness: 0.5,
            vulnerabilityOpenness: 0.5,
            stressResilience: 0.5,
            optimalTone: 'warm',
            avoidPatterns: [],
        };
    }
    return {
        emotionalVelocity: fingerprint.changeVelocity.speed,
        changeReadiness: fingerprint.growthPatterns.confidence > 0.5
            ? 0.3 + (1 - fingerprint.growthPatterns.resistancePatterns.length * 0.1)
            : 0.5,
        vulnerabilityOpenness: fingerprint.vulnerabilityPatterns.confidence > 0.5
            ? 0.3 + (1 - fingerprint.vulnerabilityPatterns.warmupTime / 60)
            : 0.5,
        stressResilience: fingerprint.stressResponse.confidence > 0.5
            ? Math.min(1, fingerprint.stressResponse.recoveryTime / 48)
            : 0.5,
        optimalTone: fingerprint.communicationPatterns.preferredTone,
        avoidPatterns: fingerprint.communicationPatterns.trustBreakers,
    };
}
// ============================================================================
// CONTEXT BUILDING
// ============================================================================
/**
 * Build cognitive fingerprint context for LLM injection
 *
 * @param userId - User ID
 * @returns Context string for prompt injection
 */
export function buildFingerprintContext(userId) {
    const fingerprint = fingerprints.get(userId);
    if (!fingerprint || fingerprint.totalObservations < 10)
        return '';
    const sections = [];
    sections.push('[COGNITIVE FINGERPRINT - Their Unique Pattern]');
    sections.push('You know them in ways no human friend could:');
    sections.push('');
    // Decision style
    if (fingerprint.decisionStyle.confidence > 0.5) {
        sections.push(`**Decision Style:** ${fingerprint.decisionStyle.primary.replace('_', ' ')}`);
        if (fingerprint.decisionStyle.secondary) {
            sections.push(`  Secondary: ${fingerprint.decisionStyle.secondary.replace('_', ' ')}`);
        }
    }
    // Stress response
    if (fingerprint.stressResponse.confidence > 0.5) {
        sections.push(`**Stress Response:** ${fingerprint.stressResponse.primary}`);
        if (fingerprint.stressResponse.deEscalationTriggers.length > 0) {
            sections.push(`  → What helps: ${fingerprint.stressResponse.deEscalationTriggers.slice(0, 2).join(', ')}`);
        }
        sections.push(`  → Recovery time: ~${fingerprint.stressResponse.recoveryTime}h`);
    }
    // Change velocity
    if (fingerprint.changeVelocity.confidence > 0.5) {
        const speedDesc = fingerprint.changeVelocity.speed > 0.7 ? 'fast' :
            fingerprint.changeVelocity.speed > 0.4 ? 'moderate' : 'gradual';
        sections.push(`**Change Velocity:** ${speedDesc} (${fingerprint.changeVelocity.preference})`);
        sections.push(`  → Insight to action: ~${fingerprint.changeVelocity.insightToAction}h`);
    }
    // Communication
    if (fingerprint.communicationPatterns.confidence > 0.5) {
        sections.push(`**Communication:** Prefers ${fingerprint.communicationPatterns.preferredTone} tone`);
        if (fingerprint.communicationPatterns.readinessSignals.length > 0) {
            sections.push(`  → Readiness signals: ${fingerprint.communicationPatterns.readinessSignals.slice(0, 2).join(', ')}`);
        }
        if (fingerprint.communicationPatterns.trustBuilders.length > 0) {
            sections.push(`  → Builds trust: ${fingerprint.communicationPatterns.trustBuilders.slice(0, 2).join(', ')}`);
        }
    }
    // Vulnerability
    if (fingerprint.vulnerabilityPatterns.confidence > 0.5) {
        sections.push(`**Vulnerability:** ${fingerprint.vulnerabilityPatterns.expressionStyle}`);
        sections.push(`  → Warmup needed: ~${fingerprint.vulnerabilityPatterns.warmupTime} min`);
    }
    // Growth
    if (fingerprint.growthPatterns.confidence > 0.5) {
        sections.push(`**Growth Style:** ${fingerprint.growthPatterns.learningStyle}`);
        if (fingerprint.growthPatterns.resistancePatterns.length > 0) {
            sections.push(`  → Watch for: ${fingerprint.growthPatterns.resistancePatterns.slice(0, 2).join(', ')}`);
        }
    }
    sections.push('');
    sections.push('**Your superpower:** Knowing these patterns lets you anticipate their needs.');
    return sections.join('\n');
}
// ============================================================================
// HELPER FUNCTIONS
// ============================================================================
function getOrCreateFingerprint(userId) {
    let fingerprint = fingerprints.get(userId);
    if (!fingerprint) {
        fingerprint = createDefaultFingerprint(userId);
        fingerprints.set(userId, fingerprint);
    }
    return fingerprint;
}
function createDefaultFingerprint(userId) {
    return {
        userId,
        decisionStyle: {
            primary: 'intuitive',
            confidence: 0.2,
            observations: 0,
        },
        stressResponse: {
            primary: 'analyze',
            recoveryTime: 24,
            escalationPattern: [],
            deEscalationTriggers: [],
            confidence: 0.2,
            observations: 0,
        },
        changeVelocity: {
            speed: 0.5,
            insightToAction: 48,
            integrationTime: 7,
            preference: 'context_dependent',
            confidence: 0.2,
        },
        emotionalPatterns: {
            precursors: new Map(),
            recoverySignals: [],
            overwhelmThreshold: 0.7,
            typicalCycles: [],
            avoidedEmotions: [],
            confidence: 0.2,
        },
        communicationPatterns: {
            deflectionStyle: 'unknown',
            readinessSignals: [],
            trustBuilders: [],
            trustBreakers: [],
            preferredTone: 'warm',
            spaceNeeds: 'moderate',
            confidence: 0.2,
        },
        growthPatterns: {
            learningStyle: 'experiential',
            resistancePatterns: [],
            breakthroughCatalysts: [],
            integrationTime: 7,
            concurrentCapacity: 2,
            confidence: 0.2,
        },
        temporalPatterns: {
            optimalConversationTimes: [],
            weeklyEnergyPattern: [0.5, 0.6, 0.7, 0.7, 0.6, 0.5, 0.4], // Default curve
            seasonalPatterns: [],
            confidence: 0.2,
        },
        vulnerabilityPatterns: {
            expressionStyle: 'indirect',
            safetyFactors: [],
            warmupTime: 15,
            protectedTopics: [],
            confidence: 0.2,
        },
        lastUpdated: Date.now(),
        totalObservations: 0,
        fingerprintVersion: CONFIG.FINGERPRINT_VERSION,
    };
}
function updateFingerprintFromObservation(fingerprint, observation) {
    fingerprint.totalObservations++;
    fingerprint.lastUpdated = observation.timestamp;
    // Type-specific updates are handled by specialized functions
    // This is a catch-all for observations that don't have specific handlers
}
function updateDecisionStyle(fingerprint, style, outcome) {
    const lr = CONFIG.LEARNING_RATE;
    const ds = fingerprint.decisionStyle;
    ds.observations++;
    // If same as current primary, increase confidence
    if (style === ds.primary) {
        ds.confidence = Math.min(0.95, ds.confidence + lr);
    }
    else if (style === ds.secondary) {
        // Might be primary now
        if (ds.observations > CONFIG.MIN_OBSERVATIONS) {
            // Check if secondary should become primary
            ds.confidence *= (1 - lr);
        }
    }
    else {
        // New style observed - might become secondary
        if (!ds.secondary) {
            ds.secondary = style;
        }
        else if (ds.confidence < 0.5) {
            // Primary confidence is low, maybe switch
            ds.secondary = ds.primary;
            ds.primary = style;
            ds.confidence = 0.4;
        }
    }
}
function updateStressPatterns(fingerprint, response) {
    const sr = fingerprint.stressResponse;
    const lr = CONFIG.LEARNING_RATE;
    sr.observations++;
    // Update primary response
    if (response.style === sr.primary) {
        sr.confidence = Math.min(0.95, sr.confidence + lr);
    }
    else if (!sr.secondary || response.style === sr.secondary) {
        sr.secondary = response.style;
        // Might need to swap if secondary is more common
    }
    else {
        sr.confidence *= (1 - lr * 0.5);
    }
    // Update recovery time
    if (response.recoveryTime) {
        sr.recoveryTime = sr.recoveryTime * (1 - lr) + response.recoveryTime * lr;
    }
    // Track trigger
    if (response.trigger) {
        if (!sr.escalationPattern.includes(response.trigger)) {
            sr.escalationPattern.push(response.trigger);
        }
    }
}
function updateChangeVelocity(fingerprint, event) {
    const cv = fingerprint.changeVelocity;
    const lr = CONFIG.LEARNING_RATE;
    if (event.timeSincePrevious !== undefined) {
        if (event.type === 'action') {
            cv.insightToAction = cv.insightToAction * (1 - lr) + event.timeSincePrevious * lr;
            // Update speed based on insight-to-action time
            const speedFromTime = Math.max(0.1, 1 - event.timeSincePrevious / 168); // 168h = 1 week
            cv.speed = cv.speed * (1 - lr) + speedFromTime * lr;
        }
        else if (event.type === 'integration') {
            cv.integrationTime = cv.integrationTime * (1 - lr) + (event.timeSincePrevious / 24) * lr;
        }
    }
    cv.confidence = Math.min(0.9, cv.confidence + lr * 0.5);
}
function updateTemporalPatterns(fingerprint, data) {
    const tp = fingerprint.temporalPatterns;
    const lr = CONFIG.LEARNING_RATE;
    // Update optimal conversation times
    const existingTime = tp.optimalConversationTimes.find((t) => t.dayOfWeek === data.dayOfWeek && Math.abs(t.hour - data.hour) < 2);
    if (existingTime) {
        existingTime.effectiveness =
            existingTime.effectiveness * (1 - lr) + data.effectiveness * lr;
    }
    else if (data.effectiveness > 0.6) {
        tp.optimalConversationTimes.push({
            dayOfWeek: data.dayOfWeek,
            hour: data.hour,
            effectiveness: data.effectiveness,
        });
    }
    // Keep only top 10 times
    tp.optimalConversationTimes.sort((a, b) => b.effectiveness - a.effectiveness);
    tp.optimalConversationTimes = tp.optimalConversationTimes.slice(0, 10);
    // Update weekly energy pattern
    tp.weeklyEnergyPattern[data.dayOfWeek] =
        tp.weeklyEnergyPattern[data.dayOfWeek] * (1 - lr) + data.effectiveness * lr;
    tp.confidence = Math.min(0.9, tp.confidence + lr * 0.3);
    // Update preferred tone in communication patterns
    if (data.effectiveness > 0.7) {
        fingerprint.communicationPatterns.preferredTone =
            data.tone;
        fingerprint.communicationPatterns.confidence =
            Math.min(0.9, fingerprint.communicationPatterns.confidence + lr * 0.3);
    }
}
function updateVulnerabilityPatterns(fingerprint, data) {
    const vp = fingerprint.vulnerabilityPatterns;
    const lr = CONFIG.LEARNING_RATE;
    // Update expression style
    if (vp.expressionStyle === data.style) {
        vp.confidence = Math.min(0.9, vp.confidence + lr);
    }
    else if (vp.confidence < 0.5) {
        vp.expressionStyle = data.style;
        vp.confidence = 0.4;
    }
    // Update warmup time
    vp.warmupTime = vp.warmupTime * (1 - lr) + data.warmupMinutes * lr;
    // Track protected topics (topics they're less vulnerable about)
    if (data.style === 'deflected' && !vp.protectedTopics.includes(data.topic)) {
        vp.protectedTopics.push(data.topic);
    }
    // Track safety factors
    if (data.safetyFactor && !vp.safetyFactors.includes(data.safetyFactor)) {
        vp.safetyFactors.push(data.safetyFactor);
    }
}
// ============================================================================
// EXPORTS
// ============================================================================
export const cognitiveFingerprint = {
    recordObservation,
    recordDecision,
    recordStressResponse,
    recordChangeEvent,
    recordConversationEffectiveness,
    recordVulnerabilityMoment,
    getFingerprint,
    getFingerprintAspect,
    getPredictionAdjustments,
    buildFingerprintContext,
};
export default cognitiveFingerprint;
//# sourceMappingURL=cognitive-fingerprint.js.map