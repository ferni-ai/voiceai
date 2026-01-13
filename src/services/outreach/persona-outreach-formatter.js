/**
 * Persona Outreach Formatter
 *
 * Loads and applies persona-specific outreach styles for all channels.
 * Each persona has their own voice, tone, emoji usage, and templates
 * defined in their outreach-voice.json bundle file.
 *
 * Philosophy: Outreach should feel like it's coming from a real person
 * with their own unique communication style - not a generic notification system.
 *
 * @module PersonaOutreachFormatter
 */
import { createLogger } from '../../utils/safe-logger.js';
import { getCanonicalPersonaId, getPersonaDisplayName } from '../../personas/voice-registry.js';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
const log = createLogger({ module: 'PersonaOutreachFormatter' });
// ============================================================================
// CACHE
// ============================================================================
const configCache = new Map();
// ============================================================================
// LOADING
// ============================================================================
/**
 * Get the path to a persona's outreach-voice.json
 */
function getOutreachVoicePath(personaId) {
    const canonical = getCanonicalPersonaId(personaId);
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    return path.join(__dirname, '..', '..', 'personas', 'bundles', canonical, 'content', 'behaviors', 'outreach-voice.json');
}
/**
 * Load a persona's outreach voice configuration
 */
export function loadOutreachVoiceConfig(personaId) {
    const canonical = getCanonicalPersonaId(personaId);
    // Check cache
    const cached = configCache.get(canonical);
    if (cached) {
        return cached;
    }
    try {
        const configPath = getOutreachVoicePath(canonical);
        if (!fs.existsSync(configPath)) {
            log.warn({ personaId, configPath }, 'Outreach voice config not found');
            return null;
        }
        const content = fs.readFileSync(configPath, 'utf-8');
        const config = JSON.parse(content);
        // Cache it
        configCache.set(canonical, config);
        log.debug({ personaId: canonical }, 'Loaded outreach voice config');
        return config;
    }
    catch (error) {
        log.error({ error, personaId }, 'Failed to load outreach voice config');
        return null;
    }
}
/**
 * Get config with fallback to Ferni's config
 */
export function getOutreachVoiceConfig(personaId) {
    const config = loadOutreachVoiceConfig(personaId);
    if (config)
        return config;
    // Fallback to Ferni
    const ferniConfig = loadOutreachVoiceConfig('ferni');
    if (ferniConfig)
        return ferniConfig;
    // Last resort: return a minimal default
    return getDefaultConfig(personaId);
}
/**
 * Default config if nothing else loads
 */
function getDefaultConfig(personaId) {
    const displayName = getPersonaDisplayName(personaId);
    return {
        name: 'outreach-voice',
        description: `Default outreach voice for ${displayName}`,
        version: '1.0.0',
        voice_profile: {
            tone: 'warm',
            energy: 'grounded',
            style: 'friendly',
            formality: 'casual',
        },
        signature_phrases: {
            greeting: ['Hey!', 'Hi there!'],
            thinking_of_you: ['Just thinking about you'],
            check_in: ['Quick check-in'],
            closing: ['Take care!', 'Talk soon!'],
        },
        emoji_usage: {
            frequency: 'minimal',
            preferred: ['👋', '✨'],
            avoid: [],
            max_per_message: 1,
        },
        channel_styles: {
            sms: { length: 'short', tone: 'friendly', sentences: [1, 3] },
            email: { length: 'medium', tone: 'friendly', signature: `Best,\n${displayName}` },
            call: {
                length: 'medium',
                opening: `Hey! It's ${displayName}.`,
                tone: 'warm',
                pacing: 'natural',
            },
            voicemail: { length: 'brief', tone: 'warm' },
        },
        trigger_templates: {},
        relationship_adaptations: {
            new: { formality: 'friendly', opening_style: 'Hi {name}!', closing_style: 'Take care!' },
            building: {
                formality: 'friendly',
                opening_style: 'Hey {name}!',
                closing_style: 'Talk soon!',
            },
            established: { formality: 'casual', opening_style: 'Hey!', closing_style: '👋' },
            deep: { formality: 'casual', opening_style: 'Hey!', closing_style: '❤️' },
        },
        do_not: ['Sound robotic', 'Be impersonal'],
        always_do: ['Be warm', 'Be genuine'],
    };
}
// ============================================================================
// FORMATTING
// ============================================================================
/**
 * Pick a random item from an array
 */
function pickRandom(items) {
    return items[Math.floor(Math.random() * items.length)];
}
/**
 * Apply template variables to a string
 */
function applyTemplate(template, context) {
    let result = template;
    const replacements = {
        '{name}': context.userName,
        '{nickname}': context.userNickname || context.userName,
        '{topic}': context.topic,
        '{habit}': context.habit,
        '{appointment}': context.appointment,
        '{streak_count}': context.streak_count?.toString(),
        '{time}': context.time,
        '{details}': context.details,
    };
    for (const [placeholder, value] of Object.entries(replacements)) {
        if (value) {
            result = result.replace(new RegExp(placeholder.replace(/[{}]/g, '\\$&'), 'g'), value);
        }
    }
    return result;
}
/**
 * Maybe add an emoji based on persona's emoji usage rules
 */
function maybeAddEmoji(config, currentEmojiCount) {
    if (currentEmojiCount >= config.emoji_usage.max_per_message) {
        return '';
    }
    const { frequency } = config.emoji_usage;
    let addProbability = 0;
    switch (frequency) {
        case 'none':
            return '';
        case 'minimal':
            addProbability = 0.2;
            break;
        case 'moderate':
            addProbability = 0.5;
            break;
        case 'professional':
            addProbability = 0.3;
            break;
    }
    if (Math.random() < addProbability && config.emoji_usage.preferred.length > 0) {
        return ` ${pickRandom(config.emoji_usage.preferred)}`;
    }
    return '';
}
/**
 * Get the greeting for a persona based on relationship stage
 */
export function getPersonaGreeting(personaId, context = {}) {
    const config = getOutreachVoiceConfig(personaId);
    const stage = context.relationshipStage || 'building';
    const adaptation = config.relationship_adaptations[stage];
    if (adaptation?.opening_style) {
        return applyTemplate(adaptation.opening_style, context);
    }
    return applyTemplate(pickRandom(config.signature_phrases.greeting), context);
}
/**
 * Get the closing for a persona based on relationship stage
 */
export function getPersonaClosing(personaId, context = {}) {
    const config = getOutreachVoiceConfig(personaId);
    const stage = context.relationshipStage || 'building';
    const adaptation = config.relationship_adaptations[stage];
    if (adaptation?.closing_style) {
        return applyTemplate(adaptation.closing_style, context);
    }
    return applyTemplate(pickRandom(config.signature_phrases.closing), context);
}
/**
 * Format a message for SMS using persona's style
 */
export function formatSmsMessage(personaId, message, context = {}) {
    const config = getOutreachVoiceConfig(personaId);
    const smsStyle = config.channel_styles.sms;
    const greeting = getPersonaGreeting(personaId, context);
    const closing = getPersonaClosing(personaId, context);
    // Count existing emojis in message
    const emojiRegex = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu;
    const existingEmojis = (message.match(emojiRegex) || []).length;
    const emoji = maybeAddEmoji(config, existingEmojis);
    // Build the SMS
    const formattedMessage = `${greeting} ${message}${emoji}`;
    return {
        message: formattedMessage,
        greeting,
        closing,
        emoji: emoji.trim(),
    };
}
/**
 * Format a message for email using persona's style
 */
export function formatEmailMessage(personaId, subject, body, context = {}) {
    const config = getOutreachVoiceConfig(personaId);
    const emailStyle = config.channel_styles.email;
    const displayName = getPersonaDisplayName(personaId);
    const greeting = getPersonaGreeting(personaId, context);
    const closing = getPersonaClosing(personaId, context);
    const signature = emailStyle.signature || `${closing}\n${displayName}`;
    const formattedBody = `${greeting}\n\n${body}\n\n${signature}`;
    return {
        subject,
        body: formattedBody,
        signature,
    };
}
/**
 * Format a message for voice call using persona's style
 */
export function formatVoiceMessage(personaId, message, context = {}) {
    const config = getOutreachVoiceConfig(personaId);
    const callStyle = config.channel_styles.call;
    const displayName = getPersonaDisplayName(personaId);
    const firstName = displayName.split(' ')[0];
    const opening = callStyle.opening || `Hey! It's ${firstName}.`;
    return {
        message,
        greeting: applyTemplate(opening, context),
        closing: getPersonaClosing(personaId, context),
        opening: applyTemplate(opening, context),
    };
}
/**
 * Format a voicemail message using persona's style
 */
export function formatVoicemailMessage(personaId, message, context = {}) {
    const config = getOutreachVoiceConfig(personaId);
    const vmStyle = config.channel_styles.voicemail;
    const displayName = getPersonaDisplayName(personaId);
    const firstName = displayName.split(' ')[0];
    const greeting = `Hey ${context.userName || 'there'}! It's ${firstName}.`;
    const closing = vmStyle.always_include || "I'll send you a text so you can respond when you have time.";
    const fullMessage = `${greeting} ${message} ${closing}`;
    return {
        message: fullMessage,
        greeting,
        closing,
    };
}
/**
 * Format a push notification using persona's style
 */
export function formatPushNotification(personaId, message, context = {}) {
    const config = getOutreachVoiceConfig(personaId);
    const displayName = getPersonaDisplayName(personaId);
    const firstName = displayName.split(' ')[0];
    // Pick a contextual title
    const titles = {
        thinking_of_you: `💭 ${firstName} here`,
        celebration: `✨ ${firstName} noticed something!`,
        habit: `${pickRandom(config.emoji_usage.preferred) || '📱'} ${firstName}`,
        appointment: `📅 ${firstName}`,
        default: `💚 ${firstName}`,
    };
    const type = context.topic || 'default';
    const title = titles[type] || titles.default;
    // Format body with greeting style but keep it short for push
    const emojiCount = (message.match(/[\u{1F600}-\u{1F64F}]/gu) || []).length;
    const emoji = maybeAddEmoji(config, emojiCount);
    return {
        title,
        body: `${message}${emoji}`,
    };
}
// ============================================================================
// PERSONA ROUTING
// ============================================================================
/**
 * Specialty triggers for each persona
 * Used to route outreach to the right persona based on context
 */
const PERSONA_SPECIALTIES = {
    ferni: [
        'thinking_of_you',
        'emotional',
        'support',
        'reflection',
        'growth',
        'celebration',
        'general',
        'reengagement',
    ],
    'maya-santos': [
        'habit',
        'routine',
        'morning',
        'evening',
        'streak',
        'consistency',
        'wellness',
        'self-care',
        'meditation',
        'exercise',
    ],
    'alex-chen': [
        'appointment',
        'meeting',
        'deadline',
        'email',
        'presentation',
        'call',
        'calendar',
        'schedule',
        'communication',
        'work',
    ],
    'peter-john': ['finance', 'investment', 'budget', 'savings', 'money', 'retirement', 'portfolio'],
    'jordan-taylor': ['career', 'job', 'interview', 'networking', 'promotion', 'resume', 'linkedin'],
    'nayan-patel': ['mindfulness', 'stress', 'anxiety', 'calm', 'breathing', 'sleep', 'relaxation'],
};
/**
 * Determine which persona should handle an outreach based on context
 */
export function routeToPersona(outreachType, context = {}, defaultPersona = 'ferni') {
    const searchTerms = [
        outreachType.toLowerCase(),
        context.topic?.toLowerCase(),
        context.habit?.toLowerCase(),
        context.appointment?.toLowerCase(),
    ].filter(Boolean);
    // Score each persona based on matching specialty triggers
    let bestMatch = defaultPersona;
    let bestScore = 0;
    for (const [personaId, specialties] of Object.entries(PERSONA_SPECIALTIES)) {
        let score = 0;
        for (const term of searchTerms) {
            for (const specialty of specialties) {
                if (term.includes(specialty) || specialty.includes(term)) {
                    score++;
                }
            }
        }
        if (score > bestScore) {
            bestScore = score;
            bestMatch = personaId;
        }
    }
    log.debug({ outreachType, searchTerms, bestMatch, bestScore }, 'Routed outreach to persona');
    return bestMatch;
}
/**
 * Check if a persona specializes in a given topic
 */
export function personaSpecializesIn(personaId, topic) {
    const canonical = getCanonicalPersonaId(personaId);
    const specialties = PERSONA_SPECIALTIES[canonical] || [];
    const lowerTopic = topic.toLowerCase();
    return specialties.some((specialty) => lowerTopic.includes(specialty) || specialty.includes(lowerTopic));
}
// ============================================================================
// EXPORTS
// ============================================================================
export const personaOutreachFormatter = {
    loadConfig: loadOutreachVoiceConfig,
    getConfig: getOutreachVoiceConfig,
    getGreeting: getPersonaGreeting,
    getClosing: getPersonaClosing,
    formatSms: formatSmsMessage,
    formatEmail: formatEmailMessage,
    formatVoice: formatVoiceMessage,
    formatVoicemail: formatVoicemailMessage,
    formatPush: formatPushNotification,
    routeToPersona,
    personaSpecializesIn,
};
export default personaOutreachFormatter;
//# sourceMappingURL=persona-outreach-formatter.js.map