/**
 * Obstacle Detection & Support
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * When progress stalls, understand why and offer support.
 * Never shame, always understand.
 *
 * Philosophy:
 * - Obstacles are information, not failures
 * - Curiosity over judgment
 * - Sometimes the obstacle is the path
 *
 * @module ObstacleDetection
 */
import { createLogger } from '../../utils/safe-logger.js';
const log = createLogger({ module: 'ObstacleDetection' });
// ============================================================================
// IN-MEMORY STORE
// ============================================================================
const obstacleProfiles = new Map();
function getOrCreateProfile(userId) {
    let profile = obstacleProfiles.get(userId);
    if (!profile) {
        profile = {
            userId,
            obstacles: [],
            patterns: [],
        };
        obstacleProfiles.set(userId, profile);
    }
    return profile;
}
// ============================================================================
// OBSTACLE DETECTION PATTERNS
// ============================================================================
const OBSTACLE_PATTERNS = {
    time: [
        /i (don't|didn't) have (enough )?time/i,
        /too busy/i,
        /(no time|time crunch|tight schedule)/i,
        /i('ve| have) been (so )?busy/i,
    ],
    energy: [
        /too tired/i,
        /(exhausted|burned out|burnout|drained)/i,
        /(no|don't have( any)?) energy/i,
        /can't (find|muster) the energy/i,
    ],
    fear: [
        /scared (to|of)/i,
        /afraid (of|to|that)/i,
        /what if (it|i|they)/i,
        /worried (about|that)/i,
        /terrified/i,
    ],
    perfectionism: [
        /not (ready|good enough|perfect)/i,
        /waiting (for|until)/i,
        /need(s)? to be perfect/i,
        /if i can't do it (right|well)/i,
    ],
    overwhelm: [
        /(too (much|big|overwhelming)|overwhelmed)/i,
        /(don't|doesn't) know where to (start|begin)/i,
        /so much to do/i,
        /paralyz/i,
    ],
    unclear: [
        /(don't|didn't|doesn't) know how/i,
        /not sure (how|what|where)/i,
        /(confused|unclear) about/i,
        /what (am i|should i) (even )?(do|start)/i,
    ],
    motivation: [
        /(lost|losing) motivation/i,
        /(don't|didn't) (feel like|want to)/i,
        /what's the point/i,
        /(can't|couldn't) get myself to/i,
        /just (don't|didn't) (care|feel it)/i,
    ],
    external: [
        /(they|someone|something) (won't|didn't|doesn't)/i,
        /out of my (control|hands)/i,
        /waiting (on|for) (someone|them|approval)/i,
        /(blocked|stuck) by/i,
    ],
    self_doubt: [
        /(don't|didn't) (think|believe) i (can|could)/i,
        /not (smart|good|capable) enough/i,
        /who am i to/i,
        /(imposter|fraud)/i,
        /i('ll| will) (probably )?(just )?fail/i,
    ],
    competing_priorities: [
        /other things (came up|got in the way)/i,
        /had to (deal with|handle|prioritize)/i,
        /(more (important|urgent)|priority)/i,
        /life got in the way/i,
    ],
    emotional: [
        /emotionally (drained|exhausted|blocked)/i,
        /(too (sad|anxious|depressed|upset))/i,
        /in a (funk|bad place|rough spot)/i,
        /mentally (not|wasn't) there/i,
    ],
    unknown: [],
};
// ============================================================================
// OBSTACLE DETECTION
// ============================================================================
/**
 * Detect obstacles in user speech
 */
export function detectObstacle(userId, userMessage, context) {
    const lower = userMessage.toLowerCase();
    for (const [type, patterns] of Object.entries(OBSTACLE_PATTERNS)) {
        for (const pattern of patterns) {
            if (pattern.test(lower)) {
                return createObstacle(userId, type, userMessage, context);
            }
        }
    }
    return null;
}
/**
 * Create and store an obstacle
 */
function createObstacle(userId, type, description, context) {
    const profile = getOrCreateProfile(userId);
    // Determine severity based on frequency
    const existingPattern = profile.patterns.find((p) => p.type === type);
    let severity = 'minor';
    if (existingPattern && existingPattern.frequency >= 3) {
        severity = 'major';
    }
    else if (existingPattern && existingPattern.frequency >= 2) {
        severity = 'moderate';
    }
    const obstacle = {
        id: `obs_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        userId,
        goalId: context?.goalId,
        actionId: context?.actionId,
        description: description.slice(0, 200),
        type,
        severity,
        detectedAt: new Date(),
        status: 'active',
        supportOffered: [],
    };
    profile.obstacles.push(obstacle);
    // Update patterns
    updatePatterns(profile, type, context?.topic);
    log.info({ userId, type, severity }, '🚧 Obstacle detected');
    return obstacle;
}
function updatePatterns(profile, type, context) {
    const existing = profile.patterns.find((p) => p.type === type);
    if (existing) {
        existing.frequency++;
        existing.lastSeen = new Date();
        if (context && !existing.commonContexts.includes(context)) {
            existing.commonContexts.push(context);
        }
    }
    else {
        profile.patterns.push({
            type,
            frequency: 1,
            lastSeen: new Date(),
            commonContexts: context ? [context] : [],
        });
    }
}
// ============================================================================
// OBSTACLE SUPPORT
// ============================================================================
const OBSTACLE_SUPPORT = {
    time: {
        type: 'time',
        acknowledgment: "Time is real. You can't create more of it, and everything takes some.",
        questions: [
            'What would take just 5 minutes that would move this forward?',
            'Is there anything you could let go of to make space for this?',
            "What if 'good enough for now' was actually enough?",
        ],
        reframes: [
            "What if progress doesn't require hours, just consistency?",
            'Tiny steps still get you there - just slower.',
            "Sometimes 'not having time' means 'not being a priority' - and that's okay to acknowledge.",
        ],
        suggestions: [
            'Block 10 minutes tomorrow morning, before email',
            'What could you combine this with?',
            'Set a timer for 5 minutes. Just start. You can stop when it goes off.',
        ],
    },
    energy: {
        type: 'energy',
        acknowledgment: "You can't pour from an empty cup. That's not an excuse - it's reality.",
        questions: [
            'What would rest actually look like for you right now?',
            'Is this goal something you still want, or has something shifted?',
            'What gives you energy? What drains it?',
        ],
        reframes: [
            'Rest is part of progress, not the opposite of it.',
            "Sometimes 'not having energy' is your body saying 'not this, not now.'",
            'Energy follows interest. Is this still interesting to you?',
        ],
        suggestions: [
            'What if you committed to doing less, better?',
            'Try doing the thing when you have a sliver of energy, even for 2 minutes.',
            'Sometimes momentum creates energy, not the other way around.',
        ],
    },
    fear: {
        type: 'fear',
        acknowledgment: "Fear makes sense. It's trying to protect you from something.",
        questions: [
            "What's the worst that could actually happen?",
            "What would you do if it didn't work out?",
            "What's fear protecting you from?",
        ],
        reframes: [
            'Fear and excitement feel almost identical in your body.',
            "The presence of fear doesn't mean you shouldn't do it.",
            "You've survived 100% of your scary moments so far.",
        ],
        suggestions: [
            'Write down the fear. Sometimes seeing it shrinks it.',
            "What's one tiny step that feels safe-ish?",
            'What would you tell a friend who had this fear?',
        ],
    },
    perfectionism: {
        type: 'perfectionism',
        acknowledgment: "The desire to do things well isn't bad. But waiting for perfect means waiting forever.",
        questions: [
            "What would 'good enough' look like?",
            "What's the cost of waiting for perfect conditions?",
            'Who says it has to be perfect?',
        ],
        reframes: [
            'Done is better than perfect.',
            'Perfect is a direction, not a destination.',
            "Your 'mediocre' might be someone else's 'amazing.'",
        ],
        suggestions: [
            "Try a 'shitty first draft' - you can always improve it.",
            'What if you did it badly on purpose, just to get started?',
            'Set a timer. Ship whatever you have when it goes off.',
        ],
    },
    overwhelm: {
        type: 'overwhelm',
        acknowledgment: "When everything feels huge, even small things feel impossible. That's normal.",
        questions: [
            'If you could only do ONE thing, what would it be?',
            "What's the smallest possible version of this?",
            'What can you let go of right now?',
        ],
        reframes: [
            'You eat an elephant one bite at a time.',
            "Overwhelm often means you're trying to hold too much at once.",
            "It doesn't all have to happen today.",
        ],
        suggestions: [
            'Write everything down. Get it out of your head.',
            'Pick the easiest thing. Just that one thing.',
            'What would take less than 2 minutes?',
        ],
    },
    unclear: {
        type: 'unclear',
        acknowledgment: "Not knowing is uncomfortable. But it's also honest.",
        questions: [
            'What do you know for sure?',
            'Who might know how to do this?',
            "What's one thing you could try to learn more?",
        ],
        reframes: [
            'Confusion is the beginning of understanding.',
            "You don't need to know everything to start.",
            "Doing teaches you what reading can't.",
        ],
        suggestions: [
            'Google it. Seriously. Just start there.',
            "Find one person who's done this and ask them.",
            'Try something. Anything. The feedback will teach you.',
        ],
    },
    motivation: {
        type: 'motivation',
        acknowledgment: "Motivation comes and goes. It's not a character flaw when it leaves.",
        questions: [
            'Why did this matter to you in the first place?',
            'Has something changed about what you want?',
            "What would reconnect you to the 'why'?",
        ],
        reframes: [
            'Motivation follows action, not the other way around.',
            "Sometimes you don't need motivation - you need systems.",
            "It's okay if you don't want this anymore.",
        ],
        suggestions: [
            'Revisit why you started. Write it down.',
            'Commit to 2 minutes. Often that sparks something.',
            'What if you made it easier or more fun?',
        ],
    },
    external: {
        type: 'external',
        acknowledgment: "Some things really are out of your control. That's frustrating.",
        questions: [
            'What IS in your control here?',
            'Is there a workaround?',
            'What can you do while you wait?',
        ],
        reframes: [
            "Focus on what you can control, not what you can't.",
            'Waiting is hard, but sometimes necessary.',
            "You can't control them, but you can control how you respond.",
        ],
        suggestions: [
            'Follow up. Sometimes people just need a nudge.',
            'Is there another path to the same destination?',
            'What else could you work on in the meantime?',
        ],
    },
    self_doubt: {
        type: 'self_doubt',
        acknowledgment: "Self-doubt is that voice that says you're not enough. It's loud, but it's not truth.",
        questions: [
            "What evidence do you have that you CAN'T do this?",
            'What would you say to a friend who felt this way?',
            'When have you surprised yourself before?',
        ],
        reframes: [
            'Feeling unqualified is normal. Most people feel this way.',
            "You don't need to feel confident to act confident.",
            "The imposter feeling often means you're growing.",
        ],
        suggestions: [
            "List three things you've done that you didn't think you could.",
            "What's one small win you could get today?",
            'Act as if you believed in yourself. See what happens.',
        ],
    },
    competing_priorities: {
        type: 'competing_priorities',
        acknowledgment: "Life doesn't pause for our goals. Sometimes other things have to come first.",
        questions: [
            'Is this still a priority for you?',
            'What would it take to make space for this?',
            'What can you say no to?',
        ],
        reframes: [
            'Saying yes to this means saying no to something else.',
            "It's okay to put things on hold intentionally.",
            "Priorities shift. That's not failure.",
        ],
        suggestions: [
            'Schedule it like an appointment.',
            'What if you did less of it, but consistently?',
            'Can you combine it with something else?',
        ],
    },
    emotional: {
        type: 'emotional',
        acknowledgment: 'Emotions are real. They affect everything, including productivity.',
        questions: [
            'What do you need right now?',
            'Is this a season to push through, or a season to rest?',
            'What would taking care of yourself look like today?',
        ],
        reframes: [
            "It's okay to not be okay.",
            'Sometimes the most productive thing is processing.',
            "You're not broken. You're human.",
        ],
        suggestions: [
            "What's one small thing that might feel good?",
            "Talk to someone about how you're feeling.",
            "Lower the bar. Way lower. What's the minimum?",
        ],
    },
    unknown: {
        type: 'unknown',
        acknowledgment: "Sometimes we're stuck and we don't know why. That's okay too.",
        questions: [
            "What does 'stuck' feel like for you?",
            'If you had to guess, what might be in the way?',
            "What would help right now, even if you're not sure why?",
        ],
        reframes: [
            'Not knowing is information too.',
            'Sometimes we need to sit with uncertainty.',
            'The block might become clear with time.',
        ],
        suggestions: [
            'Try something random. Just move.',
            'Talk it out. Sometimes that helps.',
            "What if there's nothing to figure out? What then?",
        ],
    },
};
/**
 * Get support content for an obstacle type
 */
export function getObstacleSupport(type) {
    return OBSTACLE_SUPPORT[type] || OBSTACLE_SUPPORT.unknown;
}
/**
 * Generate a supportive response to an obstacle
 */
export function generateObstacleResponse(obstacle) {
    const support = getObstacleSupport(obstacle.type);
    const question = support.questions[Math.floor(Math.random() * support.questions.length)];
    const full = `${support.acknowledgment} ${question}`;
    const ssml = full
        .replace(/\. /g, ". <break time='300ms'/> ")
        .replace(/\?/g, "? <break time='400ms'/>");
    return {
        acknowledgment: support.acknowledgment,
        question,
        ssml,
    };
}
// ============================================================================
// OBSTACLE RESOLUTION
// ============================================================================
/**
 * Mark an obstacle as addressed (we talked about it)
 */
export function markObstacleAddressed(userId, obstacleId, supportOffered) {
    const profile = obstacleProfiles.get(userId);
    if (!profile)
        return;
    const obstacle = profile.obstacles.find((o) => o.id === obstacleId);
    if (obstacle) {
        obstacle.status = 'addressed';
        obstacle.supportOffered.push(supportOffered);
        log.debug({ userId, obstacleId }, 'Obstacle addressed');
    }
}
/**
 * Mark an obstacle as resolved
 */
export function markObstacleResolved(userId, obstacleId, whatHelped) {
    const profile = obstacleProfiles.get(userId);
    if (!profile)
        return;
    const obstacle = profile.obstacles.find((o) => o.id === obstacleId);
    if (obstacle) {
        obstacle.status = 'resolved';
        obstacle.resolvedAt = new Date();
        obstacle.whatHelped = whatHelped;
        log.info({ userId, obstacleId, whatHelped }, '✅ Obstacle resolved');
    }
}
// ============================================================================
// QUERIES
// ============================================================================
/**
 * Get active obstacles for a user
 */
export function getActiveObstacles(userId) {
    const profile = obstacleProfiles.get(userId);
    return profile?.obstacles.filter((o) => o.status === 'active') || [];
}
/**
 * Get obstacle patterns for a user
 */
export function getObstaclePatterns(userId) {
    const profile = obstacleProfiles.get(userId);
    return profile?.patterns || [];
}
/**
 * Get the most common obstacle type for a user
 */
export function getMostCommonObstacle(userId) {
    const patterns = getObstaclePatterns(userId);
    if (patterns.length === 0)
        return null;
    const sorted = patterns.sort((a, b) => b.frequency - a.frequency);
    return sorted[0].type;
}
// ============================================================================
// CONTEXT BUILDER
// ============================================================================
/**
 * Build LLM context for obstacles
 */
export function buildObstacleContext(userId) {
    const patterns = getObstaclePatterns(userId);
    if (patterns.length === 0)
        return null;
    const top = patterns.sort((a, b) => b.frequency - a.frequency).slice(0, 3);
    const lines = ['[🚧 OBSTACLE PATTERNS]'];
    lines.push(`This person often struggles with:`);
    for (const pattern of top) {
        lines.push(`• ${pattern.type.replace('_', ' ')} (seen ${pattern.frequency}x)`);
    }
    lines.push('');
    lines.push('Be aware of these patterns. Offer support, not judgment.');
    return lines.join('\n');
}
// ============================================================================
// PERSISTENCE
// ============================================================================
export function exportObstacleProfile(userId) {
    return obstacleProfiles.get(userId) || null;
}
export function importObstacleProfile(profile) {
    profile.obstacles.forEach((o) => {
        o.detectedAt = new Date(o.detectedAt);
        if (o.resolvedAt)
            o.resolvedAt = new Date(o.resolvedAt);
    });
    profile.patterns.forEach((p) => {
        p.lastSeen = new Date(p.lastSeen);
    });
    obstacleProfiles.set(profile.userId, profile);
    log.debug({ userId: profile.userId }, 'Imported obstacle profile');
}
// ============================================================================
// EXPORTS
// ============================================================================
export default {
    detectObstacle,
    getObstacleSupport,
    generateObstacleResponse,
    markObstacleAddressed,
    markObstacleResolved,
    getActiveObstacles,
    getObstaclePatterns,
    getMostCommonObstacle,
    buildObstacleContext,
    exportObstacleProfile,
    importObstacleProfile,
};
//# sourceMappingURL=obstacle-detection.js.map