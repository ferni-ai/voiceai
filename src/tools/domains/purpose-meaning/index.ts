/**
 * Purpose & Meaning Domain Tools
 *
 * Tools for exploring life's bigger questions: purpose, meaning, dreams,
 * spirituality, philosophy, and legacy.
 *
 * DOMAIN: purpose-meaning
 */

import { createDomainExport } from '../../registry/loader.js';
import type { ToolDefinition, ToolContext, Tool } from '../../registry/types.js';
import { llm } from '@livekit/agents';
import { getLogger } from '../../../utils/safe-logger.js';
import { z } from 'zod';

const log = getLogger();

// ============================================================================
// DREAM & ASPIRATION TOOLS
// ============================================================================

const clarifyDreamDef: ToolDefinition = {
  id: 'clarifyDream',
  name: 'Clarify Dream',
  description: 'Help clarify and define dreams and aspirations',
  domain: 'meaning',
  tags: ['dreams', 'aspirations', 'clarity'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: 'Help clarify dreams and aspirations',
      parameters: z.object({
        dreamArea: z.string().optional().describe('Area of life for the dream'),
        currentClarity: z.enum(['vague', 'somewhat-clear', 'clear-but-blocked']).optional(),
      }),
      execute: async ({ dreamArea, currentClarity }) => {
        log.info({ agentId: ctx.agentId, dreamArea }, 'Clarifying dream');

        let response = `**Dream Clarification**\n\n`;

        if (dreamArea) {
          response += `Focus area: ${dreamArea}\n\n`;
        }

        response += `Dreams are the whispers of your truest self. Let's listen.\n\n`;

        response += `**Clarifying Questions:**\n\n`;

        response += `**1. If You Had No Fear**\n`;
        response += `What would you do if you knew you couldn't fail?\n`;
        response += `What would you pursue if money weren't a concern?\n\n`;

        response += `**2. What Lights You Up**\n`;
        response += `When do you feel most alive?\n`;
        response += `What activities make you lose track of time?\n`;
        response += `What topics do you never get tired of talking about?\n\n`;

        response += `**3. The Younger You**\n`;
        response += `What did you dream of before the world told you to be practical?\n`;
        response += `What childhood dreams still tug at you?\n\n`;

        response += `**4. Your Unique Contribution**\n`;
        response += `What do you have to offer that's uniquely you?\n`;
        response += `What problems do you feel called to solve?\n`;
        response += `What legacy do you want to leave?\n\n`;

        response += `**5. The Deathbed Test**\n`;
        response += `Looking back at the end of your life, what would you regret not doing?\n`;
        response += `What would make you proud?\n\n`;

        if (currentClarity === 'clear-but-blocked') {
          response += `---\n\n**If you know your dream but feel blocked:**\n`;
          response += `What's actually stopping you?\n`;
          response += `Is it fear? Resources? Permission you haven't given yourself?\n`;
        }

        response += `What's the dream that keeps coming back to you?`;

        return response;
      },
    });
  },
};

const createDreamTimelineDef: ToolDefinition = {
  id: 'createDreamTimeline',
  name: 'Create Dream Timeline',
  description: 'Create an actionable timeline for pursuing dreams',
  domain: 'meaning',
  tags: ['dreams', 'planning', 'timeline'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: 'Create a timeline for pursuing dreams',
      parameters: z.object({
        dream: z.string().describe('The dream to pursue'),
        timeframe: z.string().optional().describe('Desired timeframe'),
      }),
      execute: async ({ dream, timeframe }) => {
        log.info({ agentId: ctx.agentId, dream }, 'Creating dream timeline');

        let response = `**Dream Timeline: ${dream}**\n\n`;

        if (timeframe) {
          response += `Target timeframe: ${timeframe}\n\n`;
        }

        response += `Dreams become real when we work backward from the vision to today.\n\n`;

        response += `**Timeline Framework:**\n\n`;

        response += `**1. Vision (End State)**\n`;
        response += `Describe your dream as if it's already happened:\n`;
        response += `- What does it look like?\n`;
        response += `- How does it feel?\n`;
        response += `- What's different about your life?\n\n`;

        response += `**2. Milestones (Major Steps)**\n`;
        response += `Break down into 3-5 major milestones:\n`;
        response += `- What needs to happen first?\n`;
        response += `- What comes next?\n`;
        response += `- What's the final leap?\n\n`;

        response += `**3. This Year**\n`;
        response += `What progress can you make in the next 12 months?\n`;
        response += `- What's achievable but stretching?\n`;
        response += `- What foundations need to be laid?\n\n`;

        response += `**4. This Quarter**\n`;
        response += `What specific actions in the next 90 days?\n`;
        response += `- Name 1-3 concrete steps\n`;
        response += `- When will you do them?\n\n`;

        response += `**5. This Week**\n`;
        response += `What's ONE thing you can do in the next 7 days to move toward your dream?\n\n`;

        response += `---\n\n`;
        response += `**Remember:**\n`;
        response += `- Progress > perfection\n`;
        response += `- Small steps accumulate\n`;
        response += `- Adjust the plan as you learn\n\n`;

        response += `What's the first milestone for your dream?`;

        return response;
      },
    });
  },
};

const trackDreamProgressDef: ToolDefinition = {
  id: 'trackDreamProgress',
  name: 'Track Dream Progress',
  description: 'Track progress toward dreams',
  domain: 'meaning',
  tags: ['dreams', 'tracking', 'progress'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: 'Track progress toward dreams',
      parameters: z.object({
        dream: z.string().optional().describe('The dream being tracked'),
        update: z.string().optional().describe('Progress update'),
      }),
      execute: async ({ dream, update }) => {
        log.info({ agentId: ctx.agentId, dream }, 'Tracking dream progress');

        let response = `**Dream Progress Check-in**\n\n`;

        if (dream) {
          response += `Dream: ${dream}\n\n`;
        }

        if (update) {
          response += `Your update: ${update}\n\n`;
          response += `That's wonderful progress! Every step matters.\n\n`;
        }

        response += `**Progress Reflection:**\n\n`;

        response += `**1. Wins**\n`;
        response += `What progress have you made, no matter how small?\n`;
        response += `What did you learn?\n`;
        response += `What are you proud of?\n\n`;

        response += `**2. Challenges**\n`;
        response += `What obstacles have you encountered?\n`;
        response += `What's been harder than expected?\n`;
        response += `What adjustments might help?\n\n`;

        response += `**3. Still True?**\n`;
        response += `Is this dream still calling to you?\n`;
        response += `Has it evolved or shifted?\n`;
        response += `Are you pursuing YOUR dream or someone else's?\n\n`;

        response += `**4. Next Steps**\n`;
        response += `What's the next action?\n`;
        response += `What support do you need?\n`;
        response += `What's in your way?\n\n`;

        response += `How do you feel about your progress?`;

        return response;
      },
    });
  },
};

const celebrateDreamProgressDef: ToolDefinition = {
  id: 'celebrateDreamProgress',
  name: 'Celebrate Dream Progress',
  description: 'Acknowledge and celebrate progress',
  domain: 'meaning',
  tags: ['dreams', 'celebration', 'acknowledgment'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: 'Celebrate progress toward dreams',
      parameters: z.object({
        achievement: z.string().describe('What was achieved'),
        dream: z.string().optional().describe('Related dream'),
      }),
      execute: async ({ achievement, dream }) => {
        log.info({ agentId: ctx.agentId, achievement }, 'Celebrating dream progress');

        let response = `**Celebration Time! 🎉**\n\n`;

        response += `Achievement: ${achievement}\n`;
        if (dream) {
          response += `Part of your dream: ${dream}\n`;
        }
        response += `\n`;

        response += `This matters. Let's honor it.\n\n`;

        response += `**Why Celebration Is Important:**\n`;
        response += `- It reinforces the behavior\n`;
        response += `- It builds momentum and motivation\n`;
        response += `- It acknowledges you're on the path\n`;
        response += `- It makes the journey enjoyable\n\n`;

        response += `**Reflection:**\n\n`;

        response += `**What made this possible?**\n`;
        response += `What effort, courage, or growth led to this?\n\n`;

        response += `**How does it feel?**\n`;
        response += `Take a moment to actually feel the accomplishment.\n\n`;

        response += `**What does this prove?**\n`;
        response += `What does this achievement show you about yourself?\n\n`;

        response += `---\n\n`;
        response += `You took a step toward your dream. That takes courage.\n`;
        response += `I see you. I'm proud of you.\n\n`;

        response += `What made this achievement meaningful to you?`;

        return response;
      },
    });
  },
};

const reconnectWithDreamDef: ToolDefinition = {
  id: 'reconnectWithDream',
  name: 'Reconnect With Dream',
  description: 'Reconnect with a dream that has faded',
  domain: 'meaning',
  tags: ['dreams', 'reconnection', 'motivation'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: 'Help reconnect with faded dreams',
      parameters: z.object({
        dream: z.string().optional().describe('The dream to reconnect with'),
        whatHappened: z.string().optional().describe('What caused disconnection'),
      }),
      execute: async ({ dream, whatHappened }) => {
        log.info({ agentId: ctx.agentId, dream }, 'Reconnecting with dream');

        let response = `**Reconnecting With Your Dream**\n\n`;

        if (dream) {
          response += `Dream: ${dream}\n\n`;
        }

        response += `Dreams don't die - they sometimes go dormant. Let's wake yours up.\n\n`;

        response += `**Understanding the Disconnection:**\n\n`;

        response += `**Common Reasons Dreams Fade:**\n`;
        response += `- Life got busy and priorities shifted\n`;
        response += `- Fear of failure made it easier to not try\n`;
        response += `- Others' opinions dimmed your enthusiasm\n`;
        response += `- You didn't see immediate results\n`;
        response += `- The dream evolved but you didn't update it\n\n`;

        if (whatHappened) {
          response += `You shared: "${whatHappened}"\n\n`;
          response += `That makes sense. Life happens. The question is: does this dream still matter?\n\n`;
        }

        response += `**Reconnection Exercise:**\n\n`;

        response += `**1. Remember the Original Spark**\n`;
        response += `Why did this dream matter to you in the first place?\n`;
        response += `What feeling were you chasing?\n\n`;

        response += `**2. Check the Present**\n`;
        response += `Does this still call to you?\n`;
        response += `Or has the dream evolved into something new?\n\n`;

        response += `**3. Tiny Reignition**\n`;
        response += `What's the smallest possible action to reconnect?\n`;
        response += `Not the whole dream - just a touch of it.\n\n`;

        response += `**4. Remove the Pressure**\n`;
        response += `You don't have to have it all figured out.\n`;
        response += `You just have to take one step.\n\n`;

        response += `What originally made this dream so compelling?`;

        return response;
      },
    });
  },
};

const dreamAccountabilityDef: ToolDefinition = {
  id: 'dreamAccountability',
  name: 'Dream Accountability',
  description: 'Accountability for pursuing dreams',
  domain: 'meaning',
  tags: ['dreams', 'accountability', 'commitment'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: 'Provide dream accountability',
      parameters: z.object({
        dream: z.string().describe('The dream'),
        commitment: z.string().optional().describe('Specific commitment made'),
      }),
      execute: async ({ dream, commitment }) => {
        log.info({ agentId: ctx.agentId, dream }, 'Dream accountability');

        let response = `**Dream Accountability**\n\n`;

        response += `Dream: ${dream}\n`;
        if (commitment) {
          response += `Your commitment: ${commitment}\n`;
        }
        response += `\n`;

        response += `I'll be here to support you and check in on your progress.\n\n`;

        response += `**Accountability Structure:**\n\n`;

        response += `**1. Clear Commitment**\n`;
        response += `What specifically are you committing to?\n`;
        response += `By when?\n`;
        response += `How will you know you've done it?\n\n`;

        response += `**2. Check-in Schedule**\n`;
        response += `When would you like me to check in?\n`;
        response += `- Daily (for urgent momentum)\n`;
        response += `- Weekly (for steady progress)\n`;
        response += `- After specific milestones\n\n`;

        response += `**3. Obstacle Anticipation**\n`;
        response += `What might get in the way?\n`;
        response += `What's your plan when that happens?\n\n`;

        response += `**4. Celebration Plan**\n`;
        response += `How will you celebrate when you follow through?\n\n`;

        response += `---\n\n`;
        response += `I believe in you and your dream.\n`;
        response += `What's the first commitment you want to make?`;

        return response;
      },
    });
  },
};

// ============================================================================
// MEANING & PURPOSE TOOLS
// ============================================================================

const meaningMakingDef: ToolDefinition = {
  id: 'meaningMaking',
  name: 'Meaning Making',
  description: 'Find meaning in experiences and life',
  domain: 'meaning',
  tags: ['meaning', 'purpose', 'reflection'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: 'Help find meaning in experiences',
      parameters: z.object({
        experience: z.string().optional().describe('Experience to find meaning in'),
        question: z.string().optional().describe('Meaning question'),
      }),
      execute: async ({ experience, question }) => {
        log.info({ agentId: ctx.agentId, experience }, 'Finding meaning');

        let response = `**Finding Meaning**\n\n`;

        if (experience) {
          response += `Experience: ${experience}\n\n`;
        }

        response += `Meaning isn't found - it's made. We create meaning through how we interpret and respond to life.\n\n`;

        response += `**Sources of Meaning:**\n\n`;

        response += `**1. Contribution**\n`;
        response += `How does what you do matter to others?\n`;
        response += `What difference do you make?\n`;
        response += `Who benefits from your existence?\n\n`;

        response += `**2. Connection**\n`;
        response += `What relationships give your life meaning?\n`;
        response += `How do you matter to specific people?\n`;
        response += `What love exists in your life?\n\n`;

        response += `**3. Creation**\n`;
        response += `What do you create or build?\n`;
        response += `What expression of yourself exists in the world?\n`;
        response += `What will outlast you?\n\n`;

        response += `**4. Growth**\n`;
        response += `How are you becoming more yourself?\n`;
        response += `What are you learning?\n`;
        response += `Who are you becoming?\n\n`;

        response += `**5. Transcendence**\n`;
        response += `What connects you to something larger?\n`;
        response += `Nature? Spirituality? Art? Community?\n\n`;

        if (question) {
          response += `---\n\nYour question: "${question}"\n\n`;
        }

        response += `What gives your life the most meaning right now?`;

        return response;
      },
    });
  },
};

const createPurposeStatementDef: ToolDefinition = {
  id: 'createPurposeStatement',
  name: 'Create Purpose Statement',
  description: 'Craft a personal purpose statement',
  domain: 'meaning',
  tags: ['purpose', 'mission', 'values'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: 'Help create a purpose statement',
      parameters: z.object({
        values: z.array(z.string()).optional().describe('Core values'),
        strengths: z.array(z.string()).optional().describe('Key strengths'),
      }),
      execute: async ({ values, strengths }) => {
        log.info({ agentId: ctx.agentId }, 'Creating purpose statement');

        let response = `**Creating Your Purpose Statement**\n\n`;

        response += `A purpose statement captures your "why" - what you're here to do.\n\n`;

        if (values && values.length > 0) {
          response += `Your values: ${values.join(', ')}\n`;
        }
        if (strengths && strengths.length > 0) {
          response += `Your strengths: ${strengths.join(', ')}\n`;
        }
        if (values || strengths) response += `\n`;

        response += `**Building Blocks:**\n\n`;

        response += `**1. What You Value**\n`;
        response += `What principles guide your life?\n`;
        response += `What do you care about most deeply?\n\n`;

        response += `**2. What You're Good At**\n`;
        response += `What are your unique gifts and strengths?\n`;
        response += `What comes naturally to you?\n\n`;

        response += `**3. What the World Needs**\n`;
        response += `What problems do you feel called to address?\n`;
        response += `What needs can you uniquely meet?\n\n`;

        response += `**4. What You Love**\n`;
        response += `What activities energize you?\n`;
        response += `When do you feel most alive?\n\n`;

        response += `**Purpose Statement Template:**\n\n`;
        response += `"I exist to [action/contribution] for [who you serve] so that [impact/outcome]."\n\n`;

        response += `**Examples:**\n`;
        response += `- "I exist to inspire people to see their potential so that they live courageously."\n`;
        response += `- "I exist to create beauty and order for families so that homes become sanctuaries."\n`;
        response += `- "I exist to translate complex ideas for curious minds so that knowledge becomes accessible."\n\n`;

        response += `Let's craft yours. What values feel central to your purpose?`;

        return response;
      },
    });
  },
};

const meaningfulWorkDef: ToolDefinition = {
  id: 'meaningfulWork',
  name: 'Meaningful Work',
  description: 'Find or create meaning in work',
  domain: 'meaning',
  tags: ['work', 'meaning', 'purpose'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: 'Help find meaning in work',
      parameters: z.object({
        currentWork: z.string().optional().describe('Current work'),
        struggle: z.string().optional().describe('Work meaning struggle'),
      }),
      execute: async ({ currentWork, struggle }) => {
        log.info({ agentId: ctx.agentId, currentWork }, 'Finding meaningful work');

        let response = `**Finding Meaning in Work**\n\n`;

        if (currentWork) {
          response += `Current work: ${currentWork}\n\n`;
        }

        if (struggle) {
          response += `Struggle: ${struggle}\n\n`;
        }

        response += `Work can be a source of deep meaning - or a source of emptiness. Let's explore.\n\n`;

        response += `**Three Orientations to Work:**\n\n`;

        response += `**1. Job** (It's a paycheck)\n`;
        response += `Work is a means to an end\n`;
        response += `Meaning comes from what the paycheck enables\n`;
        response += `This is valid - not everyone needs to love their work\n\n`;

        response += `**2. Career** (It's a path)\n`;
        response += `Work is about advancement and achievement\n`;
        response += `Meaning comes from progress and success\n`;
        response += `Can be fulfilling but also consuming\n\n`;

        response += `**3. Calling** (It's purpose)\n`;
        response += `Work is an expression of who you are\n`;
        response += `Meaning is intrinsic to the work itself\n`;
        response += `Rare, but can be cultivated\n\n`;

        response += `**Creating Meaning Where You Are:**\n\n`;
        response += `- **Job craft** your role (add meaning-making tasks)\n`;
        response += `- Focus on who you help and how\n`;
        response += `- Build relationships at work\n`;
        response += `- Bring your values into how you work\n`;
        response += `- See the bigger picture your work contributes to\n\n`;

        response += `What would make your work feel more meaningful?`;

        return response;
      },
    });
  },
};

const alignWithValuesDef: ToolDefinition = {
  id: 'alignWithValues',
  name: 'Align With Values',
  description: 'Align life with core values',
  domain: 'meaning',
  tags: ['values', 'alignment', 'integrity'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: 'Help align life with values',
      parameters: z.object({
        values: z.array(z.string()).optional().describe('Core values'),
        area: z.string().optional().describe('Life area to align'),
      }),
      execute: async ({ values, area }) => {
        log.info({ agentId: ctx.agentId, values, area }, 'Aligning with values');

        let response = `**Values Alignment**\n\n`;

        if (values && values.length > 0) {
          response += `Your stated values: ${values.join(', ')}\n\n`;
        }

        if (area) {
          response += `Focus area: ${area}\n\n`;
        }

        response += `Living in alignment with your values creates integrity and peace. Misalignment creates inner conflict.\n\n`;

        response += `**Values Clarification:**\n\n`;
        response += `If you're unsure of your values, consider:\n`;
        response += `- What would you sacrifice for?\n`;
        response += `- When you're proudest, what value were you honoring?\n`;
        response += `- When you're most upset, what value was violated?\n`;
        response += `- What would you want said at your funeral?\n\n`;

        response += `**Alignment Check:**\n\n`;
        response += `For each value, ask:\n`;
        response += `- How does my time reflect this value?\n`;
        response += `- How does my money reflect this value?\n`;
        response += `- How do my relationships reflect this value?\n`;
        response += `- How does my work reflect this value?\n\n`;

        response += `**Creating Alignment:**\n\n`;
        response += `- Identify one misalignment to address\n`;
        response += `- Make one decision that honors your values\n`;
        response += `- Set boundaries that protect what matters\n`;
        response += `- Let go of what conflicts with who you want to be\n\n`;

        response += `What value feels most important to live more fully?`;

        return response;
      },
    });
  },
};

// ============================================================================
// SPIRITUAL & PHILOSOPHICAL TOOLS
// ============================================================================

const spiritualExplorationDef: ToolDefinition = {
  id: 'spiritualExploration',
  name: 'Spiritual Exploration',
  description: 'Explore spirituality and transcendence',
  domain: 'meaning',
  tags: ['spirituality', 'transcendence', 'exploration'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: 'Support spiritual exploration',
      parameters: z.object({
        topic: z.string().optional().describe('Spiritual topic to explore'),
        tradition: z.string().optional().describe('Spiritual tradition if any'),
      }),
      execute: async ({ topic, tradition }) => {
        log.info({ agentId: ctx.agentId, topic }, 'Supporting spiritual exploration');

        let response = `**Spiritual Exploration**\n\n`;

        if (topic) {
          response += `Topic: ${topic}\n\n`;
        }

        response += `Spirituality is deeply personal. I'm here to explore, not to prescribe.\n\n`;

        response += `**Domains of Spirituality:**\n\n`;

        response += `**1. Transcendence**\n`;
        response += `Connection to something larger than yourself\n`;
        response += `Awe, wonder, mystery\n`;
        response += `Moments of unity or oneness\n\n`;

        response += `**2. Meaning & Purpose**\n`;
        response += `Why are we here?\n`;
        response += `What's my purpose?\n`;
        response += `What happens after death?\n\n`;

        response += `**3. Connection**\n`;
        response += `To others, to nature, to the universe\n`;
        response += `Compassion and love as spiritual practice\n`;
        response += `Community and belonging\n\n`;

        response += `**4. Inner Life**\n`;
        response += `Prayer, meditation, contemplation\n`;
        response += `Cultivating presence and awareness\n`;
        response += `Inner peace and equanimity\n\n`;

        response += `**5. Ethical Living**\n`;
        response += `How should I live?\n`;
        response += `What's good? What's right?\n`;
        response += `Service and contribution\n\n`;

        response += `**Exploration Approaches:**\n`;
        response += `- Reading wisdom texts across traditions\n`;
        response += `- Meditation or contemplative practice\n`;
        response += `- Time in nature\n`;
        response += `- Service to others\n`;
        response += `- Community with seekers\n`;
        response += `- Art and beauty\n\n`;

        response += `What aspect of spirituality are you most drawn to explore?`;

        return response;
      },
    });
  },
};

const existentialExplorationDef: ToolDefinition = {
  id: 'existentialExploration',
  name: 'Existential Exploration',
  description: 'Explore existential questions',
  domain: 'meaning',
  tags: ['existential', 'philosophy', 'questions'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: 'Explore existential questions',
      parameters: z.object({
        question: z.string().optional().describe('The existential question'),
      }),
      execute: async ({ question }) => {
        log.info({ agentId: ctx.agentId, question }, 'Exploring existential questions');

        let response = `**Existential Exploration**\n\n`;

        if (question) {
          response += `Your question: ${question}\n\n`;
        }

        response += `The big questions don't have easy answers - but asking them is part of being fully human.\n\n`;

        response += `**Core Existential Questions:**\n\n`;

        response += `**1. Meaning**\n`;
        response += `Does life have inherent meaning, or do we create it?\n`;
        response += `What makes a life meaningful?\n\n`;

        response += `**2. Freedom**\n`;
        response += `How free are we really?\n`;
        response += `What do we do with our freedom?\n`;
        response += `What responsibility comes with it?\n\n`;

        response += `**3. Death**\n`;
        response += `How does mortality shape how we live?\n`;
        response += `What, if anything, survives death?\n`;
        response += `How do we face our finitude?\n\n`;

        response += `**4. Isolation**\n`;
        response += `Can we ever truly know another person?\n`;
        response += `How do we bridge the gap between selves?\n`;
        response += `What is the balance of alone vs. connected?\n\n`;

        response += `**5. Authenticity**\n`;
        response += `What does it mean to be true to yourself?\n`;
        response += `How do we live authentically in an inauthentic world?\n\n`;

        response += `**Living the Questions:**\n`;
        response += `As Rilke said, "Live the questions now." We don't need answers to live well. The questioning itself is meaningful.\n\n`;

        response += `What existential question is most alive for you right now?`;

        return response;
      },
    });
  },
};

const philosophicalInquiryDef: ToolDefinition = {
  id: 'philosophicalInquiry',
  name: 'Philosophical Inquiry',
  description: 'Engage in philosophical exploration',
  domain: 'meaning',
  tags: ['philosophy', 'inquiry', 'wisdom'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: 'Engage in philosophical inquiry',
      parameters: z.object({
        topic: z.string().optional().describe('Philosophical topic'),
        tradition: z.enum(['western', 'eastern', 'both', 'practical']).optional(),
      }),
      execute: async ({ topic, tradition }) => {
        log.info({ agentId: ctx.agentId, topic }, 'Philosophical inquiry');

        let response = `**Philosophical Inquiry**\n\n`;

        if (topic) {
          response += `Topic: ${topic}\n\n`;
        }

        response += `Philosophy is the love of wisdom - the practice of thinking carefully about life's most important questions.\n\n`;

        response += `**Approaches to Philosophy:**\n\n`;

        response += `**Western Philosophy:**\n`;
        response += `- Stoicism: What's within our control? How do we respond to what isn't?\n`;
        response += `- Existentialism: We create our own meaning through our choices\n`;
        response += `- Pragmatism: What difference does it make in practice?\n`;
        response += `- Virtue Ethics: What character should we cultivate?\n\n`;

        response += `**Eastern Philosophy:**\n`;
        response += `- Buddhism: The nature of suffering and the path to liberation\n`;
        response += `- Taoism: Flowing with the nature of things\n`;
        response += `- Zen: Direct experience beyond concepts\n`;
        response += `- Yoga Philosophy: Union of self with the whole\n\n`;

        response += `**Practical Philosophy:**\n`;
        response += `How should I live? What matters? What's the good life?\n\n`;

        response += `**Philosophical Method:**\n`;
        response += `- Question assumptions\n`;
        response += `- Examine arguments and evidence\n`;
        response += `- Consider multiple perspectives\n`;
        response += `- Apply insights to life\n`;
        response += `- Stay humble - wisdom knows its limits\n\n`;

        response += `What philosophical question would you like to explore?`;

        return response;
      },
    });
  },
};

const exploreLegacyDef: ToolDefinition = {
  id: 'exploreLegacy',
  name: 'Explore Legacy',
  description: 'Reflect on the legacy you want to leave',
  domain: 'meaning',
  tags: ['legacy', 'meaning', 'reflection'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: 'Help explore legacy',
      parameters: z.object({
        timeframe: z.string().optional().describe('Life stage'),
        concern: z.string().optional().describe('Legacy concern'),
      }),
      execute: async ({ timeframe, concern }) => {
        log.info({ agentId: ctx.agentId }, 'Exploring legacy');

        let response = `**Legacy Reflection**\n\n`;

        response += `Legacy isn't just for the end of life - it's created in how we live each day.\n\n`;

        if (concern) {
          response += `Your concern: ${concern}\n\n`;
        }

        response += `**Dimensions of Legacy:**\n\n`;

        response += `**1. Impact on People**\n`;
        response += `How have you touched individual lives?\n`;
        response += `Who is different because of you?\n`;
        response += `What have you given that lasts?\n\n`;

        response += `**2. Contribution to Community**\n`;
        response += `What have you built or improved?\n`;
        response += `What problems have you helped solve?\n`;
        response += `What will continue without you?\n\n`;

        response += `**3. Wisdom Passed On**\n`;
        response += `What have you learned that should be shared?\n`;
        response += `What would you tell the next generation?\n`;
        response += `What mistakes should be avoided?\n\n`;

        response += `**4. Who You've Been**\n`;
        response += `What kind of person have you been?\n`;
        response += `What values have you embodied?\n`;
        response += `How will you be remembered?\n\n`;

        response += `**Legacy Questions:**\n`;
        response += `- What do you want your grandchildren to know about you?\n`;
        response += `- What would you want said at your funeral?\n`;
        response += `- If you died tomorrow, what would remain unfinished?\n`;
        response += `- What could you start today that would outlast you?\n\n`;

        response += `What kind of legacy do you want to leave?`;

        return response;
      },
    });
  },
};

const moralDilemmaDef: ToolDefinition = {
  id: 'moralDilemma',
  name: 'Moral Dilemma',
  description: 'Work through ethical dilemmas',
  domain: 'meaning',
  tags: ['ethics', 'morality', 'decisions'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: 'Help work through moral dilemmas',
      parameters: z.object({
        dilemma: z.string().describe('The moral dilemma'),
        stakeholders: z.array(z.string()).optional().describe('People affected'),
      }),
      execute: async ({ dilemma, stakeholders }) => {
        log.info({ agentId: ctx.agentId }, 'Working through moral dilemma');

        let response = `**Working Through a Moral Dilemma**\n\n`;

        response += `Dilemma: ${dilemma}\n\n`;

        if (stakeholders && stakeholders.length > 0) {
          response += `People affected: ${stakeholders.join(', ')}\n\n`;
        }

        response += `Ethical dilemmas are difficult because values we care about are in conflict. There may not be a "right" answer.\n\n`;

        response += `**Ethical Frameworks:**\n\n`;

        response += `**1. Consequences (Utilitarian)**\n`;
        response += `Which choice produces the most good/least harm overall?\n`;
        response += `Consider all affected parties.\n\n`;

        response += `**2. Duties (Deontological)**\n`;
        response += `What rules or principles apply here?\n`;
        response += `What would happen if everyone did this?\n`;
        response += `Are you treating people as ends, not just means?\n\n`;

        response += `**3. Character (Virtue Ethics)**\n`;
        response += `What would a person of good character do?\n`;
        response += `What virtues are relevant (honesty, courage, compassion)?\n`;
        response += `What kind of person do you want to be?\n\n`;

        response += `**4. Care (Ethics of Care)**\n`;
        response += `What do the relationships involved require?\n`;
        response += `How do you preserve care and connection?\n\n`;

        response += `**Process:**\n`;
        response += `1. Get clear on the facts\n`;
        response += `2. Identify all stakeholders\n`;
        response += `3. Consider each framework\n`;
        response += `4. Notice where they agree/disagree\n`;
        response += `5. Decide - and be prepared to own it\n\n`;

        response += `Let's think through this together. What values feel most important here?`;

        return response;
      },
    });
  },
};

// ============================================================================
// DOMAIN TOOLS COLLECTION
// ============================================================================

const purposeMeaningTools: ToolDefinition[] = [
  // Dreams & Aspirations
  clarifyDreamDef,
  createDreamTimelineDef,
  trackDreamProgressDef,
  celebrateDreamProgressDef,
  reconnectWithDreamDef,
  dreamAccountabilityDef,

  // Meaning & Purpose
  meaningMakingDef,
  createPurposeStatementDef,
  meaningfulWorkDef,
  alignWithValuesDef,

  // Spiritual & Philosophical
  spiritualExplorationDef,
  existentialExplorationDef,
  philosophicalInquiryDef,
  exploreLegacyDef,
  moralDilemmaDef,
];

// ============================================================================
// EXPORTS
// ============================================================================

export const { getToolDefinitions, domain, definitions } = createDomainExport(
  'meaning',
  purposeMeaningTools
);

export default getToolDefinitions;

