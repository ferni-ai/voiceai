/**
 * Quiet Growth Domain Tools
 *
 * Tools for people who want to grow without hustle culture. Anti-optimization.
 * Growth that respects seasons, limits, rest, and humanity.
 *
 * PHILOSOPHY:
 *   Growth doesn't have to be loud, fast, or constant.
 *   Plateaus are integration periods, not failures.
 *   Rest is part of growth, not the absence of it.
 *   "Enough" is a complete word.
 *
 * DOMAIN: quiet-growth
 * SUB-DOMAINS:
 *   Permission - Allowing yourself to rest, pause, maintain
 *   Seasons - Recognizing different seasons call for different things
 *   Pace - Slow, sustainable progress over sprints
 *   Sufficiency - When "enough" is actually perfect
 *   Anti-Comparison - Growing at your own pace
 *
 * TOOLS:
 *   Permission: honorTheRest, celebrateMaintenance, enoughForToday
 *   Seasons: seasonalWisdom, embraceTheWait, winterSeason
 *   Pace: gentleGoals, slowProgress, releaseUrgency
 *   Sufficiency: goodEnough, definingEnough, sufficiencyPractice
 *   Anti-Comparison: compareToYesterday, yourOwnTimeline, releaseComparison
 */

import { createDomainExport } from '../../registry/loader.js';
import type { ToolDefinition, ToolContext, Tool } from '../../registry/types.js';
import { llm } from '@livekit/agents';
import { getLogger } from '../../../utils/safe-logger.js';
import {
  persistKeyMoment,
  persistInsight,
  type ToolCtxWithUserData,
} from '../shared/persistence.js';
import { z } from 'zod';

// ============================================================================
// QUIET GROWTH WISDOM DATABASE
// ============================================================================

/**
 * Wisdom about seasons of growth and rest
 */
const SEASONAL_WISDOM = {
  spring: {
    name: 'Spring Season',
    description: 'Time of new beginnings, fresh energy, planting seeds',
    characteristics: ['Energy returning', 'New ideas emerging', 'Motivation building', 'Ready to start'],
    guidance: 'Spring energy is for planting, not harvesting. Start small. Let things be tender.',
    warning: "Don't try to harvest in spring. Seeds need time.",
  },
  summer: {
    name: 'Summer Season',
    description: 'Time of growth, action, tending what you planted',
    characteristics: ['Full energy', 'Productive', 'Active', 'Visible growth'],
    guidance: 'Summer is for tending. Show up consistently. Growth is happening.',
    warning: "Summer won't last forever. Don't burn out.",
  },
  autumn: {
    name: 'Autumn Season',
    description: 'Time of harvest, gratitude, letting go',
    characteristics: ['Reaping results', 'Reflection', 'Gratitude', 'Releasing'],
    guidance: 'Autumn is for harvesting AND releasing. What needs to fall away?',
    warning: 'Not everything can come with you into winter.',
  },
  winter: {
    name: 'Winter Season',
    description: 'Time of rest, restoration, dormancy, gestation',
    characteristics: ['Low energy', 'Introspection', 'Rest', 'Invisible work'],
    guidance: 'Winter is not failure. It\'s when roots grow deep. Honor the fallow.',
    warning: 'Trying to force spring during winter will exhaust you.',
  },
};

/**
 * Wisdom about plateaus and stagnation
 */
const PLATEAU_WISDOM = [
  {
    reframe: 'Integration Period',
    explanation: 'Plateaus are when your brain and body are integrating what you learned. Growth is happening below the surface.',
    metaphor: 'Like a plant sending roots deeper before the next growth spurt.',
  },
  {
    reframe: 'Consolidation Phase',
    explanation: 'Your skills are moving from conscious effort to unconscious competence. This takes time and plateau.',
    metaphor: 'Like muscle memory forming - the moves have to become automatic.',
  },
  {
    reframe: 'Testing Ground',
    explanation: "Plateaus test whether you'll stick with something when progress isn't visible. This IS the work.",
    metaphor: 'Like a seed underground - you can\'t see growth, but something is happening.',
  },
  {
    reframe: 'Maintenance Achievement',
    explanation: 'Holding steady at a level IS an achievement. Not sliding backward is progress.',
    metaphor: 'Like treading water - you\'re not moving forward, but you\'re not sinking either.',
  },
];

/**
 * Sufficiency affirmations
 */
const SUFFICIENCY_AFFIRMATIONS = [
  {
    affirmation: 'I have done enough today.',
    context: 'End of day - permission to stop',
  },
  {
    affirmation: 'I am enough, right now, as I am.',
    context: 'Self-worth not tied to productivity',
  },
  {
    affirmation: 'This is enough progress for this season.',
    context: 'When progress feels slow',
  },
  {
    affirmation: 'My worth is not measured by my output.',
    context: 'Decoupling self-worth from productivity',
  },
  {
    affirmation: 'Rest is productive. I am allowed to rest.',
    context: 'Permission to rest',
  },
  {
    affirmation: 'Good enough IS good enough.',
    context: 'Releasing perfectionism',
  },
  {
    affirmation: 'I am on my own timeline. Comparison is theft.',
    context: 'Releasing comparison',
  },
];

/**
 * Anti-hustle reminders
 */
const ANTI_HUSTLE_WISDOM = [
  {
    belief: 'I should be further along by now.',
    reframe: 'You are exactly where your journey has taken you. "Further along" compared to who? An imaginary version of you with a different life?',
  },
  {
    belief: 'I\'m wasting time by resting.',
    reframe: 'Rest is not a waste - it\'s an investment. You cannot pour from an empty cup. Your nervous system needs recovery.',
  },
  {
    belief: 'I should be doing more.',
    reframe: 'Says who? What if what you\'re doing is exactly right for this season of your life?',
  },
  {
    belief: 'Everyone else is ahead of me.',
    reframe: 'You\'re comparing your behind-the-scenes to their highlight reel. Their timeline is not your timeline.',
  },
  {
    belief: 'If I slow down, I\'ll fall behind.',
    reframe: 'Behind what? There is no race. There is no finish line. There is only your one wild and precious life.',
  },
  {
    belief: 'I should always be growing.',
    reframe: 'Even trees have seasons. Not everything grows all year. Winter is part of the cycle.',
  },
];

// ============================================================================
// PERMISSION TOOLS
// ============================================================================

const honorTheRestDef: ToolDefinition = {
  id: 'honorTheRest',
  name: 'Honor the Rest',
  description: 'Give permission for fallow seasons, rest, and recovery',
  domain: 'quiet-growth',
  additionalDomains: ['presence', 'self-compassion', 'meaning'],
  tags: ['quiet-growth', 'rest', 'permission', 'self-compassion'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: 'When user is tired, burned out, or feels guilty for resting. Give genuine permission. Rest is not laziness.',
      parameters: z.object({
        whyResting: z.string().describe('Why they need or want to rest'),
        howLong: z.string().optional().describe('How long they\'ve been pushing'),
        guilt: z.string().optional().describe('Any guilt they feel about resting'),
      }),
      execute: async ({ whyResting, howLong, guilt }) => {
        getLogger().info({ agentId: ctx.agentId }, 'Honoring the rest');

        let response = `**Permission Granted**\n\n`;

        response += `You need to rest${whyResting ? ` because ${whyResting}` : ''}. `;
        response += `That's not weakness - that's wisdom.\n\n`;

        if (howLong) {
          response += `You've been pushing for ${howLong}. Your body and mind are asking for recovery. Listen to them.\n\n`;
        }

        if (guilt) {
          response += `The guilt you feel? That's hustle culture talking. Rest is not a reward you earn - it's a necessity you honor.\n\n`;
        }

        response += `**Remember:**\n`;
        response += `- Even fields need to lie fallow to produce good harvests\n`;
        response += `- Your worth is not measured by your productivity\n`;
        response += `- Rest is part of growth, not the absence of it\n\n`;

        response += `What does rest look like for you right now? Not what you *should* do - what would actually restore you?`;

        return response;
      },
    });
  },
};

const celebrateMaintenanceDef: ToolDefinition = {
  id: 'celebrateMaintenance',
  name: 'Celebrate Maintenance',
  description: 'Acknowledge holding steady as an achievement',
  domain: 'quiet-growth',
  additionalDomains: ['meaning', 'proactive'],
  tags: ['quiet-growth', 'maintenance', 'celebration', 'achievement'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: 'For celebrating maintenance - holding steady without progress. Not falling back IS progress.',
      parameters: z.object({
        whatMaintaining: z.string().describe('What they\'re maintaining/holding steady'),
        howLong: z.string().optional().describe('How long they\'ve maintained'),
        feelingStuck: z.boolean().optional().describe('Whether they feel stuck'),
      }),
      execute: async ({ whatMaintaining, howLong, feelingStuck }) => {
        getLogger().info({ agentId: ctx.agentId }, 'Celebrating maintenance');

        let response = `**Maintenance is Achievement**\n\n`;

        response += `You're maintaining ${whatMaintaining}`;
        if (howLong) response += ` for ${howLong}`;
        response += `. That's not nothing - that's EVERYTHING.\n\n`;

        if (feelingStuck) {
          response += `I know it might feel like you're stuck. But here's what I see:\n\n`;
          response += `**You haven't fallen back.** That's not guaranteed. That's not easy. That's an achievement.\n\n`;
        }

        response += `In a world obsessed with "more," you are holding steady. That takes:\n`;
        response += `- Discipline (showing up even without visible progress)\n`;
        response += `- Patience (trusting the process)\n`;
        response += `- Resilience (not giving up when growth isn't visible)\n\n`;

        response += `Maintenance IS progress. You're consolidating. You're integrating. You're building the foundation for what comes next.\n\n`;

        response += `What would it feel like to be proud of holding steady?`;

        return response;
      },
    });
  },
};

const enoughForTodayDef: ToolDefinition = {
  id: 'enoughForToday',
  name: 'Enough for Today',
  description: 'Define and honor what\'s "enough" for today',
  domain: 'quiet-growth',
  additionalDomains: ['presence', 'self-compassion'],
  tags: ['quiet-growth', 'sufficiency', 'boundaries', 'daily'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: 'Help user define what "enough" means for today and give permission to stop there.',
      parameters: z.object({
        whatDone: z.string().optional().describe('What they\'ve already done today'),
        whatRemains: z.string().optional().describe('What feels undone'),
        energy: z.enum(['depleted', 'low', 'moderate', 'good', 'high']).optional(),
      }),
      execute: async ({ whatDone, whatRemains, energy }) => {
        getLogger().info({ agentId: ctx.agentId }, 'Defining enough for today');

        let response = `**What is "Enough" for Today?**\n\n`;

        if (whatDone) {
          response += `You've already done: ${whatDone}\n\n`;
          response += `Let me say that back to you: *You've already done those things.* That's real. That counts.\n\n`;
        }

        if (whatRemains) {
          response += `There's always more that could be done. The list never ends. But here's the question:\n\n`;
          response += `**Does it need to be done TODAY? By YOU? At the cost of your wellbeing?**\n\n`;
        }

        if (energy === 'depleted' || energy === 'low') {
          response += `Your energy is ${energy}. That's data. When the gas tank is low, you don't keep driving - you refuel.\n\n`;
        }

        // Pick a random sufficiency affirmation
        const affirmation = SUFFICIENCY_AFFIRMATIONS[Math.floor(Math.random() * SUFFICIENCY_AFFIRMATIONS.length)];
        response += `**Today's permission:**\n`;
        response += `*${affirmation.affirmation}*\n\n`;

        response += `What would feel complete enough that you could rest without guilt?`;

        return response;
      },
    });
  },
};

// ============================================================================
// SEASONS TOOLS
// ============================================================================

const seasonalWisdomDef: ToolDefinition = {
  id: 'seasonalWisdom',
  name: 'Seasonal Wisdom',
  description: 'Identify what season of growth they\'re in',
  domain: 'quiet-growth',
  additionalDomains: ['meaning', 'life-transitions'],
  tags: ['quiet-growth', 'seasons', 'cycles', 'wisdom'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: 'Help user identify what season of growth/rest they\'re in and what that season requires.',
      parameters: z.object({
        currentEnergy: z.enum(['dormant', 'emerging', 'full', 'declining']),
        whatFeelsTrue: z.string().optional().describe('What their inner state feels like'),
        whatTheyrePushing: z.string().optional().describe('What they\'re trying to force'),
      }),
      execute: async ({ currentEnergy, whatFeelsTrue, whatTheyrePushing }) => {
        getLogger().info({ agentId: ctx.agentId }, 'Exploring seasonal wisdom');

        // Map energy to season
        const seasonMap = {
          dormant: 'winter',
          emerging: 'spring',
          full: 'summer',
          declining: 'autumn',
        };

        const season = SEASONAL_WISDOM[seasonMap[currentEnergy] as keyof typeof SEASONAL_WISDOM];

        let response = `**Your Season: ${season.name}**\n\n`;

        response += `${season.description}\n\n`;

        response += `**Signs of this season:**\n`;
        season.characteristics.forEach((c) => {
          response += `- ${c}\n`;
        });
        response += `\n`;

        if (whatFeelsTrue) {
          response += `What you described - "${whatFeelsTrue}" - sounds like ${season.name.toLowerCase()} energy.\n\n`;
        }

        response += `**Seasonal guidance:**\n`;
        response += `${season.guidance}\n\n`;

        if (whatTheyrePushing) {
          response += `⚠️ **Caution:**\n`;
          response += `You mentioned trying to ${whatTheyrePushing}. ${season.warning}\n\n`;
        }

        response += `What would it look like to honor this season instead of fighting it?`;

        return response;
      },
    });
  },
};

const winterSeasonDef: ToolDefinition = {
  id: 'winterSeason',
  name: 'Winter Season',
  description: 'Support during fallow, dormant, or winter periods',
  domain: 'quiet-growth',
  additionalDomains: ['grief', 'presence', 'self-compassion'],
  tags: ['quiet-growth', 'winter', 'dormancy', 'rest'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: 'For when user is in a winter season - low energy, fallow, dormant. Normalize and honor it.',
      parameters: z.object({
        howItFeels: z.string().describe('What the winter season feels like'),
        howLong: z.string().optional().describe('How long they\'ve been in winter'),
        pressureToGrow: z.boolean().optional().describe('Whether they feel pressure to be in spring'),
      }),
      execute: async ({ howItFeels, howLong, pressureToGrow }) => {
        getLogger().info({ agentId: ctx.agentId }, 'Supporting winter season');

        let response = `**Honoring Your Winter**\n\n`;

        response += `You described it as: "${howItFeels}"\n\n`;

        response += `I hear you. Winter is hard - especially in a culture that only celebrates spring and summer energy.\n\n`;

        if (howLong) {
          response += `You've been in this season for ${howLong}. That can feel long. But winters have their own timeline.\n\n`;
        }

        if (pressureToGrow) {
          response += `The pressure to bloom? That's not nature - that's capitalism. Trees don't apologize for losing their leaves.\n\n`;
        }

        response += `**What winter is for:**\n`;
        response += `- Rest and restoration\n`;
        response += `- Deep roots growing where you can't see them\n`;
        response += `- Composting old growth into future fuel\n`;
        response += `- Dreaming, gestating, incubating\n`;
        response += `- Survival itself\n\n`;

        response += `**What winter is NOT:**\n`;
        response += `- A sign of failure\n`;
        response += `- Permanent\n`;
        response += `- Something to push through\n`;
        response += `- Proof that you're broken\n\n`;

        response += `Spring will come. It always does. But it comes in its own time, not when we demand it.\n\n`;

        response += `What do you need to survive this winter? Not thrive - just survive. That's enough.`;

        return response;
      },
    });
  },
};

// ============================================================================
// PACE TOOLS
// ============================================================================

const gentleGoalsDef: ToolDefinition = {
  id: 'gentleGoals',
  name: 'Gentle Goals',
  description: 'Set goals that allow for humanity',
  domain: 'quiet-growth',
  additionalDomains: ['proactive', 'meaning'],
  tags: ['quiet-growth', 'goals', 'gentle', 'sustainable'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: 'Help user set goals that are ambitious enough to matter but gentle enough to be sustainable.',
      parameters: z.object({
        goalArea: z.string().describe('What area they want to grow in'),
        currentPush: z.string().optional().describe('How hard they\'ve been pushing'),
        whatWouldBeGentle: z.string().optional().describe('What a gentler version might look like'),
      }),
      execute: async ({ goalArea, currentPush, whatWouldBeGentle }) => {
        getLogger().info({ agentId: ctx.agentId }, 'Setting gentle goals');

        let response = `**Gentle Goals in ${goalArea}**\n\n`;

        if (currentPush) {
          response += `You've been pushing: ${currentPush}\n\n`;
          response += `Let's find a pace that's sustainable, not just possible.\n\n`;
        }

        response += `**Gentle Goal Framework:**\n\n`;

        response += `1. **What's the minimum?** What's the smallest version that still counts?\n`;
        response += `2. **What's sustainable?** What could you do on your worst day?\n`;
        response += `3. **What's the direction?** Which way are you pointed? (Not how fast)\n`;
        response += `4. **What's allowed?** Can you skip days? Have bad weeks? Be human?\n\n`;

        if (whatWouldBeGentle) {
          response += `You mentioned ${whatWouldBeGentle} might be gentler. That sounds wise.\n\n`;
        }

        response += `**The gentle goal test:**\n`;
        response += `- Does this goal allow for bad days?\n`;
        response += `- Does this goal account for your whole life, not just this one thing?\n`;
        response += `- Does this goal feel like care or punishment?\n`;
        response += `- Would you set this goal for someone you love?\n\n`;

        response += `What would a goal look like that you'd actually want to keep?`;

        return response;
      },
    });
  },
};

const releaseUrgencyDef: ToolDefinition = {
  id: 'releaseUrgency',
  name: 'Release Urgency',
  description: 'Let go of artificial urgency and hustle',
  domain: 'quiet-growth',
  additionalDomains: ['presence', 'meaning'],
  tags: ['quiet-growth', 'urgency', 'anti-hustle', 'pace'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: 'Help user release artificial urgency. Question the "I should be further along" narrative.',
      parameters: z.object({
        urgencySource: z.string().describe('What feels urgent'),
        deadline: z.string().optional().describe('Any real vs imagined deadline'),
        comparison: z.string().optional().describe('Who or what they\'re comparing to'),
      }),
      execute: async ({ urgencySource, deadline, comparison }) => {
        getLogger().info({ agentId: ctx.agentId }, 'Releasing urgency');

        let response = `**Questioning the Urgency**\n\n`;

        response += `You feel urgency about: ${urgencySource}\n\n`;

        response += `Let's examine this urgency:\n\n`;

        if (deadline) {
          response += `**The deadline:** ${deadline}\n`;
          response += `Is this deadline real? Who set it? What actually happens if it passes?\n\n`;
        }

        if (comparison) {
          response += `**The comparison:** ${comparison}\n`;
          response += `Are you comparing your whole life to someone's highlight reel? Their timeline is not your timeline.\n\n`;
        }

        // Find relevant anti-hustle wisdom
        const wisdom = ANTI_HUSTLE_WISDOM[Math.floor(Math.random() * ANTI_HUSTLE_WISDOM.length)];
        response += `**Reframe:**\n`;
        response += `If the belief is: "${wisdom.belief}"\n`;
        response += `The truth might be: "${wisdom.reframe}"\n\n`;

        response += `**Questions to ask:**\n`;
        response += `- What's the actual worst case if I slow down?\n`;
        response += `- Who benefits from my urgency? (Not me, usually)\n`;
        response += `- What would "enough" look like here?\n`;
        response += `- In 5 years, will this urgency matter?\n\n`;

        response += `What would change if you released the urgency and trusted your own timing?`;

        return response;
      },
    });
  },
};

// ============================================================================
// SUFFICIENCY TOOLS
// ============================================================================

const goodEnoughDef: ToolDefinition = {
  id: 'goodEnough',
  name: 'Good Enough',
  description: 'Celebrate good enough as a valid endpoint',
  domain: 'quiet-growth',
  additionalDomains: ['decisions', 'self-compassion'],
  tags: ['quiet-growth', 'sufficiency', 'perfectionism', 'completion'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: 'Help user see that "good enough" is a valid, wise choice - not settling.',
      parameters: z.object({
        whatConsidering: z.string().describe('What they\'re considering calling "good enough"'),
        perfectionistPressure: z.string().optional().describe('The voice saying it should be better'),
        costOfMore: z.string().optional().describe('What more effort would cost them'),
      }),
      execute: async ({ whatConsidering, perfectionistPressure, costOfMore }) => {
        getLogger().info({ agentId: ctx.agentId }, 'Affirming good enough');

        let response = `**Good Enough IS Good Enough**\n\n`;

        response += `You're considering calling this good enough: ${whatConsidering}\n\n`;

        if (perfectionistPressure) {
          response += `The voice saying it should be better: "${perfectionistPressure}"\n`;
          response += `Whose voice is that? Is it helping you or haunting you?\n\n`;
        }

        if (costOfMore) {
          response += `The cost of more: ${costOfMore}\n`;
          response += `That cost is real. It's not free.\n\n`;
        }

        response += `**The case for good enough:**\n`;
        response += `- Perfect is the enemy of done\n`;
        response += `- Diminishing returns are real - the last 10% takes 50% of the effort\n`;
        response += `- Your standards may be higher than necessary\n`;
        response += `- Good enough NOW beats perfect NEVER\n`;
        response += `- The energy saved can go to other important things\n\n`;

        response += `**Good enough is not:**\n`;
        response += `- Laziness (lazy people don't worry about this)\n`;
        response += `- Giving up (you completed something)\n`;
        response += `- Settling (you made a conscious choice)\n\n`;

        response += `Good enough is wisdom. It's resource allocation. It's completion.\n\n`;

        response += `What would it feel like to call this done?`;

        return response;
      },
    });
  },
};

// ============================================================================
// ANTI-COMPARISON TOOLS
// ============================================================================

const compareToYesterdayDef: ToolDefinition = {
  id: 'compareToYesterday',
  name: 'Compare to Yesterday',
  description: 'Redirect comparison to self instead of others',
  domain: 'quiet-growth',
  additionalDomains: ['meaning', 'proactive'],
  tags: ['quiet-growth', 'comparison', 'self-growth', 'progress'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: 'Help user compare to their past self, not others. The only valid comparison.',
      parameters: z.object({
        whoComparing: z.string().optional().describe('Who they\'re comparing themselves to'),
        timeframe: z.enum(['week', 'month', 'year', 'five-years']).optional(),
        areaOfLife: z.string().describe('What area they\'re evaluating'),
      }),
      execute: async ({ whoComparing, timeframe, areaOfLife }) => {
        getLogger().info({ agentId: ctx.agentId }, 'Redirecting comparison to self');

        let response = `**The Only Valid Comparison: You vs. Past You**\n\n`;

        if (whoComparing) {
          response += `You mentioned comparing to ${whoComparing}.\n`;
          response += `Their life is not your life. Their timeline is not your timeline. Their story is not your story.\n\n`;
        }

        const period = timeframe || 'year';
        response += `**Let's look at you vs. you from a ${period} ago:**\n\n`;

        response += `In ${areaOfLife}:\n`;
        response += `- What do you know now that you didn't then?\n`;
        response += `- What can you do now that you couldn't then?\n`;
        response += `- What have you survived that you weren't sure you would?\n`;
        response += `- What have you let go of that was holding you back?\n`;
        response += `- How has your relationship with yourself changed?\n\n`;

        response += `**The truth about comparison:**\n`;
        response += `- You're comparing your behind-the-scenes to their highlight reel\n`;
        response += `- You don't know what they've sacrificed or lost\n`;
        response += `- Their definition of success might not even be yours\n`;
        response += `- Comparison is theft - it steals your joy and distorts reality\n\n`;

        response += `When you compare to yesterday's you, what growth do you see?`;

        return response;
      },
    });
  },
};

const embracePlateauDef: ToolDefinition = {
  id: 'embracePlateau',
  name: 'Embrace Plateau',
  description: 'Reframe plateaus as integration periods',
  domain: 'quiet-growth',
  additionalDomains: ['meaning', 'self-compassion'],
  tags: ['quiet-growth', 'plateau', 'integration', 'patience'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: 'Help user reframe a plateau as a necessary integration period, not failure.',
      parameters: z.object({
        plateauArea: z.string().describe('Where they\'re experiencing a plateau'),
        howLong: z.string().optional().describe('How long the plateau has lasted'),
        frustration: z.string().optional().describe('What frustration they feel'),
      }),
      execute: async ({ plateauArea, howLong, frustration }) => {
        getLogger().info({ agentId: ctx.agentId }, 'Embracing plateau');

        // Pick relevant plateau wisdom
        const wisdom = PLATEAU_WISDOM[Math.floor(Math.random() * PLATEAU_WISDOM.length)];

        let response = `**Reframing Your Plateau**\n\n`;

        response += `You're in a plateau with ${plateauArea}`;
        if (howLong) response += ` for ${howLong}`;
        response += `.\n\n`;

        if (frustration) {
          response += `The frustration makes sense: "${frustration}"\n`;
          response += `Visible progress is satisfying. Its absence can feel like failure. But it's not.\n\n`;
        }

        response += `**Reframe: ${wisdom.reframe}**\n`;
        response += `${wisdom.explanation}\n`;
        response += `*${wisdom.metaphor}*\n\n`;

        response += `**What's actually happening:**\n`;
        response += `- Your brain is automating what you've learned\n`;
        response += `- Skills are moving from conscious to unconscious\n`;
        response += `- You're building a foundation for the next level\n`;
        response += `- Consistency during plateaus is what separates growth from dabbling\n\n`;

        response += `**The plateau paradox:**\n`;
        response += `The people who break through plateaus are the ones who kept going during them. `;
        response += `If you're still showing up, you're still growing - even if it doesn't look like it.\n\n`;

        response += `What would it feel like to trust that something is happening beneath the surface?`;

        return response;
      },
    });
  },
};

// ============================================================================
// DOMAIN EXPORT
// ============================================================================

const quietGrowthTools: ToolDefinition[] = [
  // Permission
  honorTheRestDef,
  celebrateMaintenanceDef,
  enoughForTodayDef,
  // Seasons
  seasonalWisdomDef,
  winterSeasonDef,
  // Pace
  gentleGoalsDef,
  releaseUrgencyDef,
  // Sufficiency
  goodEnoughDef,
  // Anti-Comparison
  compareToYesterdayDef,
  embracePlateauDef,
];

export const { getToolDefinitions, domain, definitions } = createDomainExport(
  'quiet-growth',
  quietGrowthTools
);

export default getToolDefinitions;
