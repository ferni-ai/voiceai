/**
 * Stories & Legacy Domain Tools
 *
 * Tools for capturing life stories, building legacy, and preserving personal history.
 * This domain addresses the human need to make meaning through narrative.
 *
 * DOMAIN: stories
 * TOOLS:
 *   Story: captureLifeStory, exploreLifeChapter, recordOralHistory
 *   Legacy: defineLegacy, writeEthicalWill, createTimeCapsule
 *   Narrative: reflectOnJourney, findNarrativeThread, rewriteStory
 */

import { createDomainExport } from '../../registry/loader.js';
import type { ToolDefinition, ToolContext, Tool } from '../../registry/types.js';
import { llm, log } from '@livekit/agents';
import { getLogger } from '../../../utils/safe-logger.js';
import { z } from 'zod';

// ============================================================================
// LIFE STORY TOOLS
// ============================================================================

const captureLifeStoryDef: ToolDefinition = {
  id: 'captureLifeStory',
  name: 'Capture Life Story',
  description: 'Guide someone through capturing meaningful pieces of their life story',
  domain: 'stories',
  tags: ['stories', 'capture', 'biography'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: 'Help the user capture and preserve a meaningful part of their life story.',
      parameters: z.object({
        focus: z.enum(['childhood', 'defining-moments', 'relationships', 'challenges', 'joys', 'lessons', 'open']).describe('Area to explore'),
        forWhom: z.enum(['self', 'family', 'children', 'posterity', 'anyone']).optional().describe('Who this is for'),
      }),
      execute: async ({ focus, forWhom }) => {
        getLogger().info({ agentId: ctx.agentId, focus, forWhom }, 'Capturing life story');

        const prompts: Record<string, string[]> = {
          childhood: [
            "What's your earliest memory?",
            "What was your childhood home like?",
            "Who were the important people in your early life?",
            "What did you dream of being when you grew up?",
            "What shaped who you became?",
          ],
          'defining-moments': [
            "What moments divided your life into 'before' and 'after'?",
            "When did you become who you are today?",
            "What decision changed everything?",
            "What unexpected turn shaped your path?",
          ],
          relationships: [
            "Who has loved you most in your life?",
            "Which relationship taught you the most?",
            "Who did you lose too soon?",
            "What relationship are you most proud of?",
          ],
          challenges: [
            "What's the hardest thing you've overcome?",
            "What failure taught you the most?",
            "What did you survive that you didn't think you could?",
            "How did difficulty shape your strength?",
          ],
          joys: [
            "What are the happiest moments of your life?",
            "What are you most proud of?",
            "When have you felt most alive?",
            "What brings you the deepest joy?",
          ],
          lessons: [
            "What do you know now that you wish you'd known at 20?",
            "What's the most important thing life taught you?",
            "What advice would you give your younger self?",
            "What truth took you a long time to learn?",
          ],
          open: [
            "What story from your life most wants to be told right now?",
            "What would people be surprised to learn about you?",
            "What do you want to be remembered for?",
          ],
        };

        let response = `Let's capture part of your story.\n\n`;
        if (forWhom && forWhom !== 'self') {
          response += `You mentioned this is for ${forWhom}. That makes it even more precious.\n\n`;
        }

        const questions = prompts[focus];
        response += `**Questions to explore:**\n`;
        questions.forEach((q, i) => { response += `\n${i + 1}. ${q}`; });
        response += `\n\nWhich question calls to you? Or feel free to start wherever you'd like.`;

        return response;
      },
    });
  },
};

const exploreLifeChapterDef: ToolDefinition = {
  id: 'exploreLifeChapter',
  name: 'Explore Life Chapter',
  description: 'Explore a specific chapter or era of life',
  domain: 'stories',
  tags: ['stories', 'chapters', 'eras'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: 'Help the user explore and reflect on a specific chapter or era of their life.',
      parameters: z.object({
        chapterName: z.string().describe('Name or description of this life chapter'),
        timeframe: z.string().optional().describe('When this chapter took place'),
        mood: z.string().optional().describe('The overall feeling of this era'),
      }),
      execute: async ({ chapterName, timeframe, mood }) => {
        getLogger().info({ agentId: ctx.agentId, chapterName }, 'Exploring life chapter');

        let response = `**Chapter: "${chapterName}"**`;
        if (timeframe) response += ` (${timeframe})`;
        if (mood) response += `\n*Mood: ${mood}*`;
        response += `\n\n`;

        response += `Every chapter of life has:\n`;
        response += `- **A setting** - Where were you? What was your world like?\n`;
        response += `- **Characters** - Who were the important people?\n`;
        response += `- **A plot** - What was the central drama or journey?\n`;
        response += `- **A theme** - What was this chapter really about?\n`;
        response += `- **A turning point** - How did it end or transform?\n\n`;

        response += `What stands out when you think about this chapter? Start wherever feels right.`;

        return response;
      },
    });
  },
};

// ============================================================================
// LEGACY TOOLS
// ============================================================================

const defineLegacyDef: ToolDefinition = {
  id: 'defineLegacy',
  name: 'Define Legacy',
  description: 'Explore what legacy means and what you want to leave behind',
  domain: 'stories',
  tags: ['stories', 'legacy', 'meaning'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: 'Help the user think deeply about their legacy - what they want to leave behind.',
      parameters: z.object({
        approach: z.enum(['values', 'impact', 'wisdom', 'relationships', 'comprehensive']).describe('Approach to legacy'),
      }),
      execute: async ({ approach }) => {
        getLogger().info({ agentId: ctx.agentId, approach }, 'Defining legacy');

        let response = `Legacy isn't about monuments. It's about the ripples you leave in the world and in the people you touch.\n\n`;

        if (approach === 'values') {
          response += `**Values Legacy**\nWhat values do you want to have embodied so fully that others catch them from you?\n\n`;
          response += `- What principles have you lived by?\n`;
          response += `- What do you want to be known for standing for?\n`;
          response += `- What values would you want passed to your children or community?`;
        } else if (approach === 'impact') {
          response += `**Impact Legacy**\nHow do you want to have made a difference?\n\n`;
          response += `- Whose life is better because you lived?\n`;
          response += `- What problem did you help solve?\n`;
          response += `- What did you create, build, or grow?`;
        } else if (approach === 'wisdom') {
          response += `**Wisdom Legacy**\nWhat have you learned that deserves to be passed on?\n\n`;
          response += `- What do you know now that took you years to learn?\n`;
          response += `- What mistakes could you help others avoid?\n`;
          response += `- What truths about life do you want to share?`;
        } else if (approach === 'relationships') {
          response += `**Relationship Legacy**\nHow do you want to be remembered by the people in your life?\n\n`;
          response += `- What do you want your children/family to remember?\n`;
          response += `- How do you want to have made people feel?\n`;
          response += `- What would you want said at your funeral?`;
        } else {
          response += `Let's explore your legacy comprehensively. Which feels most important to start with: the values you embody, the impact you make, the wisdom you share, or how you're remembered in relationships?`;
        }

        return response;
      },
    });
  },
};

const writeEthicalWillDef: ToolDefinition = {
  id: 'writeEthicalWill',
  name: 'Write Ethical Will',
  description: 'Guide creation of an ethical will - a document of values and wisdom for loved ones',
  domain: 'stories',
  tags: ['stories', 'legacy', 'ethical-will'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: 'Help the user write an ethical will - a letter of values, hopes, and wisdom for loved ones.',
      parameters: z.object({
        forWhom: z.string().describe('Who this is for'),
        section: z.enum(['gratitude', 'values', 'lessons', 'hopes', 'forgiveness', 'love', 'overview']).describe('Section to work on'),
      }),
      execute: async ({ forWhom, section }) => {
        getLogger().info({ agentId: ctx.agentId, forWhom, section }, 'Writing ethical will');

        let response = `An ethical will is a gift of your heart and wisdom to ${forWhom}.\n\n`;

        const sections: Record<string, string> = {
          overview: `An ethical will typically includes:\n- Gratitude for your life and relationships\n- The values you hope to pass on\n- Life lessons and wisdom\n- Hopes for those you love\n- Forgiveness given and asked for\n- Expressions of love\n\nWhich section would you like to start with?`,
          gratitude: `**Gratitude**\nWhat are you thankful for in your life?\n\nTo ${forWhom}: Thank you for...\nI'm grateful for...\nMy life has been rich because...`,
          values: `**Values**\nWhat principles have guided your life that you want to pass on?\n\n"I hope you will always..." "What matters most is..." "Never compromise on..."`,
          lessons: `**Life Lessons**\nWhat wisdom do you want to share?\n\n"I learned that..." "I wish I'd known sooner..." "The most important thing about life is..."`,
          hopes: `**Hopes**\nWhat do you hope for ${forWhom}?\n\n"I hope you will..." "My dream for you is..." "I believe you can..."`,
          forgiveness: `**Forgiveness**\nIs there forgiveness to offer or ask for?\n\n"I forgive..." "I'm sorry for..." "I hope you can forgive me for..."`,
          love: `**Love**\nWhat do you want them to know about how much you love them?\n\n"I love you because..." "What I want you to always know is..." "You have been..."`,
        };

        response += sections[section];
        return response;
      },
    });
  },
};

// ============================================================================
// NARRATIVE TOOLS
// ============================================================================

const findNarrativeThreadDef: ToolDefinition = {
  id: 'findNarrativeThread',
  name: 'Find Narrative Thread',
  description: 'Discover the through-lines and themes in your life story',
  domain: 'stories',
  tags: ['stories', 'narrative', 'themes'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: 'Help the user discover the recurring themes and narrative threads in their life.',
      parameters: z.object({
        lookedFor: z.enum(['patterns', 'themes', 'heroes-journey', 'central-question']).describe('What to look for'),
      }),
      execute: async ({ lookedFor }) => {
        getLogger().info({ agentId: ctx.agentId, lookedFor }, 'Finding narrative thread');

        let response = '';

        if (lookedFor === 'patterns') {
          response = `**Finding Patterns**\n\nLook across your life story. What keeps showing up?\n\n`;
          response += `- What situations do you find yourself in repeatedly?\n`;
          response += `- What role do you tend to play?\n`;
          response += `- What challenges keep appearing in different forms?\n`;
          response += `- What gifts or strengths consistently emerge?\n\n`;
          response += `Patterns aren't good or bad - they're information about who you are and what you're here to learn.`;
        } else if (lookedFor === 'themes') {
          response = `**Life Themes**\n\nEvery life has themes - the underlying currents that run through everything.\n\n`;
          response += `Some common themes: Belonging, Freedom, Love, Achievement, Service, Justice, Creation, Discovery, Healing\n\n`;
          response += `- What theme seems to run through your major decisions?\n`;
          response += `- What have you been seeking your whole life?\n`;
          response += `- What gives your story coherence?`;
        } else if (lookedFor === 'heroes-journey') {
          response = `**Your Hero's Journey**\n\nThe hero's journey: Ordinary world → Call to adventure → Challenges & allies → The ordeal → Transformation → Return\n\n`;
          response += `- What "ordinary world" did you leave?\n`;
          response += `- What called you to adventure?\n`;
          response += `- Who were your mentors and allies?\n`;
          response += `- What was your greatest ordeal?\n`;
          response += `- How were you transformed?\n`;
          response += `- What did you bring back to share?`;
        } else {
          response = `**Your Central Question**\n\nSome say each life is organized around a central question we're trying to answer.\n\n`;
          response += `Examples: "Am I worthy of love?" "Can I make a difference?" "Where do I belong?" "What is true?"\n\n`;
          response += `What question has your life been trying to answer?`;
        }

        return response;
      },
    });
  },
};

const rewriteStoryDef: ToolDefinition = {
  id: 'rewriteStory',
  name: 'Rewrite Story',
  description: 'Reframe a painful story into a more empowering narrative',
  domain: 'stories',
  tags: ['stories', 'reframe', 'healing'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: 'Help the user reframe a painful or limiting story into a more empowering narrative.',
      parameters: z.object({
        oldStory: z.string().describe('The story as currently told'),
        whatHurts: z.string().describe('What about this story is painful or limiting'),
      }),
      execute: async ({ oldStory, whatHurts }) => {
        getLogger().info({ agentId: ctx.agentId }, 'Rewriting story');

        let response = `The facts of our past can't change. But the story we tell about those facts - the meaning we make - that can transform.\n\n`;
        response += `**Your current story:** ${oldStory}\n`;
        response += `**What hurts:** ${whatHurts}\n\n`;
        response += `**Reframing questions:**\n`;
        response += `- What did you learn or gain from this experience?\n`;
        response += `- How did it make you who you are today?\n`;
        response += `- What strength did you discover you had?\n`;
        response += `- If this was the chapter that led to something better, what was it preparing you for?\n`;
        response += `- If a wise friend told you this story, how might they see it?\n\n`;
        response += `The goal isn't to pretend it didn't hurt. It's to refuse to let that pain be the only story. What would a more complete story include?`;

        return response;
      },
    });
  },
};

// ============================================================================
// PRESERVATION TOOLS
// ============================================================================

const createTimeCapsuleDef: ToolDefinition = {
  id: 'createTimeCapsule',
  name: 'Create Time Capsule',
  description: 'Create a time capsule message to your future self or loved ones',
  domain: 'stories',
  tags: ['stories', 'time-capsule', 'future'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: 'Guide creation of a time capsule message.',
      parameters: z.object({
        recipient: z.enum(['future-self', 'children', 'grandchildren', 'unborn', 'world']).describe('Who the time capsule is for'),
        yearsAhead: z.string().describe('How far in the future to open'),
      }),
      execute: async ({ recipient, yearsAhead }) => {
        getLogger().info({ agentId: ctx.agentId, recipient, yearsAhead }, 'Creating time capsule');

        let response = `**Time Capsule for ${recipient.replace('-', ' ')} - to open in ${yearsAhead}**\n\n`;
        response += `What do you want to preserve for the future?\n\n`;

        response += `**Consider including:**\n\n`;
        response += `**About right now:**\n`;
        response += `- What is the world like today?\n`;
        response += `- What is your life like?\n`;
        response += `- What are you struggling with? Celebrating?\n`;
        response += `- What do you hope will change? Stay the same?\n\n`;

        response += `**About you:**\n`;
        response += `- What do you believe right now?\n`;
        response += `- What do you love?\n`;
        response += `- What are you afraid of?\n`;
        response += `- What are you working toward?\n\n`;

        if (recipient === 'future-self') {
          response += `**Questions for future you:**\n`;
          response += `- Did that thing you were worried about matter?\n`;
          response += `- Are you proud of the choices you made?\n`;
          response += `- What do you know now that you wished you knew then?\n`;
        } else {
          response += `**Messages to leave:**\n`;
          response += `- What do you want them to know about who you were?\n`;
          response += `- What wisdom do you want to share?\n`;
          response += `- What do you want them to know about how much you loved them?\n`;
        }

        response += `\n\nWhat feels most important to capture right now for ${yearsAhead} from now?`;

        return response;
      },
    });
  },
};

const familyStoryPromptsDef: ToolDefinition = {
  id: 'familyStoryPrompts',
  name: 'Family Story Prompts',
  description: 'Prompts for collecting stories from family members',
  domain: 'stories',
  tags: ['stories', 'family', 'interview'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: 'Provide prompts for interviewing family members about their stories.',
      parameters: z.object({
        relationship: z.enum(['parent', 'grandparent', 'elder', 'sibling', 'other-relative']).describe('Who you want to interview'),
        focus: z.enum(['childhood', 'family-history', 'wisdom', 'relationships', 'life-events', 'general']).describe('What to focus on'),
      }),
      execute: async ({ relationship, focus }) => {
        getLogger().info({ agentId: ctx.agentId, relationship, focus }, 'Family story prompts');

        let response = `**Story Prompts for Your ${relationship.replace('-', ' ')}**\n\n`;
        response += `These questions can help draw out stories that might otherwise be lost.\n\n`;

        const prompts: Record<string, string[]> = {
          childhood: [
            "What's your earliest memory?",
            "What was your childhood home like?",
            "What games did you play? What did you do for fun?",
            "What were your parents like?",
            "What got you in trouble as a kid?",
            "What did you dream of being when you grew up?",
            "What was school like for you?",
          ],
          'family-history': [
            "What do you know about where our family came from?",
            "What stories did your parents tell you about their parents?",
            "Are there any family secrets or mysteries?",
            "What family traditions have been passed down?",
            "Who were the characters in our family?",
            "What should future generations know about our family?",
          ],
          wisdom: [
            "What's the most important thing life taught you?",
            "What do you know now that you wish you'd known at 20?",
            "What's your biggest regret? Your proudest moment?",
            "What advice would you give to your younger self?",
            "What do you want people to remember about you?",
            "What matters most to you now?",
          ],
          relationships: [
            "How did you meet the love of your life?",
            "What made your marriage work? (Or not work?)",
            "What's the best parenting decision you made?",
            "Who has influenced you most in your life?",
            "What do you wish you'd said to someone who's gone?",
          ],
          'life-events': [
            "What were the major turning points in your life?",
            "What's the hardest thing you've overcome?",
            "What historical events do you remember living through?",
            "What changed you as a person?",
            "What's the closest you came to a different life?",
          ],
          general: [
            "Tell me a story I've never heard before.",
            "What's something most people don't know about you?",
            "What are you most proud of?",
            "If you could relive one day, which would it be?",
            "What do you want me to remember?",
          ],
        };

        prompts[focus].forEach((q, i) => {
          response += `${i + 1}. ${q}\n`;
        });

        response += `\n**Tips:**\n`;
        response += `- Record the conversation if they're comfortable\n`;
        response += `- Let silences happen - they often lead to deeper answers\n`;
        response += `- Follow up with "Tell me more about that"\n`;
        response += `- Ask about feelings, not just facts\n\n`;
        response += `These stories are treasures. They won't be available forever.`;

        return response;
      },
    });
  },
};

const recordOralHistoryDef: ToolDefinition = {
  id: 'recordOralHistory',
  name: 'Record Oral History',
  description: 'Guide for recording and preserving oral history',
  domain: 'stories',
  tags: ['stories', 'oral-history', 'preservation'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: 'Guide the user in recording and preserving oral history.',
      parameters: z.object({
        subject: z.string().describe('Whose history to record'),
        purpose: z.enum(['family-archive', 'memoir-help', 'legacy-project', 'history-project']).describe('Purpose of the recording'),
      }),
      execute: async ({ subject, purpose }) => {
        getLogger().info({ agentId: ctx.agentId, subject, purpose }, 'Recording oral history');

        let response = `**Recording Oral History: ${subject}**\n\n`;
        response += `Purpose: ${purpose.replace('-', ' ')}\n\n`;

        response += `**Before the Recording:**\n`;
        response += `- Have a conversation first (not recorded) to build comfort\n`;
        response += `- Share some questions in advance so they can think\n`;
        response += `- Choose a quiet, comfortable place\n`;
        response += `- Test your recording equipment\n`;
        response += `- Have water available\n\n`;

        response += `**During the Recording:**\n`;
        response += `- Start with easy questions to warm up\n`;
        response += `- Ask open-ended questions ("Tell me about..." not "Did you...")\n`;
        response += `- Don't interrupt - let them finish thoughts\n`;
        response += `- Embrace tangents - they often lead to gold\n`;
        response += `- Ask "What was that like for you?" to get feelings, not just facts\n`;
        response += `- Take breaks if needed\n\n`;

        response += `**Key questions to include:**\n`;
        response += `- Where and when were you born? Describe your earliest memories.\n`;
        response += `- What were your parents like? What did they teach you?\n`;
        response += `- What major historical events did you live through? How did they affect you?\n`;
        response += `- What are you most proud of in your life?\n`;
        response += `- What do you want future generations to know?\n\n`;

        response += `**After:**\n`;
        response += `- Store recordings in multiple places\n`;
        response += `- Consider transcribing key portions\n`;
        response += `- Share with family (with permission)\n\n`;
        response += `These recordings become priceless once the person is gone.`;

        return response;
      },
    });
  },
};

// ============================================================================
// DOMAIN TOOLS COLLECTION
// ============================================================================

const storiesTools: ToolDefinition[] = [
  captureLifeStoryDef,
  exploreLifeChapterDef,
  defineLegacyDef,
  writeEthicalWillDef,
  findNarrativeThreadDef,
  rewriteStoryDef,
  // Preservation
  createTimeCapsuleDef,
  familyStoryPromptsDef,
  recordOralHistoryDef,
];

// ============================================================================
// EXPORTS
// ============================================================================

export const { getToolDefinitions, domain, definitions } = createDomainExport(
  'stories',
  storiesTools
);

export default getToolDefinitions;

