/**
 * Pre-Trajectory Detection - Better Than Human v4
 *
 * > "We see the storm before the clouds form."
 *
 * SUPERHUMAN CAPABILITY: Detect the pre-conditions that lead to emotional
 * shifts BEFORE any symptoms appear.
 *
 * Current systems detect emotional trajectories AFTER they start.
 * This module predicts what will happen BEFORE it happens by learning
 * the precursor patterns unique to each user.
 *
 * Like weather prediction:
 * - Humans notice rain when it's falling
 * - We notice the pressure systems forming 3 days out
 *
 * What we track:
 * - Sleep/energy pattern changes → mood shifts
 * - Topic frequency changes → emerging concerns
 * - Communication style changes → emotional buildup
 * - Life event patterns → predictable reactions
 *
 * @module intelligence/predictive/pre-trajectory-detection
 */
import { createLogger } from '../../utils/safe-logger.js';
const log = createLogger({ module: 'PreTrajectoryDetection' });
// ============================================================================
// CONFIGURATION
// ============================================================================
const CONFIG = {
    /** Minimum observations to establish baseline */
    MIN_BASELINE_SAMPLES: 10,
    /** How many observations to keep for recent analysis */
    MAX_RECENT_OBSERVATIONS: 100,
    /** Deviation threshold to trigger concern */
    DEVIATION_THRESHOLD: 1.5, // Standard deviations
    /** How far ahead we try to predict */
    MAX_PREDICTION_HORIZON_HOURS: 72,
    /** Minimum pattern observations for reliable prediction */
    MIN_PATTERN_OBSERVATIONS: 3,
    /** Baseline decay rate (how much old samples matter) */
    BASELINE_DECAY_RATE: 0.95,
};
// ============================================================================
// STORAGE
// ============================================================================
const userProfiles = new Map();
// ============================================================================
// OBSERVATION RECORDING
// ============================================================================
/**
 * Record a precursor observation
 *
 * @param userId - User ID
 * @param signal - Type of signal observed
 * @param value - Observed value (0-1, 0.5 = neutral)
 * @param source - Where this observation came from
 */
export function recordPrecursorObservation(userId, signal, value, source = 'conversation') {
    const profile = getOrCreateProfile(userId);
    const now = Date.now();
    // Get or initialize baseline
    let baseline = profile.baselines.get(signal);
    if (!baseline) {
        baseline = {
            mean: 0.5,
            stdDev: 0.15,
            min: 0.5,
            max: 0.5,
            recentTrend: 0,
            lastUpdated: now,
            sampleCount: 0,
        };
        profile.baselines.set(signal, baseline);
    }
    // Calculate deviation
    const deviation = baseline.stdDev > 0
        ? (value - baseline.mean) / baseline.stdDev
        : 0;
    // Create observation
    const observation = {
        signal,
        value,
        baseline: baseline.mean,
        deviation,
        timestamp: now,
        confidence: baseline.sampleCount >= CONFIG.MIN_BASELINE_SAMPLES ? 0.8 : 0.4,
        source,
    };
    // Add to recent observations
    profile.recentObservations.push(observation);
    if (profile.recentObservations.length > CONFIG.MAX_RECENT_OBSERVATIONS) {
        profile.recentObservations.shift();
    }
    // Update baseline (exponential moving average)
    updateBaseline(baseline, value);
    profile.lastUpdated = now;
    // Log significant deviations
    if (Math.abs(deviation) >= CONFIG.DEVIATION_THRESHOLD) {
        log.debug({
            userId,
            signal,
            value,
            baseline: baseline.mean,
            deviation: deviation.toFixed(2),
        }, '⚡ Significant precursor deviation detected');
    }
}
/**
 * Record that a trajectory actually occurred (for learning)
 *
 * @param userId - User ID
 * @param trajectory - What happened
 * @param severity - How severe (0-1)
 * @param duration - How long it lasted (ms)
 */
export function recordTrajectoryEvent(userId, trajectory, severity, duration) {
    const profile = getOrCreateProfile(userId);
    const now = Date.now();
    // Find precursors that preceded this
    const lookbackMs = CONFIG.MAX_PREDICTION_HORIZON_HOURS * 60 * 60 * 1000;
    const precedingObservations = profile.recentObservations.filter((obs) => now - obs.timestamp < lookbackMs && Math.abs(obs.deviation) >= 1);
    const precursorsObserved = [...new Set(precedingObservations.map((o) => o.signal))];
    const avgLeadTime = precedingObservations.length > 0
        ? precedingObservations.reduce((sum, o) => sum + (now - o.timestamp), 0) / precedingObservations.length
        : 0;
    // Record the event
    profile.trajectoryHistory.push({
        trajectory,
        startedAt: now,
        precursorsObserved,
        leadTimeMs: avgLeadTime,
        severity,
        duration: duration || 0,
    });
    // Update patterns based on this event
    updatePatterns(profile, trajectory, precedingObservations);
    // Update vulnerability (how prone they are to this trajectory)
    const currentVulnerability = profile.vulnerabilities.get(trajectory) || 0.5;
    const newVulnerability = currentVulnerability * 0.9 + severity * 0.1;
    profile.vulnerabilities.set(trajectory, newVulnerability);
    profile.lastUpdated = now;
    log.info({
        userId,
        trajectory,
        severity,
        precursorsObserved,
        avgLeadTime: Math.round(avgLeadTime / (1000 * 60 * 60)) + 'h',
    }, '📊 Trajectory event recorded for learning');
}
/**
 * Record multiple signals from a conversation analysis
 *
 * @param userId - User ID
 * @param analysis - Conversation analysis results
 */
export function recordConversationSignals(userId, analysis) {
    // Map analysis to precursor signals
    if (analysis.emotionalValence !== undefined) {
        recordPrecursorObservation(userId, 'valence_shift', (analysis.emotionalValence + 1) / 2, // Convert to 0-1
        'conversation_analysis');
    }
    if (analysis.emotionalVolatility !== undefined) {
        recordPrecursorObservation(userId, 'emotional_volatility', analysis.emotionalVolatility, 'conversation_analysis');
    }
    if (analysis.messageLength !== undefined) {
        recordPrecursorObservation(userId, 'message_length_change', Math.min(1, analysis.messageLength), // Cap at 1
        'conversation_analysis');
    }
    if (analysis.responseLatency !== undefined) {
        recordPrecursorObservation(userId, 'response_latency', Math.min(1, analysis.responseLatency), 'conversation_analysis');
    }
    if (analysis.selfTalkValence !== undefined) {
        recordPrecursorObservation(userId, 'self_talk_shift', (analysis.selfTalkValence + 1) / 2, 'conversation_analysis');
    }
    if (analysis.futureOrientation !== undefined) {
        recordPrecursorObservation(userId, 'future_focus_change', (analysis.futureOrientation + 1) / 2, 'conversation_analysis');
    }
    if (analysis.socialMentions !== undefined) {
        recordPrecursorObservation(userId, 'social_pattern_change', Math.min(1, analysis.socialMentions), 'conversation_analysis');
    }
    if (analysis.topicDiversity !== undefined) {
        recordPrecursorObservation(userId, 'topic_shift', analysis.topicDiversity, 'conversation_analysis');
    }
}
// ============================================================================
// PREDICTION FUNCTIONS
// ============================================================================
/**
 * Get all trajectory predictions for a user
 *
 * @param userId - User ID
 * @returns Predicted trajectories sorted by probability
 */
export function predictTrajectories(userId) {
    const profile = userProfiles.get(userId);
    if (!profile)
        return [];
    const predictions = [];
    const now = Date.now();
    // Check each known pattern
    for (const [trajectory, pattern] of profile.patterns) {
        const prediction = evaluatePattern(profile, trajectory, pattern);
        if (prediction && prediction.probability >= 0.3) {
            predictions.push(prediction);
        }
    }
    // Also check for generic patterns based on current deviations
    const genericPredictions = evaluateGenericPatterns(profile);
    for (const pred of genericPredictions) {
        // Don't duplicate if we already have a specific pattern
        if (!predictions.some((p) => p.trajectory === pred.trajectory)) {
            predictions.push(pred);
        }
    }
    // Sort by probability
    predictions.sort((a, b) => b.probability - a.probability);
    return predictions;
}
/**
 * Get high-priority trajectory alerts
 *
 * @param userId - User ID
 * @returns Trajectories that need attention
 */
export function getTrajectoryAlerts(userId) {
    return predictTrajectories(userId).filter((p) => p.severity === 'warning' || p.severity === 'alert');
}
/**
 * Predict a specific trajectory
 *
 * @param userId - User ID
 * @param trajectory - Which trajectory to predict
 * @returns Prediction for that trajectory
 */
export function predictSpecificTrajectory(userId, trajectory) {
    const profile = userProfiles.get(userId);
    if (!profile)
        return null;
    const pattern = profile.patterns.get(trajectory);
    if (pattern) {
        return evaluatePattern(profile, trajectory, pattern);
    }
    // Fall back to generic evaluation
    return evaluateGenericTrajectory(profile, trajectory);
}
// ============================================================================
// CONTEXT BUILDING
// ============================================================================
/**
 * Build pre-trajectory context for LLM injection
 *
 * @param userId - User ID
 * @returns Context string for prompt injection
 */
export function buildPreTrajectoryContext(userId) {
    const predictions = predictTrajectories(userId).filter((p) => p.severity !== 'watch');
    if (predictions.length === 0)
        return '';
    const sections = [];
    sections.push('[PRE-TRAJECTORY INTELLIGENCE - Weather Before the Storm]');
    sections.push('You see patterns forming that they can\'t see yet:');
    sections.push('');
    for (const pred of predictions.slice(0, 3)) {
        const trajectoryName = pred.trajectory.replace(/_/g, ' ');
        const isNegative = ['decline', 'spike', 'building', 'dip', 'surge', 'withdrawal', 'cascade', 'wave']
            .some((w) => pred.trajectory.includes(w));
        sections.push(`• **${trajectoryName}** (${pred.severity})`);
        sections.push(`  - Probability: ${Math.round(pred.probability * 100)}%`);
        sections.push(`  - Expected: ${pred.expectedDuration}`);
        if (pred.activePrecursors.length > 0) {
            const topPrecursor = pred.activePrecursors[0];
            sections.push(`  - Key signal: ${topPrecursor.signal.replace(/_/g, ' ')}`);
        }
        if (isNegative && pred.preventiveActions.length > 0) {
            sections.push(`  - Prevention: ${pred.preventiveActions[0].action}`);
        }
        sections.push('');
    }
    sections.push('**Your role:** Address gently without alarming. Create conditions for resilience.');
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
            baselines: new Map(),
            recentObservations: [],
            trajectoryHistory: [],
            vulnerabilities: new Map(),
            lastUpdated: Date.now(),
        };
        userProfiles.set(userId, profile);
        // Initialize with common patterns
        initializeCommonPatterns(profile);
    }
    return profile;
}
function updateBaseline(baseline, value) {
    const decay = CONFIG.BASELINE_DECAY_RATE;
    // Update mean with exponential moving average
    baseline.mean = baseline.mean * decay + value * (1 - decay);
    // Update standard deviation approximation
    const deviation = Math.abs(value - baseline.mean);
    baseline.stdDev = baseline.stdDev * decay + deviation * (1 - decay);
    baseline.stdDev = Math.max(0.05, baseline.stdDev); // Floor to prevent div by zero
    // Update min/max
    baseline.min = Math.min(baseline.min, value);
    baseline.max = Math.max(baseline.max, value);
    baseline.sampleCount++;
    baseline.lastUpdated = Date.now();
}
function updatePatterns(profile, trajectory, precedingObservations) {
    let pattern = profile.patterns.get(trajectory);
    if (!pattern) {
        pattern = {
            trajectory,
            signals: [],
            accuracy: 0.5,
            observationCount: 0,
        };
        profile.patterns.set(trajectory, pattern);
    }
    pattern.observationCount++;
    // Learn from preceding observations
    for (const obs of precedingObservations) {
        const existingSignal = pattern.signals.find((s) => s.signal === obs.signal);
        if (existingSignal) {
            // Update existing signal
            existingSignal.reliability = existingSignal.reliability * 0.9 + 0.1; // Increase reliability
            existingSignal.weight = existingSignal.weight * 0.9 + Math.abs(obs.deviation) * 0.05;
        }
        else {
            // Add new signal
            pattern.signals.push({
                signal: obs.signal,
                direction: obs.deviation > 0 ? 'increase' : 'decrease',
                typicalLeadTime: Date.now() - obs.timestamp,
                reliability: 0.3, // Start low
                weight: 0.5,
            });
        }
    }
    // Prune low-reliability signals
    pattern.signals = pattern.signals.filter((s) => s.reliability > 0.1);
    // Sort by reliability
    pattern.signals.sort((a, b) => b.reliability - a.reliability);
}
function evaluatePattern(profile, trajectory, pattern) {
    const now = Date.now();
    if (pattern.signals.length === 0)
        return null;
    // Check recent observations against pattern
    const activePrecursors = [];
    let totalWeight = 0;
    let weightedSum = 0;
    for (const patternSignal of pattern.signals) {
        // Find recent observations of this signal
        const recentObs = profile.recentObservations
            .filter((o) => o.signal === patternSignal.signal)
            .filter((o) => now - o.timestamp < CONFIG.MAX_PREDICTION_HORIZON_HOURS * 60 * 60 * 1000);
        if (recentObs.length === 0)
            continue;
        const latestObs = recentObs[recentObs.length - 1];
        const baseline = profile.baselines.get(patternSignal.signal);
        if (!baseline)
            continue;
        // Check if deviation matches pattern direction
        const matchesDirection = (patternSignal.direction === 'increase' && latestObs.deviation > 0) ||
            (patternSignal.direction === 'decrease' && latestObs.deviation < 0) ||
            (patternSignal.direction === 'volatility' && Math.abs(latestObs.deviation) > 1);
        if (matchesDirection) {
            const contribution = patternSignal.weight * patternSignal.reliability * Math.abs(latestObs.deviation);
            activePrecursors.push({
                signal: patternSignal.signal,
                currentValue: latestObs.value,
                baseline: baseline.mean,
                deviation: latestObs.deviation,
                contribution,
            });
            weightedSum += contribution;
            totalWeight += patternSignal.weight * patternSignal.reliability;
        }
    }
    if (activePrecursors.length === 0)
        return null;
    // Calculate probability
    const baseProb = totalWeight > 0 ? weightedSum / totalWeight : 0;
    const vulnerabilityBonus = profile.vulnerabilities.get(trajectory) || 0;
    const probability = Math.min(1, baseProb * 0.7 + vulnerabilityBonus * 0.3);
    // Calculate expected onset
    const avgLeadTime = pattern.signals.reduce((sum, s) => sum + s.typicalLeadTime * s.reliability, 0) / pattern.signals.reduce((sum, s) => sum + s.reliability, 0);
    const expectedOnset = new Date(now + avgLeadTime * (1 - probability));
    // Determine severity
    let severity;
    if (probability >= 0.8)
        severity = 'alert';
    else if (probability >= 0.6)
        severity = 'warning';
    else if (probability >= 0.4)
        severity = 'caution';
    else
        severity = 'watch';
    // Determine expected duration
    const pastEvents = profile.trajectoryHistory.filter((t) => t.trajectory === trajectory);
    let expectedDuration = 'unknown';
    if (pastEvents.length > 0) {
        const avgDuration = pastEvents.reduce((s, e) => s + e.duration, 0) / pastEvents.length;
        if (avgDuration < 6 * 60 * 60 * 1000)
            expectedDuration = 'hours';
        else if (avgDuration < 2 * 24 * 60 * 60 * 1000)
            expectedDuration = 'days';
        else if (avgDuration < 7 * 24 * 60 * 60 * 1000)
            expectedDuration = 'week';
        else
            expectedDuration = 'weeks';
    }
    // Generate likely triggers
    const likelyTriggers = generateLikelyTriggers(activePrecursors);
    // Generate preventive actions
    const preventiveActions = generatePreventiveActions(trajectory, activePrecursors);
    // Calculate confidence
    const confidence = Math.min(0.9, 0.3 + pattern.observationCount * 0.05 + activePrecursors.length * 0.1);
    return {
        trajectory,
        probability,
        expectedOnset,
        expectedDuration,
        confidence,
        activePrecursors,
        likelyTriggers,
        preventiveActions,
        severity,
    };
}
function evaluateGenericPatterns(profile) {
    const predictions = [];
    const now = Date.now();
    // Look for recent significant deviations
    const recentDeviations = profile.recentObservations
        .filter((o) => now - o.timestamp < 24 * 60 * 60 * 1000) // Last 24 hours
        .filter((o) => Math.abs(o.deviation) >= CONFIG.DEVIATION_THRESHOLD);
    if (recentDeviations.length === 0)
        return predictions;
    // Map signals to likely trajectories
    const signalToTrajectory = {
        'sleep_pattern_change': ['mood_decline', 'anxiety_spike', 'burnout_cascade'],
        'energy_fluctuation': ['mood_decline', 'burnout_cascade', 'overwhelm_building'],
        'exercise_drop': ['mood_decline', 'energy_upswing'],
        'social_pattern_change': ['withdrawal_pattern', 'connection_deepening'],
        'routine_disruption': ['overwhelm_building', 'stability_period'],
        'self_care_drop': ['burnout_cascade', 'mood_decline'],
        'message_frequency_change': ['withdrawal_pattern', 'anxiety_spike'],
        'message_length_change': ['emotional_shift', 'overwhelm_building'],
        'emotional_volatility': ['emotional_shift', 'anxiety_spike'],
        'valence_shift': ['mood_decline', 'mood_lift'],
        'rumination_increase': ['anxiety_spike', 'depression_dip'],
        'future_focus_change': ['clarity_emerging', 'depression_dip'],
        'self_talk_shift': ['confidence_building', 'depression_dip'],
        'topic_shift': ['emotional_shift', 'clarity_emerging'],
        'vocabulary_change': ['growth_phase_entry', 'emotional_shift'],
        'humor_change': ['mood_decline', 'mood_lift'],
        'response_latency': ['overwhelm_building', 'withdrawal_pattern'],
        'anniversary_approaching': ['grief_wave', 'emotional_shift'],
        'deadline_approaching': ['anxiety_spike', 'overwhelm_building'],
        'seasonal_pattern': ['mood_decline', 'mood_lift'],
        'relationship_stress': ['mood_decline', 'irritability_surge'],
        'work_stress_signals': ['burnout_cascade', 'anxiety_spike'],
        'health_concern_signals': ['anxiety_spike', 'mood_decline'],
    };
    // Count trajectory signals
    const trajectoryCounts = new Map();
    for (const deviation of recentDeviations) {
        const possibleTrajectories = signalToTrajectory[deviation.signal] || [];
        // Direction matters
        const isNegative = deviation.deviation < 0;
        for (const traj of possibleTrajectories) {
            const isNegativeTrajectory = ['decline', 'spike', 'building', 'dip', 'surge', 'withdrawal', 'cascade', 'wave']
                .some((w) => traj.includes(w));
            // Only count if directions align
            if (isNegative === isNegativeTrajectory || traj.includes('shift') || traj.includes('phase')) {
                const count = trajectoryCounts.get(traj) || 0;
                trajectoryCounts.set(traj, count + Math.abs(deviation.deviation));
            }
        }
    }
    // Create predictions for significant counts
    for (const [trajectory, count] of trajectoryCounts) {
        if (count < 2)
            continue;
        const probability = Math.min(0.7, count * 0.2);
        const vulnerability = profile.vulnerabilities.get(trajectory) || 0.5;
        const adjustedProbability = probability * 0.7 + vulnerability * 0.3;
        if (adjustedProbability < 0.3)
            continue;
        const relevantDeviations = recentDeviations.filter((d) => (signalToTrajectory[d.signal] || []).includes(trajectory));
        let severity;
        if (adjustedProbability >= 0.8)
            severity = 'alert';
        else if (adjustedProbability >= 0.6)
            severity = 'warning';
        else if (adjustedProbability >= 0.4)
            severity = 'caution';
        else
            severity = 'watch';
        predictions.push({
            trajectory,
            probability: adjustedProbability,
            expectedOnset: new Date(now + 24 * 60 * 60 * 1000), // Within 24 hours
            expectedDuration: 'unknown',
            confidence: 0.4, // Lower confidence for generic patterns
            activePrecursors: relevantDeviations.map((d) => ({
                signal: d.signal,
                currentValue: d.value,
                baseline: d.baseline,
                deviation: d.deviation,
                contribution: Math.abs(d.deviation) * 0.3,
            })),
            likelyTriggers: generateLikelyTriggers(relevantDeviations.map((d) => ({
                signal: d.signal,
                currentValue: d.value,
                baseline: d.baseline,
                deviation: d.deviation,
                contribution: Math.abs(d.deviation),
            }))),
            preventiveActions: generatePreventiveActions(trajectory, []),
            severity,
        });
    }
    return predictions;
}
function evaluateGenericTrajectory(profile, trajectory) {
    // Simple generic evaluation
    const vulnerability = profile.vulnerabilities.get(trajectory) || 0.5;
    // Check if recent deviations suggest this trajectory
    const now = Date.now();
    const recentDeviations = profile.recentObservations
        .filter((o) => now - o.timestamp < 48 * 60 * 60 * 1000)
        .filter((o) => Math.abs(o.deviation) >= 1);
    if (recentDeviations.length === 0 && vulnerability < 0.6)
        return null;
    const probability = vulnerability * 0.5 + (recentDeviations.length > 0 ? 0.3 : 0);
    return {
        trajectory,
        probability,
        expectedOnset: new Date(now + 48 * 60 * 60 * 1000),
        expectedDuration: 'unknown',
        confidence: 0.3,
        activePrecursors: [],
        likelyTriggers: [],
        preventiveActions: generatePreventiveActions(trajectory, []),
        severity: probability >= 0.6 ? 'caution' : 'watch',
    };
}
function generateLikelyTriggers(activePrecursors) {
    const triggers = [];
    for (const precursor of activePrecursors) {
        switch (precursor.signal) {
            case 'sleep_pattern_change':
                triggers.push('sleep quality changes affecting mood');
                break;
            case 'work_stress_signals':
                triggers.push('accumulated work pressure');
                break;
            case 'relationship_stress':
                triggers.push('relationship tension');
                break;
            case 'anniversary_approaching':
                triggers.push('significant date approaching');
                break;
            case 'social_pattern_change':
                triggers.push('changes in social connection');
                break;
            case 'self_talk_shift':
                triggers.push('internal narrative shifting');
                break;
            case 'rumination_increase':
                triggers.push('repetitive thought patterns');
                break;
        }
    }
    return [...new Set(triggers)].slice(0, 3);
}
function generatePreventiveActions(trajectory, activePrecursors) {
    const actions = [];
    switch (trajectory) {
        case 'mood_decline':
        case 'depression_dip':
            actions.push({ action: 'Encourage connection with supportive people', effectiveness: 0.7, timing: 'now' });
            actions.push({ action: 'Suggest physical activity', effectiveness: 0.6, timing: 'today' });
            actions.push({ action: 'Validate current experience without fixing', effectiveness: 0.8, timing: 'ongoing' });
            break;
        case 'anxiety_spike':
            actions.push({ action: 'Ground in present moment', effectiveness: 0.7, timing: 'now' });
            actions.push({ action: 'Break down overwhelming tasks', effectiveness: 0.8, timing: 'when ready' });
            actions.push({ action: 'Address specific worries directly', effectiveness: 0.6, timing: 'gently' });
            break;
        case 'burnout_cascade':
            actions.push({ action: 'Identify one thing to let go', effectiveness: 0.8, timing: 'soon' });
            actions.push({ action: 'Protect rest time', effectiveness: 0.9, timing: 'immediately' });
            actions.push({ action: 'Lower expectations temporarily', effectiveness: 0.7, timing: 'this week' });
            break;
        case 'overwhelm_building':
            actions.push({ action: 'Simplify and prioritize', effectiveness: 0.8, timing: 'now' });
            actions.push({ action: 'Give permission to not be perfect', effectiveness: 0.7, timing: 'ongoing' });
            actions.push({ action: 'Break things into smaller pieces', effectiveness: 0.8, timing: 'when planning' });
            break;
        case 'withdrawal_pattern':
            actions.push({ action: 'Gentle outreach (don\'t push)', effectiveness: 0.6, timing: 'ongoing' });
            actions.push({ action: 'Maintain low-pressure connection', effectiveness: 0.7, timing: 'consistently' });
            actions.push({ action: 'Validate need for space', effectiveness: 0.8, timing: 'always' });
            break;
        default:
            actions.push({ action: 'Stay present and attuned', effectiveness: 0.7, timing: 'ongoing' });
            actions.push({ action: 'Create safety for expression', effectiveness: 0.8, timing: 'always' });
    }
    return actions;
}
function initializeCommonPatterns(profile) {
    // Initialize with population-level patterns
    const commonPatterns = [
        {
            trajectory: 'mood_decline',
            signals: [
                { signal: 'sleep_pattern_change', direction: 'decrease', typicalLeadTime: 3 * 24 * 60 * 60 * 1000, reliability: 0.6, weight: 0.8 },
                { signal: 'energy_fluctuation', direction: 'decrease', typicalLeadTime: 2 * 24 * 60 * 60 * 1000, reliability: 0.5, weight: 0.7 },
                { signal: 'valence_shift', direction: 'decrease', typicalLeadTime: 1 * 24 * 60 * 60 * 1000, reliability: 0.7, weight: 0.9 },
            ],
        },
        {
            trajectory: 'anxiety_spike',
            signals: [
                { signal: 'rumination_increase', direction: 'increase', typicalLeadTime: 2 * 24 * 60 * 60 * 1000, reliability: 0.7, weight: 0.9 },
                { signal: 'future_focus_change', direction: 'increase', typicalLeadTime: 1 * 24 * 60 * 60 * 1000, reliability: 0.5, weight: 0.6 },
                { signal: 'emotional_volatility', direction: 'increase', typicalLeadTime: 1 * 24 * 60 * 60 * 1000, reliability: 0.6, weight: 0.7 },
            ],
        },
        {
            trajectory: 'burnout_cascade',
            signals: [
                { signal: 'self_care_drop', direction: 'decrease', typicalLeadTime: 7 * 24 * 60 * 60 * 1000, reliability: 0.7, weight: 0.9 },
                { signal: 'work_stress_signals', direction: 'increase', typicalLeadTime: 5 * 24 * 60 * 60 * 1000, reliability: 0.6, weight: 0.8 },
                { signal: 'social_pattern_change', direction: 'decrease', typicalLeadTime: 4 * 24 * 60 * 60 * 1000, reliability: 0.5, weight: 0.6 },
            ],
        },
    ];
    for (const patternData of commonPatterns) {
        profile.patterns.set(patternData.trajectory, {
            trajectory: patternData.trajectory,
            signals: patternData.signals,
            accuracy: 0.5,
            observationCount: 0,
        });
    }
}
// ============================================================================
// EXPORTS
// ============================================================================
export const preTrajectoryDetection = {
    recordPrecursorObservation,
    recordTrajectoryEvent,
    recordConversationSignals,
    predictTrajectories,
    getTrajectoryAlerts,
    predictSpecificTrajectory,
    buildPreTrajectoryContext,
};
export default preTrajectoryDetection;
//# sourceMappingURL=pre-trajectory-detection.js.map