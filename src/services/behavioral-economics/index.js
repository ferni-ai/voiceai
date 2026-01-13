/**
 * Behavioral Economics for Coaching
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Behavioral economics techniques that help people bridge the gap
 * between intention and action. These nudges work with human psychology,
 * not against it.
 *
 * PHILOSOPHY:
 * People know what they should do. The challenge is doing it.
 * Behavioral economics helps by designing choice architecture,
 * reducing friction, and leveraging our natural biases for good.
 *
 * TECHNIQUES:
 * 1. Implementation Intentions - "When X, I will Y"
 * 2. Commitment Devices - Pre-committing to reduce future temptation
 * 3. Loss Framing - Leveraging loss aversion
 * 4. Temptation Bundling - Pairing wants with shoulds
 * 5. Social Proof - "People like you..."
 * 6. Default Design - Making good choices the path of least resistance
 * 7. Friction Reduction - Removing barriers to action
 *
 * @module BehavioralEconomics
 */
import { createLogger } from '../../utils/safe-logger.js';
const log = createLogger({ module: 'BehavioralEconomics' });
// ============================================================================
// IMPLEMENTATION INTENTIONS
// ============================================================================
const userIntentions = new Map();
/**
 * Create an implementation intention.
 * "When [situation], I will [behavior] to achieve [goal]"
 */
export function createImplementationIntention(userId, when, then, goal) {
    const intention = {
        id: `ii_${Date.now()}`,
        userId,
        when,
        then,
        goal,
        specificity: assessSpecificity(when, then),
        rehearsed: false,
        timesTriggered: 0,
        timesCompleted: 0,
        createdAt: new Date(),
    };
    const existing = userIntentions.get(userId) || [];
    existing.push(intention);
    userIntentions.set(userId, existing);
    log.debug({ userId, when, then }, '📋 Implementation intention created');
    return intention;
}
/**
 * Assess how specific an implementation intention is.
 */
function assessSpecificity(when, then) {
    const specificTriggers = ['after', 'before', 'when I', 'at', 'as soon as', 'once'];
    const specificActions = ['I will', "I'll", 'put', 'take', 'open', 'call', 'send'];
    const hasSpecificTrigger = specificTriggers.some((t) => when.toLowerCase().includes(t));
    const hasSpecificAction = specificActions.some((a) => then.toLowerCase().includes(a));
    // Check for time/place specificity
    const hasTime = /\d+\s*(am|pm|o'clock)|morning|evening|lunch|dinner/i.test(when);
    const hasPlace = /at\s+(the|my|home|work|gym|office)/i.test(when);
    const specificityScore = (hasSpecificTrigger ? 1 : 0) +
        (hasSpecificAction ? 1 : 0) +
        (hasTime ? 1 : 0) +
        (hasPlace ? 1 : 0);
    if (specificityScore >= 3)
        return 'specific';
    if (specificityScore >= 1)
        return 'moderate';
    return 'vague';
}
/**
 * Get implementation intentions for a user.
 */
export function getImplementationIntentions(userId) {
    return userIntentions.get(userId) || [];
}
/**
 * Generate prompts to make intentions more specific.
 */
export function strengthenIntention(intention) {
    const prompts = [];
    if (intention.specificity === 'vague' || intention.specificity === 'moderate') {
        // Make trigger more specific
        if (!/at\s+\d/i.test(intention.when)) {
            prompts.push(`What time specifically will this happen? "After I ${intention.when}" becomes more powerful with a specific time.`);
        }
        if (!/at\s+(the|my|home|work)/i.test(intention.when)) {
            prompts.push(`Where will you be when this happens? Adding a place makes it stick better.`);
        }
        // Make action more concrete
        prompts.push(`What's the very first physical action? Instead of "${intention.then}", what's the first thing your body does?`);
    }
    if (!intention.rehearsed) {
        prompts.push(`Let's mentally rehearse this. Close your eyes for a second and imagine: it's [time], you're [place], and you [trigger]. What do you see yourself doing?`);
    }
    return prompts;
}
/**
 * Record intention trigger and outcome.
 */
export function recordIntentionOutcome(userId, intentionId, completed) {
    const intentions = userIntentions.get(userId) || [];
    const intention = intentions.find((i) => i.id === intentionId);
    if (intention) {
        intention.timesTriggered++;
        if (completed) {
            intention.timesCompleted++;
        }
    }
}
// ============================================================================
// COMMITMENT DEVICES
// ============================================================================
const userCommitments = new Map();
/**
 * Create a commitment device.
 */
export function createCommitmentDevice(userId, commitment, type, options) {
    const device = {
        id: `cd_${Date.now()}`,
        userId,
        commitment,
        type,
        witnesses: options?.witnesses,
        stake: options?.stake,
        deadline: options?.deadline,
        status: 'active',
        createdAt: new Date(),
    };
    const existing = userCommitments.get(userId) || [];
    existing.push(device);
    userCommitments.set(userId, existing);
    log.debug({ userId, commitment, type }, '🔒 Commitment device created');
    return device;
}
/**
 * Get active commitment devices.
 */
export function getActiveCommitments(userId) {
    const all = userCommitments.get(userId) || [];
    return all.filter((c) => c.status === 'active');
}
/**
 * Generate commitment device suggestions based on goal.
 */
export function suggestCommitmentDevice(goal, userContext) {
    const suggestions = [];
    // Social commitment
    suggestions.push({
        type: 'social',
        suggestion: `Tell someone you trust about this goal. "I'm going to ${goal}." Who would be the right person to tell?`,
        strength: 'medium',
        why: 'Social pressure and not wanting to lose face is a powerful motivator.',
    });
    // Calendar commitment
    suggestions.push({
        type: 'calendar',
        suggestion: `Put it in your calendar right now. Not "tomorrow" - the exact day and time. When is the first time you'll do this?`,
        strength: 'medium',
        why: "Things without specific times don't happen.",
    });
    // Identity commitment
    if (userContext?.valuesIdentity) {
        suggestions.push({
            type: 'identity',
            suggestion: `You said you want to be someone who [value]. This is a chance to be that person. What would that person do?`,
            strength: 'high',
            why: 'Acting consistent with identity is deeply motivating.',
        });
    }
    // Accountability
    if (userContext?.hasAccountabilityPartner) {
        suggestions.push({
            type: 'accountability',
            suggestion: `Want to text your accountability partner right now and tell them? I can help you draft the message.`,
            strength: 'high',
            why: 'Knowing someone will check in creates follow-through.',
        });
    }
    // Stake commitment
    suggestions.push({
        type: 'stake',
        suggestion: `What if you put something on the line? "If I don't do this by [date], I'll [consequence]." What would make this real?`,
        strength: 'high',
        why: 'Loss aversion means we work harder to avoid losing than to gain.',
    });
    return suggestions;
}
// ============================================================================
// LOSS FRAMING
// ============================================================================
/**
 * Reframe a goal in terms of loss rather than gain.
 * Loss aversion: losing $100 feels worse than gaining $100 feels good.
 */
export function applyLossFraming(goal, currentBenefit) {
    // Generic loss frames
    const lossFrames = [
        {
            gain: 'get more energy',
            loss: "Every day you don't exercise, you're losing energy you could have. That compounds.",
        },
        {
            gain: 'save money',
            loss: "Every unnecessary purchase is money you'll never see again. What else could it have become?",
        },
        {
            gain: 'be healthier',
            loss: 'Every week without change is a week your body ages faster than it has to.',
        },
        {
            gain: 'have better relationships',
            loss: "Every conversation you avoid is a chance to connect that you'll never get back.",
        },
        {
            gain: 'learn something',
            loss: 'Every day without learning is a day you fell behind everyone who did.',
        },
    ];
    // Try to match
    const lowerGoal = goal.toLowerCase();
    for (const frame of lossFrames) {
        if (lowerGoal.includes(frame.gain.split(' ')[1])) {
            return frame.loss;
        }
    }
    // Generic loss frame
    return `Every day you wait, you're losing a day of progress you could have had. Time doesn't come back.`;
}
/**
 * Generate loss-framed questions.
 */
export function getLossFramedQuestions(topic) {
    return [
        `If nothing changes, what will you have lost a year from now?`,
        `What's it already cost you to stay where you are?`,
        `Who are you letting down by not doing this?`,
        `What opportunities have you already missed because of this?`,
        `If you keep putting this off, what will you regret?`,
    ];
}
// ============================================================================
// TEMPTATION BUNDLING
// ============================================================================
const userBundles = new Map();
/**
 * Create a temptation bundle.
 * "I only get [thing I want] when I'm doing [thing I should do]"
 */
export function createTemptationBundle(userId, shouldBehavior, wantReward) {
    const rule = `I only get to ${wantReward.toLowerCase()} when I'm ${shouldBehavior.toLowerCase()}.`;
    const bundle = {
        id: `tb_${Date.now()}`,
        userId,
        shouldBehavior,
        wantReward,
        rule,
        createdAt: new Date(),
    };
    const existing = userBundles.get(userId) || [];
    existing.push(bundle);
    userBundles.set(userId, existing);
    log.debug({ userId, shouldBehavior, wantReward }, '🎁 Temptation bundle created');
    return bundle;
}
/**
 * Suggest temptation bundles based on wants and shoulds.
 */
export function suggestTemptationBundles(shoulds, wants) {
    const suggestions = [];
    // Common bundles that work well
    const classicBundles = {
        exercise: ['listen to podcasts', 'watch TV shows', 'audiobooks', 'favorite playlist'],
        cleaning: ['music', 'podcasts', 'call a friend'],
        studying: ['favorite snacks', 'nice coffee', 'cozy environment'],
        work: ['good music', 'nice drinks', 'comfortable setup'],
    };
    for (const should of shoulds) {
        const lowerShould = should.toLowerCase();
        // Match with classic bundles
        for (const [category, rewards] of Object.entries(classicBundles)) {
            if (lowerShould.includes(category)) {
                for (const reward of rewards) {
                    suggestions.push({
                        should,
                        want: reward,
                        rule: `I only ${reward} while ${should.toLowerCase()}.`,
                        effectiveness: 'high',
                    });
                }
            }
        }
        // Match with user's specific wants
        for (const want of wants) {
            suggestions.push({
                should,
                want,
                rule: `I only ${want.toLowerCase()} when I'm ${should.toLowerCase()}.`,
                effectiveness: 'medium',
            });
        }
    }
    return suggestions.slice(0, 5); // Return top 5
}
/**
 * Get user's temptation bundles.
 */
export function getTemptationBundles(userId) {
    return userBundles.get(userId) || [];
}
// ============================================================================
// FRICTION REDUCTION
// ============================================================================
/**
 * Audit friction for a goal.
 */
export function auditFriction(goal, currentBarriers) {
    const barriers = [];
    // Common barriers for common goals
    const commonBarriers = {
        exercise: [
            {
                barrier: 'Finding workout clothes',
                type: 'effort',
                severity: 'low',
                solution: 'Sleep in workout clothes or lay them out the night before',
            },
            {
                barrier: 'Getting to the gym',
                type: 'time',
                severity: 'medium',
                solution: 'Home workout instead, or gym on commute route',
            },
            {
                barrier: 'Deciding what workout to do',
                type: 'decision',
                severity: 'medium',
                solution: 'Follow a preset program or app',
            },
            {
                barrier: 'Low energy',
                type: 'emotional',
                severity: 'medium',
                solution: 'Commit to just 5 minutes - start tiny',
            },
        ],
        meditation: [
            {
                barrier: 'Remembering to do it',
                type: 'decision',
                severity: 'low',
                solution: 'Habit stack with existing habit (coffee, waking up)',
            },
            {
                barrier: 'Finding a quiet space',
                type: 'access',
                severity: 'low',
                solution: 'Use headphones, meditate in car, or accept imperfection',
            },
            {
                barrier: 'Not knowing how',
                type: 'decision',
                severity: 'low',
                solution: 'Use a guided app like Headspace or Calm',
            },
        ],
        reading: [
            {
                barrier: 'Phone distraction',
                type: 'effort',
                severity: 'high',
                solution: 'Put phone in another room, or use physical books',
            },
            {
                barrier: 'Not having the book',
                type: 'access',
                severity: 'low',
                solution: 'Keep book visible and accessible',
            },
            {
                barrier: 'Choosing what to read',
                type: 'decision',
                severity: 'low',
                solution: 'Always have next book ready',
            },
        ],
    };
    // Add relevant common barriers
    const lowerGoal = goal.toLowerCase();
    for (const [category, categoryBarriers] of Object.entries(commonBarriers)) {
        if (lowerGoal.includes(category)) {
            barriers.push(...categoryBarriers);
        }
    }
    // Add user-provided barriers
    if (currentBarriers) {
        for (const barrier of currentBarriers) {
            barriers.push({
                barrier,
                type: 'effort', // Default
                severity: 'medium',
            });
        }
    }
    // Generate solutions
    const solutions = barriers.filter((b) => b.solution).map((b) => b.solution);
    return {
        goal,
        barriers,
        solutions,
    };
}
/**
 * Generate friction questions to identify barriers.
 */
export function getFrictionQuestions(goal) {
    return [
        `What's the very first step to ${goal.toLowerCase()}? What makes that step hard?`,
        `Last time you tried this, where did it fall apart?`,
        `If you wanted to NOT do this, what excuse would you use?`,
        `What decision do you have to make before starting?`,
        `What do you need to have ready to make this easy?`,
        `When does this usually fail - morning, evening, weekends?`,
    ];
}
// ============================================================================
// SOCIAL PROOF
// ============================================================================
/**
 * Generate social proof statements.
 */
export function generateSocialProof(context) {
    const proofs = [];
    // General social proof
    proofs.push(`Most people who are successful at this started exactly where you are.`);
    // Demographic-specific (be careful with this)
    if (context.demographic) {
        proofs.push(`Other ${context.demographic} I've worked with have found that the first week is the hardest—after that it gets easier.`);
    }
    // Progress-based
    proofs.push(`The fact that you're even talking about this puts you ahead of most people who never take the first step.`);
    // Struggle-based
    proofs.push(`Almost everyone struggles with this at first. You're not behind—you're normal.`);
    return proofs;
}
// ============================================================================
// CONTEXT FOR LLM
// ============================================================================
/**
 * Build behavioral economics context for LLM.
 */
export function buildBehavioralEconomicsContext(userId, context) {
    const { goal, barrier, hasIntention, hasCommitment } = context;
    if (!goal) {
        return null;
    }
    const lines = ['[🧠 BEHAVIORAL ECONOMICS TOOLKIT]', '', `Goal: ${goal}`, ''];
    // If no intention yet, suggest creating one
    if (!hasIntention) {
        lines.push('IMPLEMENTATION INTENTION:');
        lines.push("• Get them to say 'When [situation], I will [behavior]'");
        lines.push('• More specific = more likely to happen');
        lines.push("• Ask: 'When specifically will you do this?'");
        lines.push('');
    }
    // If no commitment, suggest one
    if (!hasCommitment) {
        lines.push('COMMITMENT DEVICE:');
        lines.push("• Help them pre-commit: 'Who could you tell about this?'");
        lines.push("• Calendar it: 'Want to put it in your calendar right now?'");
        lines.push("• Stake it: 'What would make this feel real?'");
        lines.push('');
    }
    // If barrier mentioned
    if (barrier) {
        lines.push('FRICTION REDUCTION:');
        lines.push(`Barrier: ${barrier}`);
        lines.push("• Ask: 'What would make that easier?'");
        lines.push("• Ask: 'Can we remove a decision? Prepare something in advance?'");
        lines.push('');
    }
    // Temptation bundling option
    lines.push('TEMPTATION BUNDLING:');
    lines.push("• Ask: 'What's something you enjoy that you could ONLY do while [goal]?'");
    lines.push("• Example: 'I only listen to my favorite podcast while exercising'");
    lines.push('');
    // Loss framing option
    lines.push('LOSS FRAMING (use sparingly):');
    lines.push(applyLossFraming(goal));
    lines.push('');
    lines.push('Remember: Help them design their environment, not just their willpower.');
    return lines.join('\n');
}
// All functions are exported at their definitions above
//# sourceMappingURL=index.js.map