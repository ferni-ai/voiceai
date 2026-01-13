/**
 * Loneliness & Connection Domain Tools
 *
 * Tools for addressing loneliness, building meaningful connections,
 * and finding belonging. This domain addresses a modern epidemic
 * with Ferni's warmth, presence, and zero judgment.
 *
 * PHILOSOPHY:
 *   Loneliness is not a character flaw. It's a signal - like hunger or thirst -
 *   telling you that a fundamental human need isn't being met. We don't shame
 *   people for being hungry. We shouldn't shame them for being lonely.
 *
 * DOMAIN: connection
 * SUB-DOMAINS:
 *   Loneliness - Acknowledging, understanding, sitting with loneliness
 *   Adult Friendship - Making and maintaining friends after childhood
 *   Belonging - Finding community and sense of place
 *   Connection Rituals - Small practices to nurture relationships
 *   Digital Connection - Navigating online vs. in-person connection
 *
 * TOOLS:
 *   Loneliness: acknowledgeLoneliness, exploreLonelinessType, sitWithLoneliness
 *   Friendship: makeAdultFriends, maintainFriendships, deependFriendship, recognizeToxicFriendship
 *   Belonging: findYourPeople, buildCommunity, createBelonging
 *   Rituals: createConnectionRitual, smallActsOfConnection
 *   Balance: assessConnectionHealth, balanceAloneAndTogether
 */
import { createDomainExport } from '../../registry/loader.js';
import { llm } from '@livekit/agents';
import { getLogger } from '../../../utils/safe-logger.js';
import { persistTrackedItem, persistKeyMoment, } from '../shared/persistence.js';
import { z } from 'zod';
import { getToolDescription } from '../../utils/tool-descriptions.js';
// Cross-persona intelligence imports
import { addCrossPersonaInsight, } from '../../../services/cross-persona-insights.js';
// Superhuman services for relationship network
import { buildNetworkContext } from '../../../services/superhuman/relationship-network.js';
// ============================================================================
// CONNECTION WISDOM DATABASE
// ============================================================================
/**
 * Types of loneliness - different types need different responses
 */
const LONELINESS_TYPES = {
    intimate: {
        name: 'Intimate Loneliness',
        description: 'Missing a close confidant, partner, or best friend. Someone who truly knows you.',
        feels_like: 'No one really knows me. I have no one to share my inner world with.',
        what_helps: [
            'Deepening one existing relationship',
            'Vulnerability with someone safe',
            'Therapy or coaching (professional intimate connection)',
            'Journaling to know yourself better first',
        ],
    },
    relational: {
        name: 'Relational Loneliness',
        description: 'Missing a friend group, social circle, or regular companions.',
        feels_like: 'I have no one to hang out with. No one to call on a Friday night.',
        what_helps: [
            'Joining groups with shared interests',
            'Recurring activities (same time, same people)',
            'Being a "regular" somewhere',
            'Saying yes to invitations even when tired',
        ],
    },
    collective: {
        name: 'Collective Loneliness',
        description: 'Missing belonging to something larger. Community, tribe, shared identity.',
        feels_like: "I don't belong anywhere. No one shares my values or experiences.",
        what_helps: [
            'Finding communities around identity or values',
            'Volunteering for causes you believe in',
            'Religious or spiritual communities',
            'Online communities as bridge to in-person',
        ],
    },
    existential: {
        name: 'Existential Loneliness',
        description: 'The fundamental aloneness of being human. We are born alone, die alone.',
        feels_like: 'No one can ever fully understand my experience. I am ultimately alone.',
        what_helps: [
            'Philosophy, spirituality, meaning-making',
            'Creative expression',
            'Accepting this as part of human condition',
            'Finding others who sit with big questions',
        ],
    },
    transient: {
        name: 'Transient Loneliness',
        description: 'Temporary loneliness from life changes - moving, breakup, new job, loss.',
        feels_like: 'I used to have people, but everything changed.',
        what_helps: [
            'Patience - connections take time to build',
            'Maintaining old connections while building new',
            'Recognizing this is normal and temporary',
            'Lowering expectations for depth initially',
        ],
    },
};
/**
 * Barriers to making friends as an adult
 */
const ADULT_FRIENDSHIP_BARRIERS = {
    time: {
        barrier: 'No Time',
        reality: 'Adults have jobs, families, responsibilities. Friendship feels like a luxury.',
        reframe: 'Friendship is maintenance, not luxury. Without it, everything else suffers.',
        strategies: [
            'Combine activities (exercise with friend, work lunch)',
            'Schedule it like a meeting',
            'Quality over quantity - one good hour beats many shallow ones',
            'Lower the bar - 15 minutes counts',
        ],
    },
    proximity: {
        barrier: 'No Natural Meeting Places',
        reality: 'School and college forced proximity. Adult life is siloed.',
        reframe: 'You have to manufacture what used to happen naturally.',
        strategies: [
            'Create recurring third places (gym, coffee shop, class)',
            'Join something with the same people weekly',
            'Live in walkable areas if possible',
            'Make your home a gathering place',
        ],
    },
    vulnerability: {
        barrier: 'Fear of Rejection/Awkwardness',
        reality: 'Asking someone to hang out feels like asking them on a date. Scary.',
        reframe: 'Everyone is lonely. Most people are relieved when someone makes the first move.',
        strategies: [
            'Start with activities, not "hanging out"',
            'Assume they want connection too',
            'Be the initiator you wish you had',
            "Accept that some attempts won't click - that's normal",
        ],
    },
    depth: {
        barrier: 'Relationships Stay Surface-Level',
        reality: 'Acquaintances everywhere, real friends nowhere.',
        reframe: 'Depth requires vulnerability and time. Most people are waiting for permission.',
        strategies: [
            'Share something real, invite them to do the same',
            'Ask deeper questions than "how are you"',
            'Remember and follow up on what they share',
            'Consistency - same people, repeated contact',
        ],
    },
    energy: {
        barrier: 'Socializing Is Exhausting',
        reality: 'Especially for introverts, connection can drain rather than fill.',
        reframe: 'The right connections energize. Wrong ones drain. Be selective.',
        strategies: [
            'One-on-one over groups',
            'Activity-based over pure talking',
            'Shorter, more frequent over long marathons',
            'Honor your limits while still showing up',
        ],
    },
};
/**
 * Wisdom about connection and loneliness
 */
const CONNECTION_WISDOM = [
    {
        quote: 'The opposite of addiction is not sobriety. The opposite of addiction is connection.',
        attribution: 'Johann Hari',
        context: 'importance',
    },
    {
        quote: 'Loneliness does not come from having no people around you, but from being unable to communicate the things that seem important to you.',
        attribution: 'Carl Jung',
        context: 'intimate-loneliness',
    },
    {
        quote: 'We are all so much together, but we are all dying of loneliness.',
        attribution: 'Albert Schweitzer',
        context: 'modern-loneliness',
    },
    {
        quote: 'The most terrible poverty is loneliness, and the feeling of being unloved.',
        attribution: 'Mother Teresa',
        context: 'importance',
    },
    {
        quote: "Language has created the word 'loneliness' to express the pain of being alone. And it has created the word 'solitude' to express the glory of being alone.",
        attribution: 'Paul Tillich',
        context: 'solitude-vs-loneliness',
    },
    {
        quote: 'Friendship is born at that moment when one person says to another, "What! You too? I thought I was the only one."',
        attribution: 'C.S. Lewis',
        context: 'friendship',
    },
    {
        quote: 'Be the friend you wish you had.',
        attribution: 'Unknown',
        context: 'friendship',
    },
    {
        quote: 'Belonging is the innate human desire to be part of something larger than us.',
        attribution: 'Brené Brown',
        context: 'belonging',
    },
];
/**
 * Small connection rituals
 */
const CONNECTION_RITUALS = {
    daily: [
        {
            ritual: "Text one person you haven't talked to recently",
            time: '2 min',
            impact: 'Keeps connections warm',
        },
        {
            ritual: 'Make eye contact and smile at a stranger',
            time: '5 sec',
            impact: 'Reminds you of shared humanity',
        },
        {
            ritual: 'Have a real conversation with a service person',
            time: '1 min',
            impact: 'Practices connection anywhere',
        },
        { ritual: 'Share something vulnerable with one person', time: '5 min', impact: 'Builds depth' },
    ],
    weekly: [
        {
            ritual: 'Call (not text) someone you care about',
            time: '15 min',
            impact: 'Voice deepens connection',
        },
        {
            ritual: 'Eat a meal with someone',
            time: '1 hr',
            impact: 'Breaking bread is ancient bonding',
        },
        {
            ritual: 'Show up at a recurring activity/group',
            time: '1-2 hrs',
            impact: 'Builds relational circles',
        },
        {
            ritual: 'Write a note of appreciation to someone',
            time: '5 min',
            impact: 'Strengthens bonds',
        },
    ],
    monthly: [
        { ritual: 'Host something at your home', time: '2-3 hrs', impact: 'Creates belonging' },
        { ritual: 'Try a new group or activity', time: '1-2 hrs', impact: 'Expands network' },
        {
            ritual: 'Have a deeper conversation with someone',
            time: '1 hr',
            impact: 'Moves acquaintance to friend',
        },
        {
            ritual: 'Reconnect with someone from the past',
            time: '30 min',
            impact: 'Revives dormant ties',
        },
    ],
};
/**
 * Signs of connection health vs. warning signs
 */
const CONNECTION_HEALTH = {
    healthy_signs: [
        'You have at least one person you can call in a crisis',
        "Someone knows what's really going on in your life",
        'You feel seen and known by at least one person',
        'You have people you look forward to seeing',
        'You have recurring social activities',
        'You feel like you belong somewhere',
        'You give and receive support',
    ],
    warning_signs: [
        "You can't remember the last meaningful conversation",
        'No one would notice if something happened to you',
        'You always initiate - no one reaches out first',
        'You feel invisible, even in groups',
        "You perform a version of yourself that isn't real",
        'You feel drained after every social interaction',
        'You have no one to share good news with',
    ],
};
// ============================================================================
// LONELINESS TOOLS
// ============================================================================
const acknowledgeLonelinessDef = {
    id: 'acknowledgeLoneliness',
    name: 'Acknowledge Loneliness',
    description: 'Validate and sit with loneliness without rushing to fix it',
    domain: 'connection',
    additionalDomains: ['second-chances', 'meaning', 'presence'], // Loneliness often accompanies fresh starts and searches for meaning
    tags: ['connection', 'loneliness', 'validation', 'presence'],
    create: (ctx) => {
        return llm.tool({
            description: getToolDescription('acknowledgeLoneliness'),
            parameters: z.object({
                howLonelyFeels: z.string().describe('What their loneliness feels like'),
                howLong: z.string().optional().describe("How long they've felt this way"),
                whatTheyveTriед: z.string().optional().describe("What they've tried"),
            }),
            execute: async ({ howLonelyFeels, howLong, whatTheyveTriед }) => {
                getLogger().info({ agentId: ctx.agentId, hasHowLong: !!howLong }, 'Acknowledging loneliness');
                let response = `**I Hear You**\n\n`;
                response += `You said: "${howLonelyFeels}"\n\n`;
                if (howLong) {
                    response += `And you've been feeling this way for ${howLong}.\n\n`;
                }
                response += `---\n\n`;
                response += `**First, I want you to know:**\n\n`;
                response += `Loneliness is not a character flaw. It's not pathetic. It's not weakness.\n\n`;
                response += `Loneliness is a signal - like hunger or thirst - telling you that a fundamental human need isn't being met. `;
                response += `We don't shame people for being hungry. We shouldn't shame ourselves for being lonely.\n\n`;
                response += `**What loneliness is telling you:**\n`;
                response += `You are wired for connection. Every human is. When that need isn't met, it hurts. That's not broken - that's human.\n\n`;
                response += `---\n\n`;
                response += `**I'm not going to rush to fix this.**\n\n`;
                response += `Before solutions, I want to just... sit here with you for a moment.\n\n`;
                response += `Loneliness is one of the hardest feelings because it's often invisible to others. `;
                response += `You can be surrounded by people and still feel utterly alone.\n\n`;
                if (whatTheyveTriед) {
                    response += `You mentioned you've tried: ${whatTheyveTriед}\n\n`;
                    response += `That took courage. Even if it hasn't worked yet, trying matters.\n\n`;
                }
                response += `---\n\n`;
                const wisdom = CONNECTION_WISDOM.find((w) => w.context === 'intimate-loneliness' || w.context === 'importance');
                if (wisdom) {
                    response += `> "${wisdom.quote}"\n`;
                    response += `> — ${wisdom.attribution}\n\n`;
                }
                response += `What's the hardest part of the loneliness for you?`;
                return response;
            },
        });
    },
};
const exploreLonelinessTypeDef = {
    id: 'exploreLonelinessType',
    name: 'Explore Loneliness Type',
    description: 'Help identify what type of loneliness someone is experiencing',
    domain: 'connection',
    tags: ['connection', 'loneliness', 'assessment', 'understanding'],
    create: (ctx) => {
        return llm.tool({
            description: getToolDescription('exploreLonelinessType'),
            parameters: z.object({
                symptoms: z.string().describe('How their loneliness manifests'),
                whatsMissing: z.string().optional().describe('What they feel is missing'),
            }),
            execute: async ({ symptoms, whatsMissing }) => {
                getLogger().info({ agentId: ctx.agentId }, 'Exploring loneliness type');
                let response = `**Understanding Your Loneliness**\n\n`;
                response += `Not all loneliness is the same. Different types need different approaches.\n\n`;
                response += `You described: "${symptoms}"\n`;
                if (whatsMissing) {
                    response += `What feels missing: "${whatsMissing}"\n`;
                }
                response += `\n---\n\n`;
                response += `**Types of Loneliness:**\n\n`;
                Object.values(LONELINESS_TYPES).forEach((type) => {
                    response += `**${type.name}**\n`;
                    response += `_${type.description}_\n`;
                    response += `Feels like: "${type.feels_like}"\n\n`;
                });
                response += `---\n\n`;
                response += `**Reflection questions:**\n\n`;
                response += `- Do you have people in your life, but none who really *know* you? (Intimate)\n`;
                response += `- Do you lack a friend group or social circle? (Relational)\n`;
                response += `- Do you feel like you don't belong anywhere? (Collective)\n`;
                response += `- Is this a recent change, or long-standing? (Transient vs. chronic)\n`;
                response += `- Is this about connection with others, or something deeper? (Existential)\n\n`;
                response += `Which of these resonates most with what you're experiencing?`;
                return response;
            },
        });
    },
};
const sitWithLonelinessDef = {
    id: 'sitWithLoneliness',
    name: 'Sit With Loneliness',
    description: 'Companion presence for moments of acute loneliness',
    domain: 'connection',
    tags: ['connection', 'loneliness', 'presence', 'companionship'],
    create: (ctx) => {
        return llm.tool({
            description: getToolDescription('sitWithLoneliness'),
            parameters: z.object({
                rightNow: z.string().describe("What they're feeling right now"),
                timeOfDay: z.enum(['late-night', 'morning', 'afternoon', 'evening']).optional(),
            }),
            execute: async ({ rightNow, timeOfDay }, { ctx: toolCtx }) => {
                getLogger().info({ agentId: ctx.agentId, timeOfDay }, 'Sitting with loneliness');
                // Persist as key moment
                persistKeyMoment(toolCtx, {
                    domain: 'connection',
                    type: 'concern',
                    summary: 'User experiencing acute loneliness - provided presence',
                    emotionalWeight: 'heavy',
                    topics: ['loneliness', 'presence', 'connection'],
                });
                let response = `**I'm Here**\n\n`;
                if (timeOfDay === 'late-night') {
                    response += `It's late. The world is quiet. And sometimes that's when loneliness is loudest.\n\n`;
                    response += `I want you to know: you're not alone in this moment. I'm here.\n\n`;
                }
                else {
                    response += `I'm here. Right now. With you.\n\n`;
                }
                response += `You said: "${rightNow}"\n\n`;
                response += `---\n\n`;
                response += `I'm not going to tell you to "put yourself out there" or "join a club" right now.\n\n`;
                response += `Right now, I'm just going to be here.\n\n`;
                response += `**Some things that might help in this moment:**\n\n`;
                response += `- Take a slow breath. You're okay.\n`;
                response += `- Put your hand on your chest. Feel your heartbeat. You're here.\n`;
                response += `- Remember: this feeling will shift. Feelings always do.\n`;
                response += `- You reached out. That took courage.\n\n`;
                response += `---\n\n`;
                response += `**You matter.**\n\n`;
                response += `The fact that you feel lonely means you're human. `;
                response += `It means you have a heart that wants connection. That's not weakness - that's life.\n\n`;
                response += `Do you want to just talk? About anything? I'm not going anywhere.`;
                return response;
            },
        });
    },
};
// ============================================================================
// FRIENDSHIP TOOLS
// ============================================================================
const makeAdultFriendsDef = {
    id: 'makeAdultFriends',
    name: 'Make Adult Friends',
    description: 'Navigate the surprisingly hard skill of making friends after childhood',
    domain: 'connection',
    tags: ['connection', 'friendship', 'adult', 'social'],
    create: (ctx) => {
        return llm.tool({
            description: getToolDescription('makeAdultFriends'),
            parameters: z.object({
                mainBarrier: z
                    .enum(['time', 'proximity', 'vulnerability', 'depth', 'energy', 'unsure'])
                    .describe('What feels like the biggest barrier'),
                currentSituation: z.string().optional().describe('Their current social situation'),
            }),
            execute: async ({ mainBarrier, currentSituation }) => {
                getLogger().info({ agentId: ctx.agentId, mainBarrier }, 'Helping make adult friends');
                let response = `**Making Friends as an Adult**\n\n`;
                response += `First, let's normalize something: **adult friendship is genuinely harder.**\n\n`;
                response += `It's not you. The structure that created friendships in school - forced proximity, `;
                response += `shared experiences, repeated unplanned interaction - doesn't exist anymore.\n\n`;
                if (currentSituation) {
                    response += `Your situation: ${currentSituation}\n\n`;
                }
                response += `---\n\n`;
                // Focus on their specific barrier
                if (mainBarrier !== 'unsure') {
                    const barrier = ADULT_FRIENDSHIP_BARRIERS[mainBarrier];
                    response += `**Your barrier: ${barrier.barrier}**\n\n`;
                    response += `_The reality:_ ${barrier.reality}\n\n`;
                    response += `_Reframe:_ ${barrier.reframe}\n\n`;
                    response += `**What helps:**\n`;
                    barrier.strategies.forEach((s) => {
                        response += `- ${s}\n`;
                    });
                    response += `\n`;
                }
                else {
                    response += `**Common Barriers:**\n\n`;
                    Object.values(ADULT_FRIENDSHIP_BARRIERS).forEach((barrier) => {
                        response += `**${barrier.barrier}:** ${barrier.reality}\n`;
                        response += `→ ${barrier.reframe}\n\n`;
                    });
                }
                response += `---\n\n`;
                response += `**The Friend-Making Formula (research-backed):**\n\n`;
                response += `Friendship requires three things:\n\n`;
                response += `1. **Proximity** - Being in the same place repeatedly\n`;
                response += `2. **Repeated unplanned interaction** - Seeing them regularly by chance\n`;
                response += `3. **Time** - Shared experiences over months, not days\n\n`;
                response += `As adults, we have to *manufacture* what used to happen naturally.\n\n`;
                response += `---\n\n`;
                response += `**Practical first steps:**\n\n`;
                response += `1. Join something that meets weekly with the same people\n`;
                response += `2. Be the initiator - suggest coffee, don't wait to be asked\n`;
                response += `3. Follow up on what people share - remember and ask\n`;
                response += `4. Move past "how are you" - share something real\n`;
                response += `5. Expect awkwardness - it's normal, push through\n\n`;
                const wisdom = CONNECTION_WISDOM.find((w) => w.context === 'friendship');
                if (wisdom) {
                    response += `> "${wisdom.quote}"\n`;
                    response += `> — ${wisdom.attribution}\n\n`;
                }
                response += `What feels like the smallest step you could take this week?`;
                return response;
            },
        });
    },
};
const maintainFriendshipsDef = {
    id: 'maintainFriendships',
    name: 'Maintain Friendships',
    description: 'Keep existing friendships alive despite busy adult life',
    domain: 'connection',
    tags: ['connection', 'friendship', 'maintenance', 'rituals'],
    create: (ctx) => {
        return llm.tool({
            description: getToolDescription('maintainFriendships'),
            parameters: z.object({
                friendshipStatus: z.string().describe('Status of friendships they want to maintain'),
                barrier: z.string().optional().describe("What's getting in the way"),
            }),
            execute: async ({ friendshipStatus, barrier }) => {
                getLogger().info({ agentId: ctx.agentId }, 'Helping maintain friendships');
                let response = `**Keeping Friendships Alive**\n\n`;
                response += `Friendship maintenance is real work. Life pulls us in a thousand directions, `;
                response += `and friendships that aren't actively tended will quietly fade.\n\n`;
                response += `Your situation: ${friendshipStatus}\n`;
                if (barrier) {
                    response += `What's getting in the way: ${barrier}\n`;
                }
                response += `\n---\n\n`;
                response += `**The uncomfortable truth:**\n`;
                response += `Friendships don't maintain themselves. The "we should get together sometime" `;
                response += `that never happens? That's how friendships die.\n\n`;
                response += `**But here's the good news:**\n`;
                response += `Small, consistent gestures matter more than grand reunions.\n\n`;
                response += `---\n\n`;
                response += `**Connection Rituals:**\n\n`;
                response += `**Daily (2 minutes):**\n`;
                CONNECTION_RITUALS.daily.forEach((r) => {
                    response += `- ${r.ritual} → ${r.impact}\n`;
                });
                response += `\n**Weekly (15-60 min):**\n`;
                CONNECTION_RITUALS.weekly.forEach((r) => {
                    response += `- ${r.ritual} → ${r.impact}\n`;
                });
                response += `\n**Monthly (1-3 hrs):**\n`;
                CONNECTION_RITUALS.monthly.forEach((r) => {
                    response += `- ${r.ritual} → ${r.impact}\n`;
                });
                response += `\n---\n\n`;
                response += `**Practical tips:**\n\n`;
                response += `- Put friend time in your calendar like any other commitment\n`;
                response += `- Lower the bar - 15 min call > waiting for "the right time"\n`;
                response += `- Be the initiator, even if it feels one-sided\n`;
                response += `- Remember: texting isn't enough. Voice and presence matter.\n`;
                response += `- It's okay to let some friendships fade. Focus on the ones that matter.\n\n`;
                response += `Who is one friend you want to reach out to this week?`;
                return response;
            },
        });
    },
};
const moveFromAcquaintanceToFriendDef = {
    id: 'moveFromAcquaintanceToFriend',
    name: 'Move From Acquaintance to Friend',
    description: 'Move from acquaintance to real friend through vulnerability',
    domain: 'connection',
    tags: ['connection', 'friendship', 'depth', 'vulnerability', 'acquaintance'],
    create: (ctx) => {
        return llm.tool({
            description: getToolDescription('moveFromAcquaintanceToFriend'),
            parameters: z.object({
                currentState: z.string().describe('Current state of the relationship'),
                whatTheyWant: z.string().describe('What they hope the friendship could become'),
                whatHoldsBack: z.string().optional().describe('What holds them back from going deeper'),
            }),
            execute: async ({ currentState, whatTheyWant, whatHoldsBack }) => {
                getLogger().info({ agentId: ctx.agentId }, 'Helping deepen friendship');
                let response = `**From Acquaintance to Friend**\n\n`;
                response += `Current: ${currentState}\n`;
                response += `What you want: ${whatTheyWant}\n`;
                if (whatHoldsBack) {
                    response += `What holds you back: ${whatHoldsBack}\n`;
                }
                response += `\n---\n\n`;
                response += `**The Acquaintance → Friend Gap**\n\n`;
                response += `Most relationships stay surface-level not because people don't want depth, `;
                response += `but because no one takes the risk of going first.\n\n`;
                response += `Depth requires vulnerability. Someone has to go first. It can be you.\n\n`;
                response += `---\n\n`;
                response += `**The Ladder of Friendship Depth:**\n\n`;
                response += `1. **Stranger** - No connection\n`;
                response += `2. **Acquaintance** - You know OF each other\n`;
                response += `3. **Casual friend** - You enjoy time together, stay surface\n`;
                response += `4. **Friend** - You share real things, support each other\n`;
                response += `5. **Close friend** - Deep trust, they know your shadows\n`;
                response += `6. **Intimate friend** - They know everything, unconditional\n\n`;
                response += `**Moving up the ladder requires:**\n`;
                response += `- Sharing something real before they do\n`;
                response += `- Asking deeper questions than "how are you"\n`;
                response += `- Following up on what they share\n`;
                response += `- Being consistent over time\n`;
                response += `- Showing up when it matters\n\n`;
                response += `---\n\n`;
                response += `**Questions that deepen:**\n\n`;
                response += `Instead of "How are you?", try:\n`;
                response += `- "What's been on your mind lately?"\n`;
                response += `- "What's something you're looking forward to?"\n`;
                response += `- "What's been hard recently?"\n`;
                response += `- "What would make this season of life better?"\n\n`;
                response += `**Vulnerability starters:**\n`;
                response += `- "I've been struggling with..."\n`;
                response += `- "Something I don't tell many people..."\n`;
                response += `- "I've been thinking about you because..."\n\n`;
                response += `What's one thing you could share with this person that would let them know you better?`;
                return response;
            },
        });
    },
};
const recognizeToxicFriendshipDef = {
    id: 'recognizeToxicFriendship',
    name: 'Recognize Toxic Friendship',
    description: 'Identify when a friendship is harmful rather than healthy',
    domain: 'connection',
    tags: ['connection', 'friendship', 'boundaries', 'toxic'],
    create: (ctx) => {
        return llm.tool({
            description: getToolDescription('recognizeToxicFriendship'),
            parameters: z.object({
                situation: z.string().describe('The friendship situation'),
                howTheyFeel: z.string().describe('How they feel after time with this person'),
                whatWorries: z.string().optional().describe('What worries them about the friendship'),
            }),
            execute: async ({ situation, howTheyFeel, whatWorries }) => {
                getLogger().info({ agentId: ctx.agentId }, 'Helping recognize toxic friendship');
                let response = `**Evaluating a Friendship**\n\n`;
                response += `The situation: ${situation}\n`;
                response += `How you feel after: ${howTheyFeel}\n`;
                if (whatWorries) {
                    response += `What worries you: ${whatWorries}\n`;
                }
                response += `\n---\n\n`;
                response += `**An important distinction:**\n\n`;
                response += `All friendships have hard moments. That's normal.\n`;
                response += `But some patterns indicate a friendship that costs more than it gives.\n\n`;
                response += `---\n\n`;
                response += `**Warning signs:**\n\n`;
                response += `- You feel **drained** after every interaction, not filled\n`;
                response += `- The relationship is **one-way** - you give, they take\n`;
                response += `- You feel **smaller** around them, not more yourself\n`;
                response += `- They **compete** rather than celebrate your wins\n`;
                response += `- You have to **perform** - can't be real\n`;
                response += `- They **dismiss** or minimize your feelings\n`;
                response += `- You feel **anxious** about their reactions\n`;
                response += `- They **keep score** or hold grudges\n`;
                response += `- You **walk on eggshells** around them\n`;
                response += `- They make you feel **guilty** for having other friends or priorities\n\n`;
                response += `**Healthy friendship signs:**\n\n`;
                response += `- You feel **energized** (or peacefully tired) after time together\n`;
                response += `- Support goes **both ways** over time\n`;
                response += `- You can be **yourself** - including messy parts\n`;
                response += `- They **celebrate** your wins genuinely\n`;
                response += `- You can **disagree** without it being a crisis\n`;
                response += `- They **respect** your boundaries\n\n`;
                response += `---\n\n`;
                response += `**Reflection:**\n\n`;
                response += `How many warning signs resonate with this friendship?\n`;
                response += `Does this feel like a difficult season in a good friendship, or a pattern?\n\n`;
                response += `What does your gut tell you about this relationship?`;
                return response;
            },
        });
    },
};
// ============================================================================
// BELONGING TOOLS
// ============================================================================
const findYourPeopleDef = {
    id: 'findYourPeople',
    name: 'Find Your People',
    description: 'Help discover where your community might be',
    domain: 'connection',
    tags: ['connection', 'belonging', 'community', 'tribe'],
    create: (ctx) => {
        return llm.tool({
            description: getToolDescription('findYourPeople'),
            parameters: z.object({
                whatMatters: z.string().describe('What matters most to them'),
                interests: z.array(z.string()).optional().describe('Their interests'),
                identities: z.array(z.string()).optional().describe('Important parts of their identity'),
                whatTheyveTriед: z.string().optional().describe("What they've tried"),
            }),
            execute: async ({ whatMatters, interests, identities, whatTheyveTriед }) => {
                getLogger().info({ agentId: ctx.agentId }, 'Helping find their people');
                let response = `**Finding Your People**\n\n`;
                response += `What matters to you: ${whatMatters}\n`;
                if (interests && interests.length > 0) {
                    response += `Your interests: ${interests.join(', ')}\n`;
                }
                if (identities && identities.length > 0) {
                    response += `Important identities: ${identities.join(', ')}\n`;
                }
                if (whatTheyveTriед) {
                    response += `What you've tried: ${whatTheyveTriед}\n`;
                }
                response += `\n---\n\n`;
                response += `**"Your people" aren't random.**\n\n`;
                response += `They share something with you - values, interests, experiences, identity. `;
                response += `The trick is putting yourself where those people gather.\n\n`;
                response += `---\n\n`;
                response += `**Where communities form:**\n\n`;
                response += `**Around Interests:**\n`;
                response += `- Classes and workshops (pottery, coding, cooking)\n`;
                response += `- Sports leagues and fitness groups\n`;
                response += `- Hobby clubs (book clubs, gaming, hiking)\n`;
                response += `- Creative communities (writing groups, maker spaces)\n\n`;
                response += `**Around Values:**\n`;
                response += `- Volunteer organizations\n`;
                response += `- Activism and advocacy groups\n`;
                response += `- Religious or spiritual communities\n`;
                response += `- Professional associations with missions you believe in\n\n`;
                response += `**Around Identity:**\n`;
                response += `- Cultural organizations\n`;
                response += `- LGBTQ+ spaces\n`;
                response += `- Parent groups\n`;
                response += `- Recovery communities\n`;
                response += `- Professional identity groups\n\n`;
                response += `**Around Life Stage:**\n`;
                response += `- New parent groups\n`;
                response += `- New-to-city groups\n`;
                response += `- Career transition communities\n`;
                response += `- Retiree groups\n\n`;
                response += `---\n\n`;
                response += `**The key insight:**\n`;
                response += `Don't look for "friends." Look for activities with people who share what matters to you. `;
                response += `Friendships form as a byproduct.\n\n`;
                const wisdom = CONNECTION_WISDOM.find((w) => w.context === 'belonging');
                if (wisdom) {
                    response += `> "${wisdom.quote}"\n`;
                    response += `> — ${wisdom.attribution}\n\n`;
                }
                response += `Based on what matters to you, where might your people be gathering?`;
                return response;
            },
        });
    },
};
const createBelongingDef = {
    id: 'createBelonging',
    name: 'Create Belonging',
    description: 'Build belonging where you are rather than searching for it',
    domain: 'connection',
    tags: ['connection', 'belonging', 'creation', 'home'],
    create: (ctx) => {
        return llm.tool({
            description: getToolDescription('createBelonging'),
            parameters: z.object({
                currentContext: z.string().describe('Where they currently are (work, neighborhood, etc.)'),
                whatsMissing: z.string().describe('What belonging would feel like'),
            }),
            execute: async ({ currentContext, whatsMissing }) => {
                getLogger().info({ agentId: ctx.agentId }, 'Helping create belonging');
                let response = `**Creating Belonging**\n\n`;
                response += `Sometimes we wait to find belonging somewhere else. `;
                response += `But often, we can create it where we already are.\n\n`;
                response += `Your context: ${currentContext}\n`;
                response += `What you're missing: ${whatsMissing}\n\n`;
                response += `---\n\n`;
                response += `**The belonging-creation mindset:**\n\n`;
                response += `Instead of "Where do I belong?" ask:\n`;
                response += `"How can I create belonging here?"\n\n`;
                response += `You have more power than you think.\n\n`;
                response += `---\n\n`;
                response += `**Ways to create belonging:**\n\n`;
                response += `**Be a Connector:**\n`;
                response += `- Introduce people to each other\n`;
                response += `- Organize gatherings (even small ones)\n`;
                response += `- Be the person who remembers names and details\n`;
                response += `- Create recurring events\n\n`;
                response += `**Be a Regular:**\n`;
                response += `- Show up consistently at the same places\n`;
                response += `- Learn names of staff and other regulars\n`;
                response += `- Make a coffee shop, gym, or bar "your place"\n\n`;
                response += `**Be a Host:**\n`;
                response += `- Open your home (doesn't have to be fancy)\n`;
                response += `- Create traditions (monthly dinner, weekly walk)\n`;
                response += `- Be the one who gathers people\n\n`;
                response += `**Be a Contributor:**\n`;
                response += `- Volunteer in your community\n`;
                response += `- Help neighbors\n`;
                response += `- Participate in local events\n`;
                response += `- Join local boards or committees\n\n`;
                response += `---\n\n`;
                response += `**The truth about belonging:**\n`;
                response += `People who "belong" often started by creating belonging for others. `;
                response += `The host always belongs at the party.\n\n`;
                response += `What's one small way you could create connection in your current context?`;
                return response;
            },
        });
    },
};
// ============================================================================
// ASSESSMENT & BALANCE TOOLS
// ============================================================================
const assessConnectionHealthDef = {
    id: 'assessConnectionHealth',
    name: 'Assess Connection Health',
    description: "Evaluate the health of someone's social connections",
    domain: 'connection',
    tags: ['connection', 'assessment', 'health', 'relationships'],
    create: (ctx) => {
        return llm.tool({
            description: getToolDescription('assessConnectionHealth'),
            parameters: z.object({
                selfAssessment: z
                    .enum(['isolated', 'somewhat-connected', 'well-connected', 'unsure'])
                    .describe("How they'd describe their connection level"),
            }),
            execute: async ({ selfAssessment }, { ctx: toolCtx }) => {
                getLogger().info({ agentId: ctx.agentId, selfAssessment }, 'Assessing connection health');
                // Persist assessment
                persistTrackedItem(toolCtx, {
                    domain: 'connection',
                    itemType: 'connection_assessment',
                    item: { selfAssessment },
                    importance: 'medium',
                });
                let response = `**Connection Health Check**\n\n`;
                response += `You described yourself as: ${selfAssessment}\n\n`;
                response += `---\n\n`;
                response += `**Healthy Connection Signs:**\n`;
                response += `_How many of these feel true for you?_\n\n`;
                CONNECTION_HEALTH.healthy_signs.forEach((sign) => {
                    response += `☐ ${sign}\n`;
                });
                response += `\n**Warning Signs:**\n`;
                response += `_How many of these resonate?_\n\n`;
                CONNECTION_HEALTH.warning_signs.forEach((sign) => {
                    response += `☐ ${sign}\n`;
                });
                response += `\n---\n\n`;
                response += `**Connection needs vary by person:**\n\n`;
                response += `- Introverts need fewer, deeper connections\n`;
                response += `- Extroverts need more frequent social contact\n`;
                response += `- Both need at least ONE person who really knows them\n\n`;
                response += `**The minimum for human flourishing:**\n`;
                response += `- At least one close confidant\n`;
                response += `- Some form of social connection weekly\n`;
                response += `- A sense of belonging somewhere\n\n`;
                response += `---\n\n`;
                response += `Based on those lists, what stands out to you? What do you have, and what's missing?`;
                return response;
            },
        });
    },
};
const balanceAloneAndTogetherDef = {
    id: 'balanceAloneAndTogether',
    name: 'Balance Alone and Together',
    description: 'Find the right balance between solitude and connection',
    domain: 'connection',
    tags: ['connection', 'solitude', 'balance', 'introvert'],
    create: (ctx) => {
        return llm.tool({
            description: getToolDescription('balanceAloneAndTogether'),
            parameters: z.object({
                currentBalance: z.string().describe('Their current balance'),
                energyPattern: z
                    .enum(['energized-by-people', 'drained-by-people', 'depends', 'unsure'])
                    .optional(),
                whatFeelsOff: z.string().optional().describe('What feels off about their balance'),
            }),
            execute: async ({ currentBalance, energyPattern, whatFeelsOff }) => {
                getLogger().info({ agentId: ctx.agentId, energyPattern }, 'Balancing alone and together');
                let response = `**Finding Your Balance**\n\n`;
                response += `Current balance: ${currentBalance}\n`;
                if (energyPattern) {
                    response += `Energy pattern: ${energyPattern}\n`;
                }
                if (whatFeelsOff) {
                    response += `What feels off: ${whatFeelsOff}\n`;
                }
                response += `\n---\n\n`;
                response += `**Solitude vs. Loneliness:**\n\n`;
                const wisdom = CONNECTION_WISDOM.find((w) => w.context === 'solitude-vs-loneliness');
                if (wisdom) {
                    response += `> "${wisdom.quote}"\n`;
                    response += `> — ${wisdom.attribution}\n\n`;
                }
                response += `**Solitude** is chosen, nourishing, peaceful.\n`;
                response += `**Loneliness** is unwanted, depleting, painful.\n\n`;
                response += `The same amount of alone time can be either, depending on choice and meaning.\n\n`;
                response += `---\n\n`;
                response += `**Finding your optimal balance:**\n\n`;
                response += `**If you're drained by too much socializing:**\n`;
                response += `- You might be an introvert - that's not a flaw\n`;
                response += `- Schedule recovery time after social events\n`;
                response += `- Choose quality connections over quantity\n`;
                response += `- One-on-one often beats groups\n`;
                response += `- It's okay to leave early or decline invitations\n\n`;
                response += `**If you're drained by too much alone time:**\n`;
                response += `- You might need more social contact than you're getting\n`;
                response += `- Work in public spaces (coffee shops, libraries)\n`;
                response += `- Create recurring social anchors in your week\n`;
                response += `- Even small interactions count (chatting with neighbors)\n`;
                response += `- Don't wait for perfect plans - any connection helps\n\n`;
                response += `---\n\n`;
                response += `**Reflection questions:**\n\n`;
                response += `- How many hours of solitude feels right per day?\n`;
                response += `- How many social interactions per week feel right?\n`;
                response += `- What's the difference between good alone time and bad alone time for you?\n`;
                response += `- What social activities fill you vs. drain you?\n\n`;
                response += `What would your ideal balance look like?`;
                return response;
            },
        });
    },
};
// ============================================================================
// SMALL ACTS TOOL
// ============================================================================
const smallActsOfConnectionDef = {
    id: 'smallActsOfConnection',
    name: 'Small Acts of Connection',
    description: 'Suggest tiny, doable connection practices',
    domain: 'connection',
    tags: ['connection', 'rituals', 'small-acts', 'practical'],
    create: (ctx) => {
        return llm.tool({
            description: getToolDescription('smallActsOfConnection'),
            parameters: z.object({
                timeAvailable: z
                    .enum(['2-minutes', '15-minutes', '1-hour', 'more'])
                    .describe('How much time they have'),
                energyLevel: z.enum(['low', 'medium', 'high']).optional(),
                preference: z.enum(['text-based', 'voice', 'in-person', 'any']).optional(),
            }),
            execute: async ({ timeAvailable, energyLevel, preference }) => {
                getLogger().info({ agentId: ctx.agentId, timeAvailable, energyLevel }, 'Suggesting small acts of connection');
                let response = `**Small Acts of Connection**\n\n`;
                response += `Time available: ${timeAvailable}\n`;
                if (energyLevel) {
                    response += `Energy: ${energyLevel}\n`;
                }
                response += `\n---\n\n`;
                response += `Connection doesn't require big gestures. Small, consistent acts build relationships over time.\n\n`;
                switch (timeAvailable) {
                    case '2-minutes':
                        response += `**2-Minute Connection Acts:**\n\n`;
                        response += `- Text someone: "Thinking of you" or "Saw this and thought of you"\n`;
                        response += `- Reply to someone's social media post with something genuine\n`;
                        response += `- Send a voice memo instead of a text\n`;
                        response += `- Thank someone specifically for something they did\n`;
                        response += `- Make eye contact and genuinely greet someone\n`;
                        break;
                    case '15-minutes':
                        response += `**15-Minute Connection Acts:**\n\n`;
                        response += `- Call someone instead of texting\n`;
                        response += `- Write a thoughtful message to an old friend\n`;
                        response += `- Have a real conversation with a coworker (not about work)\n`;
                        response += `- Send a card or note to someone\n`;
                        response += `- Video call someone briefly\n`;
                        break;
                    case '1-hour':
                        response += `**1-Hour Connection Acts:**\n\n`;
                        response += `- Coffee or lunch with someone\n`;
                        response += `- Walk with a friend\n`;
                        response += `- Help someone with something\n`;
                        response += `- Attend a class or group activity\n`;
                        response += `- Cook a meal for someone (or with them)\n`;
                        break;
                    case 'more':
                        response += `**Deeper Connection Acts:**\n\n`;
                        response += `- Host a gathering at your home\n`;
                        response += `- Plan an outing or trip with friends\n`;
                        response += `- Volunteer together\n`;
                        response += `- Be there for someone going through something hard\n`;
                        response += `- Have a long, deep conversation\n`;
                        break;
                }
                if (energyLevel === 'low') {
                    response += `\n**Low-energy options:**\n`;
                    response += `When energy is low, connection can still happen:\n`;
                    response += `- Body doubling (being in same space, doing separate things)\n`;
                    response += `- Watching something together virtually\n`;
                    response += `- Voice messages that don't require real-time energy\n`;
                    response += `- Just saying "I'm struggling, can you just sit with me?"\n`;
                }
                response += `\n---\n\n`;
                response += `Which of these feels doable right now?`;
                return response;
            },
        });
    },
};
// ============================================================================
// WISDOM TOOL
// ============================================================================
const shareConnectionWisdomDef = {
    id: 'shareConnectionWisdom',
    name: 'Share Connection Wisdom',
    description: 'Share wisdom about connection, loneliness, and belonging',
    domain: 'connection',
    tags: ['connection', 'wisdom', 'quotes', 'inspiration'],
    create: (ctx) => {
        return llm.tool({
            description: getToolDescription('shareConnectionWisdom'),
            parameters: z.object({
                context: z
                    .enum([
                    'importance',
                    'intimate-loneliness',
                    'modern-loneliness',
                    'solitude-vs-loneliness',
                    'friendship',
                    'belonging',
                    'general',
                ])
                    .describe('What context they need wisdom for'),
            }),
            execute: async ({ context }) => {
                getLogger().info({ agentId: ctx.agentId, context }, 'Sharing connection wisdom');
                let response = `**Wisdom on Connection**\n\n`;
                const matchingWisdom = CONNECTION_WISDOM.filter((w) => w.context === context || context === 'general');
                const wisdomToShare = matchingWisdom.length > 0 ? matchingWisdom : CONNECTION_WISDOM.slice(0, 3);
                wisdomToShare.forEach((w) => {
                    response += `> "${w.quote}"\n`;
                    response += `> — ${w.attribution}\n\n`;
                });
                response += `---\n\n`;
                response += `What resonates with you?`;
                return response;
            },
        });
    },
};
// ============================================================================
// CROSS-PERSONA INTELLIGENCE TOOLS
// ============================================================================
const shareConnectionInsightDef = {
    id: 'shareConnectionInsight',
    name: 'Share Connection Insight',
    description: 'Share connection/loneliness insight with another team member',
    domain: 'connection',
    tags: ['cross-persona', 'connection', 'team'],
    create: (ctx) => {
        return llm.tool({
            description: getToolDescription('shareConnectionInsight'),
            parameters: z.object({
                targetPersona: z
                    .enum(['maya', 'jordan', 'nayan', 'ferni', 'all'])
                    .describe('Who should know this'),
                insight: z.string().describe('The connection-related insight'),
                actionable: z.boolean().describe('Is there something specific they can help with?'),
            }),
            execute: async ({ targetPersona, insight, actionable }) => {
                getLogger().info({ agentId: ctx.agentId, targetPersona }, 'Sharing connection insight');
                try {
                    addCrossPersonaInsight(ctx.userId, {
                        source: 'ferni',
                        target: targetPersona,
                        content: `Connection insight: ${insight} | Actionable: ${actionable}`,
                        priority: actionable ? 'high' : 'normal',
                        category: 'connection',
                        proactive: true,
                        oneTime: false,
                    });
                    const targetName = targetPersona === 'all'
                        ? 'the team'
                        : targetPersona.charAt(0).toUpperCase() + targetPersona.slice(1);
                    let response = `**Insight Shared with ${targetName}**\n\n`;
                    if (targetPersona === 'maya') {
                        response += `Maya can help build connection habits - small rituals that nurture relationships over time.`;
                    }
                    else if (targetPersona === 'jordan') {
                        response += `Jordan can help plan social goals and milestones in your connection journey.`;
                    }
                    else if (targetPersona === 'nayan') {
                        response += `Nayan can explore the deeper questions about belonging and what connection means to you.`;
                    }
                    return response;
                }
                catch (error) {
                    getLogger().error({ error }, 'Failed to share connection insight');
                    return "I'll keep this in mind as we work together.";
                }
            },
        });
    },
};
const getRelationshipNetworkContextDef = {
    id: 'getRelationshipNetworkContext',
    name: 'Get Relationship Network Context',
    description: "Get context about the user's relationship network from superhuman services",
    domain: 'connection',
    tags: ['cross-persona', 'relationships', 'network'],
    create: (ctx) => {
        return llm.tool({
            description: getToolDescription('getRelationshipNetworkContext'),
            parameters: z.object({}),
            execute: async () => {
                getLogger().info({ agentId: ctx.agentId }, 'Getting relationship network context');
                try {
                    const networkContext = await buildNetworkContext(ctx.userId);
                    if (!networkContext || networkContext === '') {
                        return "I don't have detailed relationship network data yet. As we talk more about the people in your life, I'll remember them.";
                    }
                    return `**Your Relationship Network**\n\n${networkContext}\n\nThis context helps me understand your social world better. Who's on your mind today?`;
                }
                catch (error) {
                    getLogger().error({ error }, 'Failed to get relationship network');
                    return "Let's talk about the people in your life. I'll remember what you share.";
                }
            },
        });
    },
};
const flagConnectionConcernForMayaDef = {
    id: 'flagConnectionConcernForMaya',
    name: 'Flag Connection Concern for Maya',
    description: 'Alert Maya when connection struggles might benefit from habit-based interventions',
    domain: 'connection',
    tags: ['cross-persona', 'habits', 'maya'],
    create: (ctx) => {
        return llm.tool({
            description: getToolDescription('flagConnectionConcernForMaya'),
            parameters: z.object({
                concern: z.string().describe('The connection concern'),
                suggestedHabit: z.string().optional().describe('What kind of habit might help'),
                urgency: z.enum(['low', 'medium', 'high']).describe('How urgent is this'),
            }),
            execute: async ({ concern, suggestedHabit, urgency }) => {
                getLogger().info({ agentId: ctx.agentId, concern, urgency }, 'Flagging connection concern for Maya');
                try {
                    let content = `Connection concern: ${concern}`;
                    if (suggestedHabit) {
                        content += ` | Suggested habit approach: ${suggestedHabit}`;
                    }
                    addCrossPersonaInsight(ctx.userId, {
                        source: 'ferni',
                        target: 'maya',
                        content,
                        priority: urgency === 'high' ? 'high' : 'normal',
                        category: 'connection_habit',
                        proactive: true,
                        oneTime: false,
                    });
                    let response = `**Concern Shared with Maya**\n\n`;
                    response += `Maya specializes in building sustainable habits. She now knows about this connection concern.\n\n`;
                    if (suggestedHabit) {
                        response += `I mentioned that ${suggestedHabit.toLowerCase()} might help. She can design a tiny, doable version.`;
                    }
                    else {
                        response += `She can help design small, consistent rituals to strengthen your connections over time.`;
                    }
                    return response;
                }
                catch (error) {
                    getLogger().error({ error }, 'Failed to flag concern for Maya');
                    return "I'll remember this. Building connection is a practice, not an event.";
                }
            },
        });
    },
};
// ============================================================================
// DOMAIN TOOLS COLLECTION
// ============================================================================
const connectionTools = [
    // Loneliness
    acknowledgeLonelinessDef,
    exploreLonelinessTypeDef,
    sitWithLonelinessDef,
    // Friendship
    makeAdultFriendsDef,
    maintainFriendshipsDef,
    moveFromAcquaintanceToFriendDef,
    recognizeToxicFriendshipDef,
    // Belonging
    findYourPeopleDef,
    createBelongingDef,
    // Assessment & Balance
    assessConnectionHealthDef,
    balanceAloneAndTogetherDef,
    // Rituals
    smallActsOfConnectionDef,
    // Wisdom
    shareConnectionWisdomDef,
    // Cross-persona intelligence
    shareConnectionInsightDef,
    getRelationshipNetworkContextDef,
    flagConnectionConcernForMayaDef,
];
// ============================================================================
// EXPORTS
// ============================================================================
export const { getToolDefinitions, domain, definitions } = createDomainExport('connection', connectionTools);
export default getToolDefinitions;
//# sourceMappingURL=index.js.map