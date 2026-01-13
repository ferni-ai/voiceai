/**
 * Behavioral Economics Nudge Engine
 *
 * Phase 31: Use psychology of choice to help people change.
 * Based on Thaler & Sunstein's nudge theory, Kahneman's work,
 * and implementation intention research.
 *
 * CORE INSIGHT: People don't make rational decisions.
 * We can design choice environments that make good choices easier.
 *
 * @module NudgeEngine
 */
import { getLogger } from '../../utils/safe-logger.js';
import { createPersistenceStore } from '../persistence/index.js';
const log = getLogger().child({ module: 'nudge-engine' });
let nudgePersistence = null;
function getPersistence() {
    if (!nudgePersistence) {
        nudgePersistence = createPersistenceStore({
            collection: 'nudge_engine',
            documentId: 'data',
            syncIntervalMs: 5000,
            maxPendingChanges: 10,
        });
    }
    return nudgePersistence;
}
/**
 * Load user's nudge data from persistence.
 * Call this at session start.
 */
export async function loadUserNudgeData(userId) {
    try {
        const persistence = getPersistence();
        const data = await persistence.load(userId);
        if (data) {
            // Restore commitments
            if (data.commitments && data.commitments.length > 0) {
                commitments.set(userId, data.commitments.map((c) => ({
                    ...c,
                    createdAt: new Date(c.createdAt),
                    deadline: c.deadline ? new Date(c.deadline) : undefined,
                })));
            }
            // Restore implementation intentions
            if (data.intentions && data.intentions.length > 0) {
                intentions.set(userId, data.intentions.map((i) => ({
                    ...i,
                    createdAt: new Date(i.createdAt),
                })));
            }
            log.debug({
                userId,
                commitments: data.commitments?.length ?? 0,
                intentions: data.intentions?.length ?? 0,
            }, 'Loaded nudge data from persistence');
        }
    }
    catch (error) {
        log.warn({ error, userId }, 'Failed to load nudge data from persistence');
    }
}
/**
 * Save user's nudge data to persistence.
 */
function saveUserNudgeData(userId) {
    try {
        const persistence = getPersistence();
        const data = {
            commitments: commitments.get(userId) ?? [],
            intentions: intentions.get(userId) ?? [],
            lastUpdated: new Date().toISOString(),
        };
        persistence.set(userId, data);
    }
    catch (error) {
        log.warn({ error, userId }, 'Failed to save nudge data to persistence');
    }
}
/**
 * Flush pending changes for a user.
 */
export async function flushUserNudgeData(userId) {
    const persistence = getPersistence();
    await persistence.flushUser(userId);
}
/**
 * Clear user's nudge data from memory and persistence.
 */
export async function clearUserNudgeData(userId) {
    commitments.delete(userId);
    intentions.delete(userId);
    const persistence = getPersistence();
    await persistence.delete(userId);
}
// ============================================================================
// NUDGE LIBRARY
// ============================================================================
const NUDGE_LIBRARY = {
    default_setting: {
        description: 'Make the desired behavior the default option',
        effectiveness: 'Very high - requires effort to opt out',
        bestFor: ['routine behaviors', 'subscription choices', 'settings'],
        scripts: [
            'What if we set this as your default, and you can always change it?',
            "I'll assume [good choice] unless you tell me otherwise—sound okay?",
        ],
    },
    social_proof: {
        description: 'Show what similar others do',
        effectiveness: 'High for uncertain situations',
        bestFor: ['unfamiliar decisions', 'social behaviors', 'norms'],
        scripts: [
            'Many people in your situation find that [behavior] helps.',
            "Others who've struggled with this often start by...",
            "You're not alone—most people feel this way at first.",
        ],
    },
    commitment_device: {
        description: 'Pre-commit to future behavior',
        effectiveness: 'High when stakes are meaningful',
        bestFor: ['temptation resistance', 'long-term goals', 'procrastination'],
        scripts: [
            'Would it help to tell someone about this goal? Who would you tell?',
            "What would make this feel more real—like you've actually committed?",
            'Sometimes putting something on the line helps. What would that look like for you?',
        ],
    },
    implementation_intention: {
        description: 'Create specific if-then plans',
        effectiveness: '2-3x more likely to follow through (Gollwitzer)',
        bestFor: ['any behavior change', 'habit formation', 'goal pursuit'],
        scripts: [
            "Let's get specific: When and where will you do this?",
            "If [situation], then I will [behavior]. What's your if-then?",
            "What's the trigger that will remind you to do this?",
        ],
    },
    loss_framing: {
        description: 'Emphasize what they stand to lose by not acting',
        effectiveness: 'High - losses hurt 2x more than equivalent gains',
        bestFor: ['overcoming inertia', 'health behaviors', 'financial decisions'],
        scripts: [
            'What would you lose if nothing changes?',
            "Imagine looking back in a year and realizing you didn't try. How would that feel?",
            "Each day that passes is a day you don't get back.",
        ],
    },
    gain_framing: {
        description: 'Emphasize benefits of the desired action',
        effectiveness: 'Moderate - better for positive emotions',
        bestFor: ['aspirational goals', 'creative pursuits', 'joyful activities'],
        scripts: [
            "Imagine how you'd feel if you actually did this. What would be different?",
            "What's the best possible outcome if you try?",
            'What would you gain from making this change?',
        ],
    },
    temporal_reframing: {
        description: 'Shift focus between present and future',
        effectiveness: 'High for present-bias',
        bestFor: ['delayed gratification', 'long-term planning', 'impulse control'],
        scripts: [
            'What would future-you thank you for doing today?',
            'In a year, which choice would you be prouder of?',
            'Your future self is counting on present-you. What do they need?',
        ],
    },
    identity_alignment: {
        description: 'Connect behavior to desired identity',
        effectiveness: 'Very high - identity is powerful motivator',
        bestFor: ['value-based goals', 'character development', 'habit identity'],
        scripts: [
            'What would someone who [identity] do in this situation?',
            'Is this the kind of person you want to be?',
            'You said you value [value]. How does this choice align with that?',
        ],
    },
    friction_reduction: {
        description: 'Make good behavior easier',
        effectiveness: 'High - behavior follows path of least resistance',
        bestFor: ['any desired behavior', 'habit formation', 'defaults'],
        scripts: [
            'How can we make this as easy as possible?',
            "What's one obstacle we can remove?",
            'What if you prepared everything the night before?',
        ],
    },
    friction_addition: {
        description: 'Make unwanted behavior harder',
        effectiveness: 'High for impulsive behaviors',
        bestFor: ['temptation', 'bad habits', 'impulse control'],
        scripts: [
            'What if you made it harder to [unwanted behavior]?',
            'Could you add some steps between the urge and the action?',
            'What if you had to wait 10 minutes before doing that?',
        ],
    },
    salience: {
        description: 'Make relevant information prominent',
        effectiveness: 'Moderate - attention is limited',
        bestFor: ['information-based decisions', 'reminders', 'awareness'],
        scripts: [
            'What if this was the first thing you saw every morning?',
            'How can we make this impossible to ignore?',
            'What reminder would actually work for you?',
        ],
    },
    feedback: {
        description: 'Show consequences of choices in real-time',
        effectiveness: 'High when immediate and clear',
        bestFor: ['progress tracking', 'learning', 'behavior shaping'],
        scripts: [
            "How will you know if it's working?",
            'What would success look like that you could actually see?',
            "Let's track this so you can see the progress.",
        ],
    },
    chunking: {
        description: 'Break large goals into small pieces',
        effectiveness: 'Very high for overwhelming tasks',
        bestFor: ['big projects', 'overwhelm', 'procrastination'],
        scripts: [
            "What's the tiniest first step?",
            'If you could only do one thing, what would it be?',
            "Let's break this down until it feels doable.",
        ],
    },
    anchoring: {
        description: 'Set reference points that influence perception',
        effectiveness: 'High for numerical judgments',
        bestFor: ['goal setting', 'expectations', 'comparison'],
        scripts: [
            "Even 5 minutes would be a win. What's your minimum?",
            'Some people do this for an hour. You might start with 10 minutes.',
            'On a scale of 1-10, where do you want to be?',
        ],
    },
};
// ============================================================================
// STORAGE
// ============================================================================
const commitments = new Map();
const intentions = new Map();
// ============================================================================
// CORE FUNCTIONS
// ============================================================================
/**
 * Select the best nudges for a given context.
 */
export function selectNudges(context) {
    const nudges = [];
    // Implementation intentions are almost always valuable
    nudges.push(createNudge('implementation_intention', context));
    // Based on stage
    switch (context.currentStage) {
        case 'considering':
            // Help them decide
            nudges.push(createNudge('loss_framing', context));
            nudges.push(createNudge('identity_alignment', context));
            break;
        case 'planning':
            // Help them commit
            nudges.push(createNudge('commitment_device', context));
            nudges.push(createNudge('friction_reduction', context));
            break;
        case 'acting':
            // Help them follow through
            nudges.push(createNudge('chunking', context));
            nudges.push(createNudge('feedback', context));
            break;
        case 'maintaining':
            // Help them sustain
            nudges.push(createNudge('identity_alignment', context));
            nudges.push(createNudge('social_proof', context));
            break;
    }
    // Low motivation → emphasize loss and identity
    if (context.motivationLevel < 0.4) {
        nudges.push(createNudge('loss_framing', context));
        nudges.push(createNudge('temporal_reframing', context));
    }
    // Multiple past attempts → different approach
    if (context.pastAttempts && context.pastAttempts > 2) {
        nudges.push(createNudge('friction_reduction', context));
        nudges.push(createNudge('chunking', context));
    }
    return nudges.slice(0, 3); // Top 3 most relevant
}
/**
 * Create a nudge for specific context.
 */
function createNudge(type, context) {
    const library = NUDGE_LIBRARY[type];
    const script = library.scripts[Math.floor(Math.random() * library.scripts.length)];
    return {
        id: `nudge_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type,
        targetBehavior: context.goalType,
        strategy: library.description,
        script,
        timing: type === 'feedback' ? 'contextual' : 'immediate',
        effectiveness: type === 'implementation_intention' ? 0.8 : 0.6,
    };
}
/**
 * Create an implementation intention.
 */
export function createImplementationIntention(userId, goal, situation, behavior) {
    const intention = {
        id: `ii_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        userId,
        goal,
        situation,
        behavior,
        formula: `If ${situation}, then I will ${behavior}`,
        createdAt: new Date(),
        timesTriggered: 0,
        successRate: 0,
    };
    if (!intentions.has(userId)) {
        intentions.set(userId, []);
    }
    intentions.get(userId).push(intention);
    // Persist changes
    saveUserNudgeData(userId);
    log.info({ userId, formula: intention.formula }, '📋 Created implementation intention');
    return intention;
}
/**
 * Create a commitment device.
 */
export function createCommitment(userId, commitment, options) {
    const device = {
        id: `commit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        userId,
        type: options?.type ?? 'identity',
        commitment,
        createdAt: new Date(),
        deadline: options?.deadline,
        stakes: options?.stakes,
        witnesses: options?.witnesses,
        status: 'active',
    };
    if (!commitments.has(userId)) {
        commitments.set(userId, []);
    }
    commitments.get(userId).push(device);
    // Persist changes
    saveUserNudgeData(userId);
    log.info({ userId, commitment: device.commitment, type: device.type }, '🎯 Created commitment');
    return device;
}
/**
 * Record intention trigger and outcome.
 */
export function recordIntentionOutcome(userId, intentionId, succeeded) {
    const userIntentions = intentions.get(userId);
    if (!userIntentions)
        return;
    const intention = userIntentions.find((i) => i.id === intentionId);
    if (intention) {
        intention.timesTriggered++;
        // Running success rate
        const total = intention.timesTriggered;
        const currentSuccesses = intention.successRate * (total - 1);
        intention.successRate = (currentSuccesses + (succeeded ? 1 : 0)) / total;
        // Persist changes
        saveUserNudgeData(userId);
    }
}
/**
 * Update commitment status.
 */
export function updateCommitmentStatus(userId, commitmentId, status) {
    const userCommitments = commitments.get(userId);
    if (!userCommitments)
        return;
    const commitment = userCommitments.find((c) => c.id === commitmentId);
    if (commitment) {
        commitment.status = status;
        // Persist changes
        saveUserNudgeData(userId);
        log.info({ userId, commitmentId, status }, 'Updated commitment status');
    }
}
/**
 * Get user's active commitments.
 */
export function getActiveCommitments(userId) {
    return (commitments.get(userId) ?? []).filter((c) => c.status === 'active');
}
/**
 * Get user's implementation intentions.
 */
export function getImplementationIntentions(userId) {
    return intentions.get(userId) ?? [];
}
/**
 * Generate nudge-based context for LLM.
 */
export function getNudgeContextInjection(context) {
    const nudges = selectNudges(context);
    if (nudges.length === 0)
        return '';
    const scripts = nudges.map((n) => `• ${n.type}: "${n.script}"`).join('\n');
    return `[🎯 BEHAVIORAL NUDGES]
Stage: ${context.currentStage}
Motivation: ${Math.round(context.motivationLevel * 100)}%

Consider these research-backed approaches:
${scripts}

Key: Don't lecture—use questions to guide discovery.`;
}
/**
 * Generate implementation intention prompt.
 */
export function generateIntentionPrompt(goal) {
    return `Let's make this concrete. Fill in the blanks:

"When [specific situation or time], I will [specific action]."

For example: "When I finish my morning coffee, I will write for 10 minutes."

What's your when-I-will statement for ${goal}?`;
}
// ============================================================================
// EXPORTS
// ============================================================================
export const nudgeEngine = {
    select: selectNudges,
    createIntention: createImplementationIntention,
    createCommitment,
    recordOutcome: recordIntentionOutcome,
    updateCommitment: updateCommitmentStatus,
    getCommitments: getActiveCommitments,
    getIntentions: getImplementationIntentions,
    getContext: getNudgeContextInjection,
    generatePrompt: generateIntentionPrompt,
    // Persistence functions
    loadUserData: loadUserNudgeData,
    flushUserData: flushUserNudgeData,
    clearUserData: clearUserNudgeData,
};
export default nudgeEngine;
//# sourceMappingURL=nudge-engine.js.map