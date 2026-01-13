/**
 * Cross-Domain Shortcut Tools
 *
 * Convenience delegates that route common requests to the correct domain tools.
 * These make Ferni feel more responsive for common voice commands.
 *
 * PATTERN: "Set an alarm" → shortcut validates intent → delegates to alarm-tools
 *
 * @module simple-utilities/shortcuts-tools
 */
import { llm } from '@livekit/agents';
import { z } from 'zod';
import { getLogger } from '../../../utils/safe-logger.js';
import { getToolDescription } from '../../utils/tool-descriptions.js';
import { cleanForFirestore } from '../../../utils/firestore-utils.js';
const log = getLogger();
// In-memory analytics (could be backed by Firestore for persistence)
const usageAnalytics = new Map();
export function trackCapabilityUsage(userId, toolId, success = true) {
    if (!usageAnalytics.has(userId)) {
        usageAnalytics.set(userId, new Map());
    }
    const userUsage = usageAnalytics.get(userId);
    const existing = userUsage.get(toolId) || {
        toolId,
        count: 0,
        lastUsed: 0,
        successRate: 1,
    };
    existing.count++;
    existing.lastUsed = Date.now();
    existing.successRate =
        (existing.successRate * (existing.count - 1) + (success ? 1 : 0)) / existing.count;
    userUsage.set(toolId, existing);
    log.debug({ userId, toolId, usage: existing }, 'Tracked capability usage');
}
export function getTopCapabilities(userId, limit = 5) {
    const userUsage = usageAnalytics.get(userId);
    if (!userUsage)
        return [];
    return Array.from(userUsage.values())
        .sort((a, b) => b.count - a.count)
        .slice(0, limit);
}
export function getRecentCapabilities(userId, limit = 5) {
    const userUsage = usageAnalytics.get(userId);
    if (!userUsage)
        return [];
    return Array.from(userUsage.values())
        .sort((a, b) => b.lastUsed - a.lastUsed)
        .slice(0, limit);
}
// Persist analytics to Firestore (async, fire-and-forget)
async function persistAnalytics(userId) {
    try {
        const { getFirestoreStore } = await import('../../../memory/firestore-store.js');
        const store = getFirestoreStore();
        const db = await store.getDatabase();
        const userUsage = usageAnalytics.get(userId);
        if (!userUsage)
            return;
        const data = Object.fromEntries(userUsage);
        await db
            .collection('bogle_users')
            .doc(userId)
            .collection('analytics')
            .doc('capability_usage')
            .set(cleanForFirestore(data), { merge: true });
    }
    catch (error) {
        log.debug({ error: String(error), userId }, 'Could not persist analytics');
    }
}
// ============================================================================
// QUICK ALARM - Shortcut to alarm-tools
// ============================================================================
const quickAlarmDef = {
    id: 'quickAlarm',
    name: 'Quick Alarm',
    description: 'Quick shortcut to set an alarm - delegates to alarm-tools',
    domain: 'simple-utilities',
    tags: ['alarm', 'wake-up', 'shortcut', 'delegate'],
    create: (ctx) => {
        return llm.tool({
            description: getToolDescription('quickAlarm') ||
                'Set an alarm quickly. Say "set an alarm for 7am" or "wake me up at 6:30".',
            parameters: z.object({
                time: z.string().describe('Time for the alarm, e.g., "7am", "6:30", "7:00 PM"'),
                label: z.string().optional().describe('Label for the alarm, e.g., "wake up", "medication"'),
                repeat: z
                    .enum(['once', 'daily', 'weekdays', 'weekends'])
                    .optional()
                    .describe('Repeat pattern'),
            }),
            execute: async ({ time, label, repeat }) => {
                log.info({ userId: ctx.userId, time, label, repeat }, 'Quick alarm shortcut');
                // Track usage
                trackCapabilityUsage(ctx.userId || 'anon', 'quickAlarm');
                // Parse time into HH:MM format
                const parsedTime = parseTimeString(time);
                if (!parsedTime) {
                    return `I didn't understand that time. Try something like "7am", "6:30 PM", or "14:30".`;
                }
                try {
                    // Dynamically import and delegate to alarm-tools
                    const { alarmToolDefinitions } = await import('./alarm-tools.js');
                    const setAlarmDef = alarmToolDefinitions.find((t) => t.id === 'setAlarm');
                    if (!setAlarmDef) {
                        return `I'm having trouble with alarms right now. Try again in a moment.`;
                    }
                    const tool = setAlarmDef.create(ctx);
                    const result = await tool.execute({
                        time: parsedTime,
                        label: label || 'Alarm',
                        repeat: repeat || 'once',
                    });
                    // Persist analytics
                    void persistAnalytics(ctx.userId || 'anon');
                    return result;
                }
                catch (error) {
                    log.error({ error: String(error) }, 'Quick alarm failed');
                    return `I couldn't set that alarm. Try saying "set alarm for 7am".`;
                }
            },
        });
    },
};
// ============================================================================
// QUICK TIMER - Shortcut to timer-tools
// ============================================================================
const quickTimerDef = {
    id: 'quickTimer',
    name: 'Quick Timer',
    description: 'Quick shortcut to set a timer - delegates to timer-tools',
    domain: 'simple-utilities',
    tags: ['timer', 'countdown', 'shortcut', 'delegate'],
    create: (ctx) => {
        return llm.tool({
            description: getToolDescription('quickTimer') ||
                'Set a timer quickly. Say "set a timer for 5 minutes" or "10 minute timer".',
            parameters: z.object({
                duration: z.string().describe('Duration like "5 minutes", "30 seconds", "2 hours"'),
                label: z.string().optional().describe('What the timer is for'),
            }),
            execute: async ({ duration, label }) => {
                log.info({ userId: ctx.userId, duration, label }, 'Quick timer shortcut');
                trackCapabilityUsage(ctx.userId || 'anon', 'quickTimer');
                // Parse duration into minutes and seconds
                const parsed = parseDuration(duration);
                if (!parsed) {
                    return `I didn't understand that duration. Try "5 minutes", "30 seconds", or "2 hours".`;
                }
                try {
                    const { timerToolDefinitions } = await import('./timer-tools.js');
                    const setTimerDef = timerToolDefinitions.find((t) => t.id === 'setTimer');
                    if (!setTimerDef) {
                        return `I'm having trouble with timers right now. Try again in a moment.`;
                    }
                    const tool = setTimerDef.create(ctx);
                    const result = await tool.execute({
                        minutes: parsed.minutes,
                        seconds: parsed.seconds,
                        label,
                    });
                    void persistAnalytics(ctx.userId || 'anon');
                    return result;
                }
                catch (error) {
                    log.error({ error: String(error) }, 'Quick timer failed');
                    return `I couldn't set that timer. Try saying "set a 5 minute timer".`;
                }
            },
        });
    },
};
// ============================================================================
// QUICK WEATHER - Shortcut to weather domain
// ============================================================================
const quickWeatherDef = {
    id: 'quickWeather',
    name: 'Quick Weather',
    description: 'Quick shortcut to get weather - delegates to weather domain',
    domain: 'simple-utilities',
    tags: ['weather', 'forecast', 'shortcut', 'delegate'],
    create: (ctx) => {
        return llm.tool({
            description: getToolDescription('quickWeather') ||
                'Get the weather quickly. Say "what\'s the weather?" or "weather in New York".',
            parameters: z.object({
                location: z
                    .string()
                    .optional()
                    .describe("Location for weather, defaults to user's location"),
                type: z.enum(['current', 'forecast', 'hourly']).optional().describe('Type of weather info'),
            }),
            execute: async ({ location, type }) => {
                log.info({ userId: ctx.userId, location, type }, 'Quick weather shortcut');
                trackCapabilityUsage(ctx.userId || 'anon', 'quickWeather');
                try {
                    // Try to import weather tools
                    const { getToolDefinitions } = await import('../information/index.js');
                    const weatherTools = await getToolDefinitions();
                    const weatherTool = weatherTools.find((t) => t.id === 'getWeather' || t.id === 'getCurrentWeather');
                    if (!weatherTool) {
                        return `Weather service isn't available right now. Try again later.`;
                    }
                    const tool = weatherTool.create(ctx);
                    const result = await tool.execute({
                        location: location || 'current location',
                        forecastType: type || 'current',
                    });
                    void persistAnalytics(ctx.userId || 'anon');
                    return result;
                }
                catch (error) {
                    log.error({ error: String(error) }, 'Quick weather failed');
                    return `I couldn't get the weather. Try again in a moment.`;
                }
            },
        });
    },
};
// ============================================================================
// QUICK MUSIC - Shortcut to music domain
// ============================================================================
const quickMusicDef = {
    id: 'quickMusic',
    name: 'Quick Music',
    description: 'Quick shortcut to play music - delegates to music/Spotify',
    domain: 'simple-utilities',
    tags: ['music', 'spotify', 'play', 'shortcut', 'delegate'],
    create: (ctx) => {
        return llm.tool({
            description: getToolDescription('quickMusic') ||
                'Play music quickly. Say "play some jazz" or "play upbeat music".',
            parameters: z.object({
                query: z.string().describe('What to play - artist, song, genre, mood, or playlist'),
                action: z.enum(['play', 'pause', 'skip', 'volume']).optional().default('play'),
            }),
            execute: async ({ query, action }) => {
                log.info({ userId: ctx.userId, query, action }, 'Quick music shortcut');
                trackCapabilityUsage(ctx.userId || 'anon', 'quickMusic');
                try {
                    // Try to import music tools
                    const { getToolDefinitions } = await import('../entertainment/index.js');
                    const musicTools = await getToolDefinitions();
                    const playTool = musicTools.find((t) => t.id === 'playMusic' || t.id === 'spotifyPlay');
                    if (!playTool) {
                        return `Music isn't set up yet. Would you like to connect Spotify?`;
                    }
                    const tool = playTool.create(ctx);
                    const result = await tool.execute({
                        query,
                        action,
                    });
                    void persistAnalytics(ctx.userId || 'anon');
                    return result;
                }
                catch (error) {
                    log.error({ error: String(error) }, 'Quick music failed');
                    return `I couldn't play music. Is Spotify connected?`;
                }
            },
        });
    },
};
// ============================================================================
// QUICK CALENDAR - Shortcut to calendar domain
// ============================================================================
const quickCalendarDef = {
    id: 'quickCalendar',
    name: 'Quick Calendar',
    description: 'Quick shortcut to check or add calendar events',
    domain: 'simple-utilities',
    tags: ['calendar', 'schedule', 'events', 'shortcut', 'delegate'],
    create: (ctx) => {
        return llm.tool({
            description: getToolDescription('quickCalendar') ||
                'Check your calendar or add events. Say "what\'s on my calendar today?" or "add lunch with Sarah at 1pm".',
            parameters: z.object({
                action: z.enum(['check', 'add', 'list']).describe('What to do with calendar'),
                date: z.string().optional().describe('Date like "today", "tomorrow", "next monday"'),
                event: z.string().optional().describe('Event details for adding'),
                time: z.string().optional().describe('Time for the event'),
            }),
            execute: async ({ action, date, event, time }) => {
                log.info({ userId: ctx.userId, action, date, event, time }, 'Quick calendar shortcut');
                trackCapabilityUsage(ctx.userId || 'anon', 'quickCalendar');
                try {
                    const { getToolDefinitions } = await import('../calendar/index.js');
                    const calendarTools = await getToolDefinitions();
                    const toolId = action === 'add' ? 'createCalendarEvent' : 'getCalendarEvents';
                    const tool = calendarTools.find((t) => t.id === toolId || t.id === 'listCalendar');
                    if (!tool) {
                        return `Calendar isn't connected. Would you like to connect Google Calendar?`;
                    }
                    const createdTool = tool.create(ctx);
                    const result = await createdTool.execute({
                        date: date || 'today',
                        eventTitle: event,
                        startTime: time,
                    });
                    void persistAnalytics(ctx.userId || 'anon');
                    return result;
                }
                catch (error) {
                    log.error({ error: String(error) }, 'Quick calendar failed');
                    return `I couldn't access your calendar. Try again in a moment.`;
                }
            },
        });
    },
};
// ============================================================================
// QUICK SMART HOME - Shortcut to smart home domain
// ============================================================================
const quickSmartHomeDef = {
    id: 'quickSmartHome',
    name: 'Quick Smart Home',
    description: 'Quick shortcut to control smart home devices',
    domain: 'simple-utilities',
    tags: ['smart-home', 'lights', 'thermostat', 'shortcut', 'delegate'],
    create: (ctx) => {
        return llm.tool({
            description: getToolDescription('quickSmartHome') ||
                'Control smart home. Say "turn on the lights" or "set thermostat to 72".',
            parameters: z.object({
                command: z.string().describe('What to do - "lights on", "thermostat 72", "lock door"'),
                room: z.string().optional().describe('Which room, e.g., "living room", "bedroom"'),
            }),
            execute: async ({ command, room }) => {
                log.info({ userId: ctx.userId, command, room }, 'Quick smart home shortcut');
                trackCapabilityUsage(ctx.userId || 'anon', 'quickSmartHome');
                try {
                    const { getToolDefinitions } = await import('../smart-home/index.js');
                    const smartHomeTools = await getToolDefinitions();
                    // Parse the command to find the right tool
                    const commandLower = command.toLowerCase();
                    let tool;
                    if (commandLower.includes('light')) {
                        tool = smartHomeTools.find((t) => t.id.includes('light') || t.id.includes('Light'));
                    }
                    else if (commandLower.includes('thermostat') || commandLower.includes('temperature')) {
                        tool = smartHomeTools.find((t) => t.id.includes('thermostat') || t.id.includes('Thermostat'));
                    }
                    else if (commandLower.includes('lock') || commandLower.includes('door')) {
                        tool = smartHomeTools.find((t) => t.id.includes('lock') || t.id.includes('Lock'));
                    }
                    else {
                        tool = smartHomeTools[0]; // Default to first available
                    }
                    if (!tool) {
                        return `Smart home isn't set up yet. Would you like to connect your devices?`;
                    }
                    const createdTool = tool.create(ctx);
                    const result = await createdTool.execute({
                        command,
                        room: room || 'default',
                    });
                    void persistAnalytics(ctx.userId || 'anon');
                    return result;
                }
                catch (error) {
                    log.error({ error: String(error) }, 'Quick smart home failed');
                    return `I couldn't control that device. Is your smart home connected?`;
                }
            },
        });
    },
};
// ============================================================================
// QUICK CALL - Shortcut to telephony domain
// ============================================================================
const quickCallDef = {
    id: 'quickCall',
    name: 'Quick Call',
    description: 'Quick shortcut to call a contact - delegates to telephony',
    domain: 'simple-utilities',
    tags: ['call', 'phone', 'contact', 'shortcut', 'delegate'],
    create: (ctx) => {
        return llm.tool({
            description: getToolDescription('quickCall') || 'Call someone. Say "call mom" or "call John Smith".',
            parameters: z.object({
                contact: z.string().describe('Who to call - name, relationship, or phone number'),
                message: z.string().optional().describe("Message to leave if they don't answer"),
            }),
            execute: async ({ contact, message }) => {
                log.info({ userId: ctx.userId, contact, message }, 'Quick call shortcut');
                trackCapabilityUsage(ctx.userId || 'anon', 'quickCall');
                try {
                    const { getToolDefinitions } = await import('../telephony/index.js');
                    const telephonyTools = await getToolDefinitions();
                    const callTool = telephonyTools.find((t) => t.id === 'makePhoneCall' || t.id === 'callContact');
                    if (!callTool) {
                        return `Calling isn't set up yet. Would you like to connect your phone?`;
                    }
                    const tool = callTool.create(ctx);
                    const result = await tool.execute({
                        contact,
                        message,
                    });
                    void persistAnalytics(ctx.userId || 'anon');
                    return result;
                }
                catch (error) {
                    log.error({ error: String(error) }, 'Quick call failed');
                    return `I couldn't start that call. Is telephony connected?`;
                }
            },
        });
    },
};
// ============================================================================
// QUICK TEXT - Shortcut to communication domain
// ============================================================================
const quickTextDef = {
    id: 'quickText',
    name: 'Quick Text',
    description: 'Quick shortcut to send a text message - delegates to communication',
    domain: 'simple-utilities',
    tags: ['text', 'sms', 'message', 'shortcut', 'delegate'],
    create: (ctx) => {
        return llm.tool({
            description: getToolDescription('quickText') ||
                'Send a text message. Say "text mom I\'m on my way" or "send message to John".',
            parameters: z.object({
                contact: z.string().describe('Who to text - name, relationship, or phone number'),
                message: z.string().describe('The message to send'),
            }),
            execute: async ({ contact, message }) => {
                log.info({ userId: ctx.userId, contact, message: message.substring(0, 20) }, 'Quick text shortcut');
                trackCapabilityUsage(ctx.userId || 'anon', 'quickText');
                try {
                    const { getToolDefinitions } = await import('../communication/index.js');
                    const commTools = await getToolDefinitions();
                    const textTool = commTools.find((t) => t.id === 'sendText' || t.id === 'sendSMS' || t.id === 'sendMessage');
                    if (!textTool) {
                        return `Texting isn't set up yet. Would you like to connect your phone?`;
                    }
                    const tool = textTool.create(ctx);
                    const result = await tool.execute({
                        recipient: contact,
                        message,
                    });
                    void persistAnalytics(ctx.userId || 'anon');
                    return result;
                }
                catch (error) {
                    log.error({ error: String(error) }, 'Quick text failed');
                    return `I couldn't send that text. Is messaging connected?`;
                }
            },
        });
    },
};
// ============================================================================
// QUICK EMAIL - Shortcut to communication domain
// ============================================================================
const quickEmailDef = {
    id: 'quickEmail',
    name: 'Quick Email',
    description: 'Quick shortcut to send an email - delegates to communication',
    domain: 'simple-utilities',
    tags: ['email', 'mail', 'message', 'shortcut', 'delegate'],
    create: (ctx) => {
        return llm.tool({
            description: getToolDescription('quickEmail') ||
                'Send an email. Say "email John about the meeting" or "send an email to support".',
            parameters: z.object({
                recipient: z.string().describe('Who to email - name or email address'),
                subject: z.string().optional().describe('Email subject'),
                body: z.string().describe('Email body/message'),
            }),
            execute: async ({ recipient, subject, body }) => {
                log.info({ userId: ctx.userId, recipient, subject }, 'Quick email shortcut');
                trackCapabilityUsage(ctx.userId || 'anon', 'quickEmail');
                try {
                    const { getToolDefinitions } = await import('../communication/index.js');
                    const commTools = await getToolDefinitions();
                    const emailTool = commTools.find((t) => t.id === 'sendEmail' || t.id === 'composeEmail');
                    if (!emailTool) {
                        return `Email isn't set up yet. Would you like to connect your email?`;
                    }
                    const tool = emailTool.create(ctx);
                    const result = await tool.execute({
                        recipient,
                        subject: subject || 'Message from Ferni',
                        body,
                    });
                    void persistAnalytics(ctx.userId || 'anon');
                    return result;
                }
                catch (error) {
                    log.error({ error: String(error) }, 'Quick email failed');
                    return `I couldn't send that email. Is email connected?`;
                }
            },
        });
    },
};
// ============================================================================
// HELPER FUNCTIONS
// ============================================================================
function parseTimeString(time) {
    const cleaned = time.toLowerCase().trim();
    // Match patterns like "7am", "7:30 am", "14:30", "7:00 PM"
    const patterns = [/^(\d{1,2}):?(\d{2})?\s*(am|pm)?$/i, /^(\d{1,2})\s*(am|pm)$/i];
    for (const pattern of patterns) {
        const match = cleaned.match(pattern);
        if (match) {
            let hours = parseInt(match[1], 10);
            const minutes = match[2] ? parseInt(match[2], 10) : 0;
            const meridiem = match[3]?.toLowerCase();
            // Convert to 24-hour format
            if (meridiem === 'pm' && hours !== 12) {
                hours += 12;
            }
            else if (meridiem === 'am' && hours === 12) {
                hours = 0;
            }
            if (hours >= 0 && hours < 24 && minutes >= 0 && minutes < 60) {
                return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
            }
        }
    }
    return null;
}
function parseDuration(duration) {
    const cleaned = duration.toLowerCase().trim();
    // Match patterns like "5 minutes", "30 seconds", "2 hours", "1 hour 30 minutes"
    let totalMinutes = 0;
    let totalSeconds = 0;
    // Hours
    const hourMatch = cleaned.match(/(\d+)\s*(?:hour|hr)s?/);
    if (hourMatch) {
        totalMinutes += parseInt(hourMatch[1], 10) * 60;
    }
    // Minutes
    const minuteMatch = cleaned.match(/(\d+)\s*(?:minute|min)s?/);
    if (minuteMatch) {
        totalMinutes += parseInt(minuteMatch[1], 10);
    }
    // Seconds
    const secondMatch = cleaned.match(/(\d+)\s*(?:second|sec)s?/);
    if (secondMatch) {
        totalSeconds += parseInt(secondMatch[1], 10);
    }
    // Handle bare numbers (assume minutes)
    if (!hourMatch && !minuteMatch && !secondMatch) {
        const bareNumber = cleaned.match(/^(\d+)$/);
        if (bareNumber) {
            totalMinutes = parseInt(bareNumber[1], 10);
        }
        else {
            return null;
        }
    }
    if (totalMinutes === 0 && totalSeconds === 0) {
        return null;
    }
    return {
        minutes: totalMinutes,
        seconds: totalSeconds,
    };
}
// ============================================================================
// EXPORTS
// ============================================================================
export const shortcutsToolDefinitions = [
    quickAlarmDef,
    quickTimerDef,
    quickWeatherDef,
    quickMusicDef,
    quickCalendarDef,
    quickSmartHomeDef,
    quickCallDef,
    quickTextDef,
    quickEmailDef,
];
export { quickAlarmDef, quickTimerDef, quickWeatherDef, quickMusicDef, quickCalendarDef, quickSmartHomeDef, quickCallDef, quickTextDef, quickEmailDef, };
//# sourceMappingURL=shortcuts-tools.js.map