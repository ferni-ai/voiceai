/**
 * Conflict Replay Analysis - Better Than Human Service
 *
 * What no human friend can do: Objectively analyze your conflicts.
 *
 * "Let's replay that argument with your brother. When you said 'You always
 * do this,' that's when his tone shifted. That's a common escalation trigger.
 * If you'd said 'I noticed this happened again,' you might have kept him
 * engaged."
 *
 * @module tools/domains/communication/superhuman-tools/conflict-replay
 */
import { createLogger } from '../../../../utils/safe-logger.js';
import { getFirestoreDb, cleanForFirestore } from '../../../../services/superhuman/firestore-utils.js';
const log = createLogger({ module: 'conflict-replay' });
// ============================================================================
// CONSTANTS
// ============================================================================
const COLLECTION = 'conflict_records';
// ============================================================================
// ESCALATION PATTERNS
// ============================================================================
const ESCALATION_TRIGGERS = [
    {
        pattern: /\byou (always|never)\b/i,
        trigger: 'Absolutist language',
        suggestion: 'Replace with specific instances: "I noticed this happened on Tuesday"',
        escalationLevel: 7,
    },
    {
        pattern: /\byou('re| are) (just like|exactly like) (your|my)\b/i,
        trigger: 'Comparison to family member',
        suggestion: 'Keep the conversation about their specific behavior, not patterns',
        escalationLevel: 8,
    },
    {
        pattern: /\bwhatever\b/i,
        trigger: 'Dismissiveness',
        suggestion: 'Instead of dismissing, try: "I need a moment to process this"',
        escalationLevel: 6,
    },
    {
        pattern: /\bcalm down\b/i,
        trigger: 'Telling them to calm down',
        suggestion: 'This usually backfires. Try: "I can see this is really frustrating"',
        escalationLevel: 7,
    },
    {
        pattern: /\byou('re| are) (being|so) (dramatic|emotional|crazy|irrational)\b/i,
        trigger: 'Invalidating their emotions',
        suggestion: 'Validate first: "I can see you\'re really upset about this"',
        escalationLevel: 9,
    },
    {
        pattern: /\bi don('t|'t) (even )?care\b/i,
        trigger: 'Expressing indifference',
        suggestion: 'Even if frustrated, this signals you\'ve checked out',
        escalationLevel: 8,
    },
    {
        pattern: /\bfine,? (then|whatever|do what you want)\b/i,
        trigger: 'Passive-aggressive concession',
        suggestion: 'If you need to pause: "I need a break but I want to resolve this"',
        escalationLevel: 6,
    },
    {
        pattern: /\byou started (it|this)\b/i,
        trigger: 'Blame deflection',
        suggestion: 'Focus on resolution, not who started it',
        escalationLevel: 5,
    },
    {
        pattern: /\bforget it\b/i,
        trigger: 'Shutting down',
        suggestion: 'If you need to pause, be explicit: "I want to continue this later"',
        escalationLevel: 6,
    },
    {
        pattern: /\b(see|this is) why (i|we)\b/i,
        trigger: '"This is why" statements',
        suggestion: 'Sounds like you\'ve given up. Stay in problem-solving mode.',
        escalationLevel: 7,
    },
];
const DE_ESCALATION_PATTERNS = [
    {
        pattern: /\bi (hear|understand) (what you|that you)\b/i,
        effect: 'Acknowledgment',
        impact: -2,
    },
    {
        pattern: /\bhelp me understand\b/i,
        effect: 'Curiosity',
        impact: -3,
    },
    {
        pattern: /\byou('re| are) right (that|about)\b/i,
        effect: 'Validation',
        impact: -3,
    },
    {
        pattern: /\bi('m| am) sorry (that|for)\b/i,
        effect: 'Taking responsibility',
        impact: -2,
    },
    {
        pattern: /\bcan we (try|find|work)\b/i,
        effect: 'Collaborative language',
        impact: -2,
    },
    {
        pattern: /\bwhat do you need\b/i,
        effect: 'Focusing on their needs',
        impact: -3,
    },
];
// ============================================================================
// STORAGE
// ============================================================================
/**
 * Record a conflict for analysis.
 */
export async function recordConflict(userId, conflict) {
    const id = `conflict_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const fullRecord = {
        ...conflict,
        id,
        userId,
        recordedAt: Date.now(),
    };
    try {
        const db = getFirestoreDb();
        if (db) {
            await db
                .collection('bogle_users')
                .doc(userId)
                .collection(COLLECTION)
                .doc(id)
                .set(cleanForFirestore(fullRecord));
            log.info({
                userId,
                contactName: conflict.contactName,
                resolution: conflict.resolution,
            }, '⚔️ Conflict record saved');
        }
    }
    catch (error) {
        log.warn({ error: String(error), userId }, 'Failed to record conflict');
    }
    return fullRecord;
}
/**
 * Get conflict history with a specific person.
 */
export async function getConflictHistory(userId, contactName) {
    try {
        const db = getFirestoreDb();
        if (!db)
            return [];
        const snapshot = await db
            .collection('bogle_users')
            .doc(userId)
            .collection(COLLECTION)
            .where('contactName', '==', contactName)
            .orderBy('occurredAt', 'desc')
            .limit(20)
            .get();
        return snapshot.docs.map((doc) => doc.data());
    }
    catch (error) {
        log.warn({ error: String(error), userId, contactName }, 'Failed to get conflict history');
        return [];
    }
}
/**
 * Get all conflict records.
 */
export async function getAllConflicts(userId) {
    try {
        const db = getFirestoreDb();
        if (!db)
            return [];
        const snapshot = await db
            .collection('bogle_users')
            .doc(userId)
            .collection(COLLECTION)
            .orderBy('recordedAt', 'desc')
            .limit(30)
            .get();
        return snapshot.docs.map((doc) => doc.data());
    }
    catch (error) {
        log.warn({ error: String(error), userId }, 'Failed to get all conflicts');
        return [];
    }
}
/**
 * Analyze a transcript for escalation points.
 */
export function analyzeForEscalation(transcript) {
    const escalationPoints = [];
    const deEscalationMoments = [];
    // Find escalation triggers
    for (const { pattern, trigger, suggestion, escalationLevel } of ESCALATION_TRIGGERS) {
        const matches = transcript.match(new RegExp(pattern.source, 'gi'));
        if (matches) {
            for (const match of matches) {
                escalationPoints.push({
                    phrase: match,
                    trigger,
                    escalationLevel,
                    suggestion,
                });
            }
        }
    }
    // Find de-escalation moments
    for (const { pattern, effect } of DE_ESCALATION_PATTERNS) {
        const matches = transcript.match(new RegExp(pattern.source, 'gi'));
        if (matches) {
            for (const match of matches) {
                deEscalationMoments.push({ phrase: match, effect });
            }
        }
    }
    // Calculate overall risk
    const avgEscalation = escalationPoints.length > 0
        ? escalationPoints.reduce((sum, p) => sum + p.escalationLevel, 0) / escalationPoints.length
        : 0;
    const deEscalationBonus = deEscalationMoments.length * 1.5;
    const adjustedRisk = avgEscalation - deEscalationBonus;
    let overallRisk = 'low';
    if (adjustedRisk > 6)
        overallRisk = 'high';
    else if (adjustedRisk > 3)
        overallRisk = 'medium';
    // Generate suggestions
    const suggestions = [];
    const uniqueTriggers = Array.from(new Set(escalationPoints.map((p) => p.trigger)));
    for (const trigger of uniqueTriggers) {
        const point = escalationPoints.find((p) => p.trigger === trigger);
        if (point) {
            suggestions.push(`**${point.trigger}:** ${point.suggestion}`);
        }
    }
    return {
        escalationPoints,
        deEscalationMoments,
        overallRisk,
        suggestions: suggestions.slice(0, 5),
    };
}
/**
 * Reconstruct a conflict from a description with analysis.
 */
export function reconstructConflict(description, userPhrases, otherPhrases) {
    const timeline = [];
    const pivotPoints = [];
    const alternativeApproaches = [];
    // Analyze user phrases
    for (const phrase of userPhrases) {
        const analysis = analyzeForEscalation(phrase);
        if (analysis.escalationPoints.length > 0) {
            const point = analysis.escalationPoints[0];
            timeline.push({
                speaker: 'user',
                phrase,
                analysis: `⚠️ ${point.trigger}`,
                escalationRisk: point.escalationLevel,
            });
            pivotPoints.push(`When you said "${phrase}" - this may have triggered defensiveness.`);
            alternativeApproaches.push(`Instead of "${phrase}", try: ${point.suggestion}`);
        }
        else if (analysis.deEscalationMoments.length > 0) {
            timeline.push({
                speaker: 'user',
                phrase,
                analysis: `✅ ${analysis.deEscalationMoments[0].effect}`,
                escalationRisk: 0,
            });
        }
        else {
            timeline.push({ speaker: 'user', phrase });
        }
    }
    // Add other phrases without deep analysis (we don't control them)
    for (const phrase of otherPhrases) {
        timeline.push({ speaker: 'other', phrase });
    }
    // Generate key insight
    const highRiskPoints = timeline.filter((t) => t.speaker === 'user' && t.escalationRisk && t.escalationRisk >= 6);
    let keyInsight;
    if (highRiskPoints.length === 0) {
        keyInsight =
            'Your communication style in this conflict was relatively measured. Focus on understanding their perspective.';
    }
    else if (highRiskPoints.length === 1) {
        keyInsight = `The key moment was when you said "${highRiskPoints[0].phrase}". This likely shifted the conversation dynamic.`;
    }
    else {
        keyInsight = `Multiple escalation triggers detected. The conflict may have been fueled by language patterns rather than the underlying issue.`;
    }
    return {
        timeline,
        pivotPoints,
        alternativeApproaches,
        keyInsight,
    };
}
/**
 * Analyze patterns across conflicts with a person.
 */
export async function analyzeConflictPatterns(userId, contactName) {
    const history = await getConflictHistory(userId, contactName);
    if (history.length < 2)
        return null;
    // Count triggers
    const triggerCounts = new Map();
    const topicCounts = new Map();
    for (const conflict of history) {
        // Analyze each escalation point
        for (const point of conflict.escalationPoints) {
            const current = triggerCounts.get(point.what) || 0;
            triggerCounts.set(point.what, current + 1);
        }
        // Count topics
        const current = topicCounts.get(conflict.topic) || 0;
        topicCounts.set(conflict.topic, current + 1);
    }
    // Calculate resolution rate
    const resolved = history.filter((c) => c.resolution === 'resolved').length;
    const resolutionRate = resolved / history.length;
    // Sort triggers by frequency
    const recurringTriggers = Array.from(triggerCounts.entries())
        .map(([trigger, count]) => ({ trigger, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);
    // Common topics
    const commonTopics = Array.from(topicCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([topic]) => topic);
    // Generate recommendations
    const recommendations = [];
    if (recurringTriggers.length > 0) {
        recommendations.push(`Your conflicts with ${contactName} often involve "${recurringTriggers[0].trigger}". Working on this pattern could reduce friction.`);
    }
    if (resolutionRate < 0.5) {
        recommendations.push(`Only ${Math.round(resolutionRate * 100)}% of conflicts with ${contactName} reach resolution. Consider new approaches.`);
    }
    if (commonTopics.length > 0) {
        recommendations.push(`${commonTopics[0]} is a recurring conflict topic. Is there an underlying issue that needs addressing?`);
    }
    return {
        totalConflicts: history.length,
        recurringTriggers,
        resolutionRate,
        commonTopics,
        recommendations,
    };
}
// ============================================================================
// CONTEXT BUILDING
// ============================================================================
/**
 * Build conflict analysis context for LLM.
 */
export async function buildConflictContext(userId, contactName) {
    if (contactName) {
        const patterns = await analyzeConflictPatterns(userId, contactName);
        if (!patterns || patterns.totalConflicts < 2) {
            return `[CONFLICT REPLAY - ${contactName}]\nNot enough conflict history to analyze patterns yet.`;
        }
        const sections = [
            `[CONFLICT PATTERNS - ${contactName}]`,
            `Total conflicts: ${patterns.totalConflicts}`,
            `Resolution rate: ${Math.round(patterns.resolutionRate * 100)}%`,
        ];
        if (patterns.recurringTriggers.length > 0) {
            sections.push('\n**Recurring Triggers:**');
            for (const { trigger, count } of patterns.recurringTriggers.slice(0, 3)) {
                sections.push(`• ${trigger} (${count}x)`);
            }
        }
        if (patterns.commonTopics.length > 0) {
            sections.push(`\n**Common conflict topics:** ${patterns.commonTopics.join(', ')}`);
        }
        if (patterns.recommendations.length > 0) {
            sections.push('\n**Recommendations:**');
            for (const rec of patterns.recommendations) {
                sections.push(`• ${rec}`);
            }
        }
        return sections.join('\n');
    }
    // General conflict analysis
    const allConflicts = await getAllConflicts(userId);
    if (allConflicts.length < 2) {
        return '';
    }
    const sections = [
        '[CONFLICT REPLAY ANALYSIS - Better Than Human]',
        'You analyze conflicts objectively, identifying triggers and alternatives.',
    ];
    // Group by contact
    const byContact = new Map();
    for (const conflict of allConflicts) {
        const existing = byContact.get(conflict.contactName) || [];
        existing.push(conflict);
        byContact.set(conflict.contactName, existing);
    }
    sections.push('\n**Conflict History:**');
    for (const [name, conflicts] of Array.from(byContact.entries())) {
        const resolved = conflicts.filter((c) => c.resolution === 'resolved').length;
        sections.push(`• ${name}: ${conflicts.length} conflicts, ${resolved} resolved`);
    }
    sections.push('\n**When discussing a conflict, offer to replay and analyze it objectively.**');
    return sections.join('\n');
}
/**
 * Generate a replay analysis prompt.
 */
export function generateReplayPrompt(conflictSummary) {
    return `Let's replay this conflict objectively. Tell me:

1. **What happened** - Just the facts
2. **What you said** - Your exact words, as best you remember
3. **What they said** - Their words
4. **Where it escalated** - The moment things shifted

I'll help you see:
- Escalation triggers you might have missed
- What could have been said differently
- The underlying issue that may not have been addressed

No judgment - just analysis. Ready?`;
}
// ============================================================================
// EXPORTS
// ============================================================================
export const conflictReplay = {
    record: recordConflict,
    getHistory: getConflictHistory,
    getAll: getAllConflicts,
    analyzeEscalation: analyzeForEscalation,
    reconstruct: reconstructConflict,
    analyzePatterns: analyzeConflictPatterns,
    buildContext: buildConflictContext,
    generatePrompt: generateReplayPrompt,
};
export default conflictReplay;
//# sourceMappingURL=conflict-replay.js.map