/**
 * Social Connection Alerts
 *
 * > "You haven't mentioned [best friend] in 3 weeks.
 * > Usually you talk about them weekly. Everything okay there?"
 *
 * Tracks mention frequency of important people to detect
 * potential relationship neglect before it becomes a problem.
 *
 * @module PredictiveInsights/SocialConnection
 */
import { createLogger } from '../../utils/safe-logger.js';
const log = createLogger({ module: 'SocialConnection' });
// ============================================================================
// STORAGE
// ============================================================================
const userSocialGraphs = new Map();
const MAX_MENTIONS = 100;
// ============================================================================
// EXPECTED FREQUENCIES
// ============================================================================
/**
 * Expected mention frequency by relationship type (days between mentions)
 * These are defaults - actual user patterns may differ
 */
const EXPECTED_FREQUENCY = {
    partner: 3, // Every few days
    family: 7, // Weekly
    close_friend: 10, // Every week or two
    friend: 21, // Every few weeks
    colleague: 14, // Every couple weeks
    acquaintance: 60, // Monthly or less
};
/**
 * Alert thresholds (multiples of usual frequency)
 */
const ALERT_THRESHOLDS = {
    minor: 1.5, // 1.5x usual frequency
    moderate: 2.0, // 2x usual frequency
    significant: 3.0, // 3x usual frequency
};
// ============================================================================
// MAIN CHECK FUNCTION
// ============================================================================
/**
 * Check for neglected social connections
 */
export async function checkSocialConnections(userId) {
    const socialGraph = userSocialGraphs.get(userId);
    if (!socialGraph || socialGraph.size === 0) {
        return [];
    }
    const alerts = [];
    const now = Date.now();
    for (const [personId, person] of socialGraph) {
        // Need at least 3 mentions to establish pattern
        if (person.mentions.length < 3)
            continue;
        // Calculate usual frequency
        const usualFrequency = calculateUsualFrequency(person);
        // Calculate days since last mention
        const lastMention = person.mentions[person.mentions.length - 1];
        const daysSinceLastMention = Math.floor((now - lastMention.timestamp.getTime()) / (24 * 60 * 60 * 1000));
        // Check if this is a significant gap
        const gapRatio = daysSinceLastMention / usualFrequency;
        if (gapRatio >= ALERT_THRESHOLDS.minor) {
            const alert = createAlert(userId, person, daysSinceLastMention, usualFrequency, gapRatio);
            alerts.push(alert);
        }
    }
    // Sort by severity and importance
    alerts.sort((a, b) => {
        const severityOrder = { significant: 3, moderate: 2, minor: 1 };
        const severityDiff = severityOrder[b.severity] - severityOrder[a.severity];
        if (severityDiff !== 0)
            return severityDiff;
        // Higher importance first
        const personA = socialGraph.get(a.personId);
        const personB = socialGraph.get(b.personId);
        return (personB?.importance || 0) - (personA?.importance || 0);
    });
    return alerts;
}
function createAlert(userId, person, daysSinceLastMention, usualFrequency, gapRatio) {
    // Determine severity
    let severity = 'minor';
    if (gapRatio >= ALERT_THRESHOLDS.significant) {
        severity = 'significant';
    }
    else if (gapRatio >= ALERT_THRESHOLDS.moderate) {
        severity = 'moderate';
    }
    // Adjust severity based on relationship type
    if (person.relationshipType === 'partner' && gapRatio >= 1.5) {
        severity = 'significant'; // Partner gaps are always significant
    }
    // Generate message
    const { message, suggestion } = generateSocialMessage(person.name, person.relationshipType, daysSinceLastMention, usualFrequency, severity);
    // Calculate confidence
    const confidence = calculateConfidence(person.mentions.length, gapRatio);
    // Should surface for moderate+ severity on important relationships
    const shouldSurface = (severity !== 'minor' && person.importance >= 0.5) || severity === 'significant';
    return {
        userId,
        personId: person.id,
        personName: person.name,
        daysSinceLastMention,
        usualFrequency,
        relationshipType: person.relationshipType,
        severity,
        message,
        suggestion,
        confidence,
        shouldSurface,
    };
}
// ============================================================================
// ANALYSIS FUNCTIONS
// ============================================================================
function calculateUsualFrequency(person) {
    // If we've calculated before and have recent data, use that
    if (person.avgDaysBetweenMentions) {
        return person.avgDaysBetweenMentions;
    }
    // Calculate from mentions
    const { mentions } = person;
    if (mentions.length < 2) {
        return EXPECTED_FREQUENCY[person.relationshipType];
    }
    // Calculate average gap between mentions
    let totalGapDays = 0;
    for (let i = 1; i < mentions.length; i++) {
        const gap = (mentions[i].timestamp.getTime() - mentions[i - 1].timestamp.getTime()) /
            (24 * 60 * 60 * 1000);
        totalGapDays += gap;
    }
    const avgGap = totalGapDays / (mentions.length - 1);
    // Blend with expected frequency (don't stray too far from type defaults)
    const expected = EXPECTED_FREQUENCY[person.relationshipType];
    const blended = avgGap * 0.7 + expected * 0.3;
    person.avgDaysBetweenMentions = blended;
    return blended;
}
function generateSocialMessage(name, relationshipType, daysSince, usualFrequency, severity) {
    const weeks = Math.floor(daysSince / 7);
    const frequencyDesc = usualFrequency <= 7 ? 'weekly' : usualFrequency <= 14 ? 'every week or two' : 'regularly';
    let message = '';
    let suggestion = '';
    switch (severity) {
        case 'significant':
            if (relationshipType === 'partner') {
                message = `I haven't heard you mention ${name} in ${weeks} weeks. Is everything okay?`;
                suggestion = 'That feels like a long time for a partner. Want to talk about it?';
            }
            else {
                message = `You haven't mentioned ${name} in ${weeks} weeks. Usually you talk about them ${frequencyDesc}.`;
                suggestion = `Have you checked in with them lately?`;
            }
            break;
        case 'moderate':
            message = `It's been a while since you mentioned ${name}. About ${weeks > 1 ? `${weeks} weeks` : `${daysSince} days`}.`;
            if (relationshipType === 'close_friend' || relationshipType === 'family') {
                suggestion = `Might be worth a quick text to see how they're doing.`;
            }
            else {
                suggestion = `Everything okay there?`;
            }
            break;
        case 'minor':
        default:
            message = `Just noticing - ${name} hasn't come up in our conversations lately.`;
            suggestion = `Might be nothing, or might be worth thinking about.`;
    }
    return { message, suggestion };
}
function calculateConfidence(mentionCount, gapRatio) {
    let confidence = 0.3;
    // More mentions = more confidence in pattern
    if (mentionCount >= 20)
        confidence += 0.3;
    else if (mentionCount >= 10)
        confidence += 0.2;
    else if (mentionCount >= 5)
        confidence += 0.1;
    // Larger gap ratio = more confidence this is real
    if (gapRatio >= 3)
        confidence += 0.2;
    else if (gapRatio >= 2)
        confidence += 0.1;
    return Math.min(confidence, 0.85);
}
// ============================================================================
// DATA COLLECTION
// ============================================================================
/**
 * Record a mention of a person
 */
export function recordPersonMention(userId, personName, relationshipType, context = '', sentiment = 0) {
    let graph = userSocialGraphs.get(userId);
    if (!graph) {
        graph = new Map();
        userSocialGraphs.set(userId, graph);
    }
    const personId = personName.toLowerCase().replace(/\s+/g, '_');
    let person = graph.get(personId);
    if (!person) {
        person = {
            id: personId,
            name: personName,
            relationshipType,
            mentions: [],
            importance: relationshipType === 'partner'
                ? 1.0
                : relationshipType === 'family'
                    ? 0.8
                    : relationshipType === 'close_friend'
                        ? 0.7
                        : 0.5,
        };
        graph.set(personId, person);
    }
    person.mentions.push({
        timestamp: new Date(),
        context,
        sentiment,
    });
    // Recalculate importance based on mention frequency
    if (person.mentions.length >= 5) {
        const recentMentions = person.mentions.slice(-20);
        const timeSpan = recentMentions.length > 1
            ? (recentMentions[recentMentions.length - 1].timestamp.getTime() -
                recentMentions[0].timestamp.getTime()) /
                (24 * 60 * 60 * 1000)
            : 1;
        const frequency = recentMentions.length / Math.max(timeSpan, 1); // mentions per day
        // Higher frequency = higher importance (capped by relationship type)
        const frequencyBoost = Math.min(0.3, frequency * 0.1);
        const typeMax = relationshipType === 'partner'
            ? 1.0
            : relationshipType === 'family'
                ? 0.9
                : relationshipType === 'close_friend'
                    ? 0.85
                    : 0.7;
        person.importance = Math.min(typeMax, person.importance + frequencyBoost);
    }
    // Keep bounded
    if (person.mentions.length > MAX_MENTIONS) {
        person.mentions = person.mentions.slice(-MAX_MENTIONS);
    }
    // Clear cached frequency
    person.avgDaysBetweenMentions = undefined;
    log.debug({ userId, personName, mentionCount: person.mentions.length }, 'Recorded person mention');
}
/**
 * Get tracked people for a user
 */
export function getTrackedPeople(userId) {
    const graph = userSocialGraphs.get(userId);
    if (!graph)
        return [];
    return Array.from(graph.values()).map((p) => ({
        name: p.name,
        relationshipType: p.relationshipType,
        mentionCount: p.mentions.length,
        importance: p.importance,
    }));
}
/**
 * Clear social data for a user
 */
export function clearSocialData(userId) {
    userSocialGraphs.delete(userId);
}
export default {
    checkSocialConnections,
    recordPersonMention,
    getTrackedPeople,
    clearSocialData,
};
//# sourceMappingURL=social-connection.js.map