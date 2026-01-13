/**
 * Life Phase Prediction - Better Than Human v4
 *
 * > "We see the season of your life, not just the day."
 *
 * SUPERHUMAN CAPABILITY: Predict personal "life seasons" independent
 * of the calendar - knowing when someone is in expansion, consolidation,
 * transition, or recovery.
 *
 * A therapist might recognize a life phase, but can't:
 * - Track patterns across months/years to predict the NEXT phase
 * - Know the typical duration of phases for THIS person
 * - Identify phase transition signals early
 * - Adjust support style for the current phase
 *
 * Life phases we track:
 * - Expansion: Taking on new challenges, growing
 * - Consolidation: Integrating recent growth, stabilizing
 * - Transition: Between chapters, identity shifting
 * - Recovery: Healing from something, rebuilding
 * - Plateau: Maintenance mode (not stagnation!)
 * - Emergence: Something new forming, not yet clear
 * - Integration: Making sense of changes
 * - Preparation: Building toward something
 *
 * @module intelligence/predictive/life-phase-prediction
 */
import { createLogger } from '../../utils/safe-logger.js';
const log = createLogger({ module: 'LifePhasePrediction' });
// ============================================================================
// CONFIGURATION
// ============================================================================
const CONFIG = {
    /** Signal weights for each phase */
    PHASE_SIGNALS: {
        expansion: {
            positive: ['new_initiatives', 'future_planning', 'energy_increase', 'excitement_increase', 'learning_mode'],
            negative: ['withdrawal', 'routine_stability', 'reflection_increase'],
        },
        consolidation: {
            positive: ['completion_focus', 'routine_stability', 'sustainable_pace', 'identity_clarity'],
            negative: ['new_initiatives', 'emotional_volatility', 'overextension'],
        },
        transition: {
            positive: ['questioning_identity', 'values_questioning', 'reflection_increase', 'routine_disruption'],
            negative: ['routine_stability', 'identity_clarity', 'completion_focus'],
        },
        recovery: {
            positive: ['withdrawal', 'reflection_increase', 'emotional_processing', 'grief_presence'],
            negative: ['new_initiatives', 'overextension', 'future_planning'],
        },
        plateau: {
            positive: ['routine_stability', 'sustainable_pace', 'emotional_stability'],
            negative: ['emotional_volatility', 'new_initiatives', 'energy_increase'],
        },
        emergence: {
            positive: ['questioning_identity', 'future_planning', 'excitement_increase', 'energy_increase'],
            negative: ['completion_focus', 'routine_stability'],
        },
        integration: {
            positive: ['reflection_increase', 'emotional_processing', 'identity_clarity', 'values_clarity'],
            negative: ['new_initiatives', 'overextension'],
        },
        preparation: {
            positive: ['future_planning', 'learning_mode', 'energy_increase', 'sustainable_pace'],
            negative: ['withdrawal', 'reflection_increase'],
        },
        crisis: {
            positive: ['emotional_volatility', 'routine_disruption', 'energy_decrease', 'withdrawal'],
            negative: ['emotional_stability', 'sustainable_pace', 'future_planning'],
        },
        flowering: {
            positive: ['energy_increase', 'teaching_mode', 'identity_clarity', 'values_clarity', 'new_initiatives'],
            negative: ['questioning_identity', 'withdrawal', 'grief_presence'],
        },
    },
    /** Default phase durations (days) */
    DEFAULT_DURATIONS: {
        expansion: { min: 30, max: 180 },
        consolidation: { min: 14, max: 90 },
        transition: { min: 30, max: 365 },
        recovery: { min: 14, max: 180 },
        plateau: { min: 30, max: 365 },
        emergence: { min: 14, max: 90 },
        integration: { min: 14, max: 60 },
        preparation: { min: 14, max: 120 },
        crisis: { min: 1, max: 90 },
        flowering: { min: 7, max: 90 },
    },
    /** Common phase sequences */
    COMMON_SEQUENCES: [
        { from: 'expansion', to: 'consolidation', probability: 0.4 },
        { from: 'expansion', to: 'plateau', probability: 0.2 },
        { from: 'consolidation', to: 'plateau', probability: 0.3 },
        { from: 'consolidation', to: 'expansion', probability: 0.2 },
        { from: 'transition', to: 'emergence', probability: 0.3 },
        { from: 'transition', to: 'recovery', probability: 0.2 },
        { from: 'recovery', to: 'integration', probability: 0.4 },
        { from: 'recovery', to: 'plateau', probability: 0.3 },
        { from: 'plateau', to: 'emergence', probability: 0.3 },
        { from: 'plateau', to: 'expansion', probability: 0.2 },
        { from: 'emergence', to: 'preparation', probability: 0.4 },
        { from: 'emergence', to: 'expansion', probability: 0.3 },
        { from: 'integration', to: 'consolidation', probability: 0.3 },
        { from: 'integration', to: 'emergence', probability: 0.3 },
        { from: 'preparation', to: 'expansion', probability: 0.5 },
        { from: 'crisis', to: 'recovery', probability: 0.6 },
        { from: 'flowering', to: 'consolidation', probability: 0.4 },
    ],
    /** Maximum observations to keep */
    MAX_OBSERVATIONS: 100,
    /** Confidence threshold for phase detection */
    CONFIDENCE_THRESHOLD: 0.5,
};
// ============================================================================
// STORAGE
// ============================================================================
const userProfiles = new Map();
// ============================================================================
// OBSERVATION RECORDING
// ============================================================================
/**
 * Record a phase signal observation
 *
 * @param userId - User ID
 * @param signal - What was observed
 * @param strength - Signal strength (0-1)
 * @param context - Optional context
 */
export function recordPhaseSignal(userId, signal, strength, context) {
    const profile = getOrCreateProfile(userId);
    const now = Date.now();
    profile.observations.push({
        signal,
        strength: Math.max(0, Math.min(1, strength)),
        timestamp: now,
        context,
    });
    // Trim observations
    if (profile.observations.length > CONFIG.MAX_OBSERVATIONS) {
        profile.observations = profile.observations.slice(-CONFIG.MAX_OBSERVATIONS);
    }
    // Check if phase should change
    const prediction = predictPhase(userId);
    if (prediction && prediction.phaseConfidence > CONFIG.CONFIDENCE_THRESHOLD) {
        if (prediction.currentPhase !== profile.currentPhase) {
            transitionPhase(profile, prediction.currentPhase);
        }
    }
    profile.lastUpdated = now;
    log.debug({
        userId,
        signal,
        strength: strength.toFixed(2),
        currentPhase: profile.currentPhase,
    }, '🌙 Recorded phase signal');
}
/**
 * Record multiple signals from conversation analysis
 *
 * @param userId - User ID
 * @param analysis - Conversation analysis
 */
export function recordConversationPhaseSignals(userId, analysis) {
    // Map analysis to signals
    if (analysis.newInitiatives !== undefined && analysis.newInitiatives > 0) {
        recordPhaseSignal(userId, 'new_initiatives', Math.min(1, analysis.newInitiatives * 0.3));
    }
    if (analysis.reflectionLevel !== undefined) {
        recordPhaseSignal(userId, 'reflection_increase', analysis.reflectionLevel);
    }
    if (analysis.futureFocus !== undefined) {
        recordPhaseSignal(userId, 'future_planning', analysis.futureFocus);
    }
    if (analysis.emotionalVolatility !== undefined) {
        if (analysis.emotionalVolatility > 0.5) {
            recordPhaseSignal(userId, 'emotional_volatility', analysis.emotionalVolatility);
        }
        else {
            recordPhaseSignal(userId, 'emotional_stability', 1 - analysis.emotionalVolatility);
        }
    }
    if (analysis.energyLevel !== undefined) {
        if (analysis.energyLevel > 0.6) {
            recordPhaseSignal(userId, 'energy_increase', analysis.energyLevel);
        }
        else if (analysis.energyLevel < 0.4) {
            recordPhaseSignal(userId, 'energy_decrease', 1 - analysis.energyLevel);
        }
        else {
            recordPhaseSignal(userId, 'sustainable_pace', 0.6);
        }
    }
    if (analysis.identityQuestioning) {
        recordPhaseSignal(userId, 'questioning_identity', 0.8);
    }
    if (analysis.valuesDiscussion) {
        recordPhaseSignal(userId, 'values_questioning', 0.7);
    }
    if (analysis.griefPresent) {
        recordPhaseSignal(userId, 'grief_presence', 0.8);
    }
    if (analysis.learningMentioned) {
        recordPhaseSignal(userId, 'learning_mode', 0.7);
    }
    if (analysis.completionFocus) {
        recordPhaseSignal(userId, 'completion_focus', 0.7);
    }
}
/**
 * Manually set current phase (for calibration)
 *
 * @param userId - User ID
 * @param phase - Phase to set
 * @param reason - Why this phase
 */
export function setCurrentPhase(userId, phase, reason) {
    const profile = getOrCreateProfile(userId);
    if (phase !== profile.currentPhase) {
        transitionPhase(profile, phase);
        log.info({ userId, phase, reason }, '🌙 Phase manually set');
    }
}
// ============================================================================
// PREDICTION FUNCTIONS
// ============================================================================
/**
 * Predict the current life phase
 *
 * @param userId - User ID
 * @returns Phase prediction
 */
export function predictPhase(userId) {
    const profile = userProfiles.get(userId);
    if (!profile || profile.observations.length < 5)
        return null;
    const now = Date.now();
    // Calculate phase scores
    const phaseScores = calculatePhaseScores(profile);
    // Find top phase
    let topPhase = profile.currentPhase;
    let topScore = 0;
    for (const [phase, score] of phaseScores) {
        if (score > topScore) {
            topScore = score;
            topPhase = phase;
        }
    }
    // Calculate confidence
    const phaseConfidence = Math.min(0.95, topScore / 10);
    // Get active signals
    const activeSignals = getActiveSignals(profile, topPhase);
    // Predict next phase
    const nextPhase = predictNextPhase(profile, topPhase);
    // Calculate phase duration
    const phaseDuration = now - profile.phaseStarted;
    const phaseDays = phaseDuration / (1000 * 60 * 60 * 24);
    const defaultDuration = CONFIG.DEFAULT_DURATIONS[topPhase];
    const personalDuration = profile.phasePatterns.typicalDurations.get(topPhase);
    const expectedDuration = {
        min: Math.max(1, (personalDuration || defaultDuration.min) - phaseDays),
        max: Math.max(7, (personalDuration || defaultDuration.max) - phaseDays),
        confidence: personalDuration ? 0.7 : 0.4,
    };
    // Get phase needs
    const phaseNeeds = getPhaseNeeds(topPhase);
    // Calculate phase health
    const phaseHealth = calculatePhaseHealth(profile, topPhase, activeSignals);
    return {
        currentPhase: topPhase,
        phaseConfidence,
        phaseStartEstimate: new Date(profile.phaseStarted),
        expectedDuration,
        nextPhase,
        activeSignals,
        phaseNeeds,
        phaseHealth,
    };
}
/**
 * Get phase prediction summary
 *
 * @param userId - User ID
 * @returns Simplified phase info
 */
export function getPhaseInfo(userId) {
    const profile = userProfiles.get(userId);
    if (!profile)
        return null;
    const prediction = predictPhase(userId);
    const daysInPhase = Math.floor((Date.now() - profile.phaseStarted) / (1000 * 60 * 60 * 24));
    const summaries = {
        expansion: 'Taking on new challenges and growing',
        consolidation: 'Integrating recent growth, finding stability',
        transition: 'Between chapters, identity evolving',
        recovery: 'Healing and rebuilding after difficulty',
        plateau: 'Maintaining a sustainable pace',
        emergence: 'Something new is forming',
        integration: 'Making sense of recent changes',
        preparation: 'Building toward something',
        crisis: 'Navigating active difficulty',
        flowering: 'Thriving and expressing fully',
    };
    return {
        phase: prediction?.currentPhase || profile.currentPhase,
        confidence: prediction?.phaseConfidence || 0.5,
        daysInPhase,
        summary: summaries[prediction?.currentPhase || profile.currentPhase],
    };
}
// ============================================================================
// CONTEXT BUILDING
// ============================================================================
/**
 * Build life phase context for LLM injection
 *
 * @param userId - User ID
 * @returns Context string for prompt injection
 */
export function buildPhaseContext(userId) {
    const prediction = predictPhase(userId);
    if (!prediction)
        return '';
    const sections = [];
    sections.push('[LIFE PHASE INTELLIGENCE - Their Personal Season]');
    sections.push('You understand where they are in their life journey:');
    sections.push('');
    // Current phase
    const phaseDesc = prediction.currentPhase.charAt(0).toUpperCase() +
        prediction.currentPhase.slice(1).replace(/_/g, ' ');
    sections.push(`**Current Phase:** ${phaseDesc}`);
    sections.push(`  Confidence: ${Math.round(prediction.phaseConfidence * 100)}%`);
    sections.push(`  Started: ~${formatDuration(Date.now() - prediction.phaseStartEstimate.getTime())} ago`);
    sections.push('');
    // Phase needs
    sections.push('**What They Need:**');
    sections.push(`  → Support: ${prediction.phaseNeeds.support}`);
    sections.push(`  → Focus: ${prediction.phaseNeeds.focus}`);
    sections.push(`  → Avoid: ${prediction.phaseNeeds.avoid}`);
    sections.push('');
    // Phase health
    if (prediction.phaseHealth.resistance > 0.5) {
        sections.push('**⚠️ Notice:** They may be resisting this phase');
        sections.push(`  Help them accept where they are, not where they think they should be`);
        sections.push('');
    }
    // Next phase
    if (prediction.nextPhase.probability > 0.4) {
        const nextDesc = prediction.nextPhase.phase.charAt(0).toUpperCase() +
            prediction.nextPhase.phase.slice(1).replace(/_/g, ' ');
        sections.push(`**Ahead:** ${nextDesc} phase likely coming (${prediction.nextPhase.timing})`);
        if (prediction.nextPhase.triggers.length > 0) {
            sections.push(`  Triggers: ${prediction.nextPhase.triggers.slice(0, 2).join(', ')}`);
        }
    }
    // Common mistakes
    if (prediction.phaseNeeds.commonMistakes.length > 0) {
        sections.push('');
        sections.push('**Common Mistakes in This Phase:**');
        for (const mistake of prediction.phaseNeeds.commonMistakes.slice(0, 2)) {
            sections.push(`  - ${mistake}`);
        }
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
            currentPhase: 'plateau', // Safe default
            phaseStarted: Date.now(),
            phaseHistory: [],
            observations: [],
            phasePatterns: {
                typicalDurations: new Map(),
                commonSequences: [],
                personalTriggers: new Map(),
            },
            phaseTendencies: new Map(),
            lastUpdated: Date.now(),
        };
        userProfiles.set(userId, profile);
    }
    return profile;
}
function transitionPhase(profile, newPhase) {
    const now = Date.now();
    const duration = now - profile.phaseStarted;
    const durationDays = duration / (1000 * 60 * 60 * 24);
    // Record transition
    profile.phaseHistory.push({
        fromPhase: profile.currentPhase,
        toPhase: newPhase,
        timestamp: now,
        duration,
        triggers: [], // Could be filled in from recent observations
        smoothness: durationDays < 3 ? 'sudden' : 'gradual',
    });
    // Update typical duration for old phase
    const oldDuration = profile.phasePatterns.typicalDurations.get(profile.currentPhase);
    if (oldDuration) {
        profile.phasePatterns.typicalDurations.set(profile.currentPhase, oldDuration * 0.8 + durationDays * 0.2);
    }
    else {
        profile.phasePatterns.typicalDurations.set(profile.currentPhase, durationDays);
    }
    // Update sequence patterns
    const existingSeq = profile.phasePatterns.commonSequences.find((s) => s.from === profile.currentPhase && s.to === newPhase);
    if (existingSeq) {
        existingSeq.probability = Math.min(0.9, existingSeq.probability + 0.1);
    }
    else {
        profile.phasePatterns.commonSequences.push({
            from: profile.currentPhase,
            to: newPhase,
            probability: 0.4,
        });
    }
    // Make the transition
    profile.currentPhase = newPhase;
    profile.phaseStarted = now;
    log.info({
        userId: profile.userId,
        from: profile.phaseHistory[profile.phaseHistory.length - 1].fromPhase,
        to: newPhase,
        durationDays: Math.round(durationDays),
    }, '🌙 Phase transition');
}
function calculatePhaseScores(profile) {
    const scores = new Map();
    const now = Date.now();
    const decayDays = 14;
    // Initialize scores
    for (const phase of Object.keys(CONFIG.PHASE_SIGNALS)) {
        scores.set(phase, 0);
    }
    // Score based on observations
    for (const obs of profile.observations) {
        const ageMs = now - obs.timestamp;
        const ageDays = ageMs / (1000 * 60 * 60 * 24);
        const decayFactor = Math.pow(0.5, ageDays / decayDays);
        const weight = obs.strength * decayFactor;
        for (const [phase, signals] of Object.entries(CONFIG.PHASE_SIGNALS)) {
            const typedPhase = phase;
            let currentScore = scores.get(typedPhase) || 0;
            if (signals.positive.includes(obs.signal)) {
                currentScore += weight;
            }
            if (signals.negative.includes(obs.signal)) {
                currentScore -= weight * 0.5; // Negative signals have less weight
            }
            scores.set(typedPhase, currentScore);
        }
    }
    // Bias toward current phase (inertia)
    const currentScore = scores.get(profile.currentPhase) || 0;
    scores.set(profile.currentPhase, currentScore + 2); // Phase inertia
    // Apply personal tendencies
    for (const [phase, tendency] of profile.phaseTendencies) {
        const score = scores.get(phase) || 0;
        scores.set(phase, score + tendency);
    }
    return scores;
}
function getActiveSignals(profile, phase) {
    const now = Date.now();
    const recentDays = 7;
    const signals = [];
    const recentObs = profile.observations.filter((o) => now - o.timestamp < recentDays * 24 * 60 * 60 * 1000);
    const phaseSignals = CONFIG.PHASE_SIGNALS[phase];
    for (const obs of recentObs) {
        const isPositive = phaseSignals.positive.includes(obs.signal);
        const isNegative = phaseSignals.negative.includes(obs.signal);
        if (isPositive || isNegative) {
            const existing = signals.find((s) => s.signal === obs.signal);
            if (existing) {
                existing.strength = Math.max(existing.strength, obs.strength);
            }
            else {
                signals.push({
                    signal: obs.signal,
                    strength: obs.strength,
                    contribution: isPositive ? obs.strength : -obs.strength * 0.5,
                });
            }
        }
    }
    return signals.sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution)).slice(0, 5);
}
function predictNextPhase(profile, currentPhase) {
    // Check personal patterns first
    const personalSeqs = profile.phasePatterns.commonSequences.filter((s) => s.from === currentPhase);
    if (personalSeqs.length > 0) {
        const topSeq = personalSeqs.sort((a, b) => b.probability - a.probability)[0];
        return {
            phase: topSeq.to,
            probability: topSeq.probability,
            timing: 'weeks',
            triggers: profile.phasePatterns.personalTriggers.get(topSeq.to) || [],
        };
    }
    // Fall back to common patterns
    const commonSeqs = CONFIG.COMMON_SEQUENCES.filter((s) => s.from === currentPhase);
    if (commonSeqs.length > 0) {
        const topSeq = commonSeqs.sort((a, b) => b.probability - a.probability)[0];
        return {
            phase: topSeq.to,
            probability: topSeq.probability * 0.8, // Lower confidence for generic patterns
            timing: 'weeks',
            triggers: getCommonTriggers(topSeq.to),
        };
    }
    return {
        phase: 'consolidation',
        probability: 0.3,
        timing: 'unknown',
        triggers: [],
    };
}
function getPhaseNeeds(phase) {
    const needs = {
        expansion: {
            support: 'Encouragement to stretch but not overextend',
            avoid: 'Pushing too fast, neglecting foundations',
            focus: 'Sustainable growth, protecting energy',
            commonMistakes: ['Taking on too much', 'Ignoring warning signs', 'Comparing to others'],
        },
        consolidation: {
            support: 'Validation that stabilizing is valuable',
            avoid: 'Pressure to do more, guilt about "not growing"',
            focus: 'Integration, appreciation of gains',
            commonMistakes: ['Rushing to next thing', 'Dismissing progress', 'Feeling stuck when stabilizing'],
        },
        transition: {
            support: 'Patience with uncertainty, presence',
            avoid: 'Demands for clarity, pressure to decide',
            focus: 'Exploration, trying things, allowing confusion',
            commonMistakes: ['Forcing decisions', 'Clinging to old identity', 'Panic about uncertainty'],
        },
        recovery: {
            support: 'Permission to rest, gentle care',
            avoid: 'Pressure to "get back to normal", minimizing',
            focus: 'Rest, healing, self-compassion',
            commonMistakes: ['Rushing recovery', 'Guilt about needing time', 'Comparing to pre-difficulty self'],
        },
        plateau: {
            support: 'Affirmation that maintenance is success',
            avoid: 'Equating plateau with stagnation',
            focus: 'Sustainability, appreciation, presence',
            commonMistakes: ['Forcing growth', 'Boredom-driven changes', 'Dismissing current life'],
        },
        emergence: {
            support: 'Curiosity about what\'s forming',
            avoid: 'Premature commitment, forcing clarity',
            focus: 'Exploration, playing, following interest',
            commonMistakes: ['Committing too early', 'Dismissing new interests', 'Over-analyzing'],
        },
        integration: {
            support: 'Space for reflection and meaning-making',
            avoid: 'Rushing to next chapter',
            focus: 'Understanding, connecting dots, finding narrative',
            commonMistakes: ['Skipping integration', 'Moving on too fast', 'Not acknowledging change'],
        },
        preparation: {
            support: 'Help building capacity and foundations',
            avoid: 'Pressure to launch before ready',
            focus: 'Learning, practicing, preparing',
            commonMistakes: ['Impatience', 'Skipping preparation', 'Perfectionism'],
        },
        crisis: {
            support: 'Presence, practical help, hope-holding',
            avoid: 'Advice, minimizing, toxic positivity',
            focus: 'Survival, one day at a time, basics',
            commonMistakes: ['Expecting normal function', 'Isolation', 'Major decisions'],
        },
        flowering: {
            support: 'Celebration, witnessing, sharing',
            avoid: 'Warnings, dampening joy',
            focus: 'Full expression, sharing gifts, enjoying',
            commonMistakes: ['Guilt about thriving', 'Not savoring it', 'Fear of ending'],
        },
    };
    return needs[phase];
}
function calculatePhaseHealth(profile, phase, activeSignals) {
    // Alignment: Are their signals consistent with the phase?
    const positiveSignals = activeSignals.filter((s) => s.contribution > 0);
    const negativeSignals = activeSignals.filter((s) => s.contribution < 0);
    const alignment = activeSignals.length > 0
        ? positiveSignals.length / (positiveSignals.length + negativeSignals.length)
        : 0.5;
    // Resistance: Are they fighting the phase?
    // Look for signals that suggest wanting to be in a different phase
    const resistanceSignals = [
        'overextension', // Fighting recovery/plateau
        'withdrawal', // Fighting expansion
        'emotional_volatility', // Fighting consolidation
    ];
    const resistanceObs = profile.observations.filter((o) => resistanceSignals.includes(o.signal) && o.strength > 0.6);
    const resistance = Math.min(1, resistanceObs.length * 0.2);
    // Growth: Are they using the phase well?
    const growthSignals = [
        'learning_mode',
        'reflection_increase',
        'identity_clarity',
        'emotional_processing',
    ];
    const growthObs = profile.observations.filter((o) => growthSignals.includes(o.signal));
    const growth = Math.min(1, growthObs.length * 0.15);
    return { alignment, resistance, growth };
}
function getCommonTriggers(phase) {
    const triggers = {
        expansion: ['New opportunity', 'Completion of recovery', 'Energy returning'],
        consolidation: ['Exhaustion from growth', 'Need for stability', 'Desire to integrate'],
        transition: ['Major life change', 'Identity questioning', 'Old life no longer fitting'],
        recovery: ['Loss or setback', 'Burnout', 'Crisis resolution'],
        plateau: ['Stability achieved', 'Need for maintenance', 'Energy equilibrium'],
        emergence: ['Curiosity stirring', 'Old patterns loosening', 'New interests'],
        integration: ['Major experience completed', 'Need to make sense', 'Reflection urge'],
        preparation: ['Clear goal forming', 'Vision clarifying', 'Readiness building'],
        crisis: ['Sudden loss', 'Multiple stressors', 'System overwhelm'],
        flowering: ['Everything aligning', 'Mastery moment', 'Full expression opening'],
    };
    return triggers[phase];
}
function formatDuration(ms) {
    const days = Math.floor(ms / (1000 * 60 * 60 * 24));
    if (days < 7)
        return `${days} days`;
    if (days < 30)
        return `${Math.floor(days / 7)} weeks`;
    return `${Math.floor(days / 30)} months`;
}
// ============================================================================
// EXPORTS
// ============================================================================
export const lifePhasePrediction = {
    recordPhaseSignal,
    recordConversationPhaseSignals,
    setCurrentPhase,
    predictPhase,
    getPhaseInfo,
    buildPhaseContext,
};
export default lifePhasePrediction;
//# sourceMappingURL=life-phase-prediction.js.map