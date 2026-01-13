/**
 * Commitment Tracking Tools
 *
 * "Better Than Human" accountability - tracks what users commit to
 * and follows up with care, not nagging.
 *
 * Uses the commitment-keeper superhuman service for persistence.
 *
 * @module tools/domains/productivity/commitments
 */
import { z } from 'zod';
import { llm } from '@livekit/agents';
import { getLogger } from '../../../utils/safe-logger.js';
import { saveCommitment, loadUserCommitments, updateCommitmentStatus, getFollowUpsForUser, } from '../../../services/superhuman/commitment-keeper.js';
const log = getLogger();
// ============================================================================
// RECORD COMMITMENT TOOL
// ============================================================================
/**
 * Manually record a commitment the user made
 * Use when user says something like "I'm going to call my mom" or "I promise to exercise"
 */
const recordCommitmentDef = {
    id: 'recordCommitment',
    name: 'Record Commitment',
    description: 'Record a commitment, intention, or promise the user made',
    domain: 'productivity',
    tags: ['commitments', 'accountability', 'promises', 'intentions'],
    create: (ctx) => {
        return llm.tool({
            description: `Record a commitment, intention, promise, goal, or decision the user just made. Call this when the user expresses intent to do something. The system will track it and follow up later with care (not nagging). Examples: "I'm going to call my mom", "I promise to exercise more", "I've decided to quit smoking", "I need to have that conversation with my boss".`,
            parameters: z.object({
                statement: z.string().describe('The exact or close paraphrase of what the user said'),
                summary: z
                    .string()
                    .describe('A brief summary for tracking (e.g., "call mom", "exercise daily")'),
                type: z
                    .enum([
                    'intention',
                    'promise',
                    'goal',
                    'boundary',
                    'conversation',
                    'decision',
                    'experiment',
                ])
                    .optional()
                    .describe('Type of commitment. Defaults to intention.'),
                targetDate: z
                    .string()
                    .optional()
                    .describe('When they said they would do it (natural language like "tomorrow", "this week")'),
                emotionalWeight: z
                    .number()
                    .min(0)
                    .max(1)
                    .optional()
                    .describe('How significant this feels (0-1). Higher for promises, emotional topics.'),
                personInvolved: z
                    .string()
                    .optional()
                    .describe('If this involves a specific person (e.g., "mom", "boss")'),
            }),
            execute: async (params) => {
                const { statement, summary, type = 'intention', targetDate, emotionalWeight = 0.5, personInvolved, } = params;
                log.info({ userId: ctx.userId, type, summary }, 'Recording commitment');
                // Parse target date if provided
                let targetDateMs;
                if (targetDate) {
                    const { parseNaturalTime } = await import('../../../services/scheduling/reminder-scheduler.js');
                    const parsed = parseNaturalTime(targetDate);
                    if (parsed) {
                        targetDateMs = parsed.getTime();
                    }
                }
                try {
                    const now = Date.now();
                    const result = await saveCommitment({
                        userId: ctx.userId,
                        statement,
                        summary,
                        text: summary, // Alias for calendar integration
                        type: type,
                        emotionalWeight,
                        personInvolved,
                        targetDate: targetDateMs,
                        // These will be overwritten by saveCommitment, but TypeScript requires them
                        createdAt: now,
                        lastMentioned: now,
                        followUpAfter: targetDateMs || now + 3 * 24 * 60 * 60 * 1000,
                        status: 'active',
                        followUpCount: 0,
                    });
                    // Build a human-friendly response
                    let response = `Got it - I'll remember that you ${summary}`;
                    if (targetDateMs) {
                        const date = new Date(targetDateMs);
                        const timeStr = formatCommitmentDate(date);
                        response += ` by ${timeStr}`;
                    }
                    response += `. I'll check in with you about it later.`;
                    // Add feasibility note if relevant
                    if (result.feasibility && !result.feasibility.feasible) {
                        response += ` Just a heads up - your calendar looks busy around then. Want me to help find time?`;
                    }
                    log.info({ commitmentId: result.commitment.id }, 'Commitment saved');
                    return response;
                }
                catch (error) {
                    log.error({ error: String(error), userId: ctx.userId }, 'Failed to save commitment');
                    return "I'll try to remember that, but I couldn't save it properly. Let me know if you want me to track it.";
                }
            },
        });
    },
};
// ============================================================================
// GET COMMITMENTS TOOL
// ============================================================================
/**
 * View active commitments
 */
const getCommitmentsDef = {
    id: 'getCommitments',
    name: 'Get Commitments',
    description: 'View active commitments and intentions',
    domain: 'productivity',
    tags: ['commitments', 'list', 'tracking'],
    create: (ctx) => {
        return llm.tool({
            description: `Get a list of active commitments, promises, and intentions the user has made. Use this to remind them what they said they would do, or to check in on their progress.`,
            parameters: z.object({
                includeCompleted: z
                    .boolean()
                    .optional()
                    .describe('Include recently completed commitments (default: false)'),
            }),
            execute: async (params) => {
                const commitments = await loadUserCommitments(ctx.userId);
                if (commitments.length === 0) {
                    return "You don't have any active commitments I'm tracking. When you say things like 'I'm going to...' or 'I promise to...', I'll remember and check in with you.";
                }
                const activeCommitments = commitments.filter((c) => c.status === 'active').slice(0, 10); // Limit to 10 for voice
                if (activeCommitments.length === 0) {
                    return "All your commitments are either completed or on hold. Nice work! When you make new commitments, I'll track them.";
                }
                const commitmentList = activeCommitments.map((c, i) => {
                    let line = `${i + 1}. ${c.summary}`;
                    if (c.targetDate) {
                        line += ` (by ${formatCommitmentDate(new Date(c.targetDate))})`;
                    }
                    if (c.type === 'promise') {
                        line += ' [promise]';
                    }
                    return line;
                });
                return `You have ${activeCommitments.length} active commitment${activeCommitments.length > 1 ? 's' : ''}:\n${commitmentList.join('\n')}`;
            },
        });
    },
};
// ============================================================================
// COMPLETE COMMITMENT TOOL
// ============================================================================
/**
 * Mark a commitment as completed
 */
const completeCommitmentDef = {
    id: 'completeCommitment',
    name: 'Complete Commitment',
    description: 'Mark a commitment as completed',
    domain: 'productivity',
    tags: ['commitments', 'complete', 'done'],
    create: (ctx) => {
        return llm.tool({
            description: `Mark a commitment as completed when the user says they did it. Celebrate their follow-through!`,
            parameters: z.object({
                commitmentQuery: z
                    .string()
                    .describe('The commitment to mark complete - summary or number from list'),
                reaction: z
                    .enum(['appreciated', 'neutral'])
                    .optional()
                    .describe('How the user reacted to the follow-up check-in'),
            }),
            execute: async (params) => {
                const { commitmentQuery, reaction } = params;
                const commitments = await loadUserCommitments(ctx.userId);
                if (commitments.length === 0) {
                    return "I don't have any commitments tracked for you right now.";
                }
                // Find the commitment
                let targetCommitment = null;
                const queryLower = commitmentQuery.toLowerCase().trim();
                const num = parseInt(queryLower);
                if (!isNaN(num) && num > 0 && num <= commitments.length) {
                    targetCommitment = commitments[num - 1];
                }
                else {
                    targetCommitment = commitments.find((c) => c.summary.toLowerCase().includes(queryLower) ||
                        c.statement.toLowerCase().includes(queryLower));
                }
                if (!targetCommitment) {
                    return `I couldn't find a commitment matching "${commitmentQuery}". Say "what are my commitments" to see the list.`;
                }
                await updateCommitmentStatus(ctx.userId, targetCommitment.id, 'completed', reaction);
                log.info({ commitmentId: targetCommitment.id }, 'Commitment completed');
                // Celebrate based on commitment type
                if (targetCommitment.type === 'promise') {
                    return `Amazing! You kept your promise: "${targetCommitment.summary}". That takes real integrity.`;
                }
                else if (targetCommitment.emotionalWeight > 0.7) {
                    return `Wow, you did it! "${targetCommitment.summary}" - I know that wasn't easy. I'm really proud of you.`;
                }
                else {
                    return `Nice! "${targetCommitment.summary}" is done. Way to follow through.`;
                }
            },
        });
    },
};
// ============================================================================
// DEFER COMMITMENT TOOL
// ============================================================================
/**
 * Postpone a commitment
 */
const deferCommitmentDef = {
    id: 'deferCommitment',
    name: 'Defer Commitment',
    description: 'Postpone a commitment to a later time',
    domain: 'productivity',
    tags: ['commitments', 'defer', 'postpone'],
    create: (ctx) => {
        return llm.tool({
            description: `Defer a commitment when the user needs more time. Be supportive, not judgmental.`,
            parameters: z.object({
                commitmentQuery: z
                    .string()
                    .describe('The commitment to defer - summary or number from list'),
                reason: z.string().optional().describe('Why they are deferring (for context, no judgment)'),
            }),
            execute: async (params) => {
                const { commitmentQuery, reason } = params;
                const commitments = await loadUserCommitments(ctx.userId);
                const activeCommitments = commitments.filter((c) => c.status === 'active');
                if (activeCommitments.length === 0) {
                    return "I don't have any active commitments to defer.";
                }
                // Find the commitment
                let targetCommitment = null;
                const queryLower = commitmentQuery.toLowerCase().trim();
                const num = parseInt(queryLower);
                if (!isNaN(num) && num > 0 && num <= activeCommitments.length) {
                    targetCommitment = activeCommitments[num - 1];
                }
                else {
                    targetCommitment = activeCommitments.find((c) => c.summary.toLowerCase().includes(queryLower) ||
                        c.statement.toLowerCase().includes(queryLower));
                }
                if (!targetCommitment) {
                    return `I couldn't find a commitment matching "${commitmentQuery}".`;
                }
                await updateCommitmentStatus(ctx.userId, targetCommitment.id, 'deferred');
                log.info({ commitmentId: targetCommitment.id, reason }, 'Commitment deferred');
                return `No problem. I've put "${targetCommitment.summary}" on hold. Life happens - just let me know when you're ready to revisit it.`;
            },
        });
    },
};
// ============================================================================
// GET FOLLOWUPS TOOL
// ============================================================================
/**
 * Get due follow-ups for commitments
 * This is primarily for the agent to use at session start
 */
const getFollowUpsDef = {
    id: 'getCommitmentFollowUps',
    name: 'Get Commitment Follow-ups',
    description: 'Get commitments that need a follow-up check-in',
    domain: 'productivity',
    tags: ['commitments', 'followups', 'checkin'],
    create: (ctx) => {
        return llm.tool({
            description: `Get commitments that are due for a follow-up. Use this at the start of a session to check in on things the user said they would do.`,
            parameters: z.object({}),
            execute: async () => {
                const followUps = await getFollowUpsForUser(ctx.userId);
                if (followUps.length === 0) {
                    return 'No commitments need a follow-up right now.';
                }
                // Return the most important follow-up
                const urgent = followUps.filter((f) => f.urgency === 'high');
                const normal = followUps.filter((f) => f.urgency === 'normal');
                if (urgent.length > 0) {
                    const f = urgent[0];
                    return `FOLLOW_UP_NEEDED: ${f.message} (tone: ${f.tone})`;
                }
                if (normal.length > 0) {
                    const f = normal[0];
                    return `FOLLOW_UP_SUGGESTED: ${f.message} (tone: ${f.tone})`;
                }
                return 'Some low-priority follow-ups available, but nothing pressing.';
            },
        });
    },
};
// ============================================================================
// HELPER FUNCTIONS
// ============================================================================
/**
 * Format a commitment date in a human-friendly way
 */
function formatCommitmentDate(date) {
    const now = new Date();
    const diffDays = Math.round((date.getTime() - now.getTime()) / 86400000);
    if (diffDays === 0)
        return 'today';
    if (diffDays === 1)
        return 'tomorrow';
    if (diffDays < 7) {
        return date.toLocaleDateString('en-US', { weekday: 'long' });
    }
    if (diffDays < 14) {
        return 'next ' + date.toLocaleDateString('en-US', { weekday: 'long' });
    }
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
// ============================================================================
// EXPORTS
// ============================================================================
export const commitmentTools = [
    recordCommitmentDef,
    getCommitmentsDef,
    completeCommitmentDef,
    deferCommitmentDef,
    getFollowUpsDef,
];
export function createCommitmentTools() {
    return commitmentTools;
}
export default commitmentTools;
//# sourceMappingURL=commitments.js.map