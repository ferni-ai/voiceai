/**
 * Unspoken Awareness Insight Generator
 *
 * Generates insights about what the user is NOT saying:
 * - "You haven't mentioned X in weeks"
 * - "You deflected when I asked about Y"
 * - "That topic went quiet suddenly"
 *
 * This is uniquely "Better Than Human" - we notice absences that friends miss.
 *
 * @module services/superhuman/insight-generation/generators/unspoken-awareness
 */
import { createLogger } from '../../../../utils/safe-logger.js';
import { getAllCommitments } from '../../semantic-intelligence/ferni-commitments.js';
import { registerInsightGenerator } from '../engine.js';
const log = createLogger({ module: 'insight-gen:unspoken' });
// ============================================================================
// TEMPLATES
// ============================================================================
const UNSPOKEN_TEMPLATES = {
    topic_went_silent: [
        "You mentioned {topic} {timeAgo}, and I haven't heard about it since. No pressure—just want you to know I remember.",
        "{topic} hasn't come up in a while. Last time we talked about it was {timeAgo}. Is everything okay with that, or did it resolve?",
        "I noticed {topic} went quiet. You brought it up {timeAgo} but nothing since. Sometimes silence means it's handled; sometimes it means it's too heavy. Which is it?",
    ],
    deflection_pattern: [
        "I've noticed you tend to steer away from {topic}. That's happened {count} times now. I'm not going to push, but I'm here when you're ready.",
        "Every time {topic} comes up, the conversation shifts. I'm respecting that space, but I want you to know—whenever you want to go there, I'm ready.",
        "You've deflected from {topic} a few times. That's totally okay. I just want you to know I notice, and I'm holding space for whenever you want to talk about it.",
    ],
    person_silence: [
        "You haven't mentioned {person} in {days} days. Last time they came up, there was some tension. How are things?",
        "{person} hasn't come up lately. I remember things were complicated last time. Is that still weighing on you?",
        "I realized we haven't talked about {person} in a while. Everything okay there?",
    ],
    sudden_drop: [
        "{topic} used to come up a lot—you mentioned it {previousCount} times in one month. Then... silence. What changed?",
        "There's been a shift: {topic} went from something you talked about regularly to something that doesn't come up anymore. Want to explore that?",
    ],
    avoided_followup: [
        "Last time, you said you'd update me about {topic}. I haven't heard back on that. No rush—just holding that thread.",
        "You mentioned wanting to talk more about {topic} next time. We never did. Is now a good time, or should I keep holding it?",
    ],
};
async function getTopicSilences(userId) {
    const silences = [];
    try {
        // Get all commitments and filter for avoidance types
        const allCommitments = await getAllCommitments(userId);
        const avoidances = allCommitments.filter((c) => c.type === 'avoid' && !c.fulfilled && !c.violated);
        for (const avoidance of avoidances) {
            // Calculate days since commitment was made (as proxy for last mention)
            const lastMentioned = avoidance.madeAt ? new Date(avoidance.madeAt) : new Date();
            const daysSilent = Math.floor((Date.now() - lastMentioned.getTime()) / (24 * 60 * 60 * 1000));
            // Only surface if significant silence (> 7 days)
            if (daysSilent >= 7) {
                const topic = avoidance.relatedTopic || avoidance.context || avoidance.commitment;
                silences.push({
                    topic,
                    lastMentioned,
                    daysSilent,
                    previousMentionCount: 1, // From the commitment itself
                    wasDeflected: avoidance.type === 'avoid',
                    deflectionCount: 1,
                    relatedPerson: avoidance.relatedPerson,
                    sensitivity: 'medium',
                });
            }
        }
    }
    catch (error) {
        log.debug({ error: String(error), userId }, 'Error fetching topic silences');
    }
    return silences;
}
// ============================================================================
// GENERATOR
// ============================================================================
async function generateUnspokenInsights(userId, context) {
    const insights = [];
    try {
        const silences = await getTopicSilences(userId);
        for (const silence of silences.slice(0, 2)) {
            const insight = buildUnspokenInsight(silence, userId);
            if (insight) {
                insights.push(insight);
            }
        }
    }
    catch (error) {
        log.warn({ error: String(error), userId }, 'Failed to generate unspoken insights');
    }
    return insights;
}
function buildUnspokenInsight(data, userId) {
    let templates;
    let headline;
    let tone;
    let priority;
    // Select template based on pattern
    if (data.wasDeflected && data.deflectionCount >= 2) {
        templates = UNSPOKEN_TEMPLATES.deflection_pattern;
        headline = `Deflection pattern on "${data.topic}"`;
        tone = 'gentle_curiosity';
        priority = 'medium';
    }
    else if (data.relatedPerson) {
        templates = UNSPOKEN_TEMPLATES.person_silence;
        headline = `${data.relatedPerson} hasn't come up`;
        tone = 'protective_care';
        priority = 'medium';
    }
    else if (data.previousMentionCount >= 5 && data.daysSilent >= 14) {
        templates = UNSPOKEN_TEMPLATES.sudden_drop;
        headline = `"${data.topic}" went silent`;
        tone = 'gentle_curiosity';
        priority = 'high';
    }
    else {
        templates = UNSPOKEN_TEMPLATES.topic_went_silent;
        headline = `Haven't heard about "${data.topic}"`;
        tone = 'warm_observation';
        priority = data.sensitivity === 'high' ? 'medium' : 'low';
    }
    const template = templates[Math.floor(Math.random() * templates.length)];
    // Format template
    const timeAgo = formatTimeAgo(data.daysSilent);
    const message = template
        .replace(/{topic}/g, data.topic)
        .replace(/{timeAgo}/g, timeAgo)
        .replace(/{days}/g, String(data.daysSilent))
        .replace(/{count}/g, String(data.deflectionCount))
        .replace(/{previousCount}/g, String(data.previousMentionCount))
        .replace(/{person}/g, data.relatedPerson || 'them');
    return {
        id: `unspoken_${data.topic.replace(/\s+/g, '_')}_${Date.now()}`,
        userId,
        category: 'unspoken_awareness',
        priority,
        headline,
        message,
        evidence: [
            `Last mentioned: ${timeAgo}`,
            `Previous frequency: ${data.previousMentionCount} mentions`,
            data.deflectionCount > 0 ? `Deflected ${data.deflectionCount} times` : '',
        ].filter(Boolean),
        surfacingMoment: 'natural_pause',
        tone,
        triggerTopics: [data.topic, data.relatedPerson].filter(Boolean),
        confidence: data.deflectionCount > 0 ? 0.85 : 0.7,
        dataPoints: data.previousMentionCount + data.deflectionCount,
        generatedAt: new Date(),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // Expire in 7 days
        surfaced: false,
        dismissed: false,
    };
}
function formatTimeAgo(days) {
    if (days < 7)
        return `${days} days ago`;
    if (days < 14)
        return 'about a week ago';
    if (days < 21)
        return 'a couple weeks ago';
    if (days < 30)
        return 'about three weeks ago';
    if (days < 45)
        return 'about a month ago';
    if (days < 60)
        return 'over a month ago';
    return `about ${Math.floor(days / 30)} months ago`;
}
async function hasEnoughData(userId) {
    try {
        const allCommitments = await getAllCommitments(userId);
        const avoidances = allCommitments.filter((c) => c.type === 'avoid' && !c.fulfilled && !c.violated);
        return avoidances.length >= 1;
    }
    catch {
        return false;
    }
}
// ============================================================================
// REGISTRATION
// ============================================================================
const unspokenAwarenessGenerator = {
    category: 'unspoken_awareness',
    name: 'Unspoken Awareness Generator',
    description: "Notices what the user ISN'T saying and surfaces it gently",
    generate: generateUnspokenInsights,
    hasEnoughData,
};
registerInsightGenerator(unspokenAwarenessGenerator);
export { unspokenAwarenessGenerator };
//# sourceMappingURL=unspoken-awareness.js.map