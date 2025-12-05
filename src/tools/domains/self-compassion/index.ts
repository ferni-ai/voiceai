/**
 * Self-Compassion Domain Tools
 *
 * Tools for developing kindness toward oneself, managing inner critic, and self-acceptance.
 * This domain addresses the fundamental relationship one has with oneself.
 *
 * DOMAIN: self-compassion
 * TOOLS:
 *   Kindness: practiceSelfKindness, speakToYourselfAsAFriend, offerSelfCompassion
 *   InnerCritic: noticeInnerCritic, reframeInnerCritic, quietInnerCritic
 *   Acceptance: practiceSelfAcceptance, embraceImperfection, enoughness
 *   Celebration: celebrateYourself, acknowledgeGrowth, giveYourselfCredit
 */

import { createDomainExport } from '../../registry/loader.js';
import type { ToolDefinition, ToolContext, Tool } from '../../registry/types.js';
import { llm, log } from '@livekit/agents';
import { getLogger } from '../../../utils/safe-logger.js';
import { z } from 'zod';

// ============================================================================
// SELF-KINDNESS TOOLS
// ============================================================================

const practiceSelfKindnessDef: ToolDefinition = {
  id: 'practiceSelfKindness',
  name: 'Practice Self Kindness',
  description: 'Guide a practice of self-kindness in a difficult moment',
  domain: 'self-compassion',
  tags: ['self-compassion', 'kindness', 'practice'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: 'Guide the user through a practice of self-kindness.',
      parameters: z.object({
        struggle: z.string().describe('What they are struggling with'),
        howTheyreeTreatingThemselves: z.string().optional().describe('How they are treating themselves'),
      }),
      execute: async ({ struggle, howTheyreeTreatingThemselves }) => {
        getLogger().info({ agentId: ctx.agentId }, 'Practicing self-kindness');

        let response = `You're struggling with: ${struggle}\n`;
        if (howTheyreeTreatingThemselves) {
          response += `And you're treating yourself: ${howTheyreeTreatingThemselves}\n`;
        }
        response += `\n`;
        response += `**Self-Kindness Practice**\n\n`;
        response += `Step 1: **Acknowledge the pain**\n`;
        response += `"This is hard. This hurts. This is a moment of struggle."\n\n`;
        response += `Step 2: **Common humanity**\n`;
        response += `"Everyone struggles. I'm not alone in this. This is part of being human."\n\n`;
        response += `Step 3: **Self-kindness**\n`;
        response += `Place your hand on your heart. Say to yourself what you'd say to a dear friend:\n`;
        response += `"May I be kind to myself in this moment. May I give myself the compassion I need."\n\n`;
        response += `What words of kindness do you most need to hear right now?`;

        return response;
      },
    });
  },
};

const speakToYourselfAsAFriendDef: ToolDefinition = {
  id: 'speakToYourselfAsAFriend',
  name: 'Speak To Yourself As A Friend',
  description: 'Reframe self-talk as if speaking to a dear friend',
  domain: 'self-compassion',
  tags: ['self-compassion', 'self-talk', 'reframe'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: 'Help the user speak to themselves with the same kindness they would show a friend.',
      parameters: z.object({
        whatYouToldYourself: z.string().describe('What the harsh self-talk sounds like'),
        situation: z.string().describe('The situation prompting this'),
      }),
      execute: async ({ whatYouToldYourself, situation }) => {
        getLogger().info({ agentId: ctx.agentId }, 'Speaking as a friend');

        let response = `**The situation:** ${situation}\n`;
        response += `**What you told yourself:** "${whatYouToldYourself}"\n\n`;
        response += `Now imagine your dearest friend came to you with this exact same situation. They said they felt the same way you do.\n\n`;
        response += `Would you say to them: "${whatYouToldYourself}"?\n\n`;
        response += `Of course not. You'd probably say something like:\n`;
        response += `"I understand. Anyone would struggle with this. You're doing your best. This is hard, and you're still here. I believe in you."\n\n`;
        response += `**The question:** Why do you deserve less kindness than you'd give to someone you love?\n\n`;
        response += `Try saying to yourself what you'd say to a friend. What words would you use?`;

        return response;
      },
    });
  },
};

// ============================================================================
// INNER CRITIC TOOLS
// ============================================================================

const noticeInnerCriticDef: ToolDefinition = {
  id: 'noticeInnerCritic',
  name: 'Notice Inner Critic',
  description: 'Develop awareness of the inner critic voice',
  domain: 'self-compassion',
  tags: ['self-compassion', 'inner-critic', 'awareness'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: 'Help the user become aware of and understand their inner critic.',
      parameters: z.object({
        whatItsSaying: z.string().describe('What the inner critic is saying'),
        howItMakesYouFeel: z.string().optional().describe('How it makes them feel'),
      }),
      execute: async ({ whatItsSaying, howItMakesYouFeel }) => {
        getLogger().info({ agentId: ctx.agentId }, 'Noticing inner critic');

        let response = `**The Inner Critic speaks:** "${whatItsSaying}"\n`;
        if (howItMakesYouFeel) response += `**How it makes you feel:** ${howItMakesYouFeel}\n`;
        response += `\n`;
        response += `Notice: You just observed the inner critic. That means you are NOT the inner critic. You're the one who heard it.\n\n`;
        response += `**Getting curious about this voice:**\n`;
        response += `- Whose voice is this originally? (Parent? Teacher? Culture?)\n`;
        response += `- How old were you when you first heard this?\n`;
        response += `- What was it trying to protect you from?\n`;
        response += `- Is its protection still needed? Is it helping now?\n\n`;
        response += `The inner critic often started as a protector. But protection that was appropriate at age 8 might be crushing you at age 38.\n\n`;
        response += `What do you notice about this voice when you look at it with curiosity instead of believing it?`;

        return response;
      },
    });
  },
};

const reframeInnerCriticDef: ToolDefinition = {
  id: 'reframeInnerCritic',
  name: 'Reframe Inner Critic',
  description: 'Transform inner critic messages into something more helpful',
  domain: 'self-compassion',
  tags: ['self-compassion', 'inner-critic', 'reframe'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: 'Help the user reframe harsh inner critic messages into supportive guidance.',
      parameters: z.object({
        criticMessage: z.string().describe('What the inner critic is saying'),
      }),
      execute: async ({ criticMessage }) => {
        getLogger().info({ agentId: ctx.agentId }, 'Reframing inner critic');

        let response = `**Inner Critic:** "${criticMessage}"\n\n`;
        response += `Let's translate this. The inner critic often has a kernel of care buried under harsh delivery.\n\n`;
        response += `**Ask yourself:**\n`;
        response += `- What's the critic actually worried about?\n`;
        response += `- What would a wise mentor say about the same concern?\n`;
        response += `- How could this message be delivered with care instead of cruelty?\n\n`;
        response += `**Possible reframes:**\n`;
        response += `- Instead of "You're so stupid" → "You're still learning. What can you learn from this?"\n`;
        response += `- Instead of "You'll never be good enough" → "You're growing. Progress isn't the same as perfection."\n`;
        response += `- Instead of "Everyone can see you're a fraud" → "It's normal to feel uncertain. Keep going."\n\n`;
        response += `How might you reframe "${criticMessage}" into something true AND kind?`;

        return response;
      },
    });
  },
};

// ============================================================================
// SELF-ACCEPTANCE TOOLS
// ============================================================================

const practiceSelfAcceptanceDef: ToolDefinition = {
  id: 'practiceSelfAcceptance',
  name: 'Practice Self Acceptance',
  description: 'Guide a practice of accepting oneself as is',
  domain: 'self-compassion',
  tags: ['self-compassion', 'acceptance', 'practice'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: 'Guide the user through a practice of self-acceptance.',
      parameters: z.object({
        whatToAccept: z.string().describe('What they are struggling to accept about themselves'),
        howLongTheyveStruggled: z.string().optional().describe('How long this has been a struggle'),
      }),
      execute: async ({ whatToAccept, howLongTheyveStruggled }) => {
        getLogger().info({ agentId: ctx.agentId }, 'Practicing self-acceptance');

        let response = `You're working to accept: ${whatToAccept}\n`;
        if (howLongTheyveStruggled) response += `This has been hard for: ${howLongTheyveStruggled}\n`;
        response += `\n`;
        response += `**Self-acceptance doesn't mean:**\n`;
        response += `- Giving up on growth\n`;
        response += `- Saying everything is fine\n`;
        response += `- Denying you want things to be different\n\n`;
        response += `**Self-acceptance means:**\n`;
        response += `- "This is what is right now, and I can work with it"\n`;
        response += `- "I don't have to be at war with myself"\n`;
        response += `- "I can want to change AND accept where I am"\n\n`;
        response += `**A practice:**\n`;
        response += `"I accept myself as I am in this moment. Not as I should be. Not as I wish I were. As I am. And from this place of acceptance, I can grow."\n\n`;
        response += `What would change if you stopped fighting this part of yourself?`;

        return response;
      },
    });
  },
};

const embraceImperfectionDef: ToolDefinition = {
  id: 'embraceImperfection',
  name: 'Embrace Imperfection',
  description: 'Find peace with imperfection and humanity',
  domain: 'self-compassion',
  tags: ['self-compassion', 'imperfection', 'humanity'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: 'Help the user embrace imperfection as part of being human.',
      parameters: z.object({
        imperfection: z.string().describe('The imperfection they are struggling with'),
      }),
      execute: async ({ imperfection }) => {
        getLogger().info({ agentId: ctx.agentId }, 'Embracing imperfection');

        let response = `The imperfection: ${imperfection}\n\n`;
        response += `Here's what's true:\n\n`;
        response += `- No human who has ever lived was without flaw\n`;
        response += `- The people you admire most have imperfections too\n`;
        response += `- Imperfection is not a failure to be human - it IS being human\n`;
        response += `- The Japanese have a word for this: wabi-sabi - beauty in imperfection\n\n`;
        response += `**Consider:**\n`;
        response += `- What if this imperfection is actually part of what makes you YOU?\n`;
        response += `- What if it's the cracks that let the light in?\n`;
        response += `- What if being imperfect allows others to feel safe being imperfect with you?\n\n`;
        response += `Perfection would actually be isolating. Our imperfections connect us.\n\n`;
        response += `What would it be like to befriend this imperfection rather than fight it?`;

        return response;
      },
    });
  },
};

const enoughnessDef: ToolDefinition = {
  id: 'enoughness',
  name: 'Enoughness',
  description: 'Connect with a sense of being enough as you are',
  domain: 'self-compassion',
  tags: ['self-compassion', 'enoughness', 'worthiness'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: 'Help the user connect with a sense of inherent enoughness.',
      parameters: z.object({
        notEnoughIn: z.string().describe('Where they feel not enough'),
        whatWouldBeEnough: z.string().optional().describe('What they think would make them enough'),
      }),
      execute: async ({ notEnoughIn, whatWouldBeEnough }) => {
        getLogger().info({ agentId: ctx.agentId }, 'Exploring enoughness');

        let response = `You feel not enough in: ${notEnoughIn}\n`;
        if (whatWouldBeEnough) response += `You think "${whatWouldBeEnough}" would make you enough.\n`;
        response += `\n`;
        response += `But here's the thing: "enough" is a moving target. If you hit that goal, you'd find a new way to feel not enough.\n\n`;
        response += `**What if enoughness isn't earned?**\n\n`;
        response += `What if you're enough not because of what you've achieved, but simply because you exist? Because you're a human being, not a human doing?\n\n`;
        response += `**A truth:**\n`;
        response += `You were enough as a baby before you could do anything.\n`;
        response += `You were enough as a child before you had achievements.\n`;
        response += `You are still that person.\n\n`;
        response += `What you DO adds to your life. It doesn't add to your WORTH.\n\n`;
        response += `What would change if you believed you were already enough, exactly as you are?`;

        return response;
      },
    });
  },
};

// ============================================================================
// CELEBRATION TOOLS
// ============================================================================

const celebrateYourselfDef: ToolDefinition = {
  id: 'celebrateYourself',
  name: 'Celebrate Yourself',
  description: 'Create space to genuinely celebrate yourself',
  domain: 'self-compassion',
  tags: ['self-compassion', 'celebration', 'acknowledgment'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: 'Help the user genuinely celebrate themselves and their qualities.',
      parameters: z.object({
        whatToCelebrate: z.string().optional().describe('Something specific to celebrate'),
        mode: z.enum(['prompted', 'specific', 'freeform']).describe('Mode of celebration'),
      }),
      execute: async ({ whatToCelebrate, mode }) => {
        getLogger().info({ agentId: ctx.agentId, mode }, 'Celebrating self');

        let response = '';

        if (mode === 'specific' && whatToCelebrate) {
          response = `Let's celebrate: ${whatToCelebrate}\n\n`;
          response += `This matters. You did this. You ARE this.\n\n`;
          response += `Take a moment to really let it in. Don't minimize. Don't deflect. Just... receive it.\n\n`;
          response += `"I did this. I'm proud of myself."\n\n`;
          response += `How does it feel to acknowledge yourself?`;
        } else if (mode === 'prompted') {
          response = `**Celebration Prompts:**\n\n`;
          response += `Complete these sentences:\n`;
          response += `- I'm proud of myself for...\n`;
          response += `- Something good about me is...\n`;
          response += `- I've grown in the way I...\n`;
          response += `- I handled ______ well recently...\n`;
          response += `- People would be surprised to know I'm actually good at...\n\n`;
          response += `Which one resonates?`;
        } else {
          response = `This is your space to celebrate yourself. No false modesty. No dismissing.\n\n`;
          response += `What do you want to acknowledge about yourself today?\n\n`;
          response += `(If this feels hard, notice that. Many of us find it easier to criticize ourselves than celebrate ourselves. That's worth noticing.)`;
        }

        return response;
      },
    });
  },
};

const giveYourselfCreditDef: ToolDefinition = {
  id: 'giveYourselfCredit',
  name: 'Give Yourself Credit',
  description: 'Acknowledge effort and progress often overlooked',
  domain: 'self-compassion',
  tags: ['self-compassion', 'credit', 'acknowledgment'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: 'Help the user give themselves credit for things they typically overlook.',
      parameters: z.object({
        context: z.enum(['daily', 'hard-time', 'growth', 'invisible-labor']).describe('Context for giving credit'),
      }),
      execute: async ({ context }) => {
        getLogger().info({ agentId: ctx.agentId, context }, 'Giving self credit');

        const prompts: Record<string, string> = {
          daily: `**Credit for Today**\n\nYou probably did a lot today that you didn't count:\n\n- Got out of bed (some days that's everything)\n- Showed up for responsibilities\n- Made decisions, even small ones\n- Dealt with things that came up\n- Kept going even when tired\n\nWhat did you do today that deserves acknowledgment?`,
          'hard-time': `**Credit During Hard Times**\n\nWhen things are hard, "just surviving" is actually an achievement.\n\n- You're still here\n- You're still trying\n- You're dealing with something difficult\n- You haven't given up\n\nGive yourself credit for what you're managing, not just what you're achieving.`,
          growth: `**Credit for Growth**\n\nLook at who you were a year ago. Five years ago.\n\n- What do you handle better now?\n- What have you learned?\n- How have you changed?\n- What would old-you be proud of?\n\nGrowth is often invisible until you look back.`,
          'invisible-labor': `**Credit for the Invisible**\n\nSo much of what you do is invisible:\n\n- Emotional labor for others\n- Worrying and planning\n- Holding things together\n- Not saying things that would cause harm\n- Showing up when you don't feel like it\n\nWhat invisible labor have you been doing that deserves acknowledgment?`,
        };

        return prompts[context];
      },
    });
  },
};

// ============================================================================
// KRISTIN NEFF METHODS
// ============================================================================

const selfCompassionBreakDef: ToolDefinition = {
  id: 'selfCompassionBreak',
  name: 'Self Compassion Break',
  description: 'Kristin Neff\'s three-step self-compassion break',
  domain: 'self-compassion',
  tags: ['self-compassion', 'neff', 'practice'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: 'Guide through Kristin Neff\'s self-compassion break practice.',
      parameters: z.object({
        difficultSituation: z.string().describe('What is causing difficulty'),
      }),
      execute: async ({ difficultSituation }) => {
        getLogger().info({ agentId: ctx.agentId }, 'Self-compassion break');

        let response = `**Self-Compassion Break** (Dr. Kristin Neff)\n\n`;
        response += `You're struggling with: ${difficultSituation}\n\n`;
        response += `This practice has three steps. Take your time with each.\n\n`;

        response += `**Step 1: Mindfulness**\n`;
        response += `Acknowledge the pain without exaggerating or avoiding it:\n`;
        response += `*"This is a moment of suffering."*\n`;
        response += `*"This hurts."*\n`;
        response += `*"This is hard."*\n\n`;

        response += `**Step 2: Common Humanity**\n`;
        response += `Remember you're not alone in struggle:\n`;
        response += `*"Suffering is part of being human."*\n`;
        response += `*"Everyone struggles."*\n`;
        response += `*"I'm not alone in this."*\n\n`;

        response += `**Step 3: Self-Kindness**\n`;
        response += `Offer yourself kindness, perhaps placing a hand on your heart:\n`;
        response += `*"May I be kind to myself."*\n`;
        response += `*"May I give myself the compassion I need."*\n`;
        response += `*"May I accept myself as I am."*\n\n`;

        response += `Take a breath. How do you feel after going through these three steps?`;

        return response;
      },
    });
  },
};

const compassionateLetterDef: ToolDefinition = {
  id: 'compassionateLetter',
  name: 'Compassionate Letter',
  description: 'Write a letter to yourself from a compassionate perspective',
  domain: 'self-compassion',
  tags: ['self-compassion', 'letter', 'practice'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: 'Guide the user in writing a compassionate letter to themselves.',
      parameters: z.object({
        topic: z.string().describe('What they are struggling with or criticizing themselves for'),
        writtenFrom: z.enum(['loving-friend', 'wise-mentor', 'future-self', 'compassionate-observer']).describe('Perspective to write from'),
      }),
      execute: async ({ topic, writtenFrom }) => {
        getLogger().info({ agentId: ctx.agentId, writtenFrom }, 'Compassionate letter');

        let response = `**Write a Compassionate Letter to Yourself**\n\n`;
        response += `Topic: ${topic}\n\n`;
        response += `You'll write from the perspective of: ${writtenFrom.replace('-', ' ')}\n\n`;

        const perspectives: Record<string, string> = {
          'loving-friend': `Imagine your dearest friend - someone who knows your struggles but loves you unconditionally. They want to write you a letter about ${topic}. What would they say?\n\n- They would acknowledge your pain\n- They would remind you of your good qualities\n- They would offer perspective without dismissing your feelings\n- They would express love and support`,
          'wise-mentor': `Imagine a wise mentor - perhaps real or imagined - who has lived a full life and has deep wisdom. They want to write you a letter about ${topic}. What would they say?\n\n- They would share perspective from experience\n- They would normalize your struggle\n- They would offer gentle guidance\n- They would express faith in you`,
          'future-self': `Imagine yourself 20 years from now, looking back at this moment. You've grown, healed, and gained perspective. You want to write your present self a letter about ${topic}. What would you say?\n\n- You would reassure yourself it gets better\n- You would share what you learned\n- You would be gentle about mistakes\n- You would express gratitude for your resilience`,
          'compassionate-observer': `Imagine a completely compassionate observer who can see your situation clearly, without judgment. They want to write you a letter about ${topic}. What would they say?\n\n- They would describe what they see without judgment\n- They would acknowledge your suffering\n- They would note your strengths\n- They would offer unconditional acceptance`,
        };

        response += perspectives[writtenFrom];
        response += `\n\n**Begin with:** "Dear [your name]..."\n\n`;
        response += `Take your time. Let the words come from that compassionate place. What does this loving voice want you to know?`;

        return response;
      },
    });
  },
};

const bodyImageCompassionDef: ToolDefinition = {
  id: 'bodyImageCompassion',
  name: 'Body Image Compassion',
  description: 'Practice self-compassion specifically around body image',
  domain: 'self-compassion',
  tags: ['self-compassion', 'body', 'acceptance'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: 'Help the user practice self-compassion around body image struggles.',
      parameters: z.object({
        struggle: z.string().describe('What aspect of body image is difficult'),
      }),
      execute: async ({ struggle }) => {
        getLogger().info({ agentId: ctx.agentId }, 'Body image compassion');

        let response = `**Body Compassion Practice**\n\n`;
        response += `You're struggling with: ${struggle}\n\n`;
        response += `Body criticism is one of the most common forms of self-cruelty. You're not alone in this.\n\n`;

        response += `**Some truths:**\n\n`;
        response += `- Your body has been with you through everything\n`;
        response += `- It's kept you alive every day you've been alive\n`;
        response += `- It breathes, heals, moves, feels - all without you asking\n`;
        response += `- It's the only one you get - fighting it is exhausting\n`;
        response += `- The people who love you love you for who you are, not your appearance\n\n`;

        response += `**A practice:**\n\n`;
        response += `Place a hand on the part of your body you struggle with most. Instead of criticism, can you offer:\n\n`;
        response += `*"Thank you for carrying me."*\n`;
        response += `*"I'm sorry for how I've spoken to you."*\n`;
        response += `*"You don't have to be perfect to be worthy of kindness."*\n\n`;

        response += `What would change if you treated your body as an ally instead of an enemy?`;

        return response;
      },
    });
  },
};

// ============================================================================
// DOMAIN TOOLS COLLECTION
// ============================================================================

const selfCompassionTools: ToolDefinition[] = [
  practiceSelfKindnessDef,
  speakToYourselfAsAFriendDef,
  noticeInnerCriticDef,
  reframeInnerCriticDef,
  practiceSelfAcceptanceDef,
  embraceImperfectionDef,
  enoughnessDef,
  celebrateYourselfDef,
  giveYourselfCreditDef,
  // Kristin Neff Methods
  selfCompassionBreakDef,
  compassionateLetterDef,
  bodyImageCompassionDef,
];

// ============================================================================
// EXPORTS
// ============================================================================

export const { getToolDefinitions, domain, definitions } = createDomainExport(
  'self-compassion',
  selfCompassionTools
);

export default getToolDefinitions;

