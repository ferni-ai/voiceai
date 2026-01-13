/**
 * Emotional Leading
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Rather than only mirroring user emotions, strategically lead them toward
 * better emotional states. This is a core "better than human" capability:
 * humans often get stuck in emotional spirals together, but we can gently
 * guide users toward more resourceful states.
 *
 * **Key principles:**
 * - Mirror FIRST (validation before leading)
 * - Lead GRADUALLY (subtle shifts, not jarring changes)
 * - Respect the feeling (don't dismiss negative emotions)
 * - Know when NOT to lead (crisis = presence, not redirection)
 *
 * @module @ferni/humanization/emotional-leading
 */
import { seededPick } from '../utils/rng.js';
import { createLogger } from '../../utils/safe-logger.js';
const logger = createLogger({ module: 'EmotionalLeading' });
const STRATEGY_CONFIGS = {
    energize: {
        bridgePhrases: [
            "You know what I'm curious about...",
            'Something just came to mind...',
            "I'm noticing something interesting here...",
            'What if we looked at this differently...',
        ],
        questionTypes: [
            "What's something you're looking forward to?",
            'When do you feel most alive?',
            'What would make today even a little better?',
            "What's one thing that's working well right now?",
        ],
        vocalTargets: {
            pitchShift: '+5%',
            tempoMultiplier: 1.05,
            energyTarget: 0.6,
        },
        transitionDuration: 3,
        minComfortLevel: 0.3,
    },
    calm: {
        bridgePhrases: [
            "Let's slow down for a second...",
            'Take a breath with me...',
            "Let's pause here...",
            "Hold on—let's just be here for a moment...",
        ],
        questionTypes: [
            'What do you need right now?',
            'Where do you feel this in your body?',
            "What's one thing you know for sure?",
            'What would help you feel more grounded?',
        ],
        vocalTargets: {
            pitchShift: '-3%',
            tempoMultiplier: 0.92,
            energyTarget: 0.45,
        },
        transitionDuration: 2,
        minComfortLevel: 0.4,
    },
    ground: {
        bridgePhrases: [
            "Let's get concrete for a moment...",
            'Let me ask you something specific...',
            'Can we zoom in on one thing?',
            "What's the most immediate thing here?",
        ],
        questionTypes: [
            "What's the next small step?",
            'What do you have control over right now?',
            "What's one thing you can do today?",
            "Who's one person who could help?",
        ],
        vocalTargets: {
            pitchShift: '0%',
            tempoMultiplier: 0.95,
            energyTarget: 0.5,
        },
        transitionDuration: 2,
        minComfortLevel: 0.3,
    },
    uplift: {
        bridgePhrases: [
            "I hear how hard this is. And I'm also curious...",
            "That's really tough. Can I share something I notice?",
            "I don't want to dismiss any of this. And...",
            'This is heavy. Let me offer another angle...',
        ],
        questionTypes: [
            'What has helped you through hard times before?',
            'What would you tell a friend in this situation?',
            "What's one thing you're proud of handling?",
            'What might you look back and see differently?',
        ],
        vocalTargets: {
            pitchShift: '+2%',
            tempoMultiplier: 1.0,
            energyTarget: 0.55,
        },
        transitionDuration: 4,
        minComfortLevel: 0.5,
    },
    validate: {
        bridgePhrases: [
            'That makes complete sense...',
            'Of course you feel that way...',
            'Anyone would feel like that...',
            "That's a really human response...",
        ],
        questionTypes: [
            'What else is coming up for you?',
            'Is there more to this?',
            "What's underneath that feeling?",
            'What would help you feel heard?',
        ],
        vocalTargets: {
            pitchShift: '-2%',
            tempoMultiplier: 0.95,
            energyTarget: 0.5,
        },
        transitionDuration: 1,
        minComfortLevel: 0.2,
    },
    hold_space: {
        bridgePhrases: ["I'm here...", 'Take your time...', "I'm with you...", '<break time="400ms"/>'],
        questionTypes: ['What do you need right now?', "I'm here. What feels right?"],
        vocalTargets: {
            pitchShift: '0%',
            tempoMultiplier: 0.9,
            energyTarget: 0.45,
        },
        transitionDuration: 0,
        minComfortLevel: 0,
    },
};
// ============================================================================
// NEGATIVE SPIRAL DETECTION
// ============================================================================
const NEGATIVE_SPIRAL_PATTERNS = [
    /\b(always|never|everyone|no one)\b/i,
    /\b(can't|won't|impossible|hopeless)\b/i,
    /\b(worst|terrible|awful|horrible)\b/i,
    /\b(hate myself|hate my|I'm such a)\b/i,
    /\b(nothing works|nothing helps|tried everything)\b/i,
    /\b(what's the point|why bother|give up)\b/i,
];
function countNegativeSpiralIndicators(text) {
    let count = 0;
    for (const pattern of NEGATIVE_SPIRAL_PATTERNS) {
        if (pattern.test(text))
            count++;
    }
    return count;
}
// ============================================================================
// EMOTIONAL LEADING ENGINE
// ============================================================================
export class EmotionalLeadingEngine {
    state;
    comfortLevel = 0.3;
    turnCount = 0;
    constructor() {
        this.state = this.createInitialState();
        logger.debug('EmotionalLeadingEngine initialized');
    }
    /**
     * Decide whether and how to lead
     */
    decideLeading(userState, userMessage, context) {
        this.turnCount = context.turnCount;
        this.comfortLevel = context.comfortLevel;
        // Update spiral indicators from message
        const spiralIndicators = countNegativeSpiralIndicators(userMessage);
        const stateWithIndicators = {
            ...userState,
            negativeSpiralIndicators: Math.max(userState.negativeSpiralIndicators, spiralIndicators),
        };
        // Check if we should NOT lead
        const noLeadReason = this.checkNoLeadConditions(stateWithIndicators, context);
        if (noLeadReason) {
            return this.createHoldSpaceDecision(noLeadReason);
        }
        // Determine appropriate strategy
        const strategy = this.selectStrategy(stateWithIndicators);
        const config = STRATEGY_CONFIGS[strategy];
        // Check comfort level for strategy
        if (context.comfortLevel < config.minComfortLevel) {
            return this.createValidateFirstDecision(`Comfort level ${context.comfortLevel.toFixed(2)} below strategy minimum ${config.minComfortLevel}`);
        }
        // Determine intensity based on state severity
        const intensity = this.determineIntensity(stateWithIndicators, context);
        // Calculate mirror turns
        const mirrorTurnsFirst = this.calculateMirrorTurns(stateWithIndicators, intensity);
        // Create decision
        const decision = {
            shouldLead: true,
            strategy,
            intensity,
            mirrorTurnsFirst,
            vocalAdjustments: {
                pitchTarget: config.vocalTargets.pitchShift,
                tempoTarget: config.vocalTargets.tempoMultiplier,
                energyTarget: config.vocalTargets.energyTarget,
                transitionDuration: config.transitionDuration,
            },
            contentAdjustments: {
                questionType: this.selectQuestionType(strategy, stateWithIndicators),
                acknowledgmentFirst: mirrorTurnsFirst > 0 || intensity !== 'direct',
                bridgePhrase: this.selectBridgePhrase(strategy),
                toneShift: this.describeToneShift(strategy),
            },
            reason: `Strategy: ${strategy}, User state: ${userState.emotion} (valence: ${userState.valence.toFixed(2)}, arousal: ${userState.arousal.toFixed(2)})`,
        };
        // Update state
        this.updateState(decision);
        logger.debug({
            strategy,
            intensity,
            mirrorTurnsFirst,
            userEmotion: userState.emotion,
        }, '🎯 Emotional leading decision');
        return decision;
    }
    /**
     * Report outcome of leading attempt
     */
    reportOutcome(success) {
        if (this.state.currentStrategy) {
            this.state.recentAttempts.push({
                strategy: this.state.currentStrategy,
                turn: this.turnCount,
                success,
            });
            // Keep last 5 attempts
            if (this.state.recentAttempts.length > 5) {
                this.state.recentAttempts.shift();
            }
            if (success) {
                this.state.progress = Math.min(1, this.state.progress + 0.3);
            }
        }
        logger.debug({ success, strategy: this.state.currentStrategy }, 'Leading outcome reported');
    }
    /**
     * Get current leading state
     */
    getState() {
        return { ...this.state };
    }
    /**
     * Check if we're currently in a leading sequence
     */
    isLeading() {
        return this.state.isLeading;
    }
    /**
     * Get leading progress (0-1)
     */
    getProgress() {
        return this.state.progress;
    }
    /**
     * Reset for new session
     */
    reset() {
        this.state = this.createInitialState();
        this.comfortLevel = 0.3;
        this.turnCount = 0;
        logger.debug('EmotionalLeadingEngine reset');
    }
    // ==========================================================================
    // PRIVATE HELPERS
    // ==========================================================================
    createInitialState() {
        return {
            isLeading: false,
            currentStrategy: null,
            mirrorTurnsRemaining: 0,
            leadingTurnCount: 0,
            targetState: null,
            progress: 0,
            recentAttempts: [],
        };
    }
    checkNoLeadConditions(state, context) {
        // Don't lead during crisis
        if (state.inCrisis || state.distressLevel > 0.8) {
            return 'User in crisis - hold space';
        }
        // Don't lead too early
        if (context.turnCount < 3) {
            return 'Too early in conversation';
        }
        // Don't lead if comfort too low and state is distressed
        if (context.comfortLevel < 0.3 && state.distressLevel > 0.5) {
            return 'Low comfort + distress - validate first';
        }
        // Don't lead if recent attempts failed
        const recentFailures = this.state.recentAttempts.slice(-3).filter((a) => !a.success).length;
        if (recentFailures >= 2) {
            return 'Recent leading attempts unsuccessful';
        }
        return null;
    }
    selectStrategy(state) {
        // Crisis = hold space
        if (state.inCrisis || state.distressLevel > 0.8) {
            return 'hold_space';
        }
        // Low energy user who isn't depressed → energize
        if (state.energy === 'low' && state.valence > -0.3 && state.arousal < 0.4) {
            return 'energize';
        }
        // High anxiety/arousal → calm
        if (state.arousal > 0.7 && state.valence < 0.2) {
            return 'calm';
        }
        // Scattered/overwhelmed → ground
        if (state.arousal > 0.5 && state.negativeSpiralIndicators >= 2) {
            return 'ground';
        }
        // Negative spiral → uplift (but carefully)
        if (state.negativeSpiralIndicators >= 2 && state.valence < -0.2) {
            return 'uplift';
        }
        // Moderate negative state → validate first
        if (state.valence < -0.2) {
            return 'validate';
        }
        // Default: hold space
        return 'hold_space';
    }
    determineIntensity(state, context) {
        // High comfort = can be more direct
        if (context.comfortLevel > 0.7) {
            return 'moderate';
        }
        // High distress = must be subtle
        if (state.distressLevel > 0.5) {
            return 'subtle';
        }
        // Default
        return 'subtle';
    }
    calculateMirrorTurns(state, intensity) {
        // Base mirror turns
        let mirrorTurns = 1;
        // More distress = more mirroring first
        if (state.distressLevel > 0.5)
            mirrorTurns += 1;
        if (state.distressLevel > 0.7)
            mirrorTurns += 1;
        // Subtle intensity = more mirroring
        if (intensity === 'subtle')
            mirrorTurns += 1;
        // Negative spiral = validate more
        if (state.negativeSpiralIndicators >= 2)
            mirrorTurns += 1;
        return Math.min(4, mirrorTurns);
    }
    selectQuestionType(strategy, _state) {
        switch (strategy) {
            case 'energize':
                return 'strength';
            case 'calm':
                return 'ground';
            case 'ground':
                return 'ground';
            case 'uplift':
                return 'reframe';
            case 'validate':
                return 'explore';
            default:
                return 'explore';
        }
    }
    selectBridgePhrase(strategy) {
        const phrases = STRATEGY_CONFIGS[strategy].bridgePhrases;
        return seededPick(`${Date.now()}:583`, phrases) ?? phrases[0];
    }
    describeToneShift(strategy) {
        switch (strategy) {
            case 'energize':
                return 'Gradually lift energy and tempo';
            case 'calm':
                return 'Slow down, lower pitch, create space';
            case 'ground':
                return 'Become concrete and specific';
            case 'uplift':
                return 'Acknowledge then offer new perspective';
            case 'validate':
                return 'Match and affirm their experience';
            case 'hold_space':
                return 'Be present without redirecting';
            default:
                return 'Natural conversation flow';
        }
    }
    createHoldSpaceDecision(reason) {
        return {
            shouldLead: false,
            strategy: 'hold_space',
            intensity: 'subtle',
            mirrorTurnsFirst: 0,
            vocalAdjustments: {
                pitchTarget: '0%',
                tempoTarget: 0.9,
                energyTarget: 0.45,
                transitionDuration: 0,
            },
            contentAdjustments: {
                questionType: 'explore',
                acknowledgmentFirst: true,
                bridgePhrase: "I'm here...",
                toneShift: 'Be present without redirecting',
            },
            reason,
        };
    }
    createValidateFirstDecision(reason) {
        return {
            shouldLead: true,
            strategy: 'validate',
            intensity: 'subtle',
            mirrorTurnsFirst: 2,
            vocalAdjustments: {
                pitchTarget: '-2%',
                tempoTarget: 0.95,
                energyTarget: 0.5,
                transitionDuration: 1,
            },
            contentAdjustments: {
                questionType: 'explore',
                acknowledgmentFirst: true,
                bridgePhrase: 'That makes complete sense...',
                toneShift: 'Match and affirm their experience',
            },
            reason,
        };
    }
    updateState(decision) {
        this.state.isLeading = decision.shouldLead;
        this.state.currentStrategy = decision.strategy;
        this.state.mirrorTurnsRemaining = decision.mirrorTurnsFirst;
        this.state.leadingTurnCount = 0;
        this.state.targetState = {
            valence: decision.strategy === 'uplift' || decision.strategy === 'energize' ? 0.3 : 0,
            arousal: decision.vocalAdjustments.energyTarget,
            energy: decision.vocalAdjustments.energyTarget,
        };
        this.state.progress = 0;
    }
}
// ============================================================================
// SINGLETON
// ============================================================================
const engines = new Map();
export function getEmotionalLeadingEngine(sessionId) {
    if (!engines.has(sessionId)) {
        engines.set(sessionId, new EmotionalLeadingEngine());
    }
    return engines.get(sessionId);
}
export function resetEmotionalLeadingEngine(sessionId) {
    const engine = engines.get(sessionId);
    if (engine) {
        engine.reset();
        engines.delete(sessionId);
    }
}
export function resetAllEmotionalLeadingEngines() {
    engines.clear();
}
export default EmotionalLeadingEngine;
//# sourceMappingURL=emotional-leading.js.map