/**
 * Relationship Intelligence Tools
 *
 * "Better Than Human" relationship tracking and insights.
 *
 * Features:
 * - Add and manage relationships
 * - Birthday reminders
 * - "Friend's team won!" notifications
 * - "You haven't talked to [person]" reminders
 * - Gift suggestions
 */
import { llm } from '@livekit/agents';
import { z } from 'zod';
import { getLogger } from '../../../../utils/safe-logger.js';
import { getRelationships, saveRelationship, updateLastContact, findRelationshipByName, } from './storage.js';
import { getAllRelationshipInsights, getBirthdayInsights, getContactReminderInsights, generateGiftSuggestions, } from './insights.js';
const log = getLogger();
// ============================================================================
// RELATIONSHIP MANAGEMENT TOOLS
// ============================================================================
export function createRelationshipTools() {
    return {
        addRelationship: llm.tool({
            description: 'Add a new relationship/contact to track. Use this when the user mentions a friend, ' +
                'family member, or important person they want to remember.',
            parameters: z.object({
                userId: z.string().describe('The user ID'),
                name: z.string().describe("Person's name"),
                relationshipType: z
                    .enum([
                    'family_parent',
                    'family_sibling',
                    'family_child',
                    'family_extended',
                    'spouse',
                    'partner',
                    'friend_close',
                    'friend',
                    'friend_acquaintance',
                    'colleague',
                    'mentor',
                    'mentee',
                    'other',
                ])
                    .describe('Type of relationship'),
                nickname: z.string().optional().describe('Optional nickname'),
                birthdayMonth: z.number().min(1).max(12).optional().describe('Birthday month (1-12)'),
                birthdayDay: z.number().min(1).max(31).optional().describe('Birthday day (1-31)'),
                interests: z.array(z.string()).optional().describe('Their interests/hobbies'),
                favoriteTeams: z.array(z.string()).optional().describe('Their favorite sports teams'),
                notes: z.string().optional().describe('Any notes about this person'),
            }),
            execute: async ({ userId, name, relationshipType, nickname, birthdayMonth, birthdayDay, interests, favoriteTeams, notes, }) => {
                log.info({ userId, name, relationshipType }, '➕ Adding relationship');
                const relationship = await saveRelationship(userId, {
                    name,
                    relationshipType: relationshipType,
                    nickname,
                    birthday: birthdayMonth && birthdayDay ? { month: birthdayMonth, day: birthdayDay } : undefined,
                    interests: interests || [],
                    favoriteTeams: favoriteTeams || [],
                    notes,
                });
                let response = `I've added ${name} as your ${relationshipType.replace(/_/g, ' ')}.`;
                if (relationship.birthday) {
                    response += ` I'll remind you about their birthday on ${relationship.birthday.month}/${relationship.birthday.day}.`;
                }
                if (relationship.favoriteTeams.length > 0) {
                    response += ` I'll let you know when the ${relationship.favoriteTeams.join(' or ')} play!`;
                }
                return response;
            },
        }),
        getRelationshipInfo: llm.tool({
            description: 'Get information about a specific relationship/contact.',
            parameters: z.object({
                userId: z.string().describe('The user ID'),
                name: z.string().describe('Name of the person to look up'),
            }),
            execute: async ({ userId, name }) => {
                const relationship = await findRelationshipByName(userId, name);
                if (!relationship) {
                    return `I don't have any information about ${name}. Would you like me to add them?`;
                }
                let info = `${relationship.name}`;
                if (relationship.nickname)
                    info += ` (${relationship.nickname})`;
                info += ` - your ${relationship.relationshipType.replace(/_/g, ' ')}`;
                if (relationship.birthday) {
                    info += `\n📅 Birthday: ${relationship.birthday.month}/${relationship.birthday.day}`;
                }
                if (relationship.interests.length > 0) {
                    info += `\n💡 Interests: ${relationship.interests.join(', ')}`;
                }
                if (relationship.favoriteTeams.length > 0) {
                    info += `\n🏆 Teams: ${relationship.favoriteTeams.join(', ')}`;
                }
                if (relationship.lastContact) {
                    const days = Math.floor((Date.now() - relationship.lastContact.getTime()) / (1000 * 60 * 60 * 24));
                    info += `\n📞 Last contact: ${days} days ago`;
                }
                if (relationship.notes) {
                    info += `\n📝 Notes: ${relationship.notes}`;
                }
                return info;
            },
        }),
        recordContact: llm.tool({
            description: 'Record that the user had contact with someone. Use this when they mention ' +
                'they talked to, called, or met with someone.',
            parameters: z.object({
                userId: z.string().describe('The user ID'),
                name: z.string().describe('Name of the person they contacted'),
            }),
            execute: async ({ userId, name }) => {
                const relationship = await findRelationshipByName(userId, name);
                if (!relationship) {
                    return `I don't have ${name} in your contacts. Would you like me to add them?`;
                }
                await updateLastContact(userId, relationship.id);
                return `Great! I've noted that you connected with ${relationship.name}. 💬`;
            },
        }),
        listRelationships: llm.tool({
            description: 'List all tracked relationships/contacts.',
            parameters: z.object({
                userId: z.string().describe('The user ID'),
                type: z
                    .enum(['all', 'family', 'friends', 'colleagues', 'close'])
                    .optional()
                    .describe('Filter by relationship type'),
            }),
            execute: async ({ userId, type }) => {
                const relationships = await getRelationships(userId);
                if (relationships.length === 0) {
                    return "You haven't added any contacts yet. Tell me about someone important to you!";
                }
                let filtered = relationships;
                if (type && type !== 'all') {
                    switch (type) {
                        case 'family':
                            filtered = relationships.filter((r) => r.relationshipType.startsWith('family') || r.relationshipType === 'spouse');
                            break;
                        case 'friends':
                            filtered = relationships.filter((r) => r.relationshipType.startsWith('friend'));
                            break;
                        case 'colleagues':
                            filtered = relationships.filter((r) => r.relationshipType === 'colleague');
                            break;
                        case 'close':
                            filtered = relationships.filter((r) => [
                                'spouse',
                                'partner',
                                'family_parent',
                                'family_sibling',
                                'family_child',
                                'friend_close',
                            ].includes(r.relationshipType));
                            break;
                    }
                }
                if (filtered.length === 0) {
                    return `No ${type} contacts found.`;
                }
                const list = filtered
                    .map((r) => {
                    let line = `• ${r.name}`;
                    if (r.nickname)
                        line += ` (${r.nickname})`;
                    line += ` - ${r.relationshipType.replace(/_/g, ' ')}`;
                    return line;
                })
                    .join('\n');
                return `Your contacts (${filtered.length}):\n${list}`;
            },
        }),
        // ========================================================================
        // INSIGHT TOOLS
        // ========================================================================
        getUpcomingBirthdays: llm.tool({
            description: 'Get upcoming birthdays from tracked relationships. ' +
                'Use proactively or when user asks about birthdays.',
            parameters: z.object({
                userId: z.string().describe('The user ID'),
            }),
            execute: async ({ userId }) => {
                const insights = await getBirthdayInsights(userId);
                if (insights.length === 0) {
                    return 'No upcoming birthdays in the next week. (Or no birthdays have been added to your contacts.)';
                }
                const messages = insights.map((i) => {
                    let msg = `🎂 ${i.message}`;
                    if (i.suggestion)
                        msg += `\n   ${i.suggestion}`;
                    return msg;
                });
                return messages.join('\n\n');
            },
        }),
        getContactReminders: llm.tool({
            description: "Get reminders about people the user hasn't contacted in a while. " +
                '"Better than human" - we never forget to check in!',
            parameters: z.object({
                userId: z.string().describe('The user ID'),
            }),
            execute: async ({ userId }) => {
                const insights = await getContactReminderInsights(userId);
                if (insights.length === 0) {
                    return "You're all caught up! No one is overdue for a check-in.";
                }
                const messages = insights.slice(0, 5).map((i) => {
                    let msg = `💬 ${i.message}`;
                    if (i.suggestion)
                        msg += `\n   ${i.suggestion}`;
                    return msg;
                });
                return messages.join('\n\n');
            },
        }),
        getGiftSuggestions: llm.tool({
            description: 'Get gift suggestions for a person based on their interests. ' +
                'Use when user needs gift ideas for birthdays, holidays, or special occasions.',
            parameters: z.object({
                userId: z.string().describe('The user ID'),
                name: z.string().describe('Name of the person'),
                occasion: z.string().describe('The occasion (e.g., "birthday", "Christmas", "thank you")'),
                budget: z
                    .enum(['budget', 'moderate', 'premium'])
                    .optional()
                    .describe('Budget level for suggestions'),
            }),
            execute: async ({ userId, name, occasion, budget }) => {
                const relationship = await findRelationshipByName(userId, name);
                if (!relationship) {
                    return `I don't have ${name} in your contacts. Add them first so I can learn their interests!`;
                }
                const suggestions = generateGiftSuggestions(relationship, occasion, budget);
                if (suggestions.length === 0) {
                    return (`I don't have enough information about ${name}'s interests to suggest gifts. ` +
                        `Tell me more about what they like!`);
                }
                const header = `Gift ideas for ${relationship.name}'s ${occasion}:`;
                const list = suggestions
                    .map((s, i) => `${i + 1}. ${s.suggestion}\n   ${s.reason} (${s.priceRange})`)
                    .join('\n\n');
                return `${header}\n\n${list}`;
            },
        }),
        getRelationshipInsights: llm.tool({
            description: 'Get all relationship insights - birthdays, contact reminders, team updates. ' +
                'Use this for a comprehensive relationship check-in.',
            parameters: z.object({
                userId: z.string().describe('The user ID'),
            }),
            execute: async ({ userId }) => {
                const insights = await getAllRelationshipInsights(userId);
                if (insights.length === 0) {
                    return 'No relationship insights right now. Everything looks good with your connections!';
                }
                // Group by type for cleaner presentation
                const grouped = {};
                for (const insight of insights.slice(0, 10)) {
                    const category = insight.type.includes('birthday')
                        ? '🎂 Birthdays'
                        : insight.type.includes('team')
                            ? '🏆 Sports'
                            : insight.type.includes('contact') || insight.type.includes('talked')
                                ? '💬 Check-ins'
                                : '📌 Other';
                    if (!grouped[category])
                        grouped[category] = [];
                    grouped[category].push(insight.message);
                }
                let response = '';
                for (const [category, messages] of Object.entries(grouped)) {
                    response += `\n${category}:\n`;
                    response += messages.map((m) => `• ${m}`).join('\n');
                    response += '\n';
                }
                return response.trim();
            },
        }),
        addInterest: llm.tool({
            description: "Add an interest to a person's profile.",
            parameters: z.object({
                userId: z.string().describe('The user ID'),
                name: z.string().describe('Name of the person'),
                interest: z.string().describe('The interest to add'),
            }),
            execute: async ({ userId, name, interest }) => {
                const relationship = await findRelationshipByName(userId, name);
                if (!relationship) {
                    return `I don't have ${name} in your contacts. Would you like me to add them?`;
                }
                if (relationship.interests.includes(interest.toLowerCase())) {
                    return `${name} already has "${interest}" listed as an interest.`;
                }
                relationship.interests.push(interest.toLowerCase());
                await saveRelationship(userId, relationship);
                return `Got it! I've added "${interest}" to ${name}'s interests. This will help me with gift suggestions! 🎁`;
            },
        }),
        addFavoriteTeam: llm.tool({
            description: "Add a favorite sports team to a person's profile.",
            parameters: z.object({
                userId: z.string().describe('The user ID'),
                name: z.string().describe('Name of the person'),
                team: z.string().describe('The sports team to add'),
            }),
            execute: async ({ userId, name, team }) => {
                const relationship = await findRelationshipByName(userId, name);
                if (!relationship) {
                    return `I don't have ${name} in your contacts. Would you like me to add them?`;
                }
                if (relationship.favoriteTeams.some((t) => t.toLowerCase() === team.toLowerCase())) {
                    return `${name} already has the ${team} listed as a favorite team.`;
                }
                relationship.favoriteTeams.push(team);
                await saveRelationship(userId, relationship);
                return `Got it! I've added the ${team} to ${name}'s favorite teams. I'll let you know when they play! 🏆`;
            },
        }),
    };
}
/**
 * Get tool definitions for relationship intelligence tools
 */
export function getRelationshipToolDefinitions() {
    const tools = createRelationshipTools();
    return [
        {
            id: 'addRelationship',
            name: 'Add Relationship',
            description: 'Add a new relationship/contact to track. Use this when the user mentions a friend, family member, or important person they want to remember.',
            domain: 'information',
            tags: ['relationships', 'contacts', 'add', 'family', 'friends'],
            create: (_ctx) => tools.addRelationship,
        },
        {
            id: 'getRelationshipInfo',
            name: 'Get Relationship Info',
            description: 'Get information about a specific relationship/contact.',
            domain: 'information',
            tags: ['relationships', 'contacts', 'info'],
            create: (_ctx) => tools.getRelationshipInfo,
        },
        {
            id: 'recordContact',
            name: 'Record Contact',
            description: 'Record that the user had contact with someone. Use this when they mention they talked to, called, or met with someone.',
            domain: 'information',
            tags: ['relationships', 'contacts', 'record', 'communication'],
            create: (_ctx) => tools.recordContact,
        },
        {
            id: 'listRelationships',
            name: 'List Relationships',
            description: 'List all tracked relationships/contacts.',
            domain: 'information',
            tags: ['relationships', 'contacts', 'list'],
            create: (_ctx) => tools.listRelationships,
        },
        {
            id: 'getUpcomingBirthdays',
            name: 'Get Upcoming Birthdays',
            description: 'Get upcoming birthdays from tracked relationships. "Better than human" - we never forget a birthday!',
            domain: 'information',
            tags: ['relationships', 'birthdays', 'reminders', 'better-than-human'],
            create: (_ctx) => tools.getUpcomingBirthdays,
        },
        {
            id: 'getContactReminders',
            name: 'Get Contact Reminders',
            description: 'Get reminders about people the user hasn\'t contacted in a while. "Better than human" - we never forget to check in!',
            domain: 'information',
            tags: ['relationships', 'reminders', 'contacts', 'better-than-human'],
            create: (_ctx) => tools.getContactReminders,
        },
        {
            id: 'getGiftSuggestions',
            name: 'Get Gift Suggestions',
            description: 'Get gift suggestions for a person based on their interests. Use when user needs gift ideas for birthdays, holidays, or special occasions.',
            domain: 'information',
            tags: ['relationships', 'gifts', 'suggestions', 'birthdays'],
            create: (_ctx) => tools.getGiftSuggestions,
        },
        {
            id: 'getRelationshipInsights',
            name: 'Get Relationship Insights',
            description: 'Get all relationship insights - birthdays, contact reminders, team updates. Use this for a comprehensive relationship check-in.',
            domain: 'information',
            tags: ['relationships', 'insights', 'overview', 'better-than-human'],
            create: (_ctx) => tools.getRelationshipInsights,
        },
        {
            id: 'addInterestToRelationship',
            name: 'Add Interest to Relationship',
            description: "Add an interest to a person's profile. Helps with gift suggestions and conversation topics.",
            domain: 'information',
            tags: ['relationships', 'interests', 'add'],
            create: (_ctx) => tools.addInterest,
        },
        {
            id: 'addFavoriteTeamToRelationship',
            name: 'Add Favorite Team to Relationship',
            description: 'Add a favorite sports team to a person\'s profile. Enables "Your friend\'s team won!" notifications.',
            domain: 'information',
            tags: ['relationships', 'sports', 'teams', 'add'],
            create: (_ctx) => tools.addFavoriteTeam,
        },
    ];
}
export { getAllRelationshipInsights, getBirthdayInsights, getContactReminderInsights };
export { getRelationships, findRelationshipByName, saveRelationship };
//# sourceMappingURL=index.js.map