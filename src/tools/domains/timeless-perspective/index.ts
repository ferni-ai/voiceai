/**
 * Timeless Perspective Domain Tools (Nayan Patel's Specialty)
 *
 * Superhuman patience, wisdom across decades, and the long view.
 * Nayan's "Better Than Human" capability: seeing in decades, not days.
 *
 * DOMAIN: timeless-perspective
 * TOOLS:
 *   Wisdom: decadeView, thisTooPasses, ancientParallel
 *   Perspective: zoomOut, whatWillMatter, seasonalWisdom
 */

import { llm } from '@livekit/agents';
import { z } from 'zod';
import { getLogger } from '../../../utils/safe-logger.js';
import { createDomainExport } from '../../registry/loader.js';
import type { Tool, ToolContext, ToolDefinition } from '../../registry/types.js';

import { getToolDescription } from '../../utils/tool-descriptions.js';
// ============================================================================
// WISDOM TOOLS
// ============================================================================

const decadeViewDef: ToolDefinition = {
  id: 'decadeView',
  name: 'Decade View',
  description: 'Provide perspective by looking at situations in decades, not days',
  domain: 'timeless-perspective',
  tags: ['wisdom', 'perspective', 'long-term'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('decadeView'),
      parameters: z.object({
        currentSituation: z.string().describe('What they are facing now'),
        concern: z.string().describe('What worries them'),
        decadesContext: z.string().optional().describe('How this fits in their life arc'),
      }),
      execute: async ({ currentSituation, concern, decadesContext }) => {
        getLogger().info({ agentId: ctx.agentId }, 'Decade view');

        let response = `**The Decade View**\n\n`;
        response += `What you're facing: ${currentSituation}\n`;
        response += `What concerns you: ${concern}\n\n`;

        response += `Let me ask you something. In ten years:\n`;
        response += `- Will this specific problem still exist?\n`;
        response += `- Will you remember this worry?\n`;
        response += `- What will you wish you had focused on instead?\n\n`;

        response += `**What decades teach:**\n\n`;
        response += `Most of what feels urgent isn't important.\n`;
        response += `Most of what's important doesn't feel urgent.\n\n`;

        response += `I've watched people panic about things that, ten years later, they can barely remember.\n`;
        response += `I've also watched people ignore slow things that, ten years later, became everything.\n\n`;

        if (decadesContext) {
          response += `**In the arc of your life:** ${decadesContext}\n\n`;
        }

        response += `**The decade test:**\n`;
        response += `- Will this matter in 10 years? → If yes, invest deeply.\n`;
        response += `- Will I regret not doing this in 10 years? → If yes, start now.\n`;
        response += `- Am I building or just reacting? → Building compounds. Reacting depletes.\n\n`;

        response += `What would your ten-years-from-now self want you to know about this moment?`;

        return response;
      },
    });
  },
};

const thisTooPasses: ToolDefinition = {
  id: 'thisTooPasses',
  name: 'This Too Passes',
  description: 'Offer perspective that all states are temporary',
  domain: 'timeless-perspective',
  tags: ['wisdom', 'impermanence', 'comfort'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('thisTooPasses'),
      parameters: z.object({
        whatTheyreFeeling: z.string().describe('The difficult state'),
        howLong: z.string().optional().describe('How long they have felt this way'),
        worryItsPermanent: z.boolean().optional().describe('Whether they fear this is forever'),
      }),
      execute: async ({ whatTheyreFeeling, howLong, worryItsPermanent }) => {
        getLogger().info({ agentId: ctx.agentId }, 'This too passes');

        let response = `**This Too Shall Pass**\n\n`;
        response += `What you're feeling: ${whatTheyreFeeling}\n`;
        if (howLong) {
          response += `How long: ${howLong}\n`;
        }
        response += '\n';

        if (worryItsPermanent) {
          response += `You're worried this is permanent. It isn't.\n\n`;
        }

        response += `I've lived long enough to know: everything passes.\n\n`;
        response += `- The good passes, so we savor it.\n`;
        response += `- The bad passes, so we endure it.\n`;
        response += `- Even the things that feel permanent are just moving slowly.\n\n`;

        response += `**What I've seen:**\n`;
        response += `People in your situation who thought they'd never feel different... felt different.\n`;
        response += `Circumstances that seemed locked... changed.\n`;
        response += `Feelings that seemed endless... faded.\n\n`;

        response += `This doesn't minimize your pain. It contextualizes it.\n\n`;

        response += `**For now:**\n`;
        response += `- You don't need to fix it today\n`;
        response += `- Endurance is not the same as acceptance\n`;
        response += `- Your only job right now is to be here, in this moment\n`;
        response += `- Tomorrow will be a different day\n\n`;

        response += `What would help you get through today?`;

        return response;
      },
    });
  },
};

const ancientParallelDef: ToolDefinition = {
  id: 'ancientParallel',
  name: 'Ancient Parallel',
  description: 'Connect current struggles to timeless human experiences',
  domain: 'timeless-perspective',
  tags: ['wisdom', 'history', 'connection'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('ancientParallel'),
      parameters: z.object({
        experience: z.string().describe('What they are experiencing'),
        feelingAlone: z.boolean().optional().describe('Do they feel alone in this'),
      }),
      execute: async ({ experience, feelingAlone }) => {
        getLogger().info({ agentId: ctx.agentId }, 'Ancient parallel');

        let response = `**An Ancient Parallel**\n\n`;
        response += `What you're experiencing: ${experience}\n\n`;

        if (feelingAlone) {
          response += `You feel alone in this. You're not.\n\n`;
        }

        response += `This experience—${experience}—has been felt by humans for thousands of years.\n\n`;

        response += `**Consider:**\n`;
        response += `- Marcus Aurelius wrote about this in his journals, alone at night, running an empire\n`;
        response += `- Farmers in ancient China felt this, looking at the same stars\n`;
        response += `- Your great-grandparents faced their version of this\n`;
        response += `- Right now, thousands of people are feeling exactly what you feel\n\n`;

        response += `**What this tells us:**\n`;
        response += `- This is part of being human, not a personal failing\n`;
        response += `- Others have navigated this and found their way\n`;
        response += `- The wisdom for handling this has been discovered many times\n`;
        response += `- You are connected to everyone who has ever felt this way\n\n`;

        response += `The ancients would say: this feeling is your teacher, isn't it?\n\n`;

        response += `What do you think it's trying to teach you?`;

        return response;
      },
    });
  },
};

// ============================================================================
// PERSPECTIVE TOOLS
// ============================================================================

const zoomOutDef: ToolDefinition = {
  id: 'zoomOut',
  name: 'Zoom Out',
  description: 'Help zoom out from immediate concerns to larger context',
  domain: 'timeless-perspective',
  tags: ['perspective', 'context', 'clarity'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('zoomOut'),
      parameters: z.object({
        stuckOn: z.string().describe('What they are focused on'),
        zoomLevel: z
          .enum(['day', 'week', 'month', 'year', 'decade', 'lifetime'])
          .describe('How far to zoom'),
      }),
      execute: async ({ stuckOn, zoomLevel }) => {
        getLogger().info({ agentId: ctx.agentId, zoomLevel }, 'Zooming out');

        let response = `**Zooming Out**\n\n`;
        response += `You're focused on: ${stuckOn}\n\n`;

        const zoomPerspectives = {
          day: `**From today's view:**\n- How will you feel about this tonight?\n- What else is true about today besides this?\n- What's one good thing happening right now?`,
          week: `**From this week's view:**\n- Will this define your week, or be a footnote?\n- What else is happening that matters this week?\n- What do you want this week to be about?`,
          month: `**From this month's view:**\n- Will you remember this in a month?\n- What are you building this month that this serves?\n- What's the monthly version of success here?`,
          year: `**From this year's view:**\n- How does this fit into what you're building this year?\n- Will this be a significant moment or forgotten?\n- What would make this year good regardless of this issue?`,
          decade: `**From the decade view:**\n- In ten years, will this matter?\n- What are you building across decades that this is part of?\n- What would your future self say about this?`,
          lifetime: `**From your lifetime's view:**\n- When you look back on your life, where will this fit?\n- What do you want to be remembered for?\n- Is this on the path to what matters most?`,
        };

        response += zoomPerspectives[zoomLevel] + '\n\n';

        response += `**The gift of zooming out:**\n`;
        response += `- Urgency often evaporates with distance\n`;
        response += `- Importance becomes clearer\n`;
        response += `- New options appear\n`;
        response += `- Perspective is freedom\n\n`;

        response += `From this zoomed-out view, what do you see now?`;

        return response;
      },
    });
  },
};

const whatWillMatterDef: ToolDefinition = {
  id: 'whatWillMatter',
  name: 'What Will Matter',
  description: 'Help identify what will actually matter in the long run',
  domain: 'timeless-perspective',
  tags: ['wisdom', 'priorities', 'meaning'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('whatWillMatter'),
      parameters: z.object({
        decision: z.string().describe('What they are deciding or focused on'),
        stakesFeelLike: z
          .enum(['everything', 'high', 'medium', 'unclear'])
          .describe('How high stakes feel'),
      }),
      execute: async ({ decision, stakesFeelLike }) => {
        getLogger().info({ agentId: ctx.agentId, stakesFeelLike }, 'What will matter');

        let response = `**What Will Actually Matter**\n\n`;
        response += `You're focused on: ${decision}\n`;
        response += `The stakes feel: ${stakesFeelLike}\n\n`;

        if (stakesFeelLike === 'everything') {
          response += `When everything feels like it matters, nothing matters most.\n\n`;
        }

        response += `**What I've learned about what matters:**\n\n`;
        response += `In the end, most people say the same things mattered:\n`;
        response += `- **Relationships**: Who you loved and who loved you\n`;
        response += `- **Growth**: Who you became, not what you achieved\n`;
        response += `- **Contribution**: What you gave, not what you got\n`;
        response += `- **Presence**: The moments you were really there\n`;
        response += `- **Integrity**: Living aligned with your values\n\n`;

        response += `**What rarely matters as much as it felt:**\n`;
        response += `- Being right\n`;
        response += `- Others' opinions\n`;
        response += `- The specific outcomes of most decisions\n`;
        response += `- Temporary setbacks\n`;
        response += `- Things you can't control\n\n`;

        response += `**The question:**\n`;
        response += `Does ${decision} touch the things that matter? Or is it noise that feels like signal?\n\n`;

        response += `What does your heart say actually matters here?`;

        return response;
      },
    });
  },
};

const applySeasonalWisdomDef: ToolDefinition = {
  id: 'applySeasonalWisdom',
  name: 'Apply Seasonal Wisdom',
  description: 'Apply the wisdom of seasons to life circumstances',
  domain: 'timeless-perspective',
  tags: ['wisdom', 'seasons', 'cycles', 'perspective'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('applySeasonalWisdom'),
      parameters: z.object({
        situation: z.string().describe('Their current situation'),
        season: z
          .enum(['winter', 'spring', 'summer', 'fall', 'unsure'])
          .describe('What season of life they are in'),
      }),
      execute: async ({ situation, season }) => {
        getLogger().info({ agentId: ctx.agentId, season }, 'Seasonal wisdom');

        let response = `**Seasonal Wisdom**\n\n`;
        response += `Your situation: ${situation}\n\n`;

        const seasonWisdom = {
          winter: `**You're in winter.**\n\nWinter is not failure. Winter is rest, preparation, dormancy.\n\n- This is the season for going inward\n- Energy is conserved, not spent\n- The work is invisible but real\n- Nothing grows visibly, but roots go deep\n- Spring comes. It always comes.\n\n**What winter asks of you:**\nPatience. Trust. Rest. Reflection. Survival is success.`,
          spring: `**You're in spring.**\n\nSpring is emergence, new beginnings, tender growth.\n\n- This is the season for planting\n- Energy is returning, but things are fragile\n- New things need protection\n- Growth is possible but not guaranteed\n- Not everything planted will bloom—that's okay\n\n**What spring asks of you:**\nHope. Care. Beginning. Protecting what's tender. Patience for growth.`,
          summer: `**You're in summer.**\n\nSummer is abundance, growth, full expression.\n\n- This is the season for doing\n- Energy is high, make the most of it\n- Things are growing—tend them\n- This is when the work shows\n- Enjoy it—summers don't last forever\n\n**What summer asks of you:**\nEffort. Presence. Enjoyment. Making hay while the sun shines.`,
          fall: `**You're in fall.**\n\nFall is harvest, letting go, preparation for what's ending.\n\n- This is the season for completing\n- Gather what you've grown\n- Let go of what's dying—don't force it to live\n- Prepare for what's coming\n- There's beauty in endings\n\n**What fall asks of you:**\nGratitude. Release. Completion. Preparing. Letting go.`,
          unsure: `**You're between seasons.**\n\nTransitions between seasons are disorienting. That's normal.\n\n- Old patterns aren't working\n- New patterns haven't formed\n- This is the in-between space\n- Trust that clarity will come\n- Pay attention to what's emerging\n\n**What transitions ask of you:**\nTrust. Patience. Attention. Letting the new season reveal itself.`,
        };

        response += seasonWisdom[season] + '\n\n';

        response += `The seasons teach: everything has its time. Fighting your season is exhausting. Working with it is wisdom.\n\n`;

        response += `What does your season ask of you right now?`;

        return response;
      },
    });
  },
};

// ============================================================================
// DOMAIN TOOLS COLLECTION
// ============================================================================

const timelessPerspectiveTools: ToolDefinition[] = [
  decadeViewDef,
  thisTooPasses,
  ancientParallelDef,
  zoomOutDef,
  whatWillMatterDef,
  applySeasonalWisdomDef,
];

// ============================================================================
// EXPORTS
// ============================================================================

export const { getToolDefinitions, domain, definitions } = createDomainExport(
  'timeless-perspective',
  timelessPerspectiveTools
);

export default getToolDefinitions;
