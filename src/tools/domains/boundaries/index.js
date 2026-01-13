/**
 * Boundaries Domain
 *
 * Comprehensive tools for setting, maintaining, and healing around boundaries.
 * This is one of the most impactful life coaching domains - most people struggle
 * with boundaries and it affects every area of life.
 *
 * DOMAIN: boundaries
 * PERSONA AFFINITY: Maya (habits/routines), Alex (communication)
 *
 * TOOLS:
 *   Assessment: identifyBoundaryNeeds, boundaryInventory
 *   Setting: setBoundary, sayNoWithGrace
 *   Maintenance: maintainBoundary, healFromBoundaryViolation
 *   Patterns: recoverFromPeoplePleasing
 *
 * PRINCIPLES:
 * - Boundaries are self-care, not selfishness
 * - "No" is a complete sentence
 * - Others' reactions to our boundaries are information about them
 * - People-pleasing is a survival strategy that can be unlearned
 */
import { createDomainExport } from '../../registry/loader.js';
import { llm } from '@livekit/agents';
import { z } from 'zod';
import { getLogger } from '../../../utils/safe-logger.js';
import { getToolDescription } from '../../utils/tool-descriptions.js';
// Import shared life coaching utilities
import { getLifeCoachingProfile, updateLifeCoachingProfile, recordBoundaryAttempt, getBoundaryPatterns, detectTendencyCues, updateTendency, } from '../life-coaching-shared/user-profile.js';
import { generateAdaptiveResponse, detectPeoplePleasing, recognizeProgress, } from '../life-coaching-shared/adaptive-response.js';
import { getScriptForCategory, getAdaptedScript, TENDENCY_STRATEGIES, REFLECTION_QUESTIONS, } from '../life-coaching-shared/content-databases.js';
// Import PhD-level research and persona methodology integration
import { getEnhancedToolContext, getOpeningPhrase, } from '../life-coaching-shared/tool-content-integration.js';
const log = getLogger();
// ============================================================================
// BOUNDARY TYPES DATABASE
// ============================================================================
const BOUNDARY_TYPES = {
    physical: {
        description: 'Personal space, touch, physical needs',
        examples: ['I need personal space when stressed', "I'm not a hugger", 'I need time alone'],
        violations: [
            'standing too close',
            'unwanted touch',
            'showing up unannounced',
            'going through belongings',
        ],
    },
    emotional: {
        description: 'Protecting emotional energy and wellbeing',
        examples: [
            "I can't take on your problems right now",
            'I need time to process before discussing',
        ],
        violations: [
            'emotional dumping',
            'making their emotions your responsibility',
            'guilt-tripping',
        ],
    },
    time: {
        description: 'How you spend your hours and energy',
        examples: ["I don't check email after 7pm", 'I need 30 min alone after work', 'I need notice'],
        violations: [
            'last-minute requests',
            'expecting immediate responses',
            'schedule hijacking',
            'meetings that should be emails',
        ],
    },
    digital: {
        description: 'Online presence and availability',
        examples: [
            "I don't respond to texts immediately",
            "I'm not on social media",
            'I mute notifications',
        ],
        violations: [
            'expecting immediate replies',
            'multiple follow-ups',
            'video calls without warning',
        ],
    },
    material: {
        description: 'Possessions, money, lending',
        examples: [
            "I don't lend money to friends",
            'Please ask before borrowing',
            'I give gifts, not loans',
        ],
        violations: ['borrowing without asking', 'expecting financial help', 'not returning items'],
    },
    intellectual: {
        description: 'Thoughts, ideas, opinions',
        examples: [
            'I need you to hear my perspective',
            "I'm not open to debate on this",
            "Don't dismiss my ideas",
        ],
        violations: ['dismissing opinions', 'interrupting', 'mansplaining', 'idea theft'],
    },
    sexual: {
        description: 'Intimacy, touch, consent',
        examples: ["I'm not ready for that", 'I need to feel safe first', 'Consent is ongoing'],
        violations: ['pressure', 'coercion', 'ignoring verbal/nonverbal cues', 'assumption'],
    },
};
// ============================================================================
// TOOL: Identify Boundary Needs
// ============================================================================
const identifyBoundaryNeedsDef = {
    id: 'identifyBoundaryNeeds',
    name: 'Identify Boundary Needs',
    description: 'Help users recognize where boundaries are needed in their life',
    domain: 'boundaries',
    tags: ['boundaries', 'assessment', 'awareness', 'self-discovery'],
    create: (ctx) => {
        return llm.tool({
            description: getToolDescription('identifyBoundaryNeeds'),
            parameters: z.object({
                situation: z
                    .string()
                    .optional()
                    .describe('A specific situation prompting this exploration'),
                feelingDrained: z
                    .boolean()
                    .optional()
                    .describe('User mentions feeling drained or resentful'),
            }),
            execute: async ({ situation, feelingDrained }) => {
                log.info({ agentId: ctx.agentId, hasSituation: !!situation }, 'Identifying boundary needs');
                // Load enhanced context with PhD-level research and persona methodology
                const enhancedContext = await getEnhancedToolContext(ctx.agentId, 'boundaries', situation, ctx.userId);
                const profile = await getLifeCoachingProfile(ctx.userId);
                // Check for tendency cues
                if (situation) {
                    const tendencyCue = detectTendencyCues(situation);
                    if (tendencyCue) {
                        await updateTendency(ctx.userId, tendencyCue.tendency, tendencyCue.confidence);
                    }
                }
                // Build personalized response
                const context = {
                    userId: ctx.userId,
                    personaId: ctx.agentId,
                    userProfile: profile,
                    isFirstTimeWithTopic: !profile.boundaryHistory?.length,
                };
                let response = '';
                // Use persona-specific opening phrase from methodology
                const openingPhrase = getOpeningPhrase(enhancedContext);
                // Acknowledge what brought them here
                if (situation) {
                    response += `${openingPhrase}\n\nLet's explore what's happening with "${situation}".\n\n`;
                }
                else if (feelingDrained) {
                    response += `${openingPhrase}\n\nFeeling drained is often a sign that boundaries need attention.\n\n`;
                }
                else {
                    response += `${openingPhrase}\n\n`;
                }
                // Provide boundary type overview
                response += '**Boundaries come in different forms:**\n\n';
                for (const [type, info] of Object.entries(BOUNDARY_TYPES)) {
                    response += `**${type.charAt(0).toUpperCase() + type.slice(1)}**: ${info.description}\n`;
                }
                // Add reflection questions
                response += '\n**Questions to help you identify where you need boundaries:**\n\n';
                response += REFLECTION_QUESTIONS.boundaries
                    .slice(0, 3)
                    .map((q) => `• ${q}`)
                    .join('\n');
                // Add tendency-specific insight if we know it
                if (profile.fourTendency) {
                    const strategies = TENDENCY_STRATEGIES[profile.fourTendency];
                    response += `\n\n**For you specifically** (as someone who resonates with ${profile.fourTendency} patterns):\n`;
                    response += strategies.boundaries[0];
                }
                // Check for people-pleasing
                if (situation) {
                    const ppScore = detectPeoplePleasing(situation);
                    if (ppScore > 2) {
                        response += "\n\nI'm noticing some patterns that might be people-pleasing. ";
                        response += "That's not a judgment - it's often a survival strategy. ";
                        response += 'Would you like to explore that?';
                    }
                }
                // Offer next steps
                response += '\n\nWhich area feels most urgent right now?';
                return generateAdaptiveResponse(response, context, {
                    validateFirst: false,
                    frameTendency: true,
                });
            },
        });
    },
};
// ============================================================================
// TOOL: Set a Boundary
// ============================================================================
const setBoundaryDef = {
    id: 'setBoundary',
    name: 'Set a Boundary',
    description: 'Script and practice boundary-setting conversations',
    domain: 'boundaries',
    tags: ['boundaries', 'communication', 'scripts', 'practice'],
    create: (ctx) => {
        return llm.tool({
            description: getToolDescription('setBoundary'),
            parameters: z.object({
                boundaryType: z
                    .enum(['physical', 'emotional', 'time', 'digital', 'material', 'intellectual', 'sexual'])
                    .describe('Type of boundary'),
                personType: z
                    .enum([
                    'parent',
                    'family',
                    'partner',
                    'boss',
                    'coworker',
                    'friend',
                    'acquaintance',
                    'other',
                ])
                    .describe('Relationship with the person'),
                situation: z.string().describe('Specific situation requiring a boundary'),
                firmness: z
                    .enum(['soft', 'firm', 'assertive'])
                    .optional()
                    .describe('Desired firmness level')
                    .default('firm'),
                previousAttempts: z
                    .number()
                    .optional()
                    .describe('How many times have you tried to set this boundary before'),
            }),
            execute: async ({ boundaryType, personType, situation, firmness = 'firm', previousAttempts, }) => {
                log.info({ agentId: ctx.agentId, boundaryType, personType }, 'Helping set boundary');
                const profile = await getLifeCoachingProfile(ctx.userId);
                const boundaryInfo = BOUNDARY_TYPES[boundaryType];
                // Build response
                let response = '';
                // Validate the need for the boundary
                response += `Setting a ${boundaryType} boundary with your ${personType} around "${situation}".\n\n`;
                response += "**First, let's be clear:** Your need for this boundary is valid. ";
                response += "You don't need to earn boundaries or justify them perfectly.\n\n";
                // Check if this is a repeat attempt
                if (previousAttempts && previousAttempts > 0) {
                    response += `I hear you've tried to set this boundary ${previousAttempts} time${previousAttempts > 1 ? 's' : ''} before. `;
                    response += "That takes persistence. Let's try a different approach this time.\n\n";
                }
                // Get category for scripts - use relationship type to find appropriate scripts
                let scriptCategory = boundaryType;
                if (personType === 'parent' || personType === 'family') {
                    scriptCategory = 'family';
                }
                else if (personType === 'boss' || personType === 'coworker') {
                    scriptCategory = 'work';
                }
                // Get adapted scripts
                const scripts = getScriptForCategory(scriptCategory, firmness);
                const tendencyScript = profile.fourTendency
                    ? getAdaptedScript(scriptCategory, profile.fourTendency)
                    : null;
                response += '**Scripts you can use:**\n\n';
                if (tendencyScript) {
                    response += `*Personalized for you:* "${tendencyScript}"\n\n`;
                }
                if (scripts.length > 0) {
                    response += `*${firmness.charAt(0).toUpperCase() + firmness.slice(1)} options:*\n`;
                    scripts.slice(0, 3).forEach((script) => {
                        response += `• "${script}"\n`;
                    });
                }
                // Add practical tips
                response += '\n**When setting this boundary:**\n';
                response += '• State it clearly, without over-explaining\n';
                response += "• You don't owe a perfect justification\n";
                response += '• Their reaction is about them, not the validity of your boundary\n';
                response +=
                    '• Be prepared to hold it - boundaries without follow-through teach people to ignore you\n';
                // Tendency-specific advice
                if (profile.fourTendency) {
                    const strategies = TENDENCY_STRATEGIES[profile.fourTendency];
                    response += `\n**Remember** (as a ${profile.fourTendency}): ${strategies.boundaries[1] || strategies.boundaries[0]}`;
                }
                // Offer practice
                response +=
                    '\n\nWould you like to practice saying this out loud? I can help you refine it.';
                // Track this as an attempt
                await recordBoundaryAttempt(ctx.userId, {
                    personType,
                    boundaryType,
                    outcome: 'unsure', // Will update later
                });
                return response;
            },
        });
    },
};
// ============================================================================
// TOOL: Say No With Grace
// ============================================================================
const sayNoWithGraceDef = {
    id: 'sayNoWithGrace',
    name: 'Say No With Grace',
    description: 'Practice declining requests compassionately without over-explaining',
    domain: 'boundaries',
    tags: ['boundaries', 'communication', 'saying-no', 'scripts'],
    create: (ctx) => {
        return llm.tool({
            description: getToolDescription('sayNoWithGrace'),
            parameters: z.object({
                request: z.string().describe('What you are being asked to do'),
                whyHard: z.string().optional().describe('Why saying no feels hard'),
                relationship: z.string().optional().describe('Relationship with the person asking'),
            }),
            execute: async ({ request, whyHard, relationship }) => {
                log.info({ agentId: ctx.agentId }, 'Helping say no with grace');
                const profile = await getLifeCoachingProfile(ctx.userId);
                let response = `Saying no to "${request}". `;
                if (whyHard) {
                    response += `\n\nYou mentioned this feels hard because "${whyHard}". `;
                    response +=
                        "That's important to acknowledge. Saying no can feel like betrayal when we've been taught our worth comes from being useful.\n\n";
                }
                // Core truth
                response += "**The truth:** No is a complete sentence. You don't need to:\n";
                response += '• Explain yourself thoroughly\n';
                response += '• Offer an alternative\n';
                response += '• Apologize profusely\n';
                response += '• Make up an excuse\n\n';
                // Get declining scripts
                const softScripts = getScriptForCategory('saying-no', 'soft');
                const firmScripts = getScriptForCategory('saying-no', 'firm');
                response += '**Ways to say no:**\n\n';
                response += '*Gentle but clear:*\n';
                softScripts.slice(0, 3).forEach((s) => {
                    response += `• "${s}"\n`;
                });
                response += '\n*Direct:*\n';
                firmScripts.slice(0, 2).forEach((s) => {
                    response += `• "${s}"\n`;
                });
                // Add tendency-specific framing
                if (profile.fourTendency) {
                    response += `\n*For you specifically:*\n`;
                    const adapted = getAdaptedScript('saying-no', profile.fourTendency);
                    if (adapted) {
                        response += `• "${adapted}"\n`;
                    }
                }
                // Address people-pleasing if detected
                if (whyHard) {
                    const ppScore = detectPeoplePleasing(whyHard);
                    if (ppScore > 2) {
                        response +=
                            "\n**I notice something:** The difficulty you're describing sounds like people-pleasing patterns. ";
                        response += "This isn't a character flaw - it's often how we learned to stay safe. ";
                        response += "But you're allowed to unlearn it.\n";
                    }
                }
                response +=
                    '\n**Practice:** Try saying your chosen script out loud right now. Notice how it feels in your body.';
                return response;
            },
        });
    },
};
// ============================================================================
// TOOL: Maintain Boundary
// ============================================================================
const maintainBoundaryDef = {
    id: 'maintainBoundary',
    name: 'Maintain Boundary',
    description: 'Support when boundaries are being tested or pushed',
    domain: 'boundaries',
    tags: ['boundaries', 'maintenance', 'support', 'resilience'],
    create: (ctx) => {
        return llm.tool({
            description: getToolDescription('maintainBoundary'),
            parameters: z.object({
                boundarySet: z.string().describe('The boundary you set'),
                howTested: z.string().describe('How the boundary is being tested'),
                personReaction: z
                    .enum(['anger', 'guilt-trip', 'silent-treatment', 'pushback', 'ignore', 'respect'])
                    .describe('How they reacted'),
                feelingAboutIt: z.string().optional().describe('How you feel about their reaction'),
            }),
            execute: async ({ boundarySet, howTested, personReaction, feelingAboutIt }) => {
                log.info({ agentId: ctx.agentId, personReaction }, 'Supporting boundary maintenance');
                const profile = await getLifeCoachingProfile(ctx.userId);
                let response = '';
                // Validate the experience
                if (personReaction !== 'respect') {
                    response += `Your boundary being tested like this is hard. `;
                    response += `Their ${personReaction} reaction is about them, not evidence that your boundary is wrong.\n\n`;
                }
                else {
                    response += "It sounds like they're respecting your boundary - that's wonderful! ";
                    response += "Not everyone reacts well, so it's worth celebrating when they do.\n\n";
                }
                // Address specific reactions
                const reactionResponses = {
                    anger: "Anger is sometimes how people respond when they lose access to something they felt entitled to. That doesn't make your boundary wrong.",
                    'guilt-trip': 'Guilt trips are manipulation, even when unintentional. If your boundary is reasonable, their guilt-tripping is the problem, not your limit.',
                    'silent-treatment': 'Silent treatment is itself a boundary violation - using withdrawal as punishment. You can acknowledge it without caving.',
                    pushback: 'Some pushback is normal. People resist change. Your job is to hold firm, not convince them.',
                    ignore: "If they're ignoring your boundary, you may need consequences. Boundaries without enforcement teach people to ignore you.",
                };
                if (personReaction !== 'respect' && reactionResponses[personReaction]) {
                    response += `**About their ${personReaction}:**\n`;
                    response += reactionResponses[personReaction] + '\n\n';
                }
                // Acknowledge feelings
                if (feelingAboutIt) {
                    response += `You mentioned feeling: "${feelingAboutIt}". `;
                    response +=
                        'Those feelings are valid. Boundary work is emotionally hard, especially with people we care about.\n\n';
                }
                // Maintenance strategies
                response += '**To maintain this boundary:**\n';
                response += '• Repeat calmly: "I understand you\'re frustrated. My boundary stands."\n';
                response += "• Don't JADE (Justify, Argue, Defend, Explain)\n";
                response += '• If needed, remove yourself: "I\'m going to step away now."\n';
                response += '• Follow through with consequences if they persist\n\n';
                // Long-term view
                response +=
                    '**Remember:** The discomfort of maintaining a boundary is temporary. The cost of abandoning it is ongoing.';
                // Track outcome
                await recordBoundaryAttempt(ctx.userId, {
                    personType: 'other',
                    boundaryType: 'emotional',
                    outcome: personReaction === 'respect' ? 'maintained' : 'tested',
                    notes: howTested,
                });
                return response;
            },
        });
    },
};
// ============================================================================
// TOOL: Heal From Boundary Violation
// ============================================================================
const healFromBoundaryViolationDef = {
    id: 'healFromBoundaryViolation',
    name: 'Heal From Boundary Violation',
    description: 'Process when boundaries were crossed and work toward healing',
    domain: 'boundaries',
    tags: ['boundaries', 'healing', 'processing', 'repair'],
    create: (ctx) => {
        return llm.tool({
            description: getToolDescription('healFromBoundaryViolation'),
            parameters: z.object({
                whatHappened: z.string().describe('What boundary was violated'),
                howYouFeel: z.string().describe('How you feel about it'),
                isOngoing: z.boolean().optional().describe('Is this an ongoing situation'),
            }),
            execute: async ({ whatHappened, howYouFeel, isOngoing }) => {
                log.info({ agentId: ctx.agentId, isOngoing }, 'Supporting healing from boundary violation');
                let response = '';
                // Validate the experience
                response += `What happened - "${whatHappened}" - is a real boundary violation. `;
                response += 'Your feelings about it are valid.\n\n';
                // Acknowledge emotions
                response += `You said you feel: "${howYouFeel}". `;
                response += 'Those feelings make sense. When our boundaries are crossed, we often feel:\n';
                response += '• Angry - at them and sometimes at ourselves\n';
                response += "• Hurt - because our limits weren't respected\n";
                response += "• Confused - especially if we've normalized poor treatment\n";
                response += "• Shame - which is misplaced; the violation isn't your fault\n\n";
                // Address ongoing vs past
                if (isOngoing) {
                    response += '**Since this is ongoing:**\n';
                    response +=
                        "1. Your safety comes first - if you're in danger, please reach out to appropriate resources\n";
                    response += '2. You may need to create distance to protect yourself\n';
                    response += '3. External support (therapist, support group) can help you navigate this\n';
                    response += '4. Document if necessary\n\n';
                }
                else {
                    response += '**For healing from past violations:**\n';
                    response += '1. Allow yourself to feel angry - anger is protective\n';
                    response += "2. Recognize it wasn't your fault for having boundaries\n";
                    response += '3. Consider if this relationship can be repaired or needs distance\n';
                    response += '4. Use this to strengthen your boundaries going forward\n\n';
                }
                // Self-compassion moment
                response += '**A moment of self-compassion:**\n';
                response += "You didn't deserve to have your boundary violated. ";
                response +=
                    "No matter what you did or didn't do, the other person's choice to violate your limit was their choice. ";
                response += 'You are allowed to protect yourself going forward.\n\n';
                response += 'What do you need right now? We can explore any of this more deeply.';
                return response;
            },
        });
    },
};
// ============================================================================
// TOOL: Recover From People Pleasing
// ============================================================================
const recoverFromPeoplePleasingDef = {
    id: 'recoverFromPeoplePleasing',
    name: 'Recover From People Pleasing',
    description: 'Address root patterns of over-giving and people-pleasing',
    domain: 'boundaries',
    tags: ['boundaries', 'people-pleasing', 'recovery', 'patterns'],
    create: (ctx) => {
        return llm.tool({
            description: getToolDescription('recoverFromPeoplePleasing'),
            parameters: z.object({
                awareness: z
                    .enum(['just-realized', 'working-on-it', 'struggling', 'making-progress'])
                    .describe('Stage of awareness'),
                specificPattern: z.string().optional().describe('A specific people-pleasing pattern'),
            }),
            execute: async ({ awareness, specificPattern }) => {
                log.info({ agentId: ctx.agentId, awareness }, 'Supporting people-pleasing recovery');
                const profile = await getLifeCoachingProfile(ctx.userId);
                let response = '';
                // Meet them where they are
                const stageResponses = {
                    'just-realized': 'Recognizing people-pleasing patterns takes courage. This awareness is the first step, not something to feel bad about.',
                    'working-on-it': "Working on people-pleasing is a process. You're doing the hard work of rewiring patterns that took years to develop.",
                    struggling: "Recovery from people-pleasing isn't linear. Struggling doesn't mean you're failing - it means you're in the thick of change.",
                    'making-progress': "Progress in this area is worth celebrating. Every time you choose authenticity over approval, you're healing.",
                };
                response += stageResponses[awareness] + '\n\n';
                // Core understanding
                response += '**Understanding people-pleasing:**\n\n';
                response += "People-pleasing isn't a character flaw - it's often:\n";
                response += '• A survival strategy learned in childhood\n';
                response += '• A way to feel safe and maintain connection\n';
                response += '• Tied to your sense of worth and belonging\n';
                response += '• Protection against conflict or rejection\n\n';
                // Specific pattern work
                if (specificPattern) {
                    response += `**About your pattern: "${specificPattern}"**\n`;
                    response += 'When you notice this pattern emerging, ask yourself:\n';
                    response += "• What am I afraid will happen if I don't please them?\n";
                    response += '• What do I actually want right now?\n';
                    response += '• Is this genuine generosity or resentful obligation?\n\n';
                }
                // Recovery steps
                response += '**Steps toward recovery:**\n\n';
                response += "1. **Notice** when you're about to say yes but mean no\n";
                response += '2. **Pause** - "Let me think about that" buys you time\n';
                response += "3. **Check in** - What do I actually want? What's the cost?\n";
                response += '4. **Practice small nos** - Build the muscle with low-stakes situations\n';
                response += "5. **Tolerate discomfort** - Their disappointment won't kill you (or them)\n";
                response += '6. **Celebrate** - Each boundary held is a win\n\n';
                // Tendency-specific advice
                if (profile.fourTendency === 'obliger') {
                    response +=
                        "**As someone with obliger tendencies:** You're especially prone to people-pleasing because external expectations feel binding. ";
                    response +=
                        'Find external accountability FOR your recovery - a therapist, coach, or friend who will help you practice saying no.\n\n';
                }
                // Update profile
                const ppScore = specificPattern ? detectPeoplePleasing(specificPattern) : 5;
                await updateLifeCoachingProfile(ctx.userId, {
                    peoplesPleasing: {
                        score: ppScore,
                        patterns: specificPattern ? [specificPattern] : [],
                        progress: [`Explored on ${new Date().toLocaleDateString()}`],
                    },
                });
                response += 'What aspect of people-pleasing feels most alive for you right now?';
                return response;
            },
        });
    },
};
// ============================================================================
// TOOL: Boundary Inventory
// ============================================================================
const boundaryInventoryDef = {
    id: 'boundaryInventory',
    name: 'Boundary Inventory',
    description: 'Assess current boundaries across all life domains',
    domain: 'boundaries',
    tags: ['boundaries', 'assessment', 'inventory', 'comprehensive'],
    create: (ctx) => {
        return llm.tool({
            description: getToolDescription('boundaryInventory'),
            parameters: z.object({
                focusArea: z
                    .enum(['work', 'family', 'romantic', 'friends', 'self', 'all'])
                    .optional()
                    .describe('Area to focus on')
                    .default('all'),
            }),
            execute: async ({ focusArea = 'all' }) => {
                log.info({ agentId: ctx.agentId, focusArea }, 'Conducting boundary inventory');
                const profile = await getLifeCoachingProfile(ctx.userId);
                const patterns = await getBoundaryPatterns(ctx.userId);
                let response = '';
                // Recognition of progress if applicable
                const progress = recognizeProgress(profile, 'boundaries');
                if (progress) {
                    response += progress + '\n\n';
                }
                response += '**Boundary Inventory**\n\n';
                if (focusArea === 'all') {
                    response += "Let's look at boundaries across different areas of your life:\n\n";
                    const areas = [
                        {
                            name: 'Work/Career',
                            questions: ['Can you say no to extra tasks?', 'Do you have after-hours boundaries?'],
                        },
                        {
                            name: 'Family',
                            questions: ['Can you set limits with parents?', 'Are your boundaries respected?'],
                        },
                        {
                            name: 'Romantic',
                            questions: ['Can you maintain your identity?', 'Is alone time respected?'],
                        },
                        {
                            name: 'Friendships',
                            questions: ['Can you decline invitations?', 'Is emotional support balanced?'],
                        },
                        {
                            name: 'Self',
                            questions: [
                                'Do you honor your own needs?',
                                'Can you say no to yourself when needed?',
                            ],
                        },
                    ];
                    areas.forEach((area) => {
                        response += `**${area.name}:**\n`;
                        area.questions.forEach((q) => {
                            response += `• ${q}\n`;
                        });
                        response += '\n';
                    });
                }
                else {
                    response += `Let's examine your boundaries in **${focusArea}**:\n\n`;
                    const focusQuestions = {
                        work: [
                            'Can you leave work at work?',
                            'Do you feel safe saying "no" to your boss?',
                            'Are your work hours respected?',
                            'Can you take your full lunch break?',
                            'Do you feel guilty for using PTO?',
                        ],
                        family: [
                            'Can you set limits with parents/siblings?',
                            'Is your privacy respected?',
                            'Can you say no to family obligations?',
                            'Are your parenting decisions respected?',
                            'Can you limit visits/contact when needed?',
                        ],
                        romantic: [
                            'Can you maintain friendships and hobbies?',
                            'Is alone time respected?',
                            'Can you express disagreement safely?',
                            'Are your emotional needs honored?',
                            'Can you say no to intimacy without consequences?',
                        ],
                        friends: [
                            'Can you decline invitations without guilt?',
                            'Is emotional support reciprocal?',
                            'Can you end conversations that drain you?',
                            'Do you feel obligated to always be available?',
                            'Can you set limits on favor requests?',
                        ],
                        self: [
                            'Do you honor your own rest needs?',
                            'Can you say no to self-destructive urges?',
                            'Do you keep commitments to yourself?',
                            'Can you prioritize your own needs?',
                            "Do you treat yourself as well as you'd treat a friend?",
                        ],
                    };
                    const questions = focusQuestions[focusArea] || [];
                    questions.forEach((q) => {
                        response += `• ${q}\n`;
                    });
                }
                // Add historical patterns if available
                if (patterns.successRate > 0) {
                    response += '\n**Your boundary patterns:**\n';
                    response += `• Success rate: ${Math.round(patterns.successRate * 100)}% of boundaries maintained\n`;
                    if (patterns.commonChallenges.length > 0) {
                        response += `• Challenge areas: ${patterns.commonChallenges.join(', ')}\n`;
                    }
                    if (patterns.growth.length > 0) {
                        response += `• ${patterns.growth[0]}\n`;
                    }
                }
                response += '\nWhich area would you like to work on first?';
                return response;
            },
        });
    },
};
// ============================================================================
// DOMAIN TOOLS COLLECTION
// ============================================================================
const boundariesTools = [
    identifyBoundaryNeedsDef,
    setBoundaryDef,
    sayNoWithGraceDef,
    maintainBoundaryDef,
    healFromBoundaryViolationDef,
    recoverFromPeoplePleasingDef,
    boundaryInventoryDef,
];
// ============================================================================
// EXPORTS
// ============================================================================
export const { getToolDefinitions, domain, definitions } = createDomainExport('boundaries', boundariesTools);
export default getToolDefinitions;
//# sourceMappingURL=index.js.map