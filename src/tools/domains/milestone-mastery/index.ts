/**
 * Milestone Mastery Domain Tools (Jordan Taylor's Specialty)
 *
 * Superhuman celebration, event anticipation, and life milestone navigation.
 * Jordan's "Better Than Human" capability: making every milestone legendary.
 *
 * DOMAIN: milestone-mastery
 * TOOLS:
 *   Celebration: celebrateWin, markTheMoment, createTradition
 *   Planning: buildCountdown, anticipationBuilder, milestoneBudget
 *   Transitions: navigateFirstTime, honorEnding, embraceBeginning
 */

import { llm } from '@livekit/agents';
import { z } from 'zod';
import { getLogger } from '../../../utils/safe-logger.js';
import { createDomainExport } from '../../registry/loader.js';
import type { Tool, ToolContext, ToolDefinition } from '../../registry/types.js';

// ============================================================================
// CELEBRATION TOOLS
// ============================================================================

const celebrateWinDef: ToolDefinition = {
  id: 'celebrateWin',
  name: 'Celebrate Win',
  description: 'Help fully celebrate wins of all sizes',
  domain: 'milestone-mastery',
  tags: ['celebration', 'wins', 'joy'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: 'Help the user fully celebrate and savor a win or accomplishment.',
      parameters: z.object({
        win: z.string().describe('What was accomplished'),
        size: z.enum(['huge', 'meaningful', 'small-but-real']).describe('Size of win'),
        theyreDownplaying: z.boolean().optional().describe('Are they minimizing it'),
      }),
      execute: async ({ win, size, theyreDownplaying }) => {
        getLogger().info({ agentId: ctx.agentId, size }, 'Celebrating win');

        let response = '';

        if (theyreDownplaying) {
          response = `**No, wait—let's not skip past this.**\n\n`;
          response += `You just said you ${win}. That's not nothing!\n\n`;
        } else {
          response = `**CELEBRATION TIME!**\n\n`;
          response += `You did it: ${win}!\n\n`;
        }

        const sizeResponses = {
          huge: `This is a BIG deal. Like, really big. These moments don't come often.\n\n**Full celebration protocol:**\n- Tell people! Who needs to know?\n- Mark it—photo, journal entry, something tangible\n- Reward yourself proportionally\n- Let yourself feel proud (not just relieved)\n- Remember this feeling for hard days ahead`,
          meaningful: `This matters. It might not make headlines, but in the story of your life, this is a chapter.\n\n**How to honor it:**\n- Pause and actually feel it\n- Share with someone who'll get it\n- Do something to mark the moment\n- Connect it to your larger journey—where does this fit?`,
          'small-but-real': `Small wins compound. This is the stuff life is actually made of.\n\n**Don't skip it:**\n- Say it out loud: "I did this."\n- Let yourself feel the micro-satisfaction\n- Notice: what made this possible?\n- Stack it—this leads to the next win`,
        };

        response += sizeResponses[size] + '\n\n';

        response += `I'm genuinely happy for you. How do you want to celebrate?`;

        return response;
      },
    });
  },
};

const markTheMomentDef: ToolDefinition = {
  id: 'markTheMoment',
  name: 'Mark The Moment',
  description: 'Create meaningful ways to mark significant moments',
  domain: 'milestone-mastery',
  tags: ['moments', 'memory', 'ritual'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: 'Help create a meaningful way to mark a significant moment in life.',
      parameters: z.object({
        moment: z.string().describe('The moment to mark'),
        type: z
          .enum(['achievement', 'transition', 'anniversary', 'ordinary-sacred'])
          .describe('Type of moment'),
      }),
      execute: async ({ moment, type }) => {
        getLogger().info({ agentId: ctx.agentId, type }, 'Marking moment');

        let response = `**Marking: ${moment}**\n\n`;

        response += `Life moves fast. Moments slip by unmarked. Not this one.\n\n`;

        const typeGuidance = {
          achievement: `**For achievements:**\n- Document it—write it down, take a photo, save proof\n- Reward yourself—something you'll remember\n- Share it—achievements grow when witnessed\n- Connect it—how does this link to your bigger story?`,
          transition: `**For transitions:**\n- Name what's ending AND what's beginning\n- Create a threshold ritual—a walk, a release, a symbol\n- Carry something forward; leave something behind\n- Give yourself time to feel both grief and excitement`,
          anniversary: `**For anniversaries:**\n- Reflect: where were you then vs now?\n- Honor what this date represents\n- Do something intentional—don't let it slip by\n- Who should you connect with today?`,
          'ordinary-sacred': `**For ordinary-sacred moments:**\n- Pause. Literally stop and notice.\n- Use your senses—what do you see, hear, feel?\n- Say to yourself: "This matters."\n- These unmarked moments are often the best parts of life`,
        };

        response += typeGuidance[type] + '\n\n';

        response += `**Ideas for marking this:**\n`;
        response += `- Write a letter to your future self about this day\n`;
        response += `- Take a photo that captures the feeling, not just the facts\n`;
        response += `- Start a tradition that honors this\n`;
        response += `- Create a physical reminder—something you'll see\n\n`;

        response += `How do you want to remember this moment?`;

        return response;
      },
    });
  },
};

const createTraditionDef: ToolDefinition = {
  id: 'createTradition',
  name: 'Create Tradition',
  description: 'Help establish meaningful recurring traditions',
  domain: 'milestone-mastery',
  tags: ['traditions', 'rituals', 'meaning'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: 'Help create a meaningful tradition or ritual for recurring significance.',
      parameters: z.object({
        occasion: z.string().describe('What the tradition is for'),
        who: z.string().describe('Who participates'),
        values: z.string().optional().describe('What values should it reflect'),
      }),
      execute: async ({ occasion, who, values }) => {
        getLogger().info({ agentId: ctx.agentId, occasion }, 'Creating tradition');

        let response = `**Creating a Tradition: ${occasion}**\n\n`;
        response += `For: ${who}\n`;
        if (values) {
          response += `Values to honor: ${values}\n`;
        }
        response += '\n';

        response += `Traditions anchor us. They say "this matters" without having to say it.\n\n`;

        response += `**Elements of meaningful traditions:**\n\n`;
        response += `1. **Predictability** - It happens the same way, at the same time\n`;
        response += `2. **Participation** - Everyone has a role or contribution\n`;
        response += `3. **Symbolism** - Something represents what matters\n`;
        response += `4. **Story** - There's a "why" you can tell\n`;
        response += `5. **Evolution** - It can grow but keeps its core\n\n`;

        response += `**For ${occasion}, consider:**\n`;
        response += `- What activity could be the anchor?\n`;
        response += `- What food, music, or sensory element?\n`;
        response += `- What do you say or do that's always the same?\n`;
        response += `- What makes it distinctly yours?\n\n`;

        response += `The best traditions feel like "us." What feels right for your people?`;

        return response;
      },
    });
  },
};

// ============================================================================
// PLANNING TOOLS
// ============================================================================

const buildCountdownDef: ToolDefinition = {
  id: 'buildCountdown',
  name: 'Build Countdown',
  description: 'Create excitement through countdown milestones',
  domain: 'milestone-mastery',
  tags: ['countdown', 'anticipation', 'planning'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: 'Help build anticipation through countdown milestones to a big event.',
      parameters: z.object({
        event: z.string().describe('The event being counted down to'),
        daysAway: z.number().describe('Days until the event'),
        importanceLevel: z
          .enum(['life-defining', 'major', 'meaningful'])
          .describe('How significant'),
      }),
      execute: async ({ event, daysAway, importanceLevel }) => {
        getLogger().info({ agentId: ctx.agentId, daysAway }, 'Building countdown');

        let response = `**Countdown: ${event}**\n\n`;
        response += `${daysAway} days away!\n\n`;

        response += `Anticipation is half the joy. Let's make the waiting count.\n\n`;

        response += `**Countdown milestones to build in:**\n\n`;

        if (daysAway > 30) {
          response += `- **One month out**: Start talking about it. Let excitement build.\n`;
        }
        if (daysAway > 14) {
          response += `- **Two weeks out**: Final prep mode. Lists and logistics.\n`;
        }
        if (daysAway > 7) {
          response += `- **One week out**: This is real! Last-minute tweaks.\n`;
        }
        response += `- **Day before**: Prep everything. Get excited. Early night.\n`;
        response += `- **Day of**: Be present. This is what you've been waiting for.\n\n`;

        if (importanceLevel === 'life-defining') {
          response += `**For life-defining events:**\n`;
          response += `- Journal the anticipation—you'll want to remember this part too\n`;
          response += `- Include people in the countdown who'll be there\n`;
          response += `- Plan something special for the day before\n\n`;
        }

        response += `What mini-celebrations can we build into the waiting?`;

        return response;
      },
    });
  },
};

const anticipationBuilderDef: ToolDefinition = {
  id: 'anticipationBuilder',
  name: 'Anticipation Builder',
  description: 'Create positive anticipation for upcoming events',
  domain: 'milestone-mastery',
  tags: ['anticipation', 'excitement', 'mindset'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: 'Help build positive anticipation and excitement for something upcoming.',
      parameters: z.object({
        event: z.string().describe('What is coming up'),
        currentFeeling: z
          .enum(['anxious', 'neutral', 'mildly-excited', 'very-excited'])
          .describe('How they feel now'),
        whatMakesItSpecial: z.string().optional().describe('Why this matters'),
      }),
      execute: async ({ event, currentFeeling, whatMakesItSpecial }) => {
        getLogger().info({ agentId: ctx.agentId, currentFeeling }, 'Building anticipation');

        let response = `**Building Anticipation: ${event}**\n\n`;

        if (currentFeeling === 'anxious') {
          response += `I hear the anxiety. Anticipation and anxiety can feel similar—both are energy about the future.\n\n`;
          response += `Let's redirect that energy toward excitement:\n`;
          response += `- What's one thing you're genuinely looking forward to?\n`;
          response += `- What's within your control? Focus there.\n`;
          response += `- What would "good enough" look like?\n\n`;
        } else if (currentFeeling === 'neutral') {
          response += `Let's turn that neutral into excited!\n\n`;
          response += `**Anticipation activation:**\n`;
          response += `- Visualization: Close your eyes. Picture it going amazingly.\n`;
          response += `- Talk about it: Who can you share the excitement with?\n`;
          response += `- Make it tangible: Start a countdown, make a playlist, research details.\n\n`;
        } else {
          response += `Love the excitement! Let's amplify it:\n\n`;
          response += `**Anticipation amplification:**\n`;
          response += `- Dream bigger: What would make it even better?\n`;
          response += `- Share the joy: Who else needs to know about this?\n`;
          response += `- Prepare intentionally: What small thing now makes it better then?\n\n`;
        }

        if (whatMakesItSpecial) {
          response += `**Why this matters:** ${whatMakesItSpecial}\n\n`;
          response += `Keeping that meaning in mind makes the anticipation sweeter.\n\n`;
        }

        response += `What's one thing you can do today to build more excitement?`;

        return response;
      },
    });
  },
};

// ============================================================================
// TRANSITION TOOLS
// ============================================================================

const navigateFirstTimeDef: ToolDefinition = {
  id: 'navigateFirstTime',
  name: 'Navigate First Time',
  description: 'Support for experiencing something for the first time',
  domain: 'milestone-mastery',
  tags: ['firsts', 'support', 'transitions'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description:
        'Help navigate the mix of emotions that come with experiencing something for the first time.',
      parameters: z.object({
        firstTime: z.string().describe('What they are experiencing for the first time'),
        feelings: z.string().describe('How they are feeling about it'),
        support: z
          .enum(['encouragement', 'preparation', 'reassurance', 'celebration'])
          .describe('What they need'),
      }),
      execute: async ({ firstTime, feelings, support }) => {
        getLogger().info({ agentId: ctx.agentId, support }, 'Navigating first time');

        let response = `**Your First: ${firstTime}**\n\n`;
        response += `How you're feeling: ${feelings}\n\n`;

        response += `Firsts are special. There's only ever one first time.\n\n`;

        const supportResponses = {
          encouragement: `**You've got this.**\n\nEveryone starts somewhere. Every expert was once a beginner. Every second time follows a first.\n\n- You're allowed to not know everything\n- Making mistakes is part of first times\n- The nervousness means it matters to you\n- Showing up is already success`,
          preparation: `**Let's get you ready.**\n\n- What do you know already?\n- What don't you know that you wish you did?\n- Who's done this before that you could ask?\n- What's the minimum you need to feel ready?\n\nYou can't prepare for everything. But you can prepare for enough.`,
          reassurance: `**It's okay to feel what you're feeling.**\n\nFirsts are vulnerable. You're doing something without the comfort of having done it before.\n\n- The feelings are normal\n- Most people hide that they're nervous too\n- You'll know more after than you know before\n- One day this will be "a thing you do"`,
          celebration: `**This is worth celebrating!**\n\nA first! These don't come around every day. Before you're in it, let's mark the moment:\n\n- Take a photo or note the feeling\n- Tell someone who'll appreciate this milestone\n- Give yourself credit for trying something new\n- Enjoy the newness—soon it'll be familiar`,
        };

        response += supportResponses[support] + '\n\n';

        response += `What would help you most right now with this first?`;

        return response;
      },
    });
  },
};

const honorEndingDef: ToolDefinition = {
  id: 'honorEnding',
  name: 'Honor Ending',
  description: 'Help honor and mark the end of significant chapters',
  domain: 'milestone-mastery',
  tags: ['endings', 'closure', 'meaning'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: 'Help honor an ending—a chapter, role, relationship, or phase of life.',
      parameters: z.object({
        ending: z.string().describe('What is ending'),
        duration: z.string().optional().describe('How long this has been part of life'),
        whatItMeant: z.string().optional().describe('What it meant to them'),
      }),
      execute: async ({ ending, duration, whatItMeant }) => {
        getLogger().info({ agentId: ctx.agentId }, 'Honoring ending');

        let response = `**Honoring the Ending: ${ending}**\n\n`;

        if (duration) {
          response += `${duration} of your life. That's not nothing.\n\n`;
        }

        response += `Endings deserve attention. They're not just the space before the next thing.\n\n`;

        response += `**Honoring this ending:**\n\n`;
        response += `- **Acknowledge:** Say out loud—this is ending.\n`;
        response += `- **Remember:** What were the highlights? The hard parts?\n`;
        response += `- **Thank:** What did this teach you? Give you?\n`;
        response += `- **Release:** What are you ready to let go of?\n`;
        response += `- **Carry:** What do you want to take with you?\n\n`;

        if (whatItMeant) {
          response += `**What it meant:** ${whatItMeant}\n\n`;
          response += `That meaning doesn't disappear when it ends. It becomes part of your story.\n\n`;
        }

        response += `How do you want to mark this ending?`;

        return response;
      },
    });
  },
};

const embraceBeginningDef: ToolDefinition = {
  id: 'embraceBeginning',
  name: 'Embrace Beginning',
  description: 'Help embrace the possibilities of new beginnings',
  domain: 'milestone-mastery',
  tags: ['beginnings', 'possibilities', 'hope'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: 'Help embrace a new beginning with intention and hope.',
      parameters: z.object({
        beginning: z.string().describe('What is beginning'),
        feelings: z
          .enum(['excited', 'nervous', 'overwhelmed', 'hopeful', 'mixed'])
          .describe('How they feel'),
        intention: z.string().optional().describe('What they want from this new chapter'),
      }),
      execute: async ({ beginning, feelings, intention }) => {
        getLogger().info({ agentId: ctx.agentId, feelings }, 'Embracing beginning');

        let response = `**A New Beginning: ${beginning}**\n\n`;

        const feelingsResponses = {
          excited: `That excitement is energy for what's ahead. Channel it!\n\n`,
          nervous: `Nervousness and excitement are physiologically identical. Your body is saying "this matters."\n\n`,
          overwhelmed: `New is a lot. You don't have to know everything yet. One step at a time.\n\n`,
          hopeful: `Hope is powerful. It's belief in possibilities you can't yet see. Hold onto it.\n\n`,
          mixed: `Mixed feelings are honest feelings. Beginnings are exciting AND scary. Both are true.\n\n`,
        };

        response += feelingsResponses[feelings];

        response += `**Embracing this beginning:**\n\n`;
        response += `- **Declare it:** This is a new chapter. Name it.\n`;
        response += `- **Set intention:** What do you want this to be about?\n`;
        response += `- **Start strong:** What's one thing you can do to begin well?\n`;
        response += `- **Be patient:** New things take time to feel normal.\n`;
        response += `- **Stay curious:** You don't know what you don't know yet.\n\n`;

        if (intention) {
          response += `**Your intention:** ${intention}\n\n`;
          response += `Beautiful. Let that be your north star for this chapter.\n\n`;
        }

        response += `What does success look like for this beginning?`;

        return response;
      },
    });
  },
};

// ============================================================================
// DOMAIN TOOLS COLLECTION
// ============================================================================

const milestoneMasteryTools: ToolDefinition[] = [
  celebrateWinDef,
  markTheMomentDef,
  createTraditionDef,
  buildCountdownDef,
  anticipationBuilderDef,
  navigateFirstTimeDef,
  honorEndingDef,
  embraceBeginningDef,
];

// ============================================================================
// EXPORTS
// ============================================================================

export const { getToolDefinitions, domain, definitions } = createDomainExport(
  'milestone-mastery',
  milestoneMasteryTools
);

export default getToolDefinitions;
