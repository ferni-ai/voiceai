/**
 * Dreams & Imagination Domain Tools
 *
 * Tools for exploring dreams, aspirations, imagination, and possibility.
 * This domain holds space for the unrealistic, the hoped-for, and the imagined.
 *
 * DOMAIN: dreams
 * TOOLS:
 *   Dreams: captureDream, exploreDream, honorUnfulfilled
 *   Imagination: playWithPossibility, alternativeLife, futureself
 *   Aspirations: bucketList, dreamBig, reconnectWithDreams
 */

import { createDomainExport } from '../../registry/loader.js';
import type { ToolDefinition, ToolContext, Tool } from '../../registry/types.js';
import { llm, log } from '@livekit/agents';
import { getLogger } from '../../../utils/safe-logger.js';
import { z } from 'zod';

// ============================================================================
// DREAM TOOLS
// ============================================================================

const captureDreamDef: ToolDefinition = {
  id: 'captureDream',
  name: 'Capture Dream',
  description: 'Capture a dream or aspiration without judgment',
  domain: 'dreams',
  tags: ['dreams', 'capture', 'aspirations'],

  create: (_ctx: ToolContext): Tool => {
    return llm.tool({
      description: 'Help the user capture a dream without editing it for practicality.',
      parameters: z.object({
        dream: z.string().describe('The dream or aspiration'),
        type: z
          .enum(['life-dream', 'career', 'creative', 'adventure', 'relationship', 'being', 'other'])
          .describe('Type of dream'),
        howItFeels: z.string().optional().describe('How thinking about this dream feels'),
      }),
      execute: async ({ dream, type, howItFeels }) => {
        getLogger().info({ agentId: ctx.agentId, type }, 'Capturing dream');

        let response = `Your dream: "${dream}"\n\n`;
        if (howItFeels) response += `It feels: ${howItFeels}\n\n`;

        response += `I want to honor this dream.\n\n`;
        response += `Dreams don't need to be practical to be valid. They don't need to be achievable to matter. Sometimes dreams are meant to be lived. Sometimes they're meant to guide us. Sometimes they're just meant to be held with tenderness.\n\n`;
        response += `This dream tells me something about who you are and what you long for.\n\n`;
        response += `Would you like to explore this dream further, or simply hold it for now?`;

        return response;
      },
    });
  },
};

const exploreDreamDef: ToolDefinition = {
  id: 'exploreDream',
  name: 'Explore Dream',
  description: 'Explore what a dream really means and wants',
  domain: 'dreams',
  tags: ['dreams', 'exploration', 'meaning'],

  create: (_ctx: ToolContext): Tool => {
    return llm.tool({
      description: 'Help the user explore what their dream really means at a deeper level.',
      parameters: z.object({
        dream: z.string().describe('The dream to explore'),
        question: z
          .enum(['why-this', 'what-beneath', 'what-if', 'obstacles', 'small-step'])
          .describe('Angle of exploration'),
      }),
      execute: async ({ dream, question }) => {
        getLogger().info({ agentId: ctx.agentId, question }, 'Exploring dream');

        let response = `Exploring: "${dream}"\n\n`;

        if (question === 'why-this') {
          response += `**Why this dream?**\n\n`;
          response += `- When did this dream first appear for you?\n`;
          response += `- What does this dream represent beyond itself?\n`;
          response += `- Who would you become if this dream came true?\n`;
          response += `- What need or longing does this dream serve?`;
        } else if (question === 'what-beneath') {
          response += `**What's beneath this dream?**\n\n`;
          response += `Sometimes the surface dream points to something deeper:\n`;
          response += `- A dream of travel might really be about freedom\n`;
          response += `- A dream of fame might be about being seen\n`;
          response += `- A dream of wealth might be about security or choice\n\n`;
          response += `What's the deeper longing this dream represents?`;
        } else if (question === 'what-if') {
          response += `**What if it came true?**\n\n`;
          response += `Close your eyes. Imagine the dream fully realized.\n`;
          response += `- What does your life look like?\n`;
          response += `- How do you feel?\n`;
          response += `- What's different about you?\n`;
          response += `- What problems have vanished? What new ones appeared?\n`;
          response += `- Was it everything you hoped?`;
        } else if (question === 'obstacles') {
          response += `**What's in the way?**\n\n`;
          response += `Let's name the obstacles - not to give up, but to see clearly:\n`;
          response += `- What practical barriers exist?\n`;
          response += `- What fears hold you back?\n`;
          response += `- What would you have to give up?\n`;
          response += `- What beliefs tell you this isn't for you?`;
        } else {
          response += `**One small step**\n\n`;
          response += `Big dreams can feel paralyzing. Let's think small:\n`;
          response += `- What's the tiniest step toward this dream?\n`;
          response += `- What could you do this week that honors this dream?\n`;
          response += `- How could you taste even 1% of this dream soon?`;
        }

        return response;
      },
    });
  },
};

const honorUnfulfilledDef: ToolDefinition = {
  id: 'honorUnfulfilled',
  name: 'Honor Unfulfilled Dream',
  description: 'Honor dreams that may not come true',
  domain: 'dreams',
  tags: ['dreams', 'grief', 'acceptance'],

  create: (_ctx: ToolContext): Tool => {
    return llm.tool({
      description: 'Help the user grieve and honor dreams that may never be fulfilled.',
      parameters: z.object({
        dream: z.string().describe('The unfulfilled dream'),
        whyUnfulfilled: z.string().optional().describe('Why it cannot be fulfilled'),
      }),
      execute: async ({ dream, whyUnfulfilled }) => {
        getLogger().info({ agentId: ctx.agentId }, 'Honoring unfulfilled dream');

        let response = `Some dreams don't come true. And that grief deserves space.\n\n`;
        response += `The dream: "${dream}"\n`;
        if (whyUnfulfilled) response += `Why it won't happen: ${whyUnfulfilled}\n`;
        response += `\n`;
        response += `This loss is real. Dreams unlived are still losses.\n\n`;
        response += `**Ways to honor an unfulfilled dream:**\n`;
        response += `- Grieve it fully - don't minimize what it meant to you\n`;
        response += `- Thank it for what it gave you while you held it\n`;
        response += `- Find the essence and seek it elsewhere\n`;
        response += `- Share it with others - let the dream live in story\n`;
        response += `- Accept the path your life actually took\n\n`;
        response += `What did holding this dream give you, even if it won't come true?`;

        return response;
      },
    });
  },
};

// ============================================================================
// IMAGINATION TOOLS
// ============================================================================

const playWithPossibilityDef: ToolDefinition = {
  id: 'playWithPossibility',
  name: 'Play With Possibility',
  description: 'Imaginatively explore possibilities without practical constraints',
  domain: 'dreams',
  tags: ['dreams', 'possibility', 'play'],

  create: (_ctx: ToolContext): Tool => {
    return llm.tool({
      description:
        'Create space for imaginative play with possibilities unconstrained by practicality.',
      parameters: z.object({
        prompt: z
          .enum([
            'unlimited-money',
            'no-fear',
            'ten-lives',
            'magic-wand',
            'guaranteed-success',
            'custom',
          ])
          .describe('Imaginative prompt'),
        customPrompt: z.string().optional().describe('Custom prompt if chosen'),
      }),
      execute: async ({ prompt, customPrompt }) => {
        getLogger().info({ agentId: ctx.agentId, prompt }, 'Playing with possibility');

        const prompts: Record<string, string> = {
          'unlimited-money': `**If money were unlimited...**\n\nPretend you have all the money in the world - it's simply not a factor.\n\n- What would you do with your days?\n- Where would you live?\n- What would you create or build?\n- How would you spend your time?\n- What would you give or change?\n\nMoney often stands in for something deeper. What does this reveal about what you actually want?`,
          'no-fear': `**If you had no fear...**\n\nImagine fear simply didn't exist for you - not reckless, just unafraid.\n\n- What conversation would you have?\n- What would you try?\n- What would you say no to?\n- What would you say yes to?\n- How would you live differently?\n\nFear's job is protection. But what has it been over-protecting you from?`,
          'ten-lives': `**If you had ten lives...**\n\nImagine you got to live ten different lives, fully committing to each.\n\n- What would each life be?\n- What paths would you explore?\n- What versions of yourself would you become?\n\nYou only have one life. But which of these ten calls most strongly?`,
          'magic-wand': `**If you had a magic wand...**\n\nOne wave and anything changes - in your life, in the world.\n\n- What would you change first?\n- What would you fix?\n- What would you create?\n- What would you give yourself?\n\nMagic isn't real, but desire is. What does the wand reveal?`,
          'guaranteed-success': `**If success were guaranteed...**\n\nImagine you knew you couldn't fail. Whatever you tried, you'd succeed.\n\n- What would you attempt?\n- What would you finally start?\n- What risk would you take?\n\nSometimes fear of failure keeps us from trying. What's waiting on the other side of that fear?`,
        };

        return (
          prompts[prompt] ||
          `Let's explore: ${customPrompt}\n\nGive yourself permission to imagine freely. What comes up?`
        );
      },
    });
  },
};

const alternativeLifeDef: ToolDefinition = {
  id: 'alternativeLife',
  name: 'Alternative Life',
  description: 'Explore the lives not lived',
  domain: 'dreams',
  tags: ['dreams', 'alternative', 'paths'],

  create: (_ctx: ToolContext): Tool => {
    return llm.tool({
      description: 'Explore alternative paths and lives not taken.',
      parameters: z.object({
        alternativePath: z.string().describe('The alternative life or path to explore'),
        turningPoint: z.string().optional().describe('The choice that led elsewhere'),
      }),
      execute: async ({ alternativePath, turningPoint }) => {
        getLogger().info({ agentId: ctx.agentId }, 'Exploring alternative life');

        let response = `**The Life Not Lived**\n\n`;
        response += `Alternative path: ${alternativePath}\n`;
        if (turningPoint) response += `The turning point: ${turningPoint}\n`;
        response += `\n`;
        response += `Somewhere in a parallel universe, another you took that path.\n\n`;
        response += `- What would that life look like?\n`;
        response += `- What would be better? What would be worse?\n`;
        response += `- Who would you be in that life?\n`;
        response += `- What would you miss from this life?\n\n`;
        response += `Exploring our roads not taken can bring clarity about the road we did take. And sometimes we realize we can still bring elements of that path into this life.\n\n`;
        response += `What does exploring this alternative reveal?`;

        return response;
      },
    });
  },
};

const futureSelfDef: ToolDefinition = {
  id: 'futureSelf',
  name: 'Future Self',
  description: 'Connect with your future self',
  domain: 'dreams',
  tags: ['dreams', 'future', 'self'],

  create: (_ctx: ToolContext): Tool => {
    return llm.tool({
      description: 'Help the user connect with and learn from their future self.',
      parameters: z.object({
        howFarAhead: z
          .enum(['5-years', '10-years', '20-years', 'end-of-life'])
          .describe('How far ahead to imagine'),
        mode: z
          .enum(['visualize', 'receive-wisdom', 'ask-question', 'get-encouragement'])
          .describe('Mode of connection'),
      }),
      execute: async ({ howFarAhead, mode }) => {
        getLogger().info(
          { agentId: ctx.agentId, howFarAhead, mode },
          'Connecting with future self'
        );

        let response = `**Meeting Your Future Self**\n\n`;
        response += `Imagine yourself ${howFarAhead.replace('-', ' ')} from now - the wisest, most realized version of you that could exist.\n\n`;

        if (mode === 'visualize') {
          response += `Picture them clearly:\n`;
          response += `- What do they look like?\n`;
          response += `- Where do they live?\n`;
          response += `- How do they spend their days?\n`;
          response += `- What's the quality of their presence?\n`;
          response += `- What have they achieved, experienced, become?`;
        } else if (mode === 'receive-wisdom') {
          response += `Your future self has lived through what you're going through now. They've learned what you're still learning.\n\n`;
          response += `What do they want you to know?\n`;
          response += `What do they wish you'd understand now?\n`;
          response += `What would they tell you to worry about less?`;
        } else if (mode === 'ask-question') {
          response += `You can ask your future self anything. They've lived the life you're building.\n\n`;
          response += `What question do you most want to ask them?`;
        } else {
          response += `Your future self looks at you with such compassion. They remember being you.\n\n`;
          response += `They want to say: "You're doing better than you think. The things you're afraid of - you survive them all. Keep going. I'm so proud of who you're becoming."`;
        }

        return response;
      },
    });
  },
};

// ============================================================================
// ASPIRATION TOOLS
// ============================================================================

const bucketListDef: ToolDefinition = {
  id: 'bucketList',
  name: 'Bucket List',
  description: 'Explore and capture bucket list dreams',
  domain: 'dreams',
  tags: ['dreams', 'bucket-list', 'aspirations'],

  create: (_ctx: ToolContext): Tool => {
    return llm.tool({
      description: 'Help the user explore and articulate their bucket list.',
      parameters: z.object({
        mode: z
          .enum(['add', 'explore', 'prioritize', 'why-not-now'])
          .describe('Mode of engagement'),
        item: z.string().optional().describe('Specific item if adding or exploring'),
      }),
      execute: async ({ mode, item }) => {
        getLogger().info({ agentId: ctx.agentId, mode }, 'Bucket list');

        let response = '';

        if (mode === 'add') {
          response = `Adding to your bucket list: "${item}"\n\n`;
          response += `This matters. Saying "I want to do this before I die" is a sacred act.\n\n`;
          response += `- What draws you to this?\n`;
          response += `- How long have you wanted this?\n`;
          response += `- What would it mean to do it?`;
        } else if (mode === 'explore') {
          response = `**What belongs on your bucket list?**\n\n`;
          response += `Categories to consider:\n`;
          response += `- **Places** - Where do you want to go?\n`;
          response += `- **Experiences** - What do you want to do?\n`;
          response += `- **Creations** - What do you want to make?\n`;
          response += `- **Relationships** - Who do you want to connect with?\n`;
          response += `- **Learning** - What do you want to master?\n`;
          response += `- **Being** - Who do you want to become?\n\n`;
          response += `What calls to you?`;
        } else if (mode === 'prioritize') {
          response = `**Prioritizing your bucket list**\n\n`;
          response += `Ask of each item:\n`;
          response += `- How urgently do I want this?\n`;
          response += `- What does this require that might diminish over time?\n`;
          response += `- If I never did this, would I regret it?\n\n`;
          response += `What feels most important to do soon?`;
        } else {
          response = `**Why not now?**\n\n`;
          response += `You said: "${item}"\n\n`;
          response += `What if you started moving toward this now?\n`;
          response += `- What's actually stopping you?\n`;
          response += `- What's the smallest step?\n`;
          response += `- What if "someday" never comes?`;
        }

        return response;
      },
    });
  },
};

const reconnectWithDreamsDef: ToolDefinition = {
  id: 'reconnectWithDreams',
  name: 'Reconnect With Dreams',
  description: 'Reconnect with dreams that have been forgotten or suppressed',
  domain: 'dreams',
  tags: ['dreams', 'reconnection', 'rediscovery'],

  create: (_ctx: ToolContext): Tool => {
    return llm.tool({
      description: 'Help the user reconnect with dreams they may have forgotten or suppressed.',
      parameters: z.object({
        timeOfLife: z
          .enum(['childhood', 'teens', 'young-adult', 'before-responsibilities', 'recent'])
          .describe('When the dreams lived'),
      }),
      execute: async ({ timeOfLife }) => {
        getLogger().info({ agentId: ctx.agentId, timeOfLife }, 'Reconnecting with dreams');

        const prompts: Record<string, string> = {
          childhood: `**Dreams of Childhood**\n\nBefore we learned to be "realistic"...\n\n- What did little you want to be when you grew up?\n- What did you dream about before anyone told you it wasn't possible?\n- What did you love doing before you were told to be practical?\n\nChildhood dreams are pure signal about who we are.`,
          teens: `**Dreams of Your Teens**\n\nBefore adult responsibilities...\n\n- What did teenage you dream of?\n- What seemed possible then that seems impossible now?\n- What passion did you have before life got in the way?`,
          'young-adult': `**Young Adult Dreams**\n\nWhen everything felt possible...\n\n- What dreams did you have when setting out into adulthood?\n- What did you think your life would look like?\n- What did you hope to achieve, experience, become?`,
          'before-responsibilities': `**Before Responsibilities**\n\nBefore the weight settled in...\n\n- What dreams did you have before mortgage/kids/career/obligations?\n- What did you sacrifice on the altar of responsibility?\n- What did you tell yourself you'd "get back to someday"?`,
          recent: `**Recent Dreams**\n\nDreams you've quietly set aside...\n\n- What have you wanted recently but dismissed as impractical?\n- What desires have you pushed down?\n- What keeps trying to get your attention?`,
        };

        let response = prompts[timeOfLife];
        response += `\n\nWhat dreams are asking to be remembered?`;

        return response;
      },
    });
  },
};

// ============================================================================
// DOMAIN TOOLS COLLECTION
// ============================================================================

const dreamsTools: ToolDefinition[] = [
  captureDreamDef,
  exploreDreamDef,
  honorUnfulfilledDef,
  playWithPossibilityDef,
  alternativeLifeDef,
  futureSelfDef,
  bucketListDef,
  reconnectWithDreamsDef,
];

// ============================================================================
// EXPORTS
// ============================================================================

export const { getToolDefinitions, domain, definitions } = createDomainExport(
  'dreams',
  dreamsTools
);

export default getToolDefinitions;
