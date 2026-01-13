/**
 * Emotional Journey Orchestrator
 *
 * > "We want people to smile, to laugh, to be vulnerable, and maybe to cry."
 *
 * This orchestrator coordinates all the emotional systems to create a
 * seamless journey that brings people through the full range of human emotion.
 *
 * The Journey Phases:
 * 1. ARRIVAL - Warm welcome, recognition, anticipation
 * 2. EXPLORATION - Curiosity, stories, delightful surprises
 * 3. DEEPENING - Vulnerability unlocks, trust building
 * 4. BREAKTHROUGH - Coaching intervention, paradoxical when needed
 * 5. CELEBRATION - Growth reflection, wins, joy
 * 6. DEPARTURE - Meaningful goodbye, thinking-of-you seeds
 *
 * Key Coordination Rules:
 * - Never fire delightful surprises during vulnerability moments
 * - Stories unlock AFTER trust is established
 * - Paradoxical intervention overrides direct advice when resistance detected
 * - Celebrate effort, not just outcomes
 * - High emotion mode reduces noise - focus on what matters
 *
 * @module EmotionalJourneyOrchestrator
 */
import { seededChance } from './utils/rng.js';
import { createLogger } from '../utils/safe-logger.js';
const log = createLogger({ module: 'EmotionalJourney' });
// ============================================================================
// JOURNEY PHASE DETECTION
// ============================================================================
function detectJourneyPhase(ctx) {
    // Arrival: First 2 turns or returning user first turn
    if (ctx.turnCount <= 2 || (ctx.isFirstTurn && ctx.sessionCount > 1)) {
        return 'arrival';
    }
    // Departure: Explicit goodbye signals (handled by context)
    if (ctx.isLastTurn) {
        return 'departure';
    }
    // Deepening: Vulnerability shared or high emotion
    if (ctx.vulnerabilityShared || ctx.emotionIntensity > 0.7 || ctx.distressLevel > 0.5) {
        return 'deepening';
    }
    // Breakthrough: After resistance or during insight
    if (ctx.resistanceDetected || isBreakthroughMoment(ctx)) {
        return 'breakthrough';
    }
    // Celebration: Positive emotion after progress
    if (isCelebrationMoment(ctx)) {
        return 'celebration';
    }
    // Default: Exploration
    return 'exploration';
}
function isBreakthroughMoment(ctx) {
    const breakthroughTopics = ['realized', 'understand', 'clicked', 'see now', 'makes sense'];
    return ctx.topicsTouched.some((t) => breakthroughTopics.some((bt) => t.toLowerCase().includes(bt)));
}
function isCelebrationMoment(ctx) {
    const positiveEmotions = ['happy', 'excited', 'proud', 'grateful', 'hopeful', 'relieved'];
    return (positiveEmotions.includes(ctx.userEmotion.toLowerCase()) &&
        ctx.emotionIntensity > 0.5 &&
        ctx.distressLevel < 0.3);
}
// ============================================================================
// EMOTIONAL MOMENT SELECTION
// ============================================================================
function selectEmotionalMoment(phase, ctx) {
    switch (phase) {
        case 'arrival':
            return ctx.sessionCount > 1 ? 'warm_welcome' : null;
        case 'exploration':
            // Only delight if low distress and some rapport built
            if (ctx.distressLevel < 0.3 && ctx.turnCount > 3 && seededChance(`${Date.now()}:176`, 0.15)) {
                return 'delightful_surprise';
            }
            return null;
        case 'deepening':
            if (ctx.vulnerabilityShared) {
                return 'protective_embrace';
            }
            if (ctx.relationshipStage !== 'stranger' && ctx.emotionIntensity > 0.5) {
                return 'vulnerability_invitation';
            }
            return null;
        case 'breakthrough':
            return 'breakthrough_insight';
        case 'celebration':
            return 'celebration_of_effort';
        case 'departure':
            return 'meaningful_farewell';
        default:
            return null;
    }
}
// ============================================================================
// SYSTEM COORDINATION
// ============================================================================
function coordinateSystems(phase, ctx) {
    const activate = [];
    const suppress = [];
    // Always active: Core emotional intelligence
    activate.push('emotional', 'trust-context', 'human-memory');
    switch (phase) {
        case 'arrival':
            activate.push('anticipatory-presence', 'human-personality', 'warm-welcome');
            suppress.push('deep-coaching', 'paradoxical-intervention');
            break;
        case 'exploration':
            activate.push('lovable-presence', 'curiosity-engine', 'storytelling', 'delightful-surprises');
            // Only activate stories after trust established
            if (ctx.relationshipStage !== 'stranger') {
                activate.push('story-unlocks');
            }
            break;
        case 'deepening':
            activate.push('protective-instincts', 'visible-vulnerability', 'emotional-aftercare', 'boundary-memory');
            // SUPPRESS fun/light systems during vulnerability
            suppress.push('delightful-surprises', 'mid-response-tangents', 'oddly-specific-opinions');
            break;
        case 'breakthrough':
            activate.push('methodology', 'world-class-coaching', 'growth-reflection');
            // Use paradoxical if resistance detected
            if (ctx.resistanceDetected) {
                activate.push('paradoxical-intervention');
                suppress.push('direct-advice');
            }
            break;
        case 'celebration':
            activate.push('celebration-growth', 'small-wins', 'spontaneous-delight', 'inside-jokes');
            break;
        case 'departure':
            activate.push('thinking-of-you', 'meaningful-farewell', 'conversation-recap');
            suppress.push('new-topics', 'curiosity-prompts');
            break;
    }
    return { activate, suppress };
}
// ============================================================================
// COACHING MODE SELECTION
// ============================================================================
function selectCoachingMode(phase, ctx) {
    // Paradoxical when resistance detected and trust exists
    if (ctx.resistanceDetected && ctx.relationshipStage !== 'stranger') {
        return 'paradoxical';
    }
    // Supportive during high distress
    if (ctx.distressLevel > 0.6) {
        return 'supportive';
    }
    // Celebratory during positive moments
    if (phase === 'celebration' || isCelebrationMoment(ctx)) {
        return 'celebratory';
    }
    // Exploratory early in relationship
    if (ctx.relationshipStage === 'stranger' || ctx.turnCount < 5) {
        return 'exploratory';
    }
    // Direct when trust established and insight moment
    if (phase === 'breakthrough' && !ctx.resistanceDetected) {
        return 'direct';
    }
    // Default to exploratory
    return 'exploratory';
}
// ============================================================================
// GUIDANCE GENERATION
// ============================================================================
function generateGuidance(phase, moment, coachingMode, ctx) {
    const parts = [];
    // Phase-specific guidance
    switch (phase) {
        case 'arrival':
            parts.push(ctx.sessionCount > 1
                ? `[RETURNING USER] They're back. Show you remember. Show you're glad.`
                : `[NEW USER] First impression. Be warm but not overwhelming.`);
            break;
        case 'exploration':
            parts.push(`[EXPLORATION] Be curious. Ask questions. Share when relevant.`);
            if (ctx.relationshipStage !== 'stranger') {
                parts.push(`Stories are unlocked. Share one if it fits naturally.`);
            }
            break;
        case 'deepening':
            parts.push(`[DEEPENING] They're going somewhere vulnerable. Follow carefully.`);
            parts.push(`DO NOT: redirect, fix, or change the subject.`);
            parts.push(`DO: witness, validate, stay present.`);
            break;
        case 'breakthrough':
            if (ctx.resistanceDetected) {
                parts.push(`[RESISTANCE DETECTED] Direct advice won't land. Try a different angle.`);
                parts.push(`Ask: "What would happen if you didn't fix this?"`);
            }
            else {
                parts.push(`[BREAKTHROUGH MOMENT] Something is clicking. Support the insight.`);
            }
            break;
        case 'celebration':
            parts.push(`[CELEBRATION] This matters. Don't move on too fast.`);
            parts.push(`Celebrate the effort, not just the outcome.`);
            break;
        case 'departure':
            parts.push(`[FAREWELL] Make it meaningful. Plant a seed for next time.`);
            break;
    }
    // Moment-specific guidance
    if (moment) {
        switch (moment) {
            case 'warm_welcome':
                parts.push(`✨ Create a smile moment - show you remember something specific.`);
                break;
            case 'delightful_surprise':
                parts.push(`✨ Optional: A random tangent or oddly specific opinion could land well here.`);
                break;
            case 'vulnerability_invitation':
                parts.push(`✨ They might be ready to go deeper. Create space if it feels right.`);
                break;
            case 'protective_embrace':
                parts.push(`✨ They just shared something hard. Be protective. "Hey, would you say that to someone you love?"`);
                break;
            case 'breakthrough_insight':
                parts.push(`✨ Help them see what just happened. Reflect it back.`);
                break;
            case 'celebration_of_effort':
                parts.push(`✨ "You did something hard. That matters." Celebrate the attempt.`);
                break;
            case 'meaningful_farewell':
                parts.push(`✨ "I'll be thinking about what you said about [topic]." Plant the seed.`);
                break;
        }
    }
    // Coaching mode guidance
    switch (coachingMode) {
        case 'paradoxical':
            parts.push(`🔄 PARADOXICAL MODE: Stop trying to help directly. Ask what would happen if nothing changed.`);
            break;
        case 'supportive':
            parts.push(`💚 SUPPORTIVE MODE: Just be here. Solutions can wait.`);
            break;
        case 'celebratory':
            parts.push(`🎉 CELEBRATORY MODE: This is a win. Don't let it slide past.`);
            break;
        case 'direct':
            parts.push(`➡️ DIRECT MODE: They're ready for real talk. Be honest.`);
            break;
        case 'exploratory':
            parts.push(`🔍 EXPLORATORY MODE: Stay curious. Ask more than you tell.`);
            break;
    }
    return parts.join('\n');
}
// ============================================================================
// MAIN ORCHESTRATOR
// ============================================================================
/**
 * Orchestrate the emotional journey for this turn
 *
 * This is the master coordination function that ensures all systems
 * work together to create smiles, laughter, vulnerability, and tears.
 */
export function orchestrateEmotionalJourney(ctx) {
    // 1. Detect current journey phase
    const phase = detectJourneyPhase(ctx);
    // 2. Select emotional moment type (if any)
    const momentType = selectEmotionalMoment(phase, ctx);
    // 3. Coordinate which systems should be active/suppressed
    const { activate, suppress } = coordinateSystems(phase, ctx);
    // 4. Select coaching mode
    const coachingMode = selectCoachingMode(phase, ctx);
    // 5. Determine if high-emotion mode should reduce noise
    const highEmotionMode = ctx.distressLevel > 0.6 || phase === 'deepening';
    // 6. Generate guidance for the LLM
    const guidance = generateGuidance(phase, momentType, coachingMode, ctx);
    // 7. Build reasoning (for debugging/analytics)
    const reasoning = buildReasoning(phase, momentType, coachingMode, ctx);
    log.info({
        phase,
        momentType,
        coachingMode,
        highEmotionMode,
        activeSystems: activate.length,
        suppressedSystems: suppress.length,
    }, '🎭 Emotional journey decision');
    return {
        phase,
        momentType,
        highEmotionMode,
        activateSystems: activate,
        suppressSystems: suppress,
        coachingMode,
        guidance,
        reasoning,
    };
}
function buildReasoning(phase, moment, coachingMode, ctx) {
    const parts = [];
    parts.push(`Phase: ${phase} (turn ${ctx.turnCount}, session ${ctx.sessionCount})`);
    parts.push(`Relationship: ${ctx.relationshipStage}`);
    parts.push(`Emotion: ${ctx.userEmotion} (intensity: ${ctx.emotionIntensity.toFixed(2)})`);
    if (ctx.distressLevel > 0.3)
        parts.push(`Distress: ${ctx.distressLevel.toFixed(2)}`);
    if (ctx.resistanceDetected)
        parts.push(`Resistance detected`);
    if (ctx.vulnerabilityShared)
        parts.push(`Vulnerability shared`);
    if (moment)
        parts.push(`Emotional moment: ${moment}`);
    parts.push(`Coaching: ${coachingMode}`);
    return parts.join(' | ');
}
// ============================================================================
// INTEGRATION HELPERS
// ============================================================================
/**
 * Build emotional context from available session data
 * Use this to create the EmotionalContext from existing services
 */
export function buildEmotionalContext(params) {
    return {
        userId: params.userId,
        sessionId: params.sessionId,
        turnCount: params.turnCount,
        sessionCount: params.sessionCount,
        relationshipStage: params.relationshipStage || 'stranger',
        userEmotion: params.emotion?.primary || 'neutral',
        emotionIntensity: params.emotion?.intensity ?? 0.5,
        distressLevel: params.emotion?.distressLevel ?? 0,
        voiceEmotion: params.voiceEmotion
            ? {
                arousal: params.voiceEmotion.arousal ?? 0.5,
                valence: params.voiceEmotion.valence ?? 0,
                speechRate: params.voiceEmotion.speechRate,
            }
            : undefined,
        isFirstTurn: params.turnCount === 1,
        isLastTurn: params.isLastTurn,
        resistanceDetected: params.resistanceDetected ?? false,
        vulnerabilityShared: params.vulnerabilityShared ?? false,
        wasAdviceGiven: params.wasAdviceGiven ?? false,
        topicsTouched: params.topicsTouched ?? [],
    };
}
// ============================================================================
// EXPORTS
// ============================================================================
export default {
    orchestrateEmotionalJourney,
    buildEmotionalContext,
};
//# sourceMappingURL=emotional-journey-orchestrator.js.map