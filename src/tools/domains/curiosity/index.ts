/**
 * Curiosity & Wonder Domain Tools
 *
 * Tools for nurturing curiosity, experiencing wonder, and exploring mystery.
 * This domain cultivates the childlike capacity for awe and questioning.
 *
 * DOMAIN: curiosity
 * TOOLS:
 *   Questions: captureQuestion, exploreQuestion, questionEverything
 *   Wonder: experienceWonder, noticeAwe, cultivateBeginnersMind
 *   Exploration: intellectualExploration, satisfyCuriosity, embraceMystery
 */

import { createDomainExport } from '../../registry/loader.js';
import type { ToolDefinition, ToolContext, Tool } from '../../registry/types.js';
import { llm, log } from '@livekit/agents';
import { getLogger } from '../../../utils/safe-logger.js';
import { z } from 'zod';

// ============================================================================
// QUESTION TOOLS
// ============================================================================

const captureQuestionDef: ToolDefinition = {
  id: 'captureQuestion',
  name: 'Capture Question',
  description: 'Capture a question that deserves exploration',
  domain: 'curiosity',
  tags: ['curiosity', 'questions', 'capture'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: 'Help the user capture and save a question they want to explore.',
      parameters: z.object({
        question: z.string().describe('The question to capture'),
        context: z.string().optional().describe('What sparked this question'),
        urgency: z
          .enum(['burning', 'curious', 'someday'])
          .optional()
          .describe('How urgently they want to explore'),
      }),
      execute: async ({ question, context, urgency }) => {
        getLogger().info({ agentId: ctx.agentId, urgency }, 'Capturing question');

        let response = `What a beautiful question to carry: "${question}"\n\n`;
        if (context) response += `Sparked by: ${context}\n\n`;

        response += `Questions are gifts. They keep us alive to the world.\n\n`;
        response += `Some questions are meant to be answered. Some are meant to be lived with. Some are meant to change us just by asking them.\n\n`;

        if (urgency === 'burning') {
          response += `This one feels urgent. Would you like to explore it now?`;
        } else if (urgency === 'curious') {
          response += `I'll hold onto this. Would you like to explore it, or let it simmer?`;
        } else {
          response += `Sometimes the best questions wait for us to be ready. I'll remember this one.`;
        }

        return response;
      },
    });
  },
};

const exploreQuestionDef: ToolDefinition = {
  id: 'exploreQuestion',
  name: 'Explore Question',
  description: 'Deep exploration of a question without rushing to answers',
  domain: 'curiosity',
  tags: ['curiosity', 'exploration', 'depth'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: 'Guide deep exploration of a question without rushing to answers.',
      parameters: z.object({
        question: z.string().describe('The question to explore'),
        approach: z
          .enum(['philosophical', 'practical', 'personal', 'playful', 'open'])
          .describe('How to approach'),
      }),
      execute: async ({ question, approach }) => {
        getLogger().info({ agentId: ctx.agentId, approach }, 'Exploring question');

        let response = `Let's sit with: "${question}"\n\n`;

        if (approach === 'philosophical') {
          response += `**Philosophically:**\n`;
          response += `- What assumptions does this question contain?\n`;
          response += `- What would different philosophers or traditions say?\n`;
          response += `- Is this question even answerable, or is it more like a koan?\n`;
          response += `- What's the deeper question beneath this question?`;
        } else if (approach === 'practical') {
          response += `**Practically:**\n`;
          response += `- If you had the answer, what would change?\n`;
          response += `- What would help you find out?\n`;
          response += `- Who might know something about this?\n`;
          response += `- What experiment could test possible answers?`;
        } else if (approach === 'personal') {
          response += `**Personally:**\n`;
          response += `- Why does this question matter to you specifically?\n`;
          response += `- What in your life brought you to this question?\n`;
          response += `- What are you really asking underneath this question?\n`;
          response += `- What would be at stake in different answers?`;
        } else if (approach === 'playful') {
          response += `**Playfully:**\n`;
          response += `- What if the opposite were true?\n`;
          response += `- What would a child say to this?\n`;
          response += `- What's the most absurd answer?\n`;
          response += `- What would this question look like from another planet?`;
        } else {
          response += `Let's just be with it. No agenda. What comes up as you hold this question?`;
        }

        return response;
      },
    });
  },
};

// ============================================================================
// WONDER TOOLS
// ============================================================================

const experienceWonderDef: ToolDefinition = {
  id: 'experienceWonder',
  name: 'Experience Wonder',
  description: 'Cultivate and capture experiences of wonder',
  domain: 'curiosity',
  tags: ['curiosity', 'wonder', 'awe'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: 'Help the user cultivate and capture experiences of wonder and awe.',
      parameters: z.object({
        wonderAbout: z.string().optional().describe('What sparked wonder'),
        mode: z
          .enum(['capture', 'cultivate', 'remember'])
          .describe('Whether capturing, cultivating, or remembering wonder'),
      }),
      execute: async ({ wonderAbout, mode }) => {
        getLogger().info({ agentId: ctx.agentId, mode }, 'Experiencing wonder');

        let response = '';

        if (mode === 'capture') {
          response = `You experienced wonder about: ${wonderAbout}\n\n`;
          response += `Let's hold onto this.\n\n`;
          response += `Wonder is fleeting. We walk past miracles every day without seeing them. But you stopped and noticed.\n\n`;
          response += `What was it like? Try to capture not just what you saw, but how it felt - that opening, that "oh..."\n\n`;
          response += `Describe it so you can return to this feeling.`;
        } else if (mode === 'cultivate') {
          response = `**Cultivating Wonder**\n\n`;
          response += `Wonder isn't just something that happens to us. We can practice it.\n\n`;
          response += `- **Look up** at the sky, trees, buildings - we rarely look up\n`;
          response += `- **Look closely** at anything - your hand, a leaf, a stranger's face\n`;
          response += `- **Consider the improbable** - that you exist, that anything exists\n`;
          response += `- **Ask "how?"** about ordinary things - how does this phone work, really?\n`;
          response += `- **Pretend you're from another time or planet** - what would amaze you?\n\n`;
          response += `What might you practice noticing today?`;
        } else {
          response = `**Remembered Wonder**\n\n`;
          response += `What moments of wonder stay with you?\n\n`;
          response += `- A sunset that stopped you\n`;
          response += `- Something you learned that blew your mind\n`;
          response += `- A moment of "how is this possible?"\n`;
          response += `- A time you felt small in the best way\n\n`;
          response += `Tell me about a moment of wonder you carry with you.`;
        }

        return response;
      },
    });
  },
};

const cultivateBeginnersMindDef: ToolDefinition = {
  id: 'cultivateBeginnersMind',
  name: 'Cultivate Beginners Mind',
  description: 'Practice seeing with fresh, beginner eyes',
  domain: 'curiosity',
  tags: ['curiosity', 'beginners-mind', 'freshness'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: 'Help the user practice seeing something familiar with fresh, beginner eyes.',
      parameters: z.object({
        subjectToSee: z.string().describe('What to see with beginner eyes'),
      }),
      execute: async ({ subjectToSee }) => {
        getLogger().info({ agentId: ctx.agentId }, 'Cultivating beginners mind');

        let response = `"In the beginner's mind there are many possibilities, but in the expert's there are few." - Shunryu Suzuki\n\n`;
        response += `Let's see ${subjectToSee} with fresh eyes.\n\n`;
        response += `**Practice:**\n`;
        response += `- Pretend you've never encountered this before\n`;
        response += `- What would you notice if you had no context?\n`;
        response += `- What questions would you ask?\n`;
        response += `- What assumptions are you making that you could set aside?\n`;
        response += `- What might you be missing because you "already know"?\n\n`;
        response += `The familiar becomes invisible. To see it again, we have to unknow what we know.\n\n`;
        response += `What do you notice when you look at ${subjectToSee} as if for the first time?`;

        return response;
      },
    });
  },
};

// ============================================================================
// EXPLORATION TOOLS
// ============================================================================

const intellectualExplorationDef: ToolDefinition = {
  id: 'intellectualExploration',
  name: 'Intellectual Exploration',
  description: 'Follow a thread of intellectual curiosity',
  domain: 'curiosity',
  tags: ['curiosity', 'intellectual', 'learning'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: 'Help the user follow a thread of intellectual curiosity.',
      parameters: z.object({
        curiosityAbout: z.string().describe('What they are curious about'),
        depth: z.enum(['surface', 'deep', 'comprehensive']).describe('How deep they want to go'),
      }),
      execute: async ({ curiosityAbout, depth }) => {
        getLogger().info(
          { agentId: ctx.agentId, curiosityAbout, depth },
          'Intellectual exploration'
        );

        let response = `Your curiosity is reaching toward: ${curiosityAbout}\n\n`;
        response += `Curiosity is how humans grow. Let's follow this thread.\n\n`;

        if (depth === 'surface') {
          response += `**Quick exploration:**\n`;
          response += `- What's the essence of this topic?\n`;
          response += `- What's most interesting about it to you?\n`;
          response += `- What's one thing you'd like to know?`;
        } else if (depth === 'deep') {
          response += `**Deep dive:**\n`;
          response += `- What draws you to this specifically?\n`;
          response += `- What would change if you understood this deeply?\n`;
          response += `- What are the key questions in this area?\n`;
          response += `- Who are the great thinkers/practitioners to learn from?`;
        } else {
          response += `**Comprehensive exploration:**\n`;
          response += `- What's the history and context?\n`;
          response += `- What are the major perspectives or debates?\n`;
          response += `- How does this connect to other things you know?\n`;
          response += `- What are the unanswered questions?\n`;
          response += `- How could you go from learning to doing/being?`;
        }

        response += `\n\nWhat aspect pulls you most strongly?`;

        return response;
      },
    });
  },
};

const embraceMysteryDef: ToolDefinition = {
  id: 'embraceMystery',
  name: 'Embrace Mystery',
  description: 'Find comfort in not-knowing and mystery',
  domain: 'curiosity',
  tags: ['curiosity', 'mystery', 'not-knowing'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: 'Help the user embrace mystery and find comfort in not-knowing.',
      parameters: z.object({
        mystery: z.string().describe('What remains mysterious'),
        struggle: z
          .enum(['needing-answers', 'uncomfortable', 'curious', 'at-peace'])
          .describe('How they relate to the mystery'),
      }),
      execute: async ({ mystery, struggle }) => {
        getLogger().info({ agentId: ctx.agentId, struggle }, 'Embracing mystery');

        let response = `The mystery: ${mystery}\n\n`;

        if (struggle === 'needing-answers') {
          response += `The need for answers is human. We want to understand, to predict, to control.\n\n`;
          response += `But some things resist our knowing. And that's okay.\n\n`;
          response += `What if mystery isn't a problem to solve but a condition of life to accept?\n\n`;
          response += `What would change if you could hold this question without needing to resolve it?`;
        } else if (struggle === 'uncomfortable') {
          response += `Mystery can feel uncomfortable - like standing at the edge of a cliff.\n\n`;
          response += `We're taught that smart people have answers. That certainty is strength. But:\n\n`;
          response += `- The greatest scientists embrace not-knowing\n`;
          response += `- The wisest traditions point to mystery, not answers\n`;
          response += `- Certainty often closes us; mystery keeps us open\n\n`;
          response += `Can you let the discomfort be here without trying to fix it?`;
        } else if (struggle === 'curious') {
          response += `Beautiful - you're curious about the mystery itself.\n\n`;
          response += `This is the gift: to wonder rather than demand answers.\n\n`;
          response += `Let the mystery be a doorway, not a wall. What do you notice when you lean into not-knowing?`;
        } else {
          response += `You've found peace with this mystery. That's rare and precious.\n\n`;
          response += `"The most beautiful thing we can experience is the mysterious." - Einstein\n\n`;
          response += `What does this peace feel like? And how did you come to it?`;
        }

        return response;
      },
    });
  },
};

const whatIfDef: ToolDefinition = {
  id: 'whatIf',
  name: 'What If',
  description: 'Explore imaginative what-if questions',
  domain: 'curiosity',
  tags: ['curiosity', 'imagination', 'what-if'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: 'Explore imaginative "what if" questions playfully.',
      parameters: z.object({
        whatIf: z.string().describe('The what-if question to explore'),
      }),
      execute: async ({ whatIf }) => {
        getLogger().info({ agentId: ctx.agentId }, 'What if exploration');

        let response = `"${whatIf}"\n\n`;
        response += `Let's play with this.\n\n`;
        response += `**If this were true:**\n`;
        response += `- What would change first?\n`;
        response += `- What would be better? What would be worse?\n`;
        response += `- Who would benefit? Who would struggle?\n`;
        response += `- What new problems would emerge?\n`;
        response += `- What new possibilities would open up?\n`;
        response += `- What does exploring this reveal about what you actually want?\n\n`;
        response += `Sometimes our "what ifs" are windows into our desires or fears. What draws you to this particular question?`;

        return response;
      },
    });
  },
};

// ============================================================================
// DOMAIN TOOLS COLLECTION
// ============================================================================

const curiosityTools: ToolDefinition[] = [
  captureQuestionDef,
  exploreQuestionDef,
  experienceWonderDef,
  cultivateBeginnersMindDef,
  intellectualExplorationDef,
  embraceMysteryDef,
  whatIfDef,
];

// ============================================================================
// EXPORTS
// ============================================================================

export const { getToolDefinitions, domain, definitions } = createDomainExport(
  'curiosity',
  curiosityTools
);

export default getToolDefinitions;
