/**
 * Traffic → Productivity Cross-Domain Connection
 *
 * "Better Than Human" feature: Turns commute time into productive
 * or enjoyable time with personalized suggestions.
 *
 * Examples:
 * - "Long commute ahead! Want to listen to that podcast episode?"
 * - "Traffic is heavy. Perfect time for a quick meditation."
 * - "You've got extra time - want a pep talk before your meeting?"
 */
import { llm } from '@livekit/agents';
import { z } from 'zod';
import { getLogger } from '../../../../utils/safe-logger.js';
const log = getLogger();
const SUGGESTION_TEMPLATES = [
    // Pep talk before meetings
    {
        type: 'pep_talk',
        conditions: {
            hasUpcomingMeeting: true,
            minCommute: 10,
        },
        messages: [
            "You've got a meeting coming up. Want me to help you get in the zone?",
            'Perfect time to mentally prepare for your meeting. Want a quick confidence boost?',
            'How about we use this drive time to get you pumped for your upcoming meeting?',
        ],
        priority: 10,
    },
    // Long commute - podcast/audiobook
    {
        type: 'podcast',
        conditions: {
            minCommute: 30,
            trafficSeverity: ['heavy', 'severe'],
        },
        messages: [
            'This commute is going to take a while. Perfect podcast time!',
            'Long drive ahead. Want to catch up on a podcast?',
            "Traffic's heavy - great opportunity to listen to something interesting.",
        ],
        priority: 8,
    },
    {
        type: 'audiobook',
        conditions: {
            minCommute: 45,
        },
        messages: [
            "You've got some time. Good chance to make progress on an audiobook?",
            'Long commute today - audiobook time?',
        ],
        priority: 7,
    },
    // Morning meditation/centering
    {
        type: 'meditation',
        conditions: {
            minCommute: 15,
            timeOfDay: ['morning'],
        },
        messages: [
            'Morning commute - want to start the day with some calm breathing?',
            'Perfect time to center yourself before the day begins.',
            'How about a quick mindfulness moment to start your morning right?',
        ],
        priority: 6,
    },
    // Moderate traffic - music
    {
        type: 'music',
        conditions: {
            trafficSeverity: ['moderate', 'heavy'],
            minCommute: 10,
        },
        messages: [
            'Some traffic today. Good tunes to make it better?',
            'Want some music to make the drive more enjoyable?',
        ],
        priority: 4,
    },
    // Short commute - quick call
    {
        type: 'call',
        conditions: {
            minCommute: 10,
            maxCommute: 25,
        },
        messages: [
            'Short drive - good time to catch up with someone?',
            "Perfect amount of time for a quick call if you've been meaning to connect with someone.",
        ],
        priority: 3,
    },
    // Evening wind-down
    {
        type: 'meditation',
        conditions: {
            minCommute: 15,
            timeOfDay: ['evening'],
        },
        messages: [
            'End of day commute. Want to decompress with some calm music or breathing?',
            'Time to transition from work mode. Shall we do some relaxation?',
        ],
        priority: 5,
    },
];
// ============================================================================
// SUGGESTION GENERATION
// ============================================================================
function getTimeOfDay() {
    const hour = new Date().getHours();
    if (hour < 12)
        return 'morning';
    if (hour < 17)
        return 'afternoon';
    return 'evening';
}
function matchesSuggestion(template, context) {
    const { conditions } = template;
    if (conditions.minCommute && context.commuteTime < conditions.minCommute) {
        return false;
    }
    if (conditions.maxCommute && context.commuteTime > conditions.maxCommute) {
        return false;
    }
    if (conditions.trafficSeverity && !conditions.trafficSeverity.includes(context.trafficSeverity)) {
        return false;
    }
    if (conditions.timeOfDay &&
        !conditions.timeOfDay.includes(context.timeOfDay)) {
        return false;
    }
    if (conditions.hasUpcomingMeeting !== undefined &&
        conditions.hasUpcomingMeeting !== context.hasUpcomingMeeting) {
        return false;
    }
    return true;
}
function getRandomMessage(messages) {
    return messages[Math.floor(Math.random() * messages.length)];
}
/**
 * Generate commute suggestions based on traffic and context
 */
export function generateCommuteSuggestions(commuteTime, trafficSeverity, hasUpcomingMeeting = false) {
    const timeOfDay = getTimeOfDay();
    const context = {
        commuteTime,
        trafficSeverity,
        isLongerThanUsual: trafficSeverity === 'heavy' || trafficSeverity === 'severe',
        suggestions: [],
        timeOfDay,
        hasUpcomingMeeting,
    };
    const matchedTemplates = SUGGESTION_TEMPLATES.filter((t) => matchesSuggestion(t, context)).sort((a, b) => b.priority - a.priority);
    return matchedTemplates.slice(0, 3).map((t) => ({
        type: t.type,
        reason: getRandomMessage(t.messages),
    }));
}
// ============================================================================
// CROSS-DOMAIN INSIGHTS
// ============================================================================
/**
 * Analyze traffic situation and generate productivity insights
 */
export async function getTrafficProductivityInsights(commuteTime, trafficSeverity, hasUpcomingMeeting = false) {
    log.info({ commuteTime, trafficSeverity, hasUpcomingMeeting }, '🚗→💼 Analyzing traffic-productivity connections');
    const insights = [];
    const suggestions = generateCommuteSuggestions(commuteTime, trafficSeverity, hasUpcomingMeeting);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 2 * 60 * 60 * 1000); // 2 hours
    if (suggestions.length > 0) {
        const primarySuggestion = suggestions[0];
        insights.push({
            id: `traffic-productivity-${now.getTime()}`,
            sourceDomain: 'traffic',
            targetDomain: 'productivity',
            connectionType: 'traffic_productivity',
            message: primarySuggestion.reason,
            suggestion: suggestions.length > 1
                ? `Or if you prefer: ${suggestions[1].reason.toLowerCase()}`
                : undefined,
            confidence: trafficSeverity === 'severe' ? 0.9 : 0.8,
            generatedAt: now,
            expiresAt,
            context: {
                commuteTime,
                trafficSeverity,
                hasUpcomingMeeting,
                allSuggestions: suggestions,
            },
        });
    }
    // Special insight for unusually long commutes
    if (commuteTime > 60 && trafficSeverity === 'severe') {
        insights.push({
            id: `traffic-long-commute-${now.getTime()}`,
            sourceDomain: 'traffic',
            targetDomain: 'productivity',
            connectionType: 'traffic_productivity',
            message: "This is going to be a long one. Let's make the most of it!",
            suggestion: 'Consider whether you can reschedule anything or work remotely if possible.',
            confidence: 0.85,
            generatedAt: now,
            expiresAt,
            context: {
                commuteTime,
                trafficSeverity,
                isExtended: true,
            },
        });
    }
    return insights;
}
/**
 * Format commute suggestions as a friendly message
 */
export function formatCommuteSuggestions(suggestions) {
    if (suggestions.length === 0) {
        return 'Quick trip ahead! Should be smooth sailing.';
    }
    const primary = suggestions[0];
    let response = primary.reason;
    if (suggestions.length > 1) {
        const alternatives = suggestions
            .slice(1)
            .map((s) => s.type.replace('_', ' '))
            .join(' or ');
        response += ` Or maybe some ${alternatives}?`;
    }
    return response;
}
// ============================================================================
// TOOL EXPORTS
// ============================================================================
export function createTrafficProductivityTools() {
    return {
        getCommuteSuggestions: llm.tool({
            description: 'Get personalized suggestions for making commute time productive or enjoyable. ' +
                'Considers commute length, traffic severity, time of day, and upcoming meetings.',
            parameters: z.object({
                commuteTime: z.number().describe('Expected commute time in minutes'),
                trafficSeverity: z
                    .enum(['light', 'moderate', 'heavy', 'severe'])
                    .describe('Current traffic severity'),
                hasUpcomingMeeting: z
                    .boolean()
                    .optional()
                    .describe('Whether user has a meeting shortly after arrival'),
            }),
            execute: async ({ commuteTime, trafficSeverity, hasUpcomingMeeting }) => {
                const suggestions = generateCommuteSuggestions(commuteTime, trafficSeverity, hasUpcomingMeeting || false);
                return formatCommuteSuggestions(suggestions);
            },
        }),
        getTrafficProductivityInsights: llm.tool({
            description: 'Analyze traffic situation and generate insights about how to use commute time productively.',
            parameters: z.object({
                commuteTime: z.number().describe('Expected commute time in minutes'),
                trafficSeverity: z
                    .enum(['light', 'moderate', 'heavy', 'severe'])
                    .describe('Current traffic severity'),
                hasUpcomingMeeting: z
                    .boolean()
                    .optional()
                    .describe('Whether user has a meeting shortly after arrival'),
            }),
            execute: async ({ commuteTime, trafficSeverity, hasUpcomingMeeting }) => {
                const insights = await getTrafficProductivityInsights(commuteTime, trafficSeverity, hasUpcomingMeeting || false);
                if (insights.length === 0) {
                    return 'Short and easy commute ahead. Nothing special needed!';
                }
                return insights
                    .map((i) => `${i.message}${i.suggestion ? ` ${i.suggestion}` : ''}`)
                    .join('\n\n');
            },
        }),
        suggestPreMeetingPepTalk: llm.tool({
            description: 'Offer a pep talk or confidence boost before an important meeting during commute.',
            parameters: z.object({
                meetingType: z
                    .string()
                    .optional()
                    .describe('Type of meeting (e.g., "presentation", "interview", "client call")'),
                minutesUntilMeeting: z.number().optional().describe('Minutes until the meeting starts'),
            }),
            execute: async ({ meetingType, minutesUntilMeeting }) => {
                const type = meetingType || 'meeting';
                const time = minutesUntilMeeting || 30;
                if (time < 5) {
                    return `You've got this! Deep breath, you're prepared. Go show them what you've got!`;
                }
                const pepTalks = [
                    `You've got ${time} minutes before your ${type}. Remember: you know your stuff. Trust your preparation.`,
                    `Time for a confidence check before your ${type}! You've done this before, and you'll do great.`,
                    `Here's your pre-${type} boost: You are capable, you are prepared, and you've got this. 💪`,
                    `${time} minutes to go. Take a deep breath. You're about to crush this ${type}!`,
                ];
                return pepTalks[Math.floor(Math.random() * pepTalks.length)];
            },
        }),
    };
}
//# sourceMappingURL=traffic-productivity.js.map