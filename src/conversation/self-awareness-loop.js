/**
 * Self-Awareness Feedback Loop
 *
 * Tracks "Did that land?" signals to enable genuine self-awareness.
 * This is what separates a real friend from a chatbot - the ability
 * to sense when something didn't resonate and course-correct.
 *
 * What we track:
 * 1. Response Effectiveness - Did user engage with what we said?
 * 2. Emotional Attunement - Did our tone match their state?
 * 3. Topic Resonance - Did they want to go deeper or change subject?
 * 4. Trust Signals - Are they opening up or closing down?
 *
 * What we enable:
 * - "Am I helping?" self-checks
 * - "Did that land?" reflections
 * - Course corrections when we miss
 * - Celebrating when we connect
 *
 * Philosophy: Real humans notice when a joke falls flat, when advice
 * doesn't resonate, or when they've said too much. This gives AI
 * that same social awareness.
 *
 * @module conversation/self-awareness-loop
 */
import { createLogger } from '../utils/safe-logger.js';
// 🦀 Rust-accelerated word counting
import { countWordsRust, isTokenCountingAvailable } from '../memory/rust-accelerator.js';
import { recordSelfAwarenessAssessment, recordSelfAwarePrompt } from './awareness-metrics.js';
import { getMomentumTracker } from './momentum-tracker.js';
const log = createLogger({ module: 'self-awareness' });
const RUST_COUNTING_AVAILABLE = isTokenCountingAvailable();
// ============================================================================
// SIGNAL DETECTION
// ============================================================================
const POSITIVE_SIGNALS = [
    /\b(yes|yeah|exactly|right|true|agree|same|me too)\b/i,
    /\b(thanks?|thank you|helpful|helps?)\b/i,
    /\b(wow|oh|ah|huh|interesting|never thought)\b/i,
    /\b(that('s| is) (so |really )?(true|right|helpful|good))\b/i,
    /\b(I (feel|felt) (heard|seen|understood))\b/i,
    /\b(you('re| are) right)\b/i,
    /\b(makes sense|good point)\b/i,
    /\b(I needed (to hear )?that)\b/i,
];
const NEGATIVE_SIGNALS = [
    /\b(no|nah|not really|I don't think)\b/i,
    /\b(but|however|although|actually)\b/i, // Contradicting
    /\b(I guess|maybe|I suppose)\b/i, // Lukewarm
    /\b(anyway|moving on|let's talk about)\b/i, // Topic change
    /\b(that's not (what|how))\b/i,
    /\b(you don't (understand|get it))\b/i,
    /\b(whatever|fine|okay)\b/i, // Dismissive
    /\b(can we|let's just)\b/i, // Redirect
];
const OPENING_UP_SIGNALS = [
    /\b(I('ve| have) never told|between us|honestly|truthfully)\b/i,
    /\b(the truth is|to be honest|actually)\b/i,
    /\b(I('m| am) (scared|afraid|worried|nervous))\b/i,
    /\b(I don't know (if|how|why))\b/i,
    /\b(it('s| is) hard to|I struggle)\b/i,
];
const CLOSING_DOWN_SIGNALS = [
    /\b(I('m| am) fine|it('s| is) fine|whatever)\b/i,
    /\b(doesn't matter|not important|forget it)\b/i,
    /\b(I should go|I have to|gotta run)\b/i,
    /\b(let's (change|move on|talk about something))\b/i,
];
function detectSignals(text) {
    const lowerText = text.toLowerCase();
    const positive = POSITIVE_SIGNALS.filter((pattern) => pattern.test(lowerText)).map((pattern) => pattern.source);
    const negative = NEGATIVE_SIGNALS.filter((pattern) => pattern.test(lowerText)).map((pattern) => pattern.source);
    const openingUp = OPENING_UP_SIGNALS.some((pattern) => pattern.test(lowerText));
    const closingDown = CLOSING_DOWN_SIGNALS.some((pattern) => pattern.test(lowerText));
    return { positive, negative, openingUp, closingDown };
}
// ============================================================================
// LANDING ASSESSMENT
// ============================================================================
function assessLanding(attempt, reaction, momentum) {
    const evidence = [];
    let score = 0.5; // Start neutral
    // Positive signals boost score
    if (reaction.positiveSignals.length > 0) {
        score += 0.15 * Math.min(reaction.positiveSignals.length, 3);
        evidence.push(`Positive signals: ${reaction.positiveSignals.length}`);
    }
    // Negative signals reduce score
    if (reaction.negativeSignals.length > 0) {
        score -= 0.2 * Math.min(reaction.negativeSignals.length, 2);
        evidence.push(`Negative signals: ${reaction.negativeSignals.length}`);
    }
    // Self-disclosure = strong landing
    if (reaction.selfDisclosure) {
        score += 0.25;
        evidence.push('User shared something personal');
    }
    // Question back = engagement
    if (reaction.questionAsked) {
        score += 0.1;
        evidence.push('User asked follow-up question');
    }
    // Topic continuity
    if (reaction.topicContinued) {
        score += 0.1;
        evidence.push('User stayed on topic');
    }
    else {
        score -= 0.15;
        evidence.push('User changed topic');
    }
    // Word count relative to response type
    if (attempt.responseType === 'question' && reaction.wordCount > 30) {
        score += 0.15;
        evidence.push('Substantial response to question');
    }
    else if (reaction.wordCount < 10) {
        score -= 0.1;
        evidence.push('Brief response');
    }
    // Emotional change
    if (reaction.emotionalChange > 0.2) {
        score += 0.15;
        evidence.push('User opened up emotionally');
    }
    else if (reaction.emotionalChange < -0.2) {
        score -= 0.2;
        evidence.push('User closed down emotionally');
    }
    // Response latency (quick = engaged, very slow = processing or distracted)
    if (reaction.responseLatencyMs !== undefined) {
        if (reaction.responseLatencyMs < 2000) {
            score += 0.05;
            evidence.push('Quick response');
        }
        else if (reaction.responseLatencyMs > 8000) {
            score -= 0.05;
            evidence.push('Slow response');
        }
    }
    // Momentum context
    if (momentum === 'peaking' || momentum === 'building') {
        score += 0.1;
        evidence.push(`Momentum: ${momentum}`);
    }
    else if (momentum === 'stalled' || momentum === 'winding_down') {
        score -= 0.1;
        evidence.push(`Momentum: ${momentum}`);
    }
    // Determine result
    let result;
    if (score >= 0.7) {
        result = 'landed';
    }
    else if (score >= 0.45) {
        result = 'partial';
    }
    else if (score < 0.35) {
        result = 'missed';
    }
    else {
        result = 'unknown';
    }
    // Generate suggestion
    const suggestion = generateSuggestion(result, attempt, reaction, evidence);
    return {
        result,
        confidence: Math.min(1, 0.5 + evidence.length * 0.1),
        evidence,
        suggestion,
    };
}
function generateSuggestion(result, attempt, reaction, _evidence) {
    switch (result) {
        case 'landed':
            // Only celebrate internally on strong landings
            if (reaction.selfDisclosure || reaction.questionAsked) {
                return {
                    type: 'go_deeper',
                    prompt: 'User is engaged and opening up - follow their lead',
                    urgency: 'low',
                };
            }
            return {
                type: 'celebrate_connection',
                prompt: 'Connection happening - maintain this energy',
                urgency: 'low',
            };
        case 'partial':
            if (!reaction.topicContinued) {
                return {
                    type: 'course_correct',
                    prompt: "Topic shift detected - follow user's new direction",
                    urgency: 'medium',
                };
            }
            if (attempt.responseType === 'advice' && reaction.negativeSignals.length > 0) {
                return {
                    type: 'check_in',
                    prompt: 'Advice may not have resonated - consider asking if helpful',
                    urgency: 'medium',
                };
            }
            return undefined;
        case 'missed':
            if (attempt.responseType === 'humor') {
                return {
                    type: 'acknowledge_miss',
                    prompt: "Humor didn't land - acknowledge and pivot",
                    urgency: 'high',
                };
            }
            if (attempt.responseType === 'advice') {
                return {
                    type: 'acknowledge_miss',
                    prompt: 'Advice missed the mark - validate feelings first',
                    urgency: 'high',
                };
            }
            if (reaction.emotionalChange < -0.2) {
                return {
                    type: 'pull_back',
                    prompt: 'User closing down - give space and ask open question',
                    urgency: 'high',
                };
            }
            return {
                type: 'course_correct',
                prompt: 'Response missed - try different approach',
                urgency: 'high',
            };
        default:
            return undefined;
    }
}
export class SelfAwarenessTracker {
    state;
    sessionId;
    personaId;
    constructor(sessionId, personaId = 'default') {
        this.sessionId = sessionId;
        this.personaId = personaId;
        this.state = {
            attempts: [],
            reactions: [],
            assessments: [],
            recentMisses: 0,
            recentLandings: 0,
            needsCheckIn: false,
            lastCheckInTurn: 0,
        };
    }
    /**
     * Record what we said (before seeing user's reaction)
     */
    recordAttempt(attempt) {
        const fullAttempt = {
            ...attempt,
            turn: this.state.attempts.length + 1,
            timestamp: Date.now(),
        };
        this.state.attempts.push(fullAttempt);
        log.debug({ sessionId: this.sessionId, turn: fullAttempt.turn, type: attempt.responseType }, 'Recorded response attempt');
    }
    /**
     * Record user's reaction (after they respond)
     */
    recordReaction(userText, context) {
        const signals = detectSignals(userText);
        const reaction = {
            turn: this.state.reactions.length + 1,
            // 🦀 Rust-accelerated word counting
            wordCount: RUST_COUNTING_AVAILABLE ? countWordsRust(userText) : userText.split(/\s+/).length,
            emotionalChange: context.emotionalChange || 0,
            topicContinued: context.topicContinued ?? true,
            questionAsked: context.questionAsked ?? /\?/.test(userText),
            selfDisclosure: context.selfDisclosure ?? signals.openingUp,
            positiveSignals: signals.positive,
            negativeSignals: signals.negative,
            responseLatencyMs: context.responseLatencyMs,
        };
        this.state.reactions.push(reaction);
        // Get corresponding attempt
        const attempt = this.state.attempts[reaction.turn - 1];
        if (!attempt) {
            log.warn({ turn: reaction.turn }, 'No attempt found for reaction');
            return null;
        }
        // Get momentum for context
        const momentum = getMomentumTracker(this.sessionId, this.personaId).getState();
        // Assess landing
        const assessment = assessLanding(attempt, reaction, momentum.current);
        this.state.assessments.push(assessment);
        // Record for awareness metrics
        recordSelfAwarenessAssessment(this.sessionId, this.personaId, assessment.result, attempt.responseType, this.state.recentMisses);
        // Update tracking
        if (assessment.result === 'landed') {
            this.state.recentLandings++;
            this.state.recentMisses = Math.max(0, this.state.recentMisses - 1);
        }
        else if (assessment.result === 'missed') {
            this.state.recentMisses++;
            this.state.recentLandings = Math.max(0, this.state.recentLandings - 1);
        }
        // Check if we need a check-in
        const turnsSinceCheckIn = reaction.turn - this.state.lastCheckInTurn;
        if (this.state.recentMisses >= 2 && turnsSinceCheckIn > 3) {
            this.state.needsCheckIn = true;
        }
        log.debug({
            sessionId: this.sessionId,
            turn: reaction.turn,
            result: assessment.result,
            confidence: assessment.confidence,
            recentMisses: this.state.recentMisses,
        }, 'Assessed landing');
        return assessment;
    }
    /**
     * Get current self-awareness state
     */
    getState() {
        const landedCount = this.state.assessments.filter((a) => a.result === 'landed').length;
        const totalAssessments = this.state.assessments.length;
        const overallEffectiveness = totalAssessments > 0 ? landedCount / totalAssessments : 0.5;
        return {
            recentMisses: this.state.recentMisses,
            recentLandings: this.state.recentLandings,
            needsCheckIn: this.state.needsCheckIn,
            lastAssessment: this.state.assessments[this.state.assessments.length - 1],
            overallEffectiveness,
        };
    }
    /**
     * Get a self-aware prompt injection based on current state
     */
    getSelfAwarePrompt() {
        const state = this.getState();
        if (state.needsCheckIn) {
            this.state.needsCheckIn = false;
            this.state.lastCheckInTurn = this.state.reactions.length;
            recordSelfAwarePrompt(this.sessionId, this.personaId);
            return '[SELF-AWARENESS: Recent responses may not have landed. Consider a gentle check-in: "Am I being helpful?" or "Is this what you need right now?"]';
        }
        const { lastAssessment } = state;
        if (!lastAssessment)
            return null;
        if (lastAssessment.suggestion && lastAssessment.suggestion.urgency === 'high') {
            recordSelfAwarePrompt(this.sessionId, this.personaId);
            return `[SELF-AWARENESS: ${lastAssessment.suggestion.prompt}]`;
        }
        return null;
    }
    /**
     * Reset tracker
     */
    reset() {
        this.state = {
            attempts: [],
            reactions: [],
            assessments: [],
            recentMisses: 0,
            recentLandings: 0,
            needsCheckIn: false,
            lastCheckInTurn: 0,
        };
    }
}
// ============================================================================
// SINGLETON MANAGEMENT
// ============================================================================
const trackers = new Map();
export function getSelfAwarenessTracker(sessionId, personaId) {
    if (!trackers.has(sessionId)) {
        trackers.set(sessionId, new SelfAwarenessTracker(sessionId, personaId));
    }
    return trackers.get(sessionId);
}
export function resetSelfAwarenessTracker(sessionId) {
    trackers.delete(sessionId);
}
export function resetAllSelfAwarenessTrackers() {
    trackers.clear();
}
// ============================================================================
// EXPORTS
// ============================================================================
export { POSITIVE_SIGNALS, NEGATIVE_SIGNALS, OPENING_UP_SIGNALS, CLOSING_DOWN_SIGNALS };
//# sourceMappingURL=self-awareness-loop.js.map