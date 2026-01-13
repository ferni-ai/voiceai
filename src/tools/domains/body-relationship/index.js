/**
 * Body Relationship Domain
 *
 * Tools for developing a healthier relationship with your body.
 * Your body is not the enemy - it's your home.
 *
 * DOMAIN: body-relationship
 * PERSONA AFFINITY: Maya (habits), Ferni (emotional support)
 *
 * TOOLS:
 *   Awareness: bodyImageExplore, bodyNeutrality
 *   Healing: innerCriticBody, bodyGratitude, joyfulMovement
 *   Patterns: bodyCheckingAwareness, mirrorWork, emotionalEating
 *
 * PRINCIPLES:
 * - Your body deserves respect at every size
 * - Function over form
 * - Body neutrality is a valid path
 * - Diet culture is the problem, not your body
 *
 * SAFETY: This domain touches on sensitive topics. Monitor for
 * signs of eating disorders and refer to professional support.
 */
import { createDomainExport } from '../../registry/loader.js';
import { llm } from '@livekit/agents';
import { z } from 'zod';
import { getLogger } from '../../../utils/safe-logger.js';
import { getToolDescription } from '../../utils/tool-descriptions.js';
import { checkSafety } from '../life-coaching-shared/safety-guards.js';
const log = getLogger();
// ============================================================================
// TOOL: Body Image Explore
// ============================================================================
const bodyImageExploreDef = {
    id: 'bodyImageExplore',
    name: 'Body Image Explore',
    description: 'Explore your relationship with your body',
    domain: 'body-relationship',
    tags: ['body', 'body-image', 'self-image', 'exploration'],
    create: (ctx) => {
        return llm.tool({
            description: getToolDescription('bodyImageExplore'),
            parameters: z.object({
                struggle: z.string().describe('What you struggle with about your body'),
                origin: z.string().optional().describe('Where do you think these feelings came from'),
            }),
            execute: async ({ struggle, origin }) => {
                // Safety check
                const safety = checkSafety(struggle + ' ' + (origin || ''));
                if (!safety.isSafe) {
                    log.warn({ agentId: ctx.agentId }, 'Safety concern in body image exploration');
                    return (safety.intervention ||
                        "If you're struggling with your relationship with food or your body in ways that feel serious, please reach out to a professional who specializes in this area.");
                }
                log.info({ agentId: ctx.agentId }, 'Exploring body image');
                let response = '';
                response += `**Exploring your body relationship:**\n\n`;
                response += `You said you struggle with: "${struggle}"\n\n`;
                response += '**First, let me say:**\n';
                response += "Your feelings about your body are valid. They're also not the whole truth. ";
                response += 'Our culture teaches us to be at war with our bodies from a young age.\n\n';
                // Origin
                if (origin) {
                    response += `**You think this comes from:** "${origin}"\n`;
                    response +=
                        "Understanding origins helps. These beliefs were taught to you - they're not truth.\n\n";
                }
                response += '**Questions to explore:**\n';
                response += '• What were the messages you received about bodies growing up?\n';
                response += '• Whose voice is loudest when you criticize your body?\n';
                response += '• When was the first time you felt bad about your body?\n';
                response += '• Has your body ever been "enough"? What would it take?\n\n';
                response += '**Important truths:**\n';
                response += '• Bodies are meant to change throughout life\n';
                response += '• Feeling bad about your body is culturally manufactured\n';
                response += "• No one's worth is determined by their appearance\n";
                response += '• Your body is not the enemy - diet culture is\n';
                response += "• You don't have to love your body to be at peace with it\n\n";
                response += '**The shift:**\n';
                response += 'Instead of asking "How do I look?" - ask "How do I feel?"\n';
                response +=
                    'Instead of "Is my body good enough?" - ask "What is my body doing for me?"\n\n';
                response +=
                    "What's one thing your body has done for you lately that deserves acknowledgment?";
                return response;
            },
        });
    },
};
// ============================================================================
// TOOL: Body Neutrality
// ============================================================================
const bodyNeutralityDef = {
    id: 'bodyNeutrality',
    name: 'Body Neutrality',
    description: 'Practice body neutrality as an alternative to body positivity',
    domain: 'body-relationship',
    tags: ['body', 'neutrality', 'acceptance', 'peace'],
    create: (ctx) => {
        return llm.tool({
            description: getToolDescription('bodyNeutrality'),
            parameters: z.object({}),
            execute: async () => {
                log.info('Teaching body neutrality');
                let response = '';
                response += '**Body neutrality:**\n\n';
                response += 'Body positivity says: "Love your body!"\n';
                response += "But some days that's unrealistic.\n\n";
                response +=
                    'Body neutrality says: "Your body exists. It does things for you. That\'s enough."\n\n';
                response += '**The shift from positivity to neutrality:**\n';
                response += '• Instead of "I love my legs" → "I have legs that carry me"\n';
                response += '• Instead of "My body is beautiful" → "My body is my body"\n';
                response += '• Instead of forcing gratitude → accepting reality\n\n';
                response += '**Body neutrality in practice:**\n';
                response += "• Your body doesn't need to be pretty to be worthy of care\n";
                response += "• You don't need to feel good about your body to treat it well\n";
                response += '• Your body is the least interesting thing about you\n';
                response += '• Your worth is not determined by your appearance\n\n';
                response += '**Neutral self-talk examples:**\n';
                response += '• "I have a body that lets me experience life"\n';
                response += '• "This is the body I have today"\n';
                response += '• "My body did its job today"\n';
                response += '• "I can take care of this body regardless of how I feel about it"\n\n';
                response += "**The goal isn't love - it's peace:**\n";
                response +=
                    "You don't have to love your body. You just have to stop being at war with it. ";
                response += 'Neutral ground is powerful ground.\n\n';
                response += 'What would body neutrality look like for you?';
                return response;
            },
        });
    },
};
// ============================================================================
// TOOL: Body Gratitude
// ============================================================================
const bodyGratitudeDef = {
    id: 'bodyGratitude',
    name: 'Body Gratitude',
    description: 'Practice gratitude for what your body does, not how it looks',
    domain: 'body-relationship',
    tags: ['body', 'gratitude', 'function', 'appreciation'],
    create: (ctx) => {
        return llm.tool({
            description: getToolDescription('bodyGratitude'),
            parameters: z.object({}),
            execute: async () => {
                log.info('Practicing body gratitude');
                let response = '';
                response += '**Body gratitude practice:**\n\n';
                response +=
                    "This isn't about loving how you look. It's about acknowledging what your body DOES.\n\n";
                response += '**Your body, today:**\n';
                response += '• Breathed thousands of breaths without you asking\n';
                response += '• Pumped blood through miles of vessels\n';
                response += "• Healed tiny wounds you didn't notice\n";
                response += '• Processed food into energy\n';
                response += '• Carried you wherever you went\n';
                response += '• Let you experience the world through senses\n\n';
                response += '**Functional gratitude prompts:**\n';
                response += '• My hands let me...\n';
                response += '• My legs let me...\n';
                response += '• My eyes let me...\n';
                response += '• My lungs let me...\n';
                response += '• My heart keeps...\n\n';
                response += '**For parts you struggle with:**\n';
                response += 'Even the parts you criticize serve functions:\n';
                response += '• Stomach: digests, protects organs\n';
                response += '• Thighs: provide power, movement\n';
                response += '• Arms: let you hold, create, express\n\n';
                response += '**Daily practice:**\n';
                response += 'Each morning or night, thank one body part for what it did:\n';
                response += '\"Thank you, feet, for carrying me through today.\"\n';
                response += 'This rewires your relationship over time.\n\n';
                response += '**Right now:**\n';
                response += "Take a breath. That's your lungs. They never stop. ";
                response += "What's one thing your body did for you today?";
                return response;
            },
        });
    },
};
// ============================================================================
// TOOL: Joyful Movement
// ============================================================================
const joyfulMovementDef = {
    id: 'joyfulMovement',
    name: 'Joyful Movement',
    description: 'Find movement you enjoy instead of exercise as punishment',
    domain: 'body-relationship',
    tags: ['body', 'movement', 'exercise', 'joy'],
    create: (ctx) => {
        return llm.tool({
            description: getToolDescription('joyfulMovement'),
            parameters: z.object({
                currentRelationship: z
                    .enum(['hate-exercise', 'do-to-burn', 'used-to-enjoy', 'never-liked', 'injured'])
                    .describe('Your relationship with exercise'),
            }),
            execute: async ({ currentRelationship }) => {
                log.info({ currentRelationship }, 'Exploring joyful movement');
                let response = '';
                response += '**Joyful movement:**\n\n';
                response += "Exercise shouldn't be punishment for eating. ";
                response += 'Movement can be something you genuinely enjoy.\n\n';
                // Address relationship
                const relationshipResponses = {
                    'hate-exercise': "If you hate exercise, you probably haven't found YOUR movement yet. Gyms aren't for everyone. Running isn't for everyone. But moving your body in some way? There's something for everyone.",
                    'do-to-burn': "If you're exercising to \"burn off\" food, that's a transactional relationship with your body. Movement becomes more joyful when it's for how you FEEL, not numbers.",
                    'used-to-enjoy': "You can find that joy again. What did you love about movement before? The feeling? The community? The freedom? Let's reconnect to that.",
                    'never-liked': "Maybe you've never been shown movement that fits YOU. School PE traumatized a lot of us. Let's explore what movement could feel good in your body.",
                    injured: 'Movement looks different with injury/disability. Adapted movement is still movement. What CAN your body do? Start there with compassion.',
                };
                response += `**About your relationship (${currentRelationship}):**\n`;
                response += relationshipResponses[currentRelationship] + '\n\n';
                // Types to explore
                response += '**Movement options to explore:**\n';
                response += '• **Dancing** - alone in your room counts!\n';
                response += '• **Walking** - no speed required\n';
                response += '• **Swimming** - low impact, freeing\n';
                response += '• **Stretching/yoga** - gentle, mindful\n';
                response += '• **Playing** - tag, catch, playground, play a sport\n';
                response += '• **Gardening** - productive movement\n';
                response += '• **Hiking** - movement + nature\n';
                response += '• **Martial arts** - empowering, skill-based\n\n';
                response += '**Questions to find YOUR movement:**\n';
                response += '• What did you love doing as a kid?\n';
                response += '• Do you prefer solo or social?\n';
                response += '• Inside or outside?\n';
                response += '• Music or silence?\n';
                response += '• Structured or free-form?\n\n';
                response += '**The new metric:**\n';
                response += 'Not: "Did I burn enough calories?"\n';
                response += 'But: "How did my body feel during and after?"\n\n';
                response += 'What type of movement sounds like it might be enjoyable?';
                return response;
            },
        });
    },
};
// ============================================================================
// TOOL: Inner Critic Body
// ============================================================================
const innerCriticBodyDef = {
    id: 'innerCriticBody',
    name: 'Inner Critic Body',
    description: 'Address the harsh inner voice about your body',
    domain: 'body-relationship',
    tags: ['body', 'inner-critic', 'self-talk', 'compassion'],
    create: (ctx) => {
        return llm.tool({
            description: getToolDescription('innerCriticBody'),
            parameters: z.object({
                whatItSays: z.string().describe('What your inner critic says about your body'),
            }),
            execute: async ({ whatItSays }) => {
                // Safety check
                const safety = checkSafety(whatItSays);
                if (!safety.isSafe) {
                    log.warn({ agentId: ctx.agentId }, 'Safety concern in body inner critic');
                    return (safety.intervention ||
                        "The things you're saying about yourself sound really harsh. If you're struggling with your body image in ways that feel serious, please reach out to someone who specializes in this.");
                }
                log.info({ agentId: ctx.agentId }, 'Working with body inner critic');
                let response = '';
                response += `**Your inner critic says:** "${whatItSays}"\n\n`;
                response += "That's a harsh voice. And it's not yours.\n\n";
                response += '**Where body criticism comes from:**\n';
                response += '• Diet culture and media\n';
                response += '• Family comments growing up\n';
                response += '• School bullying\n';
                response += '• Beauty standards that are impossible AND arbitrary\n';
                response += '• A culture that profits from your insecurity\n\n';
                response += '**The truth:**\n';
                response += '• That voice is learned, not true\n';
                response += "• You wouldn't say that to a friend\n";
                response += '• Your body has never been the problem\n';
                response += '• The standards are the problem\n\n';
                response += '**Responding to the critic:**\n';
                response += '1. Notice: "There\'s that critical voice"\n';
                response += '2. Name the source: "That\'s diet culture talking"\n';
                response += '3. Ask: "Would I say this to someone I love?"\n';
                response += '4. Replace: Neutral or compassionate statement\n\n';
                response += '**Replacement examples:**\n';
                response += `Critic: "${whatItSays}"\n`;
                response += 'Neutral: "My body is a body. It\'s doing its job."\n';
                response += 'Compassionate: "My body deserves kindness, including from me."\n\n';
                response += '**Practice:**\n';
                response +=
                    'Every time the critic speaks, say: "That\'s not my voice. That\'s what I was taught."\n\n';
                response += 'Whose voice is actually saying these things? Where did you first hear this?';
                return response;
            },
        });
    },
};
// ============================================================================
// TOOL: Emotional Eating
// ============================================================================
const emotionalEatingDef = {
    id: 'emotionalEating',
    name: 'Emotional Eating',
    description: 'Understand and work with emotional eating patterns',
    domain: 'body-relationship',
    tags: ['body', 'emotional-eating', 'coping', 'awareness'],
    create: (ctx) => {
        return llm.tool({
            description: getToolDescription('emotionalEating'),
            parameters: z.object({
                trigger: z.string().describe('What triggers emotional eating for you'),
            }),
            execute: async ({ trigger }) => {
                // Safety check
                const safety = checkSafety(trigger);
                if (!safety.isSafe) {
                    log.warn({ agentId: ctx.agentId }, 'Safety concern in emotional eating');
                    return "If you're struggling with your eating in ways that feel out of control or distressing, please consider reaching out to a professional who specializes in eating concerns. I'm here to support you, but some things benefit from specialized help.";
                }
                log.info({ agentId: ctx.agentId }, 'Exploring emotional eating');
                let response = '';
                response += '**Emotional eating:**\n\n';
                response += `Your trigger: "${trigger}"\n\n`;
                response += '**First, no shame:**\n';
                response += 'Emotional eating is one of the most common coping mechanisms. ';
                response += "Food is comfort. It's primal. It makes sense that we turn to it.\n\n";
                response += '**Understanding emotional hunger vs physical hunger:**\n\n';
                response += '**Emotional hunger:**\n';
                response += '• Comes on suddenly\n';
                response += '• Craves specific foods\n';
                response += "• Isn't satisfied by full stomach\n";
                response += '• Triggers guilt after\n';
                response += '• Located in your head/emotions\n\n';
                response += '**Physical hunger:**\n';
                response += '• Builds gradually\n';
                response += '• Many foods sound good\n';
                response += "• Stops when you're full\n";
                response += "• Doesn't trigger guilt\n";
                response += '• Located in your stomach\n\n';
                response += '**When the urge hits:**\n';
                response += "• Pause - don't judge, just pause\n";
                response += '• Ask: Am I physically hungry?\n';
                response += '• If not: What am I actually feeling?\n';
                response += '• Name the emotion\n';
                response += '• Ask: What do I really need right now?\n\n';
                response += '**The need underneath:**\n';
                response += 'Emotional eating is trying to meet a need. Exploring:\n';
                response += '• Stress → Need for relaxation/relief\n';
                response += '• Loneliness → Need for connection\n';
                response += '• Boredom → Need for stimulation\n';
                response += '• Sadness → Need for comfort\n';
                response += '• Anger → Need for release\n\n';
                response += '**Not about willpower:**\n';
                response += "This isn't about stopping yourself from eating. It's about understanding ";
                response += 'what you really need and finding more ways to meet those needs.\n\n';
                response += 'What emotion usually drives the urge for you?';
                return response;
            },
        });
    },
};
// ============================================================================
// TOOL: Mirror Work
// ============================================================================
const mirrorWorkDef = {
    id: 'mirrorWork',
    name: 'Mirror Work',
    description: 'Rebuild your relationship with your reflection',
    domain: 'body-relationship',
    tags: ['body', 'mirror', 'self-image', 'practice'],
    create: (ctx) => {
        return llm.tool({
            description: getToolDescription('mirrorWork'),
            parameters: z.object({
                currentReaction: z
                    .enum(['avoid', 'criticize', 'obsess', 'neutral', 'depends'])
                    .describe('How you typically react to mirrors'),
            }),
            execute: async ({ currentReaction }) => {
                log.info({ currentReaction }, 'Guiding mirror work');
                let response = '';
                response += '**Mirror work:**\n\n';
                // Address reaction
                const reactionResponses = {
                    avoid: "Avoiding mirrors suggests the reflection feels threatening. We can gently rebuild that relationship. You don't have to love what you see - just be able to look.",
                    criticize: "If looking in the mirror triggers criticism, you've been trained to be your own bully. We can untrain that response.",
                    obsess: 'Obsessive mirror checking often comes from anxiety about appearance. The reassurance never lasts. We can work on tolerance instead.',
                    neutral: 'Neutral is great! Mirror work can deepen that into compassion.',
                    depends: 'It making sense that it depends. Some days are harder. We can build resilience for the hard days.',
                };
                response += `**About your reaction (${currentReaction}):**\n`;
                response += reactionResponses[currentReaction] + '\n\n';
                // The practice
                response += '**Mirror work practice (gentle version):**\n\n';
                response += '**Level 1 - Neutral looking:**\n';
                response += '• Look at yourself in the mirror\n';
                response += '• Practice noticing without judging\n';
                response += '• Just describe: "I see my face. I see my body."\n';
                response += '• If criticism comes, note it and let it pass\n\n';
                response += '**Level 2 - Functional appreciation:**\n';
                response += '• Look at one body part\n';
                response += '• Thank it for what it does\n';
                response += '• "Thank you, arms, for holding things today"\n\n';
                response += '**Level 3 - Eye contact:**\n';
                response += '• Look into your own eyes\n';
                response += '• This can feel intense - start with 10 seconds\n';
                response += '• Say: "I see you. You\'re doing your best."\n\n';
                response += '**Level 4 - Compassion:**\n';
                response += '• Look at yourself as you would a friend\n';
                response += '• Notice softening\n';
                response += '• Offer yourself kindness\n\n';
                response += '**Important:**\n';
                response +=
                    "Start where you are. If level 1 is hard, stay there. Progress isn't linear.\n\n";
                response += 'Which level feels like the right starting point for you?';
                return response;
            },
        });
    },
};
// ============================================================================
// TOOL: Body Checking Awareness
// ============================================================================
const bodyCheckingDef = {
    id: 'bodyCheckingAwareness',
    name: 'Body Checking Awareness',
    description: 'Recognize and reduce compulsive body checking',
    domain: 'body-relationship',
    tags: ['body', 'body-checking', 'awareness', 'compulsion'],
    create: (ctx) => {
        return llm.tool({
            description: getToolDescription('bodyCheckingAwareness'),
            parameters: z.object({
                checkingBehavior: z.string().describe('What body checking behaviors you do'),
            }),
            execute: async ({ checkingBehavior }) => {
                log.info({ checkingBehavior }, 'Addressing body checking');
                let response = '';
                response += '**Body checking awareness:**\n\n';
                response += `You mentioned: "${checkingBehavior}"\n\n`;
                response += '**What is body checking?**\n';
                response += 'Compulsive behaviors to monitor your body:\n';
                response += '• Frequent mirror checking\n';
                response += '• Pinching/grabbing body parts\n';
                response += '• Measuring (mental or actual)\n';
                response += '• Trying on "test" clothes\n';
                response += '• Weighing multiple times\n';
                response += '• Comparing to others constantly\n\n';
                response += "**Why it doesn't work:**\n";
                response += '• Checking never provides lasting reassurance\n';
                response += '• It increases body focus and dissatisfaction\n';
                response += '• It reinforces anxiety about appearance\n';
                response += "• Bodies don't change as fast as we check them\n\n";
                response += '**The cycle:**\n';
                response += 'Anxiety → Check body → Brief relief → More anxiety → Check again\n\n';
                response += '**Breaking the cycle:**\n';
                response += "1. **Notice** when you're about to check\n";
                response += '2. **Delay** - wait 5 minutes before checking\n';
                response += '3. **Question** - what am I actually anxious about?\n';
                response += '4. **Replace** - do something else instead\n';
                response += "5. **Accept** uncertainty - you don't need to know right now\n\n";
                response += '**Gradual reduction:**\n';
                response += "Don't try to stop cold turkey. Aim to reduce frequency:\n";
                response += '• Weigh daily → weekly → monthly → rarely\n';
                response += '• Mirror check constantly → scheduled checks → passing glances\n\n';
                response += 'What triggers your urge to body check?';
                return response;
            },
        });
    },
};
// ============================================================================
// DOMAIN TOOLS COLLECTION
// ============================================================================
const bodyRelationshipTools = [
    bodyImageExploreDef,
    bodyNeutralityDef,
    bodyGratitudeDef,
    joyfulMovementDef,
    innerCriticBodyDef,
    emotionalEatingDef,
    mirrorWorkDef,
    bodyCheckingDef,
];
// ============================================================================
// EXPORTS
// ============================================================================
export const { getToolDefinitions, domain, definitions } = createDomainExport('body-relationship', bodyRelationshipTools);
export default getToolDefinitions;
//# sourceMappingURL=index.js.map