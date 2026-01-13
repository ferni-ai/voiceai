/**
 * First-Time Celebration Insight Generator
 *
 * Generates insights that celebrate growth since a first disclosure:
 * - "A month ago you told me about your anxiety for the first time"
 * - "This is the first time you've said 'I deserve better'"
 * - "Remember when you couldn't even name that fear? Now look."
 *
 * We honor the journey from first vulnerability to ongoing openness.
 *
 * @module services/superhuman/insight-generation/generators/first-time-celebration
 */
import { createLogger } from '../../../../utils/safe-logger.js';
import { registerInsightGenerator } from '../engine.js';
const log = createLogger({ module: 'insight-gen:first-time' });
// ============================================================================
// TEMPLATES
// ============================================================================
const FIRST_TIME_TEMPLATES = {
    anniversary: [
        "{timeAgo}, you told me about {topic} for the first time. Since then, you've opened up about it {count} more times. That took courage.",
        "It's been {timeAgo} since you first shared about {topic}. Look how far you've come—you talk about it differently now.",
        "I want to mark something: {timeAgo} you trusted me with {topic} for the first time. That trust has grown into {count} more conversations. Thank you.",
    ],
    recent_first: [
        "This is the first time you've said that out loud. I heard it. Thank you for trusting me with this.",
        "That's new—you haven't said that before. It landed. I'm glad you felt safe enough to say it.",
        "I noticed that's the first time you've named that. That's significant. How does it feel to say it?",
    ],
    growth_since: [
        "Remember when you couldn't even {past}? Now you're {present}. That's real growth.",
        "You went from {past} to {present}. I've watched that transformation.",
        "When we first talked about {topic}, {past}. Now? {present}. You've done the work.",
    ],
    depth_increase: [
        "You're going deeper with {topic}. The first time it came up, you could barely touch it. Now you're really sitting with it.",
        "I've noticed you can stay with {topic} longer now. Before, you'd pull back quickly. That's different.",
        "The way you're engaging with {topic} has shifted. There's more willingness to be in it.",
    ],
    new_language: [
        "That word—'{word}'—that's new for you. You've never used that to describe yourself before.",
        "You just named something you've never named before. '{word}.' That's a breakthrough.",
        "I heard you say '{word}.' That's the first time. Words matter. What made it possible to say now?",
    ],
};
// Significant vulnerability markers
const VULNERABILITY_MARKERS = [
    { pattern: /i('ve)?\s+never\s+told\s+anyone/i, type: 'recent_first', depth: 'profound' },
    { pattern: /this\s+is\s+(the\s+)?first\s+time/i, type: 'recent_first', depth: 'deep' },
    { pattern: /i('ve)?\s+never\s+said\s+this/i, type: 'recent_first', depth: 'deep' },
    { pattern: /for\s+the\s+first\s+time/i, type: 'recent_first', depth: 'moderate' },
    { pattern: /i\s+deserve\s+better/i, type: 'new_language', depth: 'deep' },
    { pattern: /i('m)?\s+proud\s+of\s+(myself|me)/i, type: 'new_language', depth: 'deep' },
    { pattern: /i\s+love\s+myself/i, type: 'new_language', depth: 'profound' },
    { pattern: /it'?s?\s+not\s+my\s+fault/i, type: 'new_language', depth: 'deep' },
    { pattern: /i\s+can\s+do\s+this/i, type: 'new_language', depth: 'moderate' },
];
// Words that indicate self-compassion breakthroughs
const SELF_COMPASSION_WORDS = [
    'deserve', 'worthy', 'enough', 'proud', 'loved', 'valid',
    'boundaries', 'self-care', 'healing', 'forgiving myself',
];
async function detectFirstTimeMoments(userId, context) {
    const moments = [];
    try {
        const currentText = context.currentTopic || '';
        // Check current text for vulnerability markers
        for (const marker of VULNERABILITY_MARKERS) {
            if (marker.pattern.test(currentText)) {
                moments.push({
                    type: marker.type,
                    topic: extractTopic(currentText),
                    firstDate: new Date(),
                    daysSince: 0,
                    subsequentCount: 0,
                    depth: marker.depth,
                    newWord: marker.type === 'new_language' ? extractNewWord(currentText) : undefined,
                });
                break; // Only one first-time detection per turn
            }
        }
        // Check for self-compassion language
        for (const word of SELF_COMPASSION_WORDS) {
            if (currentText.toLowerCase().includes(word)) {
                // This might be a first-time use
                moments.push({
                    type: 'new_language',
                    topic: 'self-compassion',
                    firstDate: new Date(),
                    daysSince: 0,
                    subsequentCount: 0,
                    depth: 'deep',
                    newWord: word,
                });
                break;
            }
        }
        // Add historical first-time anniversaries (would come from storage in production)
        // For now, simulate based on session data
        if (context.isSessionStart) {
            // Check if we should surface an anniversary insight
            // This would query stored first-disclosure data in production
        }
    }
    catch (error) {
        log.debug({ error: String(error), userId }, 'Error detecting first-time moments');
    }
    return moments.slice(0, 1); // Max 1 per turn - these are precious
}
function extractTopic(text) {
    // Extract the core topic from the statement
    const cleaned = text
        .replace(/i('ve)?\s+never\s+told\s+anyone/i, '')
        .replace(/this\s+is\s+(the\s+)?first\s+time/i, '')
        .replace(/but/i, '')
        .trim();
    return cleaned.slice(0, 50) || 'this';
}
function extractNewWord(text) {
    // Extract the significant word/phrase
    for (const word of SELF_COMPASSION_WORDS) {
        if (text.toLowerCase().includes(word)) {
            return word;
        }
    }
    const match = text.match(/"([^"]+)"|'([^']+)'/);
    if (match) {
        return match[1] || match[2];
    }
    return text.slice(0, 20);
}
// ============================================================================
// GENERATOR
// ============================================================================
async function generateFirstTimeInsights(userId, context) {
    const insights = [];
    try {
        const moments = await detectFirstTimeMoments(userId, context);
        for (const moment of moments) {
            const insight = buildFirstTimeInsight(moment, userId);
            if (insight) {
                insights.push(insight);
            }
        }
    }
    catch (error) {
        log.warn({ error: String(error), userId }, 'Failed to generate first-time insights');
    }
    return insights;
}
function buildFirstTimeInsight(data, userId) {
    const templates = FIRST_TIME_TEMPLATES[data.type];
    if (!templates || templates.length === 0) {
        return null;
    }
    let message = templates[Math.floor(Math.random() * templates.length)];
    const timeAgo = formatTimeAgo(data.daysSince);
    // Replace placeholders
    message = message
        .replace(/{topic}/g, data.topic)
        .replace(/{timeAgo}/g, timeAgo)
        .replace(/{count}/g, String(data.subsequentCount))
        .replace(/{word}/g, data.newWord || 'that')
        .replace(/{past}/g, data.growthDescription?.past || 'barely touch this')
        .replace(/{present}/g, data.growthDescription?.present || 'engage with it fully');
    const depthPriority = {
        surface: 'low',
        moderate: 'medium',
        deep: 'high',
        profound: 'critical',
    };
    return {
        id: `first_time_${data.type}_${Date.now()}`,
        userId,
        category: 'first_time_celebration',
        priority: depthPriority[data.depth] || 'medium',
        headline: data.type === 'recent_first'
            ? 'First time disclosure'
            : data.type === 'new_language'
                ? `New self-talk: "${data.newWord}"`
                : `${data.topic} anniversary`,
        message,
        evidence: [
            data.daysSince === 0 ? 'Just now' : `First shared: ${timeAgo}`,
            data.subsequentCount > 0 ? `Mentioned ${data.subsequentCount} times since` : '',
            `Depth: ${data.depth}`,
        ].filter(Boolean),
        surfacingMoment: data.daysSince === 0 ? 'natural_pause' : 'session_start',
        tone: 'celebratory',
        triggerTopics: [data.topic, data.newWord].filter(Boolean),
        confidence: data.depth === 'profound' || data.depth === 'deep' ? 0.9 : 0.75,
        dataPoints: 1 + data.subsequentCount,
        generatedAt: new Date(),
        surfaced: false,
        dismissed: false,
    };
}
function formatTimeAgo(days) {
    if (days === 0)
        return 'just now';
    if (days === 1)
        return 'yesterday';
    if (days < 7)
        return `${days} days ago`;
    if (days < 14)
        return 'about a week ago';
    if (days < 30)
        return 'a few weeks ago';
    if (days < 45)
        return 'about a month ago';
    if (days < 60)
        return 'over a month ago';
    if (days < 90)
        return 'a couple months ago';
    return `about ${Math.floor(days / 30)} months ago`;
}
async function hasEnoughData(_userId) {
    // First-time detection works in real-time from context
    return true;
}
// ============================================================================
// REGISTRATION
// ============================================================================
const firstTimeCelebrationGenerator = {
    category: 'first_time_celebration',
    name: 'First-Time Celebration Generator',
    description: 'Honors first disclosures and celebrates growth since',
    generate: generateFirstTimeInsights,
    hasEnoughData,
};
registerInsightGenerator(firstTimeCelebrationGenerator);
export { firstTimeCelebrationGenerator };
//# sourceMappingURL=first-time-celebration.js.map