/**
 * Paradoxical Intervention Engine
 *
 * > "What would happen if you just... didn't try to fix it?"
 *
 * Knows when direct advice would backfire:
 *
 * - **Advice Resistance Detection**: Recognizing "yes, but" patterns
 * - **Paradoxical Questions**: Reverse psychology without manipulation
 * - **Indirect Approaches**: Asking instead of telling
 * - **Exploration Mode**: Help them discover rather than prescribe
 * - **Meta-Observation**: Point out the pattern without judging
 *
 * Sometimes the best way to help is to stop trying to help directly.
 *
 * @module @ferni/paradoxical-intervention
 */
import { seededPick } from './utils/rng.js';
import { createLogger } from '../utils/safe-logger.js';
const logger = createLogger({ module: 'ParadoxicalIntervention' });
// ============================================================================
// DETECTION PATTERNS
// ============================================================================
/** "Yes, but" patterns */
const YES_BUT_PATTERNS = [
    /yes,? but/i,
    /yeah,? but/i,
    /i know,? but/i,
    /true,? but/i,
    /i (get|understand|hear you),? but/i,
    /that makes sense,? but/i,
    /you'?re right,? but/i,
    /i agree,? but/i,
];
/** "Already tried that" patterns */
const ALREADY_TRIED_PATTERNS = [
    /i('?ve| have) (already |)tried (that|it)/i,
    /that (didn'?t|doesn'?t|won'?t) work/i,
    /i('?ve| have) done that/i,
    /been there,? done that/i,
    /(didn'?t|doesn'?t) help/i,
    /i('?ve| have) attempted/i,
];
/** "Won't work for me" patterns */
const WONT_WORK_PATTERNS = [
    /that (won'?t|wouldn'?t) work/i,
    /i can'?t do that/i,
    /that'?s not (possible|realistic|practical)/i,
    /easier said than done/i,
    /you don'?t understand/i,
    /it'?s not that (simple|easy)/i,
    /if only it were that (simple|easy)/i,
];
/** "My situation is different" patterns */
const DIFFERENT_PATTERNS = [
    /my (situation|case|life) is different/i,
    /that works for (other people|others|some|most)/i,
    /not in my (case|situation|circumstances)/i,
    /you don'?t know my/i,
    /it'?s (complicated|more complex|different)/i,
    /that'?s not how it works for me/i,
];
/** Passive agreement (agrees but won't act) */
const PASSIVE_PATTERNS = [
    /maybe/i,
    /i (guess|suppose)/i,
    /^(yeah|yes|ok|okay|sure)\.?$/i,
    /i'?ll (think about|consider) it/i,
    /^mm?hm\.?$/i,
    /possibly/i,
];
/** Overwhelmed patterns */
const OVERWHELMED_PATTERNS = [
    /i (can'?t|don'?t) (even|know)/i,
    /it'?s too much/i,
    /i'?m (so |just )?(tired|exhausted|overwhelmed)/i,
    /i (just )?can'?t (think|deal|handle)/i,
    /everything (is|feels)/i,
];
// ============================================================================
// INTERVENTION PHRASES
// ============================================================================
const PARADOXICAL_QUESTIONS = [
    "What would happen if you just... didn't try to fix this right now?",
    "What if the answer isn't changing anything?",
    "What if you're not supposed to have this figured out yet?",
    "What would you tell yourself if you weren't trying to solve this?",
    "What if this isn't a problem to be solved?",
    'What would happen if you let yourself just be in this for a while?',
    "What if trying to fix it is part of what's making it hard?",
];
const META_OBSERVATIONS = [
    "I notice you've found reasons why several ideas wouldn't work. I'm curious about that.",
    "I'm noticing a pattern—a lot of 'but' responses. What do you think that's about?",
    "I keep offering things and you keep explaining why they won't work. What's underneath that?",
    'There seems to be something making it hard to consider new approaches. What is it?',
    "I'm wondering if part of you doesn't actually want this to change right now. And that's okay.",
];
const EXPLORE_RESISTANCE = [
    'What makes this hard to consider?',
    'What would it mean if this suggestion actually worked?',
    'Is there a reason it feels important to find problems with these ideas?',
    'What are you protecting yourself from?',
    'What would you lose if you tried this?',
    'What would have to be true for this to feel possible?',
];
const VALIDATE_INSTEAD = [
    "You know what, let me just listen. You don't need solutions right now.",
    "I hear you. This is hard. I don't need to fix it.",
    "You're dealing with a lot. I'm just going to be here.",
    "Sometimes things are just hard and that's the whole truth of it.",
    "I'm going to stop trying to help and just be with you in this.",
];
const ASK_PERMISSION = [
    'Can I ask—do you want suggestions, or do you just need me to listen?',
    'What would actually help right now—ideas or just support?',
    'I could offer some thoughts, but I can also just be here. What do you need?',
    'Tell me how I can be useful. Solutions or presence?',
];
const REVERSE_ANGLE = [
    'What would someone who wanted to stay stuck do?',
    'If you were giving advice to make this worse, what would it be?',
    "What's the argument for NOT changing anything?",
    "Play devil's advocate—why should you keep doing what you're doing?",
];
const NORMALIZE_INACTION = [
    "Maybe now isn't the time to fix this. Maybe it's just the time to feel it.",
    'Not everything needs to be solved. Some things just need to be survived.',
    'What if the healthiest thing right now is to do nothing?',
    "Sometimes we're not ready to change, and that's okay. It doesn't mean we won't be.",
];
const GENTLE_CURIOSITY = [
    "I'm curious... what do you actually want from this conversation?",
    'What would feel like progress to you?',
    'If you woke up tomorrow and something was different, what would it be?',
    "What's the smallest thing that might help?",
    "What's the version of you that you're hoping I'll see?",
];
// ============================================================================
// PARADOXICAL INTERVENTION ENGINE
// ============================================================================
export class ParadoxicalInterventionEngine {
    resistanceHistory = [];
    adviceHistory = [];
    turnCount = 0;
    consecutiveResistances = 0;
    lastInterventionTurn = -20;
    constructor() {
        logger.debug('ParadoxicalInterventionEngine initialized');
    }
    /**
     * Detect resistance to advice/suggestions in user message
     *
     * @param userMessage - User's message
     * @param turnCount - Current turn
     * @param wasAdviceJustGiven - Did agent just give advice?
     * @returns Resistance detection result
     */
    detectResistance(userMessage, turnCount, wasAdviceJustGiven = false) {
        this.turnCount = turnCount;
        // Check patterns
        const detections = [];
        // Yes, but
        for (const pattern of YES_BUT_PATTERNS) {
            if (pattern.test(userMessage)) {
                detections.push({ type: 'yes_but', confidence: 0.85, evidence: pattern.source });
            }
        }
        // Already tried
        for (const pattern of ALREADY_TRIED_PATTERNS) {
            if (pattern.test(userMessage)) {
                detections.push({ type: 'already_tried', confidence: 0.8, evidence: pattern.source });
            }
        }
        // Won't work
        for (const pattern of WONT_WORK_PATTERNS) {
            if (pattern.test(userMessage)) {
                detections.push({ type: 'wont_work', confidence: 0.8, evidence: pattern.source });
            }
        }
        // Different
        for (const pattern of DIFFERENT_PATTERNS) {
            if (pattern.test(userMessage)) {
                detections.push({ type: 'different', confidence: 0.75, evidence: pattern.source });
            }
        }
        // Passive (only counts if advice was just given)
        if (wasAdviceJustGiven) {
            for (const pattern of PASSIVE_PATTERNS) {
                if (pattern.test(userMessage)) {
                    detections.push({ type: 'passive', confidence: 0.6, evidence: pattern.source });
                }
            }
        }
        // Overwhelmed
        for (const pattern of OVERWHELMED_PATTERNS) {
            if (pattern.test(userMessage)) {
                detections.push({ type: 'overwhelmed', confidence: 0.7, evidence: pattern.source });
            }
        }
        // No resistance detected
        if (detections.length === 0) {
            this.consecutiveResistances = 0;
            return {
                detected: false,
                type: null,
                confidence: 0,
                count: this.resistanceHistory.length,
                evidence: [],
            };
        }
        // Get highest confidence detection
        const best = detections.reduce((a, b) => (b.confidence > a.confidence ? b : a));
        // Record
        this.resistanceHistory.push({
            type: best.type,
            turn: turnCount,
            confidence: best.confidence,
        });
        this.consecutiveResistances++;
        logger.debug({
            type: best.type,
            confidence: best.confidence.toFixed(2),
            consecutive: this.consecutiveResistances,
        }, '🛡️ Resistance detected');
        return {
            detected: true,
            type: best.type,
            confidence: best.confidence,
            count: this.resistanceHistory.length,
            evidence: detections.map((d) => d.evidence),
        };
    }
    /**
     * Record advice given and response
     */
    recordAdviceResponse(turn, adviceGiven, response) {
        this.adviceHistory.push({ turn, adviceGiven, response });
        // Keep recent history
        if (this.adviceHistory.length > 20) {
            this.adviceHistory.shift();
        }
    }
    /**
     * Decide whether and how to intervene paradoxically
     *
     * @param resistance - Current resistance detection
     * @returns Intervention decision
     */
    decide(resistance) {
        const decision = {
            shouldIntervene: false,
            interventionType: null,
            phrase: null,
            stopDirectAdvice: false,
            reasoning: '',
        };
        // No resistance = no need for paradoxical intervention
        if (!resistance.detected) {
            return { ...decision, reasoning: 'No resistance detected' };
        }
        // Too soon since last intervention
        if (this.turnCount - this.lastInterventionTurn < 5) {
            return { ...decision, reasoning: 'Recent intervention, waiting', stopDirectAdvice: true };
        }
        // Calculate rejection rate
        const recentAdvice = this.adviceHistory.slice(-5);
        const rejectedCount = recentAdvice.filter((a) => a.response === 'rejected' || a.response === 'deflected').length;
        const rejectionRate = recentAdvice.length > 0 ? rejectedCount / recentAdvice.length : 0;
        // Determine intervention type based on situation
        let type;
        let phrases;
        // Multiple consecutive resistances = meta observation
        if (this.consecutiveResistances >= 3) {
            type = 'meta_observation';
            phrases = META_OBSERVATIONS;
            decision.stopDirectAdvice = true;
        }
        // Overwhelmed = validate
        else if (resistance.type === 'overwhelmed') {
            type = 'validate_first';
            phrases = VALIDATE_INSTEAD;
            decision.stopDirectAdvice = true;
        }
        // High rejection rate = ask permission
        else if (rejectionRate >= 0.6) {
            type = 'ask_permission';
            phrases = ASK_PERMISSION;
            decision.stopDirectAdvice = true;
        }
        // "Won't work" or "different" = explore resistance
        else if (resistance.type === 'wont_work' || resistance.type === 'different') {
            type = 'explore_resistance';
            phrases = EXPLORE_RESISTANCE;
        }
        // "Already tried" = paradoxical question
        else if (resistance.type === 'already_tried') {
            type = 'paradoxical_question';
            phrases = PARADOXICAL_QUESTIONS;
        }
        // "Yes but" = reverse angle or gentle curiosity
        else if (resistance.type === 'yes_but') {
            if (this.consecutiveResistances >= 2) {
                type = 'reverse_angle';
                phrases = REVERSE_ANGLE;
            }
            else {
                type = 'gentle_curiosity';
                phrases = GENTLE_CURIOSITY;
            }
        }
        // Passive = normalize inaction
        else if (resistance.type === 'passive') {
            type = 'normalize_inaction';
            phrases = NORMALIZE_INACTION;
        }
        // Default
        else {
            type = 'gentle_curiosity';
            phrases = GENTLE_CURIOSITY;
        }
        // Determine if we should intervene (not always!)
        const shouldIntervene = (resistance.confidence >= 0.75 && this.consecutiveResistances >= 2) ||
            this.consecutiveResistances >= 3 ||
            (rejectionRate >= 0.6 && recentAdvice.length >= 3);
        if (shouldIntervene) {
            this.lastInterventionTurn = this.turnCount;
        }
        decision.shouldIntervene = shouldIntervene;
        decision.interventionType = type;
        decision.phrase = seededPick(`${Date.now()}:458`, phrases) ?? phrases[0];
        decision.reasoning = `Resistance type: ${resistance.type}, consecutive: ${this.consecutiveResistances}, rejection rate: ${(rejectionRate * 100).toFixed(0)}%`;
        logger.debug({
            shouldIntervene,
            type,
            stopDirectAdvice: decision.stopDirectAdvice,
        }, '🔄 Paradoxical intervention decision');
        return decision;
    }
    /**
     * Get intervention phrase of specific type
     */
    getIntervention(type) {
        const phraseMap = {
            paradoxical_question: PARADOXICAL_QUESTIONS,
            meta_observation: META_OBSERVATIONS,
            explore_resistance: EXPLORE_RESISTANCE,
            validate_first: VALIDATE_INSTEAD,
            ask_permission: ASK_PERMISSION,
            reverse_angle: REVERSE_ANGLE,
            normalize_inaction: NORMALIZE_INACTION,
            gentle_curiosity: GENTLE_CURIOSITY,
        };
        const phrases = phraseMap[type];
        return seededPick(`${Date.now()}:489`, phrases) ?? phrases[0];
    }
    /**
     * Get statistics
     */
    getStats() {
        const typeBreakdown = {};
        for (const r of this.resistanceHistory) {
            typeBreakdown[r.type] = (typeBreakdown[r.type] || 0) + 1;
        }
        const rejectedCount = this.adviceHistory.filter((a) => a.response === 'rejected' || a.response === 'deflected').length;
        return {
            totalResistances: this.resistanceHistory.length,
            adviceRejectionRate: this.adviceHistory.length > 0 ? rejectedCount / this.adviceHistory.length : 0,
            typeBreakdown,
        };
    }
    /**
     * Reset for new session
     */
    reset() {
        this.resistanceHistory = [];
        this.adviceHistory = [];
        this.turnCount = 0;
        this.consecutiveResistances = 0;
        this.lastInterventionTurn = -20;
        logger.debug('ParadoxicalInterventionEngine reset');
    }
}
// ============================================================================
// SINGLETON
// ============================================================================
import { createSessionRegistry, registerGlobalRegistry } from '../utils/session-registry.js';
const paradoxicalInterventionRegistry = createSessionRegistry((sessionId) => new ParadoxicalInterventionEngine(), { name: 'ParadoxicalIntervention', cleanup: (engine) => engine.reset(), verbose: false });
registerGlobalRegistry(paradoxicalInterventionRegistry);
export function getParadoxicalInterventionEngine(sessionId) {
    return paradoxicalInterventionRegistry.get(sessionId);
}
export function resetParadoxicalInterventionEngine(sessionId) {
    const engine = paradoxicalInterventionRegistry.get(sessionId);
    engine.reset();
}
export function clearParadoxicalInterventionEngine(sessionId) {
    paradoxicalInterventionRegistry.reset(sessionId);
}
export function getActiveParadoxicalInterventionCount() {
    return paradoxicalInterventionRegistry.getActiveCount();
}
export default ParadoxicalInterventionEngine;
//# sourceMappingURL=paradoxical-intervention.js.map