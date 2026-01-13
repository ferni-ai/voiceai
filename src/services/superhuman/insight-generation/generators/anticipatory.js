/**
 * Anticipatory Insight Generator
 *
 * Generates insights that anticipate upcoming challenges:
 * - "Your quarterly review is next week - last time anxiety started day -3"
 * - "Mother's Day is coming up. Last year was hard."
 * - "Tax season is approaching. You usually get stressed around now."
 *
 * We combine calendar awareness with historical patterns.
 *
 * @module services/superhuman/insight-generation/generators/anticipatory
 */
import { createLogger } from '../../../../utils/safe-logger.js';
import { buildSeasonalContext } from '../../seasonal-awareness.js';
import { registerInsightGenerator } from '../engine.js';
const log = createLogger({ module: 'insight-gen:anticipatory' });
// ============================================================================
// TEMPLATES
// ============================================================================
const ANTICIPATORY_TEMPLATES = {
    upcoming_event: [
        "{event} is {timeframe}. Based on past patterns, you might start feeling {emotion} around {onset}. Want to prepare together?",
        "I'm looking ahead: {event} is {timeframe}. Last time, {emotion} kicked in about {onset} before. How are you feeling about it?",
        "{event} coming up in {timeframe}. I remember how {pastExperience}. Is there anything you want to think through now?",
    ],
    annual_pattern: [
        "This time of year tends to be {quality} for you. {reason}. How are you preparing?",
        "{season} is {quality} for you historically. I want to check in before it hits.",
        "Heads up: we're entering {season}. You've mentioned this period being {quality}. What support would help?",
    ],
    relationship_date: [
        "{event} is coming up in {timeframe}. Last year it was {quality}. Thinking about how you want to handle this one?",
        "I noticed {event} is approaching. You've got history with this date. Want to talk through it?",
        "{event} in {timeframe}. I remember what you shared about last year. How are you feeling about it this time?",
    ],
    predictive_stress: [
        "Based on patterns, you might start feeling {emotion} soon. The {trigger} is coming, and it usually affects you.",
        "I want to name something: {trigger} tends to bring {emotion} for you. We can get ahead of it.",
        "Historically, {trigger} creates {emotion}. It's {timeframe} away. Want to build a buffer?",
    ],
    opportunity: [
        "You mentioned wanting to {goal} when {condition}. That's coming up—{timeframe}. Ready?",
        "Remember when you said you'd {goal} when {condition}? That window is {timeframe}.",
        "{condition} is approaching. You had plans around this. Still feeling that?",
    ],
};
// Known annual stress patterns
const ANNUAL_PATTERNS = [
    { month: 0, event: "New Year's", type: 'relationship_date', quality: 'mixed' },
    { month: 1, event: "Valentine's Day", type: 'relationship_date', quality: 'varies' },
    { month: 3, event: 'Tax deadline', type: 'predictive_stress', trigger: 'tax season', emotion: 'stress' },
    { month: 4, event: "Mother's Day", type: 'relationship_date', quality: 'varies' },
    { month: 5, event: "Father's Day", type: 'relationship_date', quality: 'varies' },
    { month: 10, event: 'Thanksgiving', type: 'annual_pattern', quality: 'complex' },
    { month: 11, event: 'Holiday season', type: 'annual_pattern', quality: 'complex' },
];
async function fetchAnticipatoryData(userId) {
    const insights = [];
    try {
        // Get seasonal context for user-specific patterns
        const seasonalContext = await buildSeasonalContext(userId);
        // Check for upcoming annual events
        const now = new Date();
        const currentMonth = now.getMonth();
        const currentDay = now.getDate();
        for (const pattern of ANNUAL_PATTERNS) {
            // Check if event is within next 2 weeks
            let daysUntil = 0;
            if (pattern.month === currentMonth) {
                // This month - check if day is coming up
                const eventDay = 15; // Approximate
                if (currentDay < eventDay) {
                    daysUntil = eventDay - currentDay;
                }
            }
            else if ((pattern.month === currentMonth + 1) || (currentMonth === 11 && pattern.month === 0)) {
                // Next month
                daysUntil = (30 - currentDay) + 15;
            }
            if (daysUntil > 0 && daysUntil <= 14) {
                insights.push({
                    type: pattern.type,
                    event: pattern.event,
                    timeframe: daysUntil <= 7 ? 'next week' : 'in about 2 weeks',
                    daysUntil,
                    emotion: pattern.emotion,
                    quality: pattern.quality,
                    trigger: pattern.trigger,
                    onset: 'a few days',
                });
            }
        }
        // Parse seasonal context for user-specific patterns
        if (seasonalContext) {
            // Look for energy patterns
            const energyMatch = seasonalContext.match(/Energy pattern: (.+)/i);
            if (energyMatch) {
                const currentSeason = getCurrentSeason(currentMonth);
                insights.push({
                    type: 'annual_pattern',
                    event: currentSeason,
                    timeframe: 'now',
                    daysUntil: 0,
                    season: currentSeason,
                    quality: energyMatch[1].includes('slow') || energyMatch[1].includes('low') ? 'lower energy' : 'higher energy',
                    reason: energyMatch[1],
                });
            }
            // Look for personal dates
            const personalMatch = seasonalContext.match(/Personal: (.+)/i);
            if (personalMatch) {
                // Parse personal date info
                const dateInfo = personalMatch[1];
                if (dateInfo.includes('Birthday') || dateInfo.includes('Anniversary')) {
                    insights.push({
                        type: 'relationship_date',
                        event: dateInfo.split('in')[0].trim(),
                        timeframe: 'soon',
                        daysUntil: 14,
                        quality: 'significant',
                    });
                }
            }
        }
    }
    catch (error) {
        log.debug({ error: String(error), userId }, 'Error fetching anticipatory data');
    }
    // Sort by days until and return most imminent
    return insights
        .filter((i) => i.daysUntil <= 14)
        .sort((a, b) => a.daysUntil - b.daysUntil)
        .slice(0, 2);
}
function getCurrentSeason(month) {
    if (month >= 2 && month <= 4)
        return 'spring';
    if (month >= 5 && month <= 7)
        return 'summer';
    if (month >= 8 && month <= 10)
        return 'fall';
    return 'winter';
}
// ============================================================================
// GENERATOR
// ============================================================================
async function generateAnticipatoryInsights(userId, _context) {
    const insights = [];
    try {
        const anticipatoryData = await fetchAnticipatoryData(userId);
        for (const data of anticipatoryData) {
            const insight = buildAnticipatoryInsight(data, userId);
            if (insight) {
                insights.push(insight);
            }
        }
    }
    catch (error) {
        log.warn({ error: String(error), userId }, 'Failed to generate anticipatory insights');
    }
    return insights;
}
function buildAnticipatoryInsight(data, userId) {
    const templates = ANTICIPATORY_TEMPLATES[data.type];
    if (!templates || templates.length === 0) {
        return null;
    }
    let message = templates[Math.floor(Math.random() * templates.length)];
    // Replace placeholders
    message = message
        .replace(/{event}/g, data.event)
        .replace(/{timeframe}/g, data.timeframe)
        .replace(/{emotion}/g, data.emotion || 'stress')
        .replace(/{onset}/g, data.onset || 'a few days')
        .replace(/{pastExperience}/g, data.pastExperience || 'it affected you')
        .replace(/{quality}/g, data.quality || 'significant')
        .replace(/{season}/g, data.season || 'this time')
        .replace(/{reason}/g, data.reason || '')
        .replace(/{trigger}/g, data.trigger || data.event)
        .replace(/{goal}/g, data.goal || 'make a change')
        .replace(/{condition}/g, data.condition || 'the time was right');
    const priorityByDays = data.daysUntil <= 3 ? 'high' : data.daysUntil <= 7 ? 'medium' : 'low';
    return {
        id: `anticipatory_${data.event.replace(/\s+/g, '_')}_${Date.now()}`,
        userId,
        category: 'anticipatory',
        priority: priorityByDays,
        headline: `${data.event} ${data.timeframe}`,
        message,
        evidence: [
            `Event: ${data.event}`,
            `In: ${data.daysUntil} days`,
            data.quality ? `Historical: ${data.quality}` : '',
        ].filter(Boolean),
        surfacingMoment: data.daysUntil <= 3 ? 'session_start' : 'natural_pause',
        tone: data.type === 'predictive_stress' ? 'protective_care' : 'gentle_curiosity',
        triggerTopics: [data.event, data.trigger, data.season].filter(Boolean),
        confidence: 0.75,
        dataPoints: 3,
        generatedAt: new Date(),
        expiresAt: new Date(Date.now() + data.daysUntil * 24 * 60 * 60 * 1000 + 2 * 24 * 60 * 60 * 1000), // Expire 2 days after event
        surfaced: false,
        dismissed: false,
    };
}
async function hasEnoughData(userId) {
    try {
        const seasonalContext = await buildSeasonalContext(userId);
        // Anticipatory insights can work with minimal data since we use calendar events
        return seasonalContext !== null || true; // Always try, since we have calendar awareness
    }
    catch {
        return true; // Default to true since calendar events don't require user data
    }
}
// ============================================================================
// REGISTRATION
// ============================================================================
const anticipatoryGenerator = {
    category: 'anticipatory',
    name: 'Anticipatory Insight Generator',
    description: 'Anticipates upcoming challenges based on calendar and patterns',
    generate: generateAnticipatoryInsights,
    hasEnoughData,
};
registerInsightGenerator(anticipatoryGenerator);
export { anticipatoryGenerator };
//# sourceMappingURL=anticipatory.js.map