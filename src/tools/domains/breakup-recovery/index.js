/**
 * Breakup Recovery Domain
 *
 * Tools for healing from heartbreak and rebuilding after relationship end.
 * Grief is the price of having loved, and it's worth paying.
 *
 * DOMAIN: breakup-recovery
 * PERSONA AFFINITY: Ferni (emotional support), Maya (habits), Nayan (wisdom)
 *
 * TOOLS:
 *   Processing: processBreakup, grievingRelationship
 *   Healing: noContact, rebuildIdentity, rediscoverSelf
 *
 * PRINCIPLES:
 * - Heartbreak is real grief - treat it as such
 * - Healing isn't linear - expect waves
 * - The goal isn't to forget but to integrate
 * - Your worth wasn't diminished by the ending
 */
import { createDomainExport } from '../../registry/loader.js';
import { llm } from '@livekit/agents';
import { z } from 'zod';
import { getLogger } from '../../../utils/safe-logger.js';
import { getToolDescription } from '../../utils/tool-descriptions.js';
const log = getLogger();
// ============================================================================
// GRIEF STAGES FOR BREAKUPS
// ============================================================================
const BREAKUP_STAGES = {
    shock: {
        description: 'Initial disbelief, numbness, surreal feeling',
        normal: ['Crying unpredictably', 'Difficulty eating/sleeping', 'Obsessive thinking'],
        helpful: ['Accept the feelings', "Don't make big decisions", 'Let yourself be in shock'],
    },
    denial: {
        description: 'Hope for reconciliation, minimizing the ending',
        normal: ['Checking their social media', "Imagining they'll come back", 'Bargaining'],
        helpful: [
            "Write about what happened (don't send)",
            'Limit social media checking',
            'Talk to trusted friends',
        ],
    },
    anger: {
        description: 'Rage at them, yourself, or the situation',
        normal: ['Blaming them or yourself', 'Wanting them to hurt too', 'Irritability'],
        helpful: ['Exercise', 'Journal the anger out', 'Healthy release (not contact)'],
    },
    bargaining: {
        description: 'What if I had done differently...',
        normal: ['Replay conversations', 'Promise to change', 'Magical thinking'],
        helpful: ["Recognize you can't control others", 'Focus on acceptance', 'Stop the "what ifs"'],
    },
    depression: {
        description: 'Deep sadness about the loss',
        normal: ['Isolation', 'Loss of interest', 'Feeling empty'],
        helpful: [
            'Be gentle with yourself',
            'Maintain basic self-care',
            'Professional support if needed',
        ],
    },
    acceptance: {
        description: 'Coming to peace with reality',
        normal: ['Thinking about them less', 'Feeling okay being alone', 'Looking forward'],
        helpful: ['Notice the progress', 'Build new routines', 'Rediscover yourself'],
    },
};
// ============================================================================
// TOOL: Process Breakup
// ============================================================================
const processBreakupDef = {
    id: 'processBreakup',
    name: 'Process Breakup',
    description: 'Work through the initial pain of a breakup',
    domain: 'breakup-recovery',
    tags: ['breakup', 'heartbreak', 'processing', 'grief'],
    create: (ctx) => {
        return llm.tool({
            description: getToolDescription('processBreakup'),
            parameters: z.object({
                howRecent: z.string().describe('How recent is the breakup'),
                whoEnded: z.enum(['they', 'i', 'mutual']).describe('Who initiated the breakup'),
                currentFeeling: z.string().describe("What you're feeling right now"),
            }),
            execute: async ({ howRecent, whoEnded, currentFeeling }) => {
                log.info({ agentId: ctx.agentId }, 'Processing breakup');
                let response = '';
                response += "**I'm here. I'm sorry you're going through this.**\n\n";
                // Validate
                response += `You said it's been ${howRecent}, and you're feeling "${currentFeeling}". `;
                response += 'That makes complete sense. Breakups are one of the most painful experiences. ';
                response += "What you're feeling is valid, whatever it is.\n\n";
                // Who ended it context
                const initiatorContext = {
                    they: 'Being broken up with carries extra pain - rejection, loss of control, blindsided feeling. Your brain is processing abandonment pain, which activates the same areas as physical pain.',
                    i: "Ending it doesn't mean it doesn't hurt. Even when it was the right choice, you're still grieving - the loss of a future you imagined, of a person you loved, of a part of your life.",
                    mutual: "Even mutual endings hurt. The sadness of two people who loved each other acknowledging they can't make it work is its own kind of grief.",
                };
                response += `**About who ended it:**\n${initiatorContext[whoEnded]}\n\n`;
                // What to expect
                response += '**What to expect:**\n';
                response += '• Grief comes in waves, not stages\n';
                response += '• Good days and bad days are normal\n';
                response += '• Mornings and nights are often hardest\n';
                response +=
                    '• It takes longer than you think (research says ~3 months for every year together)\n';
                response += "• Healing isn't linear - setbacks don't erase progress\n\n";
                // Immediate guidance
                response += '**Right now, focus on:**\n';
                response += '• Basic self-care (eating, sleeping, basic hygiene)\n';
                response += '• Support system (tell at least one person)\n';
                response += "• One day at a time (don't think too far ahead)\n";
                response += '• No major decisions (wait at least 3 months)\n';
                response += '• Be gentle with yourself\n\n';
                response += "**What you don't have to do yet:**\n";
                response += '• Move on\n';
                response += '• Feel better\n';
                response += '• Understand why\n';
                response += '• Forgive\n';
                response += '• Be okay\n\n';
                response += 'You just have to survive today. What do you need right now?';
                return response;
            },
        });
    },
};
// ============================================================================
// TOOL: Grieving a Relationship
// ============================================================================
const grievingRelationshipDef = {
    id: 'grievingRelationship',
    name: 'Grieving a Relationship',
    description: 'Understand and process relationship grief',
    domain: 'breakup-recovery',
    tags: ['breakup', 'grief', 'loss', 'processing'],
    create: (ctx) => {
        return llm.tool({
            description: getToolDescription('grievingRelationship'),
            parameters: z.object({
                currentStage: z
                    .enum(['shock', 'denial', 'anger', 'bargaining', 'depression', 'acceptance', 'unsure'])
                    .optional()
                    .describe('Where do you think you are in grief'),
            }),
            execute: async ({ currentStage }) => {
                log.info({ agentId: ctx.agentId }, 'Working through relationship grief');
                let response = '';
                response += '**Grieving a relationship:**\n\n';
                response += "Breakup grief is REAL grief. You're mourning:\n";
                response += '• The person you loved\n';
                response += '• The future you imagined together\n';
                response += '• The daily presence in your life\n';
                response += '• Part of your identity\n';
                response += '• Shared friends, habits, inside jokes\n\n';
                response += '**The stages (non-linear):**\n\n';
                for (const [stage, info] of Object.entries(BREAKUP_STAGES)) {
                    const isCurrent = currentStage === stage;
                    response += `**${stage.charAt(0).toUpperCase() + stage.slice(1)}**${isCurrent ? ' ← (you are here)' : ''}:\n`;
                    response += `${info.description}\n`;
                    if (isCurrent) {
                        response += `*Normal feelings/behaviors:* ${info.normal.join(', ')}\n`;
                        response += `*What helps:* ${info.helpful.join(', ')}\n`;
                    }
                    response += '\n';
                }
                // Wave metaphor
                response += '**The wave metaphor:**\n';
                response += 'Grief comes in waves, not stages. Some days the waves are crashing. ';
                response += "Some days they're gentle. Over time, the waves come less often ";
                response += 'and you get better at swimming.\n\n';
                // Important truths
                response += '**Important truths:**\n';
                response += '• Grief is love with nowhere to go\n';
                response += "• Feeling doesn't mean you should reach out\n";
                response += "• Missing them doesn't mean you should be together\n";
                response += '• Healing takes as long as it takes\n\n';
                response += 'Where do you feel you are right now in this process?';
                return response;
            },
        });
    },
};
// ============================================================================
// TOOL: No Contact
// ============================================================================
const noContactDef = {
    id: 'noContact',
    name: 'No Contact',
    description: 'Understand and implement no contact for healing',
    domain: 'breakup-recovery',
    tags: ['breakup', 'no-contact', 'boundaries', 'healing'],
    create: (ctx) => {
        return llm.tool({
            description: getToolDescription('noContact'),
            parameters: z.object({
                struggle: z
                    .enum([
                    'want-to-reach-out',
                    'they-reach-out',
                    'social-media',
                    'mutual-friends',
                    'stuff-exchange',
                ])
                    .describe('What aspect of no contact is hard'),
            }),
            execute: async ({ struggle }) => {
                log.info({ agentId: ctx.agentId, struggle }, 'Supporting no contact');
                let response = '';
                response += "**No contact isn't punishment - it's medicine.**\n\n";
                response += '**Why no contact works:**\n';
                response += '• Every contact reopens the wound\n';
                response += '• Your brain needs to detach (like withdrawal)\n';
                response += "• Contact keeps hope alive (even when it shouldn't be)\n";
                response += "• You can't heal while still picking at the wound\n";
                response += '• Space lets you see the relationship more clearly\n\n';
                // Address specific struggle
                const struggleResponses = {
                    'want-to-reach-out': "**When you want to reach out:**\n• The urge is normal - it's withdrawal\n• Wait 24 hours. The urge usually passes\n• Write what you'd say in a note app (don't send)\n• Ask: What do I hope to get? Will I actually get it?\n• Call a friend instead\n• Remember why you're doing this",
                    'they-reach-out': "**When they reach out:**\n• You don't have to respond\n• Breadcrumbs keep you hooked without commitment\n• If you must respond, keep it brief and neutral\n• Don't interpret the contact as more than it is\n• Ask: Does this change anything fundamental?",
                    'social-media': "**Social media no contact:**\n• Unfollow/mute them (at minimum)\n• Stop checking their profile\n• Remove their tagged photos from your feed\n• Consider unfollowing mutual friends temporarily\n• Delete message threads so you can't reread\n• Every check resets your healing clock",
                    'mutual-friends': "**Navigating mutual friends:**\n• You can ask them not to report on your ex\n• Decline events where they'll definitely be (for now)\n• You don't have to share details with mutuals\n• Friends should support YOUR healing, not play messenger",
                    'stuff-exchange': '**Handling stuff exchange:**\n• Do it once, quickly, with minimal interaction\n• Use an intermediary if possible\n• Mail things if you can\n• Don\'t use it as an excuse to talk\n• If they keep "forgetting" things, it\'s not about the stuff',
                };
                response += struggleResponses[struggle] + '\n\n';
                // The minimum
                response += '**Minimum no contact period:**\n';
                response += '• 30 days is the minimum for any clarity\n';
                response += '• 60-90 days is more realistic for significant relationships\n';
                response += '• Some recommend until you no longer feel the pull\n\n';
                // Self-compassion
                response += '**If you break no contact:**\n';
                response += "Don't shame yourself. Start again. Each attempt makes you stronger.\n\n";
                response += "What's making no contact hard for you right now?";
                return response;
            },
        });
    },
};
// ============================================================================
// TOOL: Rebuild Identity
// ============================================================================
const rebuildIdentityDef = {
    id: 'rebuildIdentity',
    name: 'Rebuild Identity',
    description: 'Rediscover who you are outside the relationship',
    domain: 'breakup-recovery',
    tags: ['breakup', 'identity', 'self-discovery', 'growth'],
    create: (ctx) => {
        return llm.tool({
            description: getToolDescription('rebuildIdentity'),
            parameters: z.object({
                relationshipLength: z.string().describe('How long was the relationship'),
            }),
            execute: async ({ relationshipLength }) => {
                log.info({ agentId: ctx.agentId }, 'Rebuilding identity');
                let response = '';
                response += `**Rebuilding yourself after ${relationshipLength}:**\n\n`;
                response += 'In long relationships, we become a "we." ';
                response += 'Now you need to rediscover the "I."\n\n';
                response += '**What you might have lost:**\n';
                response += '• Your own preferences (what do YOU actually like?)\n';
                response += '• Friendships you let drift\n';
                response += '• Hobbies you gave up\n';
                response += '• Dreams you compromised\n';
                response += '• Parts of yourself you dimmed to fit\n\n';
                response += '**Questions to explore:**\n';
                response += '• What did you enjoy before this relationship?\n';
                response += '• What do you want your daily routine to look like?\n';
                response += '• Who are YOU, not half of a couple?\n';
                response += '• What have you always wanted to try?\n';
                response += '• What values matter most to you?\n';
                response += '• What kind of life do you want to build?\n\n';
                response += '**Reclaiming activities:**\n';
                response += "• Try things you couldn't do in the relationship\n";
                response += '• Revisit old hobbies\n';
                response += '• Make your space YOUR space\n';
                response += '• Reconnect with friends you lost touch with\n';
                response += '• Start something brand new\n\n';
                // The opportunity
                response += '**The hidden opportunity:**\n';
                response +=
                    'Loss creates space. This is painful but also a rare chance to rebuild yourself ';
                response += 'intentionally, not by default. Who do you want to become?\n\n';
                response += "What's one thing you lost during the relationship that you want to reclaim?";
                return response;
            },
        });
    },
};
// ============================================================================
// TOOL: Rediscover Self
// ============================================================================
const rediscoverSelfDef = {
    id: 'rediscoverSelf',
    name: 'Rediscover Self',
    description: 'Reconnect with yourself after heartbreak',
    domain: 'breakup-recovery',
    tags: ['breakup', 'self-discovery', 'identity', 'healing'],
    create: (ctx) => {
        return llm.tool({
            description: getToolDescription('rediscoverSelf'),
            parameters: z.object({}),
            execute: async () => {
                log.info('Guiding self-rediscovery');
                let response = '';
                response += '**Rediscovering yourself:**\n\n';
                response += 'After a breakup, you get yourself back. ';
                response += "Let's explore who that is.\n\n";
                response += "**The 'I Wonder' exercise:**\n";
                response += 'Start sentences with "I wonder..." - no judgment:\n';
                response += "• I wonder what kind of morning routine I'd love\n";
                response += "• I wonder what I'd do with my weekends\n";
                response += '• I wonder what brings me genuine joy\n';
                response += "• I wonder what I've always wanted to try\n";
                response += "• I wonder who I'd become without this relationship defining me\n\n";
                response += '**Solo dates:**\n';
                response += 'Take yourself on dates. Not to feel less lonely, but to learn:\n';
                response += "• What you like to eat when it's just your choice\n";
                response += '• What movies you choose for yourself\n';
                response += "• How you spend a day with no one else's preferences\n";
                response += "• What makes you laugh when you're alone\n\n";
                response += '**The mirror work:**\n';
                response += 'Look at yourself and ask:\n';
                response += '• What do I value most?\n';
                response += '• What are my non-negotiables?\n';
                response += '• What makes me feel alive?\n';
                response += '• What do I need in order to thrive?\n';
                response += '• Who am I when no one is watching?\n\n';
                response += '**Gentle daily practices:**\n';
                response += '• Morning check-in: How am I feeling today?\n';
                response += '• Make one choice just for you each day\n';
                response += "• Notice what you're drawn to without judgment\n";
                response += "• Journal about who you're becoming\n\n";
                response += '**Remember:**\n';
                response += "You existed before them. You'll exist fully again. This is the process.\n\n";
                response += "What's one thing you know about yourself that you want to honor?";
                return response;
            },
        });
    },
};
// ============================================================================
// DOMAIN TOOLS COLLECTION
// ============================================================================
const breakupRecoveryTools = [
    processBreakupDef,
    grievingRelationshipDef,
    noContactDef,
    rebuildIdentityDef,
    rediscoverSelfDef,
];
// ============================================================================
// EXPORTS
// ============================================================================
export const { getToolDefinitions, domain, definitions } = createDomainExport('breakup-recovery', breakupRecoveryTools);
export default getToolDefinitions;
//# sourceMappingURL=index.js.map