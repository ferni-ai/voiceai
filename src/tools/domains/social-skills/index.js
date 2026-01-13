/**
 * Social Skills Domain
 *
 * Tools for making friends as an adult, navigating social situations,
 * and building meaningful connections. Addresses the loneliness epidemic.
 *
 * DOMAIN: social-skills
 * PERSONA AFFINITY: Alex (communication), Ferni (emotional support)
 *
 * TOOLS:
 *   Making Friends: makeFriendsAsAdult, joinNewGroups, deepenAcquaintance
 *   Conversation: startConversation, smallTalkMastery
 *   Social Anxiety: navigateSocialAnxiety, handleSocialRejection
 *   Maintenance: maintainFriendships, networkAuthentically
 *
 * PRINCIPLES:
 * - Adult friendship is harder but possible
 * - Quality over quantity of connections
 * - Vulnerability builds intimacy
 * - Everyone is nervous; you're not alone
 */
import { createDomainExport } from '../../registry/loader.js';
import { llm } from '@livekit/agents';
import { z } from 'zod';
import { getLogger } from '../../../utils/safe-logger.js';
import { getToolDescription } from '../../utils/tool-descriptions.js';
import { getLifeCoachingProfile, updateLifeCoachingProfile, } from '../life-coaching-shared/user-profile.js';
const log = getLogger();
// ============================================================================
// FRIENDSHIP DEVELOPMENT STAGES
// ============================================================================
const FRIENDSHIP_STAGES = {
    stranger: {
        goal: 'Make contact',
        actions: ['Smile and make brief eye contact', 'Simple greeting', 'Find shared context'],
        duration: 'Single interaction',
        signs: ['They notice you exist'],
    },
    acquaintance: {
        goal: 'Create positive associations',
        actions: [
            'Remember their name',
            'Show genuine interest',
            'Find shared interests',
            'Be reliably pleasant',
        ],
        duration: '3-5 interactions',
        signs: ['They remember you', 'Pleasant but surface conversation'],
    },
    casualFriend: {
        goal: 'Establish reliability',
        actions: ['Initiate contact', 'Make plans', 'Show up consistently', 'Share some personal info'],
        duration: '2-3 months',
        signs: ['You make plans intentionally', 'Occasional texts/contact'],
    },
    friend: {
        goal: 'Build trust and reciprocity',
        actions: ['Share vulnerably', 'Be there in hard times', 'Celebrate wins', 'Give and take'],
        duration: '6-12 months',
        signs: ['Mutual effort', 'Can share real struggles', 'Genuine care'],
    },
    closeFriend: {
        goal: 'Deep mutual investment',
        actions: [
            'Prioritize the relationship',
            'Navigate conflict',
            'Accept imperfection',
            'Show up big',
        ],
        duration: 'Years',
        signs: ['They know your shadow', 'Unconditional support', 'History together'],
    },
};
// ============================================================================
// CONVERSATION TOOLKIT
// ============================================================================
const CONVERSATION_STARTERS = {
    situational: [
        'How do you know [host/organizer]?',
        'What brings you here today?',
        'Have you been to one of these before?',
        'What do you think of [venue/event/food]?',
    ],
    curious: [
        "What's keeping you busy these days?",
        'What are you excited about lately?',
        'What do you do for fun outside of work?',
        'Working on anything interesting?',
    ],
    deeper: [
        'What made you get into [their field/hobby]?',
        "What's your story?",
        "What's something you're working on that excites you?",
        "What's been on your mind lately?",
    ],
    followUp: [
        'Tell me more about that.',
        'What was that like?',
        'How did you feel about that?',
        'What happened next?',
    ],
};
const SOCIAL_ANXIETY_COPING = {
    before: [
        'Set a realistic goal (one meaningful conversation)',
        'Prepare 2-3 conversation topics',
        'Remember: most people are also nervous',
        'Plan your exit strategy (reduces trapped feeling)',
        "Decide on your 'done' signal - when can you leave?",
    ],
    during: [
        'Focus on the other person, not yourself',
        'Use grounding (feel your feet, breathe)',
        "It's okay to take bathroom breaks",
        'You can leave early - you showed up, that counts',
        'Everyone is too worried about themselves to judge you',
    ],
    after: [
        'Acknowledge your courage for showing up',
        "Don't overanalyze every interaction",
        'Note what went well, not just what was awkward',
        'Plan recovery time (social events are tiring)',
        'Be gentle with yourself',
    ],
};
// ============================================================================
// TOOL: Make Friends as Adult
// ============================================================================
const makeFriendsAsAdultDef = {
    id: 'makeFriendsAsAdult',
    name: 'Make Friends as Adult',
    description: 'Systematic approach to building adult friendships',
    domain: 'social-skills',
    tags: ['social', 'friendship', 'adult', 'connection', 'loneliness'],
    create: (ctx) => {
        return llm.tool({
            description: getToolDescription('makeFriendsAsAdult'),
            parameters: z.object({
                situation: z
                    .enum(['new-city', 'lost-friends', 'work-only', 'general-lonely', 'want-more-friends'])
                    .describe('What brought you here'),
                currentCircle: z
                    .enum(['none', 'one-or-two', 'acquaintances-only', 'some-friends'])
                    .optional()
                    .describe('Current friendship situation'),
                barrier: z.string().optional().describe('What feels like the biggest barrier'),
            }),
            execute: async ({ situation, currentCircle, barrier }) => {
                log.info({ agentId: ctx.agentId, situation }, 'Helping make friends as adult');
                const profile = await getLifeCoachingProfile(ctx.userId);
                let response = '';
                // Validate the struggle
                const situationResponses = {
                    'new-city': "Starting over in a new place is genuinely hard. You're building from scratch, and that takes time.",
                    'lost-friends': 'Friendships fading is painful - and common. Life changes, people drift. It says nothing about your worth.',
                    'work-only': 'When work is your only social outlet, it can feel hollow. You deserve friendships that exist because people like you, not because you share a Slack channel.',
                    'general-lonely': "Loneliness is an epidemic - you're not alone in feeling alone. And it's okay to want more connection.",
                    'want-more-friends': 'Wanting deeper or more friendships is healthy. It means you value connection.',
                };
                response += situationResponses[situation] + '\n\n';
                // Address specific barrier
                if (barrier) {
                    response += `You mentioned the barrier: "${barrier}". Let's address that.\n\n`;
                }
                // The truth about adult friendship
                response += '**The reality of adult friendship:**\n';
                response += '• It requires intentional effort (unlike school/work proximity)\n';
                response += '• It takes time - close friendships typically need 50+ hours together\n';
                response += '• It requires vulnerability (someone has to go first)\n';
                response += "• It involves rejection sometimes - and that's okay\n\n";
                // Show the stages
                response += '**How friendships develop:**\n\n';
                for (const [stage, info] of Object.entries(FRIENDSHIP_STAGES).slice(0, 4)) {
                    response += `**${stage.charAt(0).toUpperCase() + stage.slice(1)}**: ${info.goal}\n`;
                    response += `   → ${info.actions.slice(0, 2).join(', ')}\n`;
                    response += `   → Takes: ${info.duration}\n\n`;
                }
                // Practical first steps
                response += '**Practical first steps:**\n';
                response +=
                    '1. **Find your third places** - Where can you show up regularly? (gym, class, club, coffee shop)\n';
                response +=
                    '2. **Be a regular** - Same time, same place, same face. Familiarity breeds friendship.\n';
                response += '3. **Start small** - A smile, a comment, remembering their name\n';
                response +=
                    '4. **Take the initiative** - Someone has to make the first move. Why not you?\n';
                response += '5. **Suggest a hangout** - Coffee, walk, activity. Low stakes.\n\n';
                // Update profile
                await updateLifeCoachingProfile(ctx.userId, {
                    friendshipCircle: {
                        inner: 0,
                        close: currentCircle === 'some-friends' ? 2 : currentCircle === 'one-or-two' ? 1 : 0,
                        casual: currentCircle === 'acquaintances-only' ? 5 : 2,
                        desired: 'exploring',
                    },
                });
                response += 'What feels like the most realistic first step for you?';
                return response;
            },
        });
    },
};
// ============================================================================
// TOOL: Start Conversation
// ============================================================================
const startConversationDef = {
    id: 'startConversation',
    name: 'Start Conversation',
    description: 'Initiate conversations with confidence using proven openers',
    domain: 'social-skills',
    tags: ['social', 'conversation', 'small-talk', 'approach'],
    create: (ctx) => {
        return llm.tool({
            description: getToolDescription('startConversation'),
            parameters: z.object({
                context: z
                    .enum([
                    'party',
                    'networking',
                    'class',
                    'gym',
                    'coffee-shop',
                    'workplace',
                    'online',
                    'random',
                ])
                    .describe('Where are you starting the conversation'),
                goal: z
                    .enum(['make-friend', 'be-polite', 'network', 'romantic', 'just-practice'])
                    .optional()
                    .describe('What you hope to get from it'),
            }),
            execute: async ({ context, goal }) => {
                log.info({ agentId: ctx.agentId, context, goal }, 'Helping start conversation');
                let response = '';
                response += `**Starting conversations at a ${context.replace('-', ' ')}:**\n\n`;
                // Context-specific openers
                const contextOpeners = {
                    party: [
                        'How do you know [host]?',
                        'I love this song - do you know what it is?',
                        'Have you tried the [food/drinks]?',
                        "I don't know many people here - I'm [name].",
                    ],
                    networking: [
                        'What brings you to this event?',
                        'What do you do? (follow up with genuine curiosity)',
                        'Have you been to these before?',
                        'What are you hoping to get out of tonight?',
                    ],
                    class: [
                        'What made you sign up for this?',
                        'Is this your first time?',
                        'How are you finding it so far?',
                        'Any tips for a newbie?',
                    ],
                    gym: [
                        'Hey, how many sets do you have left?',
                        'Is this [class/machine] good?',
                        "I see you here a lot - I'm [name].",
                        '(After class) That was tough! How long have you been coming?',
                    ],
                    'coffee-shop': [
                        "(To regular) I always see you here - I'm [name].",
                        'What are you reading/working on?',
                        'Any recommendations here?',
                        'Do you mind if I sit here?',
                    ],
                    workplace: [
                        "I don't think we've properly met - I'm [name] from [team].",
                        'How long have you been here?',
                        'What do you actually do? I never quite understood your role.',
                        'Want to grab coffee sometime?',
                    ],
                    online: [
                        'Reference something specific from their profile',
                        'Ask an open-ended question',
                        'Share something genuine about yourself',
                        "Don't just say 'hey' - give them something to respond to",
                    ],
                    random: [
                        'Comment on shared context (weather, line, event)',
                        'Ask for their opinion/recommendation',
                        'Offer a genuine compliment + follow up question',
                        "Simple: Hi, I'm [name]. [observation about context]",
                    ],
                };
                response += '*Openers that work:*\n';
                (contextOpeners[context] || contextOpeners.random).forEach((opener) => {
                    response += `• "${opener}"\n`;
                });
                // Follow-up techniques
                response += '\n**Keep it going:**\n';
                CONVERSATION_STARTERS.followUp.forEach((f) => {
                    response += `• "${f}"\n`;
                });
                // Key principles
                response += '\n**Remember:**\n';
                response += '• The goal is connection, not performance\n';
                response += '• Be curious about them - people love talking about themselves\n';
                response += '• Listen more than you speak\n';
                response += "• It's okay if it goes nowhere - not every conversation becomes friendship\n";
                response +=
                    "• Awkwardness is survivable. You'll forget about it faster than you think.\n\n";
                // Goal-specific advice
                if (goal === 'romantic') {
                    response +=
                        '**Since this is romantic:** The same principles apply. Genuine interest > pickup lines. But read body language and respect signals.\n';
                }
                else if (goal === 'just-practice') {
                    response +=
                        "**Since you're practicing:** Great! Low stakes = freedom to experiment. Try different openers and see what feels natural.\n";
                }
                response += 'Want to practice one of these? Say it out loud and notice how it feels.';
                return response;
            },
        });
    },
};
// ============================================================================
// TOOL: Navigate Social Anxiety
// ============================================================================
const navigateSocialAnxietyDef = {
    id: 'navigateSocialAnxiety',
    name: 'Navigate Social Anxiety',
    description: 'Cope with anxiety in social situations',
    domain: 'social-skills',
    tags: ['social', 'anxiety', 'coping', 'nervous'],
    create: (ctx) => {
        return llm.tool({
            description: getToolDescription('navigateSocialAnxiety'),
            parameters: z.object({
                timing: z.enum(['before', 'during', 'after']).describe('When is the anxiety happening'),
                situation: z.string().optional().describe('What social situation'),
                intensity: z
                    .enum(['mild', 'moderate', 'severe'])
                    .optional()
                    .describe('How intense is the anxiety'),
            }),
            execute: async ({ timing, situation, intensity }) => {
                log.info({ agentId: ctx.agentId, timing, intensity }, 'Helping navigate social anxiety');
                const profile = await getLifeCoachingProfile(ctx.userId);
                let response = '';
                // Validate the anxiety
                response += 'Social anxiety is incredibly common - and incredibly uncomfortable. ';
                response += "The goal isn't to eliminate it (impossible) but to function alongside it.\n\n";
                if (situation) {
                    response += `Facing "${situation}" sounds challenging. Let's prepare.\n\n`;
                }
                // Timing-specific strategies
                response += `**${timing.charAt(0).toUpperCase() + timing.slice(1)} the social situation:**\n\n`;
                SOCIAL_ANXIETY_COPING[timing].forEach((strategy) => {
                    response += `• ${strategy}\n`;
                });
                // Intensity-specific additions
                if (intensity === 'severe') {
                    response += '\n**For intense anxiety:**\n';
                    response +=
                        '• Use the physiological sigh: deep breath in, second small breath, long exhale\n';
                    response += '• Grounding: feel your feet, name 5 things you see\n';
                    response += '• You have permission to leave if needed. Showing up counts.\n';
                    response += '• Consider whether professional support would help\n';
                }
                // Cognitive reframes
                response += '\n**Reframes that help:**\n';
                response += '• "They\'re too busy worrying about themselves to judge me"\n';
                response +=
                    '• "Awkwardness is survivable. I\'ve survived 100% of awkward moments so far"\n';
                response += '• "I don\'t have to be interesting. I just have to be interested"\n';
                response +=
                    '• "The discomfort of going is temporary. The regret of not going might last longer"\n\n';
                // Update profile
                await updateLifeCoachingProfile(ctx.userId, {
                    socialAnxiety: {
                        level: intensity || 'moderate',
                        triggers: situation ? [situation] : [],
                        coping: ['explored strategies'],
                    },
                });
                if (timing === 'before') {
                    response += 'Would you like to practice a coping technique together before you go?';
                }
                else if (timing === 'during') {
                    response +=
                        "You're already being brave by being there. What's one small thing you can do right now?";
                }
                else {
                    response += "How do you feel now that it's over? What went better than expected?";
                }
                return response;
            },
        });
    },
};
// ============================================================================
// TOOL: Deepen Acquaintance
// ============================================================================
const deepenAcquaintanceDef = {
    id: 'deepenAcquaintance',
    name: 'Deepen Acquaintance',
    description: 'Move from acquaintance to friend - the hardest transition',
    domain: 'social-skills',
    tags: ['social', 'friendship', 'deepening', 'intimacy'],
    create: (ctx) => {
        return llm.tool({
            description: getToolDescription('deepenAcquaintance'),
            parameters: z.object({
                personDescription: z.string().describe('Who is this acquaintance'),
                currentLevel: z
                    .enum(['just-met', 'see-regularly', 'have-their-number', 'hung-out-once'])
                    .describe('Current relationship level'),
                barrier: z.string().optional().describe('What stops you from going deeper'),
            }),
            execute: async ({ personDescription, currentLevel, barrier }) => {
                log.info({ agentId: ctx.agentId, currentLevel }, 'Helping deepen acquaintance');
                let response = '';
                response += `Deepening your connection with "${personDescription}".\n\n`;
                // Acknowledge the challenge
                response +=
                    'Moving from acquaintance to friend is the **hardest transition** in adult friendship. ';
                response += 'It requires someone to take a risk. Why not you?\n\n';
                // Current level assessment
                const levelAdvice = {
                    'just-met': [
                        'See them again in the same context',
                        'Remember their name and something they said',
                        'Be consistent - show up regularly where they are',
                        'Next: Exchange contact info',
                    ],
                    'see-regularly': [
                        'Start conversations beyond pleasantries',
                        'Find out what they care about',
                        'Suggest grabbing coffee/lunch sometime',
                        'Next: Move it outside your regular context',
                    ],
                    'have-their-number': [
                        "Actually reach out (don't let their number rot)",
                        "Suggest a specific activity: 'Want to [X] this weekend?'",
                        'Follow up on things they mentioned',
                        'Next: Make plans and follow through',
                    ],
                    'hung-out-once': [
                        "Plan a second hangout - don't wait too long",
                        'Share something personal (vulnerability builds connection)',
                        'Introduce them to other parts of your life',
                        'Next: Make it a pattern, not a one-time thing',
                    ],
                };
                response += '**Where you are:**\n';
                levelAdvice[currentLevel].forEach((advice) => {
                    response += `• ${advice}\n`;
                });
                // Address barrier
                if (barrier) {
                    response += `\n**About your barrier** ("${barrier}"):\n`;
                    if (barrier.toLowerCase().includes('busy') || barrier.toLowerCase().includes('time')) {
                        response +=
                            'Everyone is busy. The question is: is this connection worth making time for? If yes, schedule it.\n';
                    }
                    else if (barrier.toLowerCase().includes('weird') ||
                        barrier.toLowerCase().includes('awkward')) {
                        response +=
                            "'Won't it be weird?' - Maybe a tiny bit. But people are usually flattered when someone wants to be their friend. The weirdness passes.\n";
                    }
                    else if (barrier.toLowerCase().includes('reject') ||
                        barrier.toLowerCase().includes('no')) {
                        response +=
                            "They might say no. That's okay. It's not a rejection of YOU - it's a reflection of their capacity/interest/timing.\n";
                    }
                    else {
                        response +=
                            "Whatever is holding you back, ask: What's the cost of not trying? Probably higher than the cost of a little awkwardness.\n";
                    }
                }
                // Questions that deepen connection
                response += '\n**Questions that build intimacy:**\n';
                CONVERSATION_STARTERS.deeper.forEach((q) => {
                    response += `• "${q}"\n`;
                });
                response +=
                    '\n**The secret:** Someone has to make the first move. If you wait for them, nothing changes.';
                return response;
            },
        });
    },
};
// ============================================================================
// TOOL: Handle Social Rejection
// ============================================================================
const handleSocialRejectionDef = {
    id: 'handleSocialRejection',
    name: 'Handle Social Rejection',
    description: "Process when connection attempts don't work out",
    domain: 'social-skills',
    tags: ['social', 'rejection', 'processing', 'resilience'],
    create: (ctx) => {
        return llm.tool({
            description: getToolDescription('handleSocialRejection'),
            parameters: z.object({
                whatHappened: z.string().describe('What happened'),
                howYouFeel: z.string().optional().describe('How you feel about it'),
                pattern: z.boolean().optional().describe('Does this feel like a pattern'),
            }),
            execute: async ({ whatHappened, howYouFeel, pattern }) => {
                log.info({ agentId: ctx.agentId, pattern }, 'Helping handle social rejection');
                let response = '';
                // Validate
                response +=
                    "Rejection stings. Whether it's being left out, ghosted, or turned down, it hurts.\n\n";
                if (howYouFeel) {
                    response += `You mentioned feeling: "${howYouFeel}". That's understandable.\n\n`;
                }
                // Normalize
                response += '**The truth about rejection:**\n';
                response += '• Everyone gets rejected. Even the most popular people.\n';
                response += '• Rejection is usually about fit, timing, or their stuff - not your worth.\n';
                response += "• It hurts because humans are wired for belonging. That's not weakness.\n";
                response += '• You only need a few good connections. Not everyone needs to like you.\n\n';
                // Process
                response += '**To process this:**\n';
                response += "1. Let yourself feel disappointed (don't suppress it)\n";
                response +=
                    "2. Check the story you're telling yourself - is it accurate or catastrophic?\n";
                response += '3. Remember times you were accepted and valued\n';
                response += '4. Consider: was there actual rejection, or interpretation of rejection?\n';
                response += '5. Give yourself credit for taking the risk at all\n\n';
                // Pattern work
                if (pattern) {
                    response += '**If this feels like a pattern:**\n';
                    response += '• Are you approaching people genuinely aligned with your values?\n';
                    response += '• Are you showing up authentically or performing?\n';
                    response += '• Are you over-interpreting neutral behavior as rejection?\n';
                    response += '• Could therapy help explore deeper patterns?\n\n';
                }
                // Resilience building
                response += '**Building rejection resilience:**\n';
                response += '• Take more small social risks (builds tolerance)\n';
                response += "• Diversify your attempts (don't put all eggs in one basket)\n";
                response += '• Remember: successful people have been rejected more, not less\n';
                response += '• Each rejection gets you closer to connections that will work\n\n';
                response +=
                    'What would help most right now - sitting with the feeling, or planning a next step?';
                return response;
            },
        });
    },
};
// ============================================================================
// TOOL: Maintain Friendships
// ============================================================================
const maintainFriendshipsDef = {
    id: 'socialFriendshipSkills',
    name: 'Friendship Maintenance Skills',
    description: 'Social skills for keeping friendships alive despite busy life',
    domain: 'social-skills',
    tags: ['social', 'friendship', 'maintenance', 'busy'],
    create: (ctx) => {
        return llm.tool({
            description: getToolDescription('maintainFriendships'),
            parameters: z.object({
                struggle: z
                    .enum(['too-busy', 'forget', 'one-sided', 'drift-apart', 'long-distance'])
                    .describe('What makes maintenance hard'),
                friendCount: z.number().optional().describe('How many friendships you want to maintain'),
            }),
            execute: async ({ struggle, friendCount }) => {
                log.info({ agentId: ctx.agentId, struggle }, 'Helping maintain friendships');
                let response = '';
                response += 'Maintaining friendships as an adult requires **intentional effort**. ';
                response += 'Proximity used to do the work; now we have to.\n\n';
                // Struggle-specific advice
                const struggleAdvice = {
                    'too-busy': "**When you're too busy:** The truth is, we make time for what we prioritize. Block 'friend time' in your calendar like any other appointment. A 15-minute call > silence for months.",
                    forget: "**When you forget to reach out:** Set recurring reminders. Create a 'friend check-in' list and rotate through it. Use birthdays/holidays as anchors. Technology can compensate for memory.",
                    'one-sided': '**When it feels one-sided:** First, check - are you initiating enough? Some people are bad at reaching out but wonderful when you do. If truly one-sided after effort, it may be time to accept the drift.',
                    'drift-apart': "**When you drift apart:** Not all friendships are meant to last forever. But before accepting the drift, try: a direct acknowledgment ('I miss our friendship'), a specific invitation, or asking what changed.",
                    'long-distance': "**When distance is the barrier:** Schedule regular video calls. Send voice notes. Share memes. Visit when possible. Accept it will be different, but different isn't dead.",
                };
                response += struggleAdvice[struggle] + '\n\n';
                // General maintenance tips
                response += '**Friendship maintenance basics:**\n';
                response += "• **Initiate**: Don't always wait for them\n";
                response += "• **Remember**: What matters to them, what's happening in their life\n";
                response += '• **Show up**: In hard times especially\n';
                response += '• **Schedule**: Friendship dates on the calendar\n';
                response +=
                    '• **Low-lift touches**: Quick texts, shared links, thinking-of-you messages\n\n';
                // Capacity reality
                if (friendCount) {
                    response += `**About maintaining ${friendCount} friendships:**\n`;
                    if (friendCount <= 3) {
                        response += 'Very doable with intention. Focus on quality depth.\n';
                    }
                    else if (friendCount <= 8) {
                        response += 'Manageable but requires structure. Consider a rotation system.\n';
                    }
                    else {
                        response +=
                            "That's a lot! Be realistic about depth vs. breadth. You can't go deep with everyone.\n";
                    }
                }
                response += '\nWhich friendship feels most in need of attention right now?';
                return response;
            },
        });
    },
};
// ============================================================================
// TOOL: Join New Groups
// ============================================================================
const joinNewGroupsDef = {
    id: 'joinNewGroups',
    name: 'Join New Groups',
    description: 'Find and integrate into new communities and groups',
    domain: 'social-skills',
    tags: ['social', 'groups', 'community', 'belonging'],
    create: (ctx) => {
        return llm.tool({
            description: getToolDescription('joinNewGroups'),
            parameters: z.object({
                interests: z.string().describe('What are you interested in'),
                barrier: z
                    .enum(['dont-know-where', 'scared-to-show-up', 'tried-didnt-work', 'nothing-fits'])
                    .optional()
                    .describe('What stops you'),
            }),
            execute: async ({ interests, barrier }) => {
                log.info({ agentId: ctx.agentId, interests }, 'Helping join new groups');
                let response = '';
                response += `Finding groups for someone interested in "${interests}".\n\n`;
                // Where to look
                response += '**Where to find groups:**\n';
                response += '• **Meetup.com** - Groups for everything\n';
                response += '• **Facebook Groups** - Local community groups\n';
                response += '• **Libraries** - Book clubs, classes, events\n';
                response += '• **Recreation centers** - Sports, fitness classes\n';
                response +=
                    '• **Churches/spiritual communities** - Even if not religious, many welcome seekers\n';
                response += '• **Volunteer organizations** - Shared purpose builds bonds fast\n';
                response += '• **Classes** - Community college, art centers, cooking schools\n';
                response += '• **Sports leagues** - Recreational, low-pressure\n';
                response += '• **Dog parks** - If you have a dog, instant community\n';
                response += '• **Coworking spaces** - For remote workers\n\n';
                // Barrier-specific advice
                if (barrier) {
                    const barrierAdvice = {
                        'dont-know-where': `For "${interests}", try searching Meetup, Facebook, or just Googling "[your city] ${interests} group". Libraries and community centers often have bulletin boards.`,
                        'scared-to-show-up': "First time is always the hardest. Remember: everyone was new once. Set a low goal (just stay 30 minutes). Bring a 'wingman' if possible.",
                        'tried-didnt-work': "One group not clicking doesn't mean they all won't. Try different vibes - some groups are cliquey, others welcoming. Give any group 3 visits before judging.",
                        'nothing-fits': "Maybe nothing perfect exists yet. Could you start something? Even posting 'Anyone want to [activity]?' on a local Facebook group can attract your people.",
                    };
                    response += `**About your barrier:**\n${barrierAdvice[barrier]}\n\n`;
                }
                // Integration tips
                response += '**Once you show up:**\n';
                response += '• Go more than once (people notice regulars)\n';
                response += '• Introduce yourself to someone each time\n';
                response += '• Volunteer to help (organizers make fast friends)\n';
                response += "• Don't just attend - engage\n";
                response += '• Suggest coffee/drinks after with someone you clicked with\n\n';
                response += 'What type of group feels most appealing to try first?';
                return response;
            },
        });
    },
};
// ============================================================================
// TOOL: Network Authentically
// ============================================================================
const networkAuthenticallyDef = {
    id: 'networkAuthentically',
    name: 'Network Authentically',
    description: 'Build genuine professional relationships without feeling gross',
    domain: 'social-skills',
    tags: ['social', 'networking', 'professional', 'authentic'],
    create: (ctx) => {
        return llm.tool({
            description: getToolDescription('networkAuthentically'),
            parameters: z.object({
                context: z
                    .enum(['job-search', 'career-growth', 'business', 'industry-connections', 'general'])
                    .describe('Why are you networking'),
                discomfort: z.string().optional().describe('What feels gross about networking'),
            }),
            execute: async ({ context, discomfort }) => {
                log.info({ agentId: ctx.agentId, context }, 'Helping network authentically');
                let response = '';
                // Address the ick
                response += '**Reframing networking:**\n\n';
                response += "Networking feels gross when it's transactional. ";
                response += "It doesn't have to be.\n\n";
                if (discomfort) {
                    response += `You mentioned: "${discomfort}". I get it. `;
                    response += "Most people feel this way. Here's how to do it differently.\n\n";
                }
                // Authentic approach
                response += '**Authentic networking principles:**\n';
                response += '• **Give before you take** - How can you help them? Lead with that.\n';
                response += '• **Be genuinely curious** - People can tell when you actually care\n';
                response += '• **Play long games** - Build relationships, not transactions\n';
                response += '• **Be memorable for the right reasons** - Be helpful, thoughtful, kind\n';
                response +=
                    "• **Follow up meaningfully** - Share articles they'd like, remember their stuff\n";
                response += "• **Don't keep score** - But do track who you haven't reached out to\n\n";
                // Practical tips by context
                const contextTips = {
                    'job-search': [
                        'Reach out to people in roles you want - for advice, not jobs',
                        "Be specific: 'Can I ask you 3 questions about your path?'",
                        "Don't ask for jobs directly - ask for insight and let opportunities emerge",
                    ],
                    'career-growth': [
                        'Connect with people 1-2 levels up who inspire you',
                        'Offer to help with their projects',
                        'Share their wins publicly, celebrate them',
                    ],
                    business: [
                        'Focus on relationships that would be valuable even without business',
                        'Be a connector - introduce people who should know each other',
                        "Don't pitch immediately - establish trust first",
                    ],
                    'industry-connections': [
                        'Show up consistently at industry events',
                        'Share valuable content publicly',
                        'Be known for something specific and helpful',
                    ],
                    general: [
                        'Treat everyone like they matter (because they do)',
                        'Be interested, not interesting',
                        'Small gestures compound over time',
                    ],
                };
                response += `**For ${context}:**\n`;
                contextTips[context].forEach((tip) => {
                    response += `• ${tip}\n`;
                });
                response += '\n**Conversation starters:**\n';
                response += '• "What are you working on that excites you?"\n';
                response += '• "How did you get into this field?"\n';
                response += '• "What\'s challenging you right now?" (then listen)\n';
                response += '• "Is there anything I can help with?"\n\n';
                response +=
                    "The best networking doesn't feel like networking. It feels like genuine human connection with professional context.";
                return response;
            },
        });
    },
};
// ============================================================================
// TOOL: Small Talk Mastery
// ============================================================================
const smallTalkMasteryDef = {
    id: 'smallTalkMastery',
    name: 'Small Talk Mastery',
    description: 'Make small talk feel meaningful instead of painful',
    domain: 'social-skills',
    tags: ['social', 'conversation', 'small-talk', 'skills'],
    create: (ctx) => {
        return llm.tool({
            description: getToolDescription('smallTalkMastery'),
            parameters: z.object({
                struggle: z
                    .enum(['hate-it', 'run-out-of-things', 'feels-fake', 'anxious', 'boring-to-me'])
                    .describe('What makes small talk hard'),
            }),
            execute: async ({ struggle }) => {
                log.info({ agentId: ctx.agentId, struggle }, 'Helping with small talk');
                let response = '';
                // Address specific struggle
                const struggleResponses = {
                    'hate-it': "Hating small talk is fair. It can feel pointless. But here's the thing: small talk is the gateway to big talk. You can't skip it entirely.",
                    'run-out-of-things': "Running out of things to say usually means you're too focused on yourself. Shift focus to them: ask questions, be curious, listen.",
                    'feels-fake': "'How's the weather' IS fake. But small talk doesn't have to be. You can ask real questions in casual contexts.",
                    anxious: "Anxiety in small talk is common. The pressure to 'perform' is exhausting. Reframe: you're not performing, you're connecting.",
                    'boring-to-me': "If it's boring, you're probably not going deep enough. 'What do you do?' is boring. 'What got you into that?' is interesting.",
                };
                response += `**About your struggle:**\n${struggleResponses[struggle]}\n\n`;
                // Reframe
                response += '**Reframing small talk:**\n';
                response += "• It's not about being clever - it's about being warm\n";
                response += "• You're not being judged as harshly as you think\n";
                response += '• Most people are relieved when someone else takes initiative\n';
                response += "• It's practice for deeper conversations\n\n";
                // Upgrade small talk
                response += '**Upgrading small talk questions:**\n';
                response += "• Instead of 'What do you do?' → 'What's keeping you busy these days?'\n";
                response += "• Instead of 'How are you?' → 'What's new in your world?'\n";
                response += "• Instead of 'Nice weather' → 'Are you getting outside with this weather?'\n";
                response += "• Instead of 'Where are you from?' → 'What brought you to [city]?'\n\n";
                // Key technique
                response += '**The secret technique: FORD**\n';
                response += '• **F**amily - Do you have family nearby?\n';
                response += "• **O**ccupation - What's your work like?\n";
                response += '• **R**ecreation - What do you do for fun?\n';
                response += '• **D**reams - What are you looking forward to?\n\n';
                // Exit gracefully
                response += '**Exiting gracefully:**\n';
                response += '• "I should go mingle, but it was great meeting you!"\n';
                response += '• "I\'m going to grab a drink - enjoy the rest of your night!"\n';
                response += '• "I see someone I need to say hi to - let\'s chat more later!"\n\n';
                response += 'Small talk is a skill. It gets easier with practice.';
                return response;
            },
        });
    },
};
// ============================================================================
// DOMAIN TOOLS COLLECTION
// ============================================================================
const socialSkillsTools = [
    makeFriendsAsAdultDef,
    startConversationDef,
    navigateSocialAnxietyDef,
    deepenAcquaintanceDef,
    handleSocialRejectionDef,
    maintainFriendshipsDef,
    joinNewGroupsDef,
    networkAuthenticallyDef,
    smallTalkMasteryDef,
];
// ============================================================================
// EXPORTS
// ============================================================================
export const { getToolDefinitions, domain, definitions } = createDomainExport('social-skills', socialSkillsTools);
export default getToolDefinitions;
//# sourceMappingURL=index.js.map