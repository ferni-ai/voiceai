/**
 * Second Chances Domain Tools
 *
 * Tools for supporting fresh starts, reinvention, and rebuilding after
 * setbacks, failures, or life disruptions. This domain embodies Ferni's
 * core belief that "second chances are sacred."
 *
 * PHILOSOPHY:
 *   Second chances aren't about erasing the past or pretending failure
 *   didn't happen. They're about the courage to begin again, the grace
 *   to learn from what was, and the hope to build something new.
 *
 * DOMAIN: second-chances
 * SUB-DOMAINS:
 *   Career Reinvention - Starting over professionally after setbacks
 *   Relationship Rebuilding - Reconnection, repair, and new beginnings
 *   Financial Fresh Starts - Rebuilding after financial hardship
 *   Identity Reconstruction - Becoming someone new after major change
 *   Return to Life - Coming back after illness, caregiving, or absence
 *   Personal Redemption - Making amends, self-forgiveness, moving forward
 *
 * TOOLS:
 *   Assessment: assessReadinessForChange, identifyWhatToKeep, acknowledgeWhatWas
 *   Story Work: reframeNarrative, findTheLessons, writeNewChapter
 *   Planning: defineFirstStep, createComebackPlan, identifySupports
 *   Emotional: processGriefForWhatWas, buildCourageForWhatNext, celebrateTinyWins
 *   Companion: checkInOnJourney, holdHopeWhenCant, remindOfProgress
 */

import { createDomainExport } from '../../registry/loader.js';
import type { ToolDefinition, ToolContext, Tool } from '../../registry/types.js';
import { llm } from '@livekit/agents';
import { getLogger } from '../../../utils/safe-logger.js';
import {
  persistTrackedItem,
  persistKeyMoment,
  type ToolCtxWithUserData,
} from '../shared/persistence.js';
import { trackToolUsage, isLifeCoachAnalyticsEnabled } from '../shared/index.js';
import { z } from 'zod';

// ============================================================================
// SECOND CHANCES WISDOM DATABASE
// ============================================================================

/**
 * Stories of real comebacks and reinventions to inspire and normalize
 * the second chance journey.
 */
const COMEBACK_STORIES = {
  career: [
    {
      name: 'Vera Wang',
      story: 'Failed to make the Olympic figure skating team, became a fashion icon at 40.',
      lesson: 'Sometimes rejection redirects us to our true path.',
    },
    {
      name: 'Colonel Sanders',
      story: 'Started KFC at 65 after his restaurant failed and he lived on Social Security.',
      lesson: "It's never too late to begin again.",
    },
    {
      name: 'J.K. Rowling',
      story: 'Single mom on welfare, rejected by 12 publishers before Harry Potter.',
      lesson: 'Rock bottom can become the foundation for something extraordinary.',
    },
    {
      name: 'Steve Jobs',
      story:
        'Fired from Apple, the company he founded. Returned to make it the most valuable company in the world.',
      lesson: 'Getting fired can be the best thing that never happened to you.',
    },
  ],
  personal: [
    {
      name: 'Nelson Mandela',
      story: '27 years in prison, emerged to lead a nation toward reconciliation.',
      lesson: 'Time in the wilderness can prepare you for your purpose.',
    },
    {
      name: 'Maya Angelou',
      story:
        'Survived trauma and poverty to become one of the most influential voices of our time.',
      lesson: 'Our wounds can become our wisdom.',
    },
  ],
  financial: [
    {
      name: 'Walt Disney',
      story:
        'Went bankrupt with his first animation company. Mickey Mouse was born from that failure.',
      lesson: 'Financial failure is not the end of the story.',
    },
    {
      name: 'Abraham Lincoln',
      story:
        'Failed in business twice, went bankrupt, lost multiple elections before becoming president.',
      lesson: 'Each setback can be setup for something greater.',
    },
  ],
};

/**
 * Quotes about second chances, resilience, and beginning again.
 */
const SECOND_CHANCE_WISDOM = [
  {
    quote: "It's never too late to be what you might have been.",
    attribution: 'George Eliot',
    context: 'starting-over',
  },
  {
    quote: 'The only real mistake is the one from which we learn nothing.',
    attribution: 'Henry Ford',
    context: 'failure',
  },
  {
    quote: 'Rock bottom became the solid foundation on which I rebuilt my life.',
    attribution: 'J.K. Rowling',
    context: 'rock-bottom',
  },
  {
    quote:
      "You can't go back and change the beginning, but you can start where you are and change the ending.",
    attribution: 'C.S. Lewis',
    context: 'starting-over',
  },
  {
    quote: 'Every saint has a past, and every sinner has a future.',
    attribution: 'Oscar Wilde',
    context: 'redemption',
  },
  {
    quote: 'The wound is the place where the Light enters you.',
    attribution: 'Rumi',
    context: 'healing',
  },
  {
    quote: 'We are not defined by our failures but by how we rise after falling.',
    attribution: 'Unknown',
    context: 'resilience',
  },
  {
    quote: "Sometimes the hardest part isn't letting go but learning to start over.",
    attribution: 'Nicole Sobon',
    context: 'grief',
  },
  {
    quote:
      'Courage doesn\'t always roar. Sometimes courage is the quiet voice at the end of the day saying, "I will try again tomorrow."',
    attribution: 'Mary Anne Radmacher',
    context: 'courage',
  },
  {
    quote: 'Your net worth is not your self-worth.',
    attribution: 'Ferni',
    context: 'financial',
  },
];

/**
 * Stages of the second chance journey - not linear, but recognizable.
 */
const SECOND_CHANCE_STAGES = {
  shock: {
    name: 'Shock & Disorientation',
    description: 'The immediate aftermath. Numbness, disbelief, "how did I get here?"',
    needs: ['Space to process', 'Basic self-care', 'No major decisions yet'],
    ferniApproach: 'Just be present. No advice. Witness their experience.',
  },
  grief: {
    name: 'Grieving What Was',
    description: "Mourning the loss - the identity, the plan, the future that won't happen.",
    needs: ['Permission to grieve', 'Validation that loss is real', 'Time'],
    ferniApproach: "Hold space for grief. Don't rush to silver linings.",
  },
  reckoning: {
    name: 'Honest Reckoning',
    description:
      'Looking clearly at what happened. Taking appropriate responsibility without excessive self-blame.',
    needs: ['Honest reflection', 'Balanced perspective', 'Self-compassion'],
    ferniApproach: 'Help them see clearly without judgment.',
  },
  glimmers: {
    name: 'Glimmers of Possibility',
    description: 'First moments of imagining something new. Tentative hope.',
    needs: ['Permission to hope', 'Small experiments', 'Support for vulnerability'],
    ferniApproach: 'Nurture hope without forcing positivity.',
  },
  rebuilding: {
    name: 'Active Rebuilding',
    description:
      'Taking concrete steps. Building new identity, skills, relationships, or finances.',
    needs: ['Practical support', 'Accountability', 'Celebration of small wins'],
    ferniApproach: 'Walk alongside. Celebrate every step.',
  },
  integration: {
    name: 'Integration & Meaning',
    description: 'Making sense of the journey. The setback becomes part of a larger story.',
    needs: ['Reflection time', 'Narrative work', 'Giving back'],
    ferniApproach: 'Help them find meaning, share their wisdom.',
  },
};

/**
 * Types of second chances people commonly need.
 */
const SECOND_CHANCE_TYPES = {
  career: {
    name: 'Career Reinvention',
    triggers: [
      'Job loss',
      'Burnout',
      'Industry change',
      'Career gap',
      'Professional failure',
      'Returning after caregiving',
    ],
    uniqueChallenges: [
      'Identity tied to work',
      'Financial pressure',
      'Age discrimination fears',
      'Skill gaps',
    ],
    ferniReminder: "You are not your job title. Your worth isn't determined by your LinkedIn.",
  },
  relationship: {
    name: 'Relationship Rebuilding',
    triggers: ['Divorce', 'Estrangement', 'Betrayal', 'Lost friendships', 'Family ruptures'],
    uniqueChallenges: [
      'Trust rebuilding',
      'Grief for the relationship',
      'Identity as partner/friend',
      'Loneliness',
    ],
    ferniReminder: 'Some relationships end. Some heal. Both can lead to growth.',
  },
  financial: {
    name: 'Financial Fresh Start',
    triggers: [
      'Bankruptcy',
      'Debt spiral',
      'Job loss',
      'Medical bills',
      'Business failure',
      'Poor decisions',
    ],
    uniqueChallenges: ['Shame', 'Practical constraints', 'Trust in self', 'Starting from zero'],
    ferniReminder: 'Your net worth is not your self-worth. Money can be rebuilt.',
  },
  identity: {
    name: 'Identity Reconstruction',
    triggers: [
      'Divorce',
      'Empty nest',
      'Retirement',
      'Role loss',
      'Faith transition',
      'Coming out',
    ],
    uniqueChallenges: ['Who am I now?', 'Building new sense of self', "Others' expectations"],
    ferniReminder: "Becoming someone new doesn't erase who you were. It builds on it.",
  },
  return: {
    name: 'Return to Life',
    triggers: [
      'Serious illness',
      'Long caregiving',
      'Incarceration',
      'Addiction recovery',
      'Mental health crisis',
    ],
    uniqueChallenges: [
      'World moved on',
      'Reentry anxiety',
      'Explaining gaps',
      'Rebuilding routines',
    ],
    ferniReminder: 'You survived something hard. That took strength. Use that strength now.',
  },
  redemption: {
    name: 'Personal Redemption',
    triggers: ['Moral failure', 'Hurt others', 'Addiction', 'Broken trust', 'Public shame'],
    uniqueChallenges: ['Self-forgiveness', 'Making amends', 'Earning trust', 'Living with regret'],
    ferniReminder: "You are not the worst thing you've ever done. What you do next matters.",
  },
};

// ============================================================================
// ASSESSMENT TOOLS
// ============================================================================

const assessReadinessForChangeDef: ToolDefinition = {
  id: 'assessReadinessForChange',
  name: 'Assess Readiness for Change',
  description: 'Evaluate where someone is in their readiness for a fresh start',
  domain: 'second-chances',
  additionalDomains: ['life-transitions', 'grief', 'meaning'], // Fresh starts involve transitions, grief, and finding meaning
  tags: ['second-chances', 'assessment', 'readiness', 'change'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description:
        'Help user assess their readiness for making a significant change or fresh start. Meet them where they are without pushing.',
      parameters: z.object({
        changeType: z
          .enum([
            'career',
            'relationship',
            'financial',
            'identity',
            'return',
            'redemption',
            'general',
          ])
          .describe("What kind of second chance they're considering"),
        whatHappened: z
          .string()
          .optional()
          .describe('Brief description of what led to needing a fresh start'),
        howLongAgo: z.string().optional().describe('How long since the triggering event'),
        currentFeeling: z
          .enum(['stuck', 'scared', 'hopeful', 'numb', 'angry', 'exhausted', 'ready', 'unsure'])
          .optional(),
      }),
      execute: async ({ changeType, whatHappened, howLongAgo, currentFeeling }) => {
        getLogger().info(
          { agentId: ctx.agentId, changeType, currentFeeling },
          'Assessing readiness for change'
        );

        const typeInfo =
          SECOND_CHANCE_TYPES[changeType as keyof typeof SECOND_CHANCE_TYPES] ||
          SECOND_CHANCE_TYPES.career;

        let response = `**Where You Are Right Now**\n\n`;

        if (whatHappened) {
          response += `What brought you here: ${whatHappened}\n`;
        }
        if (howLongAgo) {
          response += `Timeline: ${howLongAgo}\n`;
        }
        if (currentFeeling) {
          response += `Current feeling: ${currentFeeling}\n`;
        }
        response += `\n---\n\n`;

        // Validate wherever they are
        response += `First, let me say: **wherever you are right now is okay.**\n\n`;

        if (currentFeeling === 'numb' || currentFeeling === 'stuck') {
          response += `Feeling ${currentFeeling} after something hard isn't weakness—it's a normal response to overwhelm. `;
          response += `You don't have to force yourself to feel ready.\n\n`;
        } else if (currentFeeling === 'scared') {
          response += `Fear makes sense. You're contemplating something significant. `;
          response += `Courage isn't the absence of fear—it's moving forward with the fear.\n\n`;
        } else if (currentFeeling === 'angry') {
          response += `Anger often means something matters to you. It can be fuel for change `;
          response += `once it's processed. Let's not rush past it.\n\n`;
        }

        // Show stages without judgment
        response += `**The Journey of Starting Over**\n\n`;
        response += `Most people move through stages (not linearly—more like spiraling through):\n\n`;

        Object.values(SECOND_CHANCE_STAGES).forEach((stage, index) => {
          response += `${index + 1}. **${stage.name}**\n`;
          response += `   ${stage.description}\n\n`;
        });

        response += `---\n\n`;
        response += `**Reflection questions:**\n\n`;
        response += `- Have you had space to grieve what was lost? (Not "gotten over it"—grieved it.)\n`;
        response += `- What small thing feels possible right now? (Not the whole change—one step.)\n`;
        response += `- What support do you have? What support do you need?\n\n`;

        // Type-specific wisdom
        response += `---\n\n`;
        response += `_Ferni's reminder for ${typeInfo.name.toLowerCase()}:_\n`;
        response += `> "${typeInfo.ferniReminder}"\n\n`;

        response += `Where does this land for you? I'm not trying to push you anywhere—just understand where you are.`;

        return response;
      },
    });
  },
};

const identifyWhatToKeepDef: ToolDefinition = {
  id: 'identifyWhatToKeep',
  name: 'Identify What to Keep',
  description: 'Discover what to carry forward from the past into the new chapter',
  domain: 'second-chances',
  tags: ['second-chances', 'reflection', 'values', 'identity'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description:
        'Help user identify what valuable things they want to carry forward into their fresh start—skills, lessons, relationships, values.',
      parameters: z.object({
        context: z.string().describe("What situation they're starting over from"),
        feelingAboutPast: z
          .enum(['all-bad', 'mixed', 'grateful-despite-pain', 'unsure'])
          .optional(),
      }),
      execute: async ({ context, feelingAboutPast }) => {
        getLogger().info({ agentId: ctx.agentId, feelingAboutPast }, 'Identifying what to keep');

        let response = `**What to Carry Forward**\n\n`;

        response += `Starting over doesn't mean erasing everything. Even in our hardest chapters, `;
        response += `there are things worth keeping.\n\n`;

        if (feelingAboutPast === 'all-bad') {
          response += `_I hear that right now it might feel like there's nothing worth keeping. `;
          response += `That's okay. Sometimes we need distance before we can see clearly. `;
          response += `This exercise might feel hard—take what's useful, leave what's not._\n\n`;
        }

        response += `**Categories to consider:**\n\n`;

        response += `**1. Skills & Capabilities**\n`;
        response += `What did you learn to do? What are you better at now than before?\n`;
        response += `- Technical skills\n`;
        response += `- People skills\n`;
        response += `- Problem-solving approaches\n`;
        response += `- Things you didn't know you could handle\n\n`;

        response += `**2. Self-Knowledge**\n`;
        response += `What do you know about yourself now that you didn't before?\n`;
        response += `- What you need\n`;
        response += `- What you won't tolerate\n`;
        response += `- What you're capable of\n`;
        response += `- What matters most\n\n`;

        response += `**3. Relationships**\n`;
        response += `Who showed up for you? Who do you want to bring into your next chapter?\n`;
        response += `- People who stayed\n`;
        response += `- New connections made\n`;
        response += `- Relationships worth repairing\n\n`;

        response += `**4. Values Clarified**\n`;
        response += `What do you know now about what really matters to you?\n`;
        response += `Hard times often clarify our values like nothing else.\n\n`;

        response += `**5. Wisdom Earned**\n`;
        response += `What would you tell someone going through what you went through?\n`;
        response += `That wisdom is yours now.\n\n`;

        response += `---\n\n`;
        response += `**One powerful question:**\n`;
        response += `> "What's one thing from this chapter—even this hard chapter—that you're grateful you now know or have?"\n\n`;

        response += `Take your time with this. There's no rush.`;

        return response;
      },
    });
  },
};

const acknowledgeWhatWasDef: ToolDefinition = {
  id: 'acknowledgeWhatWas',
  name: 'Acknowledge What Was',
  description: 'Honor and grieve what was lost before moving forward',
  domain: 'second-chances',
  tags: ['second-chances', 'grief', 'processing', 'loss'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description:
        'Create space for user to acknowledge and grieve what was lost. Moving forward requires honoring what was, not bypassing it.',
      parameters: z.object({
        whatWasLost: z.string().describe('What they lost or are leaving behind'),
        hasHadSpaceToGrieve: z
          .boolean()
          .optional()
          .describe("Whether they've had space to process the loss"),
        rushingToMoveOn: z
          .boolean()
          .optional()
          .describe('Whether they feel pressure to "get over it"'),
      }),
      execute: async ({ whatWasLost, hasHadSpaceToGrieve, rushingToMoveOn }, { ctx: toolCtx }) => {
        getLogger().info({ agentId: ctx.agentId, hasHadSpaceToGrieve }, 'Acknowledging what was');

        // Persist this as a key moment - shared vulnerability about loss
        persistKeyMoment(toolCtx as ToolCtxWithUserData, {
          domain: 'second-chances',
          type: 'shared_vulnerability',
          summary: `Processing grief about: ${whatWasLost.substring(0, 100)}`,
          emotionalWeight: 'heavy',
          topics: ['grief', 'loss', 'second-chances', 'processing'],
        });

        let response = `**Honoring What Was**\n\n`;

        if (rushingToMoveOn) {
          response += `I notice there might be pressure to move on quickly. `;
          response += `Maybe from others, maybe from yourself.\n\n`;
          response += `Here's what I want you to know: **You don't have to rush.**\n\n`;
          response += `Grief doesn't follow a timeline. And trying to skip it usually means `;
          response += `it shows up later, sideways.\n\n`;
        }

        response += `What you lost: **${whatWasLost}**\n\n`;
        response += `---\n\n`;

        response += `**This loss might include:**\n\n`;
        response += `- The **identity** you had ("I was a...")\n`;
        response += `- The **future** you imagined (the plans that won't happen now)\n`;
        response += `- The **relationships** connected to that chapter\n`;
        response += `- The **certainty** you had about how life would go\n`;
        response += `- The **investment** of time, energy, hope\n\n`;

        response += `All of that is real loss. It deserves to be grieved.\n\n`;

        response += `---\n\n`;

        response += `**Permission slip:**\n\n`;
        response += `You are allowed to:\n`;
        response += `- Feel sad about something that ended, even if ending was right\n`;
        response += `- Miss what was, even if you're glad it's over\n`;
        response += `- Take time before you're "ready" to move on\n`;
        response += `- Not have the next thing figured out yet\n`;
        response += `- Grieve and hope at the same time—they can coexist\n\n`;

        response += `---\n\n`;

        // Offer a gentle ritual
        response += `**A small ritual, if it helps:**\n\n`;
        response += `Take a moment to say to yourself (out loud if you can):\n\n`;
        response += `> "I acknowledge what I lost. It mattered. It was real.\n`;
        response += `> I don't have to pretend it doesn't hurt.\n`;
        response += `> And I don't have to stay in this pain forever.\n`;
        response += `> I can grieve AND move forward, in my own time."\n\n`;

        // Find relevant wisdom
        const griefWisdom = SECOND_CHANCE_WISDOM.find((w) => w.context === 'grief');
        if (griefWisdom) {
          response += `---\n\n`;
          response += `> "${griefWisdom.quote}"\n`;
          response += `> — ${griefWisdom.attribution}\n\n`;
        }

        response += `What's the hardest part to let go of?`;

        return response;
      },
    });
  },
};

// ============================================================================
// STORY WORK TOOLS
// ============================================================================

const reframeNarrativeDef: ToolDefinition = {
  id: 'reframeNarrative',
  name: 'Reframe Narrative',
  description: 'Help reshape the story of what happened from victim to author',
  domain: 'second-chances',
  tags: ['second-chances', 'narrative', 'reframe', 'story'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description:
        'Help user reframe their narrative from "this happened TO me" to "this is part of my story." Not toxic positivity—honest meaning-making.',
      parameters: z.object({
        currentStory: z.string().describe('How they currently tell the story of what happened'),
        stuckPoint: z.string().optional().describe('Where they feel stuck in the narrative'),
      }),
      execute: async ({ currentStory, stuckPoint }) => {
        getLogger().info(
          { agentId: ctx.agentId, hasStuckPoint: !!stuckPoint },
          'Reframing narrative'
        );

        let response = `**Rewriting Your Story**\n\n`;

        response += `The story you tell about what happened shapes how you move forward. `;
        response += `This isn't about pretending it was good—it's about finding your agency in it.\n\n`;

        response += `**Your current story:**\n`;
        response += `> "${currentStory}"\n\n`;

        if (stuckPoint) {
          response += `**Where you feel stuck:**\n`;
          response += `> "${stuckPoint}"\n\n`;
        }

        response += `---\n\n`;

        response += `**Narrative shifts to consider:**\n\n`;

        response += `**1. From Victim to Survivor to Author**\n`;
        response += `- **Victim:** "This happened TO me" (no agency)\n`;
        response += `- **Survivor:** "I got THROUGH this" (past-focused agency)\n`;
        response += `- **Author:** "I'm writing what happens NEXT" (future-focused agency)\n\n`;
        response += `All three can be true. Where do you spend most of your mental time?\n\n`;

        response += `**2. From Failure to Data**\n`;
        response += `- "I failed" → "I learned something important about what doesn't work"\n`;
        response += `- "I made terrible decisions" → "I now know more about my patterns"\n`;
        response += `- "I wasted years" → "I gained experience that shaped who I am"\n\n`;

        response += `**3. From Ending to Plot Point**\n`;
        response += `In stories, the darkest moment often comes right before the turn.\n`;
        response += `What if this chapter isn't the ending—it's the setup for what comes next?\n\n`;

        response += `---\n\n`;

        response += `**Try completing these:**\n\n`;
        response += `"What happened was _______, and because of that, I now _______"\n\n`;
        response += `"If I hadn't gone through _______, I wouldn't know _______"\n\n`;
        response += `"The chapter I'm starting is about _______"\n\n`;

        response += `---\n\n`;
        response += `What title would you give this next chapter?`;

        return response;
      },
    });
  },
};

const findTheLessonsDef: ToolDefinition = {
  id: 'findTheLessons',
  name: 'Find the Lessons',
  description: 'Extract wisdom from difficult experiences without toxic positivity',
  domain: 'second-chances',
  tags: ['second-chances', 'lessons', 'wisdom', 'reflection'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description:
        'Help user find genuine lessons from their experience—not forced silver linings, but real wisdom earned.',
      parameters: z.object({
        experience: z.string().describe("The experience they're extracting lessons from"),
        readyForLessons: z
          .boolean()
          .optional()
          .describe('Whether they feel ready to look for lessons'),
      }),
      execute: async ({ experience, readyForLessons }) => {
        getLogger().info({ agentId: ctx.agentId, readyForLessons }, 'Finding the lessons');

        let response = '';

        if (readyForLessons === false) {
          response = `**Not Ready Yet—And That's Okay**\n\n`;
          response += `Sometimes it's too soon to look for lessons. The wound is too fresh, `;
          response += `and "finding the silver lining" feels like being asked to be grateful for pain.\n\n`;
          response += `That's not what this is about.\n\n`;
          response += `The lessons will be there when you're ready. They don't expire.\n\n`;
          response += `For now, what do you need? Just to be heard? To process? To be angry for a while?\n\n`;
          response += `We can come back to lessons later.`;
          return response;
        }

        response = `**Wisdom From Hard Experience**\n\n`;
        response += `Looking at: ${experience}\n\n`;
        response += `---\n\n`;

        response += `**Important note:** Finding lessons doesn't mean:\n`;
        response += `- What happened was okay\n`;
        response += `- You should be grateful for the pain\n`;
        response += `- Everything happens for a reason\n\n`;
        response += `It means: **You can extract value from almost anything.** The experience was costly—why not take the wisdom?\n\n`;

        response += `---\n\n`;

        response += `**Categories of lessons:**\n\n`;

        response += `**About Yourself:**\n`;
        response += `- What did you learn you're capable of?\n`;
        response += `- What patterns became clear?\n`;
        response += `- What do you now know you need/don't need?\n`;
        response += `- What boundaries will you hold differently?\n\n`;

        response += `**About Others:**\n`;
        response += `- Who showed up for you?\n`;
        response += `- What did you learn about who to trust?\n`;
        response += `- What did you learn about human nature?\n\n`;

        response += `**About Life:**\n`;
        response += `- What do you know now about how life works?\n`;
        response += `- What assumptions were challenged?\n`;
        response += `- What matters more/less than you thought?\n\n`;

        response += `**About What's Next:**\n`;
        response += `- What will you do differently?\n`;
        response += `- What warning signs will you now recognize?\n`;
        response += `- What's the wisdom you'd share with someone in a similar situation?\n\n`;

        response += `---\n\n`;
        response += `What's the most important thing this experience taught you?`;

        return response;
      },
    });
  },
};

// ============================================================================
// PLANNING TOOLS
// ============================================================================

const defineFirstStepDef: ToolDefinition = {
  id: 'defineFirstStep',
  name: 'Define First Step',
  description: 'Identify the smallest possible first step toward a fresh start',
  domain: 'second-chances',
  tags: ['second-chances', 'planning', 'action', 'first-step'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description:
        'Help user identify a tiny, manageable first step. Not the whole journey—just the very next thing.',
      parameters: z.object({
        direction: z.string().describe('What direction they want to move in'),
        overwhelmLevel: z
          .enum(['very-overwhelmed', 'somewhat-overwhelmed', 'manageable', 'ready-to-go'])
          .optional(),
        energy: z.enum(['depleted', 'low', 'moderate', 'good']).optional(),
      }),
      execute: async ({ direction, overwhelmLevel, energy }, { ctx: toolCtx }) => {
        // Track analytics if enabled
        const tracker = isLifeCoachAnalyticsEnabled()
          ? trackToolUsage('defineFirstStep', 'second-chances', { agentId: ctx.agentId })
          : null;

        try {
          getLogger().info({ agentId: ctx.agentId, overwhelmLevel, energy }, 'Defining first step');

          let response = `**Finding Your First Step**\n\n`;

          response += `Direction: ${direction}\n\n`;

          if (overwhelmLevel === 'very-overwhelmed') {
            response += `I hear that you're very overwhelmed. That makes sense.\n\n`;
            response += `Here's what I want you to know: **You don't have to figure out the whole path.** `;
            response += `You just need the very next step. One step.\n\n`;
          }

          response += `---\n\n`;

          response += `**The First Step Formula:**\n\n`;
          response += `Your first step should be:\n`;
          response += `- **Tiny** enough that it feels almost too easy\n`;
          response += `- **Concrete** enough that you know when it's done\n`;
          response += `- **Doable today** (or this week at most)\n`;
          response += `- **Within your control** (not dependent on others)\n\n`;

          // Adjust suggestions based on energy
          if (energy === 'depleted' || energy === 'low') {
            response += `**Given your energy level, extra-small steps:**\n\n`;
            response += `- Write down one thought about what you want\n`;
            response += `- Tell one person you're thinking about a change\n`;
            response += `- Spend 5 minutes researching one thing\n`;
            response += `- Rest, and decide the step tomorrow\n\n`;
          } else {
            response += `**Possible first steps (pick the smallest that matters):**\n\n`;
            response += `- Make one phone call\n`;
            response += `- Send one email\n`;
            response += `- Have one conversation\n`;
            response += `- Research one option\n`;
            response += `- Update one thing (resume, profile, etc.)\n`;
            response += `- Schedule one appointment\n`;
            response += `- Write down your goal somewhere you'll see it\n\n`;
          }

          response += `---\n\n`;

          response += `**The magic question:**\n`;
          response += `> "What's the smallest thing I could do in the next 24 hours that would move me even 1% in the right direction?"\n\n`;

          response += `What comes to mind?`;

          // Persist if they define a step
          persistTrackedItem(toolCtx as ToolCtxWithUserData, {
            domain: 'second-chances',
            itemType: 'first_step_session',
            item: { direction, overwhelmLevel, energy },
            importance: 'medium',
          });

          tracker?.success({ direction, energy });
          return response;
        } catch (error) {
          tracker?.error(error instanceof Error ? error : String(error));
          throw error;
        }
      },
    });
  },
};

const createComebackPlanDef: ToolDefinition = {
  id: 'createComebackPlan',
  name: 'Create Comeback Plan',
  description: 'Develop a realistic plan for rebuilding',
  domain: 'second-chances',
  tags: ['second-chances', 'planning', 'comeback', 'rebuilding'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: 'Help user create a realistic comeback plan with phases, not a rigid timeline.',
      parameters: z.object({
        comebackType: z
          .enum(['career', 'financial', 'relationship', 'health', 'identity', 'general'])
          .describe("What area they're rebuilding"),
        startingPoint: z.string().describe('Honest assessment of where they are'),
        destination: z.string().optional().describe('Where they want to get to'),
        resources: z.array(z.string()).optional().describe('Resources they have'),
        constraints: z.array(z.string()).optional().describe("Constraints they're working with"),
      }),
      execute: async ({ comebackType, startingPoint, destination, resources, constraints }) => {
        getLogger().info({ agentId: ctx.agentId, comebackType }, 'Creating comeback plan');

        let response = `**Your Comeback Plan**\n\n`;

        response += `**Type:** ${comebackType} rebuilding\n`;
        response += `**Starting from:** ${startingPoint}\n`;
        if (destination) response += `**Heading toward:** ${destination}\n`;
        response += `\n`;

        if (resources && resources.length > 0) {
          response += `**Resources you have:**\n`;
          resources.forEach((r) => {
            response += `- ${r}\n`;
          });
          response += `\n`;
        }

        if (constraints && constraints.length > 0) {
          response += `**Constraints to work with:**\n`;
          constraints.forEach((c) => {
            response += `- ${c}\n`;
          });
          response += `\n`;
        }

        response += `---\n\n`;

        response += `**Phased Approach** (no rigid timelines—life doesn't work that way):\n\n`;

        response += `**Phase 1: Stabilize** 🏠\n`;
        response += `_First, stop the bleeding. Create a foundation._\n`;
        response += `- What needs to be handled immediately?\n`;
        response += `- What support do you need to put in place?\n`;
        response += `- What does "stable enough to build from" look like?\n\n`;

        response += `**Phase 2: Explore** 🔍\n`;
        response += `_Research, experiment, gather information._\n`;
        response += `- What options exist?\n`;
        response += `- What do you need to learn?\n`;
        response += `- What small experiments could you try?\n\n`;

        response += `**Phase 3: Build** 🔨\n`;
        response += `_Take consistent action toward your goal._\n`;
        response += `- What's the core work to do?\n`;
        response += `- What habits or routines support this?\n`;
        response += `- How will you track progress?\n\n`;

        response += `**Phase 4: Sustain** 🌱\n`;
        response += `_Protect what you've built. Prevent backsliding._\n`;
        response += `- What could derail you?\n`;
        response += `- What maintenance does this require?\n`;
        response += `- How will you know if you're slipping?\n\n`;

        response += `---\n\n`;

        response += `**Reality checks:**\n`;
        response += `- Setbacks will happen. Build them into your expectations.\n`;
        response += `- Progress isn't linear. Celebrate anyway.\n`;
        response += `- You don't have to do this alone. Who can help?\n\n`;

        // Add inspiring story
        const storyCategory =
          comebackType === 'financial'
            ? 'financial'
            : comebackType === 'career'
              ? 'career'
              : 'personal';
        const stories =
          COMEBACK_STORIES[storyCategory as keyof typeof COMEBACK_STORIES] ||
          COMEBACK_STORIES.career;
        const story = stories[Math.floor(Math.random() * stories.length)];

        response += `---\n\n`;
        response += `**Remember:**\n`;
        response += `> ${story.name}: ${story.story}\n`;
        response += `> _Lesson: ${story.lesson}_\n\n`;

        response += `Which phase are you in right now? Let's focus there.`;

        return response;
      },
    });
  },
};

const identifySupportsDef: ToolDefinition = {
  id: 'identifySupports',
  name: 'Identify Supports',
  description: 'Map out the support system for a fresh start',
  domain: 'second-chances',
  tags: ['second-chances', 'support', 'relationships', 'resources'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description:
        'Help user identify and strengthen their support system for their fresh start journey.',
      parameters: z.object({
        currentSupport: z.string().optional().describe('Who/what currently supports them'),
        supportGaps: z.string().optional().describe('What support they feel is missing'),
        hardToAskForHelp: z.boolean().optional().describe('Whether they struggle to ask for help'),
      }),
      execute: async ({ currentSupport, supportGaps, hardToAskForHelp }) => {
        getLogger().info({ agentId: ctx.agentId, hardToAskForHelp }, 'Identifying supports');

        let response = `**Your Support System**\n\n`;

        response += `Fresh starts are hard to do alone. Let's map out your support.\n\n`;

        if (hardToAskForHelp) {
          response += `_I notice asking for help might be hard for you. You're not alone in that. `;
          response += `Many people feel like they should handle things themselves, or worry about being a burden. `;
          response += `Here's the thing: people generally want to help. Letting them is a gift to both of you._\n\n`;
        }

        response += `---\n\n`;

        response += `**Types of Support to Consider:**\n\n`;

        response += `**Emotional Support** 💚\n`;
        response += `People who listen, validate, encourage.\n`;
        response += `- Who lets you vent without trying to fix?\n`;
        response += `- Who believes in you even when you don't?\n`;
        response += `- Who do you feel safe being vulnerable with?\n\n`;

        response += `**Practical Support** 🔧\n`;
        response += `Tangible help—rides, childcare, skills, labor.\n`;
        response += `- Who could help with practical tasks?\n`;
        response += `- Who has skills or resources you need?\n`;
        response += `- What services could fill gaps? (even paid ones)\n\n`;

        response += `**Informational Support** 📚\n`;
        response += `Advice, expertise, connections, knowledge.\n`;
        response += `- Who has done what you're trying to do?\n`;
        response += `- Who knows people who could help?\n`;
        response += `- What communities or groups exist for people in your situation?\n\n`;

        response += `**Accountability Support** ✅\n`;
        response += `People who check in, hold you to commitments.\n`;
        response += `- Who could check in on your progress?\n`;
        response += `- Who will lovingly hold you accountable?\n`;
        response += `- What structures help you follow through?\n\n`;

        if (currentSupport) {
          response += `---\n\n`;
          response += `**Your current support:** ${currentSupport}\n`;
        }

        if (supportGaps) {
          response += `**What feels missing:** ${supportGaps}\n\n`;
          response += `Let's think about how to fill those gaps. Sometimes it's asking people we already know. `;
          response += `Sometimes it's finding new communities. Sometimes it's professional support (therapist, coach, etc.).\n`;
        }

        response += `\n---\n\n`;
        response += `**One step:**\n`;
        response += `Who is ONE person you could reach out to this week? What would you ask them for?`;

        return response;
      },
    });
  },
};

// ============================================================================
// EMOTIONAL PROCESSING TOOLS
// ============================================================================

const processGriefForWhatWasDef: ToolDefinition = {
  id: 'processGriefForWhatWas',
  name: 'Process Grief for What Was',
  description: 'Dedicated space for grieving what was lost',
  domain: 'second-chances',
  tags: ['second-chances', 'grief', 'processing', 'emotions'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description:
        'Create dedicated space for grieving losses. Not rushing past pain, but sitting with it.',
      parameters: z.object({
        loss: z.string().describe("What they're grieving"),
        griefExpression: z
          .enum(['crying', 'angry', 'numb', 'waves', 'avoiding', 'ready-to-process'])
          .optional(),
      }),
      execute: async ({ loss, griefExpression }) => {
        getLogger().info({ agentId: ctx.agentId, griefExpression }, 'Processing grief');

        let response = `**A Space for Grief**\n\n`;

        response += `You're grieving: ${loss}\n\n`;
        response += `---\n\n`;

        // Validate however they're expressing grief
        if (griefExpression === 'numb') {
          response += `Numbness is a form of grief. Your system is protecting you from feeling too much at once. `;
          response += `It's not wrong or broken—it's a survival mechanism. The feelings will come when you're ready.\n\n`;
        } else if (griefExpression === 'angry') {
          response += `Anger is grief's bodyguard. It protects the softer, more vulnerable feelings underneath. `;
          response += `You're allowed to be angry. Something was taken from you, or didn't go the way it should have.\n\n`;
        } else if (griefExpression === 'waves') {
          response += `Grief in waves is normal. You can be fine one moment and crushed the next. `;
          response += `The waves don't mean you're not healing. They mean you loved or cared about something.\n\n`;
        } else if (griefExpression === 'avoiding') {
          response += `Avoiding grief makes sense—it hurts. But grief tends to wait for us. `;
          response += `You don't have to dive into the deep end, but letting yourself feel in small doses can help.\n\n`;
        }

        response += `**What grief needs:**\n\n`;
        response += `- **Acknowledgment** - "This loss is real and it matters"\n`;
        response += `- **Time** - Grief doesn't follow a schedule\n`;
        response += `- **Permission** - To feel whatever you feel\n`;
        response += `- **Witness** - Someone to see your pain\n`;
        response += `- **Rituals** - Ways to honor what was lost\n\n`;

        response += `---\n\n`;

        response += `**What grief doesn't need:**\n\n`;
        response += `- Timelines ("You should be over this by now")\n`;
        response += `- Silver linings ("At least...")\n`;
        response += `- Comparison ("Others have it worse")\n`;
        response += `- Rushing ("Focus on the positive")\n\n`;

        response += `---\n\n`;

        // Ferni's presence
        response += `**I'm here.**\n\n`;
        response += `I can sit with you in this. You don't have to perform healing. `;
        response += `You don't have to find meaning yet. You don't have to be okay.\n\n`;
        response += `What do you need right now?`;

        return response;
      },
    });
  },
};

const buildCourageForWhatNextDef: ToolDefinition = {
  id: 'buildCourageForWhatNext',
  name: "Build Courage for What's Next",
  description: 'Cultivate courage for facing the unknown',
  domain: 'second-chances',
  tags: ['second-chances', 'courage', 'fear', 'moving-forward'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description:
        'Help user build courage for their fresh start. Acknowledge fear while building capacity to act.',
      parameters: z.object({
        fearOf: z.string().describe("What they're afraid of"),
        whatCourageLooksLike: z
          .string()
          .optional()
          .describe('What taking the step would look like'),
        pastCourage: z.string().optional().describe('A time they showed courage before'),
      }),
      execute: async ({ fearOf, whatCourageLooksLike, pastCourage }) => {
        getLogger().info(
          { agentId: ctx.agentId, hasPastCourage: !!pastCourage },
          'Building courage'
        );

        let response = `**Building Courage**\n\n`;

        response += `You're afraid of: ${fearOf}\n\n`;
        response += `---\n\n`;

        response += `**First, let's honor the fear.**\n\n`;
        response += `Fear exists to protect you. It's not weakness—it's your nervous system `;
        response += `trying to keep you safe. The question isn't "how do I not feel fear?" `;
        response += `It's "how do I move forward WITH the fear?"\n\n`;

        response += `**Courage isn't the absence of fear.**\n`;
        response += `Courage is fear + action anyway.\n\n`;

        response += `---\n\n`;

        if (pastCourage) {
          response += `**You've been courageous before.**\n\n`;
          response += `You mentioned: ${pastCourage}\n\n`;
          response += `That same capacity is in you now. What helped you then?\n\n`;
        }

        response += `**Ways to build courage:**\n\n`;

        response += `**1. Shrink the leap**\n`;
        response += `What's the smallest version of this step? Can you make it tiny enough that fear doesn't stop you?\n\n`;

        response += `**2. Borrow courage**\n`;
        response += `Think of someone you admire. What would they do? How would they approach this?\n\n`;

        response += `**3. Remember your why**\n`;
        response += `Why does this matter? What's on the other side of this fear? Write it down.\n\n`;

        response += `**4. Expect fear, do it anyway**\n`;
        response += `Instead of waiting to feel ready, try: "I feel scared AND I'm doing this."\n\n`;

        response += `**5. Give yourself a deadline**\n`;
        response += `Fear grows with delay. Sometimes setting a time ("I'll do this by Friday") helps.\n\n`;

        // Courage quote
        const courageWisdom = SECOND_CHANCE_WISDOM.find((w) => w.context === 'courage');
        if (courageWisdom) {
          response += `---\n\n`;
          response += `> "${courageWisdom.quote}"\n`;
          response += `> — ${courageWisdom.attribution}\n\n`;
        }

        if (whatCourageLooksLike) {
          response += `---\n\n`;
          response += `**What courage looks like for you:** ${whatCourageLooksLike}\n\n`;
          response += `What's making this feel hard? What would make it feel more possible?`;
        } else {
          response += `What would taking this courageous step look like, specifically?`;
        }

        return response;
      },
    });
  },
};

const celebrateTinyWinsDef: ToolDefinition = {
  id: 'celebrateTinyWins',
  name: 'Celebrate Tiny Wins',
  description: 'Recognize and celebrate progress, no matter how small',
  domain: 'second-chances',
  tags: ['second-chances', 'celebration', 'progress', 'wins'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description:
        'Help user recognize and celebrate their progress on the fresh start journey—especially the small wins that are easy to dismiss.',
      parameters: z.object({
        win: z.string().describe('What they accomplished'),
        sizePerception: z
          .enum(['tiny', 'small', 'medium', 'big'])
          .optional()
          .describe('How big they think it is'),
        feelingAboutIt: z.string().optional(),
      }),
      execute: async ({ win, sizePerception, feelingAboutIt }, { ctx: toolCtx }) => {
        getLogger().info({ agentId: ctx.agentId, sizePerception }, 'Celebrating tiny win');

        // Always persist wins as key moments
        persistKeyMoment(toolCtx as ToolCtxWithUserData, {
          domain: 'second-chances',
          type: 'milestone',
          summary: `Second chance win: ${win.substring(0, 100)}`,
          emotionalWeight: sizePerception === 'big' ? 'heavy' : 'medium',
          topics: ['second-chances', 'progress', 'win', 'celebration'],
        });

        let response = `**🎉 Win Acknowledged**\n\n`;

        response += `What you did: **${win}**\n\n`;

        // If they're minimizing it
        if (sizePerception === 'tiny') {
          response += `You called this "tiny." I want to push back on that.\n\n`;
          response += `**Here's why "tiny" wins matter:**\n\n`;
          response += `- They prove you can do SOMETHING (momentum is everything)\n`;
          response += `- They rewire your brain to see yourself as someone who takes action\n`;
          response += `- Big changes are just tiny wins stacked up\n`;
          response += `- The hardest part is often starting—you started\n\n`;
          response += `This isn't tiny. This is **evidence that you're moving.**\n\n`;
        }

        response += `---\n\n`;

        response += `**What this win represents:**\n\n`;
        response += `- You're not stuck anymore\n`;
        response += `- You're capable of forward motion\n`;
        response += `- This chapter is being written\n`;
        response += `- Future you will look back on this as the beginning\n\n`;

        if (feelingAboutIt) {
          response += `---\n\n`;
          response += `You said you feel: ${feelingAboutIt}\n\n`;
          response += `Whatever you're feeling about this progress is valid. `;
          response += `Sometimes wins feel complicated—especially when we're rebuilding from hard things.\n\n`;
        }

        response += `---\n\n`;

        // Encouragement based on the journey
        response += `**Ferni's take:**\n\n`;
        response += `I see you. I see this step. It matters.\n\n`;
        response += `Starting over is one of the hardest things humans do. `;
        response += `And you're doing it. One win at a time.\n\n`;

        response += `What's one thing you're proud of about how you handled this?`;

        return response;
      },
    });
  },
};

// ============================================================================
// COMPANION TOOLS
// ============================================================================

const checkInOnJourneyDef: ToolDefinition = {
  id: 'checkInOnJourney',
  name: 'Check In on Journey',
  description: 'Regular check-in on the fresh start journey',
  domain: 'second-chances',
  tags: ['second-chances', 'check-in', 'journey', 'progress'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description:
        'Check in with user on how their fresh start journey is going. Not to judge progress, but to understand where they are.',
      parameters: z.object({
        timeSinceStart: z.string().optional().describe("How long they've been on this journey"),
        currentPhase: z
          .enum(['stabilizing', 'exploring', 'building', 'sustaining', 'struggling', 'unsure'])
          .optional(),
        biggestChallenge: z.string().optional(),
        smallestWin: z.string().optional(),
      }),
      execute: async ({ timeSinceStart, currentPhase, biggestChallenge, smallestWin }) => {
        getLogger().info({ agentId: ctx.agentId, currentPhase }, 'Checking in on journey');

        let response = `**Journey Check-In**\n\n`;

        if (timeSinceStart) {
          response += `You've been on this path for: ${timeSinceStart}\n\n`;
        }

        response += `---\n\n`;

        // Phase-specific support
        if (currentPhase === 'struggling') {
          response += `**You said you're struggling.** That's honest, and it takes courage to say.\n\n`;
          response += `Struggling doesn't mean failing. It means you're in the hard part.\n\n`;
          response += `Some questions:\n`;
          response += `- What's the hardest part right now?\n`;
          response += `- What support might help?\n`;
          response += `- What would "just getting through this week" look like?\n\n`;
        } else if (currentPhase === 'stabilizing') {
          response += `**Stabilizing phase** - You're building your foundation.\n\n`;
          response += `This phase is about stopping the bleeding and creating stability to build from.\n`;
          response += `- What still needs to be stabilized?\n`;
          response += `- What routines are helping?\n`;
          response += `- Are you getting enough support?\n\n`;
        } else if (currentPhase === 'exploring') {
          response += `**Exploring phase** - You're figuring out possibilities.\n\n`;
          response += `This is a curious, experimental phase. Not everything has to be decided yet.\n`;
          response += `- What options are you exploring?\n`;
          response += `- What have you learned so far?\n`;
          response += `- What excites you? What scares you?\n\n`;
        } else if (currentPhase === 'building') {
          response += `**Building phase** - You're actively creating something new.\n\n`;
          response += `This is the work phase. Consistent effort, building momentum.\n`;
          response += `- What are you building toward?\n`;
          response += `- What's working?\n`;
          response += `- Where do you need to adjust?\n\n`;
        } else if (currentPhase === 'sustaining') {
          response += `**Sustaining phase** - You're protecting what you've built.\n\n`;
          response += `The work now is maintenance and prevention.\n`;
          response += `- What could throw you off track?\n`;
          response += `- What practices keep you grounded?\n`;
          response += `- How far have you come from where you started?\n\n`;
        }

        if (biggestChallenge) {
          response += `---\n\n`;
          response += `**Your biggest challenge right now:** ${biggestChallenge}\n\n`;
          response += `What would help with this? More support? Different strategy? Just acknowledgment that it's hard?\n\n`;
        }

        if (smallestWin) {
          response += `---\n\n`;
          response += `**A win you mentioned:** ${smallestWin}\n\n`;
          response += `Don't skip past this. This matters. This is evidence you're moving.\n\n`;
        }

        response += `---\n\n`;
        response += `**What do you need most right now?**\n`;
        response += `- Someone to listen?\n`;
        response += `- Help solving something?\n`;
        response += `- Encouragement?\n`;
        response += `- Honest reflection?\n`;
        response += `- Just to check in?`;

        return response;
      },
    });
  },
};

const holdHopeWhenCantDef: ToolDefinition = {
  id: 'holdHopeWhenCant',
  name: "Hold Hope When Can't",
  description: "Hold hope for someone when they can't hold it themselves",
  domain: 'second-chances',
  tags: ['second-chances', 'hope', 'support', 'dark-times'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description:
        'For moments when user has lost hope. Ferni holds hope for them until they can hold it themselves.',
      parameters: z.object({
        whatFeelsHopeless: z.string().describe('What feels hopeless to them'),
        howLongFeeling: z.string().optional().describe("How long they've felt this way"),
      }),
      execute: async ({ whatFeelsHopeless, howLongFeeling }, { ctx: toolCtx }) => {
        getLogger().info({ agentId: ctx.agentId }, 'Holding hope for user');

        // Persist this as a significant moment - user expressing hopelessness is a concern
        persistKeyMoment(toolCtx as ToolCtxWithUserData, {
          domain: 'second-chances',
          type: 'concern',
          summary: 'User expressed hopelessness - provided hope holding',
          emotionalWeight: 'heavy',
          topics: ['hopelessness', 'support', 'second-chances'],
        });

        let response = `**I'm Holding Hope For You**\n\n`;

        response += `What feels hopeless: ${whatFeelsHopeless}\n`;
        if (howLongFeeling) {
          response += `You've felt this way: ${howLongFeeling}\n`;
        }
        response += `\n---\n\n`;

        response += `I want you to hear something important.\n\n`;

        response += `**You don't have to feel hopeful right now.**\n\n`;

        response += `Hope is heavy. When you're exhausted, depleted, or in pain, `;
        response += `you don't have the energy to carry it. That's okay.\n\n`;

        response += `**Let me hold it for you.**\n\n`;

        response += `I will hold the hope that:\n`;
        response += `- This isn't the end of your story\n`;
        response += `- Things can change (even when you can't see how)\n`;
        response += `- You've survived hard things before\n`;
        response += `- There are possibilities you can't see right now\n`;
        response += `- People have come back from places like this\n\n`;

        response += `You don't have to believe any of that right now. `;
        response += `I'll believe it for both of us until you can.\n\n`;

        response += `---\n\n`;

        // Add a comeback story
        const story =
          COMEBACK_STORIES.personal[Math.floor(Math.random() * COMEBACK_STORIES.personal.length)];
        response += `**Someone who came back:**\n`;
        response += `> ${story.name}: ${story.story}\n\n`;

        response += `---\n\n`;

        response += `**Right now, you just need to:**\n`;
        response += `- Get through today\n`;
        response += `- Not make it worse\n`;
        response += `- Let someone (me, or someone else) hold hope for a while\n\n`;

        response += `What's the smallest thing that would help you get through today?`;

        return response;
      },
    });
  },
};

const remindOfProgressDef: ToolDefinition = {
  id: 'remindOfProgress',
  name: 'Remind of Progress',
  description: "Remind user how far they've come on their journey",
  domain: 'second-chances',
  tags: ['second-chances', 'progress', 'reminder', 'reflection'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description:
        "Remind user of the progress they've made—especially useful when they feel like they're not getting anywhere.",
      parameters: z.object({
        whereyStarted: z.string().describe('Where they started this journey'),
        whereTheyAreNow: z.string().describe('Where they are now'),
        feelingStuck: z.boolean().optional().describe('Whether they feel stuck'),
      }),
      execute: async ({ whereyStarted: whereTheyStarted, whereTheyAreNow, feelingStuck }) => {
        getLogger().info({ agentId: ctx.agentId, feelingStuck }, 'Reminding of progress');

        let response = `**Look How Far You've Come**\n\n`;

        if (feelingStuck) {
          response += `You feel stuck right now. I get it. Progress can be invisible when you're in it.\n\n`;
          response += `Let's zoom out.\n\n`;
        }

        response += `**Where you started:**\n`;
        response += `> ${whereTheyStarted}\n\n`;

        response += `**Where you are now:**\n`;
        response += `> ${whereTheyAreNow}\n\n`;

        response += `---\n\n`;

        response += `**That's not nothing.**\n\n`;

        response += `The distance between those two points represents:\n`;
        response += `- Decisions you made\n`;
        response += `- Courage you found\n`;
        response += `- Days you showed up\n`;
        response += `- Pain you moved through\n`;
        response += `- Growth you probably can't even see yet\n\n`;

        response += `---\n\n`;

        response += `**Progress isn't always visible from inside it.**\n\n`;
        response += `Imagine someone starting where you started, hearing about where you are now. `;
        response += `Would they be impressed? Would they see progress?\n\n`;
        response += `Probably yes.\n\n`;

        response += `You're harder on yourself than anyone else would be.\n\n`;

        response += `---\n\n`;

        response += `**What would past-you say?**\n\n`;
        response += `The version of you from ${whereTheyStarted}—what would they think about where you are now? `;
        response += `What would they be proud of? What would surprise them?\n\n`;

        response += `Sometimes we need to see ourselves through kinder eyes.`;

        return response;
      },
    });
  },
};

// ============================================================================
// WISDOM TOOLS
// ============================================================================

const shareSecondChanceWisdomDef: ToolDefinition = {
  id: 'shareSecondChanceWisdom',
  name: 'Share Second Chance Wisdom',
  description: 'Share inspiring wisdom about fresh starts and comebacks',
  domain: 'second-chances',
  tags: ['second-chances', 'wisdom', 'quotes', 'inspiration'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: 'Share relevant wisdom, quotes, or comeback stories to inspire and encourage.',
      parameters: z.object({
        context: z
          .enum([
            'starting-over',
            'failure',
            'rock-bottom',
            'redemption',
            'healing',
            'resilience',
            'grief',
            'courage',
            'financial',
            'general',
          ])
          .describe('What context they need wisdom for'),
        wantStory: z.boolean().optional().describe('Whether they want a comeback story'),
      }),
      execute: async ({ context, wantStory }) => {
        getLogger().info(
          { agentId: ctx.agentId, context, wantStory },
          'Sharing second chance wisdom'
        );

        let response = `**Wisdom for the Journey**\n\n`;

        // Find matching wisdom
        const matchingWisdom = SECOND_CHANCE_WISDOM.filter((w) => w.context === context);
        const wisdomToShare =
          matchingWisdom.length > 0 ? matchingWisdom : SECOND_CHANCE_WISDOM.slice(0, 3);

        wisdomToShare.forEach((w) => {
          response += `> "${w.quote}"\n`;
          response += `> — ${w.attribution}\n\n`;
        });

        if (wantStory) {
          response += `---\n\n`;
          response += `**A Comeback Story:**\n\n`;

          // Pick appropriate category
          const storyCategories = Object.keys(COMEBACK_STORIES) as Array<
            keyof typeof COMEBACK_STORIES
          >;
          const category =
            context === 'financial'
              ? 'financial'
              : ['career', 'failure'].includes(context)
                ? 'career'
                : 'personal';
          const stories =
            COMEBACK_STORIES[category as keyof typeof COMEBACK_STORIES] || COMEBACK_STORIES.career;
          const story = stories[Math.floor(Math.random() * stories.length)];

          response += `**${story.name}**\n`;
          response += `${story.story}\n\n`;
          response += `_The lesson: ${story.lesson}_\n\n`;
        }

        response += `---\n\n`;
        response += `What resonates with you? Or what do you need to hear right now?`;

        return response;
      },
    });
  },
};

// ============================================================================
// DOMAIN TOOLS COLLECTION
// ============================================================================

const secondChanceTools: ToolDefinition[] = [
  // Assessment
  assessReadinessForChangeDef,
  identifyWhatToKeepDef,
  acknowledgeWhatWasDef,
  // Story Work
  reframeNarrativeDef,
  findTheLessonsDef,
  // Planning
  defineFirstStepDef,
  createComebackPlanDef,
  identifySupportsDef,
  // Emotional Processing
  processGriefForWhatWasDef,
  buildCourageForWhatNextDef,
  celebrateTinyWinsDef,
  // Companion
  checkInOnJourneyDef,
  holdHopeWhenCantDef,
  remindOfProgressDef,
  // Wisdom
  shareSecondChanceWisdomDef,
];

// ============================================================================
// EXPORTS
// ============================================================================

export const { getToolDefinitions, domain, definitions } = createDomainExport(
  'second-chances',
  secondChanceTools
);

export default getToolDefinitions;
