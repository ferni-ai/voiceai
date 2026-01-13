/**
 * Social Event Data Capture Definition
 *
 * Passively captures social interactions for the Social Battery tracker.
 * Detects mentions of social activities, gatherings, and alone time.
 *
 * @module intelligence/data-capture/definitions/social-event.capture
 */
import { createLogger } from '../../../utils/safe-logger.js';
const log = createLogger({ module: 'data-capture:social-event' });
// Map social event descriptions to types
const EVENT_TYPE_MAP = {
    // Large gatherings
    party: { type: 'large_gathering', baseDuration: 180 },
    wedding: { type: 'large_gathering', baseDuration: 300 },
    conference: { type: 'large_gathering', baseDuration: 480 },
    event: { type: 'large_gathering', baseDuration: 120 },
    networking: { type: 'large_gathering', baseDuration: 120 },
    reunion: { type: 'large_gathering', baseDuration: 180 },
    // Small groups
    dinner: { type: 'small_group', baseDuration: 90 },
    lunch: { type: 'small_group', baseDuration: 60 },
    brunch: { type: 'small_group', baseDuration: 90 },
    'team meeting': { type: 'small_group', baseDuration: 60 },
    'group hangout': { type: 'small_group', baseDuration: 120 },
    'game night': { type: 'small_group', baseDuration: 180 },
    // One-on-one
    coffee: { type: 'one_on_one', baseDuration: 45 },
    'coffee date': { type: 'one_on_one', baseDuration: 60 },
    'catch up': { type: 'one_on_one', baseDuration: 60 },
    'one-on-one': { type: 'one_on_one', baseDuration: 60 },
    'hung out with': { type: 'one_on_one', baseDuration: 90 },
    date: { type: 'one_on_one', baseDuration: 120 },
    // Family
    'family dinner': { type: 'family', baseDuration: 120 },
    'family gathering': { type: 'family', baseDuration: 180 },
    'visited family': { type: 'family', baseDuration: 180 },
    parents: { type: 'family', baseDuration: 120 },
    'in-laws': { type: 'family', baseDuration: 120 },
    thanksgiving: { type: 'family', baseDuration: 360 },
    christmas: { type: 'family', baseDuration: 480 },
    holiday: { type: 'family', baseDuration: 240 },
    // Work meetings
    meeting: { type: 'work_meeting', baseDuration: 60 },
    'all hands': { type: 'work_meeting', baseDuration: 60 },
    standup: { type: 'work_meeting', baseDuration: 15 },
    // Conflict
    argument: { type: 'conflict', baseDuration: 30 },
    fight: { type: 'conflict', baseDuration: 30 },
    confrontation: { type: 'conflict', baseDuration: 30 },
    // Alone time
    'alone time': { type: 'alone_time', baseDuration: 120 },
    'by myself': { type: 'alone_time', baseDuration: 120 },
    'stayed home': { type: 'alone_time', baseDuration: 240 },
    'quiet evening': { type: 'alone_time', baseDuration: 180 },
    'me time': { type: 'alone_time', baseDuration: 120 },
};
export const socialEventCaptureDefinition = {
    id: 'capture_social_event',
    name: 'Social Event Capture',
    description: 'Captures social interactions for the Social Battery tracker',
    category: 'social',
    triggers: {
        phrases: [
            'went to a',
            'had a',
            'just got back from',
            'was at',
            'went out with',
            'hung out with',
            'met up with',
            'spent time with',
            'had people over',
            'attended',
            'stayed home',
            'had the house to myself',
            'finally got some alone time',
        ],
        patterns: [
            /(?:went to|had|attended|was at)\s+(?:a|the|my)?\s*(party|wedding|conference|dinner|lunch|brunch|meeting|event)/i,
            /(?:hung out|met up|caught up)\s+with\s+(\w+)/i,
            /had\s+(?:a|the)\s+(family|work|team)\s+(dinner|meeting|gathering)/i,
            /(?:stayed home|quiet evening|me time|alone time|by myself)/i,
            /(?:had|got into)\s+(?:a|an)?\s*(argument|fight|confrontation)/i,
        ],
        keywords: [
            { word: 'party', weight: 0.9 },
            { word: 'dinner', weight: 0.7 },
            { word: 'meeting', weight: 0.6 },
            { word: 'wedding', weight: 0.9 },
            { word: 'gathering', weight: 0.8 },
            { word: 'conference', weight: 0.9 },
            { word: 'alone', weight: 0.7 },
            { word: 'argument', weight: 0.9 },
        ],
        antiKeywords: [
            'should i go to',
            'thinking about',
            'planning to',
            'want to go to',
            'might go to',
        ],
    },
    arguments: [
        {
            name: 'eventType',
            type: 'string',
            description: 'Type of social event',
            required: true,
            extractionPatterns: [
                /(?:went to|had|attended|was at)\s+(?:a|the|my)?\s*(\w+(?:\s+\w+)?)/i,
                /(party|wedding|conference|dinner|lunch|meeting|gathering|date)/i,
                /(alone time|by myself|stayed home|quiet evening|me time)/i,
                /(argument|fight|confrontation)/i,
            ],
        },
        {
            name: 'duration',
            type: 'string',
            description: 'How long it lasted',
            required: false,
            extractionPatterns: [
                /(?:for|lasted|about)\s+(\d+)\s*(hour|minute|hr|min)/i,
                /(\d+)\s*-\s*hour/i,
                /all\s+(day|evening|afternoon|night|morning)/i,
            ],
        },
        {
            name: 'context',
            type: 'string',
            description: 'Additional context about the event',
            required: false,
            extractionPatterns: [/with\s+(.+?)(?:\.|,|$)/i, /at\s+(.+?)(?:\.|,|$)/i],
        },
    ],
    confidence: {
        baseScore: 0.6,
        patternMatchBonus: 0.2,
        keywordDensityMultiplier: 1.2,
        negativeKeywordPenalty: 0.4,
    },
    handler: async (extractedArgs, context) => {
        const rawEventType = String(extractedArgs.eventType || '')
            .toLowerCase()
            .trim();
        const durationStr = String(extractedArgs.duration || '');
        const eventContext = String(extractedArgs.context || '').slice(0, 200);
        // Find the mapped event type
        let eventMapping;
        for (const [key, mapping] of Object.entries(EVENT_TYPE_MAP)) {
            if (rawEventType.includes(key)) {
                eventMapping = mapping;
                break;
            }
        }
        if (!eventMapping) {
            log.debug({ rawEventType }, 'No event type mapping found');
            return null;
        }
        // Parse duration
        let durationMinutes = eventMapping.baseDuration;
        if (durationStr) {
            const hourMatch = durationStr.match(/(\d+)\s*(?:hour|hr)/i);
            const minMatch = durationStr.match(/(\d+)\s*(?:minute|min)/i);
            if (hourMatch) {
                durationMinutes = parseInt(hourMatch[1]) * 60;
            }
            else if (minMatch) {
                durationMinutes = parseInt(minMatch[1]);
            }
            // Handle "all day", "all evening", etc.
            if (durationStr.includes('all day'))
                durationMinutes = 480;
            if (durationStr.includes('all evening'))
                durationMinutes = 240;
            if (durationStr.includes('all afternoon'))
                durationMinutes = 240;
        }
        try {
            const { recordSocialEvent } = await import('../../../services/superhuman/social-battery.js');
            await recordSocialEvent(context.userId, eventMapping.type, durationMinutes, eventContext || undefined);
            log.info({ type: eventMapping.type, duration: durationMinutes, userId: context.userId }, 'Captured social event from conversation');
            // Silently capture - don't interrupt the flow
            return null;
        }
        catch (error) {
            log.error({ error: String(error), rawEventType }, 'Failed to capture social event');
            return null;
        }
    },
};
//# sourceMappingURL=social-event.capture.js.map