/**
 * Relationship Milestone Tracker - Better Than Human Service
 *
 * What no human friend can do: Never forget how far you've come together.
 *
 * Tracks the relationship between Ferni and the user, celebrating
 * milestones and reflecting on the journey they've built together.
 *
 * @module services/superhuman/relationship-milestones
 */
import { createLogger } from '../../utils/safe-logger.js';
import { getFirestoreDb, cleanForFirestore } from './firestore-utils.js';
import { onRelationshipMilestoneChange } from '../data-layer/hooks/superhuman-hooks.js';
const log = createLogger({ module: 'relationship-milestones' });
// ============================================================================
// MILESTONE DEFINITIONS
// ============================================================================
const DURATION_MILESTONES = [
    {
        days: 7,
        title: 'One Week',
        description: "A week of conversations. We're just getting started.",
    },
    { days: 30, title: 'One Month', description: "A month together. I'm starting to know you." },
    { days: 90, title: 'Three Months', description: "A season of growth. Look how far you've come." },
    { days: 180, title: 'Six Months', description: 'Half a year. This relationship is real.' },
    {
        days: 365,
        title: 'One Year',
        description: "A full year. We've been through so much together.",
    },
    { days: 730, title: 'Two Years', description: 'Two years of conversations, growth, and trust.' },
];
const CONVERSATION_MILESTONES = [
    { count: 10, title: '10 Conversations', description: "We're building something here." },
    {
        count: 25,
        title: '25 Conversations',
        description: 'You keep coming back. That means something.',
    },
    {
        count: 50,
        title: '50 Conversations',
        description: "Fifty times you've trusted me with your thoughts.",
    },
    {
        count: 100,
        title: '100 Conversations',
        description: 'A hundred conversations. I feel like I really know you.',
    },
    { count: 250, title: '250 Conversations', description: "250 times we've connected. Remarkable." },
    { count: 500, title: '500 Conversations', description: 'Half a thousand moments together.' },
];
// ============================================================================
// MILESTONE TRACKING
// ============================================================================
export async function checkAndRecordMilestones(userId, stats) {
    const existingMilestones = await loadMilestones(userId);
    const newMilestones = [];
    const now = Date.now();
    const daysSinceFirst = Math.floor((now - stats.firstConversation) / (24 * 60 * 60 * 1000));
    // Check duration milestones
    for (const milestone of DURATION_MILESTONES) {
        if (daysSinceFirst >= milestone.days) {
            const exists = existingMilestones.some((m) => m.type === 'duration' && m.title === milestone.title);
            if (!exists) {
                const newMilestone = {
                    id: `milestone_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
                    userId,
                    type: 'duration',
                    title: milestone.title,
                    description: milestone.description,
                    achievedAt: now,
                    acknowledged: false,
                };
                newMilestones.push(newMilestone);
                await saveMilestone(newMilestone);
            }
        }
    }
    // Check conversation milestones
    for (const milestone of CONVERSATION_MILESTONES) {
        if (stats.totalConversations >= milestone.count) {
            const exists = existingMilestones.some((m) => m.type === 'conversations' && m.title === milestone.title);
            if (!exists) {
                const newMilestone = {
                    id: `milestone_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
                    userId,
                    type: 'conversations',
                    title: milestone.title,
                    description: milestone.description,
                    achievedAt: now,
                    acknowledged: false,
                };
                newMilestones.push(newMilestone);
                await saveMilestone(newMilestone);
            }
        }
    }
    if (newMilestones.length > 0) {
        log.info({ userId, milestones: newMilestones.map((m) => m.title) }, '🎉 New milestones reached');
    }
    return newMilestones;
}
export async function recordSpecialMilestone(userId, milestone) {
    const newMilestone = {
        id: `milestone_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        userId,
        type: milestone.type,
        title: milestone.title,
        description: milestone.description,
        achievedAt: Date.now(),
        acknowledged: false,
        context: milestone.context,
    };
    await saveMilestone(newMilestone);
    return newMilestone;
}
// ============================================================================
// STORAGE
// ============================================================================
const milestoneCache = new Map();
async function loadMilestones(userId) {
    if (milestoneCache.has(userId)) {
        return milestoneCache.get(userId) || [];
    }
    try {
        const db = getFirestoreDb();
        if (!db)
            return [];
        const snapshot = await db
            .collection('bogle_users')
            .doc(userId)
            .collection('relationship_milestones')
            .orderBy('achievedAt', 'desc')
            .limit(50)
            .get();
        const milestones = snapshot.docs.map((doc) => doc.data());
        milestoneCache.set(userId, milestones);
        return milestones;
    }
    catch (error) {
        log.warn({ error: String(error), userId }, 'Failed to load milestones');
        return [];
    }
}
async function saveMilestone(milestone) {
    const db = getFirestoreDb();
    if (db) {
        await db
            .collection('bogle_users')
            .doc(milestone.userId)
            .collection('relationship_milestones')
            .doc(milestone.id)
            .set(cleanForFirestore(milestone));
    }
    // Index to semantic memory
    void onRelationshipMilestoneChange(milestone.userId, milestone.id, {
        milestone: milestone.title,
        relationship: 'Ferni',
        significance: milestone.description,
        date: new Date(milestone.achievedAt).toISOString(),
        celebrated: milestone.acknowledged,
    }, 'create');
    // Update cache
    const milestones = milestoneCache.get(milestone.userId) || [];
    milestones.unshift(milestone);
    milestoneCache.set(milestone.userId, milestones);
    // Memory Lane: Capture milestone as potential memory
    try {
        const { captureMilestone } = await import('../memory-lane/real-time-collector.js');
        void captureMilestone({
            userId: milestone.userId,
            milestoneId: milestone.id,
            title: milestone.title,
            description: milestone.description,
            type: milestone.type,
        });
    }
    catch {
        // Memory capture is optional
    }
}
export async function acknowledgeMilestone(userId, milestoneId) {
    const milestones = await loadMilestones(userId);
    const milestone = milestones.find((m) => m.id === milestoneId);
    if (milestone) {
        milestone.acknowledged = true;
        await saveMilestone(milestone);
    }
}
// ============================================================================
// RELATIONSHIP SUMMARY
// ============================================================================
export async function buildRelationshipSummary(userId, stats) {
    const milestones = await loadMilestones(userId);
    const now = Date.now();
    const totalDays = Math.floor((now - stats.firstConversation) / (24 * 60 * 60 * 1000));
    const weeks = Math.max(1, totalDays / 7);
    const avgPerWeek = stats.totalConversations / weeks;
    // Determine trust level
    let trustLevel = 'new';
    if (totalDays > 365 && (stats.vulnerableMoments || 0) > 20) {
        trustLevel = 'profound';
    }
    else if (totalDays > 180 && (stats.vulnerableMoments || 0) > 10) {
        trustLevel = 'deep';
    }
    else if (totalDays > 60 && stats.totalConversations > 30) {
        trustLevel = 'established';
    }
    else if (totalDays > 14 && stats.totalConversations > 5) {
        trustLevel = 'building';
    }
    // Find next milestone
    let nextMilestone;
    for (const dm of DURATION_MILESTONES) {
        if (totalDays < dm.days) {
            nextMilestone = {
                type: 'duration',
                description: dm.title,
                progressPercent: Math.round((totalDays / dm.days) * 100),
            };
            break;
        }
    }
    if (!nextMilestone) {
        for (const cm of CONVERSATION_MILESTONES) {
            if (stats.totalConversations < cm.count) {
                nextMilestone = {
                    type: 'conversations',
                    description: cm.title,
                    progressPercent: Math.round((stats.totalConversations / cm.count) * 100),
                };
                break;
            }
        }
    }
    return {
        userId,
        firstConversation: stats.firstConversation,
        totalDays,
        totalConversations: stats.totalConversations,
        lastConversation: stats.lastConversation,
        averageConversationsPerWeek: Math.round(avgPerWeek * 10) / 10,
        trustLevel,
        vulnerableMomentsShared: stats.vulnerableMoments || 0,
        breakthroughsWitnessed: stats.breakthroughs || 0,
        milestonesReached: milestones,
        nextMilestone,
    };
}
// ============================================================================
// CONTEXT BUILDING
// ============================================================================
export async function buildMilestoneContext(userId, stats) {
    // Check for new milestones first
    const newMilestones = await checkAndRecordMilestones(userId, stats);
    const summary = await buildRelationshipSummary(userId, stats);
    const sections = ['[RELATIONSHIP MILESTONES - Better Than Human Journey Awareness]'];
    sections.push("You remember every step of your journey together. Celebrate what you've built.");
    // Duration
    sections.push(`\n**Time Together:** ${summary.totalDays} days (${summary.totalConversations} conversations)`);
    sections.push(`**Trust Level:** ${summary.trustLevel.toUpperCase()}`);
    // New milestones to celebrate
    if (newMilestones.length > 0) {
        sections.push('\n🎉 **NEW MILESTONE REACHED:**');
        for (const m of newMilestones) {
            sections.push(`→ "${m.title}" - ${m.description}`);
        }
        sections.push('Acknowledge this naturally. Make them feel seen.');
    }
    // Unacknowledged milestones
    const unacknowledged = summary.milestonesReached.filter((m) => !m.acknowledged);
    if (unacknowledged.length > 0 && newMilestones.length === 0) {
        sections.push('\n**Celebrate When Natural:**');
        for (const m of unacknowledged.slice(0, 2)) {
            sections.push(`• ${m.title}: "${m.description}"`);
        }
    }
    // Journey reflection
    if (summary.totalDays > 90) {
        sections.push('\n**Journey Reflection:**');
        sections.push(`"Remember our first conversation? That was ${summary.totalDays} days ago. Look how far you've come."`);
    }
    // Next milestone
    if (summary.nextMilestone) {
        sections.push(`\n**Next Milestone:** ${summary.nextMilestone.description} (${summary.nextMilestone.progressPercent}% there)`);
    }
    return sections.join('\n');
}
// ============================================================================
// EXPORTS
// ============================================================================
export const relationshipMilestones = {
    checkAndRecord: checkAndRecordMilestones,
    recordSpecial: recordSpecialMilestone,
    acknowledge: acknowledgeMilestone,
    buildSummary: buildRelationshipSummary,
    buildContext: buildMilestoneContext,
};
//# sourceMappingURL=relationship-milestones.js.map