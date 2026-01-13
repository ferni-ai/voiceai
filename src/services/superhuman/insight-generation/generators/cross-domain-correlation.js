/**
 * Cross-Domain Correlation Insight Generator
 *
 * Generates insights that connect dots across life domains that humans miss:
 * - "Your sleep drops whenever you mention your boss"
 * - "Your mood lifts after conversations about music"
 * - "Work stress and relationship tension seem connected"
 *
 * @module services/superhuman/insight-generation/generators/cross-domain-correlation
 */
import { createLogger } from '../../../../utils/safe-logger.js';
import { getRelevantCorrelations } from '../../semantic-intelligence/correlation-mining.js';
import { registerInsightGenerator } from '../engine.js';
const log = createLogger({ module: 'insight-gen:correlation' });
// ============================================================================
// TEMPLATES
// ============================================================================
const CORRELATION_TEMPLATES = {
    positive: {
        sleep_stress: [
            "I've noticed your sleep tends to suffer when work stress comes up. The last few times you mentioned feeling overwhelmed at work, sleep was harder within a day or two.",
            "There seems to be a pattern: when work pressure builds, your sleep takes a hit. Your body might be telling you something.",
        ],
        mood_topic: [
            "I've noticed you light up when we talk about {topic}. Your energy shifts - it's like you come alive.",
            "Something I keep seeing: discussions about {topic} seem to lift your mood. Maybe there's something there worth exploring?",
        ],
        person_emotion: [
            "Interesting pattern: when {person} comes up, you often seem {emotion}. Is that how they make you feel?",
            "I've noticed that talking about {person} tends to bring out {emotion} in you. Worth paying attention to?",
        ],
        activity_energy: [
            "Your energy seems to spike after {activity}. Every time it comes up, there's a shift.",
            "There's a clear pattern: {activity} gives you energy. Your voice gets brighter, your pace picks up.",
        ],
    },
    negative: {
        sleep_stress: [
            "I see a tough pattern: sleep struggles and stress seem to feed each other for you. When one gets worse, the other follows.",
            "Your sleep and stress levels seem connected in a challenging way. It's like they're in a cycle together.",
        ],
        mood_topic: [
            "I've noticed your energy tends to drop when {topic} comes up. It's like a weight settles in.",
            "There's a pattern worth naming: {topic} seems to bring your mood down. Have you noticed that?",
        ],
        person_emotion: [
            "When {person} comes up, I often sense {emotion}. That's been consistent across our conversations.",
            "I've noticed that mentions of {person} tend to bring {emotion}. Is that relationship feeling heavy right now?",
        ],
    },
};
// ============================================================================
// GENERATOR
// ============================================================================
async function generateCorrelationInsights(userId, context) {
    const insights = [];
    try {
        // Get correlations from semantic intelligence
        const correlations = await getRelevantCorrelations(userId, {
            currentTopics: context.recentTopics,
            currentEmotion: context.currentEmotion,
        });
        if (!correlations || correlations.length === 0) {
            return [];
        }
        for (const correlation of correlations.slice(0, 3)) {
            const insight = buildCorrelationInsight(correlation, context);
            if (insight) {
                insights.push(insight);
            }
        }
    }
    catch (error) {
        log.warn({ error: String(error), userId }, 'Failed to generate correlation insights');
    }
    return insights;
}
function buildCorrelationInsight(correlation, context) {
    const { domainA, domainB, strength, observationCount, coOccurrences } = correlation;
    if (observationCount < 3 || strength < 0.5) {
        return null; // Not enough confidence
    }
    const domain1 = String(domainA.type);
    const domain2 = String(domainB.type);
    const pattern1 = domainA.pattern;
    const pattern2 = domainB.pattern;
    // Determine if correlation is positive or negative based on patterns
    const sleepPattern = pattern1.toLowerCase().includes('sleep') || pattern2.toLowerCase().includes('sleep');
    const stressPattern = pattern1.toLowerCase().includes('stress') || pattern2.toLowerCase().includes('stress');
    const isNegative = (sleepPattern && stressPattern) ||
        pattern1.toLowerCase().includes('avoid') || pattern2.toLowerCase().includes('avoid');
    // Select template based on domains
    const templates = isNegative ? CORRELATION_TEMPLATES.negative : CORRELATION_TEMPLATES.positive;
    let template;
    let headline;
    let triggerTopics = [];
    // Match to template based on patterns rather than domain types
    if (sleepPattern && stressPattern) {
        template = templates.sleep_stress[Math.floor(Math.random() * templates.sleep_stress.length)];
        headline = 'Sleep-stress connection detected';
        triggerTopics = ['sleep', 'stress', 'work', 'tired', 'insomnia'];
    }
    else if (domain1 === 'person' || domain2 === 'person') {
        const personTemplates = templates.person_emotion || templates.mood_topic;
        template = personTemplates[Math.floor(Math.random() * personTemplates.length)];
        template = template.replace('{person}', pattern1 || pattern2);
        template = template.replace('{emotion}', domain1 === 'person' ? pattern2 : pattern1);
        headline = `${pattern1 || pattern2} affects your mood`;
        triggerTopics = [pattern1, pattern2].filter(Boolean);
    }
    else if (domain1 === 'topic' || domain2 === 'topic') {
        template = templates.mood_topic[Math.floor(Math.random() * templates.mood_topic.length)];
        template = template.replace('{topic}', pattern1 || pattern2);
        headline = `${pattern1 || pattern2} impacts your energy`;
        triggerTopics = [pattern1, pattern2].filter(Boolean);
    }
    else {
        // Generic correlation
        template = `I've noticed a pattern: ${pattern1} and ${pattern2} seem to move together for you. ${isNegative ? "When one's up, the other tends to be down." : "When one's up, the other often is too."}`;
        headline = `${pattern1}-${pattern2} correlation`;
        triggerTopics = [pattern1, pattern2].filter(Boolean);
    }
    return {
        id: `correlation_${domain1}_${domain2}_${Date.now()}`,
        userId: context.userId || 'unknown',
        category: 'cross_domain_correlation',
        priority: strength > 0.7 ? 'high' : 'medium',
        headline,
        message: template,
        evidence: coOccurrences
            ? coOccurrences.slice(0, 3).map((e) => `${e.contextSnippet?.slice(0, 30) || pattern1} ↔ ${pattern2}`)
            : [],
        surfacingMoment: 'natural_pause',
        tone: isNegative ? 'protective_care' : 'warm_observation',
        triggerTopics,
        confidence: strength,
        dataPoints: observationCount,
        generatedAt: new Date(),
        surfaced: false,
        dismissed: false,
    };
}
async function hasEnoughData(userId) {
    try {
        const correlations = await getRelevantCorrelations(userId, {});
        return correlations.length >= 1;
    }
    catch {
        return false;
    }
}
// ============================================================================
// REGISTRATION
// ============================================================================
const crossDomainCorrelationGenerator = {
    category: 'cross_domain_correlation',
    name: 'Cross-Domain Correlation Generator',
    description: 'Detects and surfaces patterns across life domains',
    generate: generateCorrelationInsights,
    hasEnoughData,
};
registerInsightGenerator(crossDomainCorrelationGenerator);
export { crossDomainCorrelationGenerator };
//# sourceMappingURL=cross-domain-correlation.js.map