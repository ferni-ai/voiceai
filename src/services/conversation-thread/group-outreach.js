/**
 * Group Outreach
 *
 * Enables team roundtables (multiple personas) to proactively reach out
 * to users together. This is the "team reaches out" side of bidirectional
 * engagement.
 *
 * Use cases:
 * - "Maya and Jordan have some ideas for your trip..."
 * - "The team has been thinking about your goals..."
 * - Conference call with multiple personas
 *
 * @module services/conversation-thread/group-outreach
 */
import { createLogger } from '../../utils/safe-logger.js';
import { v4 as uuidv4 } from 'uuid';
import { getOrCreateThread, addMessage } from './thread-manager.js';
import { storeOutreachContext, } from '../outreach/conversation-context-bridge.js';
import { getPersonaOutreachVoice, } from '../outreach/persona-voice-generator.js';
const log = createLogger({ module: 'GroupOutreach' });
// ============================================================================
// PERSONA DISPLAY NAMES
// ============================================================================
const PERSONA_DISPLAY_NAMES = {
    ferni: 'Ferni',
    'peter-john': 'Peter',
    'maya-habits': 'Maya',
    'maya-santos': 'Maya',
    'alex-chen': 'Alex',
    'jordan-taylor': 'Jordan',
    'nayan-sharma': 'Nayan',
    nayan: 'Nayan',
};
function getDisplayName(personaId) {
    return PERSONA_DISPLAY_NAMES[personaId] || personaId;
}
function formatPersonaList(personas) {
    const names = personas.map(getDisplayName);
    if (names.length === 1) {
        return names[0];
    }
    if (names.length === 2) {
        return `${names[0]} and ${names[1]}`;
    }
    return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`;
}
// ============================================================================
// GROUP MESSAGE GENERATION
// ============================================================================
/**
 * Generate a group outreach message where multiple personas speak.
 */
function generateGroupMessage(options, tone = 'casual') {
    const { personas, leadPersona, topic, reason, context } = options;
    const leadVoice = getPersonaOutreachVoice(leadPersona);
    const teamNames = formatPersonaList(personas);
    // Build opening based on team size
    let opening;
    if (personas.length === 2) {
        opening = `Hey! It's ${teamNames}. `;
    }
    else {
        opening = `Hey! The team's here - ${teamNames}. `;
    }
    // Build body based on trigger type
    let body;
    switch (options.triggerType) {
        case 'team_insight':
            body = `We've been talking about ${topic} and had some thoughts we wanted to share with you.`;
            break;
        case 'collaborative_support':
            body = `We noticed you've got a lot going on with ${topic}. Thought we'd put our heads together.`;
            break;
        case 'celebration':
            body = `We wanted to celebrate ${topic} together! This is a big deal.`;
            break;
        case 'planning':
            body = `We've been brainstorming ideas for ${topic} and have some suggestions.`;
            break;
        case 'milestone_approaching':
            body = `${topic} is coming up and we wanted to help you prepare.`;
            break;
        default:
            body = `We've been thinking about ${topic} and wanted to connect.`;
    }
    // Add personalization if available
    let personalization = '';
    if (context?.preferredName) {
        opening = opening.replace('Hey!', `Hey ${context.preferredName}!`);
    }
    if (context?.recentWins?.length) {
        personalization = ` Also, congrats on ${context.recentWins[0]}!`;
    }
    // Build closing based on channel
    let closing;
    if (options.preferredChannel === 'voice' || options.preferredChannel === 'call') {
        closing = ' Jump in when you have a moment?';
    }
    else if (options.preferredChannel === 'sms') {
        closing = ' Reply when you can, no rush!';
    }
    else {
        closing = ' Let us know when works for you.';
    }
    return `${opening}${body}${personalization}${closing}`;
}
/**
 * Generate introduction messages for a group voice call.
 * Each persona introduces themselves briefly.
 */
export function generateGroupCallIntroductions(personas, topic, leadPersona) {
    const introductions = new Map();
    const teamNames = formatPersonaList(personas);
    // Lead persona opens
    introductions.set(leadPersona, `Hey there! It's ${getDisplayName(leadPersona)}. ` +
        `${personas.length > 2 ? 'The team is' : `${formatPersonaList(personas.filter((p) => p !== leadPersona))} is`} here with me. ` +
        `We wanted to talk about ${topic} together.`);
    // Other personas add brief hellos
    for (const personaId of personas) {
        if (personaId === leadPersona)
            continue;
        const voice = getPersonaOutreachVoice(personaId);
        const displayName = getDisplayName(personaId);
        switch (personaId) {
            case 'peter-john':
                introductions.set(personaId, `Hey! Peter here. I've got some thoughts on this.`);
                break;
            case 'maya-habits':
            case 'maya-santos':
                introductions.set(personaId, `Hi! Maya here. Happy to help brainstorm.`);
                break;
            case 'alex-chen':
                introductions.set(personaId, `Alex checking in. Let's figure this out together.`);
                break;
            case 'jordan-taylor':
                introductions.set(personaId, `Jordan here! Excited to plan this with you.`);
                break;
            case 'nayan-sharma':
            case 'nayan':
                introductions.set(personaId, `Nayan here. I'll offer some perspective.`);
                break;
            default:
                introductions.set(personaId, `${displayName} here. Good to connect.`);
        }
    }
    return introductions;
}
// ============================================================================
// GROUP OUTREACH INITIATION
// ============================================================================
/**
 * Initiate outreach from a team of personas.
 */
export async function initiateGroupOutreach(options) {
    const outreachId = uuidv4();
    // Validate - need at least 2 personas for group
    if (options.personas.length < 2) {
        log.warn({ userId: options.userId, personas: options.personas }, 'Group outreach requires at least 2 personas');
        return {
            success: false,
            outreachId,
            threadId: '',
            channel: options.preferredChannel,
            message: '',
            personas: options.personas,
            error: 'Group outreach requires at least 2 personas',
        };
    }
    // Validate - lead persona must be in the group
    if (!options.personas.includes(options.leadPersona)) {
        options.personas = [options.leadPersona, ...options.personas];
    }
    try {
        // Get or create thread
        const thread = await getOrCreateThread(options.userId, options.preferredChannel, options.leadPersona, {
            triggerType: options.triggerType,
            outreachId,
        });
        // Generate the group message
        const message = generateGroupMessage(options);
        // Store outreach context for conversation bridge
        await storeOutreachContext({
            outreachId,
            userId: options.userId,
            type: options.triggerType,
            personaId: options.leadPersona,
            message,
            channel: mapChannelToOutreach(options.preferredChannel),
            sentAt: options.scheduledFor || new Date(),
            reason: options.reason,
            predictedEmotionalState: undefined,
            mlConfidence: undefined,
            suggestedTopics: options.context?.recentTopics,
        });
        // Add message to thread
        await addMessage(thread.id, {
            role: 'agent',
            agentId: options.leadPersona,
            channel: options.preferredChannel,
            direction: 'outbound',
            content: message,
            timestamp: new Date(),
            metadata: {
                outreachId,
                intent: `group_outreach:${options.triggerType}`,
                toolCalls: options.personas.map((p) => `persona:${p}`),
            },
        });
        // Build roundtable config for voice calls
        let roundtableConfig;
        if (options.preferredChannel === 'voice' || options.preferredChannel === 'call') {
            roundtableConfig = {
                roomName: `roundtable_${options.userId}_${outreachId.slice(0, 8)}`,
                personas: options.personas,
                topic: options.topic,
                moderator: options.leadPersona,
                collaborationMode: options.collaborationMode || 'discussion',
                context: {
                    triggerType: options.triggerType,
                    reason: options.reason,
                    outreachId,
                },
            };
        }
        // Queue for delivery (delegated to existing outreach system)
        await queueGroupDelivery(options, outreachId, message, roundtableConfig);
        log.info({
            outreachId,
            userId: options.userId,
            personas: options.personas,
            channel: options.preferredChannel,
            topic: options.topic,
            hasRoundtableConfig: !!roundtableConfig,
        }, '👥 Group outreach initiated');
        return {
            success: true,
            outreachId,
            threadId: thread.id,
            channel: options.preferredChannel,
            message,
            personas: options.personas,
            scheduledFor: options.scheduledFor,
            roundtableConfig,
        };
    }
    catch (error) {
        log.error({ error: String(error), userId: options.userId }, 'Failed to initiate group outreach');
        return {
            success: false,
            outreachId,
            threadId: '',
            channel: options.preferredChannel,
            message: '',
            personas: options.personas,
            error: String(error),
        };
    }
}
// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================
/**
 * Maya and Jordan brainstorm trip/event planning together.
 */
export async function mayaJordanPlanningOutreach(userId, options) {
    return initiateGroupOutreach({
        userId,
        personas: ['maya-habits', 'jordan-taylor'],
        leadPersona: 'jordan-taylor',
        preferredChannel: 'sms',
        triggerType: 'planning',
        reason: `Collaborative planning for ${options.eventName}`,
        topic: options.eventName,
        context: {
            preferredName: options.preferredName,
        },
    });
}
/**
 * Peter and Ferni share research insights together.
 */
export async function peterFerniInsightOutreach(userId, options) {
    return initiateGroupOutreach({
        userId,
        personas: ['peter-john', 'ferni'],
        leadPersona: 'peter-john',
        preferredChannel: 'sms',
        triggerType: 'team_insight',
        reason: `Research insight about ${options.topic}`,
        topic: options.topic,
        context: {
            preferredName: options.preferredName,
        },
    });
}
/**
 * Team celebration with Ferni, Maya, and Jordan.
 */
export async function teamCelebrationOutreach(userId, options) {
    return initiateGroupOutreach({
        userId,
        personas: ['ferni', 'maya-habits', 'jordan-taylor'],
        leadPersona: 'ferni',
        preferredChannel: 'sms',
        triggerType: 'celebration',
        reason: `Celebrating ${options.achievement}`,
        topic: options.achievement,
        priority: 'high',
        context: {
            preferredName: options.preferredName,
            recentWins: options.recentWins || [options.achievement],
        },
    });
}
/**
 * Full team support for someone going through a tough time.
 */
export async function fullTeamSupportOutreach(userId, options) {
    return initiateGroupOutreach({
        userId,
        personas: ['ferni', 'maya-habits', 'nayan-sharma'],
        leadPersona: 'ferni',
        preferredChannel: 'sms',
        triggerType: 'collaborative_support',
        reason: `Team support for ${options.situation}`,
        topic: options.situation,
        priority: 'high',
        collaborationMode: 'support',
        context: {
            preferredName: options.preferredName,
            currentStruggles: options.currentStruggles || [options.situation],
        },
    });
}
/**
 * Initiate a team roundtable voice call.
 */
export async function initiateTeamRoundtableCall(userId, options) {
    return initiateGroupOutreach({
        userId,
        personas: options.personas,
        leadPersona: options.moderator || options.personas[0],
        preferredChannel: 'voice',
        triggerType: 'team_insight',
        reason: options.reason,
        topic: options.topic,
        priority: 'medium',
        collaborationMode: options.collaborationMode || 'discussion',
        context: {
            preferredName: options.preferredName,
        },
    });
}
// ============================================================================
// INTERNAL HELPERS
// ============================================================================
function mapChannelToOutreach(channel) {
    switch (channel) {
        case 'sms':
            return 'sms';
        case 'email':
            return 'email';
        case 'voice':
        case 'call':
            return 'call';
        case 'push':
            return 'push';
        default:
            return 'sms';
    }
}
/**
 * Queue the group outreach for delivery via existing delivery system.
 */
async function queueGroupDelivery(options, outreachId, message, roundtableConfig) {
    try {
        // Import delivery services dynamically to avoid circular deps
        const { deliverOutreach } = await import('../outreach/delivery/index.js');
        // For scheduled deliveries, we'd need a separate scheduler
        // For now, deliver immediately if not scheduled
        if (!options.scheduledFor || options.scheduledFor <= new Date()) {
            const result = await deliverOutreach({
                userId: options.userId,
                channel: mapChannelToOutreach(options.preferredChannel),
                personaId: options.leadPersona,
                message,
                outreachId,
            });
            if (result.success) {
                log.info({ outreachId, messageId: result.messageId }, 'Group outreach delivered');
            }
            else {
                log.warn({ outreachId, error: result.error }, 'Group outreach delivery failed');
            }
        }
        else {
            log.debug({ outreachId, scheduledFor: options.scheduledFor }, 'Group outreach scheduled for later (not yet implemented)');
        }
    }
    catch (error) {
        // Graceful degradation - log but don't fail
        log.warn({ error: String(error), outreachId }, 'Failed to deliver group outreach (delivery system may not be available)');
    }
}
// ============================================================================
// EXPORTS
// ============================================================================
export const groupOutreach = {
    initiateGroupOutreach,
    generateGroupCallIntroductions,
    mayaJordanPlanningOutreach,
    peterFerniInsightOutreach,
    teamCelebrationOutreach,
    fullTeamSupportOutreach,
    initiateTeamRoundtableCall,
};
//# sourceMappingURL=group-outreach.js.map