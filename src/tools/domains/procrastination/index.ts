/**
 * Procrastination Domain
 *
 * Tools for understanding and overcoming procrastination.
 * Procrastination is emotional regulation, not time management.
 *
 * DOMAIN: procrastination
 * PERSONA AFFINITY: Maya (habits), Alex (productivity)
 *
 * TOOLS:
 *   Understanding: procrastinationRootCause, procrastinationPatterns
 *   Getting Started: getStarted, breakDownTask, twoMinuteRule
 *   Emotional: emotionalProcrastination, fearOfFailure
 *
 * PRINCIPLES:
 * - Procrastination is emotion regulation, not laziness
 * - The task isn't the problem; the feeling about the task is
 * - Small starts defeat big delays
 * - Self-compassion helps more than self-criticism
 */

import { createDomainExport } from '../../registry/loader.js';
import type { ToolDefinition, ToolContext, Tool } from '../../registry/types.js';
import { llm } from '@livekit/agents';
import { z } from 'zod';
import { getLogger } from '../../../utils/safe-logger.js';
import { getToolDescription } from '../../utils/tool-descriptions.js';

import {
  getLifeCoachingProfile,
  updateLifeCoachingProfile,
} from '../life-coaching-shared/user-profile.js';

// PhD-level research and persona methodology integration
import {
  getEnhancedToolContext,
  getOpeningPhrase,
  getValidationPhrase,
  buildResearchBackedResponse,
} from '../life-coaching-shared/tool-content-integration.js';

const log = getLogger();

// ============================================================================
// PROCRASTINATION TYPES
// ============================================================================

const PROCRASTINATION_TYPES = {
  perfectionist: {
    belief: "If I can't do it perfectly, I shouldn't start",
    emotion: 'Fear of imperfection/judgment',
    antidote: 'Done is better than perfect. B+ work shipped beats A+ work imagined.',
  },
  overwhelmed: {
    belief: 'This is too big/complex to even begin',
    emotion: 'Anxiety, paralysis',
    antidote: "Break it into tiny pieces. What's the smallest possible step?",
  },
  dreamer: {
    belief: "I'll be more in the mood later",
    emotion: 'Disconnection from future self',
    antidote: "You won't feel like it later either. Act now; motivation follows action.",
  },
  defier: {
    belief: "I shouldn't have to do this / I resent being told what to do",
    emotion: 'Resentment, rebellion',
    antidote: "You're choosing the consequences. Is that the choice you want?",
  },
  crisismaker: {
    belief: 'I work best under pressure',
    emotion: 'Need for adrenaline/stimulation',
    antidote: 'You survive under pressure. Quality and wellbeing suffer. Try artificial deadlines.',
  },
  busy: {
    belief: 'I have too much else to do',
    emotion: 'Avoidance disguised as productivity',
    antidote: 'Busy-ness is often procrastination on what matters most.',
  },
};

// ============================================================================
// TOOL: Procrastination Root Cause
// ============================================================================

const procrastinationRootCauseDef: ToolDefinition = {
  id: 'procrastinationRootCause',
  name: 'Procrastination Root Cause',
  description: "Discover why you're really procrastinating",
  domain: 'procrastination',
  tags: ['procrastination', 'root-cause', 'understanding', 'emotional'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('procrastinationRootCause'),
      parameters: z.object({
        task: z.string().describe("What you're avoiding"),
        howLong: z.string().optional().describe('How long have you been avoiding it'),
        whatYouDoInstead: z.string().optional().describe('What do you do instead'),
      }),
      execute: async ({ task, howLong, whatYouDoInstead }) => {
        log.info({ agentId: ctx.agentId, task }, 'Exploring procrastination root cause');

        let response = '';

        response += `**Understanding why you're avoiding "${task}":**\n\n`;

        // The truth about procrastination
        response += '**First, the science:**\n';
        response +=
          "Procrastination isn't a time management problem. It's an **emotion regulation problem**.\n\n";
        response +=
          "You're not avoiding the task. You're avoiding the *feeling* the task creates:\n";
        response += '• Anxiety (what if I fail?)\n';
        response += '• Overwhelm (where do I even start?)\n';
        response += '• Boredom (this is tedious)\n';
        response += "• Resentment (I shouldn't have to do this)\n";
        response += '• Shame (I should already be done)\n\n';

        // What the avoidance reveals
        if (whatYouDoInstead) {
          response += `**What you do instead** ("${whatYouDoInstead}"):\n`;
          response +=
            'This tells us something. We often procrastinate with activities that give immediate relief:\n';
          response += '• Social media → seeking novelty/connection\n';
          response += '• Cleaning/organizing → need for control/completion\n';
          response += '• Research/planning → avoiding actual execution\n';
          response += '• Helping others → avoiding self-focused work\n\n';
        }

        // Duration significance
        if (howLong) {
          response += `You've been avoiding this for: "${howLong}"\n`;
          response += 'The longer we avoid, the bigger the task becomes in our mind. ';
          response += 'The shame of having avoided also grows, creating a cycle.\n\n';
        }

        // Diagnostic questions
        response += '**Find your root cause - what feels most true?**\n\n';
        for (const [type, info] of Object.entries(PROCRASTINATION_TYPES)) {
          response += `**${type.charAt(0).toUpperCase() + type.slice(1)}**: "${info.belief}"\n`;
          response += `   Feeling: ${info.emotion}\n\n`;
        }

        response += 'Which pattern resonates most with this particular task?';

        return response;
      },
    });
  },
};

// ============================================================================
// TOOL: Get Started
// ============================================================================

const getStartedDef: ToolDefinition = {
  id: 'getStarted',
  name: 'Get Started',
  description: 'Break through the starting barrier right now',
  domain: 'procrastination',
  tags: ['procrastination', 'starting', 'action', 'immediate'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('getStarted'),
      parameters: z.object({
        task: z.string().describe('The task you need to start'),
        timeAvailable: z.enum(['5-min', '15-min', '30-min', 'hour-plus']).optional(),
        energyLevel: z.enum(['low', 'medium', 'high']).optional(),
      }),
      execute: async ({ task, timeAvailable, energyLevel }) => {
        log.info({ agentId: ctx.agentId, task }, 'Helping get started');

        let response = '';

        response += `**Getting started on "${task}":**\n\n`;

        // The truth about starting
        response +=
          '**The hardest part is starting.** Literally. Research shows that once you begin, ';
        response += "the brain's desire for completion (Zeigarnik effect) kicks in.\n\n";

        // Time-based strategies
        if (timeAvailable) {
          const timeStrategies: Record<string, string[]> = {
            '5-min': [
              'Just open the document/app',
              'Write one sentence',
              'Do ONE small piece',
              'Set up your workspace',
              'Make a 3-item list of next steps',
            ],
            '15-min': [
              'Pomodoro: 15 min work, then break',
              'Complete the most annoying small piece',
              "Get through the 'setup' phase",
              'Make real progress on one section',
            ],
            '30-min': [
              'Full Pomodoro with break',
              'Complete a meaningful chunk',
              'Get past the point where you can stop easily',
              'Build momentum',
            ],
            'hour-plus': [
              '2-3 Pomodoros with breaks',
              'Complete a major section',
              'Get into flow state',
              'Make significant progress',
            ],
          };

          response += `**With ${timeAvailable}:**\n`;
          timeStrategies[timeAvailable].forEach((s) => {
            response += `• ${s}\n`;
          });
          response += '\n';
        }

        // Energy-based adjustments
        if (energyLevel === 'low') {
          response += '**For low energy:**\n';
          response += '• Do the easiest, most mindless part\n';
          response += '• Just organize materials\n';
          response += '• 5 minutes is victory\n';
          response += '• No judgment - low energy is real\n\n';
        }

        // The smallest step technique
        response += '**Find the SMALLEST possible step:**\n';
        response += 'Not "write the report" but "open the document."\n';
        response += 'Not "clean the house" but "pick up 5 things."\n';
        response += 'Not "start the project" but "list 3 first tasks."\n\n';

        // Commitment device
        response += '**Make it inevitable:**\n';
        response += "• Tell someone you're starting NOW\n";
        response += '• Set a timer and commit to just 5 minutes\n';
        response += '• Remove distractions (phone in another room)\n';
        response += '• Change your environment (go to coffee shop/library)\n\n';

        // The prompt
        response += '**Your first step right now:**\n';
        response += `What is the SMALLEST action that would count as starting "${task}"?\n\n`;

        response += "Tell me what you're going to do in the next 60 seconds.";

        return response;
      },
    });
  },
};

// ============================================================================
// TOOL: Break Down Task
// ============================================================================

const breakDownTaskDef: ToolDefinition = {
  id: 'breakDownTask',
  name: 'Break Down Task',
  description: 'Make overwhelming tasks feel manageable',
  domain: 'procrastination',
  tags: ['procrastination', 'planning', 'overwhelm', 'structure'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('breakDownTask'),
      parameters: z.object({
        task: z.string().describe('The overwhelming task'),
        deadline: z.string().optional().describe('When is it due'),
      }),
      execute: async ({ task, deadline }) => {
        log.info({ agentId: ctx.agentId, task }, 'Breaking down task');

        let response = '';

        response += `**Breaking down "${task}":**\n\n`;

        // Why it helps
        response += 'When tasks feel huge, our brain treats them as threats. ';
        response += 'Breaking them down turns threats into solvable problems.\n\n';

        // The method
        response += '**The breakdown method:**\n\n';

        response +=
          "**1. Brain dump** - List EVERYTHING this task involves (don't organize yet)\n\n";

        response += '**2. Group similar items** - What can be batched together?\n\n';

        response += '**3. Identify dependencies** - What must happen before what?\n\n';

        response += '**4. Estimate time** - How long will each piece take? (then add 50%)\n\n';

        response +=
          "**5. Find the first domino** - What's the one thing that makes everything else easier?\n\n";

        // Deadline working
        if (deadline) {
          response += `**With deadline "${deadline}":**\n`;
          response += '• Work backwards: What needs to be done the day before?\n';
          response += '• What needs to be done a week before?\n';
          response += "• What can be done TODAY to make future-you's life easier?\n";
          response += '• Build in buffer time (things always take longer)\n\n';
        }

        // Task template
        response += `**Let's break down "${task}":**\n\n`;
        response += 'Tell me:\n';
        response += "1. What's the end result that would mean 'done'?\n";
        response += '2. What are all the pieces involved?\n';
        response += "3. What's the very first physical action?\n\n";

        response += "I'll help you organize it into a doable plan.";

        return response;
      },
    });
  },
};

// ============================================================================
// TOOL: Emotional Procrastination
// ============================================================================

const emotionalProcrastinationDef: ToolDefinition = {
  id: 'emotionalProcrastination',
  name: 'Emotional Procrastination',
  description: 'Work through the feelings that cause procrastination',
  domain: 'procrastination',
  tags: ['procrastination', 'emotional', 'feelings', 'processing'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('emotionalProcrastination'),
      parameters: z.object({
        task: z.string().describe("What you're avoiding"),
        feeling: z
          .enum(['anxious', 'bored', 'resentful', 'overwhelmed', 'ashamed', 'scared', 'unsure'])
          .describe('What feeling comes up around this task'),
      }),
      execute: async ({ task, feeling }) => {
        log.info({ agentId: ctx.agentId, feeling }, 'Working through emotional procrastination');

        let response = '';

        response += `**The feeling behind avoiding "${task}":** ${feeling}\n\n`;

        // Validate the feeling
        response += "This feeling is valid. It's also causing you problems. Both can be true.\n\n";

        // Feeling-specific approaches
        const feelingApproaches: Record<string, { insight: string; strategy: string }> = {
          anxious: {
            insight:
              "Anxiety about a task is usually fear of a specific outcome: failure, judgment, overwhelm. What's the worst that could actually happen?",
            strategy:
              'Start with the least anxiety-provoking piece. Build confidence through small wins.',
          },
          bored: {
            insight:
              'Boredom is often unfelt anxiety or a disconnection from meaning. Why does this task matter? Or does it not?',
            strategy:
              'Pair with something enjoyable (music, coffee shop). Or batch all boring tasks together.',
          },
          resentful: {
            insight:
              "Resentment often comes from feeling controlled or that the task isn't your choice. Can you reframe it as a choice with consequences?",
            strategy:
              'Find autonomy within it. How can you do it YOUR way? Or negotiate to change/delegate it.',
          },
          overwhelmed: {
            insight:
              'Overwhelm means the task is too big in your mind. It needs to be broken smaller.',
            strategy:
              "What's the absolute tiniest step? Don't solve the whole problem - just start.",
          },
          ashamed: {
            insight:
              "Shame about how long you've avoided it makes starting even harder. The shame is worse than the task.",
            strategy:
              'Self-compassion first. Then one tiny step. Every minute you avoid, shame grows. Start now to stop the shame spiral.',
          },
          scared: {
            insight:
              'Fear usually has a specific shape. What specifically are you afraid will happen?',
            strategy:
              "Name the fear specifically. Often naming it reduces its power. Then ask: 'If that happened, could I cope?'",
          },
          unsure: {
            insight:
              'Not knowing how to do something feels uncomfortable. The urge is to wait until you know more.',
            strategy: "You'll figure it out AS you go. Start imperfectly. Progress brings clarity.",
          },
        };

        const approach = feelingApproaches[feeling];
        response += `**Insight:** ${approach.insight}\n\n`;
        response += `**Strategy:** ${approach.strategy}\n\n`;

        // Self-compassion piece
        response += '**Self-compassion moment:**\n';
        response +=
          "Procrastination is not a moral failing. It's a coping mechanism for uncomfortable feelings. ";
        response += 'Beating yourself up about it makes it worse, not better. ';
        response += 'Instead: "This is hard for me. That\'s okay. What\'s one thing I can do?"\n\n';

        // Action prompt
        response += '**Right now:**\n';
        response += `Given that ${feeling} is present, what's the smallest step that feels possible?`;

        return response;
      },
    });
  },
};

// ============================================================================
// TOOL: Two Minute Rule
// ============================================================================

const twoMinuteRuleDef: ToolDefinition = {
  id: 'twoMinuteRule',
  name: 'Two Minute Rule',
  description: 'If it takes less than 2 minutes, do it now',
  domain: 'procrastination',
  tags: ['procrastination', 'quick-wins', 'habits', 'GTD'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('twoMinuteRule'),
      parameters: z.object({
        backlog: z.string().optional().describe("List of things you've been putting off"),
      }),
      execute: async ({ backlog }) => {
        log.info({ agentId: ctx.agentId }, 'Applying two minute rule');

        let response = '';

        response += '**The Two-Minute Rule:**\n\n';
        response += 'If something takes less than 2 minutes, do it **immediately**. ';
        response += 'The time spent tracking and remembering it is more than just doing it.\n\n';

        // The psychology
        response += '**Why it works:**\n';
        response += '• Builds momentum through quick wins\n';
        response += '• Clears mental clutter\n';
        response += "• Reduces the 'open loop' drain on your brain\n";
        response += '• Creates a sense of progress and capability\n\n';

        // Common 2-minute tasks
        response += '**Things that take less than 2 minutes:**\n';
        response += '• Responding to a simple email\n';
        response += '• Putting dishes in dishwasher\n';
        response += '• Making your bed\n';
        response += '• Filing a document\n';
        response += '• Making a quick phone call\n';
        response += '• Sending a thank-you text\n';
        response += '• Adding something to your calendar\n';
        response += '• Paying a bill online\n\n';

        // Backlog processing
        if (backlog) {
          response += `**Looking at your backlog:**\n"${backlog}"\n\n`;
          response += "Let's sort it:\n";
          response += '• Which of these are actually 2-minute tasks in disguise?\n';
          response += '• Which can be broken down to have a 2-minute first step?\n';
          response += '• Which need to be scheduled, not done now?\n\n';
        }

        // The variation for bigger tasks
        response += '**For bigger tasks - the 2-Minute START:**\n';
        response += "You can't finish in 2 minutes, but can you START in 2 minutes?\n";
        response += '• Open the document\n';
        response += '• Write one sentence\n';
        response += '• Make the first call\n';
        response += '• Research one thing\n\n';

        response += "What's something you could do RIGHT NOW in 2 minutes?";

        return response;
      },
    });
  },
};

// ============================================================================
// TOOL: Fear of Failure
// ============================================================================

const fearOfFailureDef: ToolDefinition = {
  id: 'fearOfFailure',
  name: 'Fear of Failure',
  description: 'When procrastination is protecting you from failing',
  domain: 'procrastination',
  tags: ['procrastination', 'fear', 'failure', 'perfectionism'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('fearOfFailure'),
      parameters: z.object({
        task: z.string().describe("What you're afraid to fail at"),
        worstCase: z.string().optional().describe('What failure would mean to you'),
      }),
      execute: async ({ task, worstCase }) => {
        log.info({ agentId: ctx.agentId }, 'Addressing fear of failure');

        let response = '';

        response += `**Fear of failure with "${task}":**\n\n`;

        // Name the fear
        response += "**Let's name it:**\n";
        response += "If you don't start, you can't fail. Your ego is protected. ";
        response += "But you also can't succeed, grow, or finish. ";
        response += 'Procrastination is a false safety.\n\n';

        // Explore the worst case
        if (worstCase) {
          response += `**Your worst case:** "${worstCase}"\n\n`;
          response += "Let's reality-check this:\n";
          response += '• How likely is this outcome, really?\n';
          response += '• If it happened, could you survive it?\n';
          response += '• Have you survived failures before?\n';
          response += '• What would you tell a friend with this fear?\n\n';
        }

        // Reframes
        response += '**Reframing failure:**\n';
        response += '• Failure is data, not identity\n';
        response += '• Every successful person has failed more times than most people have tried\n';
        response += "• 'Failure' usually isn't as permanent or catastrophic as it feels\n";
        response += '• Not trying guarantees the outcome you fear\n\n';

        // The math
        response += '**The real math:**\n';
        response += '• If you try: maybe fail, maybe succeed, definitely learn\n';
        response +=
          "• If you don't try: definitely fail (by default), learn nothing, feel worse\n\n";

        // Self-compassion
        response += '**A gentler frame:**\n';
        response += "What if the goal wasn't perfection but attempt?\n";
        response += "What if 'good enough' was actually good enough?\n";
        response += 'What if you could fail and still be okay?\n\n';

        // Action
        response += '**The invitation:**\n';
        response += `What's the smallest step toward "${task}" that would prove you can handle imperfection?`;

        return response;
      },
    });
  },
};

// ============================================================================
// TOOL: Procrastination Patterns
// ============================================================================

const procrastinationPatternsDef: ToolDefinition = {
  id: 'procrastinationPatterns',
  name: 'Procrastination Patterns',
  description: 'Identify your personal procrastination patterns',
  domain: 'procrastination',
  tags: ['procrastination', 'patterns', 'self-awareness', 'recurring'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('procrastinationPatterns'),
      parameters: z.object({
        examplesCount: z.number().optional().describe('How many things are you currently avoiding'),
      }),
      execute: async ({ examplesCount }) => {
        log.info({ agentId: ctx.agentId }, 'Exploring procrastination patterns');

        let response = '';

        response += '**Understanding your procrastination patterns:**\n\n';

        if (examplesCount && examplesCount > 5) {
          response += `You mentioned avoiding ${examplesCount} things. That's a lot of open loops draining your energy.\n\n`;
        }

        // Types overview
        response += '**Common procrastinator types** - which resonates?\n\n';
        for (const [type, info] of Object.entries(PROCRASTINATION_TYPES)) {
          response += `**The ${type.charAt(0).toUpperCase() + type.slice(1)}:**\n`;
          response += `• Belief: "${info.belief}"\n`;
          response += `• Antidote: ${info.antidote}\n\n`;
        }

        // Pattern questions
        response += '**Questions to find your pattern:**\n';
        response +=
          '• What types of tasks do you always avoid? (creative, admin, confrontation, physical)\n';
        response += '• When do you procrastinate most? (mornings, evenings, deadlines far away)\n';
        response += "• What do you do INSTEAD of the task? (this reveals what you're seeking)\n";
        response += '• How do you feel about the task before avoiding it?\n';
        response += '• What stories do you tell yourself to justify waiting?\n\n';

        // Common patterns
        response += '**Common pattern-types:**\n';
        response += "• The **morning avoider** - productive later but can't start early\n";
        response += '• The **creative blocker** - fine with logistics, frozen with creative work\n';
        response += '• The **confrontation avoider** - avoids tasks involving difficult people\n';
        response += '• The **admin hater** - creative work flows, paperwork languishes\n';
        response += '• The **decision avoider** - paralyzed when choices are involved\n\n';

        response += 'Knowing your pattern is power. What pattern do you notice in yourself?';

        return response;
      },
    });
  },
};

// ============================================================================
// DOMAIN TOOLS COLLECTION
// ============================================================================

const procrastinationTools: ToolDefinition[] = [
  procrastinationRootCauseDef,
  getStartedDef,
  breakDownTaskDef,
  emotionalProcrastinationDef,
  twoMinuteRuleDef,
  fearOfFailureDef,
  procrastinationPatternsDef,
];

// ============================================================================
// EXPORTS
// ============================================================================

export const { getToolDefinitions, domain, definitions } = createDomainExport(
  'procrastination',
  procrastinationTools
);

export default getToolDefinitions;
