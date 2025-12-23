/**
 * Perfectionism Domain
 *
 * Tools for healing from perfectionism and imposter syndrome.
 * Perfectionism is not a quality - it's a defense mechanism.
 *
 * DOMAIN: perfectionism
 * PERSONA AFFINITY: Maya (habits), Nayan (wisdom)
 *
 * TOOLS:
 *   Understanding: understandPerfectionism, imposterSyndrome
 *   Healing: goodEnough, healthyStriving, celebrateProgress
 *   Patterns: perfectionism Triggers, innerCritic
 *
 * PRINCIPLES:
 * - Perfectionism is armor, not aspiration
 * - "Good enough" is revolutionary
 * - Imposter syndrome lies about your competence
 * - Progress over perfection
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
  getCognitiveDistortionContext,
} from '../life-coaching-shared/tool-content-integration.js';

const log = getLogger();

// ============================================================================
// PERFECTIONISM TYPES
// ============================================================================

const PERFECTIONISM_TYPES = {
  selfOriented: {
    description: 'High standards for yourself',
    belief: 'I must be perfect to be worthy',
    risks: ['Burnout', 'Self-criticism', 'Never feeling good enough'],
  },
  otherOriented: {
    description: 'High standards for others',
    belief: 'Others should meet my standards',
    risks: ['Relationship strain', 'Disappointment', 'Difficulty delegating'],
  },
  sociallyPrescribed: {
    description: 'Believing others expect perfection from you',
    belief: 'Others expect me to be perfect',
    risks: ['Anxiety', 'People-pleasing', 'Fear of judgment'],
  },
};

// ============================================================================
// TOOL: Understand Perfectionism
// ============================================================================

const understandPerfectionismDef: ToolDefinition = {
  id: 'understandPerfectionism',
  name: 'Understand Perfectionism',
  description: 'Explore what perfectionism is protecting you from',
  domain: 'perfectionism',
  tags: ['perfectionism', 'understanding', 'roots', 'awareness'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('understandPerfectionism'),
      parameters: z.object({
        areaOfLife: z.string().optional().describe('Where perfectionism shows up most'),
        whatHappensIfNotPerfect: z
          .string()
          .optional()
          .describe("What you fear if you're not perfect"),
      }),
      execute: async ({ areaOfLife, whatHappensIfNotPerfect }) => {
        log.info({ agentId: ctx.agentId }, 'Understanding perfectionism');

        let response = '';

        response += '**Understanding perfectionism:**\n\n';
        response += "Perfectionism isn't about high standards. It's about **armor**.\n\n";
        response += '"If I\'m perfect, I can avoid shame, judgment, or blame."\n';
        response += "The problem? Perfection doesn't exist. So the armor never works.\n\n";

        // Area-specific insights
        if (areaOfLife) {
          response += `**Perfectionism in "${areaOfLife}":**\n`;
          response += "Consider: What would it mean about you if you weren't perfect here?\n";
          response += 'What message did you get early in life about this area?\n\n';
        }

        // Core fear
        if (whatHappensIfNotPerfect) {
          response += `**Your fear:** "${whatHappensIfNotPerfect}"\n`;
          response += 'This is what perfectionism is protecting against. ';
          response +=
            'The irony? Perfectionism often creates what it fears - it leads to not trying, ';
          response += 'procrastination, and exhaustion.\n\n';
        }

        // Types
        response += '**Three types of perfectionism:**\n\n';
        for (const [type, info] of Object.entries(PERFECTIONISM_TYPES)) {
          response += `**${type.replace(/([A-Z])/g, ' $1').trim()}:**\n`;
          response += `Core belief: "${info.belief}"\n`;
          response += `Risks: ${info.risks.join(', ')}\n\n`;
        }

        // The alternative
        response += "**The alternative isn't mediocrity:**\n";
        response += "It's healthy striving - aiming high while accepting imperfection, ";
        response += 'learning from failures, and defining your worth beyond performance.\n\n';

        response += 'Which type of perfectionism resonates most with you?';

        return response;
      },
    });
  },
};

// ============================================================================
// TOOL: Imposter Syndrome
// ============================================================================

const imposterSyndromeDef: ToolDefinition = {
  id: 'imposterSyndrome',
  name: 'Imposter Syndrome',
  description: 'Address feeling like a fraud despite evidence of competence',
  domain: 'perfectionism',
  tags: ['perfectionism', 'imposter', 'competence', 'self-doubt'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('imposterSyndrome'),
      parameters: z.object({
        situation: z.string().describe('Where you feel like an imposter'),
        evidence: z.string().optional().describe('Evidence that contradicts the imposter feeling'),
      }),
      execute: async ({ situation, evidence }) => {
        log.info({ agentId: ctx.agentId }, 'Addressing imposter syndrome');

        let response = '';

        response += `**Imposter syndrome in "${situation}":**\n\n`;

        response += '**What imposter syndrome says:**\n';
        response += '• "I don\'t belong here"\n';
        response += '• "I got lucky / they made a mistake"\n';
        response += '• "Soon everyone will realize I\'m a fraud"\n';
        response += '• "I\'m not as competent as they think"\n\n';

        response += '**The truth:**\n';
        response += '• Competent people often feel this (incompetent ones rarely do)\n';
        response += '• 70% of people experience imposter syndrome\n';
        response += "• Luck doesn't sustain success - YOU did something\n";
        response += '• Feeling like a fraud ≠ being a fraud\n\n';

        // Counter the narrative
        if (evidence) {
          response += `**Evidence you provided:** "${evidence}"\n`;
          response += 'This is REAL. The imposter feeling is a feeling, not a fact. ';
          response += 'The evidence is a fact.\n\n';
        }

        // Reframes
        response += '**Reframes to practice:**\n';
        response += '• "I\'m allowed to be learning while doing"\n';
        response += '• "I belong here as much as anyone else"\n';
        response += '• "Feeling uncertain is normal in growth"\n';
        response += '• "My contributions have value, even if imperfect"\n\n';

        // Types of imposters
        response += '**Imposter patterns:**\n';
        response += "• **The Perfectionist**: It's not enough unless it's perfect\n";
        response += "• **The Expert**: I don't know enough to claim competence\n";
        response += "• **The Soloist**: Asking for help means I'm a fraud\n";
        response += "• **The Natural Genius**: If I have to work hard, I'm not talented\n";
        response += '• **The Superhuman**: I should excel at everything\n\n';

        response += 'Which pattern sounds like you?';

        return response;
      },
    });
  },
};

// ============================================================================
// TOOL: Good Enough
// ============================================================================

const goodEnoughDef: ToolDefinition = {
  id: 'goodEnough',
  name: 'Good Enough',
  description: 'Learn to accept "good enough" as truly good enough',
  domain: 'perfectionism',
  tags: ['perfectionism', 'good-enough', 'acceptance', 'standards'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('goodEnough'),
      parameters: z.object({
        task: z.string().describe("What you're trying to make perfect"),
        whyPerfect: z.string().optional().describe('Why does this need to be perfect'),
      }),
      execute: async ({ task, whyPerfect }) => {
        log.info({ agentId: ctx.agentId }, 'Teaching good enough');

        let response = '';

        response += `**Is "${task}" good enough?**\n\n`;

        response += '**The perfectionism trap:**\n';
        response += '• Perfect is the enemy of done\n';
        response += '• Perfectionism steals time from other things\n';
        response += '• Diminishing returns: 80% effort often gets 95% of the value\n';
        response += "• Perfect isn't possible - you're chasing something that doesn't exist\n\n";

        // Why perfect
        if (whyPerfect) {
          response += `**You said it needs to be perfect because:** "${whyPerfect}"\n`;
          response += 'Question this: What\'s the actual cost of "good enough" here?\n';
          response += 'Is the cost real, or is it anxiety?\n\n';
        }

        // The matrix
        response += '**The good enough matrix:**\n\n';
        response += "Ask: **What's the actual consequence of imperfection here?**\n\n";
        response += '• **High stakes, reversible**: Put in effort, but ship. You can fix later.\n';
        response += '• **High stakes, irreversible**: Okay, this deserves extra effort.\n';
        response += '• **Low stakes, reversible**: Good enough is great. Move on.\n';
        response += '• **Low stakes, irreversible**: Still probably fine. Let go.\n\n';

        // Permission slip
        response += '**Permission slip:**\n';
        response += `"I give myself permission for ${task} to be good enough. `;
        response += 'Done is better than perfect. My worth isn\'t attached to this."\n\n';

        // Practical
        response += '**Practical approach:**\n';
        response += '1. Define "good enough" BEFORE starting\n';
        response += '2. Set a time limit for polishing\n';
        response += "3. Get external feedback (often we're the harshest judge)\n";
        response += '4. Ship it, then move on without looking back obsessively\n\n';

        response += `What would "good enough" actually look like for "${task}"?`;

        return response;
      },
    });
  },
};

// ============================================================================
// TOOL: Healthy Striving
// ============================================================================

const healthyStrivingDef: ToolDefinition = {
  id: 'healthyStriving',
  name: 'Healthy Striving',
  description: 'Transform perfectionism into healthy striving',
  domain: 'perfectionism',
  tags: ['perfectionism', 'healthy', 'growth', 'striving'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('healthyStriving'),
      parameters: z.object({
        goal: z.string().describe("What you're striving toward"),
      }),
      execute: async ({ goal }) => {
        log.info({ agentId: ctx.agentId }, 'Teaching healthy striving');

        let response = '';

        response += `**Healthy striving toward "${goal}":**\n\n`;

        response += '**Perfectionism vs. Healthy Striving:**\n\n';
        response += '| Perfectionism | Healthy Striving |\n';
        response += '|--------------|------------------|\n';
        response += '| Worth depends on achievement | Worth is inherent |\n';
        response += '| Focus on outcome only | Focus on growth and learning |\n';
        response += '| Mistakes are catastrophic | Mistakes are information |\n';
        response += '| Never good enough | Progress is celebrated |\n';
        response += '| Driven by fear/shame | Driven by intrinsic desire |\n';
        response += '| All-or-nothing | Good enough is okay |\n\n';

        // The shift
        response += '**Making the shift:**\n\n';
        response += '1. **Separate worth from achievement**\n';
        response += "   You're not more worthy when you succeed or less when you fail.\n\n";

        response += '2. **Embrace the process**\n';
        response += '   The journey matters as much as the destination.\n\n';

        response += '3. **Reframe failure**\n';
        response += '   Failure is data collection, not proof of inadequacy.\n\n';

        response += '4. **Practice self-compassion**\n';
        response += '   Speak to yourself as you would a friend.\n\n';

        response += '5. **Celebrate progress**\n';
        response += "   Notice how far you've come, not just how far to go.\n\n";

        // Applied to their goal
        response += `**For "${goal}":**\n`;
        response += '• What would make this an enjoyable process, not just a test?\n';
        response += '• What can you learn from setbacks along the way?\n';
        response += '• How will you celebrate progress, not just completion?\n';
        response += '• What would you tell a friend with this same goal?\n\n';

        response += "What's one way you can bring more self-compassion to this pursuit?";

        return response;
      },
    });
  },
};

// ============================================================================
// TOOL: Inner Critic
// ============================================================================

const innerCriticDef: ToolDefinition = {
  id: 'innerCritic',
  name: 'Inner Critic',
  description: 'Work with the harsh inner critic voice',
  domain: 'perfectionism',
  tags: ['perfectionism', 'inner-critic', 'self-talk', 'voice'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('innerCritic'),
      parameters: z.object({
        whatCriticSays: z.string().describe('What your inner critic tells you'),
        whenLoudest: z.string().optional().describe('When is the critic loudest'),
      }),
      execute: async ({ whatCriticSays, whenLoudest }) => {
        log.info({ agentId: ctx.agentId }, 'Working with inner critic');

        let response = '';

        response += `**Your inner critic says:** "${whatCriticSays}"\n\n`;

        response += '**About the inner critic:**\n';
        response += 'The inner critic developed to protect you. ';
        response +=
          'It thought: "If I criticize myself first, I won\'t be hurt when others do."\n\n';
        response += "It had good intentions. But it's not accurate, and it's not helpful.\n\n";

        // When it's loudest
        if (whenLoudest) {
          response += `**It's loudest when:** "${whenLoudest}"\n`;
          response +=
            'This tells us something. The critic activates in situations that feel threatening. ';
          response += 'What is it trying to protect you from?\n\n';
        }

        // Techniques
        response += '**Working with the critic:**\n\n';

        response += '1. **Name it**: Give your critic a name. It creates distance.\n';
        response += '   "There\'s [name] again, being dramatic."\n\n';

        response += '2. **Thank it**: "Thanks for trying to protect me. I\'ve got this."\n\n';

        response += '3. **Challenge it**: Is this actually true? Would I say this to a friend?\n\n';

        response += '4. **Respond with compassion**: Replace the criticism with kindness.\n\n';

        // Rewrite
        response += "**Let's rewrite that message:**\n\n";
        response += `Critic: "${whatCriticSays}"\n`;
        response += 'Compassionate reframe: ???\n\n';

        response += 'What would a kind mentor say instead of what your critic said?';

        return response;
      },
    });
  },
};

// ============================================================================
// TOOL: Perfectionism Triggers
// ============================================================================

const perfectionismTriggersDef: ToolDefinition = {
  id: 'perfectionismTriggers',
  name: 'Perfectionism Triggers',
  description: 'Identify what activates perfectionism',
  domain: 'perfectionism',
  tags: ['perfectionism', 'triggers', 'awareness', 'patterns'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('perfectionismTriggers'),
      parameters: z.object({
        recentExample: z.string().optional().describe('Recent time perfectionism kicked in'),
      }),
      execute: async ({ recentExample }) => {
        log.info({ agentId: ctx.agentId }, 'Identifying perfectionism triggers');

        const profile = await getLifeCoachingProfile(ctx.userId);

        let response = '';

        response += '**Identifying your perfectionism triggers:**\n\n';

        response +=
          "Perfectionism doesn't run all the time. It activates in response to triggers.\n\n";

        // Common triggers
        response += '**Common triggers:**\n';
        response += '• **Visibility** - Others will see/judge this work\n';
        response += '• **New territory** - Doing something unfamiliar\n';
        response += "• **Past criticism** - Area you've been criticized before\n";
        response += '• **Comparison** - Measuring against others or your ideal\n';
        response += '• **Stakes** - Perception that outcome is high-stakes\n';
        response += '• **Identity areas** - Things tied to who you are\n';
        response += '• **Stress** - When depleted, perfectionism often increases\n\n';

        // Recent example
        if (recentExample) {
          response += `**Your recent example:** "${recentExample}"\n\n`;
          response += 'Explore:\n';
          response += '• What specifically triggered perfectionism here?\n';
          response += "• What did you fear would happen if it wasn't perfect?\n";
          response += "• Whose voice was telling you it wasn't good enough?\n\n";
        }

        // Tracking pattern
        response += '**Tracking your patterns:**\n';
        response += "Over time, you'll notice themes. Ask yourself:\n";
        response += '• Is it certain TYPES of work?\n';
        response += '• Is it certain AUDIENCES?\n';
        response += '• Is it certain TIMES (tired, stressed)?\n';
        response += '• Is it certain AREAS of life?\n\n';

        // Update profile
        await updateLifeCoachingProfile(ctx.userId, {
          perfectionism: {
            type: 'self-oriented',
            imposterSyndrome: false,
            overworkPattern: true,
          },
        });

        response += 'What patterns do you notice in when your perfectionism activates?';

        return response;
      },
    });
  },
};

// ============================================================================
// TOOL: Celebrate Progress
// ============================================================================

const celebrateProgressDef: ToolDefinition = {
  id: 'celebrateProgress',
  name: 'Celebrate Progress',
  description: 'Learn to acknowledge wins instead of only seeing gaps',
  domain: 'perfectionism',
  tags: ['perfectionism', 'celebration', 'progress', 'acknowledgment'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('celebrateProgress'),
      parameters: z.object({
        accomplishment: z.string().describe("What you've accomplished"),
        butStatement: z.string().optional().describe('The "but it\'s not..." thought'),
      }),
      execute: async ({ accomplishment, butStatement }) => {
        log.info({ agentId: ctx.agentId }, 'Celebrating progress');

        let response = '';

        response += `**You accomplished:** "${accomplishment}"\n\n`;

        // The "but" trap
        if (butStatement) {
          response += `**Your "but":** "${butStatement}"\n`;
          response += 'This is the perfectionist theft of joy. ';
          response += 'The accomplishment is REAL. The "but" is perfectionism.\n\n';
        }

        response += '**The perfectionist pattern:**\n';
        response += "• Accomplish something → Immediately see what's lacking\n";
        response += '• Never pause to acknowledge → Move goalposts\n';
        response += '• Result: Never feel good enough, no matter what\n\n';

        response += '**The antidote - PAUSE and ACKNOWLEDGE:**\n';
        response += `"I did ${accomplishment}. That's real. That counts. `;
        response +=
          "I'm going to let myself feel good about this before I think about what's next.\"\n\n";

        // Practice
        response += '**Practice receiving:**\n';
        response += '• Say "thank you" when complimented (no deflecting)\n';
        response += '• Keep a "done" list, not just "to-do"\n';
        response += '• End each day naming one thing you did well\n';
        response += '• Notice the gap between where you STARTED and where you ARE\n\n';

        // Specific celebration
        response += '**Right now:**\n';
        response += `Let yourself acknowledge: "${accomplishment}" matters. `;
        response += 'It took effort. It has value. You did it.\n\n';

        response += 'Take a breath. How does it feel to simply acknowledge this?';

        return response;
      },
    });
  },
};

// ============================================================================
// DOMAIN TOOLS COLLECTION
// ============================================================================

const perfectionismTools: ToolDefinition[] = [
  understandPerfectionismDef,
  imposterSyndromeDef,
  goodEnoughDef,
  healthyStrivingDef,
  innerCriticDef,
  perfectionismTriggersDef,
  celebrateProgressDef,
];

// ============================================================================
// EXPORTS
// ============================================================================

export const { getToolDefinitions, domain, definitions } = createDomainExport(
  'perfectionism',
  perfectionismTools
);

export default getToolDefinitions;
