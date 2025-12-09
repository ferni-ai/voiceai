/**
 * Play & Joy Domain Tools
 *
 * Tools for cultivating playfulness, fun, spontaneity, and joy.
 * This domain nurtures the often-neglected capacity for lightness.
 *
 * DOMAIN: play
 * TOOLS:
 *   Joy: mapJoy, noticeJoy, amplifyJoy, scheduleJoy
 *   Play: cultivatePlayfulness, givePermissionToPlay, findYourPlay
 *   Lightness: embraceLightness, balanceSeriousness, injectFun
 */

import { createDomainExport } from '../../registry/loader.js';
import type { ToolDefinition, ToolContext, Tool } from '../../registry/types.js';
import { llm, log } from '@livekit/agents';
import { getLogger } from '../../../utils/safe-logger.js';
import { z } from 'zod';

// ============================================================================
// JOY TOOLS
// ============================================================================

const mapJoyDef: ToolDefinition = {
  id: 'mapJoy',
  name: 'Map Joy',
  description: 'Create a map of what brings joy',
  domain: 'play',
  tags: ['play', 'joy', 'mapping'],

  create: (_ctx: ToolContext): Tool => {
    return llm.tool({
      description: 'Help the user create a map of what brings them joy.',
      parameters: z.object({
        category: z
          .enum(['all', 'simple', 'deep', 'unexpected', 'forgotten'])
          .describe('Category of joy to explore'),
      }),
      execute: async ({ category }) => {
        getLogger().info({ agentId: ctx.agentId, category }, 'Mapping joy');

        let response = `**Mapping Your Joy**\n\n`;
        response += `Knowing what brings you joy is practical wisdom. It helps you build a life that feels good.\n\n`;

        if (category === 'simple') {
          response += `**Simple Joys** - Small, accessible pleasures:\n`;
          response += `- A first sip of coffee\n`;
          response += `- Sunlight through a window\n`;
          response += `- A favorite song\n`;
          response += `- A hot shower\n`;
          response += `- Clean sheets\n\n`;
          response += `What simple things reliably bring you joy?`;
        } else if (category === 'deep') {
          response += `**Deep Joys** - Things that light you up at your core:\n`;
          response += `- Meaningful conversation\n`;
          response += `- Creative flow\n`;
          response += `- Connection with loved ones\n`;
          response += `- Achievement of something hard\n`;
          response += `- Being in nature\n\n`;
          response += `What activities make you feel most alive?`;
        } else if (category === 'unexpected') {
          response += `**Unexpected Joys** - Guilty pleasures, weird things that delight:\n`;
          response += `- Things you enjoy that "shouldn't" matter\n`;
          response += `- Pleasures that seem silly or childish\n`;
          response += `- Secret delights you don't usually admit to\n\n`;
          response += `What unexpectedly brings you joy?`;
        } else if (category === 'forgotten') {
          response += `**Forgotten Joys** - Things that used to light you up:\n`;
          response += `- What did you love as a child?\n`;
          response += `- What did you stop doing when you "grew up"?\n`;
          response += `- What joy did responsibilities push out?\n\n`;
          response += `What joy have you forgotten that you could rediscover?`;
        } else {
          response += `Let's map all the territory:\n`;
          response += `- **Simple joys** - small daily pleasures\n`;
          response += `- **Deep joys** - what makes you feel alive\n`;
          response += `- **Unexpected joys** - guilty pleasures\n`;
          response += `- **Forgotten joys** - what you've lost touch with\n\n`;
          response += `Which would you like to explore?`;
        }

        return response;
      },
    });
  },
};

const noticeJoyDef: ToolDefinition = {
  id: 'noticeJoy',
  name: 'Notice Joy',
  description: 'Practice noticing and savoring joy in the moment',
  domain: 'play',
  tags: ['play', 'joy', 'mindfulness'],

  create: (_ctx: ToolContext): Tool => {
    return llm.tool({
      description: 'Help the user notice and savor joy when it appears.',
      parameters: z.object({
        joyMoment: z.string().optional().describe('A joy moment to savor'),
        mode: z.enum(['capture', 'amplify', 'practice']).describe('Mode of engagement'),
      }),
      execute: async ({ joyMoment, mode }) => {
        getLogger().info({ agentId: ctx.agentId, mode }, 'Noticing joy');

        let response = '';

        if (mode === 'capture' && joyMoment) {
          response = `You noticed joy: "${joyMoment}"\n\n`;
          response += `Beautiful. Let's hold this moment.\n\n`;
          response += `**Savoring practice:**\n`;
          response += `- Close your eyes briefly\n`;
          response += `- Feel where the joy lives in your body\n`;
          response += `- Breathe it in\n`;
          response += `- Say to yourself: "This is joy. I'm allowed to feel this."\n\n`;
          response += `We often rush past joy. Pausing to notice it actually increases our capacity for it.`;
        } else if (mode === 'amplify') {
          response = `**Amplifying Joy**\n\n`;
          response += `Joy can be strengthened:\n`;
          response += `- **Share it** - Tell someone about the good thing\n`;
          response += `- **Record it** - Write it down or take a photo\n`;
          response += `- **Connect it** - Notice how it links to your values\n`;
          response += `- **Appreciate it** - Acknowledge what made it possible\n\n`;
          response += `What joy would you like to amplify?`;
        } else {
          response = `**Joy Noticing Practice**\n\n`;
          response += `We miss most of the joy available to us because we're not paying attention.\n\n`;
          response += `Try this: Set an intention to notice three moments of joy today. They can be small.\n`;
          response += `- The warmth of a drink\n`;
          response += `- A moment of connection\n`;
          response += `- Something beautiful you see\n`;
          response += `- A task completed\n`;
          response += `- A moment of rest\n\n`;
          response += `Joy is already there. We just have to look.`;
        }

        return response;
      },
    });
  },
};

const scheduleJoyDef: ToolDefinition = {
  id: 'scheduleJoy',
  name: 'Schedule Joy',
  description: 'Intentionally schedule joy into life',
  domain: 'play',
  tags: ['play', 'joy', 'intention'],

  create: (_ctx: ToolContext): Tool => {
    return llm.tool({
      description: 'Help the user intentionally schedule joy into their life.',
      parameters: z.object({
        timeframe: z.enum(['daily', 'weekly', 'monthly']).describe('Timeframe for joy planning'),
        constraint: z.string().optional().describe('Any constraints to work with'),
      }),
      execute: async ({ timeframe, constraint }) => {
        getLogger().info({ agentId: ctx.agentId, timeframe }, 'Scheduling joy');

        let response = `**Scheduling Joy**\n\n`;
        response += `Joy doesn't always happen spontaneously. Sometimes we have to make room for it.\n\n`;

        if (constraint) {
          response += `Working with: ${constraint}\n\n`;
        }

        if (timeframe === 'daily') {
          response += `**Daily Joy**\n`;
          response += `What small joy can you build into every day?\n`;
          response += `- Morning: A ritual you enjoy?\n`;
          response += `- Midday: A break that restores?\n`;
          response += `- Evening: Something to look forward to?\n`;
        } else if (timeframe === 'weekly') {
          response += `**Weekly Joy**\n`;
          response += `What can you do each week that feeds your spirit?\n`;
          response += `- A hobby or creative pursuit\n`;
          response += `- Time with people who energize you\n`;
          response += `- Time alone doing something you love\n`;
          response += `- An adventure, even small\n`;
        } else {
          response += `**Monthly Joy**\n`;
          response += `What bigger joy can you plan for each month?\n`;
          response += `- An experience to look forward to\n`;
          response += `- Something novel\n`;
          response += `- A celebration\n`;
          response += `- A mini adventure\n`;
        }

        response += `\n\nWhat joy do you want to schedule?`;

        return response;
      },
    });
  },
};

// ============================================================================
// PLAY TOOLS
// ============================================================================

const cultivatePlayfulnessDef: ToolDefinition = {
  id: 'cultivatePlayfulness',
  name: 'Cultivate Playfulness',
  description: 'Develop a more playful approach to life',
  domain: 'play',
  tags: ['play', 'playfulness', 'cultivation'],

  create: (_ctx: ToolContext): Tool => {
    return llm.tool({
      description: 'Help the user cultivate more playfulness in their life.',
      parameters: z.object({
        currentState: z
          .enum(['forgotten-how', 'rusty', 'want-more', 'blocked'])
          .describe('Where they are with play'),
        context: z.string().optional().describe('Context for wanting more play'),
      }),
      execute: async ({ currentState, context }) => {
        getLogger().info({ agentId: ctx.agentId, currentState }, 'Cultivating playfulness');

        let response = '';

        if (currentState === 'forgotten-how') {
          response = `You've forgotten how to play. You're not alone.\n\n`;
          response += `Adult life squeezes out play. We learn to be productive, serious, responsible. And something precious gets lost.\n\n`;
          response += `**Remembering play:**\n`;
          response += `- What did you play as a child?\n`;
          response += `- What made you laugh?\n`;
          response += `- When did you lose track of time doing something just because?\n`;
          response += `- What would "play" mean to you now, as an adult?\n\n`;
          response += `Play doesn't have to be childish. It just has to be for its own sake.`;
        } else if (currentState === 'rusty') {
          response = `Playfulness is a muscle. It atrophies without use, but it can be rebuilt.\n\n`;
          response += `**Small ways to practice:**\n`;
          response += `- Be silly with people who won't judge\n`;
          response += `- Do something with no goal except enjoyment\n`;
          response += `- Say yes to spontaneous things\n`;
          response += `- Don't take yourself so seriously for an hour\n`;
          response += `- Play with kids or animals\n\n`;
          response += `What's one playful thing you could try this week?`;
        } else if (currentState === 'blocked') {
          response = `Something is blocking your play. Let's name it.\n\n`;
          response += `Common blockers:\n`;
          response += `- "I don't have time" - (Play takes less time than we think)\n`;
          response += `- "I should be productive" - (Play makes you more productive)\n`;
          response += `- "It's childish" - (Children might be onto something)\n`;
          response += `- "I feel guilty relaxing" - (Rest and play are not laziness)\n`;
          response += `- "I don't know how anymore" - (You can learn again)\n\n`;
          response += `What's in your way?`;
        } else {
          response = `You want more play. Good! Life needs it.\n\n`;
          if (context) response += `Context: ${context}\n\n`;
          response += `What does play look like for you? Is it:\n`;
          response += `- Physical (sports, movement, nature)\n`;
          response += `- Creative (making, building, imagining)\n`;
          response += `- Social (games, banter, silliness with others)\n`;
          response += `- Mental (puzzles, learning, exploring)\n`;
          response += `- Sensory (pleasure, beauty, experience)\n\n`;
          response += `What kind of play is calling you?`;
        }

        return response;
      },
    });
  },
};

const givePermissionToPlayDef: ToolDefinition = {
  id: 'givePermissionToPlay',
  name: 'Give Permission To Play',
  description: 'Grant permission for fun, silliness, and lightness',
  domain: 'play',
  tags: ['play', 'permission', 'lightness'],

  create: (_ctx: ToolContext): Tool => {
    return llm.tool({
      description: 'Help the user give themselves permission to play and have fun.',
      parameters: z.object({
        whatNeedsPermission: z
          .string()
          .describe('What they want to do but feel they need permission for'),
        whyTheyHesitate: z.string().optional().describe('Why they hesitate'),
      }),
      execute: async ({ whatNeedsPermission, whyTheyHesitate }) => {
        getLogger().info({ agentId: ctx.agentId }, 'Giving permission to play');

        let response = `You want to: ${whatNeedsPermission}\n`;
        if (whyTheyHesitate) response += `But you hesitate because: ${whyTheyHesitate}\n`;
        response += `\n`;
        response += `**Here's your permission:**\n\n`;
        response += `You are allowed to have fun.\n`;
        response += `You are allowed to be silly.\n`;
        response += `You are allowed to do things just because you enjoy them.\n`;
        response += `You are allowed to not be productive sometimes.\n`;
        response += `You are allowed to play.\n\n`;
        response += `Life is not just for working, striving, and improving. Life is also for living, enjoying, and being.\n\n`;
        response += `The permission you're waiting for? You can give it to yourself.\n\n`;
        response += `What would it feel like to just... do it?`;

        return response;
      },
    });
  },
};

// ============================================================================
// LIGHTNESS TOOLS
// ============================================================================

const embraceLightnessDef: ToolDefinition = {
  id: 'embraceLightness',
  name: 'Embrace Lightness',
  description: 'Find lightness amid heaviness',
  domain: 'play',
  tags: ['play', 'lightness', 'balance'],

  create: (_ctx: ToolContext): Tool => {
    return llm.tool({
      description: 'Help the user find lightness when life feels heavy.',
      parameters: z.object({
        whatFeelsHeavy: z.string().describe('What feels heavy'),
        openToLightness: z.boolean().describe('Whether they are open to lightness'),
      }),
      execute: async ({ whatFeelsHeavy, openToLightness }) => {
        getLogger().info({ agentId: ctx.agentId, openToLightness }, 'Embracing lightness');

        let response = `Life feels heavy: ${whatFeelsHeavy}\n\n`;

        if (openToLightness) {
          response += `Lightness isn't denial. It's not pretending things aren't hard. It's allowing space for more than just the hard things.\n\n`;
          response += `Even in difficult times:\n`;
          response += `- Laughter is allowed\n`;
          response += `- Joy is allowed\n`;
          response += `- Taking a break is allowed\n`;
          response += `- Silliness is allowed\n\n`;
          response += `What small lightness could you allow in today?`;
        } else {
          response += `Maybe lightness feels wrong right now. That's okay too.\n\n`;
          response += `There are times when we need to sit with the weight. When levity would feel like betrayal.\n\n`;
          response += `Know that lightness will be there when you're ready. It's not going anywhere.\n\n`;
          response += `What do you need right now?`;
        }

        return response;
      },
    });
  },
};

const noteThatWasFunDef: ToolDefinition = {
  id: 'noteThatWasFun',
  name: 'Note That Was Fun',
  description: 'Capture moments of fun to remember and repeat',
  domain: 'play',
  tags: ['play', 'fun', 'capture'],

  create: (_ctx: ToolContext): Tool => {
    return llm.tool({
      description: 'Help the user capture and appreciate a fun moment.',
      parameters: z.object({
        whatWasFun: z.string().describe('What was fun'),
        whatMadeItFun: z.string().optional().describe('What made it fun'),
      }),
      execute: async ({ whatWasFun, whatMadeItFun }) => {
        getLogger().info({ agentId: ctx.agentId }, 'Noting fun');

        let response = `Fun detected: ${whatWasFun}\n`;
        if (whatMadeItFun) response += `What made it fun: ${whatMadeItFun}\n`;
        response += `\n`;
        response += `This is worth noting! Fun tells us something important about ourselves.\n\n`;
        response += `**Questions to hold:**\n`;
        response += `- How can you do more of this?\n`;
        response += `- Who could you share this with?\n`;
        response += `- What conditions made this possible?\n`;
        response += `- How can you create those conditions more often?\n\n`;
        response += `Life is not a waiting room. These moments matter.`;

        return response;
      },
    });
  },
};

const becomeSillyDef: ToolDefinition = {
  id: 'becomeSilly',
  name: 'Become Silly',
  description: 'Embrace and practice silliness',
  domain: 'play',
  tags: ['play', 'silly', 'lightness'],

  create: (_ctx: ToolContext): Tool => {
    return llm.tool({
      description: 'Encourage and support silliness and lightheartedness.',
      parameters: z.object({
        context: z.enum(['alone', 'with-others', 'general']).describe('Context for silliness'),
      }),
      execute: async ({ context }) => {
        getLogger().info({ agentId: ctx.agentId, context }, 'Becoming silly');

        let response = `**Permission to Be Silly**\n\n`;
        response += `Silliness is underrated. It breaks tension, creates connection, and reminds us not to take everything so seriously.\n\n`;

        if (context === 'alone') {
          response += `**Solo silliness:**\n`;
          response += `- Dance ridiculously when no one's watching\n`;
          response += `- Make faces at yourself in the mirror\n`;
          response += `- Talk to your pets in funny voices\n`;
          response += `- Sing dramatically in the shower\n`;
          response += `- Do things the "wrong" way just to see what happens\n`;
        } else if (context === 'with-others') {
          response += `**Silliness with others:**\n`;
          response += `- Tell a bad joke on purpose\n`;
          response += `- Play a game with made-up rules\n`;
          response += `- Do impressions (badly)\n`;
          response += `- Make up songs about mundane things\n`;
          response += `- Be dramatically enthusiastic about something small\n`;
        } else {
          response += `**The case for silliness:**\n`;
          response += `- It dissolves stress\n`;
          response += `- It bonds people together\n`;
          response += `- It's free\n`;
          response += `- Children are happier than adults - coincidence?\n`;
          response += `- Taking yourself less seriously is freedom\n`;
        }

        response += `\n\nWhat would feel silly in a good way right now?`;

        return response;
      },
    });
  },
};

// ============================================================================
// SPONTANEITY & CREATIVITY
// ============================================================================

const spontaneityChallengeDef: ToolDefinition = {
  id: 'spontaneityChallenge',
  name: 'Spontaneity Challenge',
  description: 'Challenges to break routine and embrace spontaneity',
  domain: 'play',
  tags: ['play', 'spontaneity', 'challenge'],

  create: (_ctx: ToolContext): Tool => {
    return llm.tool({
      description: 'Offer spontaneity challenges to break routine.',
      parameters: z.object({
        intensity: z.enum(['tiny', 'small', 'medium', 'bold']).describe('How adventurous'),
        context: z
          .enum(['daily-life', 'social', 'solo', 'work'])
          .describe('Context for spontaneity'),
      }),
      execute: async ({ intensity, context }) => {
        getLogger().info({ agentId: ctx.agentId, intensity, context }, 'Spontaneity challenge');

        const challenges: Record<string, Record<string, string[]>> = {
          tiny: {
            'daily-life': [
              'Take a different route than usual',
              "Order something you've never tried",
              "Talk to someone you normally wouldn't",
              'Change one small routine today',
              'Listen to music outside your usual taste',
            ],
            social: [
              'Give someone an unexpected compliment',
              "Text someone you haven't talked to in a while",
              'Say yes to the next invitation you get',
              'Start a conversation with a stranger',
            ],
            solo: [
              'Sit somewhere different than usual',
              'Write down three random ideas, no matter how silly',
              'Doodle for 5 minutes',
              'Look at the sky for a full minute',
            ],
            work: [
              'Start with your least favorite task first',
              'Work from a different spot',
              'Ask a colleague a non-work question',
              'Take a 5-minute break in an unusual way',
            ],
          },
          bold: {
            'daily-life': [
              'Do something that scares you a little',
              "Go somewhere you've been meaning to try",
              "Say no to something you'd normally tolerate",
              'Break a personal rule (safely)',
            ],
            social: [
              'Invite someone to something unexpected',
              'Share something vulnerable with a friend',
              'Organize a spontaneous gathering',
              'Reach out to someone you admire',
            ],
            solo: [
              'Book something without overthinking',
              'Start that creative project today',
              'Spend a day doing only what you want',
              "Go somewhere alone you've never been",
            ],
            work: [
              "Propose an idea you've been holding back",
              'Ask for what you actually want',
              'Do something a completely different way',
              'Have a real conversation with someone you avoid',
            ],
          },
        };

        const selectedIntensity =
          intensity === 'small' || intensity === 'medium' ? 'tiny' : intensity;
        const options = challenges[selectedIntensity][context];

        let response = `**Spontaneity Challenge** (${intensity} intensity)\n\n`;
        response += `Routine is comfortable. But comfort can become a cage.\n\n`;
        response += `**Your challenge options:**\n\n`;
        options.forEach((c, i) => {
          response += `${i + 1}. ${c}\n`;
        });
        response += `\n**The point isn't the specific action** - it's practicing the muscle of doing something different.\n\n`;
        response += `Which one will you try? Or what spontaneous thing has been calling to you?`;

        return response;
      },
    });
  },
};

const playfulCreativityDef: ToolDefinition = {
  id: 'playfulCreativity',
  name: 'Playful Creativity',
  description: 'Unlock creativity through playful, low-stakes creative activities',
  domain: 'play',
  tags: ['play', 'creativity', 'expression'],

  create: (_ctx: ToolContext): Tool => {
    return llm.tool({
      description: 'Guide playful, low-stakes creative expression.',
      parameters: z.object({
        mode: z
          .enum(['no-talent-needed', 'with-constraints', 'collaborative', 'spontaneous'])
          .describe('Type of creative play'),
        medium: z
          .enum(['writing', 'visual', 'physical', 'sound', 'any'])
          .optional()
          .describe('Medium if known'),
      }),
      execute: async ({ mode, medium }) => {
        getLogger().info({ agentId: ctx.agentId, mode, medium }, 'Playful creativity');

        let response = `**Playful Creativity**\n\n`;
        response += `This isn't about making something good. It's about making something, period. No judgment.\n\n`;

        if (mode === 'no-talent-needed') {
          response += `**Zero talent required:**\n\n`;
          response += `- **Bad art on purpose:** Draw the ugliest thing you can. Make it so bad it's funny.\n`;
          response += `- **Terrible poetry:** Write the worst poem possible. Rhyme things that shouldn't rhyme.\n`;
          response += `- **Stick figure stories:** Tell an epic tale in stick figures.\n`;
          response += `- **Wrong-hand drawing:** Draw with your non-dominant hand.\n`;
          response += `- **3-minute song:** Write and perform a song in 3 minutes. Doesn't matter if you can't sing.\n\n`;
          response += `The goal is expression, not excellence.`;
        } else if (mode === 'with-constraints') {
          response += `**Creative constraints** (limits breed creativity):\n\n`;
          response += `- Write a story in exactly 50 words\n`;
          response += `- Draw using only circles\n`;
          response += `- Create something using only things within arm's reach\n`;
          response += `- Make a "sculpture" from contents of your pocket/bag\n`;
          response += `- Tell a story using only questions\n`;
          response += `- Design something for a ridiculous purpose\n\n`;
          response += `Pick a constraint and see what emerges.`;
        } else if (mode === 'collaborative') {
          response += `**Play with others:**\n\n`;
          response += `- **Exquisite corpse:** Each person adds to a drawing/story without seeing what came before\n`;
          response += `- **Yes, and...:** Improv a scene where everyone accepts and builds on what's said\n`;
          response += `- **Remix challenge:** Everyone makes something from the same random elements\n`;
          response += `- **Caption wars:** Take turns writing funny captions for images\n`;
        } else {
          response += `**Right now, with no preparation:**\n\n`;
          response += `- Look at the nearest object. Give it a name, a personality, a backstory.\n`;
          response += `- Write one sentence that starts with "What if..."\n`;
          response += `- Make a shape in the air with your hand. What is it?\n`;
          response += `- Hum a tune you've never heard before.\n`;
          response += `- Look out a window (or imagine one) and write what you see as a poem.\n`;
        }

        response += `\n\n**Remember:** Play has no wrong answers. The only way to fail is not to try.`;

        return response;
      },
    });
  },
};

const reclaimLostHobbyDef: ToolDefinition = {
  id: 'reclaimLostHobby',
  name: 'Reclaim Lost Hobby',
  description: 'Reconnect with a hobby or activity that brought joy in the past',
  domain: 'play',
  tags: ['play', 'hobbies', 'rediscovery'],

  create: (_ctx: ToolContext): Tool => {
    return llm.tool({
      description: 'Help the user reconnect with activities they used to love.',
      parameters: z.object({
        hobby: z.string().optional().describe('The hobby they miss'),
        mode: z
          .enum(['explore', 'plan-return', 'address-barriers'])
          .describe('What help they need'),
      }),
      execute: async ({ hobby, mode }) => {
        getLogger().info({ agentId: ctx.agentId, hobby, mode }, 'Reclaiming lost hobby');

        let response = '';

        if (mode === 'explore') {
          response = `**What Did You Used to Love?**\n\n`;
          response += `Things often get crowded out by adult responsibilities:\n\n`;
          response += `- What did you spend hours doing as a kid?\n`;
          response += `- What hobby did you have in high school or college?\n`;
          response += `- What did you stop doing when life got busy?\n`;
          response += `- What do you see others doing that makes you think "I wish..."?\n`;
          response += `- What's been calling to you that you keep dismissing?\n\n`;
          response += `Sometimes the activities we "used to" do are the ones that made us feel most alive.`;
        } else if (mode === 'plan-return' && hobby) {
          response = `**Returning to ${hobby}**\n\n`;
          response += `You don't have to be as good as you were. You don't have to commit to hours a week. Just start.\n\n`;
          response += `**Tiny steps to return:**\n`;
          response += `- What's the smallest possible version of doing this?\n`;
          response += `- What would 10 minutes look like?\n`;
          response += `- What equipment/supplies do you need? (Often less than you think)\n`;
          response += `- Could you try it this week?\n\n`;
          response += `**Give yourself permission:**\n`;
          response += `- To be a beginner again\n`;
          response += `- To be rusty\n`;
          response += `- To do it imperfectly\n`;
          response += `- To do it just for fun, not for results\n\n`;
          response += `What's your smallest first step back to ${hobby}?`;
        } else {
          response = `**What's Keeping You Away?**${hobby ? ` from ${hobby}` : ''}\n\n`;
          response += `Common barriers (and reality checks):\n\n`;
          response += `- **"I don't have time"** - Do you have 20 minutes? That's enough to start.\n`;
          response += `- **"I'm not as good as I was"** - So? Enjoyment matters more than skill.\n`;
          response += `- **"It's not productive"** - Not everything needs to be productive. That's the point.\n`;
          response += `- **"Other things are more important"** - Are they? What makes life worth living?\n`;
          response += `- **"I'd have to buy stuff"** - Start with what you have. Upgrade later if you stick with it.\n\n`;
          response += `What's really in your way?`;
        }

        return response;
      },
    });
  },
};

// ============================================================================
// DOMAIN TOOLS COLLECTION
// ============================================================================

const playTools: ToolDefinition[] = [
  mapJoyDef,
  noticeJoyDef,
  scheduleJoyDef,
  cultivatePlayfulnessDef,
  givePermissionToPlayDef,
  embraceLightnessDef,
  noteThatWasFunDef,
  becomeSillyDef,
  // Spontaneity & Creativity
  spontaneityChallengeDef,
  playfulCreativityDef,
  reclaimLostHobbyDef,
];

// ============================================================================
// EXPORTS
// ============================================================================

export const { getToolDefinitions, domain, definitions } = createDomainExport('play', playTools);

export default getToolDefinitions;
