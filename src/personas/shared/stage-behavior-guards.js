/**
 * Stage Behavior Guards
 *
 * > "Relationships have rhythms. Respect them."
 *
 * This module prevents stage-inappropriate behaviors that would feel
 * "too much too soon" or "less than human" by:
 *
 * 1. Blocking behaviors not yet unlocked at current stage
 * 2. Adjusting communication style based on relationship depth
 * 3. Gating personal stories until appropriate trust level
 * 4. Preventing premature direct advice
 * 5. Scaling humor frequency appropriately
 *
 * A stranger doesn't share their deepest fears.
 * A new friend doesn't give unsolicited advice.
 * An acquaintance doesn't joke like an old buddy.
 *
 * These guards make our agents feel HUMAN by respecting social norms.
 */
import { createLogger } from '../../utils/safe-logger.js';
const log = createLogger({ module: 'StageBehaviorGuards' });
// ============================================================================
// DEFAULT STAGE RULES
// ============================================================================
/**
 * Default behaviors allowed at each stage (if no bundle config provided)
 */
const DEFAULT_STAGE_BEHAVIORS = {
    stranger: ['introduce_self', 'listen_deeply', 'gentle_curiosity', 'basic_encouragement'],
    acquaintance: [
        'introduce_self',
        'listen_deeply',
        'gentle_curiosity',
        'basic_encouragement',
        'light_humor',
        'basic_stories',
        'team_mention',
    ],
    friend: [
        'introduce_self',
        'listen_deeply',
        'gentle_curiosity',
        'basic_encouragement',
        'light_humor',
        'basic_stories',
        'team_mention',
        'personal_story',
        'deeper_questions',
        'gentle_challenge',
        'inside_joke_reference',
    ],
    trusted_advisor: [
        'introduce_self',
        'listen_deeply',
        'gentle_curiosity',
        'basic_encouragement',
        'light_humor',
        'basic_stories',
        'team_mention',
        'personal_story',
        'deeper_questions',
        'gentle_challenge',
        'inside_joke_reference',
        'direct_advice',
        'playful_tease',
        'call_out_pattern',
    ],
    inner_circle: [
        // All behaviors allowed
        '*',
    ],
};
/**
 * Maps GuardableBehavior to bundle behavior names
 */
const BEHAVIOR_MAPPING = {
    personal_story: ['personal_story', 'personal_anecdotes', 'deeper_stories'],
    direct_advice: ['direct_advice', 'give_advice', 'unsolicited_advice'],
    humor: ['light_humor', 'playful', 'jokes', 'humor'],
    vulnerability_sharing: ['vulnerability_sharing', 'personal_vulnerability', 'share_feelings'],
    gentle_challenge: ['gentle_challenge', 'challenge', 'push_back'],
    inside_joke_reference: ['inside_joke_reference', 'callback', 'reference_shared_moment'],
    team_reference: ['team_mention', 'team_reference', 'mention_colleague'],
    deep_question: ['deeper_questions', 'deep_question', 'probing_question'],
    playful_tease: ['playful_tease', 'tease', 'playful_ribbing'],
    strong_opinion: ['strong_opinion', 'express_opinion', 'take_position'],
    call_out_pattern: ['call_out_pattern', 'pattern_observation', 'notice_pattern'],
};
// ============================================================================
// STAGE THRESHOLDS
// ============================================================================
/**
 * Minimum thresholds for certain behaviors (safety nets)
 */
const MINIMUM_THRESHOLDS = {
    personal_story: { minSessions: 2, minTurns: 10 },
    direct_advice: { minSessions: 3, minTurns: 20, stage: 'friend' },
    humor: { minSessions: 1, minTurns: 3 },
    vulnerability_sharing: { minSessions: 3, minTurns: 20, stage: 'friend' },
    gentle_challenge: { minSessions: 2, minTurns: 15 },
    inside_joke_reference: { minSessions: 2, minTurns: 10 },
    team_reference: { minSessions: 1, minTurns: 5 },
    deep_question: { minSessions: 2, minTurns: 10, stage: 'acquaintance' },
    playful_tease: { minSessions: 3, minTurns: 20, stage: 'friend' },
    strong_opinion: { minSessions: 2, minTurns: 15, stage: 'acquaintance' },
    call_out_pattern: { minSessions: 3, minTurns: 25, stage: 'trusted_advisor' },
};
/**
 * Order of stages for comparison
 */
const STAGE_ORDER = [
    'stranger',
    'acquaintance',
    'friend',
    'trusted_advisor',
    'inner_circle',
];
function isAtOrBeyondStage(current, required) {
    return STAGE_ORDER.indexOf(current) >= STAGE_ORDER.indexOf(required);
}
// ============================================================================
// MAIN GUARD FUNCTION
// ============================================================================
/**
 * Check if a behavior is appropriate for the current relationship stage
 */
export function checkBehavior(behavior, context) {
    const { stage, sessionCount, totalTurns, userHasSharedVulnerability, userInDistress, stageConfig, } = context;
    // Special case: Allow almost anything in distress situations
    // Being "too warm" in a crisis is better than being cold
    if (userInDistress &&
        ['personal_story', 'vulnerability_sharing', 'gentle_challenge'].includes(behavior)) {
        return {
            allowed: true,
            intensityMultiplier: 0.8, // Tone it down slightly
        };
    }
    // Check minimum thresholds
    const thresholds = MINIMUM_THRESHOLDS[behavior];
    if (thresholds) {
        if (thresholds.minSessions && sessionCount < thresholds.minSessions) {
            return {
                allowed: false,
                reason: `Too early for ${behavior} - need ${thresholds.minSessions} sessions (current: ${sessionCount})`,
                suggestion: getSuggestion(behavior, 'session_early'),
                intensityMultiplier: 0,
            };
        }
        if (thresholds.minTurns && totalTurns < thresholds.minTurns) {
            return {
                allowed: false,
                reason: `Too early for ${behavior} - need ${thresholds.minTurns} turns (current: ${totalTurns})`,
                suggestion: getSuggestion(behavior, 'turn_early'),
                intensityMultiplier: 0,
            };
        }
        if (thresholds.stage && !isAtOrBeyondStage(stage, thresholds.stage)) {
            return {
                allowed: false,
                reason: `${behavior} requires ${thresholds.stage} stage (current: ${stage})`,
                suggestion: getSuggestion(behavior, 'stage_early'),
                intensityMultiplier: 0,
            };
        }
    }
    // Check stage-specific allowed behaviors
    const allowedBehaviors = getAllowedBehaviors(stage, stageConfig);
    const behaviorNames = BEHAVIOR_MAPPING[behavior] || [behavior];
    const hasMatchingBehavior = allowedBehaviors.includes('*') || behaviorNames.some((name) => allowedBehaviors.includes(name));
    if (!hasMatchingBehavior) {
        return {
            allowed: false,
            reason: `${behavior} not unlocked at ${stage} stage`,
            suggestion: getSuggestion(behavior, 'not_unlocked'),
            intensityMultiplier: 0,
        };
    }
    // Behavior is allowed - calculate intensity multiplier based on relationship depth
    const intensityMultiplier = calculateIntensity(behavior, context);
    // Special adjustment: If user hasn't shared vulnerability, reduce our vulnerability
    if (behavior === 'vulnerability_sharing' && !userHasSharedVulnerability) {
        return {
            allowed: true,
            intensityMultiplier: Math.min(intensityMultiplier, 0.5),
        };
    }
    log.debug({ behavior, stage, allowed: true, intensity: intensityMultiplier }, 'Behavior check passed');
    return {
        allowed: true,
        intensityMultiplier,
    };
}
/**
 * Get allowed behaviors for a stage
 */
function getAllowedBehaviors(stage, stageConfig) {
    // Use bundle config if available
    if (stageConfig?.stages?.[stage]?.behaviors) {
        return stageConfig.stages[stage].behaviors;
    }
    // Fall back to defaults
    return DEFAULT_STAGE_BEHAVIORS[stage] || [];
}
/**
 * Calculate intensity multiplier based on relationship depth
 */
function calculateIntensity(behavior, context) {
    const { stage, sessionCount, totalTurns, userHasSharedVulnerability, stageConfig } = context;
    // Get warmth multiplier from stage config
    const warmthMultiplier = stageConfig?.stages?.[stage]?.warmth_multiplier ?? 1.0;
    // Base intensity from stage
    const stageIntensity = {
        stranger: 0.5,
        acquaintance: 0.7,
        friend: 0.85,
        trusted_advisor: 0.95,
        inner_circle: 1.0,
    };
    let intensity = stageIntensity[stage] ?? 0.7;
    // Adjust based on session/turn count within stage
    // More sessions = more comfortable
    const sessionBonus = Math.min(sessionCount * 0.02, 0.1);
    const turnBonus = Math.min(totalTurns * 0.005, 0.1);
    intensity += sessionBonus + turnBonus;
    // Apply warmth multiplier from bundle
    intensity *= warmthMultiplier;
    // Behaviors that depend on reciprocity
    if (['vulnerability_sharing', 'deep_question', 'playful_tease'].includes(behavior)) {
        if (!userHasSharedVulnerability && stage !== 'inner_circle') {
            intensity *= 0.7; // Reduce if user hasn't opened up yet
        }
    }
    // Cap at 1.0
    return Math.min(intensity, 1.0);
}
/**
 * Get a suggestion for what to do instead
 */
function getSuggestion(behavior, reason) {
    const suggestions = {
        personal_story: {
            session_early: 'Share a brief observation instead of a personal story',
            turn_early: 'Focus on their story first - your turn will come',
            stage_early: 'Start with lighter anecdotes before deep personal shares',
            not_unlocked: 'Keep listening - build trust through presence first',
        },
        direct_advice: {
            session_early: 'Ask what they think they should do instead',
            turn_early: 'Reflect back what you heard before offering direction',
            stage_early: 'Use questions to guide rather than direct statements',
            not_unlocked: "Say 'I wonder if...' instead of 'You should...'",
        },
        humor: {
            session_early: 'A warm smile in your voice is enough for now',
            turn_early: 'Light warmth over overt jokes',
            stage_early: 'Save the jokes - be present first',
            not_unlocked: 'Warmth, not wit - not yet',
        },
        vulnerability_sharing: {
            session_early: 'Tiny moments of humanity, not full vulnerability yet',
            turn_early: 'Let them share first',
            stage_early: "Model small authenticity - 'I get that feeling'",
            not_unlocked: 'Be present, not personal',
        },
        gentle_challenge: {
            session_early: 'Ask curious questions instead of challenging',
            turn_early: 'Understand fully before you challenge',
            stage_early: "Use 'I wonder...' framing",
            not_unlocked: 'Hold the challenge - earn the right first',
        },
        inside_joke_reference: {
            session_early: "You don't have shared history yet - be patient",
            turn_early: 'Build the moment before referencing moments',
            stage_early: 'Let the jokes form naturally',
            not_unlocked: 'Create the moment instead of referencing one',
        },
        team_reference: {
            session_early: 'Focus on being fully present yourself first',
            turn_early: 'Build your connection before introducing the team',
            stage_early: "You are enough - don't bring in others yet",
            not_unlocked: 'Introduce the team when it serves them, not us',
        },
        deep_question: {
            session_early: 'Start with lighter exploration',
            turn_early: 'Surface questions first, depth comes later',
            stage_early: 'Earn the right to go deep',
            not_unlocked: 'Curious, not probing',
        },
        playful_tease: {
            session_early: 'Warmth first, playfulness earned',
            turn_early: 'Too soon for teasing',
            stage_early: 'Teasing requires trust',
            not_unlocked: 'They need to know you care before you tease',
        },
        strong_opinion: {
            session_early: 'Share observations, not opinions yet',
            turn_early: 'Understand their view fully first',
            stage_early: 'Hold your opinion gently',
            not_unlocked: "Use 'I wonder' not 'I think'",
        },
        call_out_pattern: {
            session_early: "You don't know enough patterns yet",
            turn_early: 'More data needed before pattern recognition',
            stage_early: 'Notice quietly, share when trusted',
            not_unlocked: 'See the pattern, hold the observation',
        },
    };
    return suggestions[behavior]?.[reason] || 'Consider whether this is the right moment';
}
// ============================================================================
// BATCH CHECKING
// ============================================================================
/**
 * Check multiple behaviors at once
 */
export function checkBehaviors(behaviors, context) {
    const results = new Map();
    for (const behavior of behaviors) {
        results.set(behavior, checkBehavior(behavior, context));
    }
    return results;
}
/**
 * Get all currently allowed behaviors
 */
export function getAllowedBehaviorsForContext(context) {
    const allBehaviors = [
        'personal_story',
        'direct_advice',
        'humor',
        'vulnerability_sharing',
        'gentle_challenge',
        'inside_joke_reference',
        'team_reference',
        'deep_question',
        'playful_tease',
        'strong_opinion',
        'call_out_pattern',
    ];
    return allBehaviors.filter((b) => checkBehavior(b, context).allowed);
}
// ============================================================================
// PROMPT INJECTION
// ============================================================================
/**
 * Generate prompt injection for behavior constraints
 */
export function generateBehaviorConstraints(context) {
    const allowed = getAllowedBehaviorsForContext(context);
    const allBehaviors = [
        'personal_story',
        'direct_advice',
        'humor',
        'vulnerability_sharing',
        'gentle_challenge',
        'inside_joke_reference',
        'team_reference',
        'deep_question',
        'playful_tease',
        'strong_opinion',
        'call_out_pattern',
    ];
    const blocked = allBehaviors.filter((b) => !allowed.includes(b));
    const lines = [];
    lines.push(`[RELATIONSHIP STAGE: ${context.stage.toUpperCase()}]`);
    lines.push(`Sessions together: ${context.sessionCount}`);
    lines.push(`Total turns: ${context.totalTurns}`);
    lines.push('');
    if (blocked.length > 0) {
        lines.push('[STAGE-INAPPROPRIATE BEHAVIORS - DO NOT DO THESE YET]');
        for (const behavior of blocked) {
            const result = checkBehavior(behavior, context);
            const humanName = behavior.replace(/_/g, ' ');
            lines.push(`• No ${humanName}: ${result.suggestion || result.reason}`);
        }
        lines.push('');
    }
    lines.push('[STAGE-APPROPRIATE BEHAVIORS - ENCOURAGED]');
    for (const behavior of allowed) {
        const result = checkBehavior(behavior, context);
        const humanName = behavior.replace(/_/g, ' ');
        if (result.intensityMultiplier < 1) {
            lines.push(`• ${humanName} (gentle - ${Math.round(result.intensityMultiplier * 100)}% intensity)`);
        }
        else {
            lines.push(`• ${humanName} (fully appropriate)`);
        }
    }
    return lines.join('\n');
}
export default {
    checkBehavior,
    checkBehaviors,
    getAllowedBehaviorsForContext,
    generateBehaviorConstraints,
};
//# sourceMappingURL=stage-behavior-guards.js.map